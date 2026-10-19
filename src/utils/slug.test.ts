import { describe, expect, it } from 'bun:test';
import { MAX_SLUG_LENGTH, generateSlug, isValidSlug } from './slug.js';

describe('generateSlug', () => {
  it('lowercases and joins words with dashes', () => {
    expect(generateSlug('  Acme   Widget_Pro -- 2 ')).toBe('acme-widget-pro-2');
  });

  it('strips diacritics instead of dropping the letter', () => {
    expect(generateSlug('Café Latte')).toBe('cafe-latte');
    expect(generateSlug('Crème Brûlée')).toBe('creme-brulee');
  });

  it('keeps letters and digits from any script', () => {
    expect(generateSlug('日本語')).toBe('日本語');
    expect(generateSlug('Привет мир')).toBe('привет-мир');
  });

  it('returns an empty string when nothing usable is left', () => {
    expect(generateSlug('!!! ???')).toBe('');
    expect(generateSlug('')).toBe('');
  });

  it('never exceeds the column length or ends with a dash', () => {
    const slug = generateSlug(`${'a'.repeat(254)} b`);
    expect(slug.length).toBeLessThanOrEqual(MAX_SLUG_LENGTH);
    expect(slug.endsWith('-')).toBe(false);
  });
});

describe('isValidSlug', () => {
  it('accepts generated-looking slugs', () => {
    for (const slug of ['widget', 'a-b-c', 'cafe_2', '日本語']) {
      expect(isValidSlug(slug)).toBe(true);
    }
  });

  it('rejects empty, spaced, slashed and over-long slugs', () => {
    for (const slug of ['', 'has space', 'a/b', '-lead', 'trail-', 'a--b']) {
      expect(isValidSlug(slug)).toBe(false);
    }
    expect(isValidSlug('a'.repeat(MAX_SLUG_LENGTH + 1))).toBe(false);
  });
});
