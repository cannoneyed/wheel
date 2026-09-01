import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const serverPort = Number(process.env.ROUNDS_PORT ?? '4902');
const controllerPort = Number(process.env.ROUNDS_CONTROLLER_PORT ?? '4909');
const serverOrigin = `http://127.0.0.1:${serverPort}`;
const root = mkdtempSync(join(tmpdir(), 'wheel-rounds-'));
let generation = 0;
let databaseFilename = join(root, 'rounds.sqlite');
let child: ReturnType<typeof Bun.spawn> | null = null;
let operation = Promise.resolve();

async function waitUntilReady(): Promise<void> {
  for (let attempt = 0; attempt < 100; attempt += 1) {
    if (child?.exitCode !== null) throw new Error(`Rounds test server exited with ${child?.exitCode}.`);
    try {
      const response = await fetch(`${serverOrigin}/readyz`);
      if (response.ok) return;
    } catch {
      // The child has not opened its socket yet.
    }
    await Bun.sleep(50);
  }
  throw new Error('Rounds test server did not become ready.');
}

async function stopChild(): Promise<void> {
  if (!child) return;
  child.kill('SIGTERM');
  await child.exited;
  child = null;
}

async function startChild(): Promise<void> {
  child = Bun.spawn({
    cmd: [process.execPath, 'run', 'packages/rounds/browser/support/test-server.ts'],
    cwd: process.cwd(),
    env: {
      ...process.env,
      ROUNDS_PORT: String(serverPort),
      ROUNDS_DATABASE: databaseFilename
    },
    stdout: 'inherit',
    stderr: 'inherit'
  });
  await waitUntilReady();
}

async function restart(storage: 'preserve' | 'reset'): Promise<void> {
  await stopChild();
  if (storage === 'reset') {
    generation += 1;
    databaseFilename = join(root, `rounds-${generation}.sqlite`);
  }
  await startChild();
}

async function forward(path: string): Promise<Response> {
  const response = await fetch(`${serverOrigin}${path}`, { method: 'POST' });
  return new Response(await response.text(), { status: response.status, headers: response.headers });
}

function serialized(work: () => Promise<void>): Promise<void> {
  operation = operation.then(work, work);
  return operation;
}

await startChild();

const controller = Bun.serve({
  hostname: '127.0.0.1',
  port: controllerPort,
  async fetch(request): Promise<Response> {
    const url = new URL(request.url);
    if (request.method === 'GET' && url.pathname === '/readyz') {
      try {
        await waitUntilReady();
        return Response.json({ ok: true, generation });
      } catch (error) {
        return Response.json({ ok: false, error: error instanceof Error ? error.message : String(error) }, { status: 503 });
      }
    }
    if (request.method === 'POST' && url.pathname === '/restart') {
      const body = (await request.json()) as { storage?: unknown };
      if (body.storage !== 'preserve' && body.storage !== 'reset') {
        return Response.json({ ok: false, error: 'storage must be preserve or reset' }, { status: 400 });
      }
      await serialized(() => restart(body.storage as 'preserve' | 'reset'));
      return Response.json({ ok: true, generation });
    }
    if (request.method === 'POST' && url.pathname === '/fail-query') {
      const body = (await request.json()) as { name?: unknown };
      if (typeof body.name !== 'string') return Response.json({ ok: false }, { status: 400 });
      return forward(`/__rounds-test/fail-query?name=${encodeURIComponent(body.name)}`);
    }
    if (request.method === 'POST' && url.pathname === '/clear-faults') {
      return forward('/__rounds-test/clear-faults');
    }
    return new Response('Rounds test controller', { status: url.pathname === '/' ? 200 : 404 });
  }
});

async function close(): Promise<void> {
  controller.stop(true);
  await stopChild();
  rmSync(root, { recursive: true, force: true });
  process.exit(0);
}

process.on('SIGTERM', () => void close());
process.on('SIGINT', () => void close());
