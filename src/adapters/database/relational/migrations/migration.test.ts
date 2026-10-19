import { describe, expect, it } from 'bun:test';
import { readFileSync } from 'node:fs';
import { initialMigration } from './001_initial.js';
import { migrationsFor } from './index.js';

/** Whitespace-insensitive form of a statement, for comparing SQL text. */
const squash = (sql: string): string => sql.replace(/\s+/g, ' ').trim();

describe('001_initial migration', () => {
  it('matches the statements in 001_initial.sql', () => {
    const sqlFile = readFileSync(
      new URL('./001_initial.sql', import.meta.url),
      'utf8',
    );
    const fileStatements = sqlFile
      .split('\n')
      .filter((line) => !line.trim().startsWith('--'))
      .join('\n')
      .split(';')
      .map(squash)
      .filter((statement) => statement.length > 0);

    // The .sql file ends with the INSERT that records the version, because
    // it is run by hand; the runner records the version itself.
    const recordVersion = fileStatements.pop();
    expect(recordVersion).toStartWith('INSERT INTO occ_migration');
    expect(fileStatements).toEqual(initialMigration.statements.map(squash));
  });
});

describe('migration list', () => {
  it('has unique, increasing versions starting at 1 for every dialect', () => {
    for (const dialect of ['sqlite', 'postgres', 'mysql'] as const) {
      const versions = migrationsFor(dialect).map((m) => m.version);
      expect(versions[0]).toBe(1);
      expect(versions).toEqual([...versions].sort((a, b) => a - b));
      expect(new Set(versions).size).toBe(versions.length);
    }
  });
});
