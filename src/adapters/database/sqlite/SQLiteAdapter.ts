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

export interface SQLiteConfig {
  /** Path to the SQLite database file. Use ':memory:' for an in-memory DB. */
  filename: string;
}

class BunSQLiteRunner implements SQLRunner {
  // biome-ignore lint/suspicious/noExplicitAny: bun:sqlite Database type
  constructor(private readonly db: any) {}

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
  // biome-ignore lint/suspicious/noExplicitAny: better-sqlite3 Database type
  constructor(private readonly db: any) {}

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

/** SQLite database adapter. Uses bun:sqlite in Bun, better-sqlite3 in Node.js. */
export class SQLiteAdapter extends BaseSQLAdapter implements DatabaseAdapter {
  private runner?: SQLRunner;
  private closeHandle?: () => void;
  private readonly config: SQLiteConfig;

  private _products?: ProductRepository;
  private _categories?: CategoryRepository;
  private _images?: ImageRepository;

  constructor(config: SQLiteConfig) {
    super();
    this.config = config;
  }

  protected get db(): SQLRunner {
    if (!this.runner) throw new Error('Call initialize() first');
    return this.runner;
  }

  get products(): ProductRepository {
    if (!this._products) throw new Error('Call initialize() first');
    return this._products;
  }

  get categories(): CategoryRepository {
    if (!this._categories) throw new Error('Call initialize() first');
    return this._categories;
  }

  get images(): ImageRepository {
    if (!this._images) throw new Error('Call initialize() first');
    return this._images;
  }

  /** Opens the database with whichever SQLite driver is available, then migrates. */
  override async initialize(): Promise<void> {
    const { runner, close } = await createSQLiteInstance(this.config.filename);
    this.runner = runner;
    this._products = new SQLProductRepository(runner);
    this._categories = new SQLCategoryRepository(runner);
    this._images = new SQLImageRepository(runner);
    this.closeHandle = close;

    await super.initialize();
  }

  protected get migrationSql(): string {
    return INITIAL_MIGRATION_SQL;
  }

  protected tableExistsQuery(table: string): string {
    return `SELECT name FROM sqlite_master WHERE type='table' AND name='${table}'`;
  }

  async close(): Promise<void> {
    this.closeHandle?.();
  }
}
