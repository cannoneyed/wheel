import { fileURLToPath } from 'node:url';
import { defineConfig, devices } from '@playwright/test';

import { TEST_PORTS, testOrigin } from '../../scripts/test-ports';

const repoRoot = fileURLToPath(new URL('../..', import.meta.url));
const backend = process.env.CHALK_BROWSER_BACKEND ?? 'sqlite';
if (backend !== 'sqlite' && backend !== 'do') throw new Error('CHALK_BROWSER_BACKEND must be sqlite or do.');

const override = process.env.CHALK_BROWSER_BASE_URL;
const syncOrigin = testOrigin(TEST_PORTS.chalkSync);
const baseURL = override ?? (backend === 'do' ? syncOrigin : testOrigin(TEST_PORTS.chalkPreview));

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
    screenshot: 'only-on-failure',
    ignoreHTTPSErrors: true
  },
  webServer: override
    ? undefined
    : backend === 'do'
      ? {
          command: `node node_modules/wrangler/bin/wrangler.js dev --config wrangler.chalk.jsonc --ip 127.0.0.1 --port ${TEST_PORTS.chalkSync} --persist-to /tmp/wheel-chalk-do-$$ --log-level warn`,
          cwd: repoRoot,
          url: `${syncOrigin}/readyz`,
          reuseExistingServer: false,
          timeout: 60_000
        }
      : [
          {
            command: 'bun run packages/chalk/server.ts',
            cwd: repoRoot,
            env: { CHALK_PORT: String(TEST_PORTS.chalkSync) },
            url: `${syncOrigin}/readyz`,
            reuseExistingServer: false,
            timeout: 30_000
          },
          {
            command: 'bunx vite preview --config packages/chalk/vite.config.ts',
            cwd: repoRoot,
            env: { PORT: String(TEST_PORTS.chalkPreview), CHALK_SYNC_ORIGIN: syncOrigin },
            url: baseURL,
            reuseExistingServer: false,
            timeout: 30_000
          }
        ],
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }]
});
