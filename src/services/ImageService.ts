import type { Readable } from 'node:stream';
import { ValidationError } from '../errors.js';
import type { ImageRepository, StorageAdapter } from '../interfaces/index.js';
import type { CreateImageInput, Image } from '../types/index.js';
import { sniffImageType } from '../utils/imageType.js';

/** Default cap on a single uploaded image: 10 MiB. */
export const DEFAULT_MAX_UPLOAD_BYTES = 10 * 1024 * 1024;

export interface UploadImageInput {
  productId: string;
  file: Buffer | Readable;
  filename: string;
  altText: string;
  /** Ignored: the type is detected from the file's content. */
  contentType?: string;
  sortOrder?: number;
}

export interface ImageServiceOptions {
  /** Largest accepted upload in bytes. Defaults to 10 MiB. */
  maxUploadBytes?: number;
}

/** Handles image uploads and associates them with products. */
export class ImageService {
  private readonly maxUploadBytes: number;

  constructor(
    private readonly repo: ImageRepository,
    private readonly storage?: StorageAdapter,
    options: ImageServiceOptions = {},
  ) {
    this.maxUploadBytes = options.maxUploadBytes ?? DEFAULT_MAX_UPLOAD_BYTES;
  }

  /**
   * Upload a file via the storage adapter and create an image record.
   * Requires a storage adapter to be configured.
   *
   * Only JPEG, PNG, GIF, WebP and AVIF are accepted, judged by the file's
   * content rather than its name or declared type, and the stored name and
   * content type follow the detected format. Files over `maxUploadBytes` are
   * rejected before anything is written.
   */
  async upload(input: UploadImageInput): Promise<Image> {
    if (!this.storage) {
      throw new Error(
        'A storage adapter must be configured on OnlineCatalog to upload images.',
      );
    }

    const bytes = await readWithinLimit(input.file, this.maxUploadBytes);
    const imageType = sniffImageType(bytes);
    if (!imageType) {
      throw new ValidationError(
        `Unsupported image file "${input.filename}": expected JPEG, PNG, GIF, WebP or AVIF content.`,
        'file',
      );
    }

    const url = await this.storage.upload(
      Buffer.from(bytes.buffer, bytes.byteOffset, bytes.byteLength),
      withExtension(input.filename, imageType.extension),
      { contentType: imageType.mimeType },
    );

    try {
      return await this.repo.create({
        productId: input.productId,
        url,
        altText: input.altText,
        sortOrder: input.sortOrder,
      });
    } catch (error) {
      // Don't leave an orphaned file behind when the record can't be saved.
      await this.storage.delete(url).catch(() => {});
      throw error;
    }
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

    // Best effort: a stale file must not block removing the database record.
    await this.storage?.delete(image.url).catch(() => {});

    await this.repo.delete(id);
  }

  async listByProduct(productId: string): Promise<Image[]> {
    return this.repo.listByProduct(productId);
  }
}

/** Replaces the filename's extension so it always matches the real format. */
function withExtension(filename: string, extension: string): string {
  const baseName = filename.replace(/\.[^./\\]*$/, '');
  return `${baseName || 'image'}${extension}`;
}

/**
 * Collects an upload into memory, stopping as soon as it exceeds `maxBytes`.
 * Reading a stream by async iteration keeps this free of Node built-ins.
 */
async function readWithinLimit(
  file: Buffer | Readable,
  maxBytes: number,
): Promise<Uint8Array> {
  const tooLarge = (): ValidationError =>
    new ValidationError(
      `Upload is larger than the ${maxBytes} byte limit. Resize the image or raise maxUploadBytes.`,
      'file',
    );

  if (file instanceof Uint8Array) {
    if (file.byteLength > maxBytes) throw tooLarge();
    return file;
  }

  const chunks: Uint8Array[] = [];
  let total = 0;
  for await (const chunk of file as AsyncIterable<Uint8Array | string>) {
    const bytes =
      typeof chunk === 'string' ? new TextEncoder().encode(chunk) : chunk;
    total += bytes.byteLength;
    if (total > maxBytes) {
      file.destroy();
      throw tooLarge();
    }
    chunks.push(bytes);
  }

  const joined = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    joined.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return joined;
}
