import { fileURLToPath } from 'node:url';
import { defineConfig, devices } from '@playwright/test';

import { TEST_PORTS, testOrigin } from '../../scripts/test-ports';

/** Playwright resolves webServer cwd against the CONFIG file; these commands are root-relative. */
const repoRoot = fileURLToPath(new URL('../..', import.meta.url));

/**
 * Every server this suite needs is STARTED BY THE SUITE, on a port reserved
 * for tests.
 *
 * It used to resolve a portless route per server and attach to whatever was
 * already serving that name. That is how the standalone host once ended up
 * being a sibling repo's dev server, and how the embedded host ended up being
 * the website from another worktree. A route is claimed by name, and names are
 * global to the machine — see AGENTS.md, "portless is for humans, not for
 * machines".
 *
 * Each `*_BROWSER_BASE_URL` remains a deliberate door for a human pointing the
 * suite somewhere; global setup then verifies it is this checkout.
 */
function resolveServer(port: number, override: string | undefined): { url: string; managed: boolean } {
  return override === undefined
    ? { url: testOrigin(port), managed: true }
    : { url: override, managed: false };
}

// NOTE the name: this suite's subject is the PRODUCTION BUILD (vite preview +
// SPA fallback, minified output). A running dev server must never be silently
// substituted — it would, for one, make SHELL-21's "class names survive
// minification" assertion pass vacuously.
const app = resolveServer(TEST_PORTS.demosPreview, process.env.DEMOS_BROWSER_BASE_URL);
const website = resolveServer(TEST_PORTS.website, process.env.WEBSITE_BROWSER_BASE_URL);
const sync = resolveServer(TEST_PORTS.demosSync, process.env.DEMOS_SYNC_BASE_URL);

const baseURL = app.url;

/**
 * Every server below treats `PORT` as "my supervisor assigned me this port",
 * and the suite is that supervisor — so it names each port explicitly rather
 * than inheriting one. A `PORT` leaking in from whatever launched the test run
 * would move a server somewhere playwright never looks: the sync server binds
 * :4056, the app proxies `/sync` to the reserved port, every request is
 * ECONNREFUSED, and the suite fails on the sync badge instead of on anything
 * it meant to check.
 */
const pinnedPort = (url: string) => new URL(url).port;

const managedServers = [
  sync.managed && {
    command: 'bun run demos:server',
    cwd: repoRoot,
    env: { PORT: pinnedPort(sync.url) },
    url: `${sync.url}/`,
    reuseExistingServer: false,
    timeout: 30_000
  },
  app.managed && {
    command: 'bunx vite preview --config packages/demos/vite.config.ts',
    cwd: repoRoot,
    // DEMOS_SYNC_ORIGIN is how the preview is told where its backend is;
    // without it the vite config would resolve a portless route and proxy the
    // suite's requests to a human's dev server.
    env: { PREVIEW_PORT: pinnedPort(app.url), DEMOS_SYNC_ORIGIN: sync.url },
    url: app.url,
    reuseExistingServer: false,
    timeout: 30_000
  },
  website.managed && {
    // The embedded host (016 behavior tests run every behavior against
    // both topologies). `bun run website` rebuilds the demos embed first.
    command: 'bun run website',
    cwd: repoRoot,
    env: { PORT: pinnedPort(website.url), WHEEL_DEMOS_EMBED_WATCH: '0' },
    url: website.url,
    reuseExistingServer: false,
    timeout: 120_000
  }
].filter(Boolean) as Array<{
  command: string;
  cwd: string;
  env: Record<string, string>;
  url: string;
  reuseExistingServer: boolean;
  timeout: number;
}>;

/**
 * Browser suite for the demo app, whose subject is the router: real URLs, real
 * back/forward, real anchor clicks. Those are the parts a jsdom test cannot
 * honestly cover — `history.pushState` semantics, the address bar, and what a
 * cold load of a deep URL does.
 *
 * Serves the production build through `vite preview`, which applies the same
 * SPA fallback a real host must: every unmatched path returns `index.html`.
 */
export default defineConfig({
  testDir: './browser',
  globalSetup: fileURLToPath(new URL('../../scripts/verify-server-identity.ts', import.meta.url)),
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
  webServer: managedServers.length > 0 ? managedServers : undefined,
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }]
});
