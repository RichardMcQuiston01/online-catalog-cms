import { describe, expect, it } from 'bun:test';
import { MongoDBAdapter } from './mongodb/MongoDBAdapter.js';
import { MySQLAdapter } from './mysql/MySQLAdapter.js';
import { RedisAdapter } from './redis/RedisAdapter.js';

/** Nothing listens on this port, so connecting fails. */
const unreachableRedisUrl = 'redis://127.0.0.1:1';

describe('connection error handling', () => {
  it('Redis hands driver errors to onError instead of crashing', async () => {
    const errors: Error[] = [];
    const adapter = new RedisAdapter({
      url: unreachableRedisUrl,
      onError: (error) => errors.push(error),
    });
    const client = (adapter as unknown as { client: NodeJS.EventEmitter })
      .client;

    expect(() => client.emit('error', new Error('boom'))).not.toThrow();
    expect(errors.map((e) => e.message)).toContain('boom');
    await adapter.close();
  });

  it('Redis verify() does not leak the server address', async () => {
    const adapter = new RedisAdapter({
      url: unreachableRedisUrl,
      onError: () => {},
    });
    const client = (adapter as unknown as { client: { ping: () => unknown } })
      .client;
    client.ping = async () => {
      throw new Error('connect ECONNREFUSED 10.1.2.3:6379');
    };

    const result = await adapter.verify();

    expect(result.ok).toBe(false);
    expect(result.issues).toHaveLength(1);
    expect(result.issues.join(' ')).not.toContain('10.1.2.3');
    await adapter.close();
  });

  it('MySQL hands pool errors to onError instead of crashing', async () => {
    const errors: Error[] = [];
    const adapter = new MySQLAdapter({
      host: '127.0.0.1',
      port: 1,
      user: 'nobody',
      password: 'none',
      database: 'none',
      onError: (error) => errors.push(error),
    });
    const pool = (adapter as unknown as { pool: NodeJS.EventEmitter }).pool;

    expect(() => pool.emit('error', new Error('closed idle'))).not.toThrow();
    expect(errors.map((e) => e.message)).toContain('closed idle');
    await adapter.close();
  });

  it('MongoDB verify() does not leak the server address', async () => {
    const adapter = new MongoDBAdapter({
      url: 'mongodb://127.0.0.1:1/?serverSelectionTimeoutMS=200',
      onError: () => {},
    });

    const result = await adapter.verify();

    expect(result.ok).toBe(false);
    expect(result.issues.join(' ')).not.toContain('127.0.0.1');
    await adapter.close();
  });
});
