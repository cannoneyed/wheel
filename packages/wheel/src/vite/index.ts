/**
 * wheel/vite — the dev-server half of the debug story. One plugin:
 *
 *   // vite.config.ts
 *   import { wheelDevTools } from 'wheel/vite';
 *   export default defineConfig({ plugins: [solid(), wheelDevTools()] });
 *
 * What it serves (dev server AND `vite preview`):
 *
 * - `POST /__wheel/snapshot` — the debug panel's "save rich snapshot"
 *   endpoint: writes `shot.png` + `context.json` (the component tree and
 *   live state under the captured rectangle) into a per-capture directory
 *   under `snapshotDir`. The response returns the absolute directory, and
 *   the panel shows it — so a human tells an agent "look at the latest
 *   snapshot" and the agent READS THE FILES; no pasting anything anywhere.
 * - `GET /__wheel/snapshot` — capability probe; the panel enables its save
 *   button only when this answers.
 * - `GET /__wheel/identity` — which checkout is serving this. A browser suite
 *   asks before it runs a single test, so pointing it at the wrong dev server
 *   fails loudly instead of passing against code nobody changed.
 *
 * Its config hook also enables Wheel dev mode during `vite serve`, preserves
 * service names, and rejects stale output from direct `file:` dependencies.
 *
 * Snapshot directories are `<snapshotDir>/<epoch-ms>-<name>/` — sortable,
 * collision-free, greppable. `snapshotDir` defaults to `.wheel/snapshots`
 * under the vite root (gitignore it).
 *
 * Structurally typed against vite's plugin surface — wheel takes no vite
 * dependency; any server with a connect-style `middlewares.use` fits.
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { isAbsolute, join, resolve } from 'node:path';

import { systemClock } from '../core/runtime-defaults';
import { assertFreshWheelFileDependency } from './file-dependency';

const buildStamp = (
  globalThis as typeof globalThis & { readonly __WHEEL_BUILD_STAMP__?: string }
).__WHEEL_BUILD_STAMP__ ?? null;

/** The slice of vite's dev/preview server the plugin touches (structural). */
interface MiddlewareServer {
  readonly config?: { readonly root?: string };
  readonly middlewares: {
    use(
      path: string,
      handler: (
        req: { method?: string; on(event: string, cb: (chunk?: unknown) => void): void },
        res: {
          statusCode: number;
          setHeader(name: string, value: string): void;
          end(body?: string): void;
        }
      ) => void
    ): void;
  };
}

/** The structural shape vite expects back from a plugin factory. */
export interface WheelVitePlugin {
  readonly name: string;
  /** Merged into the app's config: enables dev mode and keeps names. */
  config(
    config?: { readonly root?: string },
    env?: { readonly command?: 'serve' | 'build' }
  ): {
    esbuild: { keepNames: true };
    define: Record<string, string>;
    optimizeDeps: { esbuildOptions: { define: Record<string, string> } };
  };
  configureServer(server: MiddlewareServer): void;
  configurePreviewServer(server: MiddlewareServer): void;
}

/** Options for {@link wheelDevTools}. */
export interface WheelDevToolsOptions {
  /** Where snapshot directories land; relative paths resolve against the vite root. Default `.wheel/snapshots`. */
  readonly snapshotDir?: string;
}

interface SnapshotRequest {
  readonly name?: string;
  /** A `data:image/png;base64,...` URL from the capture canvas. */
  readonly png: string;
  /** The rich half: component tree + state for everything under the rect. */
  readonly context: unknown;
}

function sanitize(name: string): string {
  return name.replace(/[^a-zA-Z0-9._-]+/g, '-').slice(0, 60) || 'snapshot';
}

/** The wheel dev-tools vite plugin (see module doc). */
export function wheelDevTools(options: WheelDevToolsOptions = {}): WheelVitePlugin {
  const attach = (server: MiddlewareServer): void => {
    const root = server.config?.root ?? process.cwd();
    const dirOption = options.snapshotDir ?? '.wheel/snapshots';
    const baseDir = isAbsolute(dirOption) ? dirOption : resolve(root, dirOption);

    server.middlewares.use('/__wheel/identity', (req, res) => {
      res.setHeader('content-type', 'application/json');
      res.statusCode = 200;
      // The vite root plus the process's working directory identify a checkout
      // well enough to catch the failure this exists for: a suite in one
      // worktree talking to a dev server from another.
      res.end(JSON.stringify({ ok: true, root, cwd: process.cwd() }));
    });

    server.middlewares.use('/__wheel/snapshot', (req, res) => {
      res.setHeader('content-type', 'application/json');
      if (req.method === 'GET') {
        res.statusCode = 200;
        res.end(JSON.stringify({ ok: true, dir: baseDir }));
        return;
      }
      if (req.method !== 'POST') {
        res.statusCode = 405;
        res.end(JSON.stringify({ ok: false, error: 'POST a snapshot or GET to probe' }));
        return;
      }
      const chunks: Buffer[] = [];
      req.on('data', (chunk) => chunks.push(chunk as Buffer));
      req.on('end', () => {
        try {
          const body = JSON.parse(Buffer.concat(chunks).toString('utf8')) as SnapshotRequest;
          const base64 = body.png.slice(body.png.indexOf('base64,') + 'base64,'.length);
          const dir = join(baseDir, `${systemClock.now()}-${sanitize(body.name ?? 'snapshot')}`);
          mkdirSync(dir, { recursive: true });
          writeFileSync(join(dir, 'shot.png'), Buffer.from(base64, 'base64'));
          writeFileSync(join(dir, 'context.json'), `${JSON.stringify(body.context, null, 2)}\n`);
          res.statusCode = 200;
          res.end(JSON.stringify({ ok: true, dir }));
        } catch (error) {
          res.statusCode = 400;
          res.end(
            JSON.stringify({ ok: false, error: error instanceof Error ? error.message : String(error) })
          );
        }
      });
    });
  };
  return {
    name: 'wheel-dev-tools',
    // Service identity IS the class name (the state tree's labels, DebugMeta
    // serviceName, actService lookups). Minification mangles class names to
    // `So`/`rT` and the whole debug story goes illegible — keepNames makes
    // esbuild preserve them at negligible size cost.
    config: (config = {}, env = {}) => {
      const root = resolve(config.root ?? process.cwd());
      assertFreshWheelFileDependency(root, buildStamp);
      const devMode = env.command === 'serve' ? 'true' : 'false';
      const define = { 'globalThis.__WHEEL_DEV_MODE__': devMode };
      return {
        esbuild: { keepNames: true as const },
        define,
        optimizeDeps: { esbuildOptions: { define } }
      };
    },
    configureServer: attach,
    configurePreviewServer: attach
  };
}
