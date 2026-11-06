// Settings of the demo Worker (wrangler.jsonc vars and secrets).

export interface Env {
  // Vars
  BROKER_URL: string;
  BROKER_TENANT: string;
  // Secrets
  BROKER_API_KEY: string;
  // Bindings
  ASSETS: Fetcher;
}

/** Throws naming the first missing or invalid setting. */
export function checkEnv(env: Env): void {
  for (const name of ['BROKER_URL', 'BROKER_TENANT', 'BROKER_API_KEY'] as const) if (!env[name]) throw new Error(`${name} is not set`);
  const u = URL.parse(env.BROKER_URL);
  if (!u || (u.protocol !== 'https:' && !['localhost', '127.0.0.1'].includes(u.hostname))) {
    throw new Error('BROKER_URL must be an https URL (http only for localhost)');
  }
}

export const trimUrl = (u: string) => u.replace(/\/+$/, '');
