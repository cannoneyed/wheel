import { fileURLToPath } from 'node:url';
import { defineConfig, devices } from '@playwright/test';

import { portlessRoute } from '../../scripts/portless';

/** Playwright resolves webServer cwd against the CONFIG file; these commands are root-relative. */
const repoRoot = fileURLToPath(new URL('../..', import.meta.url));

/**
 * Every server this suite needs resolves the same way, PER SERVER: an
 * explicit env override, then a LIVE portless route (attach to whatever is
 * already serving it), then the literal port with playwright starting its
 * own.
 *
 * Per-server matters: the standalone host and the embedded host are
 * independent. When the website is already running under portless but the
 * demos preview is not, playwright must attach to the former and start only
 * the latter — starting a duplicate website is both wasteful and a fresh
 * chance to collide on 4790.
 *
 * Detection reads portless's registry, never a supervisor-specific env var:
 * it must not matter whether Solo, a bare terminal, or anything else
 * launched the app. Nothing here requires portless to exist — with no
 * routes, this is byte-for-byte the old fixed-port behavior.
 */
function resolveServer(
  portlessName: string,
  fallbackUrl: string,
  override: string | undefined
): { url: string; managed: boolean } {
  if (override !== undefined) return { url: override, managed: false };
  const route = portlessRoute(portlessName);
  return route ? { url: route.url, managed: false } : { url: fallbackUrl, managed: true };
}

// NOTE the name: `wheel-demos-preview`, not `wheel-demos`. This suite's
// subject is the PRODUCTION BUILD (vite preview + SPA fallback, minified
// output). A running dev server must never be silently substituted — it
// would, for one, make SHELL-21's "class names survive minification"
// assertion pass vacuously. Run `bun run dev:demos:preview` to attach.
const app = resolveServer('wheel-demos-preview', 'http://127.0.0.1:4794', process.env.DEMOS_BROWSER_BASE_URL);
const website = resolveServer('wheel-website', 'http://127.0.0.1:4790', process.env.WEBSITE_BROWSER_BASE_URL);
const sync = resolveServer('wheel-demos-sync', 'http://127.0.0.1:4795', process.env.DEMOS_SYNC_BASE_URL);

const baseURL = app.url;

/**
 * Every server below treats `PORT` as "my supervisor assigned me this port".
 * That is right under portless, and wrong for a MANAGED server: playwright
 * waits on the literal fallback url, so a `PORT` inherited from whatever
 * launched the test run (Solo, a hub ship gate, a plain shell that exports
 * it) moves the server somewhere playwright never looks. Pinning the port
 * makes the url and the server agree on one number. `managed` is only true
 * when the url IS the literal fallback, so this reads the number back out of
 * it rather than repeating it.
 */
const pinnedPort = (url: string) => new URL(url).port;

const managedServers = [
  sync.managed && {
    command: 'bun run demos:server',
    cwd: repoRoot,
    env: { PORT: pinnedPort(sync.url) },
    url: `${sync.url}/`,
    reuseExistingServer: !process.env.CI,
    timeout: 30_000
  },
  app.managed && {
    command: 'bunx vite preview --config packages/demos/vite.config.ts',
    cwd: repoRoot,
    env: { PREVIEW_PORT: pinnedPort(app.url) },
    url: app.url,
    reuseExistingServer: !process.env.CI,
    timeout: 30_000
  },
  website.managed && {
    // The embedded host (016 behavior tests run every behavior against
    // both topologies). `bun run website` rebuilds the demos embed first.
    command: 'bun run website',
    cwd: repoRoot,
    env: { PORT: pinnedPort(website.url), WHEEL_DEMOS_EMBED_WATCH: '0' },
    url: website.url,
    reuseExistingServer: !process.env.CI,
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
