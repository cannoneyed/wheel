import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vite';
import solid from 'vite-plugin-solid';

import { wheelDevTools } from '../wheel/src/vite/index';
import { portlessOriginOr } from '../../scripts/portless';

const here = (path: string) => fileURLToPath(new URL(path, import.meta.url));
const wheelFromSource = [
  { find: /^wheel\/core$/, replacement: here('../wheel/src/core/index.ts') },
  { find: /^wheel\/sync\/server$/, replacement: here('../wheel/src/sync/server/index.ts') },
  { find: /^wheel\/sync$/, replacement: here('../wheel/src/sync/index.ts') },
  { find: /^wheel\/debug$/, replacement: here('../wheel/src/debug/index.ts') },
  { find: /^wheel\/styles$/, replacement: here('../wheel/src/styles/tokens.css') }
];

const syncOrigin =
  process.env.ROUNDS_SYNC_ORIGIN ?? portlessOriginOr('wheel-rounds-sync', 'http://localhost:4802');

export default defineConfig({
  root: here('.'),
  resolve: { alias: wheelFromSource },
  plugins: [solid(), wheelDevTools({ devModeInBuild: process.env.WHEEL_BROWSER_DEV_MODE === '1' })],
  server: {
    port: Number(process.env.PORT) || 4803,
    host: process.env.HOST || '127.0.0.1',
    proxy: { '/sync/': { target: syncOrigin, changeOrigin: true, ws: true, rewriteWsOrigin: true } }
  },
  preview: {
    port: Number(process.env.PORT) || 4803,
    host: process.env.HOST || '127.0.0.1',
    proxy: { '/sync/': { target: syncOrigin, changeOrigin: true, ws: true, rewriteWsOrigin: true } }
  }
});
