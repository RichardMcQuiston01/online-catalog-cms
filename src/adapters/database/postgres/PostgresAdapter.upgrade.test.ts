import { afterEach, beforeEach, describe, expect, it } from 'bun:test';
import { initialMigration } from '../relational/migrations/001_initial.js';
import { PostgresAdapter } from './PostgresAdapter.js';

const databaseUrl = process.env.DATABASE_URL;
const TABLES = ['occ_image', 'occ_product', 'occ_category', 'occ_migration'];

// Requires a live PostgreSQL; skipped unless DATABASE_URL is set.
describe.skipIf(!databaseUrl)(
  'PostgreSQL upgrade from schema version 1',
  () => {
    const url = databaseUrl ?? '';
    type Sql = import('postgres').Sql;
    let sql: Sql;

    const dropTables = async (): Promise<void> => {
      for (const table of TABLES) {
        await sql.unsafe(`DROP TABLE IF EXISTS ${table} CASCADE`);
      }
    };

    beforeEach(async () => {
      const { default: postgres } = await import('postgres');
      sql = postgres(url, { onnotice: () => {} });
      await dropTables();
    });

    afterEach(async () => {
      await dropTables();
      await sql.end();
    });

    it('keeps the instants of rows written by the old runner', async () => {
      // What 0.2.x left behind: version 1, wall-clock timestamps holding UTC.
      for (const statement of initialMigration.statements) {
        await sql.unsafe(statement);
      }
      await sql.unsafe(
        'INSERT INTO occ_migration (version, applied_at) VALUES (1, CURRENT_TIMESTAMP)',
      );
      await sql.unsafe(
        `INSERT INTO occ_category (id, name, slug, metadata, created_at, updated_at)
       VALUES ('c1', 'Old', 'old', '{}', '2026-10-16T12:00:00.000Z', '2026-10-16T13:30:00.000Z')`,
      );

      const adapter = new PostgresAdapter({ url });
      await adapter.initialize();

      const category = await adapter.categories.get('c1');
      expect(category?.createdAt.toISOString()).toBe(
        '2026-10-16T12:00:00.000Z',
      );
      expect(category?.updatedAt.toISOString()).toBe(
        '2026-10-16T13:30:00.000Z',
      );

      const indexes = await sql<{ indexname: string }[]>`
      SELECT indexname FROM pg_indexes WHERE schemaname = 'public'`;
      const names = indexes.map((row) => row.indexname);
      expect(names).toContain('occ_product_category_id_idx');
      expect(names).toContain('occ_category_parent_id_idx');
      expect(names).toContain('occ_image_product_id_sort_order_idx');
      expect((await adapter.verify()).ok).toBe(true);
      await adapter.close();
    });
  },
);
