# online-catalog-cms

A headless TypeScript CMS library for managing an online product catalog. Ships zero UI — it exposes a typed API you call from any framework or runtime. Plug in a database adapter and optional storage adapter, then manage products, categories, and images through a consistent interface.

## Install

```sh
npm install online-catalog-cms
# or
bun add online-catalog-cms
```

Install the driver for your database:

```sh
# SQLite
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
import { OnlineCatalog } from 'online-catalog-cms';
import { SQLiteAdapter } from 'online-catalog-cms/adapters/database/sqlite';

const catalog = new OnlineCatalog({
  db: new SQLiteAdapter({ filename: './catalog.db' }),
});

await catalog.initialize(); // runs migrations

const product = await catalog.products.create({
  name: 'Acme Widget',
  price: 1999, // cents
  description: {
    version: 1,
    nodes: [{ type: 'paragraph', children: [{ type: 'text', text: 'A great widget.' }] }],
  },
});
```

## Adapters

### Database Adapters

| Adapter | Package | Import path |
|---|---|---|
| SQLite | `better-sqlite3` | `online-catalog-cms/adapters/database/sqlite` |
| PostgreSQL | `postgres` | `online-catalog-cms/adapters/database/postgres` |
| MySQL / MariaDB | `mysql2` | `online-catalog-cms/adapters/database/mysql` |
| Redis | `ioredis` | `online-catalog-cms/adapters/database/redis` |
| MongoDB | `mongodb` | `online-catalog-cms/adapters/database/mongodb` |

### Storage Adapters

| Adapter | Import path |
|---|---|
| Local disk | `online-catalog-cms/adapters/storage/local` |
| S3-compatible | `online-catalog-cms/adapters/storage/s3` |
| External URL | `online-catalog-cms/adapters/storage/external` |

## Schema Setup

The library can manage database schema automatically or you can run the provided migration files yourself.

**Auto-migrate (recommended for getting started):**

```ts
await catalog.initialize(); // creates tables if they don't exist, runs pending migrations
```

**Manual migrations:**

Migration SQL files are included in the package under `dist/migrations/<adapter>/`. Run them with your preferred migration tool, then verify the setup:

```ts
const result = await catalog.installer.verify();
if (!result.ok) console.error(result.issues);
```

## Building

```sh
bun install
bun run build       # compile to dist/
bun run typecheck   # type-check without emitting
bun run test        # run all tests
bun run lint        # lint and format check
bun run lint:fix    # auto-fix lint/format issues
```

## License

Apache 2.0

## Copyright

Copyright 2026 Richard McQuiston <richard@mcqsoft.com>
