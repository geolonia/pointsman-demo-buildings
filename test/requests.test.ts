// Check requests (src/requests.ts) and the Worker's request API, the bridge
// on /notify and the cleanup, with a fake broker and Pointsman.

import { env as cfEnv } from 'cloudflare:workers';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { toEntity, type Entity, type PlateauFeature } from '../src/buildings';
import type { Env } from '../src/env';
import demo, { cleanup } from '../src/index';
import { centreOf, parseAnswers, RequestError, REQUEST_INPUTS, toRequestEntity } from '../src/requests';
import setupScript from '../scripts/setup.mjs?raw';

const env = cfEnv as unknown as Env;
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
/** NGSILD-Results-Count for count=true; null: none (a broker that does not count). */
let countHeader: (n: number) => string | null = (n) => String(n);

beforeEach(() => {
  calls = [];
  stored = new Map([[building().id, building()]]);
  pointsmanAction = 'high';
  pointsmanStatus = 200;
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
      stored.set(body.id, body);
      return new Response(null, { status: 201 });
    }
    if (url.pathname === '/ngsi-ld/v1/entities' && req.method === 'GET') {
      const all = [...stored.values()].filter((e) => e.type === url.searchParams.get('type'));
      const header = url.searchParams.get('count') === 'true' ? countHeader(all.length) : null;
      return Response.json(all.slice(0, Number(url.searchParams.get('limit') ?? 1000)), { headers: header === null ? {} : { 'NGSILD-Results-Count': header } });
    }
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
    expect((await worker('/api/requests', { method: 'POST', headers: { origin: PAGE }, body: 'x'.repeat(5000) }, unlimited as Env)).status).toBe(413);
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
    const res = await worker('/api/requests', { method: 'POST', headers: { origin: PAGE, 'content-length': '999999' }, body: '{}' }, unlimited as Env);
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
