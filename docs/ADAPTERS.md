# Adapters

`online-catalog-cms` separates persistence (`DatabaseAdapter`) from file storage (`StorageAdapter`). Pick the ones that match your infrastructure and pass them to `OnlineCatalog`; swapping an adapter never requires changing business logic.

## Where to import from

Every example below imports from the package root, which works in Node.js, Bun, and Deno. Each adapter is also available from its own subpath, which loads only that adapter:

| Adapter               | Subpath                                                 |
| --------------------- | ------------------------------------------------------- |
| `SQLiteAdapter`       | `@richardmcquiston01/online-catalog-cms/sqlite`         |
| `PostgresAdapter`     | `@richardmcquiston01/online-catalog-cms/postgres`       |
| `MySQLAdapter`        | `@richardmcquiston01/online-catalog-cms/mysql`          |
| `RedisAdapter`        | `@richardmcquiston01/online-catalog-cms/redis`          |
| `MongoDBAdapter`      | `@richardmcquiston01/online-catalog-cms/mongodb`        |
| `LocalStorageAdapter` | `@richardmcquiston01/online-catalog-cms/storage/local`  |
| `S3Adapter`           | `@richardmcquiston01/online-catalog-cms/storage/s3`     |
| `ExternalURLAdapter`  | root, or `@richardmcquiston01/online-catalog-cms/browser` |

These adapters need Node.js built-ins, so they are not available in browser builds. Browser apps import from the package root (which resolves to the `/browser` entry) and pass their own `DatabaseAdapter`. `ExternalURLAdapter` is the one storage adapter that works in the browser.

## Database Adapters

All adapters implement the same `DatabaseAdapter` interface.

### SQLite

```ts
import { SQLiteAdapter } from "@richardmcquiston01/online-catalog-cms";

const db = new SQLiteAdapter({ filename: "./catalog.db" });
// filename: ':memory:' for an in-memory database
```

When running in a Bun process, the adapter uses the built-in `bun:sqlite` module. In Node.js it falls back to `better-sqlite3` (must be installed separately).

### PostgreSQL

```ts
import { PostgresAdapter } from "@richardmcquiston01/online-catalog-cms";

const db = new PostgresAdapter({
  url: process.env.DATABASE_URL, // postgres.js connection string
});
```

### MySQL / MariaDB

```ts
import { MySQLAdapter } from "@richardmcquiston01/online-catalog-cms";

const db = new MySQLAdapter({
  host: "localhost",
  port: 3306, // optional, defaults to 3306
  database: "catalog",
  user: "admin",
  password: process.env.MYSQL_PASSWORD,
});
```

### Redis

```ts
import { RedisAdapter } from "@richardmcquiston01/online-catalog-cms";

const db = new RedisAdapter({
  url: "redis://localhost:6379",
  keyPrefix: "occ", // optional, default 'occ'
});
```

Redis stores each product, category and image as a JSON string (`occ:product:{id}`) with set and sorted-set indexes. Suitable for read-heavy catalogs with simple filter needs. Redis has no foreign keys, so the adapter mimics them: deleting a product deletes its images, and deleting a category detaches it from its products and child categories.

### MongoDB

```ts
import { MongoDBAdapter } from "@richardmcquiston01/online-catalog-cms";

const db = new MongoDBAdapter({
  url: "mongodb://localhost:27017",
  database: "catalog", // optional, defaults to 'online_catalog'
});
```

Collections: `occ_product`, `occ_category`, `occ_image`. Indexes are created on `initialize()`. Like Redis, the adapter reproduces the SQL cascade rules on delete (product → images, category → products and child categories); these writes are not transactional.

## Storage Adapters

Storage adapters handle image/file uploads independently of the database.

### Local Disk

```ts
import { LocalStorageAdapter } from "@richardmcquiston01/online-catalog-cms";

const storage = new LocalStorageAdapter({
  uploadDir: "/var/www/uploads",
  baseUrl: "https://example.com/uploads", // optional, returned as the file URL; defaults to '/uploads'
});
```

### S3-Compatible (AWS S3, MinIO, Cloudflare R2)

```ts
import { S3Adapter } from "@richardmcquiston01/online-catalog-cms";

const storage = new S3Adapter({
  bucket: "my-catalog-images",
  region: "us-east-1",
  accessKeyId: process.env.AWS_ACCESS_KEY_ID,
  secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
  // For S3-compatible services, set a custom endpoint:
  endpoint: "https://my-minio.example.com",
  publicRead: true, // optional, defaults to true
});
```

### External URL

For catalogs where images are already hosted externally. Upload is not supported — pass URLs directly in `CreateImageInput.url`.

```ts
import { ExternalURLAdapter } from "@richardmcquiston01/online-catalog-cms";
const storage = new ExternalURLAdapter();
```

### Using Storage With the Catalog

```ts
const catalog = new OnlineCatalog({ db, storage });
await catalog.initialize();

// Upload a file and associate it with a product
const image = await catalog.images.upload({
  productId: product.id,
  file: fs.readFileSync("./photo.jpg"),
  filename: "photo.jpg",
  altText: "A widget in blue",
});
// image.url is the returned URL from the storage adapter
```
