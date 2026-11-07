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

import { type BridgeConfig, type BridgeMessage, decisionEntityId, handleQueueBatch, handleRequest, type Route, taskEntityId } from '../engine/packages/fiware/src/bridge';
import { PLATEAU_SOURCE, toFeature } from './buildings';
import { type Bbox, Broker, BrokerError } from './broker';
import { bridgeReady, checkEnv, concernsReady, type Env, photosReady, trimUrl } from './env';
import { fetchWithAgent } from './http';
import { deletePhotos, inlinePhotos, storePhotos } from './photos';
import { CONCERN_INPUTS, isRequestId, parseAnswers, parseConcern, REQUEST_INPUTS, REQUEST_TYPE, RequestError, toRequestEntity } from './requests';

/** The demo area: Kiyota-ku, Sapporo, around Satozuka (PLATEAU meshes 64413375 and 64413376). */
export const AREA: Bbox = [141.4370, 42.9745, 141.4630, 42.9840];
const CACHE_S = 600;
/** One building: a short cache, so repeated clicks do not reach the broker. */
const ONE_CACHE_S = 60;
const BUILDING_ID = /^urn:ngsi-ld:Building:plateau:\d{5}-bldg-\d+$/;
/** Demo requests live this long; the hourly cleanup deletes them with their Decision and Task entities. */
const KEEP_MS = 24 * 3600_000;
/** A request with a description and up to 3 photos (at most 700,000 characters each) fits. */
const MAX_BODY = 2_200_000;
/** A request without a result after this long is sent to the bridge again (hourly, at most MAX_RETRIES a run). */
const RETRY_AFTER_MS = 2 * 60_000;
const MAX_RETRIES = 20;

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

/**
 * Scene B: the AI reads the person's words (profile building-concern, which
 * requires the check above). Runs from the queue only (the bridge's rule for
 * chained routes), when the request has a description: its subscription
 * notifies /notify?route=concern.
 */
export const CONCERN_ROUTE: Route = {
  type: REQUEST_TYPE,
  profile: 'building-concern',
  inputs: CONCERN_INPUTS,
  attribute: 'concern',
  name: 'concern',
  decisionEntity: true,
  requires: { priority: { attribute: 'check', rerunOnReview: true } },
  // A person acts on these first; any app that lists Task entities shows the work.
  task: { actions: ['now', 'high', 'person'], priority: { now: 1, high: 2, person: 3 } },
};

export function bridgeConfig(env: Env): BridgeConfig {
  return {
    routes: concernsReady(env) ? [ROUTE, CONCERN_ROUTE] : [ROUTE],
    // With the queue, notifications are answered at once and the queue
    // handler below runs the bridge (chained routes need it).
    ...(env.BRIDGE_QUEUE && { queue: env.BRIDGE_QUEUE }),
    // A message no retry can fix goes there at once, to be looked at and replayed.
    ...(env.BRIDGE_DLQ && { deadLetter: env.BRIDGE_DLQ }),
    notifySecret: env.NOTIFY_SECRET ?? '',
    pointsman: { url: trimUrl(env.POINTSMAN_URL), token: env.POINTSMAN_TOKEN ?? '' },
    broker: { url: trimUrl(env.BROKER_URL), apiKey: env.BROKER_API_KEY, tenant: env.BROKER_TENANT },
    // Scene B's photos are in R2: the call to Pointsman gets them in place of their keys.
    fetch: photosReady(env) ? inlinePhotos(fetchWithAgent, env, CONCERN_ROUTE.profile) : fetchWithAgent,
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

/**
 * Only the page itself may send requests (a browser sends its origin). This
 * stops other sites from sending requests in a visitor's name; scripts can
 * set any origin, so the rate and daily limits do the rest.
 */
const sameOrigin = (request: Request) => request.headers.get('origin') === new URL(request.url).origin;

/** The body as text, at most `max` bytes: refused by its length, or while it is read. */
async function boundedText(request: Request, max: number): Promise<string | null> {
  const declared = Number(request.headers.get('content-length') ?? NaN);
  if (Number.isFinite(declared) && declared > max) return null;
  if (!request.body) return '';
  const reader = request.body.getReader();
  const parts: Uint8Array[] = [];
  let size = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > max) {
      await reader.cancel();
      return null;
    }
    parts.push(value);
  }
  const all = new Uint8Array(size);
  parts.reduce((at, p) => (all.set(p, at), at + p.byteLength), 0);
  return new TextDecoder().decode(all);
}

async function createRequest(env: Env, request: Request): Promise<Response> {
  if (!bridgeReady(env)) return json({ error: 'checks are not available yet' }, 503);
  if (!sameOrigin(request)) return json({ error: 'origin not allowed' }, 403);
  const visitor = request.headers.get('cf-connecting-ip') ?? 'unknown';
  if (env.REQUEST_LIMIT && !(await env.REQUEST_LIMIT.limit({ key: visitor })).success) return json({ error: 'too many requests, try again in a minute' }, 429);
  if (env.ALL_REQUESTS_LIMIT && !(await env.ALL_REQUESTS_LIMIT.limit({ key: 'all' })).success) return json({ error: 'the demo is busy, try again in a minute' }, 429);
  const text = await boundedText(request, MAX_BODY);
  if (text === null) return json({ error: 'request too large' }, 413);
  let body: { building?: unknown; answers?: unknown; concern?: unknown; lang?: unknown };
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
    const concern = parseConcern(body.concern);
    if (concern && !concernsReady(env)) return json({ error: 'descriptions are not read yet' }, 503);
    if (concern?.photos && !photosReady(env)) return json({ error: 'photos are not read yet' }, 503);
    const broker = new Broker(env);
    // All demo requests of the last day (older ones are deleted): refused
    // when there are as many as the daily limit, and when the count is unknown.
    // A soft limit: requests sent at the same moment can pass it. The rate
    // limits (counted per Cloudflare location, roughly) make that less likely
    // but set no bound. It caps cost, not an exact number; an exact one needs
    // a Durable Object.
    const current = await broker.countType(REQUEST_TYPE);
    if (current === null || current >= dailyLimit(env)) return json({ error: 'the demo has had enough requests for today, try again tomorrow' }, 429);
    const { entity: building } = await broker.getBuilding(body.building);
    if (!building) return json({ error: 'building not found' }, 404);
    const uuid = crypto.randomUUID();
    // Photos to R2 first; the entity carries their keys (GeonicDB drops large change events).
    const keys = concern?.photos ? await storePhotos(env.PHOTOS_BUCKET!, uuid, concern.photos) : undefined;
    const entity = toRequestEntity(building, answers, uuid, lang, concern && (keys ? { ...concern, photos: keys } : concern));
    try {
      await broker.create(entity);
    } catch (err) {
      if (keys) await deletePhotos(env.PHOTOS_BUCKET!, uuid).catch(() => {});
      throw err;
    }
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
  // The Decision entities as stored, without a context: their terms come back as full IRIs.
  const decisionOf = async (attribute: string) => {
    const ref = (entity[attribute] as { decision?: { object?: unknown } } | undefined)?.decision?.object;
    return typeof ref === 'string' && ref.startsWith('urn:ngsi-ld:Decision:') ? broker.get(ref) : null;
  };
  const [decision, concernDecision] = await Promise.all([decisionOf('check'), decisionOf('concern')]);
  return json({ entity, decision, concernDecision, concerns: concernsReady(env), query: `/entities/${encodeURIComponent(id)}` });
}

const dailyLimit = (env: Env) => {
  const n = Number(env.DAILY_LIMIT);
  return Number.isInteger(n) && n > 0 ? n : 300;
};

/**
 * Every hour: deletes requests older than a day, with their Decision and Task
 * entities; and sends requests that have no result after RETRY_AFTER_MS to
 * the bridge again (Pointsman or the broker failed when it was notified).
 * One failing request never stops the others.
 */
export async function cleanup(env: Env, now = Date.now()): Promise<{ deleted: number; retried: number; skipped: number; failed: number }> {
  const broker = new Broker(env);
  const out = { deleted: 0, retried: 0, skipped: 0, failed: 0 };
  // Retries tried, failed ones included: each costs subrequests.
  let attempts = 0;
  for (const e of await broker.listType(REQUEST_TYPE)) {
    // Only the demo's own requests: never anything else, whatever the broker lists.
    if (e.type !== REQUEST_TYPE || !isRequestId(e.id)) continue;
    const created = Date.parse(String(e.createdAt ?? ''));
    if (!Number.isFinite(created)) {
      out.skipped += 1;
      continue;
    }
    try {
      if (now - created > KEEP_MS) {
        // Only the Decision and Task the result points to now: when a person's
        // answer ran a route again, earlier ones stay in the broker (accepted
        // for the demo; a query by refersTo would find them).
        for (const route of [ROUTE, CONCERN_ROUTE]) {
          const result = e[route.attribute] as { decisionId?: { value?: unknown }; inputHash?: { value?: unknown } } | undefined;
          if (typeof result?.decisionId?.value === 'string') await broker.delete(decisionEntityId(result.decisionId.value));
          if (typeof result?.inputHash?.value === 'string') await broker.delete(await taskEntityId(e.id, route.attribute, result.inputHash.value));
        }
        if (env.PHOTOS_BUCKET) await deletePhotos(env.PHOTOS_BUCKET, e.id.slice(-36));
        await broker.delete(e.id);
        out.deleted += 1;
      } else if (now - created > RETRY_AFTER_MS && attempts < MAX_RETRIES && bridgeReady(env)
        && (!e.check || (e.description && !e.concern && concernsReady(env)))) {
        attempts += 1;
        // As the subscription would, with the entity as stored (no system attributes).
        const fresh = await broker.get(e.id);
        if (!fresh) continue;
        const notification = new Request(`https://worker.internal/notify${e.check ? '?route=concern' : ''}`, {
          method: 'POST',
          headers: { 'content-type': 'application/json', 'x-bridge-secret': env.NOTIFY_SECRET! },
          body: JSON.stringify({ type: 'Notification', data: [fresh] }),
        });
        const res = await handleRequest(notification, bridgeConfig(env));
        // 202: queued, the queue handler runs it.
        if (res.status !== 200 && res.status !== 202) throw new Error(`retry answered ${res.status}`);
        out.retried += 1;
      }
    } catch (err) {
      out.failed += 1;
      console.error(`cleanup ${e.id}: ${err instanceof Error ? err.message : String(err)}`);
    }
  }
  return out;
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
      return json({ area: AREA, source: PLATEAU_SOURCE, checks: bridgeReady(env), concerns: concernsReady(env), photos: photosReady(env) }, 200, { 'cache-control': 'public, max-age=60' });
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
    const r = await cleanup(env);
    if (r.deleted || r.retried || r.skipped || r.failed) console.log(`cleanup: ${JSON.stringify(r)}`);
  },

  // The bridge's queue (wrangler.jsonc "queues"): what /notify put on
  // BRIDGE_QUEUE, handled with retries; chained routes run only here.
  async queue(batch: MessageBatch<BridgeMessage>, env: Env): Promise<void> {
    if (!bridgeReady(env)) {
      batch.retryAll({ delaySeconds: 300 });
      return;
    }
    await handleQueueBatch(batch, bridgeConfig(env));
  },
} satisfies ExportedHandler<Env, BridgeMessage>;
