// Smoke tests: the page loads on the real Worker, its main controls work,
// two examples go from the form to their result, and a person answers a
// request on the staff board. Endpoints that need the broker or Pointsman are
// stubbed here (playwright.config.ts says why); GET /api/config and the
// page's files come from the Worker itself. The stubs are made with the
// Worker's own functions from the real PLATEAU buildings in data/, and with
// the bridge's own functions for what it writes (the results on a request and
// the Decision entities), so they have the shapes the Worker sends. Only
// Pointsman's decisions are written here. They are set by each test: the
// tests check what the page sends and shows, not how Pointsman decides.
// Other hosts (map tiles, MapLibre, fonts) are blocked: the examples and the
// board work without the map.

import { readFileSync } from 'node:fs';
import { test as base, expect, type Page } from '@playwright/test';
import { PLATEAU_SOURCE, toEntity, toFeature, type Entity, type PlateauFeature } from '../src/buildings';
import { parseAnswers, parseConcern, toRequestEntity } from '../src/requests';
import { sortBoard, toBoardRow } from '../src/board';
import { isChecked, toDecisionEntity, toProperty, type Route } from '../engine/packages/fiware/src/bridge';

const PLATEAU_URN = 'urn:ngsi-ld:Building:plateau:';
// The page's examples (site/app.js EXAMPLES), by PLATEAU building id.
const LEANS = '01100-bldg-596155';
const BALCONY = '01100-bldg-595855';
const CRACKS = '01100-bldg-597856';
const VAGUE = '01100-bldg-595870';

/** The example buildings as Building entities, as data/plateau is loaded into the broker. */
const plateau = JSON.parse(readFileSync(new URL('../data/plateau/satozuka.geojson', import.meta.url), 'utf8')) as { features: PlateauFeature[] };
const buildings = new Map<string, Entity>(plateau.features
  .filter((f) => [LEANS, BALCONY, CRACKS, VAGUE].includes(f.properties.buildingID))
  .map((f) => { const e = toEntity(f); return [e.id, e]; }));

const uuid = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const NOW = new Date().toISOString();

/** A decision as Pointsman returns it to the bridge. */
type Decision = Parameters<typeof toProperty>[0];
type Answers = Decision['answers'];

// The demo's two routes (src/index.ts ROUTE and CONCERN_ROUTE), as far as the bridge's writing needs them.
const CHECK_ROUTE: Route = { type: 'BuildingCheckRequest', profile: 'building-check-priority', inputs: [], attribute: 'check' };
const CONCERN_ROUTE: Route = { type: 'BuildingCheckRequest', profile: 'building-concern', inputs: [], attribute: 'concern' };
// The hazard layers the check reads (J-SHIS).
const CHECK_FACTS: NonNullable<Decision['facts']> = {
  ground: { missing: false, values: { rank: 2 }, source: 'j-shis' },
  shaking: { missing: false, values: { rank: 3 }, source: 'j-shis' },
};

/** Pointsman's decision for one route. `rule`: the index of the rule that matched, null for the default action. */
function decision(n: number, route: Route, action: string, rule: number | null, answers: Answers = {}, review?: Decision['review']): Decision {
  return {
    decision_id: uuid(n), action, profile: route.profile, profile_version: 1, model: 'test-model', answers, created_at: NOW, rule,
    ...(route === CHECK_ROUTE && { facts: CHECK_FACTS }),
    ...(review && { review }),
  };
}

/**
 * What the bridge writes for a decision: the result attribute on the request
 * entity, and the Decision entity as the Worker reads it back from the broker
 * (without a context, so the Decision model's terms answers and facts come
 * back as full IRIs; the page finds them by that ending).
 */
function written(d: Decision, route: Route, requestId: string) {
  const entity = toDecisionEntity(d, requestId, route, new Date(NOW));
  const stored: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(entity)) {
    if (k !== '@context') stored[k === 'answers' || k === 'facts' ? `https://datamodels.jp/ns/decision/${k}` : k] = v;
  }
  return { attribute: toProperty(d, 'test-input-hash', new Date(NOW), String(entity.id), isChecked(d, route)), entity: stored };
}

/** What Pointsman decides for an example, in this test: the check, then the description. */
interface Outcome {
  check: { action: string; rule: number | null };
  concern: { action: string; rule: number | null; answers: Answers };
}

/** Uncaught errors, console errors, and failed loads or error answers from the page's own origin. */
function collectErrors(page: Page): string[] {
  const origin = new URL(test.info().project.use.baseURL!).origin;
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
  page.on('console', (m) => {
    if (m.type() !== 'error') return;
    // Failed loads are caught below by origin; the blocked hosts' ones do not count.
    if (/Failed to load resource|net::ERR_/.test(m.text())) return;
    errors.push(`console: ${m.text()}`);
  });
  page.on('response', (r) => {
    if (new URL(r.url()).origin === origin && r.status() >= 400) errors.push(`${r.status()} ${r.request().method()} ${r.url()}`);
  });
  page.on('requestfailed', (r) => {
    if (new URL(r.url()).origin === origin) errors.push(`failed: ${r.method()} ${r.url()} ${r.failure()?.errorText ?? ''}`);
  });
  return errors;
}

/** Every test fails on the errors above, whatever it does on the page. */
const test = base.extend<{ pageErrors: string[] }>({
  pageErrors: [async ({ page }, use) => {
    const errors = collectErrors(page);
    await use(errors);
    expect(errors, 'errors on the page').toEqual([]);
  }, { auto: true }],
});

/**
 * Stubs the endpoints behind which the broker or Pointsman sit, and blocks
 * other hosts. A request the page sends becomes the entity the Worker would
 * create from it; `outcome` is what Pointsman then writes on it. Returns the
 * bodies the page sent.
 */
async function stubServices(page: Page, outcome?: Outcome) {
  const origin = new URL(test.info().project.use.baseURL!).origin;
  const sent: { building: string; answers: unknown; concern?: unknown; lang: string }[] = [];
  let request: Entity | null = null;
  await page.route((url) => url.origin !== origin, (route) => route.abort());
  await page.route('**/api/buildings', (route) => route.fulfill({
    json: { type: 'FeatureCollection', features: [...buildings.values()].map(toFeature), query: '/entities?type=Building', complete: true, skipped: 0, source: PLATEAU_SOURCE },
  }));
  await page.route(/\/api\/buildings\/[^/]+$/, (route) => {
    const id = decodeURIComponent(new URL(route.request().url()).pathname.split('/').pop()!);
    const entity = buildings.get(id);
    return entity
      ? route.fulfill({ json: { entity, query: `/entities/${encodeURIComponent(id)}`, feature: toFeature(entity) } })
      : route.fulfill({ status: 404, json: { error: 'not found' } });
  });
  await page.route('**/api/requests', (route) => {
    const body = route.request().postDataJSON() as (typeof sent)[number];
    sent.push(body);
    request = toRequestEntity(buildings.get(body.building)!, parseAnswers(body.answers), uuid(1), body.lang === 'ja' ? 'ja' : 'en', parseConcern(body.concern));
    return route.fulfill({ status: 201, json: { id: request.id } });
  });
  await page.route(/\/api\/requests\/[^/]+$/, (route) => {
    if (!request || !outcome) return route.fulfill({ status: 404, json: { error: 'not found' } });
    const check = written(decision(2, CHECK_ROUTE, outcome.check.action, outcome.check.rule), CHECK_ROUTE, request.id);
    const concern = written(decision(3, CONCERN_ROUTE, outcome.concern.action, outcome.concern.rule, outcome.concern.answers), CONCERN_ROUTE, request.id);
    const entity = { ...request, check: check.attribute, concern: concern.attribute };
    return route.fulfill({
      json: { entity, decision: check.entity, concernDecision: concern.entity, concerns: true, query: `/entities/${encodeURIComponent(entity.id)}` },
    });
  });
  await page.route('**/api/graph*', (route) => route.fulfill({
    contentType: 'image/svg+xml',
    body: '<svg xmlns="http://www.w3.org/2000/svg" width="10" height="10"><title>chain</title></svg>',
  }));
  return sent;
}

/** Two requests on the board: one decided, one where the AI was not sure and a person decides. */
function boardRequests() {
  const unsure = toRequestEntity(buildings.get(PLATEAU_URN + VAGUE)!, {}, uuid(4), 'en', { description: 'Something is wrong with my house.', afterDisaster: 'unsure' });
  const decided = toRequestEntity(buildings.get(PLATEAU_URN + BALCONY)!, {}, uuid(5), 'en', { description: 'Part of the balcony came down.', afterDisaster: 'unsure' });
  const at = new Date(Date.now() - 10 * 60000).toISOString();
  const result = (n: number, route: Route, action: string, rule: number | null, id: string, review?: Decision['review']) =>
    written(decision(n, route, action, rule, {}, review), route, id).attribute;
  return sortBoard([
    { ...unsure, createdAt: at, check: result(6, CHECK_ROUTE, 'low', null, unsure.id), concern: result(7, CONCERN_ROUTE, 'person', 6, unsure.id, { status: 'pending' }) },
    { ...decided, createdAt: at, check: result(8, CHECK_ROUTE, 'low', null, decided.id), concern: result(9, CONCERN_ROUTE, 'now', 1, decided.id) },
  ].map(toBoardRow).filter((r) => r !== null));
}

/** Picks an example, checks the filled-in form, and sends it. */
async function sendExample(page: Page, label: string) {
  await page.getByRole('button', { name: new RegExp(label) }).click();
  const flow = page.locator('#flow');
  await expect(flow.getByRole('heading', { name: 'What the city model does not know' })).toBeVisible();
  await flow.getByRole('button', { name: 'Next' }).click();
  await expect(flow.getByRole('heading', { name: 'Check and send' })).toBeVisible();
  await flow.getByRole('button', { name: 'Send' }).click();
}

test('the page loads with the example buildings', async ({ page }) => {
  await stubServices(page);
  await page.goto('/');
  await expect(page).toHaveTitle(/Pointsman/);
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Every building, the same checks');
  // The examples show only with checks and descriptions open (the real /api/config) and their buildings loaded.
  await expect(page.locator('#cards .ex-card')).toHaveCount(4);
  const unknownYear = [...buildings.values()].filter((e) => toFeature(e)!.properties.yearOfConstruction === null).length;
  await expect(page.locator('#status')).toContainText(`4 buildings. ${unknownYear} of them without a year built.`);
});

test('the language switch shows the page in Japanese', async ({ page }) => {
  await stubServices(page);
  await page.goto('/');
  await expect(page.locator('#cards .ex-card')).toHaveCount(4);
  await page.locator('#lang').click();
  await expect(page.locator('html')).toHaveAttribute('lang', 'ja');
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('すべての建物を、同じ基準で');
  await expect(page.locator('#cards .ex-card').first()).toContainText('家が傾いた');
});

test('"How it works" opens as a dialog and closes', async ({ page }) => {
  await stubServices(page);
  await page.goto('/');
  const dialog = page.getByRole('dialog', { name: 'How it works' });
  await page.locator('#how-toggle').click();
  await expect(dialog).toBeVisible();
  await dialog.getByRole('button', { name: 'Close' }).click();
  await expect(dialog).toBeHidden();
  await page.locator('#how-toggle').click();
  await expect(dialog).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(dialog).toBeHidden();
});

test('"The house leans": the page sends the filled-in form and shows a high result with its reasons', async ({ page }) => {
  const sent = await stubServices(page, {
    check: { action: 'high', rule: 1 },
    concern: {
      action: 'high', rule: 2,
      answers: {
        about_building: { value: true, p: 0.98 },
        damage: { value: 'tilt_or_sinking', p: 0.8, probabilities: { tilt_or_sinking: 0.8, foundation_or_ground: 0.15, structural_cracks: 0.05 } },
        danger_now: { value: false, p: 0.85 },
        severity: { value: 3, p: 0.6, probabilities: { 2: 0.3, 3: 0.6, 4: 0.1 } },
      },
    },
  });
  await page.goto('/');
  await sendExample(page, 'The house leans');
  // What the page sent: the building, the answers the city model lacks, and the description.
  expect(sent).toHaveLength(1);
  expect(sent[0]).toMatchObject({
    building: PLATEAU_URN + LEANS,
    answers: { yearOfConstruction: 1976, wood: true, storeysAboveGround: 2 },
    concern: { description: expect.stringContaining('leans a little towards the street'), afterDisaster: 'yes' },
    lang: 'en',
  });
  const flow = page.locator('#flow');
  await expect(flow.getByRole('heading', { name: 'How urgent is your concern?' })).toBeVisible();
  await expect(flow.locator('.answer-title')).toHaveText('High: check soon');
  await expect(flow.locator('.path-rule')).toContainText('The words point to serious damage');
  await expect(flow.locator('.q-rows')).toContainText('leaning or sinking');
  await flow.getByRole('button', { name: 'Check another building' }).click();
  await expect(page.locator('#flow')).toBeHidden();
});

test('"Part of it came down": the page shows an act-today result and says to call 119', async ({ page }) => {
  const sent = await stubServices(page, {
    check: { action: 'low', rule: null },
    concern: {
      action: 'now', rule: 1,
      answers: {
        about_building: { value: true, p: 0.97 },
        damage: { value: 'partial_collapse', p: 0.7, probabilities: { partial_collapse: 0.7, falling_parts: 0.3 } },
        danger_now: { value: true, p: 0.8 },
      },
    },
  });
  await page.goto('/');
  await sendExample(page, 'Part of it came down');
  expect(sent[0]).toMatchObject({ building: PLATEAU_URN + BALCONY, concern: { afterDisaster: 'unsure' } });
  const flow = page.locator('#flow');
  await expect(flow.locator('.answer-title')).toHaveText('Now: act today');
  await expect(flow.locator('.answer-next')).toContainText('call 119');
});

test('the staff board lists the most serious first and sends a person\'s change', async ({ page }) => {
  await stubServices(page);
  const rows = boardRequests();
  await page.route('**/api/board', (route) => route.fulfill({ json: { requests: rows, query: '/entities?type=BuildingCheckRequest' } }));
  const answers: unknown[] = [];
  await page.route(/\/api\/requests\/[^/]+\/resolve$/, (route) => {
    answers.push({ id: decodeURIComponent(route.request().url().split('/').at(-2)!), body: route.request().postDataJSON() });
    return route.fulfill({ status: 202, json: { resolved: 'concern', action: 'high', decision: `urn:ngsi-ld:Decision:${uuid(7)}` } });
  });
  await page.goto('/');
  await page.locator('#board-toggle').click();
  const board = page.locator('#board');
  await expect(board).toBeVisible();
  await expect(board.locator('#board-status')).toHaveText('2 requests, 1 waiting for a person.');
  // Most serious first: "now", then the one a person decides.
  const heads = board.locator('.req-head');
  await expect(heads).toHaveCount(2);
  await expect(heads.nth(0)).toContainText('Now');
  await expect(heads.nth(1)).toContainText('Waits for a person');
  await heads.nth(1).click();
  await expect(board).toContainText('Pointsman asks a person: confirm this result, or change it.');
  await board.locator('select[data-role="choose"]').selectOption('high');
  await board.getByRole('button', { name: 'Change' }).click();
  await expect(board).toContainText('Sent as a demo visitor.');
  expect(answers).toEqual([{ id: rows[1]!.id, body: { action: 'high' } }]);
  await page.locator('#board-close').click();
  await expect(board).toBeHidden();
});

// The tests' safety rests on the --var settings in playwright.config.ts
// winning over a local .dev.vars: then the Worker's broker is a closed port.
test('the Worker cannot reach a real broker: an unstubbed call fails at once', async ({ request }) => {
  const res = await request.get('/api/board');
  expect(res.status()).toBe(502);
  expect(await res.json()).toEqual({ error: 'something went wrong' });
});
