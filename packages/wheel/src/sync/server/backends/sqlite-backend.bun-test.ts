// The SqliteSyncBackend conformance run on the REAL production driver,
// bun:sqlite, under `bun test` (`bun run test:backends`). It replays the exact
// same harness the vitest/better-sqlite3 suite does — exercising the actual
// driver that ships, so CI proves the two drivers agree, not just that
// better-sqlite3 works. Kept out of the vitest glob (`.bun-test.ts`, not
// `.test.ts`) because vitest cannot resolve `bun:test`/`bun:sqlite`.
import { describe, expect, test } from 'bun:test';

import { runBackendConformance } from './conformance';
import { createSqliteSyncBackend } from './sqlite-backend';
import { bunSqliteDriver } from './sqlite-driver';

runBackendConformance(
  { describe, test, expect },
  () => {
    const driver = bunSqliteDriver(':memory:');
    const backend = createSqliteSyncBackend({ driver, clock: { now: () => 1_700_000_000_000 } });
    return { backend, exec: (sql: string) => driver.exec(sql), dispose: () => backend.close() };
  },
  'bun:sqlite'
);
