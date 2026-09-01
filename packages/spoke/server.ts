import { ROW_SCHEMA_FINGERPRINT } from './row-schema.generated';
import { SPOKE_SERVERS, SPOKE_SYNC_MODULES } from './server/modules';
import { startSpokeServer } from './server/runtime';

const port = Number(process.env.SPOKE_PORT ?? process.env.PORT) || 4806;
const runtime = await startSpokeServer({
  port,
  databaseDirectory: process.env.SPOKE_DATABASE_DIRECTORY,
  syncModules: [...SPOKE_SYNC_MODULES],
  servers: [...SPOKE_SERVERS],
  rowSchemaFingerprint: ROW_SCHEMA_FINGERPRINT
});

for (const signal of ['SIGINT', 'SIGTERM'] as const) {
  process.once(signal, () => void runtime.close());
}

console.log(`Spoke sync server on :${port}`);
