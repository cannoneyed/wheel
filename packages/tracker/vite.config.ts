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
 * wheel from source — edit the library, watch the tracker hot-reload. Without
 * these, `wheel/*` resolves through package.json exports to `dist/`, so library
 * edits only appear after a rebuild. One entry per public subpath; the exact
 * anchors keep `wheel/sync` from shadowing `wheel/sync/server`.
 */
const wheelFromSource = [
  { find: /^wheel\/auth$/, replacement: here('../wheel/src/auth/index.ts') },
  { find: /^wheel\/config$/, replacement: here('../wheel/src/config/index.ts') },
  { find: /^wheel\/core$/, replacement: here('../wheel/src/core/index.ts') },
  { find: /^wheel\/sync\/server$/, replacement: here('../wheel/src/sync/server/index.ts') },
  { find: /^wheel\/sync$/, replacement: here('../wheel/src/sync/index.ts') },
  { find: /^wheel\/kit$/, replacement: here('../wheel/src/kit/index.ts') },
  { find: /^wheel\/router$/, replacement: here('../wheel/src/router/index.ts') },
  { find: /^wheel\/debug$/, replacement: here('../wheel/src/debug/index.ts') },
  { find: /^wheel\/annotate$/, replacement: here('../wheel/src/annotate/index.ts') },
  { find: /^wheel\/testing$/, replacement: here('../wheel/src/testing/index.ts') },
  { find: /^wheel\/styles$/, replacement: here('../wheel/src/styles/tokens.css') },
];

/**
 * Where the tracker sync server actually is. portless assigns it a free
 * port (`portless wheel-tracker-sync bun run tracker:server`); the literal
 * is the fallback for a plain `bun run tracker:server`.
 */
const SYNC_ORIGIN =
  // A machine says which backend it means. This server is started BY the
  // browser suite as well as by a human, and only a human should resolve a
  // portless route (AGENTS.md, "portless is for humans, not for machines") —
  // otherwise a test's preview proxies its requests to a dev backend.
  process.env.TRACKER_SYNC_ORIGIN ??
  portlessOriginOr('wheel-tracker-sync', 'http://localhost:4797');

export default defineConfig({
  root: here('.'),
  resolve: { alias: wheelFromSource },
  plugins: [solid(), wheelDevTools({ devModeInBuild: process.env.WHEEL_BROWSER_DEV_MODE === '1' })],
  server: {
    // PORT is how portless (and any other proxy) assigns a port; the literal is
    // the stable fallback for a plain `bun run tracker`.
    port: Number(process.env.PORT) || 4798,
    // Vite's default host resolves to ::1 only, which a proxy dialing 127.0.0.1
    // cannot reach (portless 502s). Bind IPv4 explicitly.
    host: process.env.HOST || '127.0.0.1',
    // The engine serves /sync/* (renamed from /live/* in 011 phase 2).
    proxy: {
      '/sync/': {
        target: SYNC_ORIGIN,
        changeOrigin: true,
        ws: true,
        // The browser uses the app origin. The internal HTTP hop may use a
        // different scheme or port, so present the trusted proxy target as
        // the WebSocket origin for the server's same-origin check.
        rewriteWsOrigin: true
      }
    }
  },
  preview: {
    port: Number(process.env.PORT) || 4798,
    host: process.env.HOST || '127.0.0.1',
    proxy: {
      '/sync/': { target: SYNC_ORIGIN, changeOrigin: true, ws: true, rewriteWsOrigin: true }
    }
  }
});
