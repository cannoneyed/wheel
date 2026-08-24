/**
 * SqliteDriver — the thin SYNCHRONOUS seam over an in-process SQLite database,
 * with two interchangeable implementations behind one interface:
 *
 *  - `bunSqliteDriver` — `bun:sqlite`, the DEFAULT / production driver. Built
 *    into Bun (zero dependency) and the same synchronous SQL shape Cloudflare
 *    Durable Object storage exposes, so the default backend targets the real
 *    deployment model.
 *  - `betterSqlite3Driver` — `better-sqlite3`, the Node / vitest test and
 *    Node-dev driver (an optional devDependency). `bun:sqlite` cannot load
 *    under plain Node, so the conformance suite and any Node tooling inject
 *    this one explicitly.
 *
 * Why a seam at all: the two drivers disagree on small things that would
 * otherwise leak into the engine and make tests lie about production —
 * better-sqlite3 can hand back BigInt for integers (with `safeIntegers` on) and
 * `Buffer` for blobs, bun:sqlite hands back `number` and `Uint8Array`. The
 * `coerceRows` / `coerceParams` pass below is the ONE place that reconciles
 * them: EVERY row from EITHER driver flows through `coerceRows`, and every bound
 * parameter through `coerceParams`, so the backend (and the engine above it)
 * sees identical typed rows no matter which driver ran. That parity is what
 * lets the better-sqlite3 conformance run stand in for the bun:sqlite
 * production run. Booleans are the one thing SQLite itself has no type for: both
 * drivers store and return them as integer 0/1, so they already AGREE, and
 * turning 0/1 back into `true`/`false` is a schema-aware concern that belongs to
 * the app/query layer (which knows a column is boolean), not to this
 * schema-blind driver.
 */
import { createRequire } from 'node:module';

/** Resolve CommonJS/native modules (`better-sqlite3`) and Bun built-ins (`bun:sqlite`) from an ESM module — synchronously, so the driver factories stay sync. */
const requireModule = createRequire(import.meta.url);

/** One result row: column name → coerced JS value (numbers, strings, null, Uint8Array). */
export type SqliteRow = Record<string, unknown>;

/**
 * The synchronous surface the SQLite backend drives. Kept minimal on purpose:
 * `exec` for parameter-free DDL/transaction-control batches, `all` for every
 * parameterized statement (returning its rows, or `[]` when it produced none),
 * and `close`. Transactions are run by the backend as explicit
 * `BEGIN`/`COMMIT`/`ROLLBACK` via `exec` — NOT via the drivers' own
 * `transaction()` helper — because a wheel mutation handler is `async` and both
 * drivers forbid awaiting inside their synchronous transaction wrapper.
 */
export interface SqliteDriver {
  /** Run one or more parameter-free statements (DDL, trigger install, BEGIN/COMMIT/ROLLBACK). */
  exec(sql: string): void;
  /** Prepare + bind + execute one statement; return its rows coerced to canonical JS types (`[]` for non-SELECT statements without RETURNING). */
  all(sql: string, params?: readonly unknown[]): SqliteRow[];
  /** Close the underlying database handle. */
  close(): void;
}

/**
 * Normalize one raw driver value to the canonical JS type both drivers must
 * agree on: BigInt → Number (guards better-sqlite3's `safeIntegers` and any
 * integer a driver widened), Buffer → Uint8Array (better-sqlite3 blobs match
 * bun:sqlite's Uint8Array). Everything else (number, string, null, Uint8Array)
 * passes through unchanged.
 */
export function coerceValue(value: unknown): unknown {
  if (typeof value === 'bigint') {
    return Number(value);
  }
  // A Node Buffer is a Uint8Array subclass; re-wrap so both drivers hand back a
  // plain Uint8Array (avoids Buffer-only methods leaking into row identity).
  if (value instanceof Uint8Array && value.constructor !== Uint8Array) {
    return new Uint8Array(value);
  }
  return value;
}

/** Apply `coerceValue` across every column of every row — the driver-agnostic read-side normalization. */
export function coerceRows(rows: readonly SqliteRow[]): SqliteRow[] {
  return rows.map((row) => {
    const out: SqliteRow = {};
    for (const key of Object.keys(row)) {
      out[key] = coerceValue(row[key]);
    }
    return out;
  });
}

/**
 * Normalize bound parameters for either driver: JS `true`/`false` → 1/0 (SQLite
 * has no boolean and better-sqlite3 THROWS on a boolean bind), `undefined` →
 * `null`. Numbers, strings, bigints, `null`, and Uint8Array/Buffer bind as-is.
 */
export function coerceParams(params: readonly unknown[] | undefined): unknown[] {
  if (!params || params.length === 0) {
    return [];
  }
  return params.map((value) => {
    if (typeof value === 'boolean') {
      return value ? 1 : 0;
    }
    if (value === undefined) {
      return null;
    }
    return value;
  });
}

/** The shape of a `better-sqlite3` Database instance (typed locally — the package is an optional devDependency with no bundled types here). */
interface BetterSqlite3Db {
  /** Toggle BigInt integer results globally; we pin it OFF for `number` parity with bun:sqlite. */
  defaultSafeIntegers(toggle: boolean): void;
  /** Run parameter-free statement batches. */
  exec(sql: string): void;
  /** Prepare a statement; `.reader` tells whether it yields rows, `.all`/`.run` execute it. */
  prepare(sql: string): { reader: boolean; all(...params: unknown[]): SqliteRow[]; run(...params: unknown[]): unknown };
  /** Close the handle. */
  close(): void;
}

/** The shape of a `bun:sqlite` Database instance (typed locally to avoid a hard `bun:sqlite` type dependency in Node builds). */
interface BunSqliteDb {
  /** Run parameter-free statement batches. */
  exec(sql: string): void;
  /** Cache-prepare a statement whose `.all` returns rows (or `[]` for non-SELECT without RETURNING). */
  query(sql: string): { all(...params: unknown[]): SqliteRow[] };
  /** Close the handle. */
  close(): void;
}

/**
 * The DEFAULT / production driver, backed by `bun:sqlite`. Only usable under
 * the Bun runtime; under plain Node the `bun:sqlite` import fails and this
 * throws a clear error rather than silently degrading — a Node caller must
 * inject `betterSqlite3Driver` explicitly.
 */
export function bunSqliteDriver(filename = ':memory:'): SqliteDriver {
  let Database: new (name: string) => BunSqliteDb;
  try {
    Database = (requireModule('bun:sqlite') as { Database: new (name: string) => BunSqliteDb }).Database;
  } catch (error) {
    throw new Error(
      'bunSqliteDriver needs the Bun runtime (bun:sqlite is unavailable here). ' +
        'Under Node/vitest, inject betterSqlite3Driver instead. ' +
        `Original: ${error instanceof Error ? error.message : String(error)}`
    );
  }
  const db = new Database(filename);
  return {
    exec: (sql) => db.exec(sql),
    all: (sql, params) => coerceRows(db.query(sql).all(...coerceParams(params))),
    close: () => db.close()
  };
}

/**
 * The Node / vitest test and Node-dev driver, backed by `better-sqlite3` (an
 * optional devDependency). `safeIntegers` is pinned OFF so integers return as
 * JS `number` — matching bun:sqlite — and non-SELECT statements are detected
 * via `.reader` so `all` uniformly returns `[]` for them.
 */
export function betterSqlite3Driver(filename = ':memory:'): SqliteDriver {
  let Database: new (name: string) => BetterSqlite3Db;
  try {
    Database = requireModule('better-sqlite3') as new (name: string) => BetterSqlite3Db;
  } catch (error) {
    throw new Error(
      'betterSqlite3Driver needs the optional `better-sqlite3` dependency (a devDependency for tests / Node dev). ' +
        'Install it, or use bunSqliteDriver under Bun. ' +
        `Original: ${error instanceof Error ? error.message : String(error)}`
    );
  }
  const db = new Database(filename);
  db.defaultSafeIntegers(false);
  return {
    exec: (sql) => db.exec(sql),
    all: (sql, params) => {
      const statement = db.prepare(sql);
      const bound = coerceParams(params);
      if (statement.reader) {
        return coerceRows(statement.all(...bound));
      }
      statement.run(...bound);
      return [];
    },
    close: () => db.close()
  };
}
