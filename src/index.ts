// The demo Worker: the page's API. The page itself is static (site/).
//
//   GET /api/config          the demo area and the data credit
//   GET /api/buildings       the buildings of the area as GeoJSON (from the broker)
//   GET /api/buildings/{id}  one Building entity as stored, with the NGSI-LD request
//
// Requests from residents, Pointsman's decisions and the bridge come in later
// steps (see README.md).

import { PLATEAU_SOURCE, toFeature } from './buildings';
import { type Bbox, Broker, BrokerError } from './broker';
import { checkEnv, type Env } from './env';

/** The demo area: Kiyota-ku, Sapporo, around Satozuka (PLATEAU meshes 64413375 and 64413376). */
export const AREA: Bbox = [141.4370, 42.9745, 141.4630, 42.9840];
const CACHE_S = 600;
/** One building: a short cache, so repeated clicks do not reach the broker. */
const ONE_CACHE_S = 60;
const BUILDING_ID = /^urn:ngsi-ld:Building:plateau:\d{5}-bldg-\d+$/;

/** Headers on every answer of the Worker (the page's files get theirs from site/_headers). */
const SECURITY = {
  'x-content-type-options': 'nosniff',
  'referrer-policy': 'strict-origin-when-cross-origin',
  'content-security-policy': "default-src 'none'; frame-ancestors 'none'",
};

const json = (body: unknown, status = 200, extra: Record<string, string> = {}) =>
  Response.json(body, { status, headers: { ...SECURITY, 'cache-control': 'no-store', ...extra } });

async function buildings(env: Env, request: Request, ctx: ExecutionContext): Promise<Response> {
  // The buildings change only when they are loaded again: keep the answer a while.
  const key = new Request(new URL('/api/buildings', request.url).toString());
  const cached = await caches.default.match(key);
  if (cached) return cached;
  const { query, buildings, complete } = await new Broker(env).listBuildings(AREA);
  const features = buildings.map(toFeature).filter((f) => f !== null);
  // Only a complete, non-empty answer is kept, here and in browsers: a partial
  // or empty one (the broker capped, or a load is running) would hide
  // buildings for ten minutes.
  const keep = complete && features.length > 0;
  const res = json(
    { type: 'FeatureCollection', features, query, complete, skipped: buildings.length - features.length, source: PLATEAU_SOURCE },
    200,
    keep ? { 'cache-control': `public, max-age=${CACHE_S}` } : {},
  );
  if (keep) ctx.waitUntil(caches.default.put(key, res.clone()));
  return res;
}

async function building(env: Env, id: string, request: Request, ctx: ExecutionContext): Promise<Response> {
  if (!BUILDING_ID.test(id)) return json({ error: 'not a building id' }, 400);
  // Keyed by the checked id, so odd spellings of the URL share one entry.
  const key = new Request(new URL(`/api/buildings/${encodeURIComponent(id)}`, request.url).toString());
  const cached = await caches.default.match(key);
  if (cached) return cached;
  const { query, entity } = await new Broker(env).getBuilding(id);
  if (!entity) return json({ error: 'not found' }, 404);
  const res = json({ entity, query, feature: toFeature(entity) }, 200, { 'cache-control': `public, max-age=${ONE_CACHE_S}` });
  ctx.waitUntil(caches.default.put(key, res.clone()));
  return res;
}

export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const url = new URL(request.url);
    if (!url.pathname.startsWith('/api/')) return env.ASSETS.fetch(request);
    if (request.method !== 'GET') return json({ error: 'method not allowed' }, 405, { allow: 'GET' });
    // Static: answered also when the broker is not set up, so the page still has its map.
    if (url.pathname === '/api/config') return json({ area: AREA, source: PLATEAU_SOURCE }, 200, { 'cache-control': `public, max-age=${CACHE_S}` });
    try {
      checkEnv(env);
      if (url.pathname === '/api/buildings') return await buildings(env, request, ctx);
      const m = url.pathname.match(/^\/api\/buildings\/([^/]+)$/);
      if (m) {
        let id: string;
        try {
          id = decodeURIComponent(m[1]!);
        } catch {
          return json({ error: 'not a building id' }, 400);
        }
        return await building(env, id, request, ctx);
      }
      return json({ error: 'not found' }, 404);
    } catch (err) {
      console.error(err instanceof Error ? err.message : err);
      return json({ error: err instanceof BrokerError ? 'the data platform did not answer' : 'something went wrong' }, 502);
    }
  },
} satisfies ExportedHandler<Env>;
