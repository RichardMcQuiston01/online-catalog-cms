import { describe, expect, it } from 'bun:test';
import { readFileSync } from 'node:fs';
import { INITIAL_MIGRATION_SQL } from './001_initial.js';

describe('001_initial migration', () => {
  it('embedded SQL matches 001_initial.sql', () => {
    const sqlFile = readFileSync(
      new URL('./001_initial.sql', import.meta.url),
      'utf8',
    );
    expect(INITIAL_MIGRATION_SQL.trim()).toBe(sqlFile.trim());
  });
});
