import type { SqliteDriver } from 'wheel/sync/server';

/** Each `*.server.ts` exports its own DDL; `schema.ts` concatenates them. */
const TODOS_DDL = [
  `create table if not exists todos (
     id text primary key,
     title text not null,
     done integer not null default 0,
     position real not null default 0)`
] as const;

/** Append-only: version 1 is frozen the moment it runs anywhere. */
const migrations = [
  { version: 1, name: 'initial_schema', statements: TODOS_DDL },
  {
    version: 2,
    name: 'add_due_date',
    statements: ['alter table todos add column due_at bigint']
  }
] as const;

/** Apply every unapplied version once, inside one write transaction. */
export function applyMigrations(driver: SqliteDriver): void {
  driver.exec('begin immediate');
  try {
    driver.exec(
      `create table if not exists _schema_migrations (
         version integer primary key,
         name text not null,
         applied_at text not null)`
    );
    const applied = new Set(
      driver
        .all('select version from _schema_migrations')
        .map((row) => Number(row.version))
    );
    for (const migration of migrations) {
      if (applied.has(migration.version)) continue;
      for (const statement of migration.statements) driver.exec(statement);
      driver.all(
        `insert into _schema_migrations (version, name, applied_at)
         values (?, ?, strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))`,
        [migration.version, migration.name]
      );
    }
    driver.exec('commit');
  } catch (error) {
    driver.exec('rollback');
    throw error;
  }
}
