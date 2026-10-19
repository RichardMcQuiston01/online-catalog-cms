import { describe, expect, it } from 'bun:test';
import type {
  ImageRepository,
  ProductRepository,
  StorageAdapter,
} from '../interfaces/index.js';
import type { Image, Product } from '../types/index.js';
import { ImageService } from './ImageService.js';
import { ProductService } from './ProductService.js';

const image: Image = {
  id: 'i1',
  productId: 'p1',
  url: 'https://cdn.example.com/a.jpg',
  altText: '',
  sortOrder: 0,
  createdAt: new Date(),
};

const product: Product = {
  id: 'p1',
  name: 'Widget',
  slug: 'widget',
  description: { version: 1, nodes: [] },
  price: 1,
  sku: null,
  categoryId: null,
  images: [image],
  metadata: {},
  createdAt: new Date(),
  updatedAt: new Date(),
};

/** Records every call, in order, across the repository and storage. */
function createCalls(): { calls: string[]; storage: StorageAdapter } {
  const calls: string[] = [];
  return {
    calls,
    storage: {
      upload: async () => '',
      delete: async (url) => {
        calls.push(`storage.delete ${url}`);
      },
      getPublicUrl: (key) => key,
    },
  };
}

describe('delete ordering', () => {
  it('keeps product files when the database delete fails', async () => {
    const { calls, storage } = createCalls();
    const repo = {
      get: async () => product,
      delete: async () => {
        throw new Error('database unavailable');
      },
    } as unknown as ProductRepository;

    await expect(
      new ProductService(repo, storage).delete('p1'),
    ).rejects.toThrow('database unavailable');
    expect(calls).toEqual([]);
  });

  it('removes the product row before its files', async () => {
    const { calls, storage } = createCalls();
    const repo = {
      get: async () => product,
      delete: async () => {
        calls.push('repo.delete');
      },
    } as unknown as ProductRepository;

    await new ProductService(repo, storage).delete('p1');

    expect(calls).toEqual([
      'repo.delete',
      'storage.delete https://cdn.example.com/a.jpg',
    ]);
  });

  it('keeps the image file when the database delete fails', async () => {
    const { calls, storage } = createCalls();
    const repo = {
      get: async () => image,
      delete: async () => {
        throw new Error('database unavailable');
      },
    } as unknown as ImageRepository;

    await expect(new ImageService(repo, storage).delete('i1')).rejects.toThrow(
      'database unavailable',
    );
    expect(calls).toEqual([]);
  });

  it('still succeeds when the file cannot be removed afterwards', async () => {
    const repo = {
      get: async () => image,
      delete: async () => {},
    } as unknown as ImageRepository;
    const storage: StorageAdapter = {
      upload: async () => '',
      delete: async () => {
        throw new Error('bucket unavailable');
      },
      getPublicUrl: (key) => key,
    };

    await expect(
      new ImageService(repo, storage).delete('i1'),
    ).resolves.toBeUndefined();
  });
});
