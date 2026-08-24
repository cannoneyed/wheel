import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vite';
import solid from 'vite-plugin-solid';

// Relative import on purpose: vite configs resolve through node (dist), not
// the wheel-from-source aliases below — the relative path keeps the plugin
// live-editable like the rest of the library.
import { wheelDevTools } from '../wheel/src/vite/index';

const here = (path: string) => fileURLToPath(new URL(path, import.meta.url));

export default defineConfig({
  root: here('.'),
  resolve: {
    alias: [
      { find: /^node:module$/, replacement: here('./src/shims/node-module.ts') },
      { find: /^node:path$/, replacement: here('./src/shims/node-path.ts') },
      { find: /^wheel\/core$/, replacement: here('../wheel/src/core/index.ts') },
      { find: /^wheel\/debug$/, replacement: here('../wheel/src/debug/index.ts') },
      { find: /^wheel\/annotate$/, replacement: here('../wheel/src/annotate/index.ts') },
      { find: /^wheel\/sync\/server$/, replacement: here('../wheel/src/sync/server/index.ts') },
      { find: /^wheel\/sync$/, replacement: here('../wheel/src/sync/index.ts') },
      { find: /^wheel\/testing$/, replacement: here('../wheel/src/testing/index.ts') },
      { find: /^wheel\/components$/, replacement: here('../wheel/src/components/index.ts') },
      {
        find: /^wheel\/components\/styles$/,
        replacement: here('../wheel/src/components/styles/index.css')
      },
      // Public deep component imports must resolve from source too. Falling
      // through to the workspace package requires a prior Wheel build.
      {
        find: /^wheel\/components\/(.+)$/,
        replacement: `${here('../wheel/src/components')}/$1/index.ts`
      },
      { find: /^wheel\/styles$/, replacement: here('../wheel/src/styles/tokens.css') },
      // Resolve wheel from source — no build step between editing the library
      // and seeing the sandboxes update.
      { find: /^wheel\/solid$/, replacement: here('../wheel/src/solid/index.ts') },
      { find: /^wheel\/testing$/, replacement: here('../wheel/src/testing/index.ts') },
      { find: /^wheel$/, replacement: here('../wheel/src/index.ts') }
    ]
  },
  plugins: [solid(), wheelDevTools()],
  optimizeDeps: {
    // SQLite ships WASM loaded via import.meta.url; esbuild prebundling
    // breaks those asset URLs. Serve it unbundled.
    exclude: ['@sqlite.org/sqlite-wasm']
  },
  // PORT is how portless (and any other supervisor) assigns a free port;
  // the literal is the fallback (4791 — 4790 is the website's).
  server: { port: Number(process.env.PORT) || 4791 }
});
