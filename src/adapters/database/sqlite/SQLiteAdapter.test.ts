import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { document, paragraph, text } from '../../../rich-text/builders.js';
import { SQLiteAdapter } from './SQLiteAdapter.js';

describe('SQLiteAdapter', () => {
  let adapter: SQLiteAdapter;

  beforeEach(async () => {
    adapter = new SQLiteAdapter({ filename: ':memory:' });
    await adapter.initialize();
  });

  afterEach(async () => {
    await adapter.close();
  });

  describe('verify', () => {
    it('returns ok after initialize', async () => {
      const result = await adapter.verify();
      expect(result.ok).toBe(true);
      expect(result.issues).toHaveLength(0);
    });
  });

  describe('categories', () => {
    it('creates and retrieves a category', async () => {
      const cat = await adapter.categories.create({ name: 'Electronics' });
      expect(cat.id).toBeTruthy();
      expect(cat.name).toBe('Electronics');
      expect(cat.slug).toBe('electronics');

      const fetched = await adapter.categories.get(cat.id);
      expect(fetched).toEqual(cat);
    });

    it('updates a category', async () => {
      const cat = await adapter.categories.create({ name: 'Books' });
      const updated = await adapter.categories.update(cat.id, {
        name: 'Books & Media',
      });
      expect(updated.name).toBe('Books & Media');
    });

    it('deletes a category', async () => {
      const cat = await adapter.categories.create({ name: 'Temp' });
      await adapter.categories.delete(cat.id);
      expect(await adapter.categories.get(cat.id)).toBeNull();
    });

    it('lists categories with filter', async () => {
      await adapter.categories.create({ name: 'Alpha' });
      await adapter.categories.create({ name: 'Beta' });
      const results = await adapter.categories.list({ search: 'alp' });
      expect(results).toHaveLength(1);
      expect(results[0]?.name).toBe('Alpha');
    });

    it('supports hierarchical parentId', async () => {
      const parent = await adapter.categories.create({ name: 'Parent' });
      const child = await adapter.categories.create({
        name: 'Child',
        parentId: parent.id,
      });
      expect(child.parentId).toBe(parent.id);

      const children = await adapter.categories.list({ parentId: parent.id });
      expect(children).toHaveLength(1);
      expect(children[0]?.id).toBe(child.id);
    });
  });

  describe('products', () => {
    const sampleDescription = document([paragraph([text('A great product.')])]);

    it('creates and retrieves a product', async () => {
      const product = await adapter.products.create({
        name: 'Widget',
        description: sampleDescription,
        price: 999,
      });

      expect(product.id).toBeTruthy();
      expect(product.name).toBe('Widget');
      expect(product.price).toBe(999);
      expect(product.slug).toBe('widget');

      const fetched = await adapter.products.get(product.id);
      expect(fetched?.name).toBe('Widget');
    });

    it('stores and retrieves rich-text description', async () => {
      const product = await adapter.products.create({
        name: 'Rich Product',
        description: sampleDescription,
        price: 100,
      });
      expect(product.description.version).toBe(1);
      expect(product.description.nodes).toHaveLength(1);
    });

    it('updates a product', async () => {
      const product = await adapter.products.create({
        name: 'Old Name',
        description: sampleDescription,
        price: 100,
      });
      const updated = await adapter.products.update(product.id, {
        name: 'New Name',
        price: 200,
      });
      expect(updated.name).toBe('New Name');
      expect(updated.price).toBe(200);
    });

    it('deletes a product', async () => {
      const product = await adapter.products.create({
        name: 'Delete Me',
        description: sampleDescription,
        price: 1,
      });
      await adapter.products.delete(product.id);
      expect(await adapter.products.get(product.id)).toBeNull();
    });

    it('lists products with price filter', async () => {
      await adapter.products.create({
        name: 'Cheap',
        description: sampleDescription,
        price: 100,
      });
      await adapter.products.create({
        name: 'Expensive',
        description: sampleDescription,
        price: 10000,
      });

      const cheap = await adapter.products.list({ maxPrice: 500 });
      expect(cheap.every((p) => p.price <= 500)).toBe(true);
    });

    it('filters products by category', async () => {
      const cat = await adapter.categories.create({ name: 'Tools' });
      await adapter.products.create({
        name: 'Hammer',
        description: sampleDescription,
        price: 1500,
        categoryId: cat.id,
      });
      await adapter.products.create({
        name: 'Wrench',
        description: sampleDescription,
        price: 1200,
        categoryId: cat.id,
      });
      await adapter.products.create({
        name: 'Paint',
        description: sampleDescription,
        price: 800,
      });

      const tools = await adapter.products.list({ categoryId: cat.id });
      expect(tools).toHaveLength(2);
    });
  });

  describe('images', () => {
    it('creates and retrieves an image', async () => {
      const product = await adapter.products.create({
        name: 'Img Product',
        description: document([paragraph([text('.')])]),
        price: 1,
      });

      const img = await adapter.images.create({
        productId: product.id,
        url: 'https://example.com/a.jpg',
        altText: 'A photo',
      });

      expect(img.id).toBeTruthy();
      expect(img.productId).toBe(product.id);

      const fetched = await adapter.images.get(img.id);
      expect(fetched?.url).toBe('https://example.com/a.jpg');
    });

    it('lists images by product', async () => {
      const product = await adapter.products.create({
        name: 'Gallery Product',
        description: document([paragraph([text('.')])]),
        price: 1,
      });

      await adapter.images.create({
        productId: product.id,
        url: 'https://example.com/1.jpg',
        altText: '1',
        sortOrder: 1,
      });
      await adapter.images.create({
        productId: product.id,
        url: 'https://example.com/2.jpg',
        altText: '2',
        sortOrder: 0,
      });

      const images = await adapter.images.listByProduct(product.id);
      expect(images).toHaveLength(2);
      expect(images[0]?.sortOrder).toBe(0);
    });

    it('deletes an image', async () => {
      const product = await adapter.products.create({
        name: 'Del Img',
        description: document([paragraph([text('.')])]),
        price: 1,
      });
      const img = await adapter.images.create({
        productId: product.id,
        url: 'https://example.com/del.jpg',
        altText: 'del',
      });
      await adapter.images.delete(img.id);
      expect(await adapter.images.get(img.id)).toBeNull();
    });
  });
});
