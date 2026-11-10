// The staff view (src/board.ts): the board's rows and order, and a person's
// answer through the Worker, with a fake broker.

import { env as cfEnv } from 'cloudflare:workers';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { checkAnswer, DEMO_REVIEWER, sortBoard, toBoardRow } from '../src/board';
import type { Entity } from '../src/buildings';
import type { Env } from '../src/env';
import demo from '../src/index';

const { BRIDGE_QUEUE: _queue, REQUEST_LIMIT: _limit, ALL_REQUESTS_LIMIT: _all, ...rest } = cfEnv as unknown as Env;
const env = rest as Env;
const PAGE = 'https://buildings.test';
const ctx = { waitUntil: (p: Promise<unknown>) => void p.catch(() => {}), passThroughOnException: () => {}, props: {} } as unknown as ExecutionContext;
const id = (n: number) => `urn:ngsi-ld:BuildingCheckRequest:demo-${String(n).padStart(8, '0')}-2222-4333-8444-555555555555`;
const DECISION = 'urn:ngsi-ld:Decision:99999999-9999-4999-8999-999999999999';
const P = (value: unknown) => ({ type: 'Property', value });

/** A result as the bridge writes it (toProperty), optionally waiting for a person. */
const result = (action: string, extra: Record<string, unknown> = {}) => ({
  type: 'Property', value: action, policyRule: P(2), decision: { type: 'Relationship', object: DECISION }, ...extra,
});

function request(n: number, attrs: Record<string, unknown> = {}, createdAt = `2026-11-10T0${n}:00:00Z`): Entity {
  return {
    id: id(n), type: 'BuildingCheckRequest', createdAt,
    refBuilding: { type: 'Relationship', object: 'urn:ngsi-ld:Building:plateau:01100-bldg-1' },
    location: { type: 'GeoProperty', value: { type: 'Point', coordinates: [141.45, 42.98] } },
    yearOfConstruction: P(1975), buildingStructureType: P('601'), storeysAboveGround: P(2),
    ...attrs,
  } as Entity;
}

describe('the board rows', () => {
  it('summarises a request: building, words, photo count, results; never the photos themselves', () => {
    const row = toBoardRow(request(1, {
      description: P('The wall has a long crack.'), afterDisaster: P('yes'), photos: P(['k1', 'k2']),
      check: result('medium'), concern: result('high', { reviewStatus: P('pending') }),
    }))!;
    expect(row).toMatchObject({ id: id(1), year: 1975, structure: '601', storeys: 2, point: [141.45, 42.98], description: 'The wall has a long crack.', afterDisaster: 'yes', photos: 2 });
    expect(row.check).toEqual({ action: 'medium', rule: '2', decision: DECISION });
    expect(row.concern).toMatchObject({ action: 'high', reviewStatus: 'pending' });
    // The description's result counts, and it is the one a person answers.
    expect(row.priority).toBe('high');
    expect(row.waiting).toBe('concern');
    expect(JSON.stringify(row)).not.toContain('k1');
  });

  it("takes a person's answer as the priority, and waits for nothing once answered", () => {
    const row = toBoardRow(request(1, { check: result('high', { reviewStatus: P('resolved'), finalAction: P('low') }) }))!;
    expect(row.priority).toBe('low');
    expect(row.waiting).toBeUndefined();
  });

  it('leaves out a point that is not two numbers', () => {
    const bad = request(1, { location: { type: 'GeoProperty', value: { type: 'Point', coordinates: ['141', null] } } });
    expect(toBoardRow(bad)!.point).toBeUndefined();
  });

  it('skips anything that is not one of the demo requests', () => {
    expect(toBoardRow({ id: 'urn:ngsi-ld:BuildingCheckRequest:other', type: 'BuildingCheckRequest' } as Entity)).toBeNull();
    expect(toBoardRow({ ...request(1), type: 'Building' } as Entity)).toBeNull();
  });

  it('puts the most serious first, and the oldest first within one priority; no result yet goes last', () => {
    const rows = [
      request(1, { check: result('low') }),
      request(2, { check: result('high') }),
      request(3),
      request(4, { check: result('medium'), concern: result('now') }),
      request(5, { check: result('high') }, '2026-11-10T00:30:00Z'),
    ].map((e) => toBoardRow(e)!);
    expect(sortBoard(rows).map((r) => r.id)).toEqual([id(4), id(5), id(2), id(1), id(3)]);
  });

  it("accepts only the actions the result's profile lets a person choose", () => {
    const check = toBoardRow(request(1, { check: result('high', { reviewStatus: P('pending') }) }))!;
    expect(checkAnswer(check, { action: 'low' })).toEqual({ attribute: 'check', action: 'low', decision: DECISION });
    expect(checkAnswer(check, { action: 'now' })).toMatch(/one of: high, medium, low/);
    expect(checkAnswer(check, null)).toMatch(/object/);
    const concern = toBoardRow(request(1, { check: result('medium'), concern: result('person', { reviewStatus: P('pending') }) }))!;
    expect(checkAnswer(concern, { action: 'more-evidence' })).toMatchObject({ attribute: 'concern' });
    expect(checkAnswer(toBoardRow(request(1, { check: result('low') }))!, { action: 'low' })).toMatch(/does not wait/);
  });
});

// --- Through the Worker -----------------------------------------------------

type Call = { method: string; url: string; headers: Headers; body: any };
let calls: Call[];
let stored: Map<string, Entity>;
let decision: Record<string, unknown>;
/** How the broker answers the Decision write: 204 (all written) or 207 (some refused). */
let writeStatus = 204;

beforeEach(() => {
  calls = [];
  stored = new Map();
  decision = { id: DECISION, type: 'Decision', reviewStatus: P('pending') };
  writeStatus = 204;
  vi.spyOn(globalThis, 'fetch').mockImplementation(async (input: RequestInfo | URL, init?: RequestInit) => {
    const req = new Request(input, init);
    const text = await req.text();
    const body = text ? JSON.parse(text) : undefined;
    calls.push({ method: req.method, url: req.url, headers: req.headers, body });
    const url = new URL(req.url);
    if (url.pathname === '/ngsi-ld/v1/entities' && req.method === 'GET') return Response.json([...stored.values()].filter((e) => e.type === url.searchParams.get('type')));
    const m = url.pathname.match(/^\/ngsi-ld\/v1\/entities\/([^/]+)(\/attrs)?$/);
    if (m && decodeURIComponent(m[1]!) === DECISION) {
      if (m[2] && req.method === 'POST') return new Response(null, { status: writeStatus });
      return Response.json(decision);
    }
    if (m && req.method === 'GET') {
      const e = stored.get(decodeURIComponent(m[1]!));
      return e ? Response.json(e) : new Response(null, { status: 404 });
    }
    return new Response('unexpected', { status: 599 });
  });
});
afterEach(() => vi.restoreAllMocks());

const worker = (path: string, init: RequestInit = {}) => demo.fetch(new Request(`${PAGE}${path}`, init), env, ctx);
const resolve = (n: number, body: unknown, origin = PAGE) =>
  worker(`/api/requests/${encodeURIComponent(id(n))}/resolve`, { method: 'POST', headers: { origin, 'content-type': 'application/json' }, body: JSON.stringify(body) });

describe('GET /api/board', () => {
  it('lists the requests, most serious first', async () => {
    stored.set(id(1), request(1, { check: result('low') }));
    stored.set(id(2), request(2, { check: result('high', { reviewStatus: P('pending') }) }));
    const res = await worker('/api/board');
    expect(res.status).toBe(200);
    const { requests } = await res.json() as { requests: { id: string; waiting?: string }[] };
    expect(requests.map((r) => r.id)).toEqual([id(2), id(1)]);
    expect(requests[0]!.waiting).toBe('check');
  });
});

describe('POST /api/requests/{id}/resolve', () => {
  it("writes the person's answer on the Decision entity, as a demo visitor; the bridge does the rest", async () => {
    stored.set(id(1), request(1, { check: result('high', { reviewStatus: P('pending') }) }));
    const res = await resolve(1, { action: 'medium' });
    expect(res.status).toBe(202);
    const write = calls.find((c) => c.method === 'POST' && c.url.endsWith('/attrs'))!;
    expect(decodeURIComponent(write.url)).toContain(DECISION);
    expect(write.headers.get('content-type')).toBe('application/ld+json');
    expect(write.body).toMatchObject({
      '@context': ['https://datamodels.jp/context/decision/v1.jsonld', expect.any(String)],
      reviewStatus: P('resolved'), finalAction: P('medium'), reviewedBy: P(DEMO_REVIEWER),
    });
    // As the bridge's handleReview reads it: a DateTime.
    expect(write.body.reviewedAt.value['@type']).toBe('DateTime');
    expect(Number.isNaN(Date.parse(write.body.reviewedAt.value['@value']))).toBe(false);
    // The Decision was read with its model's context, so reviewStatus comes back short.
    const read = calls.find((c) => c.method === 'GET' && decodeURIComponent(c.url).endsWith(DECISION))!;
    expect(read.headers.get('link')).toContain('https://datamodels.jp/context/decision/v1.jsonld');
  });

  it('answers 502 when the broker refuses part of the write, and 413 for a large body', async () => {
    stored.set(id(1), request(1, { check: result('high', { reviewStatus: P('pending') }) }));
    writeStatus = 207;
    expect((await resolve(1, { action: 'low' })).status).toBe(502);
    const big = await worker(`/api/requests/${encodeURIComponent(id(1))}/resolve`, { method: 'POST', headers: { origin: PAGE }, body: JSON.stringify({ action: 'low', pad: 'x'.repeat(2000) }) });
    expect(big.status).toBe(413);
  });

  it('refuses other origins, unknown requests, wrong actions, and requests nobody waits on', async () => {
    stored.set(id(1), request(1, { check: result('high', { reviewStatus: P('pending') }) }));
    stored.set(id(2), request(2, { check: result('low') }));
    expect((await resolve(1, { action: 'medium' }, 'https://evil.test')).status).toBe(403);
    expect((await worker('/api/requests/urn%3Ax/resolve', { method: 'POST', headers: { origin: PAGE }, body: '{}' })).status).toBe(400);
    expect((await resolve(3, { action: 'medium' })).status).toBe(404);
    expect((await resolve(1, { action: 'now' })).status).toBe(400);
    expect((await resolve(2, { action: 'low' })).status).toBe(409);
    expect(calls.some((c) => c.method === 'POST')).toBe(false);
  });

  it('lets the first answer win: a Decision someone resolved already is left alone', async () => {
    stored.set(id(1), request(1, { check: result('high', { reviewStatus: P('pending') }) }));
    decision = { ...decision, reviewStatus: P('resolved') };
    expect((await resolve(1, { action: 'low' })).status).toBe(409);
    expect(calls.some((c) => c.method === 'POST')).toBe(false);
  });
});

describe('POST /reviews', () => {
  it('goes to the bridge, which wants the shared secret', async () => {
    const res = await worker('/reviews', { method: 'POST', body: '{}' });
    expect([401, 403]).toContain(res.status);
  });
});
