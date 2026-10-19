import type { Image } from '../../../types/image.js';
import type { SQLRunner } from './BaseSQLAdapter.js';
import { type ImageRow, imageFromRow } from './rowMappers.js';

/** Rows per `IN (...)` query, kept under each driver's bind-parameter cap. */
const IN_CLAUSE_CHUNK_SIZE = 500;

/** Joins conditions into a `WHERE` clause, or '' when there are none. */
export function buildWhereClause(conditions: string[]): string {
  return conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
}

/**
 * Builds `LIMIT`/`OFFSET` from an already validated page. The numbers are
 * inlined rather than bound because MySQL prepared statements reject bound
 * `LIMIT` parameters; `resolveProductFilter` and `resolveCategoryFilter`
 * guarantee they are integers.
 */
export function buildPaginationClause(page: {
  limit: number;
  offset: number;
}): string {
  return `LIMIT ${page.limit} OFFSET ${page.offset}`;
}

/** Escape character for {@link containsPattern}; `\` means different things per dialect. */
const LIKE_ESCAPE = '!';

/**
 * SQL for a case-insensitive "contains" match on `column`, with `%` and `_`
 * in the search text treated literally. Lowercasing both sides makes
 * PostgreSQL, whose `LIKE` is case-sensitive, behave like SQLite and MySQL.
 */
export function buildContainsCondition(column: string): string {
  return `LOWER(${column}) LIKE ? ESCAPE '${LIKE_ESCAPE}'`;
}

/** The bound value for {@link buildContainsCondition}. */
export function containsPattern(search: string): string {
  const escaped = search
    .toLowerCase()
    .replace(/[!%_]/g, (char) => `${LIKE_ESCAPE}${char}`);
  return `%${escaped}%`;
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
