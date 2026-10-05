import { describe, expect, it } from 'bun:test';
import type { ImageRepository, StorageAdapter } from '../interfaces/index.js';
import { ImageService } from './ImageService.js';

function createStorage(): StorageAdapter & { deleted: string[] } {
  const deleted: string[] = [];
  return {
    deleted,
    upload: async () => 'https://cdn.example.com/photo.jpg',
    delete: async (url) => {
      deleted.push(url);
    },
    getPublicUrl: (key) => key,
  };
}

const failingRepo: ImageRepository = {
  create: async () => {
    throw new Error('database unavailable');
  },
  get: async () => null,
  delete: async () => {},
  listByProduct: async () => [],
};

describe('ImageService.upload', () => {
  it('requires a storage adapter', async () => {
    const service = new ImageService(failingRepo);
    await expect(
      service.upload({
        productId: 'p',
        file: Buffer.from('x'),
        filename: 'a.jpg',
        altText: '',
      }),
    ).rejects.toThrow('storage adapter must be configured');
  });

  it('removes the uploaded file when saving the record fails', async () => {
    const storage = createStorage();
    const service = new ImageService(failingRepo, storage);

    await expect(
      service.upload({
        productId: 'p',
        file: Buffer.from('x'),
        filename: 'a.jpg',
        altText: '',
      }),
    ).rejects.toThrow('database unavailable');

    expect(storage.deleted).toEqual(['https://cdn.example.com/photo.jpg']);
  });
});
