import type { Readable } from 'node:stream';

/** Options passed to a storage adapter's upload method. */
export interface UploadOptions {
  /** MIME type of the file, e.g. "image/jpeg". */
  contentType?: string;
  /** Whether the file should be publicly readable. Defaults to true. */
  public?: boolean;
}

/**
 * Contract that every storage adapter must implement.
 * Consumers pass an instance to `OnlineCatalog` for image/file handling.
 */
export interface StorageAdapter {
  /**
   * Upload a file and return its public URL.
   * @param file - File content as a Buffer or Readable stream.
   * @param filename - Desired filename (may be modified by the adapter).
   * @param options - Optional upload metadata.
   * @returns The public URL at which the file can be accessed.
   */
  upload(
    file: Buffer | Readable,
    filename: string,
    options?: UploadOptions,
  ): Promise<string>;

  /**
   * Delete a file by its URL.
   * No-ops silently if the file does not exist.
   */
  delete(url: string): Promise<void>;

  /**
   * Derive the public URL for a storage key without making a network call.
   * Useful for building URLs after listing keys from the storage backend.
   */
  getPublicUrl(key: string): string;
}
