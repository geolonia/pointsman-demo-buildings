// The Worker's API with a fake broker (global fetch stubbed), and the page's
// security headers.

import { env as cfEnv } from 'cloudflare:workers';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { toEntity, type Entity, type PlateauFeature } from '../src/buildings';
import type { Env } from '../src/env';
import demo, { AREA } from '../src/index';

const env = cfEnv as unknown as Env;
const BROKER = 'https://geolonia-demo.geonicdb.jp/ngsi-ld/v1';
const ctx = { waitUntil: (p: Promise<unknown>) => void p.catch(() => {}), passThroughOnException: () => {}, props: {} } as unknown as ExecutionContext;
const get = (path: string, init: RequestInit = {}) => demo.fetch(new Request(`https://buildings.test${path}`, init), env, ctx);

function building(n: number, year: number | null = 1975): Entity {
  const f: PlateauFeature = {
    type: 'Feature',
    geometry: { type: 'Polygon', coordinates: [[[141.45, 42.98], [141.4501, 42.98], [141.4501, 42.9801], [141.45, 42.98]]] },
    properties: {
      buildingID: `01100-bldg-${n}`, class: '3001', usage: '411', yearOfConstruction: year, measuredHeight: 6, storeysAboveGround: 2,
      storeysBelowGround: 0, totalFloorArea: 100, buildingStructureType: '601', surveyYear: 2019, flood: null, landslide: [],
    },
  };
  return toEntity(f);
}

type Call = { url: string; headers: Headers };
let calls: Call[] = [];
let stored: Entity[] = [];
let status = 200;
/** NGSILD-Results-Count the fake broker sends with count=true; null: none. */
let count: number | null = null;

beforeEach(async () => {
  calls = [];
  stored = [building(1), building(2, null)];
  status = 200;
  count = null;
  vi.spyOn(globalThis, 'fetch').mockImplementation(async (input: RequestInfo | URL, init?: RequestInit) => {
    const req = new Request(input, init);
    calls.push({ url: req.url, headers: req.headers });
    if (status !== 200) return new Response('{"detail":"secret echo"}', { status });
    const url = new URL(req.url);
    if (url.pathname === '/ngsi-ld/v1/entities') {
      const offset = Number(url.searchParams.get('offset') ?? 0);
      const limit = Number(url.searchParams.get('limit') ?? 20);
      const headers: Record<string, string> = url.searchParams.get('count') === 'true' && count !== null ? { 'NGSILD-Results-Count': String(count) } : {};
      return Response.json(stored.slice(offset, offset + limit), { headers });
    }
    const one = stored.find((e) => url.pathname === `/ngsi-ld/v1/entities/${encodeURIComponent(e.id)}`);
    return one ? Response.json(one) : new Response(null, { status: 404 });
  });
  await caches.default.delete(new Request('https://buildings.test/api/buildings'));
});
afterEach(() => vi.restoreAllMocks());

describe('GET /api/config', () => {
  it('answers also when the broker is not set up, so the page has its map', async () => {
    const res = await demo.fetch(new Request('https://buildings.test/api/config'), { ...env, BROKER_API_KEY: '' }, ctx);
    expect(res.status).toBe(200);
    expect(((await res.json()) as { area: number[] }).area).toEqual(AREA);
    expect(calls).toHaveLength(0);
  });

  it('gives the area and the data credit', async () => {
    const res = await get('/api/config');
    expect(res.status).toBe(200);
    const body = await res.json() as { area: number[]; source: string };
    expect(body.area).toEqual(AREA);
    expect(body.source).toContain('PLATEAU');
  });
});

describe('GET /api/buildings', () => {
  it('asks the broker for the area\'s buildings, with key, tenant and a User-Agent, and answers GeoJSON', async () => {
    const res = await get('/api/buildings');
    expect(res.status).toBe(200);
    const body = await res.json() as { type: string; features: { properties: { era: string } }[]; query: string; complete: boolean };
    expect(body.type).toBe('FeatureCollection');
    expect(body.features.map((f) => f.properties.era)).toEqual(['before-1981', 'unknown']);
    expect(body.complete).toBe(true);
    expect(body.query).toMatch(/^\/entities\?type=Building&georel=intersects/);
    const c = calls[0]!;
    expect(c.url.startsWith(`${BROKER}/entities?type=Building`)).toBe(true);
    expect(c.headers.get('x-api-key')).toBe(env.BROKER_API_KEY);
    expect(c.headers.get('ngsild-tenant')).toBe('pointsman_buildings');
    expect(c.headers.get('user-agent')).toMatch(/^pointsman-demo-buildings/);
  });

  it('reads every page, and keeps a complete answer for ten minutes', async () => {
    stored = Array.from({ length: 1500 }, (_, i) => building(i + 1));
    const first = await (await get('/api/buildings')).json() as { features: unknown[] };
    expect(first.features).toHaveLength(1500);
    expect(calls.map((c) => new URL(c.url).searchParams.get('offset'))).toEqual(['0', '1000']);
    await new Promise((r) => setTimeout(r, 0)); // the cache write (waitUntil)
    const res = await get('/api/buildings');
    expect(res.headers.get('cache-control')).toBe('public, max-age=600');
    expect(calls).toHaveLength(2);
  });

  it('keeps nothing when the broker counted more than it gave, or nothing at all', async () => {
    count = 5; // two stored: a capped or changing answer
    const partial = await get('/api/buildings');
    expect(((await partial.json()) as { complete: boolean }).complete).toBe(false);
    expect(partial.headers.get('cache-control')).toBe('no-store');
    stored = [];
    count = 0;
    const empty = await get('/api/buildings');
    expect(empty.headers.get('cache-control')).toBe('no-store');
    await new Promise((r) => setTimeout(r, 0));
    expect(await caches.default.match(new Request('https://buildings.test/api/buildings'))).toBeUndefined();
  });

  it('is complete when it read as many as the broker counted', async () => {
    count = 2;
    const res = await get('/api/buildings');
    expect(((await res.json()) as { complete: boolean }).complete).toBe(true);
    expect(res.headers.get('cache-control')).toBe('public, max-age=600');
    expect(new URL(calls[0]!.url).searchParams.get('count')).toBe('true');
  });

  it('fails without a key, before asking the broker', async () => {
    const res = await demo.fetch(new Request('https://buildings.test/api/buildings'), { ...env, BROKER_API_KEY: '' }, ctx);
    expect(res.status).toBe(502);
    expect(calls).toHaveLength(0);
  });

  it('says the data platform did not answer, without its body', async () => {
    status = 503;
    const res = await get('/api/buildings');
    expect(res.status).toBe(502);
    const text = await res.text();
    expect(text).toContain('the data platform did not answer');
    expect(text).not.toContain('secret echo');
  });
});

describe('GET /api/buildings/{id}', () => {
  it('gives the entity as stored, the request and the feature', async () => {
    const id = stored[0]!.id;
    const res = await get(`/api/buildings/${encodeURIComponent(id)}`);
    expect(res.status).toBe(200);
    const body = await res.json() as { entity: Entity; query: string; feature: { properties: { buildingID: string } } };
    expect(body.entity.id).toBe(id);
    expect(body.query).toBe(`/entities/${encodeURIComponent(id)}`);
    expect(body.feature.properties.buildingID).toBe('01100-bldg-1');
  });

  it('refuses anything that is not a PLATEAU building id, before asking the broker', async () => {
    for (const bad of ['urn:ngsi-ld:Building:other', '%E0%A4%A', encodeURIComponent('urn:ngsi-ld:Building:plateau:01100-bldg-1/../x')]) {
      expect((await get(`/api/buildings/${bad}`)).status, bad).toBe(400);
    }
    expect(calls).toHaveLength(0);
  });

  it('answers 404 for a building the broker does not have', async () => {
    expect((await get(`/api/buildings/${encodeURIComponent('urn:ngsi-ld:Building:plateau:01100-bldg-999')}`)).status).toBe(404);
  });
});

describe('the API', () => {
  it('answers only GET, with security headers', async () => {
    const res = await get('/api/buildings', { method: 'POST' });
    expect(res.status).toBe(405);
    expect(res.headers.get('x-content-type-options')).toBe('nosniff');
    expect(res.headers.get('content-security-policy')).toContain("default-src 'none'");
    expect((await get('/api/nothing')).status).toBe(404);
  });
});

/** The CSP as { directive: [sources] }. */
function directives(csp: string): Record<string, string[]> {
  return Object.fromEntries(csp.split(';').map((d) => d.trim().split(/\s+/)).filter((d) => d[0]).map(([name, ...sources]) => [name!, sources]));
}
const allows = (sources: string[] | undefined, url: string) =>
  (sources ?? []).some((s) => (s.endsWith('/') ? url.startsWith(s) : url === s || url.startsWith(`${s}/`)));

describe('the page', () => {
  it('has security headers, and its CSP allows what index.html and app.js load', async () => {
    vi.restoreAllMocks();
    const res = await get('/');
    expect(res.status).toBe(200);
    expect(res.headers.get('x-frame-options')).toBe('DENY');
    const csp = directives(res.headers.get('content-security-policy') ?? '');
    expect(csp['script-src']).not.toContain("'unsafe-inline'");
    const html = await res.text();
    expect(html.match(/<script(?![^>]*\ssrc=)[^>]*>/g)).toBeNull();
    for (const m of html.matchAll(/<script[^>]*\ssrc="(https:[^"]+)"/g)) expect(allows(csp['script-src'], m[1]!), m[1]).toBe(true);
    for (const m of html.matchAll(/<link(?=[^>]*rel="stylesheet")[^>]*\shref="(https:[^"]+)"/g)) expect(allows(csp['style-src'], m[1]!), m[1]).toBe(true);
    const app = await (await get('/app.js')).text();
    const links = ['https://github.com'];
    const hosts = new Set([...app.matchAll(/'(https:\/\/[a-z0-9.-]+)\//g)].map((m) => m[1]!).filter((h) => !links.includes(h)));
    expect(hosts.size).toBeGreaterThan(0);
    for (const host of hosts) expect(allows(csp['connect-src'], host), host).toBe(true);
  });
});
