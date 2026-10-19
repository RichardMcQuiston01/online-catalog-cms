import { ValidationError } from '../errors.js';
import type {
  CategoryRepository,
  ProductRepository,
  StorageAdapter,
} from '../interfaces/index.js';
import { assertRichTextDocument } from '../rich-text/validate.js';
import type {
  CreateProductInput,
  Product,
  ProductFilter,
  UpdateProductInput,
} from '../types/index.js';
import {
  MAX_NAME_LENGTH,
  assertPrice,
  assertSlugAvailable,
  assertText,
  chooseSlug,
  normalizeMetadata,
} from './rules.js';

export interface ProductServiceOptions {
  /** When set, `categoryId` must refer to an existing category. */
  categories?: CategoryRepository;
}

/**
 * High-level product operations. Owns the domain rules (slug policy, price,
 * length and metadata checks, rich-text and category validation) so every
 * database adapter behaves the same, and cleans up stored images on delete.
 * All validation failures are {@link ValidationError}s.
 */
export class ProductService {
  constructor(
    private readonly repo: ProductRepository,
    private readonly storage?: StorageAdapter,
    private readonly options: ProductServiceOptions = {},
  ) {}

  async create(input: CreateProductInput): Promise<Product> {
    const name = assertText('name', input.name, MAX_NAME_LENGTH);
    validateDescription(input.description);
    const price = assertPrice(input.price);
    const sku = this.readSku(input.sku);
    const metadata =
      input.metadata === undefined
        ? undefined
        : normalizeMetadata(input.metadata);
    await this.assertCategoryExists(input.categoryId);
    const slug = await chooseSlug(name, input.slug, (candidate) =>
      this.repo.getBySlug(candidate),
    );

    return this.repo.create({
      ...input,
      name,
      price,
      sku,
      metadata,
      slug,
    });
  }

  async get(id: string): Promise<Product | null> {
    return this.repo.get(id);
  }

  /** Finds a product by its URL slug, or null. */
  async getBySlug(slug: string): Promise<Product | null> {
    return this.repo.getBySlug(slug);
  }

  async update(id: string, input: UpdateProductInput): Promise<Product> {
    const changes: UpdateProductInput = { ...input };
    if (input.name !== undefined) {
      changes.name = assertText('name', input.name, MAX_NAME_LENGTH);
    }
    if (input.description !== undefined) validateDescription(input.description);
    if (input.price !== undefined) changes.price = assertPrice(input.price);
    if (input.sku !== undefined) changes.sku = this.readSku(input.sku);
    if (input.metadata !== undefined) {
      changes.metadata = normalizeMetadata(input.metadata);
    }
    await this.assertCategoryExists(input.categoryId);
    if (input.slug !== undefined) {
      await assertSlugAvailable(
        input.slug,
        (candidate) => this.repo.getBySlug(candidate),
        id,
      );
    }

    return this.repo.update(id, changes);
  }

  async delete(id: string): Promise<void> {
    const product = await this.repo.get(id);
    if (!product) return;

    // Remove the record first. If that throws, every file is still in place
    // and the delete can be retried. The reverse order would leave rows
    // pointing at files that are already gone.
    await this.repo.delete(id);

    // Best effort: a file left behind is only wasted space, and must not
    // make a delete that already succeeded look like it failed.
    const { storage } = this;
    if (storage) {
      await Promise.allSettled(
        product.images.map((image) => storage.delete(image.url)),
      );
    }
  }

  async list(filter?: ProductFilter): Promise<Product[]> {
    return this.repo.list(filter);
  }

  private readSku(sku: unknown): string | null | undefined {
    if (sku === undefined || sku === null) return sku;
    return assertText('sku', sku, MAX_NAME_LENGTH);
  }

  private async assertCategoryExists(
    categoryId: string | null | undefined,
  ): Promise<void> {
    if (categoryId === undefined || categoryId === null) return;
    if (typeof categoryId !== 'string') {
      throw new ValidationError(
        `categoryId must be a string or null, received ${typeof categoryId}.`,
        'categoryId',
      );
    }
    const { categories } = this.options;
    if (categories && !(await categories.get(categoryId))) {
      throw new ValidationError(
        `Category not found: ${categoryId}. Create the category first, or pass categoryId: null.`,
        'categoryId',
      );
    }
  }
}

/** Rejects a description that is not safe to store and later render. */
function validateDescription(description: unknown): void {
  try {
    assertRichTextDocument(description);
  } catch (error) {
    throw new ValidationError(
      error instanceof Error ? error.message : String(error),
      'description',
    );
  }
}
