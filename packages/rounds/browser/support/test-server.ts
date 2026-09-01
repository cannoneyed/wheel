import {
  type QueryHandler,
  type ServeQueryBinding
} from 'wheel/sync/server';

import { ROUNDS_SERVERS } from '../../server/modules';
import { startRoundsServer } from '../../server/runtime';
import { ROW_SCHEMA_FINGERPRINT } from '../../row-schema.generated';
import { ROUNDS_SYNC_MODULES } from '../../src/sync/modules';
import { ROW_SCHEMA_FINGERPRINT as ROW_SCHEMA_FINGERPRINT_B } from '../upgrade/row-schema-b.generated';
import { ROUNDS_B_SERVERS } from '../upgrade/rounds-b.server';
import { ROUNDS_B_SYNC_MODULES } from '../upgrade/rounds-b.sync';

const faults = new Set<string>();
type QueryBinding = ServeQueryBinding<Record<string, unknown>, Record<string, unknown>>;

function isQueryBinding(value: unknown): value is QueryBinding {
  return typeof value === 'object' && value !== null && (value as { kind?: unknown }).kind === 'serve-query';
}

function wrapQuery(binding: QueryBinding): QueryBinding {
  const original = binding.handler;
  const handler: QueryHandler = {
    kind: `test-fault:${original.kind}`,
    async run(params, context) {
      if (faults.delete(binding.name)) throw new Error(`Injected one-shot query failure: ${binding.name}`);
      return original.run(params, context);
    },
    ...(original.subscribe ? { subscribe: original.subscribe } : {}),
    ...(original.prune ? { prune: original.prune } : {})
  };
  return { ...binding, handler };
}

const contract = process.env.ROUNDS_CONTRACT === 'b' ? 'b' : 'a';
const servers = contract === 'b' ? ROUNDS_B_SERVERS : ROUNDS_SERVERS;
const syncModules = contract === 'b' ? ROUNDS_B_SYNC_MODULES : ROUNDS_SYNC_MODULES;
const rowSchemaFingerprint =
  contract === 'b' ? ROW_SCHEMA_FINGERPRINT_B : ROW_SCHEMA_FINGERPRINT;

const TEST_SERVERS = servers.map((server) =>
  Object.fromEntries(
    Object.entries(server).map(([name, value]) => [name, isQueryBinding(value) ? wrapQuery(value) : value])
  )
);

function testControl(request: Request): Response | undefined {
  const url = new URL(request.url);
  if (url.hostname !== '127.0.0.1' && url.hostname !== 'localhost') return undefined;
  if (request.method === 'POST' && url.pathname === '/__rounds-test/fail-query') {
    const name = url.searchParams.get('name');
    if (!name) return new Response('Missing query name', { status: 400 });
    faults.add(name);
    return Response.json({ ok: true });
  }
  if (request.method === 'POST' && url.pathname === '/__rounds-test/clear-faults') {
    faults.clear();
    return Response.json({ ok: true });
  }
  return undefined;
}

const port = Number(process.env.ROUNDS_PORT ?? '4902');
const databaseFilename = process.env.ROUNDS_DATABASE ?? ':memory:';
const runtime = await startRoundsServer({
  port,
  databaseFilename,
  syncModules,
  servers: TEST_SERVERS,
  rowSchemaFingerprint,
  extraFetch: testControl
});

async function close(): Promise<void> {
  await runtime.close();
  process.exit(0);
}

process.on('SIGTERM', () => void close());
process.on('SIGINT', () => void close());
