// Smoke tests: the page loads on the real Worker, its main controls work,
// the four examples go from the form to their result (with an example photo,
// and without a description), the waits that are slow, fail, or never get the
// description's result end as the page says, and a person confirms, changes or
// comes too late to answer a request on the staff board. The map is not
// tested: its tiles and MapLibre are blocked (below). Endpoints that need the broker or Pointsman are
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
import { checkAnswer, sortBoard, toBoardRow } from '../src/board';
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
  /**
   * `person`: a person checks this result (pending until someone answers on the board).
   * Left out: no concern result comes (a request without a description, or one whose description is not read).
   */
  concern?: { action: string; rule: number | null; answers: Answers; person?: true };
  /** The page's polls first get `errors` failed answers (503), then `pending` answers without a result, then the results. */
  wait?: { errors?: number; pending?: number };
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
async function stubServices(page: Page, outcome?: Outcome, alsoOnBoard: Entity[] = []) {
  const origin = new URL(test.info().project.use.baseURL!).origin;
  const sent: { building: string; answers: unknown; concern?: { description?: string; afterDisaster?: string; photos?: string[] }; lang: string }[] = [];
  const answered: unknown[] = [];
  const polls = { count: 0 };
  let request: Entity | null = null;
  // A person's answer on the board, once given (as the bridge then writes it).
  let answer: string | null = null;
  /** The request as stored after Pointsman's decisions (and a person's answer), with its Decision entities. */
  const stored = () => {
    if (!request || !outcome) return null;
    const check = written(decision(2, CHECK_ROUTE, outcome.check.action, outcome.check.rule), CHECK_ROUTE, request.id);
    if (!outcome.concern) return { entity: { ...request, check: check.attribute }, check, concern: null };
    const review: Decision['review'] = outcome.concern.person && (answer ? { status: 'resolved', final_action: answer, resolved_at: NOW } : { status: 'pending' });
    const concern = written(decision(3, CONCERN_ROUTE, outcome.concern.action, outcome.concern.rule, outcome.concern.answers, review), CONCERN_ROUTE, request.id);
    return { entity: { ...request, check: check.attribute, concern: concern.attribute }, check, concern };
  };
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
    const now = stored();
    if (!now) return route.fulfill({ status: 404, json: { error: 'not found' } });
    polls.count += 1;
    const errors = outcome!.wait?.errors ?? 0;
    if (polls.count <= errors) return route.fulfill({ status: 503, json: { error: 'the data platform did not answer' } });
    const query = `/entities/${encodeURIComponent(now.entity.id)}`;
    if (polls.count <= errors + (outcome!.wait?.pending ?? 0)) {
      return route.fulfill({ json: { entity: request, decision: null, concernDecision: null, concerns: true, query } });
    }
    return route.fulfill({
      json: { entity: now.entity, decision: now.check.entity, concernDecision: now.concern?.entity ?? null, concerns: true, query },
    });
  });
  // The staff board: the request sent here (if any) and the others, as /api/board lists them (with sysAttrs).
  const boardRows = () => {
    const mine = stored();
    const entities = [...(mine ? [{ ...mine.entity, createdAt: NOW }] : []), ...alsoOnBoard];
    return sortBoard(entities.map(toBoardRow).filter((r) => r !== null));
  };
  await page.route('**/api/board', (route) => route.fulfill({ json: { requests: boardRows(), query: '/entities?type=BuildingCheckRequest&options=sysAttrs' } }));
  // A person's answer, checked as resolveRequest does (checkAnswer), on the request sent here.
  await page.route(/\/api\/requests\/[^/]+\/resolve$/, (route) => {
    const id = decodeURIComponent(new URL(route.request().url()).pathname.split('/').at(-2)!);
    const body = route.request().postDataJSON() as { action: string };
    answered.push({ id, ...body });
    const row = boardRows().find((r) => r.id === id);
    if (!row || id !== stored()?.entity.id) return route.fulfill({ status: 404, json: { error: 'not found' } });
    const checked = checkAnswer(row, body);
    if (typeof checked === 'string') return route.fulfill({ status: row.waiting ? 400 : 409, json: { error: checked } });
    answer = checked.action;
    return route.fulfill({ status: 202, json: { resolved: checked.attribute, action: checked.action, decision: checked.decision } });
  });
  await page.route('**/api/graph*', (route) => route.fulfill({
    contentType: 'image/svg+xml',
    body: '<svg xmlns="http://www.w3.org/2000/svg" width="10" height="10"><title>chain</title></svg>',
  }));
  return Object.assign(sent, { answered, polls });
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

/** Another visitor's request on the board, sent ten minutes earlier, with its results as the bridge writes them. */
function otherRequest(n: number, plateauId: string, description: string, concern: { action: string; rule: number | null }, review?: Decision['review']): Entity {
  const e = toRequestEntity(buildings.get(PLATEAU_URN + plateauId)!, {}, uuid(n), 'en', { description, afterDisaster: 'unsure' });
  return {
    ...e,
    createdAt: new Date(Date.now() - 10 * 60000).toISOString(),
    check: written(decision(n + 1, CHECK_ROUTE, 'low', null), CHECK_ROUTE, e.id).attribute,
    concern: written(decision(n + 2, CONCERN_ROUTE, concern.action, concern.rule, {}, review), CONCERN_ROUTE, e.id).attribute,
  };
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
  // The click returns before the stub has recorded the request: wait for it.
  await expect.poll(() => sent.length).toBe(1);
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

test('"Part of it came down": the page shows an act-today result, says to call 119, and the request heads the staff board', async ({ page }) => {
  const waiting = otherRequest(10, VAGUE, 'Something is wrong with my house.', { action: 'person', rule: 6 }, { status: 'pending' });
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
  }, [waiting]);
  await page.goto('/');
  await sendExample(page, 'Part of it came down');
  await expect.poll(() => sent.length).toBe(1);
  expect(sent[0]).toMatchObject({ building: PLATEAU_URN + BALCONY, concern: { afterDisaster: 'unsure' } });
  const flow = page.locator('#flow');
  await expect(flow.locator('.answer-title')).toHaveText('Now: act today');
  await expect(flow.locator('.answer-next')).toContainText('call 119');

  // The staff board: this request first, above an older one that waits for a person; nothing to answer on it.
  await page.locator('#board-toggle').click();
  const board = page.locator('#board');
  await expect(board.locator('#board-status')).toHaveText('2 requests, 1 waiting for a person.');
  const heads = board.locator('.req-head');
  await expect(heads.nth(0)).toContainText('Now');
  await expect(heads.nth(0)).not.toContainText('Waits for a person');
  await expect(heads.nth(1)).toContainText('Waits for a person');
  await heads.nth(0).click();
  await expect(board.locator('.req-words')).toContainText('Part of the balcony on the second floor came down');
  await expect(board.locator('select[data-role="choose"]')).toHaveCount(0);
});

test('"A vague worry": the result goes to a person, who changes it on the staff board', async ({ page }) => {
  const sent = await stubServices(page, {
    check: { action: 'low', rule: null },
    concern: {
      action: 'person', rule: 6, person: true,
      answers: {
        about_building: { value: true, p: 0.7 },
        damage: { value: 'nothing_clear', p: 0.45, probabilities: { nothing_clear: 0.45, structural_cracks: 0.3, cosmetic: 0.25 } },
        danger_now: { value: false, p: 0.6 },
      },
    },
  });
  // The page's clock, so that the board's reload after an answer (6 s) can be told
  // apart from its own refresh (every 10 s while it is open).
  await page.clock.install();
  let boardLoads = 0;
  page.on('request', (r) => { if (r.url().endsWith('/api/board')) boardLoads += 1; });
  await page.goto('/');
  await sendExample(page, 'A vague worry');
  await expect.poll(() => sent.length).toBe(1);
  expect(sent[0]).toMatchObject({ building: PLATEAU_URN + VAGUE, concern: { description: 'Something is wrong with my house.', afterDisaster: 'unsure' } });
  const flow = page.locator('#flow');
  await expect(flow.locator('.answer-title')).toHaveText('A person reads it first');
  await expect(flow.locator('.answer-next')).toContainText('The AI was not sure.');

  // The staff board: the request waits for a person, who changes the result to high.
  // From here, before the board opens and starts its refresh, the page's time
  // moves only when the test moves it: however long anything takes in real time.
  await page.clock.pauseAt(await page.evaluate(() => Date.now() + 100));
  await page.locator('#board-toggle').click();
  const board = page.locator('#board');
  await expect(board.locator('#board-status')).toHaveText('1 request, 1 waiting for a person.');
  const head = board.locator('.req-head');
  await expect(head).toContainText('A person decides');
  await expect(head).toContainText('Waits for a person');
  await head.click();
  await expect(board.locator('.req-words')).toHaveText('Something is wrong with my house.');
  await board.locator('select[data-role="choose"]').selectOption('high');
  await board.getByRole('button', { name: 'Change' }).click();
  await expect(board).toContainText('Sent as a demo visitor.');
  expect(sent.answered).toEqual([{ id: `urn:ngsi-ld:BuildingCheckRequest:demo-${uuid(1)}`, action: 'high' }]);
  // 6 s after the answer the board loads the list again; its own 10 s refresh is
  // not due yet, so this load can only be the reload after the answer.
  const before = boardLoads;
  await page.clock.runFor(6000);
  await expect.poll(() => boardLoads).toBe(before + 1);
  // Then the request shows the person's decision, now high.
  await expect(head).toContainText('A person decided');
  await expect(head).toContainText('High');
  await expect(board).toContainText('→ High: check soon (A person decided)');
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

/** Picks an example and goes to step 2 (the form), without sending. */
async function openExample(page: Page, label: string) {
  await page.getByRole('button', { name: new RegExp(label) }).click();
  await expect(page.locator('#flow').getByRole('heading', { name: 'What the city model does not know' })).toBeVisible();
}

/**
 * Moves the page's clock one poll at a time until the stub has had `count`
 * polls: each poll sets its next timer only once its answer is in, so one
 * long runFor() would pass the timers that come later.
 */
async function pollUntil(page: Page, polls: { count: number }, count: number) {
  for (let step = 0; polls.count < count; step++) {
    expect(step, 'steps of 1 s').toBeLessThan(1_000);
    await page.clock.runFor(1_000);
    await page.waitForTimeout(20);
  }
}

/**
 * Moves the page's clock in 2 s steps, with a moment after each for a poll's
 * answer to arrive, until `done` holds. Returns how far the page's clock went
 * from `from` (its Date.now() at the start of the wait).
 */
async function runUntil(page: Page, from: number, done: () => Promise<boolean>) {
  for (let step = 0; !(await done()); step++) {
    expect(step, 'steps of 2 s').toBeLessThan(1_000);
    await page.clock.runFor(2_000);
    await page.waitForTimeout(20);
  }
  return await page.evaluate(() => Date.now()) - from;
}

/** Asserts that a wait the page ends after `limit` ms ended then, not much earlier or later (steps of 2 s, polls every 10 s). */
function endedAfter(elapsed: number, limit: number) {
  expect(elapsed).toBeGreaterThanOrEqual(limit - 3_000);
  expect(elapsed).toBeLessThanOrEqual(limit + 14_000);
}

test('"Old, thin cracks": the page sends the description as not after a disaster, and shows a low result', async ({ page }) => {
  const sent = await stubServices(page, {
    check: { action: 'low', rule: null },
    concern: { action: 'low', rule: null, answers: { about_building: { value: true, p: 0.95 }, damage: { value: 'cosmetic', p: 0.8 }, danger_now: { value: false, p: 0.9 } } },
  });
  await page.goto('/');
  await sendExample(page, 'Old, thin cracks');
  await expect.poll(() => sent.length).toBe(1);
  expect(sent[0]).toMatchObject({ building: PLATEAU_URN + CRACKS, concern: { afterDisaster: 'no' } });
  await expect(page.locator('#flow .answer-title')).toContainText('Low');
});

test('without a description: the page sends only the building\'s answers, and shows the check from its data', async ({ page }) => {
  const sent = await stubServices(page, { check: { action: 'medium', rule: 2 } });
  await page.goto('/');
  await openExample(page, 'The house leans');
  await page.locator('#q-worry').fill('');
  const flow = page.locator('#flow');
  await flow.getByRole('button', { name: 'Next' }).click();
  await flow.getByRole('button', { name: 'Send' }).click();
  await expect.poll(() => sent.length).toBe(1);
  expect(sent[0]).toMatchObject({ building: PLATEAU_URN + LEANS, answers: { yearOfConstruction: 1976 } });
  expect(sent[0]!.concern).toBeUndefined();
  await expect(flow.getByRole('heading', { name: 'How urgently should someone look at it?' })).toBeVisible();
  await expect(flow.locator('.answer-title')).toHaveText('Medium');
  await expect(flow).not.toContainText('could not be read this time');
});

test('a description that is not read in time: after 2 minutes the page shows the check, and says so', async ({ page }) => {
  await page.clock.install();
  // The check comes; the concern never does.
  await stubServices(page, { check: { action: 'low', rule: null } });
  await page.goto('/');
  await sendExample(page, 'A vague worry');
  const flow = page.locator('#flow');
  await expect(flow).toContainText('Pointsman is sorting the request…');
  const from = await page.evaluate(() => Date.now());
  // After 2 minutes without the concern, the page shows the check: not before.
  const note = flow.locator('.note').first();
  endedAfter(await runUntil(page, from, () => note.isVisible()), 2 * 60_000);
  await expect(note).toHaveText('Your description could not be read this time, so this is the check from the building’s data only.');
  await expect(flow.locator('.answer-title')).toHaveText('Low');
});

test('a slow result: the page says it takes longer, gives up after 15 minutes, and looks again on request', async ({ page }) => {
  await page.clock.install();
  const outcome = { check: { action: 'low', rule: null }, concern: { action: 'medium', rule: 5, answers: {} }, wait: { pending: Infinity } };
  const sent = await stubServices(page, outcome);
  await page.goto('/');
  await sendExample(page, 'Old, thin cracks');
  const flow = page.locator('#flow');
  await expect(flow).toContainText('Pointsman is sorting the request…');
  const from = await page.evaluate(() => Date.now());
  // After 30 s the page says it takes longer; after 15 minutes it gives up: not before.
  endedAfter(await runUntil(page, from, async () => (await flow.textContent())!.includes('This takes longer than usual.')), 30_000);
  endedAfter(await runUntil(page, from, () => flow.getByRole('button', { name: 'Look again' }).isVisible()), 15 * 60_000);
  await expect(flow.locator('.note')).toHaveText('No result yet. The demo tries again every hour; you can also look again later.');
  const stopped = sent.polls.count;
  await page.clock.runFor(60_000);
  await page.waitForTimeout(500);
  expect(sent.polls.count).toBe(stopped);
  // The results are in by now.
  outcome.wait.pending = 0;
  await flow.getByRole('button', { name: 'Look again' }).click();
  await expect(flow.locator('.answer-title')).toHaveText('Medium');
});

test('failed polls: the page keeps asking, and shows the result once the Worker answers', async ({ page, pageErrors }) => {
  await page.clock.install();
  const sent = await stubServices(page, { check: { action: 'low', rule: null }, concern: { action: 'medium', rule: 5, answers: {} }, wait: { errors: 3 } });
  await page.goto('/');
  await sendExample(page, 'Old, thin cracks');
  await pollUntil(page, sent.polls, 4);
  await expect(page.locator('#flow .answer-title')).toHaveText('Medium');
  // The three 503 answers are this test's own, and the only ones: not page errors.
  const own = (e: string) => /^503 GET .*\/api\/requests\//.test(e);
  expect(pageErrors.filter(own)).toHaveLength(3);
  pageErrors.splice(0, pageErrors.length, ...pageErrors.filter((e) => !own(e)));
});

test('photos: an example photo goes with the description; without words the page asks for them first', async ({ page }) => {
  const sent = await stubServices(page, { check: { action: 'low', rule: null }, concern: { action: 'high', rule: 2, answers: {} } });
  await page.goto('/');
  await openExample(page, 'The house leans');
  const flow = page.locator('#flow');
  await expect(flow.locator('#q-photos-examples')).toBeVisible();
  await flow.locator('.photo-example').first().click();
  await expect(flow.locator('.photos figure')).toHaveCount(1);
  // Photos go only with a description.
  const words = await page.locator('#q-worry').inputValue();
  await page.locator('#q-worry').fill('');
  await flow.getByRole('button', { name: 'Next' }).click();
  await expect(flow.getByRole('alert')).toHaveText('Photos are sent only with a description: say in a few words what they show.');
  await page.locator('#q-worry').fill(words);
  await flow.getByRole('button', { name: 'Next' }).click();
  await flow.getByRole('button', { name: 'Send' }).click();
  await expect.poll(() => sent.length).toBe(1);
  expect(sent[0]!.concern!.photos).toHaveLength(1);
  expect(sent[0]!.concern!.photos![0]).toMatch(/^data:image\/jpeg;base64,/);
  await expect(flow.locator('.answer-title')).toHaveText('High: check soon');
});

test('the staff board: a check that waits for a person, confirmed as it is', async ({ page }) => {
  await stubServices(page);
  const e = toRequestEntity(buildings.get(PLATEAU_URN + LEANS)!, {}, uuid(20), 'en');
  const waiting = { ...e, createdAt: new Date(Date.now() - 10 * 60000).toISOString(), check: written(decision(21, CHECK_ROUTE, 'medium', 3, {}, { status: 'pending' }), CHECK_ROUTE, e.id).attribute };
  const rows = sortBoard([toBoardRow(waiting)].filter((r) => r !== null));
  await page.route('**/api/board', (route) => route.fulfill({ json: { requests: rows, query: '/entities?type=BuildingCheckRequest' } }));
  const answers: unknown[] = [];
  await page.route(/\/api\/requests\/[^/]+\/resolve$/, (route) => {
    answers.push({ id: decodeURIComponent(route.request().url().split('/').at(-2)!), body: route.request().postDataJSON() });
    return route.fulfill({ status: 202, json: { resolved: 'check', action: 'medium', decision: `urn:ngsi-ld:Decision:${uuid(21)}` } });
  });
  await page.goto('/');
  await page.locator('#board-toggle').click();
  const board = page.locator('#board');
  await expect(board.locator('#board-status')).toHaveText('1 request, 1 waiting for a person.');
  await board.locator('.req-head').click();
  await expect(board).toContainText('Pointsman asks a person: confirm this result, or change it.');
  // The check's own answers: high, medium and low; medium is the one to confirm.
  await expect(board.locator('select[data-role="choose"] option:not([disabled])')).toHaveText(['High: this building should be looked at first', 'Low']);
  await board.getByRole('button', { name: 'Confirm: Medium' }).click();
  await expect(board).toContainText('Sent as a demo visitor.');
  expect(answers).toEqual([{ id: e.id, body: { action: 'medium' } }]);
});

test('the staff board: an answer someone else gave first is not sent twice, and the page says so', async ({ page, pageErrors }) => {
  await stubServices(page);
  const rows = boardRequests();
  await page.route('**/api/board', (route) => route.fulfill({ json: { requests: rows, query: '/entities?type=BuildingCheckRequest' } }));
  await page.route(/\/api\/requests\/[^/]+\/resolve$/, (route) => route.fulfill({ status: 409, json: { error: 'already answered' } }));
  await page.goto('/');
  await page.locator('#board-toggle').click();
  const board = page.locator('#board');
  const heads = board.locator('.req-head');
  await heads.nth(1).click();
  await board.locator('select[data-role="choose"]').selectOption('high');
  await board.getByRole('button', { name: 'Change' }).click();
  await expect(board).toContainText('Someone answered this already.');
  // No form to answer it again.
  await expect(board.locator('select[data-role="choose"]')).toHaveCount(0);
  // The 409 is this test's own answer: not a page error.
  pageErrors.splice(0, pageErrors.length, ...pageErrors.filter((e) => !/^409 POST .*\/resolve$/.test(e)));
});

// The tests' safety rests on the --var settings in playwright.config.ts
// winning over a local .dev.vars: then the Worker's broker is a closed port.
test('the Worker cannot reach a real broker: an unstubbed call fails at once', async ({ request }) => {
  const res = await request.get('/api/board');
  expect(res.status()).toBe(502);
  expect(await res.json()).toEqual({ error: 'something went wrong' });
});
