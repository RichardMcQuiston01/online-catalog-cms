/**
 * Initializes the OnlineCatalog instance used by the demo pages.
 * Uses an in-memory IndexedDB-backed shim so the demo runs entirely in the
 * browser with no server required.
 *
 * Since we cannot run bun:sqlite in the browser, the demo uses a simple
 * localStorage-backed in-memory store exposed through a compatible adapter.
 */
import { InMemoryAdapter } from './in-memory-adapter.js';

/** @type {import('./in-memory-adapter.js').InMemoryAdapter} */
let _adapter = null;

export async function getCatalog() {
  if (!_adapter) {
    _adapter = new InMemoryAdapter();
    await _adapter.initialize();

    // Seed demo categories if empty
    const cats = await _adapter.categories.list();
    if (cats.length === 0) {
      await _adapter.categories.create({ name: 'Electronics', slug: 'electronics' });
      await _adapter.categories.create({ name: 'Clothing', slug: 'clothing' });
      await _adapter.categories.create({ name: 'Books', slug: 'books' });
    }
  }
  return _adapter;
}
