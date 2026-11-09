// Check requests (src/requests.ts) and the Worker's request API, the bridge
// on /notify and the cleanup, with a fake broker and Pointsman.

import { env as cfEnv } from 'cloudflare:workers';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { toEntity, type Entity, type PlateauFeature } from '../src/buildings';
import type { Env } from '../src/env';
import demo, { cleanup, CONCERN_ROUTE } from '../src/index';
import { deletePhotos, inlinePhotos, storePhotos } from '../src/photos';
import { centreOf, CONCERN_INPUTS, parseAnswers, parseConcern, RequestError, REQUEST_INPUTS, toRequestEntity } from '../src/requests';
import setupScript from '../scripts/setup.mjs?raw';

// Without the queue (wrangler.jsonc has one): the bridge then runs in the request, as the tests read it.
const { BRIDGE_QUEUE: queueBinding, ...withoutQueue } = cfEnv as unknown as Env;
const env = withoutQueue as Env;
const BROKER = 'https://geolonia-demo.geonicdb.jp/ngsi-ld/v1';
const PAGE = 'https://buildings.test';
const ctx = { waitUntil: (p: Promise<unknown>) => void p.catch(() => {}), passThroughOnException: () => {}, props: {} } as unknown as ExecutionContext;
const UUID = '11111111-2222-4333-8444-555555555555';

function building(props: Partial<PlateauFeature['properties']> = {}): Entity {
  return toEntity({
    type: 'Feature',
    geometry: { type: 'Polygon', coordinates: [[[141.45, 42.98], [141.4502, 42.98], [141.4502, 42.9802], [141.45, 42.9802], [141.45, 42.98]]] },
    properties: {
      buildingID: '01100-bldg-1', class: '3001', usage: '411', yearOfConstruction: null, measuredHeight: 6, storeysAboveGround: 2,
      storeysBelowGround: 0, totalFloorArea: 100, buildingStructureType: '601', surveyYear: 2019, flood: null, landslide: [], ...props,
    },
  });
}

describe('the subscription', () => {
  it('watches the inputs the bridge hashes', () => {
    const watched = /watchedAttributes: (\[[^\]]*\])/.exec(setupScript)![1]!.replaceAll("'", '"');
    expect(JSON.parse(watched)).toEqual(REQUEST_INPUTS);
    const all = [...setupScript.matchAll(/watchedAttributes: (\[[^\]]*\])/g)].map((m) => JSON.parse(m[1]!.replaceAll("'", '"')));
    expect(all[1]).toEqual(CONCERN_INPUTS);
    expect(setupScript).toContain("q: 'description'");
    expect(setupScript).toContain('/notify?route=concern');
  });
});

describe('answers', () => {
  it('are optional, and checked when given', () => {
    expect(parseAnswers(undefined)).toEqual({});
    expect(parseAnswers({ yearOfConstruction: 1975, wood: true, storeysAboveGround: 2 })).toEqual({ yearOfConstruction: 1975, wood: true, storeysAboveGround: 2 });
    expect(parseAnswers({ yearOfConstruction: null })).toEqual({});
    // The year is checked against the current year at the time of the request.
    expect(parseAnswers({ yearOfConstruction: 2026 }, new Date('2026-11-07T00:00:00Z'))).toEqual({ yearOfConstruction: 2026 });
    expect(() => parseAnswers({ yearOfConstruction: 2027 }, new Date('2026-11-07T00:00:00Z'))).toThrow(RequestError);
    for (const bad of [[], 'x', { yearOfConstruction: '1975' }, { yearOfConstruction: 1700 }, { yearOfConstruction: 3000 }, { yearOfConstruction: 1975.5 },
      { wood: 'yes' }, { storeysAboveGround: 0 }, { storeysAboveGround: 100 }, { name: 'Tanaka' }]) {
      expect(() => parseAnswers(bad), JSON.stringify(bad)).toThrow(RequestError);
    }
  });
});

describe('the request entity', () => {
  it('takes PLATEAU values first, the answers only for gaps, and says where each came from', () => {
    const e = toRequestEntity(building(), { yearOfConstruction: 1975, wood: false, storeysAboveGround: 5 }, UUID, 'ja');
    expect(e.id).toBe(`urn:ngsi-ld:BuildingCheckRequest:demo-${UUID}`);
    expect(e.type).toBe('BuildingCheckRequest');
    expect(e.refBuilding).toEqual({ type: 'Relationship', object: 'urn:ngsi-ld:Building:plateau:01100-bldg-1' });
    // PLATEAU knew structure and storeys: the answers do not change them.
    expect(e.buildingStructureType).toMatchObject({ value: '601', origin: { value: 'plateau' } });
    expect(e.storeysAboveGround).toMatchObject({ value: 2, origin: { value: 'plateau' } });
    // PLATEAU had no year: the resident's answer fills it.
    expect(e.yearOfConstruction).toMatchObject({ value: 1975, origin: { value: 'resident' } });
    expect(e.location).toEqual({ type: 'GeoProperty', value: { type: 'Point', coordinates: [141.4501, 42.9801] } });
    expect(e.language).toEqual({ type: 'Property', value: 'ja' });
  });

  it('leaves out what nobody knows, and maps wood to PLATEAU codes', () => {
    const none = toRequestEntity(building({ buildingStructureType: null, storeysAboveGround: null }), {}, UUID, 'en');
    for (const name of ['yearOfConstruction', 'buildingStructureType', 'storeysAboveGround']) expect(none, name).not.toHaveProperty(name);
    expect(toRequestEntity(building({ buildingStructureType: null }), { wood: true }, UUID, 'en').buildingStructureType).toMatchObject({ value: '601' });
    expect(toRequestEntity(building({ buildingStructureType: null }), { wood: false }, UUID, 'en').buildingStructureType).toMatchObject({ value: '610' });
  });

  it('uses the centre of the footprint, with or without a closing corner', () => {
    expect(centreOf({ type: 'Polygon', coordinates: [[[0, 0], [2, 0], [2, 2], [0, 2], [0, 0]]] })).toEqual([1, 1]);
    expect(centreOf({ type: 'Polygon', coordinates: [[[0, 0], [2, 0], [2, 2], [0, 2]]] })).toEqual([1, 1]);
  });
});

// --- The Worker -------------------------------------------------------------

type Call = { method: string; url: string; headers: Headers; body: any };
let calls: Call[] = [];
let stored: Map<string, Entity>;
let pointsmanAction = 'high';
let pointsmanStatus = 200;
/** How the broker answers a create: 'ok', 'fail' (nothing stored), 'lost' (stored, then the answer is lost), or 'lost-unreadable' (lost, and reading one entity fails). */
let createMode: 'ok' | 'fail' | 'lost' | 'lost-unreadable' = 'ok';
/** NGSILD-Results-Count for count=true; null: none (a broker that does not count). */
let countHeader: (n: number) => string | null = (n) => String(n);

beforeEach(() => {
  calls = [];
  stored = new Map([[building().id, building()]]);
  pointsmanAction = 'high';
  pointsmanStatus = 200;
  createMode = 'ok';
  countHeader = (n) => String(n);
  vi.spyOn(globalThis, 'fetch').mockImplementation(async (input: RequestInfo | URL, init?: RequestInit) => {
    const req = new Request(input, init);
    const text = await req.text();
    let body: any;
    try { body = text ? JSON.parse(text) : undefined; } catch { body = text; }
    const c = { method: req.method, url: req.url, headers: req.headers, body };
    calls.push(c);
    const url = new URL(req.url);
    if (url.origin === 'https://pointsman.geolonia.workers.dev') {
      if (pointsmanStatus !== 200) return new Response('down', { status: pointsmanStatus });
      return Response.json({
        decision_id: '99999999-9999-4999-8999-999999999999', action: pointsmanAction, profile: 'building-check-priority', profile_version: 1,
        model: 'none', created_at: '2026-11-07T01:00:00.000Z', rule: 0, answers: {},
      });
    }
    if (url.pathname === '/ngsi-ld/v1/entities' && req.method === 'POST') {
      if (createMode === 'fail') return new Response('down', { status: 503 });
      stored.set(body.id, body);
      if (createMode === 'lost' || createMode === 'lost-unreadable') return new Response('timeout', { status: 504 });
      return new Response(null, { status: 201 });
    }
    if (url.pathname === '/ngsi-ld/v1/entities' && req.method === 'GET') {
      const all = [...stored.values()].filter((e) => e.type === url.searchParams.get('type'));
      const header = url.searchParams.get('count') === 'true' ? countHeader(all.length) : null;
      return Response.json(all.slice(0, Number(url.searchParams.get('limit') ?? 1000)), { headers: header === null ? {} : { 'NGSILD-Results-Count': header } });
    }
    if (createMode === 'lost-unreadable' && req.method === 'GET' && url.pathname.startsWith('/ngsi-ld/v1/entities/') && decodeURIComponent(url.pathname).includes('BuildingCheckRequest')) return new Response('down', { status: 500 });
    const m = url.pathname.match(/^\/ngsi-ld\/v1\/entities\/([^/]+)(\/attrs(?:\/([^/]+))?)?$/);
    if (m) {
      const id = decodeURIComponent(m[1]!);
      if (req.method === 'DELETE') return new Response(null, { status: stored.delete(id) ? 204 : 404 });
      // As a real broker: PATCH /attrs/<name> updates an attribute that exists
      // (404 when it does not: the bridge then adds it with POST /attrs).
      if (m[2] || req.method === 'PATCH') {
        const e = stored.get(id);
        if (!e) return new Response(null, { status: 404 });
        if (req.method === 'PATCH' && m[3] && !(decodeURIComponent(m[3]) in e)) return new Response(null, { status: 404 });
        // /attrs/<name> writes one attribute; otherwise the body holds several.
        stored.set(id, m[3] ? { ...e, [decodeURIComponent(m[3])]: body } : { ...e, ...body });
        return new Response(null, { status: 204 });
      }
      const e = stored.get(id);
      return e ? Response.json(e) : new Response(null, { status: 404 });
    }
    return new Response('unexpected', { status: 599 });
  });
});
afterEach(() => vi.restoreAllMocks());

const worker = (path: string, init: RequestInit = {}, e: Env = env) => demo.fetch(new Request(`${PAGE}${path}`, init), e, ctx);
// Without the rate limiter (5 a minute per visitor): many tests post; one tests the limit itself.
const { REQUEST_LIMIT: _limit, ALL_REQUESTS_LIMIT: _all, ...unlimited } = env;
const post = (body: unknown, headers: Record<string, string> = {}, e: Env = unlimited as Env) =>
  worker('/api/requests', { method: 'POST', headers: { 'content-type': 'application/json', origin: PAGE, ...headers }, body: JSON.stringify(body) }, e);

describe('POST /api/requests', () => {
  it('refuses when all visitors together have sent too many in the last minute', async () => {
    const full = { ...unlimited, ALL_REQUESTS_LIMIT: { limit: async ({ key }: { key: string }) => ({ success: key !== 'all' }) } } as unknown as Env;
    const res = await post({ building: building().id }, {}, full);
    expect(res.status).toBe(429);
    expect(calls.some((c) => c.method === 'POST')).toBe(false);
  });

  it('creates a BuildingCheckRequest in the broker from the building and the answers', async () => {
    const res = await post({ building: building().id, answers: { yearOfConstruction: 1975 }, lang: 'ja' });
    expect(res.status).toBe(201);
    const { id } = await res.json() as { id: string };
    expect(id).toMatch(/^urn:ngsi-ld:BuildingCheckRequest:demo-/);
    const created = calls.find((c) => c.method === 'POST' && c.url === `${BROKER}/entities`)!;
    expect(created.body).toMatchObject({ id, type: 'BuildingCheckRequest', yearOfConstruction: { value: 1975 }, language: { value: 'ja' } });
    expect(created.headers.get('ngsild-tenant')).toBe('pointsman_buildings');
  });

  it('refuses other origins, bad bodies and unknown buildings, before writing anything', async () => {
    expect((await post({ building: building().id }, { origin: 'https://evil.test' })).status).toBe(403);
    expect((await worker('/api/requests', { method: 'POST', body: '{}' }, unlimited as Env)).status).toBe(403);
    expect((await post({ building: 'urn:x' })).status).toBe(400);
    expect((await post({ building: building().id, answers: { yearOfConstruction: 'old' } })).status).toBe(400);
    expect((await worker('/api/requests', { method: 'POST', headers: { origin: PAGE }, body: 'x'.repeat(2_300_000) }, unlimited as Env)).status).toBe(413);
    expect((await worker('/api/requests', { method: 'POST', headers: { origin: PAGE }, body: 'not json' }, unlimited as Env)).status).toBe(400);
    expect((await post({ building: 'urn:ngsi-ld:Building:plateau:01100-bldg-404' })).status).toBe(404);
    expect(calls.some((c) => c.method === 'POST')).toBe(false);
  });

  it('refuses more than DAILY_LIMIT requests a day, and when the broker does not count', async () => {
    for (let i = 0; i < 300; i++) stored.set(`urn:ngsi-ld:BuildingCheckRequest:demo-${String(i).padStart(12, '0')}-0000-4000-8000-000000000000`, { id: `r${i}`, type: 'BuildingCheckRequest' });
    expect((await post({ building: building().id })).status).toBe(429);
    for (const k of [...stored.keys()]) if (k.includes('BuildingCheckRequest')) stored.delete(k);
    countHeader = () => null;
    expect((await post({ building: building().id })).status).toBe(429);
    expect(calls.some((c) => c.method === 'POST')).toBe(false);
  });

  it('refuses a large body by its declared length, before reading it', async () => {
    const res = await worker('/api/requests', { method: 'POST', headers: { origin: PAGE, 'content-length': '3000000' }, body: '{}' }, unlimited as Env);
    expect(res.status).toBe(413);
  });

  it('allows 5 requests a minute per visitor', async () => {
    const headers = { 'cf-connecting-ip': `198.51.100.${Math.floor(Math.random() * 200) + 1}` };
    const statuses = [];
    for (let i = 0; i < 6; i++) statuses.push((await post({ building: building().id }, headers, env)).status);
    expect(statuses).toEqual([201, 201, 201, 201, 201, 429]);
  });

  it('is closed while the bridge is not configured, so no request waits for a check that never comes', async () => {
    const res = await worker('/api/requests', { method: 'POST', headers: { origin: PAGE }, body: '{}' }, { ...env, POINTSMAN_TOKEN: '' });
    expect(res.status).toBe(503);
    const config = await (await worker('/api/config', {}, { ...env, POINTSMAN_TOKEN: '' })).json() as { checks: boolean };
    expect(config.checks).toBe(false);
    expect((await (await worker('/api/config')).json() as { checks: boolean }).checks).toBe(true);
  });
});

describe('the bridge on /notify', () => {
  const notify = (entity: Entity, secret = env.NOTIFY_SECRET!) =>
    worker('/notify', { method: 'POST', headers: { 'x-bridge-secret': secret, 'content-type': 'application/json' }, body: JSON.stringify({ type: 'Notification', data: [entity] }) });

  it('asks Pointsman with the request as state, and writes the result, a Decision and a Task for high', async () => {
    const req = toRequestEntity(building(), { yearOfConstruction: 1975 }, UUID, 'en');
    stored.set(req.id, req);
    expect((await notify(req)).status).toBe(200);
    const decide = calls.find((c) => c.url === 'https://pointsman.geolonia.workers.dev/v1/decide/building-check-priority')!;
    expect(decide.headers.get('authorization')).toBe(`Bearer ${env.POINTSMAN_TOKEN}`);
    expect(decide.body.state).toMatchObject({ id: req.id, yearOfConstruction: { value: 1975 }, location: { value: { type: 'Point' } } });
    expect(stored.get(req.id)!.check).toMatchObject({ value: 'high', decisionId: { value: '99999999-9999-4999-8999-999999999999' } });
    expect([...stored.values()].some((e) => e.type === 'Decision')).toBe(true);
    expect([...stored.values()].some((e) => e.type === 'Task')).toBe(true);
  });

  it('refuses a wrong secret', async () => {
    expect((await notify(toRequestEntity(building(), {}, UUID, 'en'), 'wrong')).status).toBe(403);
    expect(calls.some((c) => c.url.includes('/v1/decide/'))).toBe(false);
  });
});

describe('GET /api/requests/{id}', () => {
  it('gives the request and its Decision entity', async () => {
    const req = { ...toRequestEntity(building(), {}, UUID, 'en'), check: { type: 'Property', value: 'low', decision: { type: 'Relationship', object: 'urn:ngsi-ld:Decision:9' } } };
    stored.set(req.id, req);
    stored.set('urn:ngsi-ld:Decision:9', { id: 'urn:ngsi-ld:Decision:9', type: 'Decision' });
    const body = await (await worker(`/api/requests/${encodeURIComponent(req.id)}`)).json() as { entity: Entity; decision: Entity };
    expect(body.entity.id).toBe(req.id);
    expect(body.decision.id).toBe('urn:ngsi-ld:Decision:9');
  });

  it('refuses other ids, and answers 404 for a request that is gone', async () => {
    expect((await worker(`/api/requests/${encodeURIComponent('urn:ngsi-ld:Building:plateau:01100-bldg-1')}`)).status).toBe(400);
    expect((await worker(`/api/requests/${encodeURIComponent(`urn:ngsi-ld:BuildingCheckRequest:demo-${UUID}`)}`)).status).toBe(404);
  });
});

describe('cleanup', () => {
  it('sends a request without a result to the bridge again, and one failure does not stop the rest', async () => {
    const waiting = { ...toRequestEntity(building(), { yearOfConstruction: 1975 }, UUID, 'en'), createdAt: '2026-11-07T00:00:00Z' };
    const undated = { ...toRequestEntity(building(), {}, '33333333-3333-4333-8333-333333333333', 'en') };
    stored.set(waiting.id, waiting);
    stored.set(undated.id, undated);
    pointsmanStatus = 503;
    const down = await cleanup(env, Date.parse('2026-11-07T01:00:00Z'));
    expect(down).toMatchObject({ retried: 0, failed: 1, skipped: 1 });
    pointsmanStatus = 200;
    const up = await cleanup(env, Date.parse('2026-11-07T01:00:00Z'));
    expect(up).toMatchObject({ retried: 1, failed: 0, skipped: 1 });
    expect(stored.get(waiting.id)!.check).toMatchObject({ value: 'high' });
  });

  it('does not send a request again after two hours, so no queued copy outlives it', async () => {
    const late = { ...toRequestEntity(building(), { yearOfConstruction: 1975 }, UUID, 'en'), createdAt: '2026-11-07T00:00:00Z' };
    stored.set(late.id, late);
    expect(await cleanup(env, Date.parse('2026-11-07T02:30:00Z'))).toMatchObject({ retried: 0, failed: 0, deleted: 0 });
    expect(stored.get(late.id)!.check).toBeUndefined();
  });

  it('counts failed retries toward the limit of a run', async () => {
    for (let i = 0; i < 25; i++) {
      const uuid = `44444444-4444-4444-8444-${String(i).padStart(12, '0')}`;
      const e = { ...toRequestEntity(building(), { yearOfConstruction: 1975 }, uuid, 'en'), createdAt: '2026-11-07T00:00:00Z' };
      stored.set(e.id, e);
    }
    pointsmanStatus = 503;
    expect(await cleanup(env, Date.parse('2026-11-07T01:00:00Z'))).toMatchObject({ retried: 0, failed: 20 });
    pointsmanStatus = 200;
  });

  it('deletes requests older than a day with their Decision and Task, and keeps newer ones and the buildings', async () => {
    const old = { ...toRequestEntity(building(), {}, UUID, 'en'), createdAt: '2026-11-05T00:00:00Z', check: { type: 'Property', value: 'high', decisionId: { type: 'Property', value: 'd1' }, inputHash: { type: 'Property', value: 'h1' } } };
    const fresh = { ...toRequestEntity(building(), {}, '22222222-2222-4222-8222-222222222222', 'en'), createdAt: '2026-11-07T00:00:00Z' };
    stored.set(old.id, old);
    stored.set(fresh.id, fresh);
    stored.set('urn:ngsi-ld:Decision:d1', { id: 'urn:ngsi-ld:Decision:d1', type: 'Decision' });
    expect(await cleanup(env, Date.parse('2026-11-07T01:00:00Z'))).toMatchObject({ deleted: 1 });
    expect(stored.has(old.id)).toBe(false);
    expect(stored.has('urn:ngsi-ld:Decision:d1')).toBe(false);
    expect(calls.some((c) => c.method === 'DELETE' && c.url.includes('urn%3Angsi-ld%3ATask%3A'))).toBe(true);
    expect(stored.has(fresh.id)).toBe(true);
    expect(stored.has(building().id)).toBe(true);
  });
});

describe('scene B: the concern in the person\'s own words', () => {
  const open = () => ({ ...unlimited, CONCERNS: 'on', BRIDGE_QUEUE: { send: async () => {}, sendBatch: async () => {} } }) as unknown as Env;

  it('reads a description and whether it started after a disaster; empty is none', () => {
    expect(parseConcern(undefined)).toBeUndefined();
    expect(parseConcern({ description: '   ' })).toBeUndefined();
    expect(parseConcern({ description: ' 地震のあと、壁に斜めのひびが入った。', afterDisaster: 'yes' })).toEqual({ description: '地震のあと、壁に斜めのひびが入った。', afterDisaster: 'yes' });
    expect(parseConcern({ description: 'Line one\nline two' })).toEqual({ description: 'Line one\nline two' });
  });

  it('refuses other fields, kinds, control characters and long text', () => {
    for (const bad of [[], { description: 1 }, { description: 'x', other: 1 }, { description: 'x', afterDisaster: 'maybe' }, { description: 'a\u0007b' }, { description: 'x'.repeat(1001) }]) {
      expect(() => parseConcern(bad), JSON.stringify(bad)).toThrow(RequestError);
    }
  });

  it('puts the words on the request entity, as the resident\'s', () => {
    const e = toRequestEntity(building(), {}, UUID, 'en', { description: 'The balcony is cracked.', afterDisaster: 'unsure' });
    expect(e.description).toEqual({ type: 'Property', value: 'The balcony is cracked.', origin: { type: 'Property', value: 'resident' } });
    expect(e.afterDisaster).toMatchObject({ value: 'unsure' });
    expect(CONCERN_INPUTS).toEqual(['description', 'afterDisaster', 'photos', 'check']);
    expect(CONCERN_ROUTE).toMatchObject({ profile: 'building-concern', attribute: 'concern', name: 'concern', requires: { priority: { attribute: 'check' } } });
  });

  it('refuses a description while scene B is closed, and takes it when open', async () => {
    const body = { building: building().id, concern: { description: 'The house leans.' } };
    expect((await post(body)).status).toBe(503);
    expect(calls.some((c) => c.method === 'POST')).toBe(false);
    const res = await post(body, {}, open());
    expect(res.status).toBe(201);
    const created = calls.find((c) => c.method === 'POST' && c.url === `${BROKER}/entities`)!;
    expect(created.body).toMatchObject({ description: { value: 'The house leans.' } });
  });

  it('says in the config whether scene B is open', async () => {
    const closed = await (await worker('/api/config')).json() as { concerns: boolean };
    expect(closed.concerns).toBe(false);
    const opened = await (await worker('/api/config', {}, open())).json() as { concerns: boolean };
    expect(opened.concerns).toBe(true);
  });

  it('gives both Decision entities with the request', async () => {
    const req = {
      ...toRequestEntity(building(), {}, UUID, 'en', { description: 'x' }),
      check: { type: 'Property', value: 'low', decision: { type: 'Relationship', object: 'urn:ngsi-ld:Decision:9' } },
      concern: { type: 'Property', value: 'high', decision: { type: 'Relationship', object: 'urn:ngsi-ld:Decision:10' } },
    };
    stored.set(req.id, req);
    stored.set('urn:ngsi-ld:Decision:9', { id: 'urn:ngsi-ld:Decision:9', type: 'Decision' });
    stored.set('urn:ngsi-ld:Decision:10', { id: 'urn:ngsi-ld:Decision:10', type: 'Decision' });
    const body = await (await worker(`/api/requests/${encodeURIComponent(req.id)}`)).json() as { decision: Entity; concernDecision: Entity };
    expect(body.decision.id).toBe('urn:ngsi-ld:Decision:9');
    expect(body.concernDecision.id).toBe('urn:ngsi-ld:Decision:10');
  });

  it('cleanup deletes the concern\'s Decision entity too', async () => {
    const old = {
      ...toRequestEntity(building(), {}, UUID, 'en', { description: 'x' }), createdAt: '2026-11-05T00:00:00Z',
      check: { type: 'Property', value: 'low', decisionId: { type: 'Property', value: 'd1' } },
      concern: { type: 'Property', value: 'high', decisionId: { type: 'Property', value: 'd2' } },
    };
    stored.set(old.id, old);
    stored.set('urn:ngsi-ld:Decision:d2', { id: 'urn:ngsi-ld:Decision:d2', type: 'Decision' });
    expect(await cleanup(env, Date.parse('2026-11-07T01:00:00Z'))).toMatchObject({ deleted: 1 });
    expect(stored.has('urn:ngsi-ld:Decision:d2')).toBe(false);
  });
});

describe('the bridge queue', () => {
  it('with the queue, /notify answers 202 at once and queues the notification', async () => {
    expect(queueBinding).toBeDefined();
    const sent: unknown[] = [];
    const queued = { ...env, BRIDGE_QUEUE: { send: async () => {}, sendBatch: async (m: unknown[]) => { sent.push(...m); } } } as unknown as Env;
    const req = toRequestEntity(building(), {}, UUID, 'en');
    const res = await demo.fetch(new Request(`${PAGE}/notify`, { method: 'POST', headers: { 'content-type': 'application/json', 'x-bridge-secret': env.NOTIFY_SECRET! }, body: JSON.stringify({ type: 'Notification', data: [req] }) }), queued, ctx);
    expect(res.status).toBe(202);
    expect(sent).toHaveLength(1);
  });
});

describe('scene B, more', () => {
  const open = () => ({ ...unlimited, CONCERNS: 'on', BRIDGE_QUEUE: { send: async () => {}, sendBatch: async () => {} } }) as unknown as Env;
  const notify = (path: string, data: unknown[], e: Env) => demo.fetch(new Request(`${PAGE}${path}`, { method: 'POST', headers: { 'content-type': 'application/json', 'x-bridge-secret': env.NOTIFY_SECRET! }, body: JSON.stringify({ type: 'Notification', data }) }), e, ctx);

  it('with scene B off, /notify?route=concern runs nothing', async () => {
    const req = toRequestEntity(building(), {}, UUID, 'en', { description: 'x' });
    const res = await notify('/notify?route=concern', [req], env);
    expect([200, 202]).toContain(res.status);
    expect(calls.some((c) => c.url.includes('/v1/decide/'))).toBe(false);
  });

  it('cleanup sends a request whose concern is missing to the concern route, and not while scene B is off', async () => {
    const waiting = {
      ...toRequestEntity(building(), {}, UUID, 'en', { description: 'x' }), createdAt: '2026-11-07T00:00:00Z',
      check: { type: 'Property', value: 'low', decisionId: { type: 'Property', value: 'd1' } },
    };
    stored.set(waiting.id, waiting);
    expect(await cleanup(env, Date.parse('2026-11-07T01:00:00Z'))).toMatchObject({ retried: 0 });
    const sent: { body: { route?: string } }[] = [];
    const queued = { ...open(), BRIDGE_QUEUE: { send: async () => {}, sendBatch: async (m: { body: { route?: string } }[]) => { sent.push(...m); } } } as unknown as Env;
    expect(await cleanup(queued, Date.parse('2026-11-07T01:00:00Z'))).toMatchObject({ retried: 1, failed: 0 });
    expect(sent[0]!.body.route).toBe('concern');
  });

  it('the queue handler retries everything later while the bridge is not ready', async () => {
    let retried = 0;
    const batch = { messages: [], retryAll: () => { retried += 1; } } as unknown as MessageBatch<never>;
    await demo.queue(batch, { ...env, POINTSMAN_TOKEN: '' } as Env);
    expect(retried).toBe(1);
  });

  it('the request answer says whether scene B is open', async () => {
    const req = toRequestEntity(building(), {}, UUID, 'en');
    stored.set(req.id, req);
    expect(((await (await worker(`/api/requests/${encodeURIComponent(req.id)}`)).json()) as { concerns: boolean }).concerns).toBe(false);
  });
});

describe('scene B: photos', () => {
  const jpeg = `data:image/jpeg;base64,${btoa(String.fromCharCode(0xff, 0xd8, 0xff, 0xe0) + 'a jpeg')}`;
  const withPhotos = (on: boolean) => ({ ...unlimited, CONCERNS: 'on', PHOTOS: on ? 'on' : 'off', BRIDGE_QUEUE: { send: async () => {}, sendBatch: async () => {} } }) as unknown as Env;

  it('takes up to 3 real images with a description', () => {
    expect(parseConcern({ description: 'The wall in the photo.', photos: [jpeg, jpeg] })).toEqual({ description: 'The wall in the photo.', photos: [jpeg, jpeg] });
  });

  it('refuses photos without words, more than 3, other kinds, and data that is not that image', () => {
    expect(() => parseConcern({ description: '', photos: [jpeg] })).toThrow('describe in a few words');
    expect(() => parseConcern({ description: 'x', photos: [jpeg, jpeg, jpeg, jpeg] })).toThrow('at most 3 photos');
    for (const bad of ['https://example.com/a.jpg', 'data:image/gif;base64,R0lGODlh', `data:image/jpeg;base64,${btoa('not a jpeg at all')}`, `data:image/jpeg;base64,${'A'.repeat(700_004)}`, 42]) {
      expect(() => parseConcern({ description: 'x', photos: [bad] }), String(bad).slice(0, 40)).toThrow(/photo 1/);
    }
  });

  it('keeps the photos in R2, the entity has their keys, and refuses them while photos are off', async () => {
    const body = { building: building().id, concern: { description: 'Cracks, see the photo.', photos: [jpeg] } };
    expect((await post(body, {}, withPhotos(false))).status).toBe(503);
    const res = await post(body, {}, withPhotos(true));
    expect(res.status).toBe(201);
    const { id } = await res.json() as { id: string };
    const uuid = id.slice(-36);
    const created = calls.find((c) => c.method === 'POST' && c.url === `${BROKER}/entities`)!;
    expect(created.body).toMatchObject({ photos: { value: [`photos/${uuid}/1.jpg`], origin: { value: 'resident' } } });
    expect(JSON.stringify(created.body)).not.toContain('base64');
    const obj = await env.PHOTOS_BUCKET!.get(`photos/${uuid}/1.jpg`);
    expect(obj?.httpMetadata?.contentType).toBe('image/jpeg');
    expect(new Uint8Array(await obj!.arrayBuffer()).slice(0, 3)).toEqual(new Uint8Array([0xff, 0xd8, 0xff]));
  });

  it('the bridge\'s call to building-concern gets the photos in place of their keys, other calls are unchanged', async () => {
    const uuid = '99999999-9999-4999-8999-999999999999';
    await storePhotos(env.PHOTOS_BUCKET!, uuid, [jpeg]);
    const sent: string[] = [];
    const fetcher = (async (_u: RequestInfo | URL, init?: RequestInit) => { sent.push(String(init?.body)); return new Response('{}'); }) as typeof fetch;
    const f = inlinePhotos(fetcher, { PHOTOS_BUCKET: env.PHOTOS_BUCKET!, POINTSMAN_URL: 'https://pointsman.test' }, 'building-concern');
    const state = { description: { value: 'x' }, photos: { value: [`photos/${uuid}/1.jpg`, 'photos/../../secret'] } };
    await f('https://pointsman.test/v1/decide/building-concern', { method: 'POST', body: JSON.stringify({ state }) });
    expect(JSON.parse(sent[0]!).state.photos.value).toEqual([jpeg]);
    await f('https://pointsman.test/v1/decide/building-check-priority', { method: 'POST', body: JSON.stringify({ state }) });
    expect(JSON.parse(sent[1]!).state.photos.value).toEqual(state.photos.value);
    await deletePhotos(env.PHOTOS_BUCKET!, uuid);
    expect(await env.PHOTOS_BUCKET!.get(`photos/${uuid}/1.jpg`)).toBeNull();
  });

  it('a failed create deletes the photos, a create that went through after all keeps them', async () => {
    const body = { building: building().id, concern: { description: 'Cracks, see the photo.', photos: [jpeg] } };
    const photoCount = async () => (await env.PHOTOS_BUCKET!.list({ prefix: 'photos/' })).objects.length;
    const before = await photoCount();
    createMode = 'fail';
    expect((await post(body, {}, withPhotos(true))).status).toBeGreaterThanOrEqual(500);
    expect(await photoCount()).toBe(before);
    createMode = 'lost';
    expect((await post(body, {}, withPhotos(true))).status).toBeGreaterThanOrEqual(500);
    expect(await photoCount()).toBe(before + 1);
    // Lost, and the read to check fails too: the photos stay (the request may exist).
    createMode = 'lost-unreadable';
    expect((await post(body, {}, withPhotos(true))).status).toBeGreaterThanOrEqual(500);
    expect(await photoCount()).toBe(before + 2);
  });

  it('a single photo key given back as a string (JSON-LD compaction) is inlined too', async () => {
    const uuid = '77777777-7777-4777-8777-777777777777';
    await storePhotos(env.PHOTOS_BUCKET!, uuid, [jpeg]);
    const sent: string[] = [];
    const fetcher = (async (_u: RequestInfo | URL, init?: RequestInit) => { sent.push(String(init?.body)); return new Response('{}'); }) as typeof fetch;
    const f = inlinePhotos(fetcher, { PHOTOS_BUCKET: env.PHOTOS_BUCKET!, POINTSMAN_URL: 'https://pointsman.test' }, 'building-concern');
    const state = { description: { value: 'x' }, photos: { value: `photos/${uuid}/1.jpg` } };
    await f('https://pointsman.test/v1/decide/building-concern', { method: 'POST', body: JSON.stringify({ state }) });
    expect(JSON.parse(sent[0]!).state.photos.value).toEqual([jpeg]);
    await deletePhotos(env.PHOTOS_BUCKET!, uuid);
  });

  it('a photo missing in R2: Pointsman is not called, the bridge gets a 503 to retry', async () => {
    const sent: string[] = [];
    const fetcher = (async (_u: RequestInfo | URL, init?: RequestInit) => { sent.push(String(init?.body)); return new Response('{}'); }) as typeof fetch;
    const f = inlinePhotos(fetcher, { PHOTOS_BUCKET: env.PHOTOS_BUCKET!, POINTSMAN_URL: 'https://pointsman.test' }, 'building-concern');
    const state = { description: { value: 'x' }, photos: { value: ['photos/88888888-8888-4888-8888-888888888888/1.jpg'] } };
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    const res = await f('https://pointsman.test/v1/decide/building-concern', { method: 'POST', body: JSON.stringify({ state }) });
    expect(res.status).toBe(503);
    expect(sent).toEqual([]);
  });

  it('cleanup deletes a request\'s photos with it', async () => {
    const old = { ...toRequestEntity(building(), {}, UUID, 'en', { description: 'x', photos: [`photos/${UUID}/1.jpg`] }), createdAt: '2026-11-05T00:00:00Z' };
    stored.set(old.id, old);
    await storePhotos(env.PHOTOS_BUCKET!, UUID, [jpeg]);
    expect(await cleanup(env, Date.parse('2026-11-07T01:00:00Z'))).toMatchObject({ deleted: 1 });
    expect(await env.PHOTOS_BUCKET!.get(`photos/${UUID}/1.jpg`)).toBeNull();
  });
});
