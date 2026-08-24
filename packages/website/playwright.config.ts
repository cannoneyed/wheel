import { fileURLToPath } from 'node:url';
import { defineConfig, devices } from '@playwright/test';

import { portlessRoute } from '../../scripts/portless';

/** Playwright resolves webServer cwd against the CONFIG file; the command is root-relative. */
const repoRoot = fileURLToPath(new URL('../..', import.meta.url));

/** Explicit override, else a LIVE portless route, else the literal port (see the demos config). */
const portlessApp = portlessRoute('wheel-website');
const baseURL = process.env.WEBSITE_BROWSER_BASE_URL ?? portlessApp?.url ?? 'http://127.0.0.1:4790';
const managesServers = process.env.WEBSITE_BROWSER_BASE_URL === undefined && portlessApp === null;

/**
 * Browser suite for wheel.dev: the landing page, the /docs entry, and the
 * embedded demos app at /demos (in-browser sync — no bun server anywhere).
 * `bun run website` builds the demos embed first, so this suite exercises the
 * exact serving topology the static deploy uses.
 */
export default defineConfig({
  testDir: './browser',
  fullyParallel: false,
  workers: 1,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? 'github' : 'line',
  use: {
    ...devices['Desktop Chrome'],
    baseURL,
    trace: 'retain-on-failure',
    // portless serves https://<name>.localhost from its own local CA.
    ignoreHTTPSErrors: true,
    screenshot: 'only-on-failure'
  },
  /**
   * `bun run website` treats `PORT` as "my supervisor assigned me this port".
   * That is right under portless, and wrong here: playwright waits on the
   * literal `baseURL`, so a `PORT` inherited from whatever launched the test
   * run moves the server somewhere playwright never looks. Pin it, and the
   * url and the server name one port.
   */
  webServer: managesServers
    ? [
        {
          command: 'PORT=4790 bun run website',
          cwd: repoRoot,
          env: { PORT: new URL(baseURL).port, WHEEL_DEMOS_EMBED_WATCH: '0' },
          url: baseURL,
          reuseExistingServer: !process.env.CI,
          timeout: 120_000
        }
      ]
    : undefined,
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }]
});
