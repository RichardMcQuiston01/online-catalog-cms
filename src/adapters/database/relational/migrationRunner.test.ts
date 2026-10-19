import { beforeEach, describe, expect, it } from 'bun:test';
import { SQLiteAdapter } from '../sqlite/SQLiteAdapter.js';
import { initialMigration } from './migrations/001_initial.js';
import type { Migration } from './migrations/index.js';

/** A SQLite adapter whose migration list a test can extend. */
class TestAdapter extends SQLiteAdapter {
  extra: Migration[] = [];

  protected override get migrations(): Migration[] {
    return [...super.migrations, ...this.extra];
  }

  query<T>(sql: string): Promise<T[]> {
    return this.db.all<T>(sql);
  }
}

const versionsApplied = async (adapter: TestAdapter): Promise<number[]> =>
  (
    await adapter.query<{ version: number }>(
      'SELECT version FROM occ_migration ORDER BY version',
    )
  ).map((row) => row.version);

describe('migration runner', () => {
  let adapter: TestAdapter;

  beforeEach(() => {
    adapter = new TestAdapter({ filename: ':memory:' });
  });

  it('records each applied version', async () => {
    await adapter.initialize();
    expect(await versionsApplied(adapter)).toEqual([1]);
    await adapter.close();
  });

  it('does not replay applied migrations on the next start', async () => {
    await adapter.initialize();
    await adapter.query('DROP TABLE occ_image');

    await adapter.initialize();

    // The old runner re-ran the script and quietly recreated the table.
    const verification = await adapter.verify();
    expect(verification.ok).toBe(false);
    expect(verification.issues).toContain('Missing table: occ_image');
    await adapter.close();
  });

  it('applies only the pending migrations, once each, in order', async () => {
    await adapter.initialize();
    adapter.extra = [
      {
        version: 3,
        description: 'third',
        statements: ['CREATE TABLE occ_third (id INTEGER)'],
      },
      {
        version: 2,
        description: 'second',
        statements: ['CREATE TABLE occ_second (id INTEGER)'],
      },
    ].sort((a, b) => a.version - b.version);

    await adapter.initialize();
    await adapter.initialize();

    expect(await versionsApplied(adapter)).toEqual([1, 2, 3]);
    await adapter.close();
  });

  it('runs statements as written, even with semicolons in literals', async () => {
    await adapter.initialize();
    adapter.extra = [
      {
        version: 2,
        description: 'semicolons',
        statements: [
          'CREATE TABLE occ_note (text TEXT)',
          "INSERT INTO occ_note (text) VALUES ('first; second') /* a; b */",
        ],
      },
    ];

    await adapter.initialize();

    expect(
      await adapter.query<{ text: string }>('SELECT text FROM occ_note'),
    ).toEqual([{ text: 'first; second' }]);
    await adapter.close();
  });

  it('rolls back a failing migration and leaves the version unrecorded', async () => {
    await adapter.initialize();
    adapter.extra = [
      {
        version: 2,
        description: 'broken',
        statements: ['CREATE TABLE occ_half (id INTEGER)', 'THIS IS NOT SQL'],
      },
    ];

    await expect(adapter.initialize()).rejects.toThrow();

    expect(await versionsApplied(adapter)).toEqual([1]);
    expect(
      await adapter.query(
        "SELECT name FROM sqlite_master WHERE name = 'occ_half'",
      ),
    ).toEqual([]);
    await adapter.close();
  });

  it('refuses a database migrated by a newer version of the package', async () => {
    await adapter.initialize();
    await adapter.query(
      'INSERT INTO occ_migration (version, applied_at) VALUES (99, CURRENT_TIMESTAMP)',
    );

    await expect(adapter.initialize()).rejects.toThrow(
      'database is at migration 99',
    );
    await adapter.close();
  });

  it('reports pending migrations from verify()', async () => {
    await adapter.initialize();
    adapter.extra = [
      {
        version: 2,
        description: 'pending',
        statements: ['CREATE TABLE occ_pending (id INTEGER)'],
      },
    ];

    const verification = await adapter.verify();

    expect(verification.ok).toBe(false);
    expect(verification.issues[0]).toContain('Schema is at migration 1');
    await adapter.close();
  });

  it('adopts a database created by the old runner or by hand', async () => {
    // Running 001_initial.sql leaves the tables and a version 1 row.
    for (const statement of initialMigration.statements) {
      await adapter.query(statement);
    }
    await adapter.query(
      'CREATE TABLE IF NOT EXISTS occ_migration (version INTEGER NOT NULL PRIMARY KEY, applied_at TIMESTAMP NOT NULL)',
    );
    await adapter.query(
      'INSERT INTO occ_migration (version, applied_at) VALUES (1, CURRENT_TIMESTAMP)',
    );

    await adapter.initialize();

    expect(await versionsApplied(adapter)).toEqual([1]);
    expect((await adapter.verify()).ok).toBe(true);
    await adapter.close();
  });
});
