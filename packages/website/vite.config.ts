import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vite';
import solid from 'vite-plugin-solid';

import { docsContentAliases, docsExamplePlugin, docsMdxPlugin } from '../docs/vite.mdx';
// Relative import on purpose: vite configs resolve through node, not the
// wheel-from-source aliases below (same stance as the demos config).
import { wheelDevTools } from '../wheel/src/vite/index';
import { demosEmbed } from './demos-embed-plugin';
import { robotDocs } from './robot-docs-plugin';

const here = (path: string) => fileURLToPath(new URL(path, import.meta.url));

/**
 * The landing page's live figure runs a real wheel sync engine in a worker, and
 * that engine's sqlite seam imports two node builtins at module load. The shims
 * satisfy those imports for a browser bundle; the native paths behind them are
 * never taken, because the worker injects the WASM driver. Same three lines as
 * the demos config, for the same reason.
 */
const nodeShims = [
  {
    find: /^node:module$/,
    replacement: here('../demos/src/shared/in-browser/shims/node-module.ts')
  },
  { find: /^node:path$/, replacement: here('../demos/src/shared/in-browser/shims/node-path.ts') }
];

export default defineConfig({
  root: here('.'),
  resolve: {
    // Resolve wheel from source, same as docs/demos — the docs pages this site
    // embeds (and any future inline demos) run against the working tree, not a
    // stale dist build. One entry per public subpath; the exact anchors keep
    // `wheel/sync` from shadowing `wheel/sync/server`.
    alias: [
      ...nodeShims,
      ...docsContentAliases(),
      // The landing page's prose lives in `content/website/`, beside the docs
      // pages, and reaches this package's section components through
      // `@website/*` — the same arrangement `@docs/*` gives the docs content,
      // so neither body of prose encodes which app is building it.
      { find: /^@website\//, replacement: `${here('./src')}/` },
      { find: /^wheel\/auth$/, replacement: here('../wheel/src/auth/index.ts') },
      { find: /^wheel\/config$/, replacement: here('../wheel/src/config/index.ts') },
      { find: /^wheel\/core$/, replacement: here('../wheel/src/core/index.ts') },
      { find: /^wheel\/sync\/server$/, replacement: here('../wheel/src/sync/server/index.ts') },
      { find: /^wheel\/sync$/, replacement: here('../wheel/src/sync/index.ts') },
      { find: /^wheel\/kit$/, replacement: here('../wheel/src/kit/index.ts') },
      { find: /^wheel\/router$/, replacement: here('../wheel/src/router/index.ts') },
      { find: /^wheel\/debug$/, replacement: here('../wheel/src/debug/index.ts') },
      { find: /^wheel\/testing$/, replacement: here('../wheel/src/testing/index.ts') },
      { find: /^wheel\/components$/, replacement: here('../wheel/src/components/index.ts') },
      {
        find: /^wheel\/components\/styles$/,
        replacement: here('../wheel/src/components/styles/index.css')
      },
      { find: /^wheel\/styles$/, replacement: here('../wheel/src/styles/tokens.css') },
    ]
  },
  // The shared docs MDX pipeline (frontmatter + dual-theme shiki) renders both
  // the /docs pages and the landing page's code snippets, so highlighting is
  // identical across the site by construction.
  // wheelDevTools: service identity IS the class name; without its keepNames
  // the production build minifies services to `class So` and the debug panel
  // in embedded live demos goes illegible.
  plugins: [docsExamplePlugin(), docsMdxPlugin(), solid({ extensions: ['.mdx'] }), demosEmbed(), robotDocs(), wheelDevTools()],
  // The live figure's sync worker uses module imports (wheel engine + sqlite chunks).
  worker: { format: 'es' },
  // sqlite-wasm locates its .wasm next to its own JS via import.meta.url;
  // esbuild pre-bundling would break that URL, so it opts out.
  optimizeDeps: { exclude: ['@sqlite.org/sqlite-wasm'] },
  build: {
    rollupOptions: {
      // Two pages, one build: the landing scroll at / and the embedded docs
      // shell at /docs/. Vite's dev server maps /docs/ to docs/index.html
      // automatically; static hosts serve the emitted docs/index.html the same way.
      input: {
        main: here('./index.html'),
        docs: here('./docs/index.html'),
        components: here('./components/index.html')
      }
    }
  },
  // PORT is how portless (and any other proxy) assigns a port; the literal is
  // the stable fallback for a plain `bun run website`. Vite's default host
  // resolves to ::1 only, which a proxy dialing 127.0.0.1 cannot reach.
  server: { port: Number(process.env.PORT) || 4790, host: process.env.HOST || '127.0.0.1' }
});
