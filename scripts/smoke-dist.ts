/**
 * Verifies the built package works from `dist/` alone, the way npm
 * consumers load it. Source-level tests cannot catch assets (such as
 * migration SQL) that are missing from the bundle.
 */
import { SQLiteAdapter } from '../dist/index.js';

const adapter = new SQLiteAdapter({ filename: ':memory:' });
await adapter.initialize();
const result = await adapter.verify();
await adapter.close();

if (!result.ok) {
  console.error(`dist smoke test failed: ${result.issues.join('; ')}`);
  process.exit(1);
}
console.log('dist smoke test passed');
