import { randomUUID } from 'node:crypto';

/**
 * Builds a collision-free storage key that keeps the original filename for
 * readability. Characters outside `[a-zA-Z0-9._-]` (including path
 * separators) are replaced so a filename can never address another path.
 */
export function generateStorageKey(filename: string): string {
  const safeName = filename.replace(/[^a-zA-Z0-9._-]/g, '_');
  return `${randomUUID()}-${safeName}`;
}

/** Strips `baseUrl/` from a public URL; null if the URL is not under it. */
export function keyFromUrl(url: string, baseUrl: string): string | null {
  const prefix = `${baseUrl}/`;
  return url.startsWith(prefix) ? url.slice(prefix.length) : null;
}
