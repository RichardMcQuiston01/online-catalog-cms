import type { VerificationResult } from '../../../interfaces/DatabaseAdapter.js';
import {
  type Migration,
  type SQLDialect,
  migrationsFor,
} from './migrations/index.js';

export interface SQLRunner {
  /** The dialect this connection speaks. */
  readonly dialect: SQLDialect;
  /** Execute a statement that returns no rows. */
  run(sql: string, params?: unknown[]): Promise<void>;
  /** Execute a query and return all rows. */
  all<T>(sql: string, params?: unknown[]): Promise<T[]>;
  /** Execute a query and return the first row, or undefined. */
  get<T>(sql: string, params?: unknown[]): Promise<T | undefined>;
  /**
   * Runs `work` in a transaction on one connection: it commits when `work`
   * resolves and rolls back when it throws. Use the runner passed to `work`,
   * not this one, for the statements that belong to the transaction.
   */
  transaction<T>(work: (tx: SQLRunner) => Promise<T>): Promise<T>;
}

/** The bookkeeping table is created before any migration so the runner can read it. */
const CREATE_MIGRATION_TABLE = `CREATE TABLE IF NOT EXISTS occ_migration (
  version     INTEGER       NOT NULL PRIMARY KEY,
  applied_at  TIMESTAMP     NOT NULL
)`;

const RECORD_MIGRATION =
  'INSERT INTO occ_migration (version, applied_at) VALUES (?, CURRENT_TIMESTAMP)';

const REQUIRED_TABLES = [
  'occ_category',
  'occ_product',
  'occ_image',
  'occ_migration',
] as const;

/**
 * Shared logic for relational SQL adapters: the migration runner and schema
 * verification. Concrete adapters extend this and supply a `SQLRunner`.
 */
export abstract class BaseSQLAdapter {
  protected abstract readonly db: SQLRunner;

  /** Which dialect's migrations to apply. */
  protected abstract get dialect(): SQLDialect;

  /** Dialect-specific table existence query — must return rows with a `name` column. */
  protected abstract tableExistsQuery(table: string): string;

  /** Every migration for this adapter's dialect, oldest first. */
  protected get migrations(): Migration[] {
    return migrationsFor(this.dialect);
  }

  /**
   * Applies the migrations that `occ_migration` does not list yet, in order.
   * Each runs in its own transaction together with the row that records it,
   * so a failure leaves the database at the last fully applied version.
   * (MySQL commits DDL implicitly, so there a failed migration can leave
   * its earlier statements applied; keep MySQL statements re-runnable.)
   */
  async initialize(): Promise<void> {
    await this.db.run(CREATE_MIGRATION_TABLE);
    const applied = await this.appliedVersion();
    const migrations = this.migrations;

    const latest = migrations.at(-1)?.version ?? 0;
    if (applied > latest) {
      throw new Error(
        `The database is at migration ${applied}, newer than the latest migration (${latest}) this version of online-catalog-cms knows. Upgrade the package before using this database.`,
      );
    }

    for (const migration of migrations) {
      if (migration.version <= applied) continue;
      await this.db.transaction(async (tx) => {
        for (const statement of migration.statements) {
          await tx.run(statement);
        }
        await tx.run(RECORD_MIGRATION, [migration.version]);
      });
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

    if (issues.length === 0) {
      const applied = await this.appliedVersion();
      const latest = this.migrations.at(-1)?.version ?? 0;
      if (applied < latest) {
        issues.push(
          `Schema is at migration ${applied} but ${latest} is required. Call initialize() to apply the pending migrations.`,
        );
      }
    }

    return { ok: issues.length === 0, issues };
  }

  /** Highest applied migration version, or 0 for a database with none. */
  private async appliedVersion(): Promise<number> {
    const row = await this.db.get<{ version: number | string | null }>(
      'SELECT MAX(version) AS version FROM occ_migration',
    );
    return Number(row?.version ?? 0);
  }
}
