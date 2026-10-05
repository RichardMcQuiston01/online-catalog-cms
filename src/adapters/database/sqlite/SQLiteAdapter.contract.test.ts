import { describeDatabaseAdapterContract } from '../adapterContract.js';
import { SQLiteAdapter } from './SQLiteAdapter.js';

describeDatabaseAdapterContract('SQLite', async () => ({
  adapter: new SQLiteAdapter({ filename: ':memory:' }),
  cleanup: async () => {},
}));
