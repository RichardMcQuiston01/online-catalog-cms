import { describeDatabaseAdapterContract } from '../adapterContract.js';
import { MySQLAdapter } from './MySQLAdapter.js';

const host = process.env.MYSQL_HOST;

/** Children first, so the foreign keys never block a drop. */
const TABLES = ['occ_image', 'occ_product', 'occ_category', 'occ_migration'];

// Requires a live MySQL or MariaDB; skipped unless MYSQL_HOST is set. The
// database is shared, so each test starts from empty tables and removes
// them again afterwards.
describeDatabaseAdapterContract(
  'MySQL',
  async () => {
    const config = {
      host: host ?? 'localhost',
      port: Number(process.env.MYSQL_PORT ?? 3306),
      user: process.env.MYSQL_USER ?? 'root',
      password: process.env.MYSQL_PASSWORD ?? '',
      database: process.env.MYSQL_DATABASE ?? 'occ_test',
    };
    const dropTables = async (): Promise<void> => {
      const { createConnection } = await import('mysql2/promise');
      const connection = await createConnection(config);
      for (const table of TABLES) {
        await connection.query(`DROP TABLE IF EXISTS ${table}`);
      }
      await connection.end();
    };

    await dropTables();
    return { adapter: new MySQLAdapter(config), cleanup: dropTables };
  },
  { skip: !host },
);
