# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [0.1.3] - 2026-10-05

### Added
- A shared `DatabaseAdapter` contract test suite (`adapterContract.ts`) covering CRUD, filters, pagination, images and referential behavior. It runs against SQLite always, and against Redis and MongoDB when `REDIS_URL` / `MONGODB_URL` are set; CI now starts both services.

### Changed
- `RedisAdapter` is restructured around a `RedisKeys` helper and batched reads (`MGET`, pipelined `ZRANGE`) instead of one request per entity.

### Fixed
- `products.list({ categoryId: null })` returned nothing in the SQL adapters (`category_id = NULL`); it now matches uncategorized products, and Redis supports it too.
- `RedisAdapter` populates `Product.images` (it was always empty, which also made storage cleanup on `products.delete` a no-op for Redis).
- Redis and MongoDB now match the SQL cascade rules: deleting a product deletes its images, and deleting a category sets `categoryId` / `parentId` to null on its products and child categories.

## [0.1.2] - 2026-10-05

### Added
- `.github/workflows/ci.yml`: runs lint, typecheck, tests, build and a smoke test of the built package on every pull request and push to `main`/`dev`.
- `bun run smoke:dist`, which loads the built `dist/` the way an npm consumer would and initializes a SQLite database.
- Exported `ProductService`, `CategoryService`, `ImageService` and the `UploadImageInput` type so consumers can name the types of `catalog.products`, `catalog.categories` and `catalog.images`.
- `ROADMAP.md`, linked from the README, tracking outstanding work.

### Changed
- Shared helpers replace duplicated code: `utils/merge.ts` (partial-update merging), `relational/sqlHelpers.ts` (WHERE/pagination/image loading) and `storage/storageKeys.ts` (key generation and URL parsing).
- `products.list` now loads images in one query per 500 products (SQL, MongoDB) instead of one per product.
- Storage keys now use a UUID prefix instead of `Date.now()` to avoid collisions; `S3Adapter` honors `UploadOptions.public` and no longer allows `/` in generated keys.
- Removed redundant `verify()` overrides, an unused `SQLiteInstance.instance` field and banner comments; corrected inaccurate comments (Redis stores JSON strings, not hashes; `PostgresConfig.url` is a string only).

### Fixed
- **SQLite, PostgreSQL and MySQL adapters failed to initialize in the published package**: the migration SQL was read from a `.sql` file that is not part of `dist/`. The SQL is now embedded in the bundle (`001_initial.ts`; a test keeps it identical to `001_initial.sql`).
- PostgreSQL adapter sent `?` placeholders, which PostgreSQL rejects; they are now rewritten to `$1, $2, ...`.
- MySQL adapter inserted a duplicate `occ_migration` row (and failed) on the second `initialize()`; it now uses `INSERT IGNORE`.
- `list({ offset })` without `limit` was a syntax error in SQL adapters, and `limit`/`offset` were interpolated unvalidated into SQL. They are now validated as non-negative integers.
- `LocalStorageAdapter` called `Bun.write`, which does not exist in Node.js; it now uses `node:fs/promises`. `delete` also refuses URLs that resolve outside the upload directory.
- `ImageService.upload` leaves no orphaned file in storage when saving the image record fails.
- `RedisAdapter` product search now also matches SKU, like the SQL and MongoDB adapters; MongoDB search input is regex-escaped.
- Documentation corrections: README and `ROADMAP.md` no longer claim PostgreSQL/MySQL/Redis/MongoDB tests exist; the README's Manual Migrations section now links to `001_initial.sql` on GitHub (it isn't in the published package); `CLAUDE.md` uses the scoped package name; `docs/API.md` now covers `close()`, `get`/`update`/`delete` on categories, `images.get`, pagination and `search` filters, and `images.upload` options.
- The `bun run lint` failure in `package.json` (Biome wanted the `files` and `trustedDependencies` arrays collapsed to a single line). Removed the now-resolved item from `ROADMAP.md`.

## [0.1.1] - 2026-09-22

### Added
- `.github/workflows/publish.yml`: publishes to npm automatically when a `vX.Y.Z` tag is pushed, provided the tag's commit is on `main` and its version matches `package.json`. Runs the existing `prepublishOnly` gate (typecheck, test, build) before publishing with provenance.

### Changed
- Moved the browser `demo/` app out of this package into its own repository, [online-catalog-cms-demo](https://github.com/RichardMcQuiston01/online-catalog-cms-demo), rebuilt there as a Vite + TypeScript SPA deployable to Vercel. Removed the `bun run demo` script and the `demo/` directory from this repo accordingly.
- Replaced the ad-hoc PayPal donate line with the standard "Buy Me a Coffee" section (Stripe link + QR code, `donate.svg` added at the repo root), and moved it to right after "Quick Start" in the README.
- Moved "Database Adapters" and "Storage Adapters" out of the README into [docs/ADAPTERS.md](docs/ADAPTERS.md), and "API Reference" into [docs/API.md](docs/API.md), leaving short linked pointers in their place.
- Added a live demo link ([online-catalog-cms-demo.vercel.app](https://online-catalog-cms-demo.vercel.app/)) to the README's Demo section.

### Fixed
- The README's PostgreSQL example showed a multi-field config object (`host`/`port`/`username`/`password`/`ssl`) that no longer matches `PostgresConfig`, which only takes `{ url }` (a postgres.js connection string). Corrected in `docs/ADAPTERS.md`.

## [0.1.0] - 2026-07-15

### Added

#### Phase 1 — Project Scaffolding
- Project skeleton: `package.json` (ESM+CJS dual exports, optional DB/storage deps), `tsconfig.json` (strict, Bundler resolution, `bun-types`), `tsup.config.ts`, `biome.json`, `vitest.config.ts`
- `CHANGELOG.md` and initial `README.md`

#### Phase 2 — Core Types & Interfaces
- Core TypeScript types: `Product`, `Category`, `Image`, `RichTextDocument` (versioned JSON schema with `cssClass` per node), all `Create*Input` / `Update*Input` / `*Filter` variants
- `DatabaseAdapter` interface with `ProductRepository`, `CategoryRepository`, `ImageRepository`
- `StorageAdapter` interface (`upload`, `delete`, `getPublicUrl`)
- `VerificationResult` type for schema health checks

#### Phase 3 — Rich-Text Utilities
- Builder helpers: `document()`, `paragraph()`, `heading()`, `text()`, `link()`, `image()`, `unorderedList()`, `orderedList()`, `blockquote()`
- Runtime validators: `isRichTextDocument()`, `assertRichTextDocument()`
- 22 unit tests for builders and validators

#### Phase 4 — Database Adapters
- Shared relational base: `BaseSQLAdapter` (migration runner, `verify()`), `SQLProductRepository`, `SQLCategoryRepository`, `SQLImageRepository`, `rowMappers`, `001_initial.sql`
- `SQLiteAdapter` — dual-driver: tries `bun:sqlite` (Bun), falls back to `better-sqlite3` (Node.js); lazy initialization via private backing fields + getter properties
- `PostgresAdapter` — uses `postgres` (postgres.js)
- `MySQLAdapter` — uses `mysql2/promise`
- `RedisAdapter` — uses `ioredis`; hash+set key layout
- `MongoDBAdapter` — uses `mongodb`; `_id` is the UUID string; indexes on `initialize()`
- `Installer` class wrapping `initialize()` + `verify()` with `dryRun` support
- 15 SQLite integration tests (products, categories, images CRUD + filters)
- Switched primary test runner from `vitest run` to `bun test` to support `bun:sqlite` native module resolution

#### Phase 5 — Storage Adapters
- `LocalStorageAdapter` — writes to local filesystem; uses `Bun.write` for Buffer uploads, Node stream pipeline for Readable streams; auto-creates upload directory
- `S3Adapter` — uploads to any S3-compatible service via `@aws-sdk/client-s3`; auto-guesses `Content-Type` from extension; supports custom endpoints (MinIO, Cloudflare R2)
- `ExternalURLAdapter` — no-op for externally-hosted images; `upload()` throws with a helpful message; `delete()` is a no-op
- 8 unit tests (upload, delete, getPublicUrl, edge cases)

#### Phase 6 — OnlineCatalog Class
- `OnlineCatalog` — main package entry point; composes `DatabaseAdapter` + optional `StorageAdapter` into `ProductService`, `CategoryService`, `ImageService`, and `Installer`
- `ProductService` — wraps DB repository; `delete()` cleans up associated storage files
- `CategoryService` — thin wrapper around the DB category repository
- `ImageService` — `upload()` uploads via storage adapter then records the image; `delete()` removes from storage and database

#### Phase 7 — Demo App
- Standalone browser demo in `demo/` (no server required, localStorage-backed in-memory adapter)
- `index.html` — product grid with search/category/price filters and inline delete
- `editor.html` — create/edit form with contenteditable rich-text toolbar (bold, italic, lists), keyboard shortcuts, and image URL field
- `style.css` — design tokens, sufficient color contrast (>= 4.5:1), visible `:focus-visible` outlines, responsive layout
- WCAG 2.1 AA: skip link, `aria-live` status regions, `aria-current`, `aria-required`, `aria-invalid`, `role=alert` field errors, `aria-pressed` toolbar state, ARIA landmarks

#### Phase 8 — Documentation
- Complete `README.md` with installation, quick start, all adapter configuration examples, schema management, full API reference, rich-text format reference, demo instructions, and contributing guide
- `CHANGELOG.md` updated with all phases

#### NPM Publish Preparation
- Renamed package to scoped name `@richardmcquiston01/online-catalog-cms`
- Added `keywords`, `repository`, `bugs`, `homepage`, and `engines` fields to `package.json`
- Added `publishConfig: { access: "public" }` for scoped public publishing
- Added `prepublishOnly` script to enforce typecheck → test → build gate before every publish
- Updated all import examples and install commands in `README.md` to use the scoped package name
