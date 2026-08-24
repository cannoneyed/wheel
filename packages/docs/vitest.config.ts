import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';
import solid from 'vite-plugin-solid';

import { docsContentAliases, docsExamplePlugin, docsMdxPlugin } from './vite.mdx';

const here = (path: string) => fileURLToPath(new URL(path, import.meta.url));

export default defineConfig({
  resolve: {
    alias: [
      // Pin solid's browser dev builds — the node-condition SSR builds are
      // inert (no reactivity, no DOM rendering) and jsdom tests need both.
      { find: /^solid-js\/web$/, replacement: here('../../node_modules/solid-js/web/dist/dev.js') },
      { find: /^solid-js\/store$/, replacement: here('../../node_modules/solid-js/store/dist/dev.js') },
      { find: /^solid-js$/, replacement: here('../../node_modules/solid-js/dist/dev.js') },
      ...docsContentAliases(),
      { find: /^wheel\/auth$/, replacement: here('../wheel/src/auth/index.ts') },
      { find: /^wheel\/config$/, replacement: here('../wheel/src/config/index.ts') },
      { find: /^wheel\/core$/, replacement: here('../wheel/src/core/index.ts') },
      { find: /^wheel\/sync\/server$/, replacement: here('../wheel/src/sync/server/index.ts') },
      { find: /^wheel\/sync$/, replacement: here('../wheel/src/sync/index.ts') },
      { find: /^wheel\/kit$/, replacement: here('../wheel/src/kit/index.ts') },
      { find: /^wheel\/router$/, replacement: here('../wheel/src/router/index.ts') },
      { find: /^wheel\/debug$/, replacement: here('../wheel/src/debug/index.ts') },
      { find: /^wheel\/testing$/, replacement: here('../wheel/src/testing/index.ts') },
      { find: /^wheel\/vite$/, replacement: here('../wheel/src/vite/index.ts') },
      { find: /^wheel\/styles$/, replacement: here('../wheel/src/styles/tokens.css') }
    ]
  },
  // Same shared MDX pipeline as the site builds — the smoke test exercises
  // exactly what ships.
  plugins: [docsExamplePlugin(), docsMdxPlugin(), solid({ extensions: ['.mdx'] })],
  test: {
    include: [here('src/**/*.test.{ts,tsx}')],
    environment: 'jsdom'
  }
});
