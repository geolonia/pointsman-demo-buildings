import { randomUUID } from 'node:crypto';
import { cloudflareTest } from '@cloudflare/vitest-plugin';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  plugins: [
    cloudflareTest({
      wrangler: { configPath: './wrangler.jsonc' },
      // Secrets for the tests, made at run time (no secret-looking literals in
      // the repository). BROKER_URL as in wrangler.jsonc, so a local .dev.vars
      // (for example the mock broker) does not change the tests.
      miniflare: { bindings: { BROKER_API_KEY: randomUUID(), BROKER_URL: 'https://geolonia-demo.geonicdb.jp' } },
    }),
  ],
  test: { include: ['test/**/*.test.ts'] },
});
