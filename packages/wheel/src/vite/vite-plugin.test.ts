/**
 * The wheelDevTools vite plugin: probe answers with the resolved dir; a
 * POSTed snapshot lands as shot.png + context.json in a per-capture
 * directory; bad payloads 400 without writing.
 */
import { describe, expect, it, beforeEach, afterEach } from 'vitest';
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  writeFileSync
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { wheelDevTools } from './index';
import { assertFreshWheelFileDependency } from './file-dependency';
import { wheelSourceStamp } from './source-stamp';

// A 1×1 transparent PNG.
const PNG_BASE64 =
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';

interface FakeResponse {
  statusCode: number;
  body: string;
  setHeader(name: string, value: string): void;
  end(body?: string): void;
}

function makeServer(root: string) {
  const routes = new Map<string, (req: unknown, res: FakeResponse) => void>();
  const server = {
    config: { root },
    middlewares: {
      use: (path: string, handler: (req: never, res: never) => void) =>
        routes.set(path, handler as never)
    }
  };
  const dispatch = (path: string, method: string, body?: unknown): Promise<FakeResponse> => {
    const handler = routes.get(path)!;
    const listeners = new Map<string, (chunk?: unknown) => void>();
    const req = {
      method,
      on: (event: string, cb: (chunk?: unknown) => void) => listeners.set(event, cb)
    };
    const res: FakeResponse = {
      statusCode: 0,
      body: '',
      setHeader: () => {},
      end(text) {
        this.body = text ?? '';
      }
    };
    return new Promise((resolveDone) => {
      const originalEnd = res.end.bind(res);
      res.end = (text) => {
        originalEnd(text);
        resolveDone(res);
      };
      handler(req as never, res as never);
      if (body !== undefined) {
        listeners.get('data')?.(Buffer.from(JSON.stringify(body)));
        listeners.get('end')?.();
      }
    });
  };
  return { server, dispatch };
}

let root: string;

function writeWheelSourceFixture(packageRoot: string): void {
  const files = new Map([
    ['package.json', '{"name":"wheel","version":"1.2.3"}\n'],
    ['tsconfig.json', '{}\n'],
    ['vite.config.ts', 'export default {};\n'],
    ['scripts/fix-declaration-imports.mjs', 'export {};\n'],
    ['src/index.ts', 'export const value = 1;\n']
  ]);
  for (const [path, contents] of files) {
    const target = join(packageRoot, path);
    mkdirSync(join(target, '..'), { recursive: true });
    writeFileSync(target, contents);
  }
}

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), 'wheel-snap-'));
});
afterEach(() => rmSync(root, { recursive: true, force: true }));

describe('wheelDevTools', () => {
  it('enables Wheel dev mode only while Vite serves', () => {
    const served = wheelDevTools().config({ root }, { command: 'serve' });
    const built = wheelDevTools().config({ root }, { command: 'build' });

    expect(served.define['globalThis.__WHEEL_DEV_MODE__']).toBe('true');
    expect(served.optimizeDeps.esbuildOptions.define).toEqual(served.define);
    expect(built.define['globalThis.__WHEEL_DEV_MODE__']).toBe('false');
    expect(
      wheelDevTools({ devModeInBuild: true }).config({ root }, { command: 'build' }).define[
        'globalThis.__WHEEL_DEV_MODE__'
      ]
    ).toBe('true');
    expect(served.esbuild.keepNames).toBe(true);
  });

  it('keeps names by default, and lets an app take the bytes back', () => {
    // keepNames rescues class names through minification at the cost of a
    // __name() call per function. Services that declare `serviceName` do not
    // need it, so an app whose services all declare can opt out.
    expect(wheelDevTools().config({ root }, { command: 'build' }).esbuild.keepNames).toBe(true);
    expect(
      wheelDevTools({ keepNames: false }).config({ root }, { command: 'build' }).esbuild.keepNames
    ).toBe(false);
  });

  it('GET probes with the resolved snapshot dir', async () => {
    const { server, dispatch } = makeServer(root);
    wheelDevTools().configureServer(server as never);
    const res = await dispatch('/__wheel/snapshot', 'GET');
    expect(res.statusCode).toBe(200);
    expect(JSON.parse(res.body)).toEqual({ ok: true, dir: join(root, '.wheel/snapshots') });
  });

  it('POST writes shot.png + context.json into a named per-capture dir', async () => {
    const { server, dispatch } = makeServer(root);
    wheelDevTools({ snapshotDir: 'captures' }).configureServer(server as never);
    const res = await dispatch('/__wheel/snapshot', 'POST', {
      name: 'TodoRow broken/label!',
      png: `data:image/png;base64,${PNG_BASE64}`,
      context: { components: [{ instanceId: 'TodoRow' }] }
    });
    expect(res.statusCode).toBe(200);
    const { ok, dir } = JSON.parse(res.body) as { ok: boolean; dir: string };
    expect(ok).toBe(true);
    expect(dir.startsWith(join(root, 'captures'))).toBe(true);
    expect(dir.endsWith('-TodoRow-broken-label-')).toBe(true); // sanitized name
    expect(readFileSync(join(dir, 'shot.png')).equals(Buffer.from(PNG_BASE64, 'base64'))).toBe(true);
    expect(JSON.parse(readFileSync(join(dir, 'context.json'), 'utf8'))).toEqual({
      components: [{ instanceId: 'TodoRow' }]
    });
  });

  it('rejects malformed payloads with 400 and writes nothing', async () => {
    const { server, dispatch } = makeServer(root);
    wheelDevTools().configureServer(server as never);
    const res = await dispatch('/__wheel/snapshot', 'POST', 'not-an-object');
    expect(res.statusCode).toBe(400);
    expect(existsSync(join(root, '.wheel/snapshots')) && readdirSync(join(root, '.wheel/snapshots')).length > 0).toBe(false);
  });

  it('answers 405 for other methods', async () => {
    const { server, dispatch } = makeServer(root);
    wheelDevTools().configureServer(server as never);
    const res = await dispatch('/__wheel/snapshot', 'DELETE');
    expect(res.statusCode).toBe(405);
  });
});

describe('wheelDevTools notes', () => {
  it('GET probes with the resolved note dir', async () => {
    const { server, dispatch } = makeServer(root);
    wheelDevTools().configureServer(server as never);
    const res = await dispatch('/__wheel/note', 'GET');
    expect(JSON.parse(res.body)).toEqual({ ok: true, dir: join(root, '.wheel/notes') });
  });

  it('writes note.md, note.json and every attachment, and returns a pasteable command', async () => {
    const { server, dispatch } = makeServer(root);
    wheelDevTools().configureServer(server as never);
    const res = await dispatch('/__wheel/note', 'POST', {
      id: '1755974400123-cell-clears',
      payload: { id: '1755974400123-cell-clears', text: 'cell clears' },
      markdown: '# cell clears\n',
      png: `data:image/png;base64,${PNG_BASE64}`,
      audio: `data:audio/webm;base64,${PNG_BASE64}`
    });

    const { ok, dir, command } = JSON.parse(res.body) as { ok: boolean; dir: string; command: string };
    expect(ok).toBe(true);
    expect(dir).toBe(join(root, '.wheel/notes/1755974400123-cell-clears'));
    // This fixture writes to a temp dir OUTSIDE the working directory, where
    // a relative path would be a wall of `../` — so it stays absolute.
    expect(command).toBe(`read ${join(dir, 'note.md')}`);
    expect(readFileSync(join(dir, 'note.md'), 'utf8')).toBe('# cell clears\n');
    expect(JSON.parse(readFileSync(join(dir, 'note.json'), 'utf8'))).toMatchObject({ text: 'cell clears' });
    expect(existsSync(join(dir, 'shot.png'))).toBe(true);
    expect(existsSync(join(dir, 'audio.webm'))).toBe(true);
    expect(existsSync(join(dir, 'clip.webm'))).toBe(false);
  });

  it('gives a path relative to where the server was started, not to the vite root', async () => {
    // An app usually roots at its own package while the terminal — and the
    // agent session being pasted into — sits at the repo root. A root-relative
    // path would not resolve where it lands.
    const insideCwd = join(process.cwd(), '.wheel-command-test');
    try {
      const { server, dispatch } = makeServer(root);
      wheelDevTools({ noteDir: insideCwd }).configureServer(server as never);
      const res = await dispatch('/__wheel/note', 'POST', { id: 'note-1', payload: {}, markdown: '# x\n' });
      const { command } = JSON.parse(res.body) as { command: string };

      expect(command).toBe('read .wheel-command-test/note-1/note.md');
      expect(command).not.toContain('..');
    } finally {
      rmSync(insideCwd, { recursive: true, force: true });
    }
  });

  it('lists saved notes newest first, skipping any that are unreadable', async () => {
    const notesDir = join(root, '.wheel/notes');
    mkdirSync(join(notesDir, '1000-first'), { recursive: true });
    mkdirSync(join(notesDir, '2000-second'), { recursive: true });
    mkdirSync(join(notesDir, '3000-broken'), { recursive: true });
    writeFileSync(join(notesDir, '1000-first/note.json'), JSON.stringify({ id: '1000-first' }));
    writeFileSync(join(notesDir, '2000-second/note.json'), JSON.stringify({ id: '2000-second' }));
    writeFileSync(join(notesDir, '3000-broken/note.json'), 'not json');

    const { server, dispatch } = makeServer(root);
    wheelDevTools().configureServer(server as never);
    const res = await dispatch('/__wheel/notes', 'GET');
    const { notes } = JSON.parse(res.body) as { notes: Array<{ id: string }> };
    expect(notes.map((note) => note.id)).toEqual(['2000-second', '1000-first']);
  });

  it('answers an empty list before any note exists', async () => {
    const { server, dispatch } = makeServer(root);
    wheelDevTools().configureServer(server as never);
    const res = await dispatch('/__wheel/notes', 'GET');
    expect(JSON.parse(res.body)).toEqual({ ok: true, notes: [] });
  });
});

describe('local Wheel package stamp', () => {
  it('changes when a same-version source file changes', () => {
    const packageRoot = join(root, 'wheel-source');
    writeWheelSourceFixture(packageRoot);
    const before = wheelSourceStamp(packageRoot);
    writeFileSync(join(packageRoot, 'src/index.ts'), 'export const value = 2;\n');

    expect(before).toMatch(/^1\.2\.3:[a-f0-9]{16}$/);
    expect(wheelSourceStamp(packageRoot)).not.toBe(before);
  });

  it('rejects a direct file dependency after its source changes', () => {
    const packageRoot = join(root, 'wheel-source');
    writeWheelSourceFixture(packageRoot);
    writeFileSync(
      join(root, 'package.json'),
      JSON.stringify({ dependencies: { wheel: 'file:./wheel-source' } })
    );
    const builtStamp = wheelSourceStamp(packageRoot);

    expect(() => assertFreshWheelFileDependency(root, builtStamp)).not.toThrow();
    writeFileSync(join(packageRoot, 'src/index.ts'), 'export const changed = true;\n');
    expect(() => assertFreshWheelFileDependency(root, builtStamp)).toThrow(
      /Wheel package output is stale.*bun run --cwd/s
    );
  });

  it('ignores non-file dependencies', () => {
    writeFileSync(join(root, 'package.json'), JSON.stringify({ dependencies: { wheel: '^1.0.0' } }));
    expect(() => assertFreshWheelFileDependency(root, null)).not.toThrow();
  });
});
