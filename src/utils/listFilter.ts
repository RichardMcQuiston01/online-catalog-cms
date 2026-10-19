import { ValidationError } from '../errors.js';
import type { CategoryFilter } from '../types/category.js';
import type { ProductFilter } from '../types/product.js';

/** Rows returned by `list()` when the caller sets no `limit`. */
export const DEFAULT_LIST_LIMIT = 100;
/** Largest `limit` a caller may request; page with `offset` for more. */
export const MAX_LIST_LIMIT = 1000;
/** Longest accepted `search` text. */
export const MAX_SEARCH_LENGTH = 200;

export interface ResolvedProductFilter {
  categoryId?: string | null;
  search?: string;
  minPrice?: number;
  maxPrice?: number;
  limit: number;
  offset: number;
}

export interface ResolvedCategoryFilter {
  parentId?: string | null;
  search?: string;
  limit: number;
  offset: number;
}

function invalid(field: string, expectation: string, value: unknown): never {
  const shown = typeof value === 'object' ? typeof value : String(value);
  throw new ValidationError(
    `Invalid ${field} filter: expected ${expectation}, received ${shown}.`,
    field,
  );
}

function readId(field: string, value: unknown): string | null | undefined {
  if (value === undefined || value === null) return value;
  if (typeof value === 'string') return value;
  return invalid(field, 'a string, null or undefined', value);
}

function readSearch(value: unknown): string | undefined {
  if (value === undefined) return undefined;
  if (typeof value !== 'string' || value.length > MAX_SEARCH_LENGTH) {
    return invalid(
      'search',
      `a string of at most ${MAX_SEARCH_LENGTH} characters`,
      value,
    );
  }
  return value === '' ? undefined : value;
}

function readPrice(field: string, value: unknown): number | undefined {
  if (value === undefined) return undefined;
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    return invalid(field, 'a finite number', value);
  }
  return value;
}

function readPage(filter: { limit?: unknown; offset?: unknown }): {
  limit: number;
  offset: number;
} {
  const { limit = DEFAULT_LIST_LIMIT, offset = 0 } = filter;
  if (
    typeof limit !== 'number' ||
    !Number.isInteger(limit) ||
    limit < 0 ||
    limit > MAX_LIST_LIMIT
  ) {
    invalid('limit', `an integer from 0 to ${MAX_LIST_LIMIT}`, limit);
  }
  if (
    typeof offset !== 'number' ||
    !Number.isSafeInteger(offset) ||
    offset < 0
  ) {
    invalid('offset', 'a non-negative integer', offset);
  }
  return { limit: limit as number, offset: offset as number };
}

/**
 * Checks a product filter at runtime and applies the default page size.
 *
 * TypeScript types do not survive a query-string parser, and a database
 * driver may treat an object where a string was expected as a query operator
 * (MongoDB `{ $ne: null }`). Every adapter calls this first so they accept
 * and reject exactly the same filters. `limit: 0` is an empty page.
 *
 * @throws ValidationError naming the first invalid field.
 */
export function resolveProductFilter(
  filter: ProductFilter = {},
): ResolvedProductFilter {
  return {
    categoryId: readId('categoryId', filter.categoryId),
    search: readSearch(filter.search),
    minPrice: readPrice('minPrice', filter.minPrice),
    maxPrice: readPrice('maxPrice', filter.maxPrice),
    ...readPage(filter),
  };
}

/** Category counterpart of {@link resolveProductFilter}. */
export function resolveCategoryFilter(
  filter: CategoryFilter = {},
): ResolvedCategoryFilter {
  return {
    parentId: readId('parentId', filter.parentId),
    search: readSearch(filter.search),
    ...readPage(filter),
  };
}
