import { afterAll, beforeAll, describe, expect, it } from 'bun:test';
import { existsSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
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

  it('never deletes files outside the upload directory', async () => {
    const outsidePath = join(TEST_DIR, 'outside.txt');
    writeFileSync(outsidePath, 'keep me');
    const uploadDir = join(TEST_DIR, 'inner');
    const adapter = new LocalStorageAdapter({ uploadDir });

    await adapter.delete('/uploads/../outside.txt');

    expect(existsSync(outsidePath)).toBe(true);
  });

  it('generates distinct keys for the same filename', async () => {
    const adapter = new LocalStorageAdapter({ uploadDir: TEST_DIR });
    const first = await adapter.upload(Buffer.from('1'), 'same.txt');
    const second = await adapter.upload(Buffer.from('2'), 'same.txt');
    expect(first).not.toBe(second);
  });
});
