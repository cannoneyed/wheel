import { fileURLToPath } from 'node:url';
import { defineProject } from 'vitest/config';
import solid from 'vite-plugin-solid';

export default defineProject({
  // Direct listeners keep JSX modules safe to import in Node-only tests.
  plugins: [solid({ solid: { delegateEvents: false } })],
  resolve: {
    conditions: ['development', 'browser'],
    dedupe: ['solid-js'],
    alias: [
      // Wheel from source for demo/tracker tests. Every subpath must use the
      // same source tree so cross-entry class identity remains stable.
      { find: /^wheel\/auth$/, replacement: source('./packages/wheel/src/auth/index.ts') },
      { find: /^wheel\/config$/, replacement: source('./packages/wheel/src/config/index.ts') },
      { find: /^wheel\/core$/, replacement: source('./packages/wheel/src/core/index.ts') },
      {
        find: /^wheel\/sync\/server$/,
        replacement: source('./packages/wheel/src/sync/server/index.ts'),
      },
      {
        find: /^wheel\/sync\/server\/cloudflare$/,
        replacement: source('./packages/wheel/src/sync/server/cloudflare.ts'),
      },
      { find: /^wheel\/sync$/, replacement: source('./packages/wheel/src/sync/index.ts') },
      { find: /^wheel\/kit$/, replacement: source('./packages/wheel/src/kit/index.ts') },
      {
        find: /^wheel\/components$/,
        replacement: source('./packages/wheel/src/components/index.ts'),
      },
      { find: /^wheel\/router$/, replacement: source('./packages/wheel/src/router/index.ts') },
      { find: /^wheel\/debug$/, replacement: source('./packages/wheel/src/debug/index.ts') },
      {
        find: /^wheel\/testing\/playwright$/,
        replacement: source('./packages/wheel/src/testing/playwright.ts'),
      },
      { find: /^wheel\/testing$/, replacement: source('./packages/wheel/src/testing/index.ts') },
    ],
  },
  test: {
    name: 'node',
    environment: 'node',
    setupFiles: ['./test/vitest-setup.ts'],
    include: [
      'packages/wheel/src/**/*.test.{ts,tsx}',
      'packages/wheel/eslint/**/*.test.mjs',
      'packages/demos/src/**/*.test.{ts,tsx}',
      'packages/tracker/**/*.test.{ts,tsx}',
      'scripts/ci/**/*.test.ts',
    ],
    exclude: ['packages/wheel/src/components/**/*.test.{ts,tsx}'],
    testTimeout: 30_000,
    hookTimeout: 30_000,
    typecheck: {
      enabled: true,
      include: ['packages/wheel/src/**/*.test-d.ts'],
      tsconfig: './tsconfig.typecheck.json',
    },
  },
});

function source(path: string): string {
  return fileURLToPath(new URL(path, import.meta.url));
}
