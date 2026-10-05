import { randomUUID } from 'node:crypto';
import { describeDatabaseAdapterContract } from '../adapterContract.js';
import { MongoDBAdapter } from './MongoDBAdapter.js';

const mongoUrl = process.env.MONGODB_URL;

// Requires a live MongoDB; skipped unless MONGODB_URL is set.
describeDatabaseAdapterContract(
  'MongoDB',
  async () => {
    const database = `occ_test_${randomUUID().replaceAll('-', '')}`;
    const url = mongoUrl ?? 'mongodb://localhost:27017';
    return {
      adapter: new MongoDBAdapter({ url, database }),
      cleanup: async () => {
        // Each test owns a unique database; drop it entirely.
        const { MongoClient } = await import('mongodb');
        const client = new MongoClient(url);
        await client.db(database).dropDatabase();
        await client.close();
      },
    };
  },
  { skip: !mongoUrl },
);
