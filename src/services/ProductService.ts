import type { ProductRepository, StorageAdapter } from '../interfaces/index.js';
import type {
  CreateProductInput,
  Product,
  ProductFilter,
  UpdateProductInput,
} from '../types/index.js';

/** High-level product operations; cleans up stored images on delete. */
export class ProductService {
  constructor(
    private readonly repo: ProductRepository,
    private readonly storage?: StorageAdapter,
  ) {}

  async create(input: CreateProductInput): Promise<Product> {
    return this.repo.create(input);
  }

  async get(id: string): Promise<Product | null> {
    return this.repo.get(id);
  }

  async update(id: string, input: UpdateProductInput): Promise<Product> {
    return this.repo.update(id, input);
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
}
