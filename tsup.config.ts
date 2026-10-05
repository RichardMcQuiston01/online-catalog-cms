import { defineConfig } from 'tsup';

export default defineConfig({
  // One output file per package entry point (see `exports` in package.json).
  // `browser` must stay free of Node built-ins; `smoke:dist` checks it.
  entry: {
    index: 'src/index.ts',
    browser: 'src/browser.ts',
    sqlite: 'src/sqlite.ts',
    postgres: 'src/postgres.ts',
    mysql: 'src/mysql.ts',
    redis: 'src/redis.ts',
    mongodb: 'src/mongodb.ts',
    'storage-local': 'src/storage-local.ts',
    'storage-s3': 'src/storage-s3.ts',
  },
  format: ['esm', 'cjs'],
  dts: true,
  clean: true,
  sourcemap: true,
  // Share code between entry points so a class (e.g. BaseSQLAdapter) exists
  // once at runtime, not once per entry.
  splitting: true,
  treeshake: true,
});
