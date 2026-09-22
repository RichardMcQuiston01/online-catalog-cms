# Adapters

`online-catalog-cms` separates persistence (`DatabaseAdapter`) from file storage (`StorageAdapter`). Pick the ones that match your infrastructure and pass them to `OnlineCatalog`; swapping an adapter never requires changing business logic.

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

Redis stores products and categories as hashes (`occ:product:{id}`) with sorted-set indexes. Suitable for read-heavy catalogs with simple filter needs.

### MongoDB

```ts
import { MongoDBAdapter } from "@richardmcquiston01/online-catalog-cms";

const db = new MongoDBAdapter({
  url: "mongodb://localhost:27017",
  database: "catalog", // optional, defaults to 'online_catalog'
});
```

Collections: `occ_product`, `occ_category`, `occ_image`. Indexes are created on `initialize()`.

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
