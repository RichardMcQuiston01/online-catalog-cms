import { randomUUID } from 'node:crypto';
import { createRequire } from 'node:module';
import { SlugConflictError } from '../../../errors.js';
import type {
  CategoryRepository,
  DatabaseAdapter,
  ImageRepository,
  ProductRepository,
  VerificationResult,
} from '../../../interfaces/DatabaseAdapter.js';
import type {
  Category,
  CategoryFilter,
  CreateCategoryInput,
  UpdateCategoryInput,
} from '../../../types/category.js';
import type { CreateImageInput, Image } from '../../../types/image.js';
import type {
  CreateProductInput,
  Product,
  ProductFilter,
  UpdateProductInput,
} from '../../../types/product.js';
import {
  resolveCategoryFilter,
  resolveProductFilter,
} from '../../../utils/listFilter.js';
import {
  mergeCategoryUpdate,
  mergeProductUpdate,
} from '../../../utils/merge.js';
import { generateSlug } from '../../../utils/slug.js';
import {
  type ConnectionErrorHandler,
  resolveErrorHandler,
} from '../errorHandler.js';

export interface RedisConfig {
  /** ioredis connection URL, e.g. 'redis://localhost:6379'. */
  url: string;
  /** Optional key prefix to namespace all catalog keys. Defaults to 'occ'. */
  keyPrefix?: string;
  /**
   * Called with connection errors (dropped connection, refused connect, ...).
   * Defaults to logging with `console.error`. Without a listener ioredis's
   * `error` event would terminate the process.
   */
  onError?: ConnectionErrorHandler;
}

type Redis = import('ioredis').Redis;
type RedisConstructor = new (url: string) => Redis;

function loadDriver(): RedisConstructor {
  try {
    const require = createRequire(import.meta.url);
    // biome-ignore lint/suspicious/noExplicitAny: dynamic require
    const mod = require('ioredis') as any;
    return (mod.default ?? mod) as RedisConstructor;
  } catch {
    throw new Error('ioredis is not installed. Run: bun add ioredis');
  }
}

/** Builds every Redis key from one namespace so the layout lives in one place. */
class RedisKeys {
  constructor(private readonly prefix: string) {}

  product(id: string): string {
    return `${this.prefix}:product:${id}`;
  }

  allProducts(): string {
    return `${this.prefix}:products:all`;
  }

  productsInCategory(categoryId: string): string {
    return `${this.prefix}:products:cat:${categoryId}`;
  }

  category(id: string): string {
    return `${this.prefix}:category:${id}`;
  }

  allCategories(): string {
    return `${this.prefix}:categories:all`;
  }

  image(id: string): string {
    return `${this.prefix}:image:${id}`;
  }

  /** Maps a product slug to the id that owns it; `SET NX` keeps slugs unique. */
  productSlug(slug: string): string {
    return `${this.prefix}:slug:product:${slug}`;
  }

  /** Maps a category slug to the id that owns it. */
  categorySlug(slug: string): string {
    return `${this.prefix}:slug:category:${slug}`;
  }

  imagesOfProduct(productId: string): string {
    return `${this.prefix}:images:product:${productId}`;
  }
}

/** Parses a stored JSON entity and revives its `Date` fields. */
function parseEntity<T extends object>(raw: string, dateFields: string[]): T {
  const entity = JSON.parse(raw) as Record<string, unknown>;
  for (const field of dateFields) {
    entity[field] = new Date(entity[field] as string);
  }
  return entity as T;
}

/**
 * Redis adapter. Each entity is stored as a JSON string, with sets and sorted
 * sets as secondary indexes. Redis has no foreign keys, so the repositories
 * reproduce the SQL behavior themselves: deleting a product deletes its
 * images, and deleting a category clears it from its products and children.
 * Writes that touch several keys (create and delete of a product) run in a
 * `MULTI`/`EXEC` so they apply together or not at all.
 *
 * Key layout (see {@link RedisKeys}):
 *   {prefix}:product:{id}          — product JSON (without images)
 *   {prefix}:products:all          — set of all product IDs
 *   {prefix}:products:cat:{catId}  — set of product IDs by category
 *   {prefix}:category:{id}         — category JSON
 *   {prefix}:categories:all        — set of all category IDs
 *   {prefix}:slug:product:{slug}   — id of the product that owns the slug
 *   {prefix}:slug:category:{slug}  — id of the category that owns the slug
 *   {prefix}:image:{id}            — image JSON
 *   {prefix}:images:product:{pid}  — sorted set of image IDs by sort_order
 */
export class RedisAdapter implements DatabaseAdapter {
  private readonly client: Redis;
  private readonly onError: ConnectionErrorHandler;
  private readonly slugIndex: RedisSlugIndex;

  readonly products: ProductRepository;
  readonly categories: CategoryRepository;
  readonly images: ImageRepository;

  constructor(config: RedisConfig) {
    const RedisClass = loadDriver();
    this.client = new RedisClass(config.url);
    this.onError = resolveErrorHandler('Redis', config.onError);
    this.client.on('error', this.onError);
    const keys = new RedisKeys(config.keyPrefix ?? 'occ');
    this.slugIndex = new RedisSlugIndex(this.client, keys);

    const images = new RedisImageRepository(this.client, keys);
    this.images = images;
    const products = new RedisProductRepository(
      this.client,
      keys,
      images,
      this.slugIndex,
    );
    this.products = products;
    this.categories = new RedisCategoryRepository(
      this.client,
      keys,
      products,
      this.slugIndex,
    );
  }

  async initialize(): Promise<void> {
    await this.client.ping();
    await this.slugIndex.backfill();
  }

  async verify(): Promise<VerificationResult> {
    try {
      await this.client.ping();
      return { ok: true, issues: [] };
    } catch (err) {
      // The driver error can name the server address; keep it out of the
      // result, which callers may render, and report it to the error handler.
      this.onError(err instanceof Error ? err : new Error(String(err)));
      return {
        ok: false,
        issues: ['Redis connection failed. Check the server log for details.'],
      };
    }
  }

  async close(): Promise<void> {
    // QUIT cannot complete without a connection; drop the socket instead.
    await this.client.quit().catch(() => this.client.disconnect());
  }
}

/**
 * Enforces slug uniqueness, which Redis has no constraint for. A slug is
 * claimed with `SET NX` before the entity is written, so two concurrent
 * creates cannot both succeed.
 */
class RedisSlugIndex {
  constructor(
    private readonly client: Redis,
    private readonly keys: RedisKeys,
  ) {}

  /** Claims `slug` for `id`; throws {@link SlugConflictError} if taken by another id. */
  async claim(key: string, slug: string, id: string): Promise<void> {
    const claimed = await this.client.set(key, id, 'NX');
    if (claimed === 'OK') return;
    if ((await this.client.get(key)) !== id) throw new SlugConflictError(slug);
  }

  async release(key: string): Promise<void> {
    await this.client.del(key);
  }

  async ownerOf(key: string): Promise<string | null> {
    return this.client.get(key);
  }

  /**
   * Indexes slugs of entities written before the index existed. Idempotent:
   * `NX` never overwrites a claim, so it is safe on every start.
   */
  async backfill(): Promise<void> {
    const productIds = await this.client.smembers(this.keys.allProducts());
    const categoryIds = await this.client.smembers(this.keys.allCategories());
    await this.backfillKind(
      productIds,
      (id) => this.keys.product(id),
      (slug) => this.keys.productSlug(slug),
    );
    await this.backfillKind(
      categoryIds,
      (id) => this.keys.category(id),
      (slug) => this.keys.categorySlug(slug),
    );
  }

  private async backfillKind(
    ids: string[],
    entityKey: (id: string) => string,
    slugKey: (slug: string) => string,
  ): Promise<void> {
    if (ids.length === 0) return;
    const raws = await this.client.mget(ids.map(entityKey));
    for (const raw of raws) {
      if (!raw) continue;
      const entity = JSON.parse(raw) as { id: string; slug: string };
      await this.client.set(slugKey(entity.slug), entity.id, 'NX');
    }
  }
}

function matchesProductSearch(product: Product, search: string): boolean {
  const needle = search.toLowerCase();
  return (
    product.name.toLowerCase().includes(needle) ||
    (product.sku?.toLowerCase().includes(needle) ?? false)
  );
}

/**
 * Runs a `MULTI` block and throws if the transaction or any command in it
 * failed. ioredis reports per-command errors in the result instead of
 * rejecting, which would otherwise hide a partially applied write.
 */
async function execTransaction(tx: ReturnType<Redis['multi']>): Promise<void> {
  const results = await tx.exec();
  if (!results) throw new Error('Redis transaction was discarded.');
  for (const [error] of results) {
    if (error) throw error;
  }
}

/** Applies an already validated page (see `resolveProductFilter`). */
function paginate<T>(items: T[], page: { limit: number; offset: number }) {
  return items.slice(page.offset, page.offset + page.limit);
}

class RedisProductRepository implements ProductRepository {
  constructor(
    private readonly client: Redis,
    private readonly keys: RedisKeys,
    private readonly images: RedisImageRepository,
    private readonly slugs: RedisSlugIndex,
  ) {}

  /** Persists a product without its images, which live under their own keys. */
  private async save(product: Product): Promise<void> {
    await this.client.set(
      this.keys.product(product.id),
      JSON.stringify({ ...product, images: [] }),
    );
  }

  /** Loads products by ID in one round trip, skipping IDs that no longer exist. */
  private async loadMany(ids: string[]): Promise<Product[]> {
    if (ids.length === 0) return [];

    const rawProducts = await this.client.mget(
      ids.map((id) => this.keys.product(id)),
    );
    const products = rawProducts.flatMap((raw) =>
      raw ? [parseEntity<Product>(raw, ['createdAt', 'updatedAt'])] : [],
    );

    const imagesByProductId = await this.images.listByProducts(
      products.map((product) => product.id),
    );
    for (const product of products) {
      product.images = imagesByProductId.get(product.id) ?? [];
    }
    return products;
  }

  async create(input: CreateProductInput): Promise<Product> {
    const now = new Date();
    const product: Product = {
      id: randomUUID(),
      name: input.name,
      slug: input.slug ?? generateSlug(input.name),
      description: input.description,
      price: input.price,
      sku: input.sku ?? null,
      categoryId: input.categoryId ?? null,
      images: [],
      metadata: input.metadata ?? {},
      createdAt: now,
      updatedAt: now,
    };

    const slugKey = this.keys.productSlug(product.slug);
    await this.slugs.claim(slugKey, product.slug, product.id);

    try {
      const tx = this.client.multi();
      tx.set(
        this.keys.product(product.id),
        JSON.stringify({ ...product, images: [] }),
      );
      tx.sadd(this.keys.allProducts(), product.id);
      if (product.categoryId) {
        tx.sadd(this.keys.productsInCategory(product.categoryId), product.id);
      }
      await execTransaction(tx);
    } catch (error) {
      await this.slugs.release(slugKey);
      throw error;
    }
    return product;
  }

  async get(id: string): Promise<Product | null> {
    const [product] = await this.loadMany([id]);
    return product ?? null;
  }

  async getBySlug(slug: string): Promise<Product | null> {
    const id = await this.slugs.ownerOf(this.keys.productSlug(slug));
    return id ? this.get(id) : null;
  }

  async update(id: string, input: UpdateProductInput): Promise<Product> {
    const existing = await this.get(id);
    if (!existing) throw new Error(`Product not found: ${id}`);

    const updated: Product = {
      ...existing,
      ...mergeProductUpdate(existing, input),
      updatedAt: new Date(),
    };

    const slugChanged = updated.slug !== existing.slug;
    const newSlugKey = this.keys.productSlug(updated.slug);
    if (slugChanged) await this.slugs.claim(newSlugKey, updated.slug, id);
    try {
      await this.save(updated);
    } catch (error) {
      if (slugChanged) await this.slugs.release(newSlugKey);
      throw error;
    }
    if (slugChanged) {
      await this.slugs.release(this.keys.productSlug(existing.slug));
    }

    if (existing.categoryId !== updated.categoryId) {
      if (existing.categoryId) {
        await this.client.srem(
          this.keys.productsInCategory(existing.categoryId),
          id,
        );
      }
      if (updated.categoryId) {
        await this.client.sadd(
          this.keys.productsInCategory(updated.categoryId),
          id,
        );
      }
    }

    return updated;
  }

  /** Removes the product and its images in one atomic `MULTI`/`EXEC`. */
  async delete(id: string): Promise<void> {
    const existing = await this.get(id);
    if (!existing) return;

    const tx = this.client.multi();
    for (const image of existing.images) {
      tx.del(this.keys.image(image.id));
    }
    tx.del(this.keys.imagesOfProduct(id));
    tx.del(this.keys.product(id));
    tx.del(this.keys.productSlug(existing.slug));
    tx.srem(this.keys.allProducts(), id);
    if (existing.categoryId) {
      tx.srem(this.keys.productsInCategory(existing.categoryId), id);
    }
    await execTransaction(tx);
  }

  async list(input: ProductFilter = {}): Promise<Product[]> {
    const filter = resolveProductFilter(input);
    if (filter.limit === 0) return [];

    const ids = await this.candidateIds(filter.categoryId);

    const products = (await this.loadMany(ids)).filter(
      (product) =>
        (!filter.search || matchesProductSearch(product, filter.search)) &&
        (filter.minPrice === undefined || product.price >= filter.minPrice) &&
        (filter.maxPrice === undefined || product.price <= filter.maxPrice),
    );

    products.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
    return paginate(products, filter);
  }

  /** Narrows by category via its index; `null` (uncategorized) has none. */
  private async candidateIds(categoryId?: string | null): Promise<string[]> {
    if (categoryId === undefined) {
      return this.client.smembers(this.keys.allProducts());
    }
    if (categoryId === null) {
      const all = await this.loadMany(
        await this.client.smembers(this.keys.allProducts()),
      );
      return all.filter((p) => p.categoryId === null).map((p) => p.id);
    }
    return this.client.smembers(this.keys.productsInCategory(categoryId));
  }

  /** Detaches every product from a deleted category (SQL `ON DELETE SET NULL`). */
  async clearCategory(categoryId: string): Promise<void> {
    const ids = await this.client.smembers(
      this.keys.productsInCategory(categoryId),
    );
    for (const product of await this.loadMany(ids)) {
      await this.save({ ...product, categoryId: null });
    }
    await this.client.del(this.keys.productsInCategory(categoryId));
  }
}

class RedisCategoryRepository implements CategoryRepository {
  constructor(
    private readonly client: Redis,
    private readonly keys: RedisKeys,
    private readonly products: RedisProductRepository,
    private readonly slugs: RedisSlugIndex,
  ) {}

  private async save(category: Category): Promise<void> {
    await this.client.set(
      this.keys.category(category.id),
      JSON.stringify(category),
    );
  }

  private async loadAll(): Promise<Category[]> {
    const ids = await this.client.smembers(this.keys.allCategories());
    if (ids.length === 0) return [];

    const rawCategories = await this.client.mget(
      ids.map((id) => this.keys.category(id)),
    );
    return rawCategories.flatMap((raw) =>
      raw ? [parseEntity<Category>(raw, ['createdAt', 'updatedAt'])] : [],
    );
  }

  async create(input: CreateCategoryInput): Promise<Category> {
    const now = new Date();
    const category: Category = {
      id: randomUUID(),
      name: input.name,
      slug: input.slug ?? generateSlug(input.name),
      parentId: input.parentId ?? null,
      metadata: input.metadata ?? {},
      createdAt: now,
      updatedAt: now,
    };

    const slugKey = this.keys.categorySlug(category.slug);
    await this.slugs.claim(slugKey, category.slug, category.id);

    try {
      const tx = this.client.multi();
      tx.set(this.keys.category(category.id), JSON.stringify(category));
      tx.sadd(this.keys.allCategories(), category.id);
      await execTransaction(tx);
    } catch (error) {
      await this.slugs.release(slugKey);
      throw error;
    }
    return category;
  }

  async get(id: string): Promise<Category | null> {
    const raw = await this.client.get(this.keys.category(id));
    return raw ? parseEntity<Category>(raw, ['createdAt', 'updatedAt']) : null;
  }

  async getBySlug(slug: string): Promise<Category | null> {
    const id = await this.slugs.ownerOf(this.keys.categorySlug(slug));
    return id ? this.get(id) : null;
  }

  async update(id: string, input: UpdateCategoryInput): Promise<Category> {
    const existing = await this.get(id);
    if (!existing) throw new Error(`Category not found: ${id}`);

    const updated: Category = {
      ...existing,
      ...mergeCategoryUpdate(existing, input),
      updatedAt: new Date(),
    };

    const slugChanged = updated.slug !== existing.slug;
    const newSlugKey = this.keys.categorySlug(updated.slug);
    if (slugChanged) await this.slugs.claim(newSlugKey, updated.slug, id);
    try {
      await this.save(updated);
    } catch (error) {
      if (slugChanged) await this.slugs.release(newSlugKey);
      throw error;
    }
    if (slugChanged) {
      await this.slugs.release(this.keys.categorySlug(existing.slug));
    }
    return updated;
  }

  async delete(id: string): Promise<void> {
    const existing = await this.get(id);
    await this.products.clearCategory(id);
    for (const child of await this.loadAll()) {
      if (child.parentId === id) {
        await this.save({ ...child, parentId: null });
      }
    }
    await this.client.del(this.keys.category(id));
    if (existing)
      await this.slugs.release(this.keys.categorySlug(existing.slug));
    await this.client.srem(this.keys.allCategories(), id);
  }

  async list(input: CategoryFilter = {}): Promise<Category[]> {
    const filter = resolveCategoryFilter(input);
    if (filter.limit === 0) return [];

    const needle = filter.search?.toLowerCase();
    const categories = (await this.loadAll()).filter(
      (category) =>
        (filter.parentId === undefined ||
          category.parentId === filter.parentId) &&
        (!needle || category.name.toLowerCase().includes(needle)),
    );

    categories.sort((a, b) => a.name.localeCompare(b.name));
    return paginate(categories, filter);
  }
}

class RedisImageRepository implements ImageRepository {
  constructor(
    private readonly client: Redis,
    private readonly keys: RedisKeys,
  ) {}

  async create(input: CreateImageInput): Promise<Image> {
    const image: Image = {
      id: randomUUID(),
      productId: input.productId,
      url: input.url,
      altText: input.altText,
      sortOrder: input.sortOrder ?? 0,
      createdAt: new Date(),
    };

    await this.client.set(this.keys.image(image.id), JSON.stringify(image));
    await this.client.zadd(
      this.keys.imagesOfProduct(input.productId),
      image.sortOrder,
      image.id,
    );
    return image;
  }

  async get(id: string): Promise<Image | null> {
    const raw = await this.client.get(this.keys.image(id));
    return raw ? parseEntity<Image>(raw, ['createdAt']) : null;
  }

  async delete(id: string): Promise<void> {
    const image = await this.get(id);
    await this.client.del(this.keys.image(id));
    if (image) {
      await this.client.zrem(this.keys.imagesOfProduct(image.productId), id);
    }
  }

  async listByProduct(productId: string): Promise<Image[]> {
    const imagesByProductId = await this.listByProducts([productId]);
    return imagesByProductId.get(productId) ?? [];
  }

  /** Loads images for many products using pipelined reads (avoids N+1). */
  async listByProducts(productIds: string[]): Promise<Map<string, Image[]>> {
    const imagesByProductId = new Map<string, Image[]>();
    if (productIds.length === 0) return imagesByProductId;

    const pipeline = this.client.pipeline();
    for (const productId of productIds) {
      pipeline.zrange(this.keys.imagesOfProduct(productId), 0, -1);
    }
    const results = (await pipeline.exec()) ?? [];

    const imageIdsByProductId = new Map<string, string[]>();
    productIds.forEach((productId, index) => {
      const [error, ids] = results[index] ?? [null, []];
      if (error) throw error;
      imageIdsByProductId.set(productId, ids as string[]);
    });

    const allImageIds = [...imageIdsByProductId.values()].flat();
    if (allImageIds.length === 0) return imagesByProductId;

    const rawImages = await this.client.mget(
      allImageIds.map((id) => this.keys.image(id)),
    );
    const imagesById = new Map<string, Image>();
    for (const raw of rawImages) {
      if (!raw) continue;
      const image = parseEntity<Image>(raw, ['createdAt']);
      imagesById.set(image.id, image);
    }

    for (const [productId, ids] of imageIdsByProductId) {
      imagesByProductId.set(
        productId,
        ids.flatMap((id) => {
          const image = imagesById.get(id);
          return image ? [image] : [];
        }),
      );
    }
    return imagesByProductId;
  }
}
