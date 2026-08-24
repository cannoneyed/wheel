import { fileURLToPath } from 'node:url';

import { cloudflareTest } from '@cloudflare/vitest-plugin';
import { defineConfig } from 'vitest/config';

const root = (path: string) => fileURLToPath(new URL(`../${path}`, import.meta.url));

export default defineConfig({
  resolve: {
    alias: [
      {
        find: /^wheel\/sync\/server\/cloudflare$/,
        replacement: root('packages/wheel/src/sync/server/cloudflare.ts')
      },
      {
        find: /^wheel\/sync\/server$/,
        replacement: root('packages/wheel/src/sync/server/index.ts')
      },
      {
        find: /^wheel\/sync$/,
        replacement: root('packages/wheel/src/sync/index.ts')
      },
      {
        find: /^wheel\/auth$/,
        replacement: root('packages/wheel/src/auth/index.ts')
      }
    ]
  },
  plugins: [
    cloudflareTest({
      wrangler: { configPath: root('wrangler.test.jsonc') }
    })
  ],
  test: {
    include: ['cloudflare/**/*.worker.test.ts'],
    testTimeout: 30_000
  }
});
