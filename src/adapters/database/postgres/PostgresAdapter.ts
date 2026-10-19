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
import type { SQLDialect } from '../relational/migrations/index.js';

export interface PostgresConfig {
  /** postgres.js connection string, e.g. 'postgres://user:pass@host/db'. */
  url: string;
}

type Sql = import('postgres').Sql;

function loadDriver(): (url: string, options: object) => Sql {
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

/**
 * Rewrites the repositories' `?` placeholders to PostgreSQL's `$1, $2, ...`.
 * Safe because bound values never appear in the SQL text itself.
 */
export function toNumberedPlaceholders(query: string): string {
  let position = 0;
  return query.replace(/\?/g, () => `$${++position}`);
}

class PostgresSQLRunner implements SQLRunner {
  readonly dialect = 'postgres' as const;

  constructor(private readonly sql: Sql) {}

  async transaction<T>(work: (tx: SQLRunner) => Promise<T>): Promise<T> {
    // postgres.js commits when the callback resolves and rolls back when it throws.
    return (await this.sql.begin((tx) =>
      work(new PostgresSQLRunner(tx as unknown as Sql)),
    )) as T;
  }

  async run(query: string, params: unknown[] = []): Promise<void> {
    await this.execute(query, params);
  }

  async all<T>(query: string, params: unknown[] = []): Promise<T[]> {
    return (await this.execute(query, params)) as unknown as T[];
  }

  async get<T>(query: string, params: unknown[] = []): Promise<T | undefined> {
    return (await this.all<T>(query, params))[0];
  }

  private execute(query: string, params: unknown[]) {
    return this.sql.unsafe(toNumberedPlaceholders(query), params as never[]);
  }
}

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
    // `CREATE TABLE IF NOT EXISTS` raises a NOTICE on every start; drop them.
    this.sql = connect(config.url, { onnotice: () => {} });
    const runner = new PostgresSQLRunner(this.sql);
    this.db = runner;
    this.products = new SQLProductRepository(runner);
    this.categories = new SQLCategoryRepository(runner);
    this.images = new SQLImageRepository(runner);
  }

  protected get dialect(): SQLDialect {
    return 'postgres';
  }

  protected tableExistsQuery(table: string): string {
    return `SELECT table_name AS name FROM information_schema.tables WHERE table_schema = 'public' AND table_name = '${table}'`;
  }

  async close(): Promise<void> {
    await this.sql.end();
  }
}
