import type { ProductRepository, StorageAdapter } from '../interfaces/index.js';
import type {
  CreateProductInput,
  Product,
  ProductFilter,
  UpdateProductInput,
} from '../types/index.js';

/** High-level product operations. Wraps the DB repository with slug generation. */
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

    // Delete associated images from storage if available
    if (this.storage) {
      for (const image of product.images) {
        await this.storage.delete(image.url).catch(() => {});
      }
    }

    await this.repo.delete(id);
  }

  async list(filter?: ProductFilter): Promise<Product[]> {
    return this.repo.list(filter);
  }
}
