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
import {
  OnlineCatalog,
  SQLiteAdapter,
  document,
  paragraph,
  text,
} from "@richardmcquiston01/online-catalog-cms";

const catalog = new OnlineCatalog({
  db: new SQLiteAdapter({ filename: "./catalog.db" }),
});

await catalog.initialize(); // runs migrations automatically

const product = await catalog.products.create({
  name: "Acme Widget",
  price: 1999, // stored in cents to avoid floating-point issues
  description: document([paragraph([text("A great widget.")])]),
});

console.log(product.id, product.slug); // auto-generated UUID and slug
```

## Buy Me a Coffee

If this app, code, or repository has helped you or someone you know, please consider donating. I appreciate any help to offset the costs of development and/or AI Credits.

[**Donate via Stripe**](https://donate.stripe.com/00w5kD3Gj1Xo9v7gVOcs800), or scan:

[![Donate via Stripe](./donate.svg)](https://donate.stripe.com/00w5kD3Gj1Xo9v7gVOcs800)

## Adapters

Database adapters (SQLite, PostgreSQL, MySQL/MariaDB, Redis, MongoDB) and storage adapters (local disk, S3-compatible, external URL) all implement the same `DatabaseAdapter` / `StorageAdapter` interfaces, so you can swap them without changing any business logic. See [docs/ADAPTERS.md](docs/ADAPTERS.md) for configuration examples for each.

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
  console.error("Schema issues:", result.issues);
}
```

### Dry-run Check

```ts
const result = await catalog.installer.install({ dryRun: true });
// Returns verification result without running any migrations.
```

## API Reference

Full method signatures and examples for `catalog.products`, `catalog.categories`, and `catalog.images` live in [docs/API.md](docs/API.md).

## Rich-Text Format

Product descriptions are stored as a versioned JSON document, not raw HTML. Use the builder helpers to construct them:

```ts
import {
  document,
  paragraph,
  heading,
  text,
  link,
  unorderedList,
  orderedList,
  blockquote,
  image,
} from "@richardmcquiston01/online-catalog-cms";

const description = document([
  heading(2, [text("Features")]),
  unorderedList([
    [text("Lightweight"), text(" and durable")],
    [link("https://example.com", [text("Specifications")])],
  ]),
  paragraph([
    text("Available in "),
    text("3 colors", { bold: true }),
    text("."),
  ]),
]);
```

The document schema:

```ts
interface RichTextDocument {
  version: 1;
  nodes: RichTextNode[];
}

type RichTextNode =
  | { type: "paragraph"; children: InlineNode[]; cssClass?: string }
  | {
      type: "heading";
      level: 1 | 2 | 3 | 4 | 5 | 6;
      children: InlineNode[];
      cssClass?: string;
    }
  | { type: "image"; src: string; alt: string; cssClass?: string }
  | { type: "list"; ordered: boolean; items: InlineNode[][]; cssClass?: string }
  | { type: "blockquote"; children: InlineNode[]; cssClass?: string };

type InlineNode =
  | {
      type: "text";
      text: string;
      bold?: boolean;
      italic?: boolean;
      code?: boolean;
    }
  | { type: "link"; href: string; children: InlineNode[] };
```

Use `isRichTextDocument(value)` to validate an unknown value at runtime.

## Demo

Try it live: **[online-catalog-cms-demo.vercel.app](https://online-catalog-cms-demo.vercel.app/)**

A standalone, WCAG 2.1 AA compliant browser demo lives in a separate repository: [online-catalog-cms-demo](https://github.com/RichardMcQuiston01/online-catalog-cms-demo). It is a Vite + TypeScript SPA (no server required, in-memory localStorage-backed adapter) that is deployable to Vercel.

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

### Releasing

Publishing to npm is automated via `.github/workflows/publish.yml`. To cut a release:

1. Bump `"version"` in `package.json` (following [Semantic Versioning](https://semver.org/)) and add a matching entry to `CHANGELOG.md`, on `main`.
2. Tag that commit `vX.Y.Z` (matching the `package.json` version) and push the tag: `git tag vX.Y.Z && git push origin vX.Y.Z`.

Pushing a `v*.*.*` tag whose commit is on `main` and whose version matches `package.json` triggers the workflow, which runs `bun run typecheck && bun run test && bun run build` (via `prepublishOnly`) and then `npm publish --provenance`. A tag on a commit not reachable from `main`, or one whose version doesn't match `package.json`, fails the workflow before it publishes.

## License

Apache 2.0

## Copyright

Copyright 2026 Richard McQuiston <richard@mcqsoft.com>
