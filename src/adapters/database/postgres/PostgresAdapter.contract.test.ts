import { describeDatabaseAdapterContract } from '../adapterContract.js';
import { PostgresAdapter } from './PostgresAdapter.js';

const databaseUrl = process.env.DATABASE_URL;

/** Children first, so the foreign keys never block a drop. */
const TABLES = ['occ_image', 'occ_product', 'occ_category', 'occ_migration'];

// Requires a live PostgreSQL; skipped unless DATABASE_URL is set. The
// database is shared, so each test starts from empty tables and removes
// them again afterwards.
describeDatabaseAdapterContract(
  'PostgreSQL',
  async () => {
    const url = databaseUrl ?? 'postgres://postgres@localhost:5432/postgres';
    const dropTables = async (): Promise<void> => {
      const { default: postgres } = await import('postgres');
      const sql = postgres(url, { onnotice: () => {} });
      for (const table of TABLES) {
        await sql.unsafe(`DROP TABLE IF EXISTS ${table} CASCADE`);
      }
      await sql.end();
    };

    await dropTables();
    return { adapter: new PostgresAdapter({ url }), cleanup: dropTables };
  },
  { skip: !databaseUrl },
);
