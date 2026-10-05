# Roadmap

Completed work is tracked in [CHANGELOG.md](CHANGELOG.md). What's left:

- [ ] Integration tests for the PostgreSQL and MySQL adapters: run the
      shared contract in `adapterContract.ts` against service containers in
      CI (SQLite, Redis and MongoDB already do).
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
