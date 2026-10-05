import { randomUUID } from 'node:crypto';
import { describeDatabaseAdapterContract } from '../adapterContract.js';
import { RedisAdapter } from './RedisAdapter.js';

const redisUrl = process.env.REDIS_URL;

// Requires a live Redis; skipped unless REDIS_URL is set.
describeDatabaseAdapterContract(
  'Redis',
  async () => {
    const keyPrefix = `occ-test-${randomUUID()}`;
    const adapter = new RedisAdapter({
      url: redisUrl ?? 'redis://localhost:6379',
      keyPrefix,
    });
    return {
      adapter,
      cleanup: async () => {
        // Each test owns a unique prefix; remove only its keys.
        const { default: Redis } = await import('ioredis');
        const client = new Redis(redisUrl ?? 'redis://localhost:6379');
        const keys = await client.keys(`${keyPrefix}:*`);
        if (keys.length > 0) await client.del(...keys);
        await client.quit();
      },
    };
  },
  { skip: !redisUrl },
);
