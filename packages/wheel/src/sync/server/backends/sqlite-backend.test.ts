// The SqliteSyncBackend conformance run on better-sqlite3 (Node / vitest). The
// SAME harness runs against the production bun:sqlite driver under `bun test`
// (sqlite-backend.bun-test.ts, `bun run test:backends`) — that pairing is what
// keeps the test driver honest about the production one.
import { describe, expect, test } from 'vitest';

import { runBackendConformance } from './conformance';
import { createSqliteSyncBackend } from './sqlite-backend';
import { betterSqlite3Driver } from './sqlite-driver';

runBackendConformance(
  { describe, test, expect },
  () => {
    const driver = betterSqlite3Driver(':memory:');
    const backend = createSqliteSyncBackend({ driver, clock: { now: () => 1_700_000_000_000 } });
    return { backend, exec: (sql: string) => driver.exec(sql), dispose: () => backend.close() };
  },
  'better-sqlite3'
);
