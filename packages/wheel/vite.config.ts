import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vite';
import solid from 'vite-plugin-solid';

import { wheelSourceStamp } from './src/vite/source-stamp';

const source = (path: string) => fileURLToPath(new URL(`./src/${path}`, import.meta.url));
const packageRoot = fileURLToPath(new URL('.', import.meta.url));
const buildStamp = wheelSourceStamp(packageRoot);

const componentFamilies = [
  'accordion',
  'alert-dialog',
  'autocomplete',
  'avatar',
  'button',
  'checkbox',
  'checkbox-group',
  'collapsible',
  'combobox',
  'context-menu',
  'dialog',
  'drawer',
  'field',
  'fieldset',
  'form',
  'input',
  'menu',
  'menubar',
  'meter',
  'navigation-menu',
  'number-field',
  'otp-field',
  'popover',
  'preview-card',
  'progress',
  'radio',
  'radio-group',
  'scroll-area',
  'select',
  'separator',
  'slider',
  'switch',
  'tabs',
  'toast',
  'toggle',
  'toggle-group',
  'toolbar',
  'tooltip'
] as const;

const componentInputs = Object.fromEntries(
  componentFamilies.map((family) => [`components/${family}/index`, source(`components/${family}/index.ts`)])
);

const externalPackages = [
  '@floating-ui/dom',
  '@floating-ui/utils',
  'immer',
  'solid-js',
  'zod'
];

export default defineConfig(({ mode }) => {
  const nodeBuild = mode === 'node';
  return {
    plugins: [solid({ ssr: nodeBuild })],
    define: {
      'globalThis.__WHEEL_BUILD_STAMP__': JSON.stringify(buildStamp)
    },
    build: {
      target: 'es2022',
      ssr: nodeBuild,
      outDir: nodeBuild ? 'dist/node' : 'dist/browser',
      emptyOutDir: false,
      copyPublicDir: false,
      minify: false,
      sourcemap: false,
      rollupOptions: {
        preserveEntrySignatures: 'strict',
        input: {
          'auth/index': source('auth/index.ts'),
          'config/index': source('config/index.ts'),
          'core/index': source('core/index.ts'),
          'sync/index': source('sync/index.ts'),
          'sync/server/index': source('sync/server/index.ts'),
          'sync/server/cloudflare': source('sync/server/cloudflare.ts'),
          'sync/server/testing': source('sync/server/testing.ts'),
          'kit/index': source('kit/index.ts'),
          'components/index': source('components/index.ts'),
          ...componentInputs,
          'router/index': source('router/index.ts'),
          'debug/index': source('debug/index.ts'),
          'testing/index': source('testing/index.ts'),
          ...(nodeBuild ? { 'testing/playwright': source('testing/playwright.ts') } : {}),
          'vite/index': source('vite/index.ts')
        },
        external: (id) =>
          id.startsWith('node:') ||
          externalPackages.some((name) => id === name || id.startsWith(`${name}/`)),
        output: {
          entryFileNames: '[name].js',
          chunkFileNames: '_chunks/[name]-[hash].js'
        }
      }
    }
  };
});
