import type { SqliteDriver } from 'wheel/sync/server';

import { EDITOR_SCHEMA } from '../src/editor/sync/editor.server';

/** Idempotently seed Chalk's example documents. */
export function applyChalkSeed(driver: SqliteDriver): void {
  for (const statement of EDITOR_SCHEMA.seed) driver.all(statement);
}
