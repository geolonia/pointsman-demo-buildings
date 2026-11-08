// Settings of the demo Worker (wrangler.jsonc vars and secrets).

export interface Env {
  // Vars
  BROKER_URL: string;
  BROKER_TENANT: string;
  POINTSMAN_URL: string;
  /** Requests per day for the whole demo (the requests of the last day are counted). */
  DAILY_LIMIT?: string;
  // Secrets
  BROKER_API_KEY: string;
  /** The bridge: a Pointsman token limited to building-check-priority and building-concern. Without it, no checks are sent. */
  POINTSMAN_TOKEN?: string;
  /** The bridge: the secret every broker subscription sends (x-bridge-secret). */
  NOTIFY_SECRET?: string;
  // Bindings
  ASSETS: Fetcher;
  /** Requests per visitor and minute. */
  REQUEST_LIMIT?: RateLimit;
  ALL_REQUESTS_LIMIT?: RateLimit;
  /** The bridge's queue (wrangler.jsonc "queues"); chained routes, such as scene B, run only from it. */
  BRIDGE_QUEUE?: Queue<import('../engine/packages/fiware/src/bridge').BridgeMessage>;
  /** Its dead-letter queue, as a producer: messages no retry can fix go there at once. */
  BRIDGE_DLQ?: Queue<import('../engine/packages/fiware/src/bridge').BridgeMessage>;
  /** "on": scene B (descriptions read by AI) is open; needs the queue and a token that may use building-concern. */
  CONCERNS?: string;
}

const isServiceUrl = (value: string) => {
  const u = URL.parse(value);
  return !!u && (u.protocol === 'https:' || ['localhost', '127.0.0.1'].includes(u.hostname));
};

/** Throws naming the first missing or invalid setting for reading buildings. */
export function checkEnv(env: Env): void {
  for (const name of ['BROKER_URL', 'BROKER_TENANT', 'BROKER_API_KEY'] as const) if (!env[name]) throw new Error(`${name} is not set`);
  if (!isServiceUrl(env.BROKER_URL)) throw new Error('BROKER_URL must be an https URL (http only for localhost)');
}

/** Whether the bridge can run: requests are accepted only then, so none waits for a check that never comes. */
export function bridgeReady(env: Env): boolean {
  return !!env.POINTSMAN_TOKEN && !!env.NOTIFY_SECRET && isServiceUrl(env.POINTSMAN_URL ?? '');
}

/** Whether scene B runs: the bridge, its queue, and the switch (the token must also allow building-concern). */
export function concernsReady(env: Env): boolean {
  return bridgeReady(env) && !!env.BRIDGE_QUEUE && env.CONCERNS === 'on';
}

export const trimUrl = (u: string) => u.replace(/\/+$/, '');
