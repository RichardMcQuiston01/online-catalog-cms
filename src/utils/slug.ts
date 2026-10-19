/** Longest slug the database columns hold (`VARCHAR(255)`). */
export const MAX_SLUG_LENGTH = 255;

/**
 * Convert a string to a URL-safe slug.
 *
 * Diacritics are stripped (`Café` becomes `cafe`) and letters and digits of
 * any script are kept (`日本語` stays `日本語`), so the result does not depend
 * on the database. Anything else is dropped or collapsed into a single `-`.
 * The result is at most {@link MAX_SLUG_LENGTH} characters and is an empty
 * string when the input has no letters or digits at all.
 */
export function generateSlug(value: string): string {
  return value
    .normalize('NFKD')
    .replace(/\p{M}+/gu, '')
    .toLowerCase()
    .trim()
    .replace(/[^\p{L}\p{N}\s_-]/gu, '')
    .replace(/[\s_-]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, MAX_SLUG_LENGTH)
    .replace(/-+$/, '');
}

/** Letters and digits of any script, in groups joined by `-` or `_`. */
const SLUG_PATTERN = /^[\p{L}\p{N}_]+(?:-[\p{L}\p{N}_]+)*$/u;

/** True if `slug` is acceptable as an explicitly chosen slug. */
export function isValidSlug(slug: string): boolean {
  return slug.length <= MAX_SLUG_LENGTH && SLUG_PATTERN.test(slug);
}
