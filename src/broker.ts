// The context broker (GeonicDB): Building entities of the demo tenant.

import type { Entity } from './buildings';
import { type Env, trimUrl } from './env';
import { fetchWithAgent } from './http';

/** Building has no datamodels.jp context yet: its terms are in the core context (default vocabulary). */
export const CORE_CONTEXT = 'https://uri.etsi.org/ngsi-ld/v1/ngsi-ld-core-context-v1.8.jsonld';
/** A broker that hangs must not hold the page's request open. */
const TIMEOUT_MS = 10_000;
const link = (ctx: string) => `<${ctx}>; rel="http://www.w3.org/ns/json-ld#context"; type="application/ld+json"`;

/** A bounding box: west, south, east, north (WGS 84). */
export type Bbox = [number, number, number, number];

/** The NGSI-LD query for the buildings inside a box, without paging. */
export function buildingsQuery([w, s, e, n]: Bbox): string {
  const ring = [[w, s], [e, s], [e, n], [w, n], [w, s]];
  const params = new URLSearchParams({
    type: 'Building',
    georel: 'intersects',
    geometry: 'Polygon',
    coordinates: JSON.stringify([ring]),
    geoproperty: 'location',
  });
  return `/entities?${params}`;
}

export class Broker {
  private readonly base: string;
  // A wrapper, not `fetch` itself: Workers refuse `this.fetchFn()` with the
  // global fetch as a property ("Illegal invocation").
  constructor(private readonly env: Env, private readonly fetchFn: typeof fetch = fetchWithAgent) {
    this.base = `${trimUrl(env.BROKER_URL)}/ngsi-ld/v1`;
  }

  private call(path: string, init: { method?: string; body?: unknown } = {}): Promise<Response> {
    return this.fetchFn(`${this.base}${path}`, {
      method: init.method ?? 'GET',
      headers: {
        'x-api-key': this.env.BROKER_API_KEY,
        'NGSILD-Tenant': this.env.BROKER_TENANT,
        accept: 'application/json',
        link: link(CORE_CONTEXT),
        ...(init.body !== undefined && { 'content-type': 'application/json' }),
      },
      ...(init.body !== undefined && { body: JSON.stringify(init.body) }),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
  }

  /** Creates an entity (normalized, core context). */
  async create(entity: Entity): Promise<void> {
    const res = await this.call('/entities', { method: 'POST', body: entity });
    if (res.status !== 201) throw new BrokerError('create', res.status);
  }

  /** An entity as stored (with system attributes when asked), or null. */
  async get(id: string, { sysAttrs = false } = {}): Promise<Entity | null> {
    const res = await this.call(`/entities/${encodeURIComponent(id)}${sysAttrs ? '?options=sysAttrs' : ''}`);
    if (res.status === 404) return null;
    if (!res.ok) throw new BrokerError('get', res.status);
    return (await res.json()) as Entity;
  }

  /** All entities of a type, with system attributes (createdAt), paged; at most `max`. */
  async listType(type: string, max = 5000): Promise<Entity[]> {
    const page = 1000;
    const all: Entity[] = [];
    for (let offset = 0; offset < max; offset += page) {
      const res = await this.call(`/entities?type=${encodeURIComponent(type)}&limit=${page}&offset=${offset}&options=sysAttrs`);
      if (!res.ok) throw new BrokerError('list', res.status);
      const batch = (await res.json()) as unknown;
      if (!Array.isArray(batch)) throw new BrokerError('list (not a list)', res.status);
      all.push(...(batch as Entity[]));
      if (batch.length < page) break;
    }
    return all;
  }

  /** How many entities of a type the broker holds (NGSILD-Results-Count), or null when it does not say. */
  async countType(type: string): Promise<number | null> {
    const res = await this.call(`/entities?type=${encodeURIComponent(type)}&limit=1&count=true`);
    if (!res.ok) throw new BrokerError('count', res.status);
    await res.body?.cancel();
    const n = Number(res.headers.get('NGSILD-Results-Count') ?? NaN);
    return Number.isInteger(n) && n >= 0 ? n : null;
  }

  /** Deletes an entity; a missing one is fine. */
  async delete(id: string): Promise<void> {
    const res = await this.call(`/entities/${encodeURIComponent(id)}`, { method: 'DELETE' });
    if (!res.ok && res.status !== 404) throw new BrokerError('delete', res.status);
  }

  /**
   * The buildings inside a box. Paged (NGSI-LD brokers cap a page; GeonicDB
   * at 1000); `max` bounds the total. `query` is the request without paging,
   * for the page's developer view. `complete`: every building the broker
   * counted (count=true) was read; without a count, the last page was short.
   */
  async listBuildings(bbox: Bbox, max = 10_000): Promise<{ query: string; buildings: Entity[]; complete: boolean }> {
    const page = 1000;
    const query = buildingsQuery(bbox);
    const buildings: Entity[] = [];
    let total: number | null = null;
    for (let offset = 0; offset < max; offset += page) {
      const res = await this.call(`${query}&limit=${page}&offset=${offset}${offset === 0 ? '&count=true' : ''}`);
      if (!res.ok) throw new BrokerError('list', res.status);
      if (offset === 0) {
        const n = Number(res.headers.get('NGSILD-Results-Count') ?? NaN);
        total = Number.isInteger(n) && n >= 0 ? n : null;
      }
      const batch = (await res.json()) as unknown;
      if (!Array.isArray(batch)) throw new BrokerError('list (not a list)', res.status);
      buildings.push(...(batch as Entity[]));
      if (batch.length < page || (total !== null && buildings.length >= total)) {
        return { query, buildings, complete: total === null || buildings.length === total };
      }
    }
    return { query, buildings, complete: false };
  }

  /** One building as stored (normalized, core context), or null. */
  async getBuilding(id: string): Promise<{ query: string; entity: Entity | null }> {
    const query = `/entities/${encodeURIComponent(id)}`;
    const res = await this.call(query);
    if (res.status === 404) return { query, entity: null };
    if (!res.ok) throw new BrokerError('get', res.status);
    return { query, entity: (await res.json()) as Entity };
  }
}

export class BrokerError extends Error {
  constructor(what: string, readonly status: number) {
    // Only the status: bodies may echo what was sent.
    super(`broker ${what} failed: ${status}`);
  }
}
