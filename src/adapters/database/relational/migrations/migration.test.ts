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

describe('MySQL schema', () => {
  const statements = migrationsFor('mysql').flatMap((m) => m.statements);

  it('declares foreign keys as constraints, since MySQL ignores inline REFERENCES', () => {
    const create = statements.filter((s) => s.startsWith('CREATE TABLE'));
    expect(create.length).toBe(3);
    for (const statement of create) {
      expect(statement).not.toMatch(/NULL\s+REFERENCES/);
      expect(statement).toMatch(/FOREIGN KEY/);
    }
  });

  it('gives no TEXT column a literal default, which MySQL rejects', () => {
    for (const statement of statements) {
      expect(statement).not.toMatch(/TEXT\s+NOT NULL\s+DEFAULT/);
    }
  });

  it('uses DATETIME(3) for every timestamp', () => {
    for (const statement of statements.filter((s) => s.startsWith('CREATE'))) {
      expect(statement).not.toContain('TIMESTAMP');
    }
  });
});
