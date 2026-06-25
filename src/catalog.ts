import { Installer } from './installer/Installer.js';
import type { DatabaseAdapter } from './interfaces/DatabaseAdapter.js';
import type { StorageAdapter } from './interfaces/StorageAdapter.js';
import { CategoryService } from './services/CategoryService.js';
import { ImageService } from './services/ImageService.js';
import { ProductService } from './services/ProductService.js';

export interface OnlineCatalogConfig {
  /** Database adapter for persisting catalog data. */
  db: DatabaseAdapter;
  /** Storage adapter for image/file uploads. Optional. */
  storage?: StorageAdapter;
}

/**
 * Main entry point for online-catalog-cms.
 *
 * @example
 * ```ts
 * const catalog = new OnlineCatalog({ db: new SQLiteAdapter({ filename: './catalog.db' }) });
 * await catalog.initialize();
 * const product = await catalog.products.create({ name: 'Widget', price: 999, description: ... });
 * ```
 */
export class OnlineCatalog {
  readonly products: ProductService;
  readonly categories: CategoryService;
  readonly images: ImageService;
  readonly installer: Installer;

  private readonly db: DatabaseAdapter;

  constructor(config: OnlineCatalogConfig) {
    this.db = config.db;
    this.products = new ProductService(config.db.products, config.storage);
    this.categories = new CategoryService(config.db.categories);
    this.images = new ImageService(config.db.images, config.storage);
    this.installer = new Installer(config.db);
  }

  /**
   * Initialize the catalog. Runs database migrations on first use.
   * Must be called before any other method.
   */
  async initialize(): Promise<void> {
    await this.db.initialize();
  }

  /** Release all resources held by the database adapter. */
  async close(): Promise<void> {
    await this.db.close();
  }
}
