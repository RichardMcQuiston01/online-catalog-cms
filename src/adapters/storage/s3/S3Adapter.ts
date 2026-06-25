import { createRequire } from 'node:module';
import { extname } from 'node:path';
import type { Readable } from 'node:stream';
import type {
  StorageAdapter,
  UploadOptions,
} from '../../../interfaces/StorageAdapter.js';

export interface S3Config {
  bucket: string;
  region: string;
  /** Custom endpoint for S3-compatible services (MinIO, Cloudflare R2, etc.). */
  endpoint?: string;
  accessKeyId: string;
  secretAccessKey: string;
  /** Whether objects should default to public-read ACL. Defaults to true. */
  publicRead?: boolean;
}

type S3Client = import('@aws-sdk/client-s3').S3Client;
type PutObjectCommand = import('@aws-sdk/client-s3').PutObjectCommand;
type DeleteObjectCommand = import('@aws-sdk/client-s3').DeleteObjectCommand;

interface AWSS3Module {
  S3Client: new (config: object) => S3Client;
  PutObjectCommand: new (input: object) => PutObjectCommand;
  DeleteObjectCommand: new (input: object) => DeleteObjectCommand;
}

function loadDriver(): AWSS3Module {
  try {
    const require = createRequire(import.meta.url);
    return require('@aws-sdk/client-s3') as AWSS3Module;
  } catch {
    throw new Error(
      '@aws-sdk/client-s3 is not installed. Run: bun add @aws-sdk/client-s3',
    );
  }
}

/** S3-compatible storage adapter using @aws-sdk/client-s3. */
export class S3Adapter implements StorageAdapter {
  private readonly client: S3Client;
  private readonly bucket: string;
  private readonly publicRead: boolean;
  private readonly baseUrl: string;
  private readonly aws: AWSS3Module;

  constructor(config: S3Config) {
    this.aws = loadDriver();
    this.bucket = config.bucket;
    this.publicRead = config.publicRead ?? true;

    this.client = new this.aws.S3Client({
      region: config.region,
      endpoint: config.endpoint,
      credentials: {
        accessKeyId: config.accessKeyId,
        secretAccessKey: config.secretAccessKey,
      },
      forcePathStyle: !!config.endpoint,
    });

    if (config.endpoint) {
      this.baseUrl = `${config.endpoint.replace(/\/$/, '')}/${config.bucket}`;
    } else {
      this.baseUrl = `https://${config.bucket}.s3.${config.region}.amazonaws.com`;
    }
  }

  async upload(
    file: Buffer | Readable,
    filename: string,
    options?: UploadOptions,
  ): Promise<string> {
    const safeName = filename.replace(/[^a-zA-Z0-9._/-]/g, '_');
    const key = `${Date.now()}-${safeName}`;
    const contentType = options?.contentType ?? guessContentType(filename);

    const command = new this.aws.PutObjectCommand({
      Bucket: this.bucket,
      Key: key,
      Body: file,
      ContentType: contentType,
      ACL: this.publicRead ? 'public-read' : 'private',
    });

    await (
      this.client as unknown as { send: (cmd: object) => Promise<void> }
    ).send(command);
    return this.getPublicUrl(key);
  }

  async delete(url: string): Promise<void> {
    const key = this.urlToKey(url);
    if (!key) return;

    const command = new this.aws.DeleteObjectCommand({
      Bucket: this.bucket,
      Key: key,
    });

    await (
      this.client as unknown as { send: (cmd: object) => Promise<void> }
    ).send(command);
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

function guessContentType(filename: string): string {
  const ext = extname(filename).toLowerCase();
  const map: Record<string, string> = {
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.png': 'image/png',
    '.gif': 'image/gif',
    '.webp': 'image/webp',
    '.svg': 'image/svg+xml',
    '.avif': 'image/avif',
  };
  return map[ext] ?? 'application/octet-stream';
}
