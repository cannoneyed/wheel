/**
 * Boot-time SQL for the SQLite backend: the sync log and write-tracking.
 *
 * SQLite has no session variables or statement-level triggers. The guarantee
 * — "watch stays honest with zero agent burden" — is rebuilt from parts SQLite
 * does have: a TEMP scratch table (`wheel_touched`) plus per-table row triggers
 * that append the table's name to it on every insert/update/delete. The
 * mutation transaction clears the scratch table, runs the handler, then reads
 * the distinct names back in first-touch order — no SQL parsing, no manual
 * `touches:` declarations to forget.
 *
 * The scratch table and its triggers are TEMP (connection-scoped): a permanent
 * trigger may not reference a temp table, and the backend owns exactly one
 * long-lived connection, so temp is both required and correct. Table names come
 * from validated registry declarations (the TABLE_NAME pattern), never user
 * input; they are still quoted for defensiveness.
 */

/** The seq-ordered audit trail of mutations. `touched` is a JSON array of table names (SQLite has no array type). */
export const SYNC_LOG_TABLE = 'wheel_sync_log';

/** DDL for the sync log — `seq` is an autoincrement integer primary key so every mint is strictly increasing and gap-free per database. */
export const CREATE_SYNC_LOG = `create table if not exists ${SYNC_LOG_TABLE} (
  seq integer primary key autoincrement,
  mutation_id text not null unique,
  mutation_name text not null,
  actor text not null,
  client_id text not null,
  committed_ms integer not null,
  touched text not null
)`;

/** The connection-scoped scratch table the touch triggers append to (one row per touching statement; deduped on read). */
export const CREATE_TOUCHED_TABLE = `create temp table if not exists wheel_touched (name text not null)`;

/** Durable Object scratch table. One object owns one serialized writer, so a persistent table is safe across evictions. */
export const CREATE_PERSISTENT_TOUCHED_TABLE = `create table if not exists wheel_touched (name text not null)`;

/** Clear the scratch table at the start of each mutation transaction. */
export const RESET_TOUCHED = `delete from wheel_touched`;

/**
 * Read the touched tables back, deduped and in FIRST-touch order (SQLite's
 * implicit `rowid` increments with insertion, so `min(rowid)` recovers the
 * first-touch order.
 */
export const READ_TOUCHED = `select name from wheel_touched group by name order by min(rowid)`;

/** Quote a SQLite identifier (double quotes, doubled to escape). */
function quoteIdent(name: string): string {
  return `"${name.replace(/"/g, '""')}"`;
}

/** Quote a string as a SQLite literal (single quotes, doubled to escape). */
function quoteLiteral(value: string): string {
  return `'${value.replace(/'/g, "''")}'`;
}

/**
 * The three TEMP row triggers that install write tracking for one table: each
 * appends the table's name to `wheel_touched` after an insert/update/delete.
 * Returned as one `;`-joined batch for a single `exec`.
 */
export function createTouchTriggers(table: string): string {
  const ident = quoteIdent(table);
  const literal = quoteLiteral(table);
  const trigger = (suffix: string, event: string): string =>
    `create temp trigger if not exists ${quoteIdent(`wheel_touch_${suffix}_${table}`)} ` +
    `after ${event} on ${ident} begin insert into wheel_touched (name) values (${literal}); end`;
  return [trigger('ins', 'insert'), trigger('upd', 'update'), trigger('del', 'delete')].join(';\n');
}

/** Durable Object write-tracking triggers. Permanent triggers can reference the persistent scratch table. */
export function createPersistentTouchTriggers(table: string): string {
  const ident = quoteIdent(table);
  const literal = quoteLiteral(table);
  const trigger = (suffix: string, event: string): string =>
    `create trigger if not exists ${quoteIdent(`wheel_touch_${suffix}_${table}`)} ` +
    `after ${event} on ${ident} begin insert into wheel_touched (name) values (${literal}); end`;
  return [trigger('ins', 'insert'), trigger('upd', 'update'), trigger('del', 'delete')].join(';\n');
}

/** The parameterized sync_log insert returning the minted `seq`. Params: mutationId, mutationName, actor, clientId, committedMs, touchedJson. */
export const SYNC_LOG_INSERT = `insert into ${SYNC_LOG_TABLE}
  (mutation_id, mutation_name, actor, client_id, committed_ms, touched)
  values (?, ?, ?, ?, ?, ?) returning seq`;
