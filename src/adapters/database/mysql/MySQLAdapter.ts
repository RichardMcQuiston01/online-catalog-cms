import type { EventEmitter } from 'node:events';
import { createRequire } from 'node:module';
import type {
  CategoryRepository,
  DatabaseAdapter,
  ImageRepository,
  ProductRepository,
} from '../../../interfaces/DatabaseAdapter.js';
import {
  type ConnectionErrorHandler,
  resolveErrorHandler,
} from '../errorHandler.js';
import {
  BaseSQLAdapter,
  type SQLRunner,
} from '../relational/BaseSQLAdapter.js';
import { SQLCategoryRepository } from '../relational/SQLCategoryRepository.js';
import { SQLImageRepository } from '../relational/SQLImageRepository.js';
import { SQLProductRepository } from '../relational/SQLProductRepository.js';
import type { SQLDialect } from '../relational/migrations/index.js';

export interface MySQLConfig {
  host: string;
  port?: number;
  user: string;
  password: string;
  database: string;
  /**
   * Called when the pool emits `error`, e.g. the server closed an idle
   * connection. Defaults to logging with `console.error`.
   */
  onError?: ConnectionErrorHandler;
}

type Pool = import('mysql2/promise').Pool;
type PoolConfig = Omit<MySQLConfig, 'onError'> & { timezone?: string };

function loadDriver(): {
  createPool: (config: PoolConfig) => Pool;
} {
  try {
    const require = createRequire(import.meta.url);
    return require('mysql2/promise') as {
      createPool: (config: PoolConfig) => Pool;
    };
  } catch {
    throw new Error('mysql2 is not installed. Run: bun add mysql2');
  }
}

type Connection = import('mysql2/promise').PoolConnection;

/** The part of a pool or a pooled connection the runner needs. */
interface Executor {
  // biome-ignore lint/suspicious/noExplicitAny: mysql2 ExecuteValues
  execute(query: string, params: any[]): Promise<[unknown, unknown]>;
}

/** mysql2 types bind parameters as `any[]`, hence the casts below. */
class MySQLSQLRunner implements SQLRunner {
  readonly dialect = 'mysql' as const;

  constructor(
    private readonly executor: Executor,
    private readonly pool?: Pool,
  ) {}

  async run(query: string, params: unknown[] = []): Promise<void> {
    // biome-ignore lint/suspicious/noExplicitAny: mysql2 ExecuteValues
    await this.executor.execute(query, params as any[]);
  }

  async all<T>(query: string, params: unknown[] = []): Promise<T[]> {
    // biome-ignore lint/suspicious/noExplicitAny: mysql2 ExecuteValues
    const [rows] = await this.executor.execute(query, params as any[]);
    return rows as T[];
  }

  async get<T>(query: string, params: unknown[] = []): Promise<T | undefined> {
    return (await this.all<T>(query, params))[0];
  }

  /** A transaction needs one connection for all its statements. */
  async transaction<T>(work: (tx: SQLRunner) => Promise<T>): Promise<T> {
    if (!this.pool) return work(this); // already inside a transaction
    const connection: Connection = await this.pool.getConnection();
    try {
      await connection.beginTransaction();
      const result = await work(new MySQLSQLRunner(connection));
      await connection.commit();
      return result;
    } catch (error) {
      await connection.rollback().catch(() => {});
      throw error;
    } finally {
      connection.release();
    }
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
    const { onError, ...poolConfig } = config;
    // UTC makes the Date values bound to DATETIME(3) columns unambiguous.
    this.pool = createPool({ timezone: 'Z', ...poolConfig });
    // Without a listener, an `error` event on the pool exits the process.
    (this.pool as unknown as EventEmitter).on(
      'error',
      resolveErrorHandler('MySQL', onError),
    );
    const runner = new MySQLSQLRunner(this.pool, this.pool);
    this.db = runner;
    this.products = new SQLProductRepository(runner);
    this.categories = new SQLCategoryRepository(runner);
    this.images = new SQLImageRepository(runner);
  }

  protected get dialect(): SQLDialect {
    return 'mysql';
  }

  protected tableExistsQuery(table: string): string {
    return `SELECT table_name AS name FROM information_schema.tables WHERE table_schema = DATABASE() AND table_name = '${table}'`;
  }

  async close(): Promise<void> {
    await this.pool.end();
  }
}
