import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { DatabaseAdapter } from '../../interfaces/DatabaseAdapter.js';
import { document, paragraph, text } from '../../rich-text/builders.js';
import type { ProductFilter } from '../../types/product.js';

/** A fresh, isolated adapter plus a hook that deletes everything it wrote. */
export interface AdapterFixture {
  adapter: DatabaseAdapter;
  cleanup(): Promise<void>;
}

const description = document([paragraph([text('Description')])]);

/** Product timestamps order `list()`, so creations must not share a millisecond. */
const pause = (): Promise<void> => new Promise((r) => setTimeout(r, 5));

/**
 * Behavior every `DatabaseAdapter` must share, including the referential
 * rules the SQL schema enforces with foreign keys (cascade / set null).
 * Run it against each adapter with a factory that returns an empty store.
 */
export function describeDatabaseAdapterContract(
  name: string,
  createFixture: () => Promise<AdapterFixture>,
  options: { skip?: boolean } = {},
): void {
  describe.skipIf(options.skip === true)(`${name} adapter contract`, () => {
    let fixture: AdapterFixture;
    let db: DatabaseAdapter;

    beforeEach(async () => {
      fixture = await createFixture();
      db = fixture.adapter;
      await db.initialize();
    });

    afterEach(async () => {
      await fixture.cleanup();
      await db.close();
    });

    it('verifies a freshly initialized store', async () => {
      expect(await db.verify()).toEqual({ ok: true, issues: [] });
    });

    describe('products', () => {
      it('creates, gets and updates a product', async () => {
        const created = await db.products.create({
          name: 'Acme Widget',
          price: 1999,
          sku: 'ACME-1',
          description,
          metadata: { color: 'blue' },
        });
        expect(created.slug).toBe('acme-widget');
        expect(await db.products.get(created.id)).toEqual(created);

        const updated = await db.products.update(created.id, { price: 2499 });
        expect(updated.price).toBe(2499);
        expect(updated.name).toBe('Acme Widget');
        expect(updated.sku).toBe('ACME-1');
        expect(updated.updatedAt.getTime()).toBeGreaterThanOrEqual(
          created.updatedAt.getTime(),
        );
      });

      it('clears nullable fields when updated with null', async () => {
        const category = await db.categories.create({ name: 'Tools' });
        const product = await db.products.create({
          name: 'Hammer',
          price: 1,
          sku: 'H-1',
          categoryId: category.id,
          description,
        });

        const updated = await db.products.update(product.id, {
          sku: null,
          categoryId: null,
        });

        expect(updated.sku).toBeNull();
        expect(updated.categoryId).toBeNull();
        expect((await db.products.get(product.id))?.categoryId).toBeNull();
      });

      it('returns null for an unknown id and rejects updating one', async () => {
        expect(await db.products.get('missing')).toBeNull();
        await expect(
          db.products.update('missing', { price: 1 }),
        ).rejects.toThrow();
      });

      it('deletes a product', async () => {
        const product = await db.products.create({
          name: 'Gone',
          price: 1,
          description,
        });
        await db.products.delete(product.id);
        expect(await db.products.get(product.id)).toBeNull();
      });

      it('filters by category, including uncategorized', async () => {
        const category = await db.categories.create({ name: 'Garden' });
        await db.products.create({
          name: 'Spade',
          price: 1,
          categoryId: category.id,
          description,
        });
        await db.products.create({ name: 'Loose', price: 1, description });

        const inCategory = await db.products.list({ categoryId: category.id });
        const uncategorized = await db.products.list({ categoryId: null });

        expect(inCategory.map((p) => p.name)).toEqual(['Spade']);
        expect(uncategorized.map((p) => p.name)).toEqual(['Loose']);
      });

      it('searches name and SKU case-insensitively', async () => {
        await db.products.create({
          name: 'Blue Widget',
          price: 1,
          sku: 'ZX-100',
          description,
        });
        await db.products.create({ name: 'Gadget', price: 1, description });

        const byName = await db.products.list({ search: 'widget' });
        const bySku = await db.products.list({ search: 'zx-1' });

        expect(byName.map((p) => p.name)).toEqual(['Blue Widget']);
        expect(bySku.map((p) => p.name)).toEqual(['Blue Widget']);
      });

      it('searches literally rather than as a pattern', async () => {
        await db.products.create({ name: 'Plain', price: 1, description });
        expect(await db.products.list({ search: '.*' })).toHaveLength(0);
      });

      it('treats % and _ in a search as literal characters', async () => {
        await db.products.create({ name: 'Plain', price: 1, description });
        await db.products.create({
          name: '100% Cotton',
          price: 1,
          description,
        });
        await db.products.create({ name: 'snake_case', price: 1, description });

        expect(await db.products.list({ search: '%' })).toHaveLength(1);
        expect(
          (await db.products.list({ search: '100%' })).map((p) => p.name),
        ).toEqual(['100% Cotton']);
        expect(
          (await db.products.list({ search: 'e_c' })).map((p) => p.name),
        ).toEqual(['snake_case']);
        expect(await db.products.list({ search: '_' })).toHaveLength(1);
      });

      it('returns an empty page for limit 0 and rejects invalid pagination', async () => {
        await db.products.create({ name: 'One', price: 1, description });

        expect(await db.products.list({ limit: 0 })).toEqual([]);
        for (const filter of [
          { limit: -1 },
          { limit: 1.5 },
          { limit: Number.NaN },
          { limit: 1_000_000 },
          { offset: -1 },
          { offset: 0.5 },
          { limit: '5' as unknown as number },
        ]) {
          await expect(db.products.list(filter)).rejects.toThrow(
            /Invalid (limit|offset) filter/,
          );
        }
      });

      it('rejects filter values that are not plain strings and numbers', async () => {
        await db.products.create({ name: 'One', price: 1, description });

        for (const filter of [
          { categoryId: { $ne: null } },
          { categoryId: ['a'] },
          { minPrice: { $gt: 0 } },
          { maxPrice: Number.NaN },
          { minPrice: Number.POSITIVE_INFINITY },
          { search: { $regex: '.*' } },
        ]) {
          await expect(
            db.products.list(filter as unknown as ProductFilter),
          ).rejects.toThrow(/Invalid \w+ filter/);
        }
      });

      it('filters by price range', async () => {
        for (const price of [100, 500, 900]) {
          await db.products.create({
            name: `Item ${price}`,
            price,
            description,
          });
        }
        const inRange = await db.products.list({
          minPrice: 200,
          maxPrice: 600,
        });
        expect(inRange.map((p) => p.price)).toEqual([500]);
      });

      it('orders newest first and paginates', async () => {
        for (const name of ['First', 'Second', 'Third']) {
          await db.products.create({ name, price: 1, description });
          await pause();
        }

        const all = await db.products.list();
        const page = await db.products.list({ limit: 1, offset: 1 });
        const offsetOnly = await db.products.list({ offset: 2 });

        expect(all.map((p) => p.name)).toEqual(['Third', 'Second', 'First']);
        expect(page.map((p) => p.name)).toEqual(['Second']);
        expect(offsetOnly.map((p) => p.name)).toEqual(['First']);
      });
    });

    describe('images', () => {
      it('creates, gets and lists images in sort order', async () => {
        const product = await db.products.create({
          name: 'Camera',
          price: 1,
          description,
        });
        const second = await db.images.create({
          productId: product.id,
          url: 'b.jpg',
          altText: 'b',
          sortOrder: 1,
        });
        await db.images.create({
          productId: product.id,
          url: 'a.jpg',
          altText: 'a',
          sortOrder: 0,
        });

        expect(await db.images.get(second.id)).toEqual(second);
        const images = await db.images.listByProduct(product.id);
        expect(images.map((i) => i.url)).toEqual(['a.jpg', 'b.jpg']);
      });

      it('attaches images to products from get and list', async () => {
        const product = await db.products.create({
          name: 'Lens',
          price: 1,
          description,
        });
        await db.images.create({
          productId: product.id,
          url: 'lens.jpg',
          altText: '',
        });

        const fetched = await db.products.get(product.id);
        const [listed] = await db.products.list();

        expect(fetched?.images.map((i) => i.url)).toEqual(['lens.jpg']);
        expect(listed?.images.map((i) => i.url)).toEqual(['lens.jpg']);
      });

      it('deletes an image', async () => {
        const product = await db.products.create({
          name: 'Tripod',
          price: 1,
          description,
        });
        const image = await db.images.create({
          productId: product.id,
          url: 'tripod.jpg',
          altText: '',
        });

        await db.images.delete(image.id);

        expect(await db.images.get(image.id)).toBeNull();
        expect(await db.images.listByProduct(product.id)).toEqual([]);
      });

      it('deletes a product’s images along with the product', async () => {
        const product = await db.products.create({
          name: 'Bag',
          price: 1,
          description,
        });
        const image = await db.images.create({
          productId: product.id,
          url: 'bag.jpg',
          altText: '',
        });

        await db.products.delete(product.id);

        expect(await db.images.get(image.id)).toBeNull();
      });
    });

    describe('categories', () => {
      it('creates, gets, updates and deletes a category', async () => {
        const created = await db.categories.create({ name: 'Books' });
        expect(created.slug).toBe('books');
        expect(await db.categories.get(created.id)).toEqual(created);

        const updated = await db.categories.update(created.id, {
          name: 'Books & Media',
        });
        expect(updated.name).toBe('Books & Media');

        await db.categories.delete(created.id);
        expect(await db.categories.get(created.id)).toBeNull();
      });

      it('returns null for an unknown id and rejects updating one', async () => {
        expect(await db.categories.get('missing')).toBeNull();
        await expect(
          db.categories.update('missing', { name: 'x' }),
        ).rejects.toThrow();
      });

      it('treats % and _ in a category search as literal characters', async () => {
        await db.categories.create({ name: 'Plain' });
        await db.categories.create({ name: '50% Off' });

        expect(
          (await db.categories.list({ search: '%' })).map((c) => c.name),
        ).toEqual(['50% Off']);
        expect(await db.categories.list({ search: '_' })).toEqual([]);
      });

      it('applies the same pagination rules to categories', async () => {
        await db.categories.create({ name: 'One' });

        expect(await db.categories.list({ limit: 0 })).toEqual([]);
        await expect(db.categories.list({ limit: -1 })).rejects.toThrow(
          'Invalid limit filter',
        );
        await expect(
          db.categories.list({ parentId: { $ne: null } as never }),
        ).rejects.toThrow('Invalid parentId filter');
      });

      it('lists by parent and search, ordered by name', async () => {
        const parent = await db.categories.create({ name: 'Parent' });
        await db.categories.create({ name: 'Zebra', parentId: parent.id });
        await db.categories.create({ name: 'Apple', parentId: parent.id });
        await db.categories.create({ name: 'Other' });

        const children = await db.categories.list({ parentId: parent.id });
        const roots = await db.categories.list({ parentId: null });
        const searched = await db.categories.list({ search: 'app' });
        const paged = await db.categories.list({
          parentId: parent.id,
          limit: 1,
          offset: 1,
        });

        expect(children.map((c) => c.name)).toEqual(['Apple', 'Zebra']);
        expect(roots.map((c) => c.name)).toEqual(['Other', 'Parent']);
        expect(searched.map((c) => c.name)).toEqual(['Apple']);
        expect(paged.map((c) => c.name)).toEqual(['Zebra']);
      });

      it('detaches products and child categories when deleted', async () => {
        const category = await db.categories.create({ name: 'Parent' });
        const child = await db.categories.create({
          name: 'Child',
          parentId: category.id,
        });
        const product = await db.products.create({
          name: 'Member',
          price: 1,
          categoryId: category.id,
          description,
        });

        await db.categories.delete(category.id);

        expect((await db.categories.get(child.id))?.parentId).toBeNull();
        expect((await db.products.get(product.id))?.categoryId).toBeNull();
        expect(await db.products.list({ categoryId: category.id })).toEqual([]);
      });
    });
  });
}
