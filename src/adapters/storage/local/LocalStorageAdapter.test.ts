import { afterAll, beforeAll, describe, expect, it } from 'bun:test';
import { existsSync, mkdirSync, rmSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { LocalStorageAdapter } from './LocalStorageAdapter.js';

const TEST_DIR = resolve('./tmp-test-uploads');

describe('LocalStorageAdapter', () => {
  beforeAll(() => {
    mkdirSync(TEST_DIR, { recursive: true });
  });

  afterAll(() => {
    if (existsSync(TEST_DIR)) {
      rmSync(TEST_DIR, { recursive: true, force: true });
    }
  });

  it('creates the upload directory if it does not exist', () => {
    const dir = join(TEST_DIR, 'sub');
    const adapter = new LocalStorageAdapter({ uploadDir: dir });
    expect(existsSync(dir)).toBe(true);
    // cleanup
    rmSync(dir, { recursive: true, force: true });
  });

  it('uploads a Buffer and returns a URL', async () => {
    const adapter = new LocalStorageAdapter({
      uploadDir: TEST_DIR,
      baseUrl: 'http://localhost/files',
    });

    const content = Buffer.from('hello world');
    const url = await adapter.upload(content, 'test.txt');

    expect(url).toMatch(/^http:\/\/localhost\/files\//);
    expect(url).toContain('test.txt');
  });

  it('deletes a file by URL', async () => {
    const adapter = new LocalStorageAdapter({ uploadDir: TEST_DIR });
    const url = await adapter.upload(Buffer.from('to delete'), 'delete-me.txt');

    // Verify file exists
    const key = url.replace('/uploads/', '');
    const filePath = join(TEST_DIR, key);
    expect(existsSync(filePath)).toBe(true);

    await adapter.delete(url);
    expect(existsSync(filePath)).toBe(false);
  });

  it('getPublicUrl returns the correct URL', () => {
    const adapter = new LocalStorageAdapter({
      uploadDir: TEST_DIR,
      baseUrl: 'https://cdn.example.com',
    });
    expect(adapter.getPublicUrl('img/photo.jpg')).toBe(
      'https://cdn.example.com/img/photo.jpg',
    );
  });

  it('delete is a no-op for unknown URLs', async () => {
    const adapter = new LocalStorageAdapter({ uploadDir: TEST_DIR });
    await expect(
      adapter.delete('http://other-domain.com/file.jpg'),
    ).resolves.toBeUndefined();
  });
});
