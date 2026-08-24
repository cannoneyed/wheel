/**
 * SqliteDriver over the official SQLite WASM build — the browser twin of
 * `bunSqliteDriver`. The driver seam is three synchronous calls (exec / all /
 * close) and the oo1 API is synchronous, so the adapter is thin; wheel's own
 * `coerceParams` / `coerceRows` run on the seam so the engine sees the same
 * canonical row types as it does on bun:sqlite or better-sqlite3.
 *
 * Worker-only: sqlite-wasm allocates its heap at init. In-memory databases for
 * now — OPFS persistence is the designed next step (see README.md).
 */
import sqlite3InitModule from '@sqlite.org/sqlite-wasm';
import { coerceParams, coerceRows, type SqliteDriver, type SqliteRow } from 'wheel/sync/server';

/**
 * Initialize the WASM module once and hand back a factory: one `sqlite3`
 * runtime hosts any number of independent `:memory:` databases (one per demo
 * engine, matching the Bun demo server's one-driver-per-engine layout).
 */
/** What coerceParams actually emits — the honest overlap with sqlite-wasm's BindableValue. */
type BoundParams = (string | number | bigint | null | Uint8Array)[];

export async function createWasmSqliteDriverFactory(): Promise<() => SqliteDriver> {
  const sqlite3 = await sqlite3InitModule();
  return () => {
    const db = new sqlite3.oo1.DB(':memory:');
    return {
      exec: (sql) => {
        db.exec(sql);
      },
      all: (sql, params) => {
        const bound = coerceParams(params) as BoundParams;
        const rows = db.selectObjects(sql, bound.length > 0 ? bound : undefined) as SqliteRow[];
        return coerceRows(rows);
      },
      close: () => db.close()
    };
  };
}
