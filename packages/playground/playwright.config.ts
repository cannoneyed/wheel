import { fileURLToPath } from 'node:url';
import { defineConfig, devices } from '@playwright/test';

const repoRoot = fileURLToPath(new URL('../..', import.meta.url));
const baseURL = process.env.COMPONENT_BROWSER_BASE_URL ?? 'http://127.0.0.1:4796';

export default defineConfig({
  testDir: './browser',
  fullyParallel: false,
  workers: 1,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? 'github' : 'line',
  use: {
    ...devices['Desktop Chrome'],
    baseURL,
    screenshot: 'only-on-failure',
    trace: 'retain-on-failure',
  },
  webServer: process.env.COMPONENT_BROWSER_BASE_URL
    ? undefined
    : {
        command: 'bun run --cwd packages/playground catalog --host 127.0.0.1',
        cwd: repoRoot,
        url: `${baseURL}/catalog.html`,
        reuseExistingServer: !process.env.CI,
        timeout: 30_000,
      },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
});
