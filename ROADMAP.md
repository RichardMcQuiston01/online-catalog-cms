# Roadmap

Completed work is tracked in [CHANGELOG.md](CHANGELOG.md). What's left:

- [ ] CI on pull requests: `.github/workflows/publish.yml` only runs on a
      version tag. There's no workflow that runs `bun run lint`, `bun run
      typecheck`, and `bun run test` on every PR, so regressions can land
      on `dev`/`main` before the next release catches them.
- [ ] CI coverage for the PostgreSQL/MySQL/Redis/MongoDB adapters: their
      integration tests are skipped unless the relevant env vars are set,
      so they currently only run locally against a live service, never in
      CI.
