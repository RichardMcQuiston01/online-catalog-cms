import { createRequire } from 'node:module';
import type {
  CategoryRepository,
  DatabaseAdapter,
  ImageRepository,
  ProductRepository,
} from '../../../interfaces/DatabaseAdapter.js';
import {
  BaseSQLAdapter,
  type SQLRunner,
} from '../relational/BaseSQLAdapter.js';
import { SQLCategoryRepository } from '../relational/SQLCategoryRepository.js';
import { SQLImageRepository } from '../relational/SQLImageRepository.js';
import { SQLProductRepository } from '../relational/SQLProductRepository.js';
import { INITIAL_MIGRATION_SQL } from '../relational/migrations/001_initial.js';

export interface MySQLConfig {
  host: string;
  port?: number;
  user: string;
  password: string;
  database: string;
}

type Pool = import('mysql2/promise').Pool;

function loadDriver(): { createPool: (config: MySQLConfig) => Pool } {
  try {
    const require = createRequire(import.meta.url);
    return require('mysql2/promise') as {
      createPool: (config: MySQLConfig) => Pool;
    };
  } catch {
    throw new Error('mysql2 is not installed. Run: bun add mysql2');
  }
}

/** mysql2 types bind parameters as `any[]`, hence the casts below. */
class MySQLSQLRunner implements SQLRunner {
  constructor(private readonly pool: Pool) {}

  async run(query: string, params: unknown[] = []): Promise<void> {
    // biome-ignore lint/suspicious/noExplicitAny: mysql2 ExecuteValues
    await this.pool.execute(query, params as any[]);
  }

  async all<T>(query: string, params: unknown[] = []): Promise<T[]> {
    // biome-ignore lint/suspicious/noExplicitAny: mysql2 ExecuteValues
    const [rows] = await this.pool.execute(query, params as any[]);
    return rows as T[];
  }

  async get<T>(query: string, params: unknown[] = []): Promise<T | undefined> {
    // biome-ignore lint/suspicious/noExplicitAny: mysql2 ExecuteValues
    const [rows] = await this.pool.execute(query, params as any[]);
    return (rows as T[])[0];
  }
}

/** MySQL / MariaDB adapter using mysql2. */
export class MySQLAdapter extends BaseSQLAdapter implements DatabaseAdapter {
  protected readonly db: SQLRunner;
  readonly products: ProductRepository;
  readonly categories: CategoryRepository;
  readonly images: ImageRepository;

  private readonly pool: Pool;

  constructor(config: MySQLConfig) {
    super();
    const { createPool } = loadDriver();
    this.pool = createPool(config);
    const runner = new MySQLSQLRunner(this.pool);
    this.db = runner;
    this.products = new SQLProductRepository(runner);
    this.categories = new SQLCategoryRepository(runner);
    this.images = new SQLImageRepository(runner);
  }

  protected get migrationSql(): string {
    // MySQL has no `ON CONFLICT`; `INSERT IGNORE` keeps re-runs idempotent.
    return INITIAL_MIGRATION_SQL.replace(
      'INSERT INTO occ_migration',
      'INSERT IGNORE INTO occ_migration',
    ).replace(/\s*ON CONFLICT \(version\) DO NOTHING/g, '');
  }

  protected tableExistsQuery(table: string): string {
    return `SELECT table_name AS name FROM information_schema.tables WHERE table_schema = DATABASE() AND table_name = '${table}'`;
  }

  async close(): Promise<void> {
    await this.pool.end();
  }
}
