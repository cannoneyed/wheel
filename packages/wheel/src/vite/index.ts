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
 * - `POST /__wheel/note` — the annotator's save endpoint: writes `note.md`
 *   (what an agent reads first), `note.json` (the complete payload), and any
 *   attachments — `shot.png`, `clip.webm`, `audio.webm` — into a per-note
 *   directory under `noteDir`. The response carries a ready-to-paste
 *   `read <path>/note.md` command, which the page copies to the clipboard.
 * - `GET /__wheel/note` — capability probe, same contract as the snapshot one.
 * - `GET /__wheel/notes` — the saved notes, newest first, so the page can put
 *   a pin back on the component each note was left on.
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
import { mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { isAbsolute, join, relative, resolve } from 'node:path';

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
    esbuild: { keepNames: boolean };
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
  /** Include dev mode in a build made only for browser tests. Normal builds keep it out. */
  readonly devModeInBuild?: boolean;
  /** Where annotation directories land; relative paths resolve against the vite root. Default `.wheel/notes`. */
  readonly noteDir?: string;
  /**
   * Keep every function and class name through minification. Default `true`.
   *
   * Wheel needs this for ONE thing: a service's class name, which the state
   * tree, `actService` and annotation timelines print. Services that declare
   * `static override serviceName` (which `require-service-name` makes
   * mandatory) no longer depend on it, so an app whose services are all
   * declared can set this false and get the bytes back — measured at 11.7 KB
   * gzipped on Axle.
   *
   * What you give up is generic name fidelity everywhere else: minified
   * function names in raw stack traces and in `<ClassName>` debug
   * projections. Source maps still resolve stacks; this is about the names
   * inside the bundle itself.
   */
  readonly keepNames?: boolean;
}

/** How many saved notes `GET /__wheel/notes` returns, newest first. */
const NOTE_LIST_LIMIT = 100;

/** Largest accepted request body. A clip's video rides along as a data URL, so this is generous. */
const MAX_BODY_BYTES = 96 * 1024 * 1024;

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

/** One saved annotation, as posted by `wheel/annotate`. */
interface NoteRequest {
  /** Directory name — `<epoch-ms>-<slug>`, minted by the page. */
  readonly id?: string;
  /** The full note payload; written verbatim as `note.json`. */
  readonly payload: unknown;
  /** The rendered `note.md` — the file an agent reads first. */
  readonly markdown?: string;
  /** `data:image/png;base64,…` of the annotated region. */
  readonly png?: string | null;
  /** `data:video/webm;base64,…` of a clip. */
  readonly video?: string | null;
  /** `data:audio/webm;base64,…` of a voice note. */
  readonly audio?: string | null;
}

/**
 * The shortest path to a note that still resolves from the terminal.
 *
 * `process.cwd()` is where the dev server was launched, which is where a human
 * is pasting. A path that climbs out of it says nothing useful, so that case
 * stays absolute.
 */
function noteCommandPath(absolutePath: string): string {
  const fromCwd = relative(process.cwd(), absolutePath);
  return fromCwd && !fromCwd.startsWith('..') ? fromCwd : absolutePath;
}

/** Decode a `data:…;base64,…` URL into bytes, or null when it is not one. */
function decodeDataUrl(value: string | null | undefined): Buffer | null {
  if (!value) return null;
  const marker = value.indexOf('base64,');
  if (marker === -1) return null;
  return Buffer.from(value.slice(marker + 'base64,'.length), 'base64');
}

/** Collect a request body, refusing anything past {@link MAX_BODY_BYTES}. */
function readBody(
  req: { on(event: string, cb: (chunk?: unknown) => void): void },
  onDone: (body: string | null) => void
): void {
  const chunks: Buffer[] = [];
  let size = 0;
  let refused = false;
  req.on('data', (chunk) => {
    if (refused) return;
    const buffer = chunk as Buffer;
    size += buffer.length;
    if (size > MAX_BODY_BYTES) {
      refused = true;
      onDone(null);
      return;
    }
    chunks.push(buffer);
  });
  req.on('end', () => {
    if (!refused) onDone(Buffer.concat(chunks).toString('utf8'));
  });
}

/**
 * Every saved note, newest first — directory names start with an epoch, so
 * sorting them descending is the whole ordering. A directory whose
 * `note.json` is missing or unreadable is skipped rather than fatal: a
 * half-written note must not break the pins for every other one.
 */
function listNotes(baseDir: string): Array<{ id: string; payload: unknown }> {
  let entries: string[];
  try {
    entries = readdirSync(baseDir, { withFileTypes: true })
      .filter((entry) => entry.isDirectory())
      .map((entry) => entry.name);
  } catch {
    return [];
  }
  const notes: Array<{ id: string; payload: unknown }> = [];
  for (const id of entries.sort().reverse().slice(0, NOTE_LIST_LIMIT)) {
    try {
      notes.push({ id, payload: JSON.parse(readFileSync(join(baseDir, id, 'note.json'), 'utf8')) });
    } catch {
      continue;
    }
  }
  return notes;
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

    const noteOption = options.noteDir ?? '.wheel/notes';
    const noteBase = isAbsolute(noteOption) ? noteOption : resolve(root, noteOption);

    server.middlewares.use('/__wheel/notes', (req, res) => {
      res.setHeader('content-type', 'application/json');
      if (req.method !== 'GET') {
        res.statusCode = 405;
        res.end(JSON.stringify({ ok: false, error: 'GET the saved notes' }));
        return;
      }
      res.statusCode = 200;
      res.end(JSON.stringify({ ok: true, notes: listNotes(noteBase) }));
    });

    server.middlewares.use('/__wheel/note', (req, res) => {
      res.setHeader('content-type', 'application/json');
      if (req.method === 'GET') {
        res.statusCode = 200;
        res.end(JSON.stringify({ ok: true, dir: noteBase }));
        return;
      }
      if (req.method !== 'POST') {
        res.statusCode = 405;
        res.end(JSON.stringify({ ok: false, error: 'POST a note or GET to probe' }));
        return;
      }
      readBody(req, (raw) => {
        if (raw === null) {
          res.statusCode = 413;
          res.end(JSON.stringify({ ok: false, error: 'note too large' }));
          return;
        }
        try {
          const body = JSON.parse(raw) as NoteRequest;
          const dir = join(noteBase, sanitize(body.id ?? 'note'));
          mkdirSync(dir, { recursive: true });
          writeFileSync(join(dir, 'note.json'), `${JSON.stringify(body.payload, null, 2)}\n`);
          if (body.markdown) writeFileSync(join(dir, 'note.md'), body.markdown);
          const attachments: Array<[string, Buffer | null]> = [
            ['shot.png', decodeDataUrl(body.png)],
            ['clip.webm', decodeDataUrl(body.video)],
            ['audio.webm', decodeDataUrl(body.audio)]
          ];
          for (const [name, bytes] of attachments) {
            if (bytes) writeFileSync(join(dir, name), bytes);
          }
          // Relative to where the dev server was STARTED, not to the vite
          // root. An app usually roots at its own package (`packages/app`)
          // while the terminal — and the agent session being pasted into —
          // sits at the repo root, so a root-relative path would not resolve
          // where it lands. An unrelated cwd falls back to absolute.
          const command = `read ${noteCommandPath(join(dir, 'note.md'))}`;
          res.statusCode = 200;
          res.end(JSON.stringify({ ok: true, dir, command }));
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
    // Service identity used to depend entirely on the class name surviving
    // minification, which is what keepNames buys — at the cost of a __name()
    // call for EVERY function and class in the app. Services now declare
    // `static override serviceName` instead (require-service-name), so an app
    // can opt out and take the bytes back.
    config: (config = {}, env = {}) => {
      const root = resolve(config.root ?? process.cwd());
      assertFreshWheelFileDependency(root, buildStamp);
      const devMode = env.command === 'serve' || options.devModeInBuild ? 'true' : 'false';
      const define = { 'globalThis.__WHEEL_DEV_MODE__': devMode };
      return {
        esbuild: { keepNames: options.keepNames ?? true },
        define,
        optimizeDeps: { esbuildOptions: { define } }
      };
    },
    configureServer: attach,
    configurePreviewServer: attach
  };
}
