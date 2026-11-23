// Smoke tests: the page loads on the real Worker, its main controls work,
// two examples go from the form to their result, and a person answers a
// request on the staff board. Endpoints that need the broker or Pointsman are
// stubbed here (playwright.config.ts says why); GET /api/config and the
// page's files come from the Worker itself. The stubs are made with the
// Worker's own functions from the real PLATEAU buildings in data/, so they
// have the shapes the Worker sends. Other hosts (map tiles, MapLibre, fonts)
// are blocked: the examples and the board work without the map.

import { readFileSync } from 'node:fs';
import { test as base, expect, type Page } from '@playwright/test';
import { PLATEAU_SOURCE, toEntity, toFeature, type Entity, type PlateauFeature } from '../src/buildings';
import { parseAnswers, parseConcern, toRequestEntity } from '../src/requests';
import { sortBoard, toBoardRow } from '../src/board';

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

const P = (value: unknown) => ({ type: 'Property', value });

/** A result attribute on the request entity (check or concern), as the bridge writes it. */
function result(action: string, rule: string | undefined, decision: string, review?: 'pending') {
  return {
    type: 'Property',
    value: action,
    ...(rule !== undefined && { policyRule: P(rule) }),
    decision: { type: 'Relationship', object: decision },
    ...(review && { reviewStatus: P(review) }),
  };
}

/** A Decision entity as the broker returns it without a context: its answers under the full IRI. */
function decisionEntity(id: string, answers: { name: string; value: unknown; probability: number; probabilities?: Record<string, number> }[]) {
  return {
    id,
    type: 'https://datamodels.jp/ns/decision/Decision',
    'https://datamodels.jp/ns/decision/answers': { type: 'JsonProperty', json: answers },
    'https://datamodels.jp/ns/decision/facts': { type: 'JsonProperty', json: [{ name: 'ground', missing: false, values: { rank: 2 } }, { name: 'shaking', missing: false, values: { rank: 3 } }] },
  };
}

const uuid = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const decisionId = (n: number) => `urn:ngsi-ld:Decision:${uuid(n)}`;

/** What Pointsman decides for an example, in this test: the check, then the description. */
interface Outcome {
  check: { action: string; rule?: string };
  concern: { action: string; rule?: string; answers: Parameters<typeof decisionEntity>[1] };
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
    const entity = {
      ...request,
      check: result(outcome.check.action, outcome.check.rule, decisionId(2)),
      concern: result(outcome.concern.action, outcome.concern.rule, decisionId(3)),
    };
    return route.fulfill({
      json: { entity, decision: decisionEntity(decisionId(2), []), concernDecision: decisionEntity(decisionId(3), outcome.concern.answers), concerns: true, query: `/entities/${encodeURIComponent(entity.id)}` },
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
  return sortBoard([
    { ...unsure, createdAt: at, check: result('low', undefined, decisionId(6)), concern: result('person', '6', decisionId(7), 'pending') },
    { ...decided, createdAt: at, check: result('low', undefined, decisionId(8)), concern: result('now', '1', decisionId(9)) },
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
  await expect(page.locator('#status')).toContainText('4');
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

test('"The house leans": the description makes it high priority', async ({ page }) => {
  const sent = await stubServices(page, {
    check: { action: 'high', rule: '1' },
    concern: {
      action: 'high', rule: '2',
      answers: [
        { name: 'about_building', value: true, probability: 0.98 },
        { name: 'damage', value: 'tilt_or_sinking', probability: 0.8, probabilities: { tilt_or_sinking: 0.8, foundation_or_ground: 0.15, structural_cracks: 0.05 } },
        { name: 'danger_now', value: false, probability: 0.85 },
      ],
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

test('"Part of it came down": act today, and the page says to call 119', async ({ page }) => {
  const sent = await stubServices(page, {
    check: { action: 'low' },
    concern: {
      action: 'now', rule: '1',
      answers: [
        { name: 'about_building', value: true, probability: 0.97 },
        { name: 'damage', value: 'partial_collapse', probability: 0.7, probabilities: { partial_collapse: 0.7, falling_parts: 0.3 } },
        { name: 'danger_now', value: true, probability: 0.8 },
      ],
    },
  });
  await page.goto('/');
  await sendExample(page, 'Part of it came down');
  expect(sent[0]).toMatchObject({ building: PLATEAU_URN + BALCONY, concern: { afterDisaster: 'unsure' } });
  const flow = page.locator('#flow');
  await expect(flow.locator('.answer-title')).toHaveText('Now: act today');
  await expect(flow.locator('.answer-next')).toContainText('call 119');
});

test('the staff board: a person changes the result the AI was not sure about', async ({ page }) => {
  await stubServices(page);
  const rows = boardRequests();
  await page.route('**/api/board', (route) => route.fulfill({ json: { requests: rows, query: '/entities?type=BuildingCheckRequest' } }));
  const answers: unknown[] = [];
  await page.route(/\/api\/requests\/[^/]+\/resolve$/, (route) => {
    answers.push({ id: decodeURIComponent(route.request().url().split('/').at(-2)!), body: route.request().postDataJSON() });
    return route.fulfill({ status: 202, json: { resolved: 'concern', action: 'high', decision: decisionId(7) } });
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
