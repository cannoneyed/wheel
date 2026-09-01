import { fileURLToPath } from 'node:url';
import { defineConfig, devices } from '@playwright/test';

import { TEST_PORTS, testOrigin } from '../../scripts/test-ports';
import { behaviorReport } from '../../scripts/playwright-behavior-report';

const repoRoot = fileURLToPath(new URL('../..', import.meta.url));
const baseURL = process.env.ROUNDS_BROWSER_BASE_URL ?? testOrigin(TEST_PORTS.roundsPreview);
const syncOrigin = testOrigin(TEST_PORTS.roundsSync);
const upgrade = process.env.ROUNDS_UPGRADE === '1';

export default defineConfig({
  ...behaviorReport(repoRoot, 'rounds', 'sqlite', upgrade ? 'upgrade' : 'default'),
  testDir: './browser',
  testIgnore: '**/support/**',
  grep: upgrade ? /@upgrade/ : undefined,
  grepInvert: upgrade ? undefined : /@upgrade/,
  fullyParallel: false,
  workers: 1,
  retries: process.env.CI ? 1 : 0,
  globalSetup: fileURLToPath(new URL('../../scripts/verify-server-identity.ts', import.meta.url)),
  use: {
    ...devices['Desktop Chrome'],
    baseURL,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure'
  },
  webServer: process.env.ROUNDS_BROWSER_BASE_URL
    ? undefined
    : [
        {
          command: 'bun run packages/rounds/browser/support/server-controller.ts',
          cwd: repoRoot,
          env: {
            ROUNDS_PORT: String(TEST_PORTS.roundsSync),
            ROUNDS_CONTROLLER_PORT: String(TEST_PORTS.roundsController),
            ...(upgrade
              ? {
                  ROUNDS_ASSET_SOURCE_A: '.artifacts/rounds/contract-a',
                  ROUNDS_ASSET_SOURCE_B: '.artifacts/rounds/contract-b',
                  ROUNDS_ASSET_TARGET: '.artifacts/rounds/active'
                }
              : {})
          },
          url: `${testOrigin(TEST_PORTS.roundsController)}/readyz`,
          reuseExistingServer: false,
          timeout: 30_000
        },
        {
          command: 'bunx vite preview --config packages/rounds/vite.config.ts',
          cwd: repoRoot,
          env: {
            PORT: String(TEST_PORTS.roundsPreview),
            ROUNDS_SYNC_ORIGIN: syncOrigin,
            ...(upgrade ? { ROUNDS_DIST_DIR: '../../.artifacts/rounds/active' } : {})
          },
          url: baseURL,
          reuseExistingServer: false,
          timeout: 30_000
        }
      ],
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }]
});
