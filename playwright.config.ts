// Smoke tests of the demo page in a browser (e2e/). The page runs on the
// real Worker (`wrangler dev`, with site/_headers and GET /api/config), but
// the Worker never reaches the broker or Pointsman: their addresses point at
// a closed local port and the secrets are throwaway values made at run time.
// The tests stub the API endpoints that would need those services.

import { randomUUID } from 'node:crypto';
import { defineConfig, devices } from '@playwright/test';

// Not 8787, so it runs next to `pnpm dev`.
const PORT = 8788;
const ORIGIN = `http://127.0.0.1:${PORT}`;
const CLOSED = 'http://127.0.0.1:9';

// --var wins over wrangler.jsonc and over a local .dev.vars (checked with
// wrangler 4.160), so real secrets in .dev.vars are never used here.
const vars = {
  BROKER_URL: CLOSED,
  POINTSMAN_URL: CLOSED,
  BROKER_API_KEY: randomUUID(),
  POINTSMAN_TOKEN: `pm_${randomUUID()}`,
  NOTIFY_SECRET: randomUUID(),
  // Scene B with photos, as deployed (wrangler.jsonc), whatever .dev.vars says.
  CONCERNS: 'on',
  PHOTOS: 'on',
};

const command = [
  'pnpm exec wrangler dev',
  `--ip 127.0.0.1 --port ${PORT}`,
  // Its own local state, not the one of `pnpm dev`.
  '--persist-to .wrangler/e2e-state',
  '--show-interactive-dev-session=false',
  ...Object.entries(vars).map(([k, v]) => `--var ${k}:${v}`),
].join(' ');

export default defineConfig({
  testDir: './e2e',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  // No retries: a smoke test that passes only on a second try is a failure.
  retries: 0,
  // In CI: failures as annotations on the pull request.
  reporter: process.env.CI ? [['list'], ['github']] : 'list',
  use: {
    baseURL: ORIGIN,
    trace: 'retain-on-failure',
  },
  projects: [
    { name: 'desktop', use: { ...devices['Desktop Chrome'] } },
    { name: 'mobile', use: { ...devices['Pixel 7'] } },
  ],
  webServer: {
    command,
    url: `${ORIGIN}/api/config`,
    // Always this server, with the settings above: never one already running.
    reuseExistingServer: false,
    timeout: 120_000,
    env: { WRANGLER_SEND_METRICS: 'false' },
  },
});
