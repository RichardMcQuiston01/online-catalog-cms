import { createWriteStream, mkdirSync } from 'node:fs';
import { rm, writeFile } from 'node:fs/promises';
import { resolve, sep } from 'node:path';
import type { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import type {
  StorageAdapter,
  UploadOptions,
} from '../../../interfaces/StorageAdapter.js';
import { generateStorageKey, keyFromUrl } from '../storageKeys.js';

export interface LocalStorageConfig {
  /** Directory where uploaded files are stored; created if missing. */
  uploadDir: string;
  /**
   * Base URL prefix for returned file URLs, e.g. 'http://localhost:3000/uploads'.
   * Defaults to '/uploads' (a relative path).
   */
  baseUrl?: string;
}

/** Storage adapter that writes files to the local filesystem. */
export class LocalStorageAdapter implements StorageAdapter {
  private readonly uploadDir: string;
  private readonly baseUrl: string;

  constructor(config: LocalStorageConfig) {
    this.uploadDir = resolve(config.uploadDir);
    this.baseUrl = config.baseUrl ?? '/uploads';
    mkdirSync(this.uploadDir, { recursive: true });
  }

  async upload(
    file: Buffer | Readable,
    filename: string,
    _options?: UploadOptions,
  ): Promise<string> {
    const key = generateStorageKey(filename);
    const filePath = resolve(this.uploadDir, key);

    if (Buffer.isBuffer(file)) {
      await writeFile(filePath, file);
    } else {
      await pipeline(file, createWriteStream(filePath));
    }

    return this.getPublicUrl(key);
  }

  async delete(url: string): Promise<void> {
    const key = keyFromUrl(url, this.baseUrl);
    if (!key) return;

    // URLs come from the database; never delete outside the upload directory.
    const filePath = resolve(this.uploadDir, key);
    if (!filePath.startsWith(this.uploadDir + sep)) return;

    await rm(filePath, { force: true });
  }

  getPublicUrl(key: string): string {
    return `${this.baseUrl}/${key}`;
  }
}
