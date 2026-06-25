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

/**
 * Redis adapter. Data is stored as JSON strings in Redis hashes.
 *
 * Key layout:
 *   {prefix}:product:{id}          — product JSON
 *   {prefix}:products:all          — set of all product IDs
 *   {prefix}:products:cat:{catId}  — set of product IDs by category
 *   {prefix}:category:{id}         — category JSON
 *   {prefix}:categories:all        — set of all category IDs
 *   {prefix}:image:{id}            — image JSON
 *   {prefix}:images:product:{pid}  — sorted set of image IDs by sort_order
 */
export class RedisAdapter implements DatabaseAdapter {
  private readonly client: Redis;
  private readonly prefix: string;

  readonly products: ProductRepository;
  readonly categories: CategoryRepository;
  readonly images: ImageRepository;

  constructor(config: RedisConfig) {
    const RedisClass = loadDriver();
    this.client = new RedisClass(config.url);
    this.prefix = config.keyPrefix ?? 'occ';

    this.products = new RedisProductRepository(this.client, this.prefix);
    this.categories = new RedisCategoryRepository(this.client, this.prefix);
    this.images = new RedisImageRepository(this.client, this.prefix);
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

class RedisProductRepository implements ProductRepository {
  constructor(
    private readonly client: Redis,
    private readonly prefix: string,
  ) {}

  private key(id: string) {
    return `${this.prefix}:product:${id}`;
  }

  async create(input: CreateProductInput): Promise<Product> {
    const id = randomUUID();
    const now = new Date().toISOString();
    const product: Product = {
      id,
      name: input.name,
      slug: input.slug ?? generateSlug(input.name),
      description: input.description,
      price: input.price,
      sku: input.sku ?? null,
      categoryId: input.categoryId ?? null,
      images: [],
      metadata: input.metadata ?? {},
      createdAt: new Date(now),
      updatedAt: new Date(now),
    };

    await this.client.set(this.key(id), JSON.stringify(product));
    await this.client.sadd(`${this.prefix}:products:all`, id);
    if (product.categoryId) {
      await this.client.sadd(
        `${this.prefix}:products:cat:${product.categoryId}`,
        id,
      );
    }
    return product;
  }

  async get(id: string): Promise<Product | null> {
    const raw = await this.client.get(this.key(id));
    if (!raw) return null;
    const product = JSON.parse(raw) as Product;
    product.createdAt = new Date(product.createdAt);
    product.updatedAt = new Date(product.updatedAt);
    return product;
  }

  async update(id: string, input: UpdateProductInput): Promise<Product> {
    const existing = await this.get(id);
    if (!existing) throw new Error(`Product not found: ${id}`);

    const oldCategoryId = existing.categoryId;
    const now = new Date().toISOString();

    const updated: Product = {
      ...existing,
      name: input.name ?? existing.name,
      slug: input.slug ?? existing.slug,
      description: input.description ?? existing.description,
      price: input.price ?? existing.price,
      sku: input.sku !== undefined ? input.sku : existing.sku,
      categoryId:
        input.categoryId !== undefined ? input.categoryId : existing.categoryId,
      metadata: input.metadata ?? existing.metadata,
      updatedAt: new Date(now),
    };

    await this.client.set(this.key(id), JSON.stringify(updated));

    if (oldCategoryId !== updated.categoryId) {
      if (oldCategoryId) {
        await this.client.srem(
          `${this.prefix}:products:cat:${oldCategoryId}`,
          id,
        );
      }
      if (updated.categoryId) {
        await this.client.sadd(
          `${this.prefix}:products:cat:${updated.categoryId}`,
          id,
        );
      }
    }

    return updated;
  }

  async delete(id: string): Promise<void> {
    const existing = await this.get(id);
    await this.client.del(this.key(id));
    await this.client.srem(`${this.prefix}:products:all`, id);
    if (existing?.categoryId) {
      await this.client.srem(
        `${this.prefix}:products:cat:${existing.categoryId}`,
        id,
      );
    }
  }

  async list(filter: ProductFilter = {}): Promise<Product[]> {
    let ids: string[];

    if (filter.categoryId !== undefined) {
      ids = await this.client.smembers(
        `${this.prefix}:products:cat:${filter.categoryId}`,
      );
    } else {
      ids = await this.client.smembers(`${this.prefix}:products:all`);
    }

    const products: Product[] = [];
    for (const id of ids) {
      const product = await this.get(id);
      if (!product) continue;

      if (
        filter.search &&
        !product.name.toLowerCase().includes(filter.search.toLowerCase())
      )
        continue;
      if (filter.minPrice !== undefined && product.price < filter.minPrice)
        continue;
      if (filter.maxPrice !== undefined && product.price > filter.maxPrice)
        continue;

      products.push(product);
    }

    products.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());

    const start = filter.offset ?? 0;
    const end = filter.limit !== undefined ? start + filter.limit : undefined;
    return products.slice(start, end);
  }
}

class RedisCategoryRepository implements CategoryRepository {
  constructor(
    private readonly client: Redis,
    private readonly prefix: string,
  ) {}

  private key(id: string) {
    return `${this.prefix}:category:${id}`;
  }

  async create(input: CreateCategoryInput): Promise<Category> {
    const id = randomUUID();
    const now = new Date().toISOString();
    const category: Category = {
      id,
      name: input.name,
      slug: input.slug ?? generateSlug(input.name),
      parentId: input.parentId ?? null,
      metadata: input.metadata ?? {},
      createdAt: new Date(now),
      updatedAt: new Date(now),
    };

    await this.client.set(this.key(id), JSON.stringify(category));
    await this.client.sadd(`${this.prefix}:categories:all`, id);
    return category;
  }

  async get(id: string): Promise<Category | null> {
    const raw = await this.client.get(this.key(id));
    if (!raw) return null;
    const category = JSON.parse(raw) as Category;
    category.createdAt = new Date(category.createdAt);
    category.updatedAt = new Date(category.updatedAt);
    return category;
  }

  async update(id: string, input: UpdateCategoryInput): Promise<Category> {
    const existing = await this.get(id);
    if (!existing) throw new Error(`Category not found: ${id}`);

    const now = new Date().toISOString();
    const updated: Category = {
      ...existing,
      name: input.name ?? existing.name,
      slug: input.slug ?? existing.slug,
      parentId:
        input.parentId !== undefined ? input.parentId : existing.parentId,
      metadata: input.metadata ?? existing.metadata,
      updatedAt: new Date(now),
    };

    await this.client.set(this.key(id), JSON.stringify(updated));
    return updated;
  }

  async delete(id: string): Promise<void> {
    await this.client.del(this.key(id));
    await this.client.srem(`${this.prefix}:categories:all`, id);
  }

  async list(filter: CategoryFilter = {}): Promise<Category[]> {
    const ids = await this.client.smembers(`${this.prefix}:categories:all`);
    const categories: Category[] = [];

    for (const id of ids) {
      const category = await this.get(id);
      if (!category) continue;

      if (filter.parentId !== undefined) {
        if (category.parentId !== filter.parentId) continue;
      }
      if (
        filter.search &&
        !category.name.toLowerCase().includes(filter.search.toLowerCase())
      )
        continue;

      categories.push(category);
    }

    categories.sort((a, b) => a.name.localeCompare(b.name));

    const start = filter.offset ?? 0;
    const end = filter.limit !== undefined ? start + filter.limit : undefined;
    return categories.slice(start, end);
  }
}

class RedisImageRepository implements ImageRepository {
  constructor(
    private readonly client: Redis,
    private readonly prefix: string,
  ) {}

  private key(id: string) {
    return `${this.prefix}:image:${id}`;
  }

  async create(input: CreateImageInput): Promise<Image> {
    const id = randomUUID();
    const now = new Date().toISOString();
    const image: Image = {
      id,
      productId: input.productId,
      url: input.url,
      altText: input.altText,
      sortOrder: input.sortOrder ?? 0,
      createdAt: new Date(now),
    };

    await this.client.set(this.key(id), JSON.stringify(image));
    await this.client.zadd(
      `${this.prefix}:images:product:${input.productId}`,
      image.sortOrder,
      id,
    );
    return image;
  }

  async get(id: string): Promise<Image | null> {
    const raw = await this.client.get(this.key(id));
    if (!raw) return null;
    const image = JSON.parse(raw) as Image;
    image.createdAt = new Date(image.createdAt);
    return image;
  }

  async delete(id: string): Promise<void> {
    const image = await this.get(id);
    await this.client.del(this.key(id));
    if (image) {
      await this.client.zrem(
        `${this.prefix}:images:product:${image.productId}`,
        id,
      );
    }
  }

  async listByProduct(productId: string): Promise<Image[]> {
    const ids = await this.client.zrange(
      `${this.prefix}:images:product:${productId}`,
      0,
      -1,
    );
    const images: Image[] = [];
    for (const id of ids) {
      const image = await this.get(id);
      if (image) images.push(image);
    }
    return images;
  }
}
