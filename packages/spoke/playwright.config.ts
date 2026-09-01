import { fileURLToPath } from 'node:url';
import { defineConfig, devices } from '@playwright/test';

import { TEST_PORTS, testOrigin } from '../../scripts/test-ports';

const repoRoot = fileURLToPath(new URL('../..', import.meta.url));
const spokeMixRoot = fileURLToPath(new URL('../../elixir/spoke', import.meta.url));
const backend = process.env.SPOKE_BROWSER_BACKEND ?? 'sqlite';
if (backend !== 'sqlite' && backend !== 'postgres' && backend !== 'do') {
  throw new Error('SPOKE_BROWSER_BACKEND must be sqlite, postgres, or do.');
}
const multinode = process.env.SPOKE_MULTINODE === '1';
const externalSyncOrigin = process.env.SPOKE_BROWSER_SYNC_ORIGIN;
const override = process.env.SPOKE_BROWSER_BASE_URL;
const syncOrigin = externalSyncOrigin ?? testOrigin(TEST_PORTS.spokeSync);
const baseURL = override ?? (backend === 'do' ? syncOrigin : testOrigin(TEST_PORTS.spokePreview));

export default defineConfig({
  testDir: './browser',
  testMatch: multinode ? 'spoke-multinode.spec.ts' : 'spoke.spec.ts',
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
          command: `node node_modules/wrangler/bin/wrangler.js dev --config wrangler.spoke.jsonc --ip 127.0.0.1 --port ${TEST_PORTS.spokeSync} --persist-to /tmp/wheel-spoke-do-$$ --log-level warn`,
          cwd: repoRoot,
          url: `${syncOrigin}/readyz?workspace=acme`,
          reuseExistingServer: false,
          timeout: 60_000
        }
      : [
          ...(externalSyncOrigin
            ? []
            : [
                {
                  command: backend === 'postgres' ? 'mix run --no-halt' : 'bun run packages/spoke/server.ts',
                  cwd: backend === 'postgres' ? spokeMixRoot : repoRoot,
                  env:
                    backend === 'postgres'
                      ? {
                          SPOKE_PORT: String(TEST_PORTS.spokeSync),
                          SPOKE_RESET_DATABASE: '1',
                          DATABASE_URL: process.env.DATABASE_URL ?? ''
                        }
                      : { SPOKE_PORT: String(TEST_PORTS.spokeSync) },
                  url: `${syncOrigin}/readyz`,
                  reuseExistingServer: false,
                  timeout: 30_000
                }
              ]),
          {
            command: 'bunx vite preview --config packages/spoke/vite.config.ts',
            cwd: repoRoot,
            env: { PORT: String(TEST_PORTS.spokePreview), SPOKE_SYNC_ORIGIN: syncOrigin },
            url: baseURL,
            reuseExistingServer: false,
            timeout: 30_000
          }
        ],
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }]
});
