// wheel-keep-names: The isolated component catalog does not instantiate Wheel services.
import { fileURLToPath } from 'node:url';
import { defineConfig, type Plugin } from 'vite';
import solid from 'vite-plugin-solid';

import { componentSpecSource } from './component-spec-plugin';

const here = (path: string) => fileURLToPath(new URL(path, import.meta.url));

function singleFileAudit(): Plugin {
  return {
    name: 'single-file-component-audit',
    enforce: 'post',
    generateBundle(_options, bundle) {
      const htmlEntry = Object.values(bundle).find(
        (entry) => entry.type === 'asset' && entry.fileName.endsWith('.html'),
      );
      if (!htmlEntry || htmlEntry.type !== 'asset') {
        throw new Error('The component audit build did not emit HTML.');
      }

      let html = String(htmlEntry.source);
      for (const [fileName, entry] of Object.entries(bundle)) {
        if (entry === htmlEntry) {
          continue;
        }
        const escapedName = fileName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        if (entry.type === 'chunk') {
          html = html.replace(
            new RegExp(`<script[^>]+src=["'][^"']*${escapedName}["'][^>]*></script>`),
            () => `<script type="module">${entry.code}</script>`,
          );
        } else if (fileName.endsWith('.css')) {
          html = html.replace(
            new RegExp(`<link[^>]+href=["'][^"']*${escapedName}["'][^>]*>`),
            () => `<style>${String(entry.source)}</style>`,
          );
        }
        delete bundle[fileName];
      }
      htmlEntry.source = html;
    },
  };
}

export default defineConfig({
  root: here('.'),
  resolve: {
    alias: [
      { find: /^wheel\/core$/, replacement: here('../wheel/src/core/index.ts') },
      { find: /^wheel\/components$/, replacement: here('../wheel/src/components/index.ts') },
      {
        find: /^wheel\/components\/styles$/,
        replacement: here('../wheel/src/components/styles/index.css'),
      },
      {
        find: /^wheel\/components\/(.+)$/,
        replacement: `${here('../wheel/src/components')}/$1/index.ts`,
      },
      // Resolved from SOURCE, like every alias above it. Without this the
      // import falls through to the package export, which points into
      // packages/wheel/dist — present on a machine that has built wheel, absent
      // on a clean CI checkout, so the audit bundle built locally and failed
      // there.
      { find: /^wheel\/styles$/, replacement: here('../wheel/src/styles/tokens.css') },
    ],
  },
  plugins: [componentSpecSource(), solid(), singleFileAudit()],
  build: {
    assetsInlineLimit: Number.POSITIVE_INFINITY,
    cssCodeSplit: false,
    outDir: 'dist-audit',
    emptyOutDir: true,
    rollupOptions: { input: here('audit.html') },
  },
  server: { port: Number(process.env.COMPONENT_CATALOG_PORT) || 4796 },
});
