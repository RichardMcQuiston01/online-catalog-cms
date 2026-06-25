import { describe, expect, it } from 'bun:test';
import { ExternalURLAdapter } from './ExternalURLAdapter.js';

describe('ExternalURLAdapter', () => {
  it('getPublicUrl returns the key unchanged', () => {
    const adapter = new ExternalURLAdapter();
    const url = 'https://img.example.com/product/photo.jpg';
    expect(adapter.getPublicUrl(url)).toBe(url);
  });

  it('delete is a no-op', async () => {
    const adapter = new ExternalURLAdapter();
    await expect(
      adapter.delete('https://img.example.com/product/photo.jpg'),
    ).resolves.toBeUndefined();
  });

  it('upload throws with a helpful message', async () => {
    const adapter = new ExternalURLAdapter();
    await expect(
      adapter.upload(Buffer.from('data'), 'photo.jpg'),
    ).rejects.toThrow('ExternalURLAdapter does not support uploads');
  });
});
