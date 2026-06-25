import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import type {
  CategoryRepository,
  DatabaseAdapter,
  ImageRepository,
  ProductRepository,
  VerificationResult,
} from '../../../interfaces/DatabaseAdapter.js';
import {
  BaseSQLAdapter,
  type SQLRunner,
} from '../relational/BaseSQLAdapter.js';
import { SQLCategoryRepository } from '../relational/SQLCategoryRepository.js';
import { SQLImageRepository } from '../relational/SQLImageRepository.js';
import { SQLProductRepository } from '../relational/SQLProductRepository.js';

export interface PostgresConfig {
  /** postgres.js connection string or config object. */
  url: string;
}

type Sql = import('postgres').Sql;

function loadDriver(): (url: string) => Sql {
  try {
    const require = createRequire(import.meta.url);
    // postgres.js exports the connection factory as default
    // biome-ignore lint/suspicious/noExplicitAny: dynamic require
    const mod = require('postgres') as any;
    return mod.default ?? mod;
  } catch {
    throw new Error('postgres is not installed. Run: bun add postgres');
  }
}

class PostgresSQLRunner implements SQLRunner {
  constructor(private readonly sql: Sql) {}

  async run(query: string, params: unknown[] = []): Promise<void> {
    await this.sql.unsafe(query, params as never[]);
  }

  async all<T>(query: string, params: unknown[] = []): Promise<T[]> {
    const rows = await this.sql.unsafe(query, params as never[]);
    return rows as unknown as T[];
  }

  async get<T>(query: string, params: unknown[] = []): Promise<T | undefined> {
    const rows = await this.sql.unsafe(query, params as never[]);
    return (rows as unknown as T[])[0];
  }
}

const __dirname = fileURLToPath(new URL('.', import.meta.url));
const MIGRATION_PATH = join(
  __dirname,
  '../relational/migrations/001_initial.sql',
);

/** PostgreSQL database adapter using postgres.js. */
export class PostgresAdapter extends BaseSQLAdapter implements DatabaseAdapter {
  protected readonly db: SQLRunner;
  readonly products: ProductRepository;
  readonly categories: CategoryRepository;
  readonly images: ImageRepository;

  private readonly sql: Sql;

  constructor(config: PostgresConfig) {
    super();
    const connect = loadDriver();
    this.sql = connect(config.url);
    const runner = new PostgresSQLRunner(this.sql);
    this.db = runner;
    this.products = new SQLProductRepository(runner);
    this.categories = new SQLCategoryRepository(runner);
    this.images = new SQLImageRepository(runner);
  }

  protected get migrationSql(): string {
    return readFileSync(MIGRATION_PATH, 'utf8');
  }

  protected tableExistsQuery(table: string): string {
    return `SELECT table_name AS name FROM information_schema.tables WHERE table_schema = 'public' AND table_name = '${table}'`;
  }

  override async verify(): Promise<VerificationResult> {
    return super.verify();
  }

  async close(): Promise<void> {
    await this.sql.end();
  }
}
