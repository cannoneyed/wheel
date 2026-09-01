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
