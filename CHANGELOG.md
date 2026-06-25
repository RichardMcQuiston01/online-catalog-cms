# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

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
