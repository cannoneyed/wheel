import { fileURLToPath } from 'node:url';
import { defineConfig, devices } from '@playwright/test';

import { TEST_PORTS, testOrigin } from '../../scripts/test-ports';

/** Playwright resolves webServer cwd against the CONFIG file; the command is root-relative. */
const repoRoot = fileURLToPath(new URL('../..', import.meta.url));

/**
 * The suite starts its own website on its own port, always.
 *
 * It used to resolve a portless route first, which meant attaching to whatever
 * dev server had claimed the name `wheel-website` — often another checkout.
 * See AGENTS.md, "portless is for humans, not for machines".
 *
 * `WEBSITE_BROWSER_BASE_URL` remains the one deliberate door: a human pointing
 * the suite somewhere on purpose. Global setup verifies whatever it points at
 * is actually this checkout.
 */
const override = process.env.WEBSITE_BROWSER_BASE_URL;
const baseURL = override ?? testOrigin(TEST_PORTS.website);

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
  globalSetup: fileURLToPath(new URL('../../scripts/verify-server-identity.ts', import.meta.url)),
  use: {
    ...devices['Desktop Chrome'],
    baseURL,
    trace: 'retain-on-failure',
    ignoreHTTPSErrors: true,
    screenshot: 'only-on-failure'
  },
  /**
   * `PORT` is how a supervisor tells `bun run website` where to listen, and
   * the suite is that supervisor here — so it names the port twice, once for
   * the server and once for the URL playwright waits on.
   *
   * `reuseExistingServer` is false on purpose. Adopting a stranger's server is
   * exactly the failure this config is built to prevent; a port that is
   * already taken should stop the run, loudly.
   */
  webServer: override
    ? undefined
    : {
        command: 'bun run website',
        cwd: repoRoot,
        env: { PORT: String(TEST_PORTS.website), WHEEL_DEMOS_EMBED_WATCH: '0' },
        url: baseURL,
        reuseExistingServer: false,
        timeout: 180_000
      },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }]
});
