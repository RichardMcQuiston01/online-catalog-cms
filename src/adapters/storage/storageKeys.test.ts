import { describe, expect, it } from 'bun:test';
import { generateStorageKey, keyFromUrl } from './storageKeys.js';

const baseUrl = 'https://cdn.example.com/images';

describe('keyFromUrl', () => {
  it('round-trips a generated key', () => {
    const key = generateStorageKey('My Photo (1).jpg');
    expect(keyFromUrl(`${baseUrl}/${key}`, baseUrl)).toBe(key);
  });

  it('accepts a generated key for an empty filename', () => {
    const key = generateStorageKey('');
    expect(keyFromUrl(`${baseUrl}/${key}`, baseUrl)).toBe(key);
  });

  it('rejects URLs outside baseUrl', () => {
    const key = generateStorageKey('a.png');
    expect(keyFromUrl(`https://evil.example.com/${key}`, baseUrl)).toBeNull();
  });

  it('rejects keys this package would never generate', () => {
    for (const key of [
      'avatar.png',
      'index.html',
      'nested/dir/file.png',
      '../secret.txt',
      '..',
      '',
    ]) {
      expect(keyFromUrl(`${baseUrl}/${key}`, baseUrl)).toBeNull();
    }
  });

  it('rejects query strings and fragments', () => {
    const key = generateStorageKey('a.png');
    expect(keyFromUrl(`${baseUrl}/${key}?v=2`, baseUrl)).toBeNull();
    expect(keyFromUrl(`${baseUrl}/${key}#top`, baseUrl)).toBeNull();
  });
});
