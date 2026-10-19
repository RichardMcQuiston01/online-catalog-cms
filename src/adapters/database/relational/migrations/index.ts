import { initialMigration } from './001_initial.js';
import type { Migration, SQLDialect } from './types.js';

export type { Migration, SQLDialect } from './types.js';

/**
 * Returns every migration for `dialect`, oldest first. Add new migrations
 * here; a dialect that needs different SQL for a step returns its own
 * `Migration` for that version instead of rewriting a shared script.
 */
export function migrationsFor(_dialect: SQLDialect): Migration[] {
  return [initialMigration];
}
