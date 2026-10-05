import { describe, expect, it } from 'bun:test';
import { toNumberedPlaceholders } from './PostgresAdapter.js';

describe('toNumberedPlaceholders', () => {
  it('numbers each ? in order', () => {
    expect(
      toNumberedPlaceholders('SELECT * FROM t WHERE a = ? AND b IN (?, ?)'),
    ).toBe('SELECT * FROM t WHERE a = $1 AND b IN ($2, $3)');
  });

  it('leaves queries without placeholders unchanged', () => {
    expect(toNumberedPlaceholders('SELECT 1')).toBe('SELECT 1');
  });
});
