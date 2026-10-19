import { randomUUID } from 'node:crypto';

/**
 * The shape of every key `generateStorageKey` produces: a UUID, a dash, and
 * the sanitized filename. It contains no slash, query string or fragment.
 */
const STORAGE_KEY_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}-[a-zA-Z0-9._-]*$/;

/**
 * Builds a collision-free storage key that keeps the original filename for
 * readability. Characters outside `[a-zA-Z0-9._-]` (including path
 * separators) are replaced so a filename can never address another path.
 */
export function generateStorageKey(filename: string): string {
  const safeName = filename.replace(/[^a-zA-Z0-9._-]/g, '_');
  return `${randomUUID()}-${safeName}`;
}

/**
 * Extracts the storage key from a public URL, or returns null when the URL
 * is not one this package could have produced: outside `baseUrl`, carrying a
 * query string or fragment, or a key that `generateStorageKey` never makes.
 *
 * Deletion trusts this result, and URLs stored through `addUrl` are
 * caller-supplied, so a URL that merely sits under `baseUrl` must not be
 * enough to delete an arbitrary object or file.
 */
export function keyFromUrl(url: string, baseUrl: string): string | null {
  const prefix = `${baseUrl}/`;
  if (!url.startsWith(prefix)) return null;

  const key = url.slice(prefix.length);
  return STORAGE_KEY_PATTERN.test(key) ? key : null;
}
