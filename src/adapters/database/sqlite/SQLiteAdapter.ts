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

export interface SQLiteConfig {
  /** Path to the SQLite database file. Use ':memory:' for an in-memory DB. */
  filename: string;
}

/**
 * Both SQLite drivers are synchronous and share one connection, so a
 * transaction is a `BEGIN` ... `COMMIT` around the work. Nothing else may
 * use the connection while it runs, which holds for the migration runner.
 */
async function runInTransaction<T>(
  runner: SQLRunner,
  work: (tx: SQLRunner) => Promise<T>,
): Promise<T> {
  await runner.run('BEGIN');
  try {
    const result = await work(runner);
    await runner.run('COMMIT');
    return result;
  } catch (error) {
    await runner.run('ROLLBACK').catch(() => {});
    throw error;
  }
}

class BunSQLiteRunner implements SQLRunner {
  readonly dialect = 'sqlite' as const;

  // biome-ignore lint/suspicious/noExplicitAny: bun:sqlite Database type
  constructor(private readonly db: any) {}

  transaction<T>(work: (tx: SQLRunner) => Promise<T>): Promise<T> {
    return runInTransaction(this, work);
  }

  async run(sql: string, params: unknown[] = []): Promise<void> {
    this.db.run(sql, params);
  }

  async all<T>(sql: string, params: unknown[] = []): Promise<T[]> {
    return this.db.query(sql).all(...params) as T[];
  }

  async get<T>(sql: string, params: unknown[] = []): Promise<T | undefined> {
    return this.db.query(sql).get(...params) as T | undefined;
  }
}

class BetterSqliteRunner implements SQLRunner {
  readonly dialect = 'sqlite' as const;

  // biome-ignore lint/suspicious/noExplicitAny: better-sqlite3 Database type
  constructor(private readonly db: any) {}

  transaction<T>(work: (tx: SQLRunner) => Promise<T>): Promise<T> {
    return runInTransaction(this, work);
  }

  async run(sql: string, params: unknown[] = []): Promise<void> {
    this.db.prepare(sql).run(...params);
  }

  async all<T>(sql: string, params: unknown[] = []): Promise<T[]> {
    return this.db.prepare(sql).all(...params) as T[];
  }

  async get<T>(sql: string, params: unknown[] = []): Promise<T | undefined> {
    return this.db.prepare(sql).get(...params) as T | undefined;
  }
}

interface SQLiteInstance {
  runner: SQLRunner;
  close(): void;
}

async function createSQLiteInstance(filename: string): Promise<SQLiteInstance> {
  // Try bun:sqlite first (zero-dependency in Bun runtime)
  try {
    const { Database } = await import('bun:sqlite');
    const db = new Database(filename);
    db.exec('PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON;');
    return {
      runner: new BunSQLiteRunner(db),
      close: () => db.close(),
    };
  } catch {
    // Fall back to better-sqlite3 (Node.js environments)
  }

  try {
    const { createRequire } = await import('node:module');
    const require = createRequire(import.meta.url);
    // biome-ignore lint/suspicious/noExplicitAny: dynamic require
    const Database = require('better-sqlite3') as any;
    const db = new Database(filename);
    db.pragma('journal_mode = WAL');
    db.pragma('foreign_keys = ON');
    return {
      runner: new BetterSqliteRunner(db),
      close: () => db.close(),
    };
  } catch {
    throw new Error(
      'No SQLite driver found. In Bun environments, bun:sqlite is built-in. ' +
        'In Node.js environments, run: bun add better-sqlite3',
    );
  }
}

/**
 * Defers opening the database until the first statement runs, so the adapter
 * (and its repositories) can be constructed synchronously. The connection is
 * opened once; concurrent first calls share the same attempt.
 */
class LazySQLiteRunner implements SQLRunner {
  readonly dialect = 'sqlite' as const;

  private instance?: Promise<SQLiteInstance>;

  constructor(private readonly filename: string) {}

  /** Opens the database if needed and returns the live instance. */
  connect(): Promise<SQLiteInstance> {
    this.instance ??= createSQLiteInstance(this.filename).catch(
      (error: unknown) => {
        // Let a later call retry instead of caching the failure.
        this.instance = undefined;
        throw error;
      },
    );
    return this.instance;
  }

  async run(sql: string, params?: unknown[]): Promise<void> {
    return (await this.connect()).runner.run(sql, params);
  }

  async all<T>(sql: string, params?: unknown[]): Promise<T[]> {
    return (await this.connect()).runner.all<T>(sql, params);
  }

  async get<T>(sql: string, params?: unknown[]): Promise<T | undefined> {
    return (await this.connect()).runner.get<T>(sql, params);
  }

  async transaction<T>(work: (tx: SQLRunner) => Promise<T>): Promise<T> {
    return (await this.connect()).runner.transaction(work);
  }

  /** Closes the connection if one was opened; safe to call repeatedly. */
  async close(): Promise<void> {
    const pending = this.instance;
    this.instance = undefined;
    if (!pending) return;
    const opened = await pending.catch(() => undefined);
    opened?.close();
  }
}

/**
 * SQLite database adapter. Uses bun:sqlite in Bun, better-sqlite3 in Node.js.
 * The repositories are usable straight after construction; the database is
 * opened on first use and `initialize()` only runs the migrations.
 */
export class SQLiteAdapter extends BaseSQLAdapter implements DatabaseAdapter {
  protected readonly db: LazySQLiteRunner;
  readonly products: ProductRepository;
  readonly categories: CategoryRepository;
  readonly images: ImageRepository;

  constructor(config: SQLiteConfig) {
    super();
    this.db = new LazySQLiteRunner(config.filename);
    this.products = new SQLProductRepository(this.db);
    this.categories = new SQLCategoryRepository(this.db);
    this.images = new SQLImageRepository(this.db);
  }

  /**
   * Opens the database (a no-op if it is already open) and migrates it.
   * Calling it again never opens a second connection.
   */
  override async initialize(): Promise<void> {
    await this.db.connect();
    await super.initialize();
  }

  protected get dialect(): SQLDialect {
    return 'sqlite';
  }

  protected tableExistsQuery(table: string): string {
    return `SELECT name FROM sqlite_master WHERE type='table' AND name='${table}'`;
  }

  async close(): Promise<void> {
    await this.db.close();
  }
}
