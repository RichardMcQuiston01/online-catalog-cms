import { initialMigration, mysqlInitialMigration } from './001_initial.js';
import { timestampsAndIndexesMigration } from './002_timestamps_and_indexes.js';
import type { Migration, SQLDialect } from './types.js';

export type { Migration, SQLDialect } from './types.js';

/**
 * Returns every migration for `dialect`, oldest first. Add new migrations
 * here; a dialect that needs different SQL for a step returns its own
 * `Migration` for that version instead of rewriting a shared script.
 */
export function migrationsFor(dialect: SQLDialect): Migration[] {
  return [
    dialect === 'mysql' ? mysqlInitialMigration : initialMigration,
    timestampsAndIndexesMigration(dialect),
  ];
}
