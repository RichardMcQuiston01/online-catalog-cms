import type {
  Category,
  CategoryFilter,
  CreateCategoryInput,
  UpdateCategoryInput,
} from '../types/category.js';
import type { CreateImageInput, Image } from '../types/image.js';
import type {
  CreateProductInput,
  Product,
  ProductFilter,
  UpdateProductInput,
} from '../types/product.js';

/** Result returned by adapter.verify(). */
export interface VerificationResult {
  ok: boolean;
  issues: string[];
}

/** CRUD operations for products. */
export interface ProductRepository {
  create(input: CreateProductInput): Promise<Product>;
  get(id: string): Promise<Product | null>;
  update(id: string, input: UpdateProductInput): Promise<Product>;
  delete(id: string): Promise<void>;
  list(filter?: ProductFilter): Promise<Product[]>;
}

/** CRUD operations for categories. */
export interface CategoryRepository {
  create(input: CreateCategoryInput): Promise<Category>;
  get(id: string): Promise<Category | null>;
  update(id: string, input: UpdateCategoryInput): Promise<Category>;
  delete(id: string): Promise<void>;
  list(filter?: CategoryFilter): Promise<Category[]>;
}

/** CRUD operations for images. */
export interface ImageRepository {
  create(input: CreateImageInput): Promise<Image>;
  get(id: string): Promise<Image | null>;
  delete(id: string): Promise<void>;
  listByProduct(productId: string): Promise<Image[]>;
}

/**
 * Contract that every database adapter must implement.
 * Consumers pass an instance of a concrete adapter to `OnlineCatalog`.
 */
export interface DatabaseAdapter {
  /** Runs any pending migrations, creating schema on first run. */
  initialize(): Promise<void>;
  /** Checks that the schema matches what the library expects. */
  verify(): Promise<VerificationResult>;
  /** Releases all connections and cleans up resources. */
  close(): Promise<void>;

  readonly products: ProductRepository;
  readonly categories: CategoryRepository;
  readonly images: ImageRepository;
}
