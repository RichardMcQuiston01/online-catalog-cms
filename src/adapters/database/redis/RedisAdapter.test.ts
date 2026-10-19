import { describe, expect, it } from 'bun:test';
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

describe.skipIf(!redisUrl)('Redis slug index', () => {
  it('indexes slugs of data written before the index existed', async () => {
    const keyPrefix = `occ-test-${randomUUID()}`;
    const url = redisUrl ?? 'redis://localhost:6379';
    const adapter = new RedisAdapter({ url, keyPrefix });
    await adapter.initialize();
    const category = await adapter.categories.create({ name: 'Legacy' });

    // Simulate a database created by an older version: no slug keys.
    const { default: Redis } = await import('ioredis');
    const client = new Redis(url);
    await client.del(`${keyPrefix}:slug:category:legacy`);
    expect(await adapter.categories.getBySlug('legacy')).toBeNull();

    await adapter.initialize();

    expect((await adapter.categories.getBySlug('legacy'))?.id).toBe(
      category.id,
    );
    const keys = await client.keys(`${keyPrefix}:*`);
    if (keys.length > 0) await client.del(...keys);
    await client.quit();
    await adapter.close();
  });
});
