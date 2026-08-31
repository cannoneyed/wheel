import { fileURLToPath } from "node:url";
import { defineConfig, devices } from "@playwright/test";

import { TEST_PORTS, testOrigin } from "../../scripts/test-ports";

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

/**
 * The suite starts its own tracker and its own sync server, on ports reserved
 * for tests.
 *
 * It used to resolve a portless route first and attach to whatever had claimed
 * `wheel-tracker-preview` — which may be a different checkout. See AGENTS.md,
 * "portless is for humans, not for machines".
 *
 * Two doors remain, both explicit. `TRACKER_BROWSER_SYNC_ORIGIN` names a
 * backend the suite did not start (CI publishes the Elixir container on a
 * random host port). `TRACKER_BROWSER_BASE_URL` names the app itself; global
 * setup then verifies it is this checkout.
 */
const syncPort =
  backend === "postgres" ? TEST_PORTS.trackerSyncPostgres : TEST_PORTS.trackerSync;
const externalSyncOrigin = process.env.TRACKER_BROWSER_SYNC_ORIGIN;
const syncOrigin = externalSyncOrigin ?? testOrigin(syncPort);
const override = process.env.TRACKER_BROWSER_BASE_URL;
const baseURL = override ?? testOrigin(TEST_PORTS.trackerPreview);

export default defineConfig({
  testDir: "./browser",
  fullyParallel: false,
  workers: 1,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? "github" : "line",
  globalSetup: fileURLToPath(
    new URL("../../scripts/verify-server-identity.ts", import.meta.url),
  ),
  use: {
    ...devices["Desktop Chrome"],
    baseURL,
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    ignoreHTTPSErrors: true,
  },
  /**
   * Each server is told its port explicitly, and the app is told where its
   * backend is with `TRACKER_SYNC_ORIGIN` — otherwise the preview would
   * resolve the sync server through portless and proxy the suite's requests to
   * a human's dev backend.
   *
   * `reuseExistingServer` is false on purpose: adopting a stranger's server is
   * the failure this config exists to prevent, so a taken port must stop the
   * run rather than quietly change what is under test.
   */
  webServer: override
    ? undefined
    : [
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
                        TRACKER_PORT: String(syncPort),
                        TRACKER_RESET_DATABASE: "1",
                        DATABASE_URL: process.env.DATABASE_URL ?? "",
                      }
                    : { TRACKER_PORT: String(syncPort) },
                url: `${syncOrigin}/readyz`,
                reuseExistingServer: false,
                timeout: 30_000,
              },
            ]),
        {
          command: "bunx vite preview --config packages/tracker/vite.config.ts",
          cwd: repoRoot,
          env: {
            PORT: String(TEST_PORTS.trackerPreview),
            TRACKER_SYNC_ORIGIN: syncOrigin,
          },
          url: baseURL,
          reuseExistingServer: false,
          timeout: 30_000,
        },
      ],
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
});
