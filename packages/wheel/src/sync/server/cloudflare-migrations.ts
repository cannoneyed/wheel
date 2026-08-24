/** Transactional application-schema migrations for Durable Object SQLite. */
import { SyncServerError } from './errors';
import type {
  DurableObjectSqlStorageLike,
  DurableObjectStorageLike
} from './backends/cloudflare-backend';
import { runDurableObjectSql } from './backends/cloudflare-backend';

/** One immutable, ordered application-schema change for Durable Object SQLite. */
export interface DurableObjectMigration {
  readonly version: number;
  readonly name: string;
  readonly statements: readonly string[];
}

/** Schema versions before and after one migration pass. */
export interface DurableObjectMigrationResult {
  readonly fromVersion: number;
  readonly toVersion: number;
  readonly applied: readonly number[];
}

/** Optional migration table name for an application that owns several schemas. */
export interface DurableObjectMigrationOptions {
  readonly tableName?: string;
}

const IDENTIFIER = /^[A-Za-z_][A-Za-z0-9_]*$/;

function validateMigrations(migrations: readonly DurableObjectMigration[]): void {
  for (const [index, migration] of migrations.entries()) {
    const expected = index + 1;
    if (migration.version !== expected) {
      throw new SyncServerError(
        'invalid_schema_migrations',
        `Migration ${index} must have version ${expected}; received ${migration.version}.`
      );
    }
    if (migration.name.trim() === '') {
      throw new SyncServerError(
        'invalid_schema_migrations',
        `Migration ${migration.version} must have a non-empty name.`
      );
    }
    if (migration.statements.length === 0) {
      throw new SyncServerError(
        'invalid_schema_migrations',
        `Migration ${migration.version} must contain at least one SQL statement.`
      );
    }
  }
}

function tableName(options: DurableObjectMigrationOptions): string {
  const name = options.tableName ?? '_wheel_schema_migrations';
  if (!IDENTIFIER.test(name)) {
    throw new SyncServerError(
      'invalid_schema_migrations',
      `Migration table name ${JSON.stringify(name)} is not a safe SQLite identifier.`
    );
  }
  return name;
}

async function migrationChecksum(migration: DurableObjectMigration): Promise<string> {
  const source = JSON.stringify({ name: migration.name, statements: migration.statements });
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(source));
  return [...new Uint8Array(digest)]
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('');
}

/**
 * Apply every pending migration in one Durable Object storage transaction.
 * Stored versions newer than the running code fail before the engine boots,
 * so an old deployment never opens a database changed by newer code.
 */
export async function applyDurableObjectMigrations(
  storage: DurableObjectStorageLike,
  migrations: readonly DurableObjectMigration[],
  options: DurableObjectMigrationOptions = {}
): Promise<DurableObjectMigrationResult> {
  validateMigrations(migrations);
  const table = tableName(options);
  const expectedHistory = await Promise.all(
    migrations.map(async (migration) => ({
      migration,
      checksum: await migrationChecksum(migration)
    }))
  );
  return storage.transaction(async () => {
    const sql: DurableObjectSqlStorageLike = storage.sql;
    runDurableObjectSql(
      sql,
      `create table if not exists ${table} (
        version integer primary key,
        name text not null,
        checksum text not null,
        applied_at text not null
      )`
    );
    const stored = runDurableObjectSql(
      sql,
      `select version, name, checksum from ${table} order by version`
    ).map((row) => ({
      version: Number(row.version),
      name: String(row.name),
      checksum: String(row.checksum)
    }));
    const currentVersion = migrations.length;
    const storedVersion = stored.at(-1)?.version ?? 0;
    if (storedVersion > currentVersion) {
      throw new SyncServerError(
        'schema_too_new',
        `SQLite schema version ${storedVersion} is newer than this deployment's version ${currentVersion}.`
      );
    }
    for (const [index, row] of stored.entries()) {
      const expectedVersion = index + 1;
      if (row.version !== expectedVersion) {
        throw new SyncServerError(
          'schema_history_changed',
          `Stored migration history expected version ${expectedVersion}, but found ${row.version}.`
        );
      }
      const expected = expectedHistory[row.version - 1];
      if (
        !expected ||
        expected.migration.name !== row.name ||
        expected.checksum !== row.checksum
      ) {
        throw new SyncServerError(
          'schema_history_changed',
          `Stored migration ${row.version} does not match this deployment's name and SQL checksum.`
        );
      }
    }
    const applied: number[] = [];
    for (const { migration, checksum } of expectedHistory.slice(storedVersion)) {
      for (const statement of migration.statements) runDurableObjectSql(sql, statement);
      runDurableObjectSql(
        sql,
        `insert into ${table} (version, name, checksum, applied_at)
         values (?, ?, ?, strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))`,
        [migration.version, migration.name, checksum]
      );
      applied.push(migration.version);
    }
    return {
      fromVersion: storedVersion,
      toVersion: currentVersion,
      applied
    };
  });
}
