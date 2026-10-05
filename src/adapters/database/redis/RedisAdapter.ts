import { randomUUID } from 'node:crypto';
import { createRequire } from 'node:module';
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
  mergeCategoryUpdate,
  mergeProductUpdate,
} from '../../../utils/merge.js';
import { generateSlug } from '../../../utils/slug.js';

export interface RedisConfig {
  /** ioredis connection URL, e.g. 'redis://localhost:6379'. */
  url: string;
  /** Optional key prefix to namespace all catalog keys. Defaults to 'occ'. */
  keyPrefix?: string;
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
 * Multi-key writes are not transactional.
 *
 * Key layout (see {@link RedisKeys}):
 *   {prefix}:product:{id}          — product JSON (without images)
 *   {prefix}:products:all          — set of all product IDs
 *   {prefix}:products:cat:{catId}  — set of product IDs by category
 *   {prefix}:category:{id}         — category JSON
 *   {prefix}:categories:all        — set of all category IDs
 *   {prefix}:image:{id}            — image JSON
 *   {prefix}:images:product:{pid}  — sorted set of image IDs by sort_order
 */
export class RedisAdapter implements DatabaseAdapter {
  private readonly client: Redis;

  readonly products: ProductRepository;
  readonly categories: CategoryRepository;
  readonly images: ImageRepository;

  constructor(config: RedisConfig) {
    const RedisClass = loadDriver();
    this.client = new RedisClass(config.url);
    const keys = new RedisKeys(config.keyPrefix ?? 'occ');

    const images = new RedisImageRepository(this.client, keys);
    this.images = images;
    const products = new RedisProductRepository(this.client, keys, images);
    this.products = products;
    this.categories = new RedisCategoryRepository(this.client, keys, products);
  }

  async initialize(): Promise<void> {
    await this.client.ping();
  }

  async verify(): Promise<VerificationResult> {
    try {
      await this.client.ping();
      return { ok: true, issues: [] };
    } catch (err) {
      return {
        ok: false,
        issues: [`Redis connection failed: ${String(err)}`],
      };
    }
  }

  async close(): Promise<void> {
    await this.client.quit();
  }
}

function matchesProductSearch(product: Product, search: string): boolean {
  const needle = search.toLowerCase();
  return (
    product.name.toLowerCase().includes(needle) ||
    (product.sku?.toLowerCase().includes(needle) ?? false)
  );
}

function paginate<T>(items: T[], page: { limit?: number; offset?: number }) {
  const start = page.offset ?? 0;
  const end = page.limit !== undefined ? start + page.limit : undefined;
  return items.slice(start, end);
}

class RedisProductRepository implements ProductRepository {
  constructor(
    private readonly client: Redis,
    private readonly keys: RedisKeys,
    private readonly images: RedisImageRepository,
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

    await this.save(product);
    await this.client.sadd(this.keys.allProducts(), product.id);
    if (product.categoryId) {
      await this.client.sadd(
        this.keys.productsInCategory(product.categoryId),
        product.id,
      );
    }
    return product;
  }

  async get(id: string): Promise<Product | null> {
    const [product] = await this.loadMany([id]);
    return product ?? null;
  }

  async update(id: string, input: UpdateProductInput): Promise<Product> {
    const existing = await this.get(id);
    if (!existing) throw new Error(`Product not found: ${id}`);

    const updated: Product = {
      ...existing,
      ...mergeProductUpdate(existing, input),
      updatedAt: new Date(),
    };
    await this.save(updated);

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

  async delete(id: string): Promise<void> {
    const existing = await this.get(id);
    if (!existing) return;

    for (const image of existing.images) {
      await this.images.delete(image.id);
    }
    await this.client.del(this.keys.product(id));
    await this.client.srem(this.keys.allProducts(), id);
    if (existing.categoryId) {
      await this.client.srem(
        this.keys.productsInCategory(existing.categoryId),
        id,
      );
    }
  }

  async list(filter: ProductFilter = {}): Promise<Product[]> {
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

    await this.save(category);
    await this.client.sadd(this.keys.allCategories(), category.id);
    return category;
  }

  async get(id: string): Promise<Category | null> {
    const raw = await this.client.get(this.keys.category(id));
    return raw ? parseEntity<Category>(raw, ['createdAt', 'updatedAt']) : null;
  }

  async update(id: string, input: UpdateCategoryInput): Promise<Category> {
    const existing = await this.get(id);
    if (!existing) throw new Error(`Category not found: ${id}`);

    const updated: Category = {
      ...existing,
      ...mergeCategoryUpdate(existing, input),
      updatedAt: new Date(),
    };
    await this.save(updated);
    return updated;
  }

  async delete(id: string): Promise<void> {
    await this.products.clearCategory(id);
    for (const child of await this.loadAll()) {
      if (child.parentId === id) {
        await this.save({ ...child, parentId: null });
      }
    }
    await this.client.del(this.keys.category(id));
    await this.client.srem(this.keys.allCategories(), id);
  }

  async list(filter: CategoryFilter = {}): Promise<Category[]> {
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
