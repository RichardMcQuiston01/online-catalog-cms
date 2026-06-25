import { createWriteStream, existsSync, mkdirSync, unlinkSync } from 'node:fs';
import { join, resolve } from 'node:path';
import type { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import type {
  StorageAdapter,
  UploadOptions,
} from '../../../interfaces/StorageAdapter.js';

export interface LocalStorageConfig {
  /** Absolute path to the directory where uploaded files will be stored. */
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

    if (!existsSync(this.uploadDir)) {
      mkdirSync(this.uploadDir, { recursive: true });
    }
  }

  async upload(
    file: Buffer | Readable,
    filename: string,
    _options?: UploadOptions,
  ): Promise<string> {
    const safeName = filename.replace(/[^a-zA-Z0-9._-]/g, '_');
    const uniqueName = `${Date.now()}-${safeName}`;
    const filePath = join(this.uploadDir, uniqueName);

    if (Buffer.isBuffer(file)) {
      await Bun.write(filePath, file);
    } else {
      const writeStream = createWriteStream(filePath);
      await pipeline(file, writeStream);
    }

    return this.getPublicUrl(uniqueName);
  }

  async delete(url: string): Promise<void> {
    const key = this.urlToKey(url);
    if (!key) return;
    const filePath = join(this.uploadDir, key);
    if (existsSync(filePath)) {
      unlinkSync(filePath);
    }
  }

  getPublicUrl(key: string): string {
    return `${this.baseUrl}/${key}`;
  }

  private urlToKey(url: string): string | null {
    const prefix = `${this.baseUrl}/`;
    if (url.startsWith(prefix)) {
      return url.slice(prefix.length);
    }
    return null;
  }
}
