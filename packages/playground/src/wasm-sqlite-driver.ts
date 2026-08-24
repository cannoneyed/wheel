import sqlite3InitModule from '@sqlite.org/sqlite-wasm';
import {
  coerceParams,
  coerceRows,
  type SqliteDriver,
  type SqliteRow
} from 'wheel/sync/server';

type BoundParams = (string | number | bigint | null | Uint8Array)[];

/** Create one in-memory SQLite driver from the official browser WASM build. */
export async function createWasmSqliteDriver(): Promise<SqliteDriver> {
  const sqlite3 = await sqlite3InitModule();
  const db = new sqlite3.oo1.DB(':memory:');
  return {
    exec: (sql) => db.exec(sql),
    all: (sql, params) => {
      const bound = coerceParams(params) as BoundParams;
      const rows = db.selectObjects(sql, bound.length > 0 ? bound : undefined) as SqliteRow[];
      return coerceRows(rows);
    },
    close: () => db.close()
  };
}
