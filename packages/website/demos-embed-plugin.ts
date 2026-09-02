/**
 * Serves the demos embed build (packages/demos/dist-embed, built by
 * `bun run demos:embed` with base=/demos/ and in-browser sync) under the
 * website's /demos path:
 *
 *  - dev: a middleware with SPA fallback, so /demos/todos works on `bun run
 *    website` exactly like it will on the static host
 *  - build: copies the embed into dist/demos, producing the one deployable
 *    directory (/, /docs/, /demos/)
 *
 * The static host must apply the same fallback (unmatched /demos/* serves
 * /demos/index.html) — see PLAN.md.
 */
import { spawn } from 'node:child_process';
import { cpSync, existsSync, promises as fs } from 'node:fs';
import { extname, join, normalize, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { Plugin } from 'vite';

const here = (path: string) => fileURLToPath(new URL(path, import.meta.url));

const EMBED_DIR = here('../demos/dist-embed');

const CONTENT_TYPES: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript',
  '.mjs': 'text/javascript',
  '.css': 'text/css',
  '.json': 'application/json',
  '.map': 'application/json',
  '.wasm': 'application/wasm',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2',
  '.txt': 'text/plain; charset=utf-8'
};

/** Vite plugin: dev-serve and build-copy the demos embed at /demos. */
export function demosEmbed(): Plugin {
  return {
    name: 'wheel-demos-embed',
    configureServer(server) {
      // Hot embed: a `vite build --watch` child keeps dist-embed current with
      // the demos (and wheel) source while the website dev server runs, and a
      // change under dist-embed full-reloads any open /demos page (the served
      // index.html gets the vite client injected below). Not HMR — a rebuild
      // plus reload — which is exactly what a static embed can honestly do.
      if (process.env.WHEEL_DEMOS_EMBED_WATCH !== '0') {
        const watcher = spawn(
          'bunx',
          ['vite', 'build', '--watch', '--config', here('../demos/vite.config.ts'), '--outDir', 'dist-embed'],
          {
            env: { ...process.env, DEMOS_BASE: '/demos/', VITE_SYNC_MODE: 'browser' },
            stdio: 'ignore'
          }
        );
        server.httpServer?.once('close', () => watcher.kill());
      }
      server.watcher.add(EMBED_DIR);
      let reloadTimer: ReturnType<typeof setTimeout> | null = null;
      server.watcher.on('change', (file) => {
        if (!file.startsWith(EMBED_DIR)) return;
        // One reload per rebuild, not one per written chunk.
        if (reloadTimer) clearTimeout(reloadTimer);
        reloadTimer = setTimeout(() => server.ws.send({ type: 'full-reload' }), 150);
      });

      server.middlewares.use('/demos', (req, res, next) => {
        void (async () => {
          if (!existsSync(EMBED_DIR)) {
            res.statusCode = 503;
            res.setHeader('content-type', 'text/plain; charset=utf-8');
            res.end('demos embed not built — run: bun run demos:embed');
            return;
          }
          // connect strips the /demos mount prefix from req.url already.
          const urlPath = (req.url ?? '/').split('?')[0]!;
          const safePath = normalize(urlPath).replace(/^(\.\.[/\\])+/, '');
          let file = resolve(join(EMBED_DIR, safePath));
          const missing = !file.startsWith(EMBED_DIR) || !existsSync(file);
          if (missing && extname(file) !== '') {
            // An ASSET that is not there is a 404, never the SPA fallback.
            //
            // Falling through to index.html answered a missing
            // `annotate-system-<hash>.js` with a 200 and a page of HTML, and
            // the browser reported "Failed to fetch dynamically imported
            // module" — which reads like a network problem and is really a
            // stale hash: the page was loaded before a rebuild and is asking
            // for a chunk that no longer exists. A 404 says that.
            res.statusCode = 404;
            res.setHeader('content-type', 'text/plain; charset=utf-8');
            res.end(`${urlPath} is not in the demos embed — the page predates the last rebuild; reload it`);
            return;
          }
          if (missing || extname(file) === '') {
            // SPA fallback: every non-asset path is a route of the demos app.
            file = join(EMBED_DIR, 'index.html');
          }
          let body: Buffer | string = await fs.readFile(file);
          if (extname(file) === '.html') {
            // Wire the embed page into the dev server's reload channel: the
            // vite client connects back to this origin and honors the
            // full-reload the watcher above sends after each embed rebuild.
            body = body
              .toString('utf8')
              .replace('</head>', '  <script type="module" src="/@vite/client"></script>\n  </head>');
          }
          res.setHeader('content-type', CONTENT_TYPES[extname(file)] ?? 'application/octet-stream');
          res.end(body);
        })().catch(next);
      });
    },
    closeBundle() {
      if (!existsSync(EMBED_DIR)) {
        this.warn('demos embed not built (run: bun run demos:embed) — dist/demos omitted');
        return;
      }
      cpSync(EMBED_DIR, here('./dist/demos'), { recursive: true });
    }
  };
}
