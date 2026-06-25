# online-catalog-cms

A headless TypeScript CMS library for managing an online product catalog. Ships zero UI — it exposes a typed API you call from any framework or runtime. Plug in a database adapter and optional storage adapter, then manage products, categories, and images through a consistent interface.

## Install

```sh
bun add @richardmcquiston01/online-catalog-cms
# or
npm install @richardmcquiston01/online-catalog-cms
```

Install the driver for your chosen database:

```sh
# SQLite (also works natively in Bun via bun:sqlite — no extra install)
bun add better-sqlite3

# PostgreSQL
bun add postgres

# MySQL / MariaDB
bun add mysql2

# Redis
bun add ioredis

# MongoDB
bun add mongodb
```

For S3-compatible image storage:

```sh
bun add @aws-sdk/client-s3
```

## Quick Start

```ts
import { OnlineCatalog, SQLiteAdapter, document, paragraph, text } from '@richardmcquiston01/online-catalog-cms';

const catalog = new OnlineCatalog({
  db: new SQLiteAdapter({ filename: './catalog.db' }),
});

await catalog.initialize(); // runs migrations automatically

const product = await catalog.products.create({
  name: 'Acme Widget',
  price: 1999, // stored in cents to avoid floating-point issues
  description: document([
    paragraph([text('A great widget.')])
  ]),
});

console.log(product.id, product.slug); // auto-generated UUID and slug
```

## Database Adapters

All adapters implement the same `DatabaseAdapter` interface, so you can swap them without changing any business logic.

### SQLite

```ts
import { SQLiteAdapter } from '@richardmcquiston01/online-catalog-cms';

const db = new SQLiteAdapter({ filename: './catalog.db' });
// filename: ':memory:' for an in-memory database
```

When running in a Bun process, the adapter uses the built-in `bun:sqlite` module. In Node.js it falls back to `better-sqlite3` (must be installed separately).

### PostgreSQL

```ts
import { PostgresAdapter } from '@richardmcquiston01/online-catalog-cms';

const db = new PostgresAdapter({
  connectionString: process.env.DATABASE_URL,
  // or individual fields:
  host: 'localhost',
  port: 5432,
  database: 'catalog',
  username: 'admin',
  password: process.env.PG_PASSWORD,
  ssl: true, // optional
});
```

### MySQL / MariaDB

```ts
import { MySQLAdapter } from '@richardmcquiston01/online-catalog-cms';

const db = new MySQLAdapter({
  host: 'localhost',
  port: 3306,
  database: 'catalog',
  user: 'admin',
  password: process.env.MYSQL_PASSWORD,
});
```

### Redis

```ts
import { RedisAdapter } from '@richardmcquiston01/online-catalog-cms';

const db = new RedisAdapter({
  url: 'redis://localhost:6379',
  keyPrefix: 'occ', // optional, default 'occ'
});
```

Redis stores products and categories as hashes (`occ:product:{id}`) with sorted-set indexes. Suitable for read-heavy catalogs with simple filter needs.

### MongoDB

```ts
import { MongoDBAdapter } from '@richardmcquiston01/online-catalog-cms';

const db = new MongoDBAdapter({
  url: 'mongodb://localhost:27017',
  database: 'catalog',
});
```

Collections: `occ_product`, `occ_category`, `occ_image`. Indexes are created on `initialize()`.

## Storage Adapters

Storage adapters handle image/file uploads independently of the database.

### Local Disk

```ts
import { LocalStorageAdapter } from '@richardmcquiston01/online-catalog-cms';

const storage = new LocalStorageAdapter({
  uploadDir: '/var/www/uploads',
  baseUrl: 'https://example.com/uploads', // returned as the file URL
});
```

### S3-Compatible (AWS S3, MinIO, Cloudflare R2)

```ts
import { S3Adapter } from '@richardmcquiston01/online-catalog-cms';

const storage = new S3Adapter({
  bucket: 'my-catalog-images',
  region: 'us-east-1',
  accessKeyId: process.env.AWS_ACCESS_KEY_ID,
  secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
  // For S3-compatible services, set a custom endpoint:
  endpoint: 'https://my-minio.example.com',
});
```

### External URL

For catalogs where images are already hosted externally. Upload is not supported — pass URLs directly in `CreateImageInput.url`.

```ts
import { ExternalURLAdapter } from '@richardmcquiston01/online-catalog-cms';
const storage = new ExternalURLAdapter();
```

### Using Storage With the Catalog

```ts
const catalog = new OnlineCatalog({ db, storage });
await catalog.initialize();

// Upload a file and associate it with a product
const image = await catalog.images.upload({
  productId: product.id,
  file: fs.readFileSync('./photo.jpg'),
  filename: 'photo.jpg',
  altText: 'A widget in blue',
});
// image.url is the returned URL from the storage adapter
```

## Schema Management

### Auto-migrate (recommended)

```ts
await catalog.initialize();
// Creates all tables and runs any pending migrations.
```

### Manual Migrations

Migration SQL files are included in the package under `src/adapters/database/relational/migrations/`. Run `001_initial.sql` with your preferred tool, then verify:

```ts
const result = await catalog.installer.verify();
if (!result.ok) {
  console.error('Schema issues:', result.issues);
}
```

### Dry-run Check

```ts
const result = await catalog.installer.install({ dryRun: true });
// Returns verification result without running any migrations.
```

## API Reference

### Products

```ts
// Create
const product = await catalog.products.create({
  name: 'Widget',
  price: 999,              // cents
  sku: 'WGT-001',          // optional
  categoryId: 'uuid',      // optional
  description: richTextDoc, // RichTextDocument
  metadata: {},            // arbitrary JSON
});

// Read
const product = await catalog.products.get('uuid');

// Update
const updated = await catalog.products.update('uuid', { price: 1299 });

// Delete (also deletes associated images from storage)
await catalog.products.delete('uuid');

// List with filters
const products = await catalog.products.list({
  categoryId: 'uuid',
  search: 'widget',  // searches name and SKU
  minPrice: 500,
  maxPrice: 2000,
});
```

### Categories

```ts
const category = await catalog.categories.create({
  name: 'Electronics',
  slug: 'electronics',   // optional, auto-generated if omitted
  parentId: null,        // optional, for nested categories
});

const children = await catalog.categories.list({ parentId: category.id });
```

### Images

```ts
// Associate an external URL
const image = await catalog.images.addUrl({
  productId: product.id,
  url: 'https://cdn.example.com/img.jpg',
  altText: 'Product photo',
  sortOrder: 0, // optional
});

// Upload via storage adapter
const image = await catalog.images.upload({
  productId: product.id,
  file: buffer,
  filename: 'photo.jpg',
  altText: 'Product photo',
  contentType: 'image/jpeg',
});

// List images for a product
const images = await catalog.images.listByProduct(product.id);

// Delete (also removes from storage)
await catalog.images.delete(image.id);
```

## Rich-Text Format

Product descriptions are stored as a versioned JSON document, not raw HTML. Use the builder helpers to construct them:

```ts
import {
  document, paragraph, heading, text, link,
  unorderedList, orderedList, blockquote, image,
} from '@richardmcquiston01/online-catalog-cms';

const description = document([
  heading(2, [text('Features')]),
  unorderedList([
    [text('Lightweight'), text(' and durable')],
    [link('https://example.com', [text('Specifications')])],
  ]),
  paragraph([text('Available in '), text('3 colors', { bold: true }), text('.')]),
]);
```

The document schema:

```ts
interface RichTextDocument {
  version: 1;
  nodes: RichTextNode[];
}

type RichTextNode =
  | { type: 'paragraph'; children: InlineNode[]; cssClass?: string }
  | { type: 'heading'; level: 1|2|3|4|5|6; children: InlineNode[]; cssClass?: string }
  | { type: 'image'; src: string; alt: string; cssClass?: string }
  | { type: 'list'; ordered: boolean; items: InlineNode[][]; cssClass?: string }
  | { type: 'blockquote'; children: InlineNode[]; cssClass?: string };

type InlineNode =
  | { type: 'text'; text: string; bold?: boolean; italic?: boolean; code?: boolean }
  | { type: 'link'; href: string; children: InlineNode[] };
```

Use `isRichTextDocument(value)` to validate an unknown value at runtime.

## Demo

The `demo/` directory contains a standalone browser demo (no server required). It uses an in-memory localStorage-backed adapter.

```sh
bun run demo
```

Open `http://localhost:3000` in your browser. The demo is WCAG 2.1 AA compliant — it uses semantic HTML, visible focus indicators, ARIA landmarks, live regions for status announcements, and sufficient color contrast.

## Building & Contributing

```sh
bun install
bun run build       # compile to dist/ (ESM + CJS + .d.ts)
bun run typecheck   # type-check without emitting
bun run test        # run all tests via bun test
bun run lint        # lint and format check (biome)
bun run lint:fix    # auto-fix lint/format issues
```

Tests live alongside their source files (`*.test.ts`). Integration tests for SQLite run automatically; tests for PostgreSQL/MySQL/Redis/MongoDB require a live connection (they are skipped if the relevant environment variables are not set).

## License

Apache 2.0

## Copyright

Copyright 2026 Richard McQuiston <richard@mcqsoft.com>
