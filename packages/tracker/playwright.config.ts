import { fileURLToPath } from "node:url";
import { defineConfig, devices } from "@playwright/test";

import { portlessRoute } from "../../scripts/portless";

/**
 * Playwright resolves `webServer.cwd` against the CONFIG file, not the repo
 * root — and both commands below are root-relative scripts. Without this the
 * sync server silently never starts, the app boots offline, and every test
 * fails on the sync badge instead of on anything it meant to check.
 */
const repoRoot = fileURLToPath(new URL("../..", import.meta.url));
const trackerMixRoot = fileURLToPath(
  new URL("../../elixir/tracker", import.meta.url),
);
const backend = process.env.TRACKER_BROWSER_BACKEND ?? "sqlite";
if (backend !== "sqlite" && backend !== "postgres") {
  throw new Error("TRACKER_BROWSER_BACKEND must be sqlite or postgres.");
}
const syncPort = backend === "postgres" ? "4799" : "4797";
const externalSyncOrigin = process.env.TRACKER_BROWSER_SYNC_ORIGIN;
const syncOrigin = externalSyncOrigin ?? `http://127.0.0.1:${syncPort}`;

/**
 * Where the app under test lives, in precedence order:
 *   1. TRACKER_BROWSER_BASE_URL — explicit override, always wins;
 *   2. a LIVE portless route — whoever started the app (a bare terminal,
 *      Solo, Surface, anything) registered it, so attach instead of
 *      starting a competing server on a port someone else may hold;
 *   3. the literal port — nothing else is running, so manage our own.
 *
 * Detection reads portless's own registry, never a supervisor-specific env
 * var: this must not care WHAT launched the app.
 */
// `-preview`, not `wheel-tracker`: this suite serves the production
// build, so a running dev server must not be substituted for it.
const portlessApp = portlessRoute("wheel-tracker-preview");
const baseURL =
  process.env.TRACKER_BROWSER_BASE_URL ??
  portlessApp?.url ??
  "http://127.0.0.1:4798";
const managesServers =
  process.env.TRACKER_BROWSER_BASE_URL === undefined && portlessApp === null;

export default defineConfig({
  testDir: "./browser",
  fullyParallel: false,
  workers: 1,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? "github" : "line",
  use: {
    ...devices["Desktop Chrome"],
    baseURL,
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    ignoreHTTPSErrors: true,
  },
  /**
   * Every server here treats `PORT` as "my supervisor assigned me this port".
   * That is right under portless, and wrong here: when playwright starts the
   * servers itself it waits on the LITERAL ports below, so a `PORT` inherited
   * from whatever launched the test run (Solo, a hub ship gate, a plain shell
   * that exports it) moves the server somewhere playwright never looks. The
   * sync server then binds, say, :4056, the app proxies `/sync` to :4797,
   * every request is ECONNREFUSED, and the suite fails on the sync badge
   * instead of on anything it meant to check. Pinning the port in `env` is
   * what makes the managed case say the same number twice.
   */
  webServer: managesServers
    ? [
        ...(externalSyncOrigin
          ? []
          : [
              {
                command:
                  backend === "postgres"
                    ? "mix run --no-halt"
                    : "bun run tracker:server",
                cwd: backend === "postgres" ? trackerMixRoot : repoRoot,
                env:
                  backend === "postgres"
                    ? {
                        TRACKER_PORT: syncPort,
                        TRACKER_RESET_DATABASE: "1",
                        DATABASE_URL: process.env.DATABASE_URL ?? "",
                      }
                    : { TRACKER_PORT: syncPort },
                url: `http://127.0.0.1:${syncPort}/readyz`,
                reuseExistingServer: !process.env.CI,
                timeout: 30_000,
              },
            ]),
        {
          command: "bunx vite preview --config packages/tracker/vite.config.ts",
          cwd: repoRoot,
          env: {
            PORT: new URL(baseURL).port,
            TRACKER_SYNC_ORIGIN: syncOrigin,
          },
          url: baseURL,
          reuseExistingServer: !process.env.CI,
          timeout: 30_000,
        },
      ]
    : undefined,
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
});
