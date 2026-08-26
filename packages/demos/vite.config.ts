import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vite';
import solid from 'vite-plugin-solid';

// Relative import on purpose: vite configs resolve through node (dist), not
// the wheel-from-source aliases below — the relative path keeps the plugin
// live-editable like the rest of the library.
import { wheelDevTools } from '../wheel/src/vite/index';
import { portlessOriginOr } from '../../scripts/portless';

const here = (path: string) => fileURLToPath(new URL(path, import.meta.url));

/**
 * Everything under /sync is the demo server (server.ts, port 4795); every
 * other path is the app, so the router owns /todos, /kanban, /router/... and
 * vite's SPA fallback serves index.html for all of them.
 */
const ENGINES = ['/sync'];

/**
 * Where the demo sync server actually is. portless assigns it a free port
 * (`portless wheel-demos-sync bun run demos:server`); the literal is the
 * fallback for a plain `bun run demos:server`. Resolved at config load, so
 * restarting the sync server on a new port means restarting vite too.
 */
const SYNC_ORIGIN =
  // A machine says which backend it means. This server is started BY the
  // browser suite as well as by a human, and only a human should resolve a
  // portless route (AGENTS.md, "portless is for humans, not for machines") —
  // otherwise a test's preview proxies its requests to a dev backend.
  process.env.DEMOS_SYNC_ORIGIN ?? portlessOriginOr('wheel-demos-sync', 'http://localhost:4795');

/**
 * wheel from source — edit the library, watch the demos hot-reload. Without
 * these, `wheel/*` resolves through package.json exports to `dist/`, so library
 * edits only appear after a rebuild. One entry per public subpath; the exact
 * anchors keep `wheel/sync` from shadowing `wheel/sync/server`.
 */
/**
 * The in-browser sync worker bundles wheel's server engine, whose sqlite
 * seam imports two node builtins at module load. The shims satisfy those
 * imports for browser bundles; the native code paths behind them are never
 * invoked (the worker injects the WASM driver, see shared/in-browser/).
 */
const nodeShims = [
  { find: /^node:module$/, replacement: here('./src/shared/in-browser/shims/node-module.ts') },
  { find: /^node:path$/, replacement: here('./src/shared/in-browser/shims/node-path.ts') }
];

const wheelFromSource = [
  { find: /^wheel\/auth$/, replacement: here('../wheel/src/auth/index.ts') },
  { find: /^wheel\/config$/, replacement: here('../wheel/src/config/index.ts') },
  { find: /^wheel\/core$/, replacement: here('../wheel/src/core/index.ts') },
  { find: /^wheel\/sync\/server$/, replacement: here('../wheel/src/sync/server/index.ts') },
  { find: /^wheel\/sync$/, replacement: here('../wheel/src/sync/index.ts') },
  { find: /^wheel\/kit$/, replacement: here('../wheel/src/kit/index.ts') },
  { find: /^wheel\/router$/, replacement: here('../wheel/src/router/index.ts') },
  { find: /^wheel\/debug$/, replacement: here('../wheel/src/debug/index.ts') },
  { find: /^wheel\/testing$/, replacement: here('../wheel/src/testing/index.ts') },
  { find: /^wheel\/styles$/, replacement: here('../wheel/src/styles/tokens.css') },
  { find: /^wheel\/components$/, replacement: here('../wheel/src/components/index.ts') },
  {
    find: /^wheel\/components\/styles$/,
    replacement: here('../wheel/src/components/styles/index.css')
  },
];

const engineProxy = Object.fromEntries(
  ENGINES.map((prefix) => [prefix, { target: SYNC_ORIGIN, changeOrigin: false, ws: true }])
);

export default defineConfig({
  root: here('.'),
  // The embed build (bun run demos:embed) serves the whole app under the
  // website's /demos/ path; the router follows via basedHistoryOverride,
  // which reads the same value back from import.meta.env.BASE_URL.
  base: process.env.DEMOS_BASE || '/',
  resolve: { alias: [...nodeShims, ...wheelFromSource] },
  plugins: [solid(), wheelDevTools()],
  // The sync worker uses module imports (wheel engine + sqlite-wasm chunks).
  worker: { format: 'es' },
  // sqlite-wasm locates its .wasm next to its own JS via import.meta.url;
  // esbuild pre-bundling would break that URL, so it opts out.
  optimizeDeps: { exclude: ['@sqlite.org/sqlite-wasm'] },
  // `vite preview` is what the browser suite runs against: it applies the SPA
  // fallback (every unmatched path serves index.html) that path routing needs
  // from any real host, and proxies the engines the same way dev does.
  preview: {
    // PREVIEW_PORT is the explicit override; PORT is what portless (and any
    // other supervisor) assigns — honoring it is what makes
    // `portless wheel-demos-preview … preview` reachable instead of a 502,
    // since portless proxies to the port it handed us. Literal is the
    // fallback for a plain `bun run --cwd packages/demos preview`.
    port: Number(process.env.PREVIEW_PORT) || Number(process.env.PORT) || 4794,
    host: process.env.HOST || '127.0.0.1',
    proxy: engineProxy
  },
  server: {
    // PORT is how portless (and any other proxy) assigns a port; the literal is
    // the stable fallback for a plain `bun run demos`.
    port: Number(process.env.PORT) || 4796,
    // Vite's default host resolves to ::1 only, which a proxy dialing 127.0.0.1
    // cannot reach (portless 502s). Bind IPv4 explicitly.
    host: process.env.HOST || '127.0.0.1',
    proxy: engineProxy
  }
});
