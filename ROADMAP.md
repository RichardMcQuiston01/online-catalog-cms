# Roadmap

Completed work is tracked in [CHANGELOG.md](CHANGELOG.md). What's left:

- [ ] CI on pull requests: `.github/workflows/publish.yml` only runs on a
      version tag. There's no workflow that runs `bun run lint`, `bun run
      typecheck`, and `bun run test` on every PR, so regressions can land
      on `dev`/`main` before the next release catches them.
- [ ] Integration tests for the PostgreSQL/MySQL/Redis/MongoDB adapters:
      only the SQLite adapter has tests today. Add tests for the others
      (skipped unless the relevant env vars are set), then run them
      against service containers in CI.
