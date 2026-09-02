import { fileURLToPath } from 'node:url';

import { defineConfig } from 'vite';
import solid from 'vite-plugin-solid';

import { docsContentAliases, docsExamplePlugin, docsMdxPlugin } from './vite.mdx';
// Relative import on purpose: vite configs resolve through node, not the
// wheel-from-source aliases below (same stance as the demos config).
import { wheelDevTools } from '../wheel/src/vite/index';

const here = (path: string) => fileURLToPath(new URL(path, import.meta.url));

export default defineConfig({
  root: here('.'),
  resolve: {
    // Resolve wheel from source — no build step between editing the library and
    // seeing the docs demos update. Without these, `wheel/*` resolves through
    // package.json exports to `dist/`. One entry per public subpath; the exact
    // anchors keep `wheel/sync` from shadowing `wheel/sync/server`.
    alias: [
      ...docsContentAliases(),
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
      { find: /^wheel\/vite$/, replacement: here('../wheel/src/vite/index.ts') },
      { find: /^wheel\/styles$/, replacement: here('../wheel/src/styles/tokens.css') }
    ]
  },
  // The shared docs MDX pipeline (frontmatter + dual-theme shiki) — the same
  // factory the website and the docs vitest run use, so content renders
  // identically everywhere.
  // wheelDevTools: service identity IS the class name; without its keepNames
  // the production build minifies services to `class So` and the debug panel
  // in embedded live demos goes illegible.
  plugins: [docsExamplePlugin(), docsMdxPlugin(), solid({ extensions: ['.mdx'] }), wheelDevTools()],
  // PORT is how portless (and any other proxy) assigns a port; the literal is
  // the stable fallback for a plain `bun run docs`. Vite's default host resolves
  // to ::1 only, which a proxy dialing 127.0.0.1 cannot reach (portless 502s).
  server: { port: Number(process.env.PORT) || 4780, host: process.env.HOST || '127.0.0.1' }
});
