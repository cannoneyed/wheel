import { fileURLToPath } from 'node:url';
import { defineConfig, devices } from '@playwright/test';

import { TEST_PORTS, testOrigin } from '../../scripts/test-ports';

const repoRoot = fileURLToPath(new URL('../..', import.meta.url));
const override = process.env.SPOKE_BROWSER_BASE_URL;
const syncOrigin = testOrigin(TEST_PORTS.spokeSync);
const baseURL = override ?? testOrigin(TEST_PORTS.spokePreview);

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
    screenshot: 'only-on-failure'
  },
  webServer: override
    ? undefined
    : [
        {
          command: 'bun run packages/spoke/server.ts',
          cwd: repoRoot,
          env: { SPOKE_PORT: String(TEST_PORTS.spokeSync) },
          url: `${syncOrigin}/readyz`,
          reuseExistingServer: false,
          timeout: 30_000
        },
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
