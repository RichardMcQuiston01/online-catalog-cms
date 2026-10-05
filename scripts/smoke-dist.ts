import { readFileSync } from 'node:fs';
/**
 * Verifies the built package works from `dist/` alone, the way npm
 * consumers load it. Source-level tests cannot catch assets (such as
 * migration SQL) that are missing from the bundle, or a Node built-in that
 * leaks into the browser entry point.
 */
import { builtinModules } from 'node:module';
import { dirname, resolve } from 'node:path';
import { SQLiteAdapter } from '../dist/index.js';

const distDir: string = resolve(import.meta.dirname, '../dist');
const failures: string[] = [];

/** Entry points that must load and export the named values. */
const entryPoints: Record<string, string[]> = {
  index: ['OnlineCatalog', 'SQLiteAdapter', 'LocalStorageAdapter'],
  browser: ['OnlineCatalog', 'ExternalURLAdapter', 'document'],
  sqlite: ['SQLiteAdapter'],
  postgres: ['PostgresAdapter'],
  mysql: ['MySQLAdapter'],
  redis: ['RedisAdapter'],
  mongodb: ['MongoDBAdapter'],
  'storage-local': ['LocalStorageAdapter'],
  'storage-s3': ['S3Adapter'],
};

/** Names the browser entry point must never expose. */
const serverOnlyExports: string[] = [
  'SQLiteAdapter',
  'PostgresAdapter',
  'MySQLAdapter',
  'RedisAdapter',
  'MongoDBAdapter',
  'LocalStorageAdapter',
  'S3Adapter',
];

const importPattern =
  /(?:\bimport|\bexport)\s[^'"`;]*?\sfrom\s*['"]([^'"]+)['"]|\bimport\s*['"]([^'"]+)['"]|\bimport\(\s*['"]([^'"]+)['"]\s*\)|\brequire\(\s*['"]([^'"]+)['"]\s*\)/g;

function isNodeBuiltin(specifier: string): boolean {
  return (
    specifier.startsWith('node:') ||
    specifier.startsWith('bun:') ||
    builtinModules.includes(specifier)
  );
}

/**
 * Walks every file reachable from `entryFile` and reports each import that is
 * not a relative path. The browser entry point must have none: no Node
 * built-ins and no third-party packages that the consumer would have to
 * install or polyfill.
 */
function findNonRelativeImports(entryFile: string): string[] {
  const seen = new Set<string>();
  const found: string[] = [];
  const queue: string[] = [entryFile];

  while (queue.length > 0) {
    const file = queue.pop() as string;
    if (seen.has(file)) continue;
    seen.add(file);

    const source: string = readFileSync(file, 'utf8');
    for (const match of source.matchAll(importPattern)) {
      const specifier: string | undefined =
        match[1] ?? match[2] ?? match[3] ?? match[4];
      if (!specifier) continue;
      if (specifier.startsWith('.')) {
        queue.push(resolve(dirname(file), specifier));
      } else {
        found.push(`${specifier} (in ${file.slice(distDir.length + 1)})`);
      }
    }
  }
  return found;
}

// 1. The SQLite adapter works from dist/ alone.
const adapter = new SQLiteAdapter({ filename: ':memory:' });
await adapter.initialize();
const result = await adapter.verify();
await adapter.close();
if (!result.ok) {
  failures.push(`SQLite verify failed: ${result.issues.join('; ')}`);
}

// 2. Every entry point loads and exports what it should.
for (const [name, expectedExports] of Object.entries(entryPoints)) {
  for (const extension of ['js', 'cjs']) {
    const file: string = resolve(distDir, `${name}.${extension}`);
    try {
      const loaded: Record<string, unknown> = await import(file);
      for (const exportName of expectedExports) {
        if (loaded[exportName] === undefined) {
          failures.push(
            `${name}.${extension} is missing export "${exportName}"`,
          );
        }
      }
    } catch (error) {
      failures.push(
        `${name}.${extension} failed to load: ${(error as Error).message}`,
      );
    }
  }
}

// 3. The browser entry point has no runtime imports of Node built-ins (or any
// other non-relative module) and does not expose the server adapters.
for (const extension of ['js', 'cjs']) {
  const file: string = resolve(distDir, `browser.${extension}`);
  for (const found of findNonRelativeImports(file)) {
    const kind: string = isNodeBuiltin(found.split(' ')[0] as string)
      ? 'Node built-in'
      : 'external module';
    failures.push(`browser.${extension} imports a ${kind}: ${found}`);
  }
  const loaded: Record<string, unknown> = await import(file);
  for (const exportName of serverOnlyExports) {
    if (exportName in loaded) {
      failures.push(`browser.${extension} must not export "${exportName}"`);
    }
  }
}

if (failures.length > 0) {
  console.error(`dist smoke test failed:\n- ${failures.join('\n- ')}`);
  process.exit(1);
}
console.log('dist smoke test passed');
