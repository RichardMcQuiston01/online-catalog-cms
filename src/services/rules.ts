import { SlugConflictError, ValidationError } from '../errors.js';
import { MAX_SLUG_LENGTH, generateSlug, isValidSlug } from '../utils/slug.js';

/** Longest `name` or `sku`, matching the `VARCHAR(255)` columns. */
export const MAX_NAME_LENGTH = 255;
/** Longest image `altText`, matching the `VARCHAR(500)` column. */
export const MAX_ALT_TEXT_LENGTH = 500;
/** Largest `metadata` object, measured as serialized JSON characters. */
export const MAX_METADATA_LENGTH = 65_536;
const MAX_METADATA_DEPTH = 10;

/**
 * Domain rules shared by the services. They live here, not in the adapters,
 * so every database accepts and rejects the same input. Each throws a
 * {@link ValidationError} naming the field.
 */

export function assertText(
  field: string,
  value: unknown,
  maxLength: number,
  options: { allowEmpty?: boolean } = {},
): string {
  if (typeof value !== 'string') {
    throw new ValidationError(
      `${field} must be a string, received ${typeof value}.`,
      field,
    );
  }
  if (!options.allowEmpty && value.trim().length === 0) {
    throw new ValidationError(`${field} must not be empty.`, field);
  }
  if (value.length > maxLength) {
    throw new ValidationError(
      `${field} must be at most ${maxLength} characters, received ${value.length}.`,
      field,
    );
  }
  return value;
}

/** A price is a non-negative whole number of the smallest currency unit. */
export function assertPrice(value: unknown): number {
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < 0) {
    throw new ValidationError(
      `price must be a non-negative integer in the smallest currency unit (for example cents), received ${String(value)}.`,
      'price',
    );
  }
  return value;
}

export function assertSortOrder(value: unknown): number {
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < 0) {
    throw new ValidationError(
      `sortOrder must be a non-negative integer, received ${String(value)}.`,
      'sortOrder',
    );
  }
  return value;
}

/**
 * Checks `metadata` and returns a JSON-normalized copy to store, so every
 * database round-trips the same value (no `Date`, `undefined` or class
 * instances). Keys that MongoDB treats as operators or paths (`$x`, `a.b`)
 * are rejected on every adapter, since a catalog that works on SQL must
 * also work after a move to MongoDB.
 */
export function normalizeMetadata(value: unknown): Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new ValidationError('metadata must be a plain object.', 'metadata');
  }

  let json: string;
  try {
    json = JSON.stringify(value);
  } catch (error) {
    throw new ValidationError(
      `metadata must be JSON-serializable: ${error instanceof Error ? error.message : String(error)}`,
      'metadata',
    );
  }
  if (json.length > MAX_METADATA_LENGTH) {
    throw new ValidationError(
      `metadata is ${json.length} characters when serialized, over the ${MAX_METADATA_LENGTH} limit.`,
      'metadata',
    );
  }

  const normalized = JSON.parse(json) as Record<string, unknown>;
  assertSafeKeys(normalized, 'metadata', 1);
  return normalized;
}

function assertSafeKeys(value: unknown, path: string, depth: number): void {
  if (typeof value !== 'object' || value === null) return;
  if (depth > MAX_METADATA_DEPTH) {
    throw new ValidationError(
      `${path} is nested more than ${MAX_METADATA_DEPTH} levels deep.`,
      'metadata',
    );
  }
  if (Array.isArray(value)) {
    for (const [index, item] of value.entries()) {
      assertSafeKeys(item, `${path}[${index}]`, depth + 1);
    }
    return;
  }
  for (const [key, child] of Object.entries(value)) {
    if (key.startsWith('$') || key.includes('.') || key.includes('\0')) {
      throw new ValidationError(
        `${path} has the key "${key}", which is not allowed: keys must not start with "$" or contain "." (MongoDB treats them as operators and paths).`,
        'metadata',
      );
    }
    assertSafeKeys(child, `${path}.${key}`, depth + 1);
  }
}

/** Looks a slug up and returns the id that owns it, if any. */
export type FindSlugOwner = (slug: string) => Promise<{ id: string } | null>;

/**
 * Picks the slug for a new record. An explicit slug is validated and must be
 * free; otherwise one is generated from `name`, with `-2`, `-3`, ... appended
 * until it is free.
 */
export async function chooseSlug(
  name: string,
  explicitSlug: string | undefined,
  findOwner: FindSlugOwner,
): Promise<string> {
  if (explicitSlug !== undefined) {
    await assertSlugAvailable(explicitSlug, findOwner);
    return explicitSlug;
  }

  const base = generateSlug(name);
  if (base.length === 0) {
    throw new ValidationError(
      `Cannot generate a slug from the name "${name}" because it has no letters or digits. Pass an explicit slug.`,
      'slug',
    );
  }

  for (let attempt = 1; attempt <= 1000; attempt++) {
    const suffix = attempt === 1 ? '' : `-${attempt}`;
    const candidate = `${base.slice(0, MAX_SLUG_LENGTH - suffix.length)}${suffix}`;
    if (!(await findOwner(candidate))) return candidate;
  }
  throw new ValidationError(
    `Could not find a free slug for "${name}" after 1000 attempts. Pass an explicit slug.`,
    'slug',
  );
}

/**
 * Validates an explicit slug and checks that no other record uses it.
 * `ownId` is the record being updated, which may keep its own slug.
 */
export async function assertSlugAvailable(
  slug: unknown,
  findOwner: FindSlugOwner,
  ownId?: string,
): Promise<string> {
  if (typeof slug !== 'string' || !isValidSlug(slug)) {
    throw new ValidationError(
      `slug must be 1 to ${MAX_SLUG_LENGTH} characters of letters, digits, "-" and "_" with no leading, trailing or repeated "-", received ${JSON.stringify(slug)}.`,
      'slug',
    );
  }
  const owner = await findOwner(slug);
  if (owner && owner.id !== ownId) throw new SlugConflictError(slug);
  return slug;
}
