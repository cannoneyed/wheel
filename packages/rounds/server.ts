import { ROW_SCHEMA_FINGERPRINT } from './row-schema.generated';
import { ROUNDS_SERVERS } from './server/modules';
import { ROUNDS_SYNC_MODULES } from './src/sync/modules';
import { startRoundsServer } from './server/runtime';

const runtime = await startRoundsServer({
  port: Number(process.env.ROUNDS_PORT ?? process.env.PORT) || 4802,
  databaseFilename: process.env.ROUNDS_DATABASE_FILENAME ?? ':memory:',
  syncModules: [...ROUNDS_SYNC_MODULES],
  servers: [...ROUNDS_SERVERS],
  rowSchemaFingerprint: ROW_SCHEMA_FINGERPRINT
});

for (const signal of ['SIGINT', 'SIGTERM'] as const) {
  process.once(signal, () => {
    void runtime.close();
  });
}

console.log(`Rounds sync server on :${Number(process.env.ROUNDS_PORT ?? process.env.PORT) || 4802}`);
