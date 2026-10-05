/**
 * Full entry point for Node, Bun and Deno: the platform-neutral core plus
 * every database and storage adapter.
 *
 * Browser bundlers resolve the `browser` export condition instead and get
 * `./browser.ts` (no adapters, no Node built-ins). Server code can also import
 * each adapter from its own subpath, e.g. `.../sqlite` or `.../storage/s3`.
 */
export * from './browser.js';

// Database adapters
export { SQLiteAdapter } from './adapters/database/sqlite/SQLiteAdapter.js';
export type { SQLiteConfig } from './adapters/database/sqlite/SQLiteAdapter.js';
export { PostgresAdapter } from './adapters/database/postgres/PostgresAdapter.js';
export type { PostgresConfig } from './adapters/database/postgres/PostgresAdapter.js';
export { MySQLAdapter } from './adapters/database/mysql/MySQLAdapter.js';
export type { MySQLConfig } from './adapters/database/mysql/MySQLAdapter.js';
export { RedisAdapter } from './adapters/database/redis/RedisAdapter.js';
export type { RedisConfig } from './adapters/database/redis/RedisAdapter.js';
export { MongoDBAdapter } from './adapters/database/mongodb/MongoDBAdapter.js';
export type { MongoDBConfig } from './adapters/database/mongodb/MongoDBAdapter.js';

// Storage adapters (ExternalURLAdapter is exported from ./browser.js)
export { LocalStorageAdapter } from './adapters/storage/local/LocalStorageAdapter.js';
export type { LocalStorageConfig } from './adapters/storage/local/LocalStorageAdapter.js';
export { S3Adapter } from './adapters/storage/s3/S3Adapter.js';
export type { S3Config } from './adapters/storage/s3/S3Adapter.js';
