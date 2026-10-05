# Roadmap

Completed work is tracked in [CHANGELOG.md](CHANGELOG.md). What's left:

- [ ] Integration tests for the PostgreSQL/MySQL/Redis/MongoDB adapters:
      only the SQLite adapter has tests today. Add tests for the others
      (skipped unless the relevant env vars are set), then run them
      against service containers in CI.
- [ ] Redis and MongoDB referential behavior: unlike the SQL adapters
      (`ON DELETE CASCADE` / `SET NULL`), deleting a product leaves its
      images behind, deleting a category leaves dangling `categoryId` /
      `parentId` references, and `RedisProductRepository` never populates
      `Product.images` (so storage cleanup on `products.delete` is a no-op
      there).
- [ ] Versioned migration runner: `BaseSQLAdapter.initialize()` replays the
      single embedded migration on every start and ignores `occ_migration`.
      Track applied versions so a second migration can be added without
      editing each adapter.
- [ ] Friendlier unique-slug handling: two products or categories with the
      same name hit the `slug` UNIQUE constraint and surface a raw driver
      error. Generate a suffix or throw a descriptive error.
- [ ] Validate `description` with `assertRichTextDocument` in
      `ProductService.create`/`update` rather than leaving it to callers.
- [ ] Make `SQLiteAdapter` build its repositories in the constructor like
      the other adapters (it currently throws "Call initialize() first" from
      the `products`/`categories`/`images` getters).
