import type { Image } from '../../../types/image.js';
import type { SQLRunner } from './BaseSQLAdapter.js';
import { type ImageRow, imageFromRow } from './rowMappers.js';

/** Largest signed 64-bit integer; accepted as "no limit" by every dialect. */
const UNBOUNDED_LIMIT = '9223372036854775807';

/** Rows per `IN (...)` query, kept under each driver's bind-parameter cap. */
const IN_CLAUSE_CHUNK_SIZE = 500;

function assertNonNegativeInteger(name: string, value: number): void {
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new RangeError(
      `${name} must be a non-negative integer, received: ${value}`,
    );
  }
}

/** Joins conditions into a `WHERE` clause, or '' when there are none. */
export function buildWhereClause(conditions: string[]): string {
  return conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
}

/**
 * Builds `LIMIT`/`OFFSET`. The values are validated and inlined rather than
 * bound: MySQL prepared statements reject bound `LIMIT` parameters. SQLite,
 * MySQL and PostgreSQL all require a `LIMIT` before `OFFSET`, hence the
 * unbounded fallback.
 */
export function buildPaginationClause(page: {
  limit?: number;
  offset?: number;
}): string {
  const { limit, offset } = page;
  if (limit !== undefined) assertNonNegativeInteger('limit', limit);
  if (offset !== undefined) assertNonNegativeInteger('offset', offset);
  if (limit === undefined && offset === undefined) return '';
  return `LIMIT ${limit ?? UNBOUNDED_LIMIT} OFFSET ${offset ?? 0}`;
}

/** Loads images for many products in one query per chunk (avoids N+1). */
export async function loadImagesByProductId(
  db: SQLRunner,
  productIds: string[],
): Promise<Map<string, Image[]>> {
  const imagesByProductId = new Map<string, Image[]>();

  for (
    let start = 0;
    start < productIds.length;
    start += IN_CLAUSE_CHUNK_SIZE
  ) {
    const chunk = productIds.slice(start, start + IN_CLAUSE_CHUNK_SIZE);
    const placeholders = chunk.map(() => '?').join(', ');
    const rows = await db.all<ImageRow>(
      `SELECT * FROM occ_image WHERE product_id IN (${placeholders}) ORDER BY sort_order ASC`,
      chunk,
    );

    for (const row of rows) {
      const image = imageFromRow(row);
      const images = imagesByProductId.get(image.productId) ?? [];
      images.push(image);
      imagesByProductId.set(image.productId, images);
    }
  }

  return imagesByProductId;
}
