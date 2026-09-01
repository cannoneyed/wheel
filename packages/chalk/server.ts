import { ROW_SCHEMA_FINGERPRINT } from './row-schema.generated';
import { CHALK_SERVERS, CHALK_SYNC_MODULES } from './server/modules';
import { startChalkServer } from './server/runtime';

const port = Number(process.env.CHALK_PORT ?? process.env.PORT) || 4804;
const runtime = await startChalkServer({
  port,
  databaseFilename: process.env.CHALK_DATABASE_FILENAME ?? ':memory:',
  syncModules: CHALK_SYNC_MODULES,
  servers: CHALK_SERVERS,
  rowSchemaFingerprint: ROW_SCHEMA_FINGERPRINT
});

for (const signal of ['SIGINT', 'SIGTERM'] as const) {
  process.once(signal, () => void runtime.close());
}

console.log(`Chalk sync server on :${port}`);
