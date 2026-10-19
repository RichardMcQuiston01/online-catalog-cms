import { describe, expect, it } from 'bun:test';
import { Readable } from 'node:stream';
import { ValidationError } from '../errors.js';
import type { ImageRepository, StorageAdapter } from '../interfaces/index.js';
import { ImageService } from './ImageService.js';

function createStorage(): StorageAdapter & { deleted: string[] } {
  const deleted: string[] = [];
  return {
    deleted,
    upload: async () => 'https://cdn.example.com/photo.jpg',
    delete: async (url) => {
      deleted.push(url);
    },
    getPublicUrl: (key) => key,
  };
}

const jpegBytes = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0, 0x10, 0x4a, 0x46]);
const pngBytes = Buffer.from([
  0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0,
]);

/** Records what the service hands to the storage adapter. */
function createRecordingStorage(): StorageAdapter & {
  uploads: { filename: string; contentType?: string; size: number }[];
} {
  const uploads: { filename: string; contentType?: string; size: number }[] =
    [];
  return {
    uploads,
    upload: async (file, filename, options) => {
      uploads.push({
        filename,
        contentType: options?.contentType,
        size: Buffer.isBuffer(file) ? file.length : -1,
      });
      return `https://cdn.example.com/${filename}`;
    },
    delete: async () => {},
    getPublicUrl: (key) => key,
  };
}

const recordingRepo: ImageRepository = {
  create: async (input) => ({
    id: 'i',
    productId: input.productId,
    url: input.url,
    altText: input.altText,
    sortOrder: input.sortOrder ?? 0,
    createdAt: new Date(),
  }),
  get: async () => null,
  delete: async () => {},
  listByProduct: async () => [],
};

const failingRepo: ImageRepository = {
  create: async () => {
    throw new Error('database unavailable');
  },
  get: async () => null,
  delete: async () => {},
  listByProduct: async () => [],
};

describe('ImageService.upload', () => {
  it('requires a storage adapter', async () => {
    const service = new ImageService(failingRepo);
    await expect(
      service.upload({
        productId: 'p',
        file: jpegBytes,
        filename: 'a.jpg',
        altText: '',
      }),
    ).rejects.toThrow('storage adapter must be configured');
  });

  it('removes the uploaded file when saving the record fails', async () => {
    const storage = createStorage();
    const service = new ImageService(failingRepo, storage);

    await expect(
      service.upload({
        productId: 'p',
        file: jpegBytes,
        filename: 'a.jpg',
        altText: '',
      }),
    ).rejects.toThrow('database unavailable');

    expect(storage.deleted).toEqual(['https://cdn.example.com/photo.jpg']);
  });
});

describe('ImageService.upload validation', () => {
  const upload = (
    service: ImageService,
    file: Buffer | Readable,
    filename = 'photo.jpg',
    contentType?: string,
  ) =>
    service.upload({
      productId: 'p',
      file,
      filename,
      altText: 'alt',
      contentType,
    });

  it('rejects content that is not an image, whatever its name says', async () => {
    const storage = createRecordingStorage();
    const service = new ImageService(recordingRepo, storage);

    await expect(
      upload(service, Buffer.from('<script>alert(1)</script>'), 'photo.jpg'),
    ).rejects.toBeInstanceOf(ValidationError);
    expect(storage.uploads).toHaveLength(0);
  });

  it('rejects SVG and HTML even when declared as images', async () => {
    const service = new ImageService(recordingRepo, createRecordingStorage());
    const svg = Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"></svg>');

    await expect(
      upload(service, svg, 'logo.svg', 'image/svg+xml'),
    ).rejects.toBeInstanceOf(ValidationError);
    await expect(
      upload(service, Buffer.from('<html></html>'), 'a.png', 'image/png'),
    ).rejects.toBeInstanceOf(ValidationError);
  });

  it('stores the detected type and extension, ignoring the declared ones', async () => {
    const storage = createRecordingStorage();
    const service = new ImageService(recordingRepo, storage);

    await upload(service, pngBytes, 'payload.html', 'text/html');

    expect(storage.uploads).toEqual([
      { filename: 'payload.png', contentType: 'image/png', size: 12 },
    ]);
  });

  it('rejects an oversized buffer before storing anything', async () => {
    const storage = createRecordingStorage();
    const service = new ImageService(recordingRepo, storage, {
      maxUploadBytes: 4,
    });

    await expect(upload(service, jpegBytes)).rejects.toThrow(
      'larger than the 4 byte limit',
    );
    expect(storage.uploads).toHaveLength(0);
  });

  it('stops reading an oversized stream', async () => {
    const storage = createRecordingStorage();
    const service = new ImageService(recordingRepo, storage, {
      maxUploadBytes: 100,
    });
    let chunksRead = 0;
    async function* endless(): AsyncGenerator<Buffer> {
      yield jpegBytes;
      while (true) {
        chunksRead += 1;
        yield Buffer.alloc(64);
      }
    }

    await expect(upload(service, Readable.from(endless()))).rejects.toThrow(
      'byte limit',
    );
    expect(chunksRead).toBeLessThan(5);
    expect(storage.uploads).toHaveLength(0);
  });

  it('accepts a stream of a valid image', async () => {
    const storage = createRecordingStorage();
    const service = new ImageService(recordingRepo, storage);

    await upload(service, Readable.from([jpegBytes.subarray(0, 4), jpegBytes]));

    expect(storage.uploads[0]?.contentType).toBe('image/jpeg');
  });
});
