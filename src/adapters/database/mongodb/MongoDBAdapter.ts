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

export interface MongoDBConfig {
  /** MongoDB connection string, e.g. 'mongodb://localhost:27017'. */
  url: string;
  /** Database name. Defaults to 'online_catalog'. */
  database?: string;
}

type MongoClient = import('mongodb').MongoClient;
type Db = import('mongodb').Db;
type Collection<T extends object> = import('mongodb').Collection<T>;
type MongoClientConstructor = new (url: string) => MongoClient;

function loadDriver(): MongoClientConstructor {
  try {
    const require = createRequire(import.meta.url);
    const { MongoClient } = require('mongodb') as {
      MongoClient: MongoClientConstructor;
    };
    return MongoClient;
  } catch {
    throw new Error('mongodb is not installed. Run: bun add mongodb');
  }
}

interface ProductDoc {
  _id: string;
  name: string;
  slug: string;
  description: unknown;
  price: number;
  sku: string | null;
  categoryId: string | null;
  metadata: Record<string, unknown>;
  createdAt: Date;
  updatedAt: Date;
}

interface CategoryDoc {
  _id: string;
  name: string;
  slug: string;
  parentId: string | null;
  metadata: Record<string, unknown>;
  createdAt: Date;
  updatedAt: Date;
}

interface ImageDoc {
  _id: string;
  productId: string;
  url: string;
  altText: string;
  sortOrder: number;
  createdAt: Date;
}

/** MongoDB adapter. Each entity type maps to its own collection. */
export class MongoDBAdapter implements DatabaseAdapter {
  private readonly client: MongoClient;
  private readonly dbName: string;

  readonly products: ProductRepository;
  readonly categories: CategoryRepository;
  readonly images: ImageRepository;

  constructor(config: MongoDBConfig) {
    const MongoClient = loadDriver();
    this.client = new MongoClient(config.url);
    this.dbName = config.database ?? 'online_catalog';

    const db = () => this.client.db(this.dbName);
    this.products = new MongoProductRepository(db);
    this.categories = new MongoCategoryRepository(db);
    this.images = new MongoImageRepository(db);
  }

  async initialize(): Promise<void> {
    await this.client.connect();
    const db = this.client.db(this.dbName);
    await db
      .collection('occ_product')
      .createIndex({ slug: 1 }, { unique: true });
    await db.collection('occ_product').createIndex({ categoryId: 1 });
    await db
      .collection('occ_category')
      .createIndex({ slug: 1 }, { unique: true });
    await db
      .collection('occ_image')
      .createIndex({ productId: 1, sortOrder: 1 });
  }

  async verify(): Promise<VerificationResult> {
    try {
      await this.client.db(this.dbName).command({ ping: 1 });
      return { ok: true, issues: [] };
    } catch (err) {
      return {
        ok: false,
        issues: [`MongoDB connection failed: ${String(err)}`],
      };
    }
  }

  async close(): Promise<void> {
    await this.client.close();
  }
}

class MongoProductRepository implements ProductRepository {
  constructor(private readonly db: () => Db) {}

  private col(): Collection<ProductDoc> {
    return this.db().collection<ProductDoc>('occ_product');
  }

  private imgCol(): Collection<ImageDoc> {
    return this.db().collection<ImageDoc>('occ_image');
  }

  private async toProduct(doc: ProductDoc): Promise<Product> {
    const images = await this.imgCol()
      .find({ productId: doc._id })
      .sort({ sortOrder: 1 })
      .toArray();

    return {
      id: doc._id,
      name: doc.name,
      slug: doc.slug,
      description: doc.description as Product['description'],
      price: doc.price,
      sku: doc.sku,
      categoryId: doc.categoryId,
      images: images.map((img) => ({
        id: img._id,
        productId: img.productId,
        url: img.url,
        altText: img.altText,
        sortOrder: img.sortOrder,
        createdAt: img.createdAt,
      })),
      metadata: doc.metadata,
      createdAt: doc.createdAt,
      updatedAt: doc.updatedAt,
    };
  }

  async create(input: CreateProductInput): Promise<Product> {
    const id = randomUUID();
    const now = new Date();
    const doc: ProductDoc = {
      _id: id,
      name: input.name,
      slug: input.slug ?? generateSlug(input.name),
      description: input.description,
      price: input.price,
      sku: input.sku ?? null,
      categoryId: input.categoryId ?? null,
      metadata: input.metadata ?? {},
      createdAt: now,
      updatedAt: now,
    };
    await this.col().insertOne(doc);
    return this.toProduct(doc);
  }

  async get(id: string): Promise<Product | null> {
    const doc = await this.col().findOne({ _id: id });
    if (!doc) return null;
    return this.toProduct(doc);
  }

  async update(id: string, input: UpdateProductInput): Promise<Product> {
    const existing = await this.get(id);
    if (!existing) throw new Error(`Product not found: ${id}`);

    const now = new Date();
    await this.col().updateOne(
      { _id: id },
      {
        $set: {
          name: input.name ?? existing.name,
          slug: input.slug ?? existing.slug,
          description: input.description ?? existing.description,
          price: input.price ?? existing.price,
          sku: input.sku !== undefined ? input.sku : existing.sku,
          categoryId:
            input.categoryId !== undefined
              ? input.categoryId
              : existing.categoryId,
          metadata: input.metadata ?? existing.metadata,
          updatedAt: now,
        },
      },
    );

    const updated = await this.get(id);
    if (!updated)
      throw new Error(`Failed to fetch product after update: ${id}`);
    return updated;
  }

  async delete(id: string): Promise<void> {
    await this.col().deleteOne({ _id: id });
  }

  async list(filter: ProductFilter = {}): Promise<Product[]> {
    // biome-ignore lint/suspicious/noExplicitAny: mongo filter type
    const query: any = {};
    if (filter.categoryId !== undefined) query.categoryId = filter.categoryId;
    if (filter.minPrice !== undefined || filter.maxPrice !== undefined) {
      query.price = {};
      if (filter.minPrice !== undefined) query.price.$gte = filter.minPrice;
      if (filter.maxPrice !== undefined) query.price.$lte = filter.maxPrice;
    }
    if (filter.search) {
      query.$or = [
        { name: { $regex: filter.search, $options: 'i' } },
        { sku: { $regex: filter.search, $options: 'i' } },
      ];
    }

    let cursor = this.col().find(query).sort({ createdAt: -1 });
    if (filter.offset) cursor = cursor.skip(filter.offset);
    if (filter.limit) cursor = cursor.limit(filter.limit);

    const docs = await cursor.toArray();
    return Promise.all(docs.map((doc) => this.toProduct(doc)));
  }
}

class MongoCategoryRepository implements CategoryRepository {
  constructor(private readonly db: () => Db) {}

  private col(): Collection<CategoryDoc> {
    return this.db().collection<CategoryDoc>('occ_category');
  }

  private toCategory(doc: CategoryDoc): Category {
    return {
      id: doc._id,
      name: doc.name,
      slug: doc.slug,
      parentId: doc.parentId,
      metadata: doc.metadata,
      createdAt: doc.createdAt,
      updatedAt: doc.updatedAt,
    };
  }

  async create(input: CreateCategoryInput): Promise<Category> {
    const id = randomUUID();
    const now = new Date();
    const doc: CategoryDoc = {
      _id: id,
      name: input.name,
      slug: input.slug ?? generateSlug(input.name),
      parentId: input.parentId ?? null,
      metadata: input.metadata ?? {},
      createdAt: now,
      updatedAt: now,
    };
    await this.col().insertOne(doc);
    return this.toCategory(doc);
  }

  async get(id: string): Promise<Category | null> {
    const doc = await this.col().findOne({ _id: id });
    return doc ? this.toCategory(doc) : null;
  }

  async update(id: string, input: UpdateCategoryInput): Promise<Category> {
    const existing = await this.get(id);
    if (!existing) throw new Error(`Category not found: ${id}`);

    const now = new Date();
    await this.col().updateOne(
      { _id: id },
      {
        $set: {
          name: input.name ?? existing.name,
          slug: input.slug ?? existing.slug,
          parentId:
            input.parentId !== undefined ? input.parentId : existing.parentId,
          metadata: input.metadata ?? existing.metadata,
          updatedAt: now,
        },
      },
    );

    const updated = await this.get(id);
    if (!updated)
      throw new Error(`Failed to fetch category after update: ${id}`);
    return updated;
  }

  async delete(id: string): Promise<void> {
    await this.col().deleteOne({ _id: id });
  }

  async list(filter: CategoryFilter = {}): Promise<Category[]> {
    // biome-ignore lint/suspicious/noExplicitAny: mongo filter type
    const query: any = {};
    if (filter.parentId !== undefined) query.parentId = filter.parentId;
    if (filter.search) {
      query.name = { $regex: filter.search, $options: 'i' };
    }

    let cursor = this.col().find(query).sort({ name: 1 });
    if (filter.offset) cursor = cursor.skip(filter.offset);
    if (filter.limit) cursor = cursor.limit(filter.limit);

    const docs = await cursor.toArray();
    return docs.map((doc) => this.toCategory(doc));
  }
}

class MongoImageRepository implements ImageRepository {
  constructor(private readonly db: () => Db) {}

  private col(): Collection<ImageDoc> {
    return this.db().collection<ImageDoc>('occ_image');
  }

  async create(input: CreateImageInput): Promise<Image> {
    const id = randomUUID();
    const now = new Date();
    const doc: ImageDoc = {
      _id: id,
      productId: input.productId,
      url: input.url,
      altText: input.altText,
      sortOrder: input.sortOrder ?? 0,
      createdAt: now,
    };
    await this.col().insertOne(doc);
    return {
      id: doc._id,
      productId: doc.productId,
      url: doc.url,
      altText: doc.altText,
      sortOrder: doc.sortOrder,
      createdAt: doc.createdAt,
    };
  }

  async get(id: string): Promise<Image | null> {
    const doc = await this.col().findOne({ _id: id });
    if (!doc) return null;
    return {
      id: doc._id,
      productId: doc.productId,
      url: doc.url,
      altText: doc.altText,
      sortOrder: doc.sortOrder,
      createdAt: doc.createdAt,
    };
  }

  async delete(id: string): Promise<void> {
    await this.col().deleteOne({ _id: id });
  }

  async listByProduct(productId: string): Promise<Image[]> {
    const docs = await this.col()
      .find({ productId })
      .sort({ sortOrder: 1 })
      .toArray();
    return docs.map((doc) => ({
      id: doc._id,
      productId: doc.productId,
      url: doc.url,
      altText: doc.altText,
      sortOrder: doc.sortOrder,
      createdAt: doc.createdAt,
    }));
  }
}
