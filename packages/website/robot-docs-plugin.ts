/**
 * Publishes the robot documentation (content/robots) as static assets:
 *
 *  - `/llms.txt` — the index agents look for by convention, at the root
 *  - `/robots/**.md` — every page it links to, plain markdown
 *
 * Robot docs are a served surface, not a repo-local artifact. An agent given
 * `https://wheel.dev/llms.txt` has to walk the whole tree from there, and the
 * index is served from the ROOT while the pages it names are one directory
 * down — so its sibling-relative links (`overview.md`, the shape that works in
 * a checkout and that the contract test resolves) are rewritten to `/robots/`
 * paths on the way out. The source file stays navigable in an editor.
 *
 * dev and build go through the same two functions, so `bun run website` serves
 * exactly what the static host will.
 */
import { cpSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, extname, join, normalize, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { Plugin } from 'vite';

const here = (path: string) => fileURLToPath(new URL(path, import.meta.url));

const ROBOTS_DIR = here('../../content/robots');
const INDEX_FILE = join(ROBOTS_DIR, 'llms.txt');

/** Markdown and text served as-is; an agent fetches, it does not render. */
const CONTENT_TYPES: Record<string, string> = {
  '.md': 'text/markdown; charset=utf-8',
  '.txt': 'text/plain; charset=utf-8'
};

/**
 * `[Overview](overview.md)` in the checkout becomes `[Overview](/robots/overview.md)`
 * on the site, where the index is served a directory above the pages.
 */
function siteIndex(): string {
  return readFileSync(INDEX_FILE, 'utf8').replace(
    /\]\((?!https?:|\/)([^)]+)\)/g,
    '](/robots/$1)'
  );
}

/** Vite plugin: serve content/robots at /llms.txt and /robots/**. */
export function robotDocs(): Plugin {
  return {
    name: 'wheel-robot-docs',
    configureServer(server) {
      server.middlewares.use((request, response, next) => {
        const path = normalize(decodeURIComponent((request.url ?? '/').split('?')[0]!));
        if (path === '/llms.txt') {
          response.setHeader('content-type', CONTENT_TYPES['.txt']!);
          response.end(siteIndex());
          return;
        }
        if (!path.startsWith('/robots/')) {
          return next();
        }
        // `normalize` has already collapsed `..`; a path that still escapes the
        // prefix is a traversal attempt, not a page.
        const file = resolve(ROBOTS_DIR, path.slice('/robots/'.length));
        if (!file.startsWith(ROBOTS_DIR)) {
          return next();
        }
        try {
          const body = readFileSync(file);
          response.setHeader('content-type', CONTENT_TYPES[extname(file)] ?? 'text/plain');
          response.end(body);
        } catch {
          next();
        }
      });
    },
    writeBundle(options) {
      const outputDir = options.dir ?? here('./dist');
      cpSync(ROBOTS_DIR, join(outputDir, 'robots'), { recursive: true });
      mkdirSync(dirname(join(outputDir, 'llms.txt')), { recursive: true });
      writeFileSync(join(outputDir, 'llms.txt'), siteIndex());
    }
  };
}
