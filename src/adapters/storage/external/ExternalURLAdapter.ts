import type { Readable } from 'node:stream';
import type {
  StorageAdapter,
  UploadOptions,
} from '../../../interfaces/StorageAdapter.js';

/**
 * Storage adapter for externally-hosted images.
 * `upload` is not supported — pass URLs directly in `CreateImageInput.url`
 * and this adapter stores them as-is.
 */
export class ExternalURLAdapter implements StorageAdapter {
  async upload(
    _file: Buffer | Readable,
    _filename: string,
    _options?: UploadOptions,
  ): Promise<string> {
    throw new Error(
      'ExternalURLAdapter does not support uploads. ' +
        'Pass the image URL directly in CreateImageInput.url.',
    );
  }

  async delete(_url: string): Promise<void> {
    // External URLs cannot be deleted via this adapter.
  }

  getPublicUrl(key: string): string {
    return key;
  }
}
