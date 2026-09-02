import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vite';
import solid from 'vite-plugin-solid';

import { portlessOriginOr } from '../../scripts/portless';
import { wheelDevTools } from '../wheel/src/vite/index';

const here = (path: string) => fileURLToPath(new URL(path, import.meta.url));
const wheelFromSource = [
  { find: /^wheel\/core$/, replacement: here('../wheel/src/core/index.ts') },
  { find: /^wheel\/sync$/, replacement: here('../wheel/src/sync/index.ts') },
  { find: /^wheel\/debug$/, replacement: here('../wheel/src/debug/index.ts') },
  { find: /^wheel\/annotate$/, replacement: here('../wheel/src/annotate/index.ts') },
  { find: /^wheel\/styles$/, replacement: here('../wheel/src/styles/tokens.css') }
];
const syncOrigin = process.env.SPOKE_SYNC_ORIGIN ?? portlessOriginOr('wheel-spoke-sync', 'http://localhost:4806');
const proxy = {
  '/sync/': { target: syncOrigin, changeOrigin: true, ws: true, rewriteWsOrigin: true },
  '/bot/': { target: syncOrigin, changeOrigin: true }
};

export default defineConfig({
  root: here('.'),
  resolve: { alias: wheelFromSource },
  plugins: [solid(), wheelDevTools({ devModeInBuild: process.env.WHEEL_BROWSER_DEV_MODE === '1' })],
  build: { outDir: 'dist', emptyOutDir: true },
  server: { port: Number(process.env.PORT) || 4807, host: process.env.HOST || '127.0.0.1', proxy },
  preview: { port: Number(process.env.PORT) || 4807, host: process.env.HOST || '127.0.0.1', proxy }
});
