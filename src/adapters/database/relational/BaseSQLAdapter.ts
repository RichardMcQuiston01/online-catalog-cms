import type { VerificationResult } from '../../../interfaces/DatabaseAdapter.js';

export interface SQLRunner {
  /** Execute a statement that returns no rows. */
  run(sql: string, params?: unknown[]): Promise<void>;
  /** Execute a query and return all rows. */
  all<T>(sql: string, params?: unknown[]): Promise<T[]>;
  /** Execute a query and return the first row, or undefined. */
  get<T>(sql: string, params?: unknown[]): Promise<T | undefined>;
}

const REQUIRED_TABLES = [
  'occ_category',
  'occ_product',
  'occ_image',
  'occ_migration',
] as const;

/**
 * Shared logic for relational SQL adapters: migration runner and schema
 * verification. Concrete adapters extend this and supply a `SQLRunner`.
 */
export abstract class BaseSQLAdapter {
  protected abstract readonly db: SQLRunner;

  /** Dialect-specific table existence query — must return rows with a `name` column. */
  protected abstract tableExistsQuery(table: string): string;

  /** Migration script for this dialect; every statement must be idempotent. */
  protected abstract get migrationSql(): string;

  /**
   * Runs the migration statement by statement, as most drivers reject
   * multi-statement strings. Splitting on ';' means the script must not
   * contain semicolons inside string literals or comments.
   */
  async initialize(): Promise<void> {
    const statements = this.migrationSql
      .split(';')
      .map((s) => s.trim())
      .filter((s) => s.length > 0);

    for (const stmt of statements) {
      await this.db.run(stmt);
    }
  }

  async verify(): Promise<VerificationResult> {
    const issues: string[] = [];

    for (const table of REQUIRED_TABLES) {
      const row = await this.db.get<{ name: string }>(
        this.tableExistsQuery(table),
      );
      if (!row) {
        issues.push(`Missing table: ${table}`);
      }
    }

    return { ok: issues.length === 0, issues };
  }
}
