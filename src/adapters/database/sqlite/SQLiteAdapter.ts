import { readFileSync } from 'node:fs';
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

export interface SQLiteConfig {
  /** Path to the SQLite database file. Use ':memory:' for an in-memory DB. */
  filename: string;
}

// ── Bun:sqlite runner ────────────────────────────────────────────────────────

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

// ── better-sqlite3 runner ────────────────────────────────────────────────────

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

// ── Factory: pick the available driver ───────────────────────────────────────

interface SQLiteInstance {
  runner: SQLRunner;
  // biome-ignore lint/suspicious/noExplicitAny: driver-specific handle
  instance: any;
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
      instance: db,
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
      instance: db,
      close: () => db.close(),
    };
  } catch {
    throw new Error(
      'No SQLite driver found. In Bun environments, bun:sqlite is built-in. ' +
        'In Node.js environments, run: bun add better-sqlite3',
    );
  }
}

// ── Adapter ──────────────────────────────────────────────────────────────────

const __dirname = fileURLToPath(new URL('.', import.meta.url));
const MIGRATION_PATH = join(
  __dirname,
  '../relational/migrations/001_initial.sql',
);

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

  /** Must be called before any other method. Sets up the SQLite driver. */
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
    return readFileSync(MIGRATION_PATH, 'utf8');
  }

  protected tableExistsQuery(table: string): string {
    return `SELECT name FROM sqlite_master WHERE type='table' AND name='${table}'`;
  }

  override async verify(): Promise<VerificationResult> {
    return super.verify();
  }

  async close(): Promise<void> {
    this.closeHandle?.();
  }
}
