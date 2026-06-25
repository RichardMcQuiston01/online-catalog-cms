import type { Readable } from 'node:stream';
import type { ImageRepository, StorageAdapter } from '../interfaces/index.js';
import type { CreateImageInput, Image } from '../types/index.js';

export interface UploadImageInput {
  productId: string;
  file: Buffer | Readable;
  filename: string;
  altText: string;
  contentType?: string;
  sortOrder?: number;
}

/** Handles image uploads and associates them with products. */
export class ImageService {
  constructor(
    private readonly repo: ImageRepository,
    private readonly storage?: StorageAdapter,
  ) {}

  /**
   * Upload a file via the storage adapter and create an image record.
   * Requires a storage adapter to be configured.
   */
  async upload(input: UploadImageInput): Promise<Image> {
    if (!this.storage) {
      throw new Error(
        'A storage adapter must be configured on OnlineCatalog to upload images.',
      );
    }

    const url = await this.storage.upload(input.file, input.filename, {
      contentType: input.contentType,
    });

    return this.repo.create({
      productId: input.productId,
      url,
      altText: input.altText,
      sortOrder: input.sortOrder,
    });
  }

  /** Associate an already-hosted image URL with a product. */
  async addUrl(input: CreateImageInput): Promise<Image> {
    return this.repo.create(input);
  }

  async get(id: string): Promise<Image | null> {
    return this.repo.get(id);
  }

  async delete(id: string): Promise<void> {
    const image = await this.repo.get(id);
    if (!image) return;

    if (this.storage) {
      await this.storage.delete(image.url).catch(() => {});
    }

    await this.repo.delete(id);
  }

  async listByProduct(productId: string): Promise<Image[]> {
    return this.repo.listByProduct(productId);
  }
}
