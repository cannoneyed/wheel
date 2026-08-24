import type { SqliteDriver } from 'wheel/sync/server';

import { ACTIVITY_DDL } from '../src/sync/activity.server';
import { COMMENTS_DDL } from '../src/sync/comments.server';
import { CYCLES_DDL } from '../src/sync/cycles.server';
import { FAVORITES_DDL } from '../src/sync/favorites.server';
import { INBOX_DDL } from '../src/sync/inbox.server';
import { ISSUES_DDL } from '../src/sync/issues.server';
import { PROJECTS_DDL } from '../src/sync/projects.server';
import { SEARCH_DDL } from '../src/sync/search.server';
import { TEAMS_DDL } from '../src/sync/teams.server';
import { VIEWS_DDL } from '../src/sync/views.server';

/** Current application DDL. Tests and migration 1 execute this exact list. */
export const TRACKER_DDL = [
  ...TEAMS_DDL,
  ...ISSUES_DDL,
  ...COMMENTS_DDL,
  ...ACTIVITY_DDL,
  ...PROJECTS_DDL,
  ...CYCLES_DDL,
  ...INBOX_DDL,
  ...VIEWS_DDL,
  ...FAVORITES_DDL,
  ...SEARCH_DDL
] as const;

export const TRACKER_MIGRATIONS = [
  {
    version: 1,
    name: 'initial_tracker_schema',
    statements: TRACKER_DDL
  }
] as const;

export const TRACKER_MIGRATION_TABLE_DDL = `create table if not exists _axle_schema_migrations (
  version integer primary key,
  name text not null,
  applied_at text not null)`;

/**
 * Apply each schema version once in one SQLite transaction. Future schema
 * changes append a migration; production never relies on seed-time DDL.
 */
export function applyTrackerMigrations(driver: SqliteDriver): void {
  driver.exec('begin immediate');
  try {
    driver.exec(TRACKER_MIGRATION_TABLE_DDL);
    const applied = new Set(
      driver
        .all('select version from _axle_schema_migrations')
        .map((row) => Number(row.version))
    );
    for (const migration of TRACKER_MIGRATIONS) {
      if (applied.has(migration.version)) continue;
      for (const statement of migration.statements) driver.exec(statement);
      driver.all(
        `insert into _axle_schema_migrations (version, name, applied_at)
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
