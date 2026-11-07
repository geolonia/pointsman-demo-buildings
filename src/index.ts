// The demo Worker: the page's API and the FIWARE bridge. The page itself is
// static (site/).
//
//   GET  /api/config          the demo area, the data credit, whether checks run
//   GET  /api/buildings       the buildings of the area as GeoJSON (from the broker)
//   GET  /api/buildings/{id}  one Building entity as stored, with the NGSI-LD request
//   POST /api/requests        a check request for one building (BuildingCheckRequest)
//   GET  /api/requests/{id}   the request with Pointsman's result and its Decision entity
//   POST /notify              the broker's subscription: the bridge asks Pointsman
//
// See README.md.

import { type BridgeConfig, decisionEntityId, handleRequest, type Route, taskEntityId } from '../engine/packages/fiware/src/bridge';
import { PLATEAU_SOURCE, toFeature } from './buildings';
import { type Bbox, Broker, BrokerError } from './broker';
import { bridgeReady, checkEnv, type Env, trimUrl } from './env';
import { fetchWithAgent } from './http';
import { isRequestId, parseAnswers, REQUEST_INPUTS, REQUEST_TYPE, RequestError, toRequestEntity } from './requests';

/** The demo area: Kiyota-ku, Sapporo, around Satozuka (PLATEAU meshes 64413375 and 64413376). */
export const AREA: Bbox = [141.4370, 42.9745, 141.4630, 42.9840];
const CACHE_S = 600;
/** One building: a short cache, so repeated clicks do not reach the broker. */
const ONE_CACHE_S = 60;
const BUILDING_ID = /^urn:ngsi-ld:Building:plateau:\d{5}-bldg-\d+$/;
/** Demo requests live this long; the hourly cleanup deletes them with their Decision and Task entities. */
const KEEP_MS = 24 * 3600_000;
const MAX_BODY = 4096;

/** The check: Pointsman's profile in the private deployment config, rules only (no model). */
export const ROUTE: Route = {
  type: REQUEST_TYPE,
  profile: 'building-check-priority',
  inputs: REQUEST_INPUTS,
  attribute: 'check',
  decisionEntity: true,
  // A person confirms a high priority; any app that lists Task entities shows the work.
  task: { actions: ['high'], priority: { high: 1 } },
};

export function bridgeConfig(env: Env): BridgeConfig {
  return {
    routes: [ROUTE],
    notifySecret: env.NOTIFY_SECRET ?? '',
    pointsman: { url: trimUrl(env.POINTSMAN_URL), token: env.POINTSMAN_TOKEN ?? '' },
    broker: { url: trimUrl(env.BROKER_URL), apiKey: env.BROKER_API_KEY, tenant: env.BROKER_TENANT },
    fetch: fetchWithAgent,
  };
}

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

/** Same origin as the page, or one listed in ALLOWED_ORIGINS. */
function originAllowed(request: Request, env: Env): boolean {
  const origin = request.headers.get('origin');
  if (!origin) return false;
  if (origin === new URL(request.url).origin) return true;
  return (env.ALLOWED_ORIGINS ?? '').split(',').map((o) => o.trim()).filter(Boolean).includes(origin);
}

async function createRequest(env: Env, request: Request): Promise<Response> {
  if (!bridgeReady(env)) return json({ error: 'checks are not available yet' }, 503);
  if (!originAllowed(request, env)) return json({ error: 'origin not allowed' }, 403);
  const visitor = request.headers.get('cf-connecting-ip') ?? 'unknown';
  if (env.REQUEST_LIMIT && !(await env.REQUEST_LIMIT.limit({ key: visitor })).success) return json({ error: 'too many requests, try again in a minute' }, 429);
  const text = await request.text();
  if (text.length > MAX_BODY) return json({ error: 'request too large' }, 413);
  let body: { building?: unknown; answers?: unknown; lang?: unknown };
  try {
    body = JSON.parse(text) as typeof body;
  } catch {
    return json({ error: 'not JSON' }, 400);
  }
  if (typeof body !== 'object' || body === null) return json({ error: 'not an object' }, 400);
  if (typeof body.building !== 'string' || !BUILDING_ID.test(body.building)) return json({ error: 'not a building id' }, 400);
  const lang = body.lang === 'ja' ? 'ja' : 'en';
  try {
    const answers = parseAnswers(body.answers);
    const broker = new Broker(env);
    const { entity: building } = await broker.getBuilding(body.building);
    if (!building) return json({ error: 'building not found' }, 404);
    const entity = toRequestEntity(building, answers, crypto.randomUUID(), lang);
    await broker.create(entity);
    return json({ id: entity.id }, 201);
  } catch (err) {
    if (err instanceof RequestError) return json({ error: err.message }, 400);
    throw err;
  }
}

async function getRequest(env: Env, id: string): Promise<Response> {
  if (!isRequestId(id)) return json({ error: 'not a request id' }, 400);
  const broker = new Broker(env);
  const entity = await broker.get(id);
  if (!entity) return json({ error: 'not found' }, 404);
  const ref = (entity.check as { decision?: { object?: unknown } } | undefined)?.decision?.object;
  // The Decision entity as stored, without a context: its terms come back as full IRIs.
  const decision = typeof ref === 'string' && ref.startsWith('urn:ngsi-ld:Decision:') ? await broker.get(ref) : null;
  return json({ entity, decision, query: `/entities/${encodeURIComponent(id)}` });
}

/** Deletes requests older than a day, with their Decision and Task entities. */
export async function cleanup(env: Env, now = Date.now()): Promise<number> {
  const broker = new Broker(env);
  let deleted = 0;
  for (const e of await broker.listType(REQUEST_TYPE)) {
    const created = Date.parse(String(e.createdAt ?? ''));
    if (!(now - created > KEEP_MS)) continue;
    const check = e.check as { decisionId?: { value?: unknown }; inputHash?: { value?: unknown } } | undefined;
    if (typeof check?.decisionId?.value === 'string') await broker.delete(decisionEntityId(check.decisionId.value));
    if (typeof check?.inputHash?.value === 'string') await broker.delete(await taskEntityId(e.id, ROUTE.attribute, check.inputHash.value));
    await broker.delete(e.id);
    deleted += 1;
  }
  return deleted;
}

export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const url = new URL(request.url);
    if (url.pathname === '/notify') {
      // The broker's subscription; the bridge checks the shared secret.
      if (!bridgeReady(env)) return json({ error: 'the bridge is not configured' }, 503);
      return handleRequest(request, bridgeConfig(env));
    }
    if (!url.pathname.startsWith('/api/')) return env.ASSETS.fetch(request);
    const posting = request.method === 'POST' && url.pathname === '/api/requests';
    if (request.method !== 'GET' && !posting) return json({ error: 'method not allowed' }, 405, { allow: 'GET' });
    // Static: answered also when the broker is not set up, so the page still has its map.
    if (url.pathname === '/api/config') {
      return json({ area: AREA, source: PLATEAU_SOURCE, checks: bridgeReady(env) }, 200, { 'cache-control': 'public, max-age=60' });
    }
    try {
      checkEnv(env);
      if (posting) return await createRequest(env, request);
      const rq = url.pathname.match(/^\/api\/requests\/([^/]+)$/);
      if (rq) {
        let id: string;
        try {
          id = decodeURIComponent(rq[1]!);
        } catch {
          return json({ error: 'not a request id' }, 400);
        }
        return await getRequest(env, id);
      }
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

  async scheduled(_event: ScheduledController, env: Env): Promise<void> {
    checkEnv(env);
    const deleted = await cleanup(env);
    if (deleted) console.log(`cleanup: ${deleted} requests deleted`);
  },
} satisfies ExportedHandler<Env>;
