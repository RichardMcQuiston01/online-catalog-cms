# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

`online-catalog-cms` is a TypeScript NPM package providing an embeddable CMS for an online catalog. It is designed to be consumed by other packages via named exports, e.g. `import { OnlineCatalog } from 'online-catalog-cms'`.

## Commands

Once the project is scaffolded, the standard workflow using `bun`:

```sh
bun install          # Install dependencies
bun run build        # Compile TypeScript (dual ESM+CJS)
bun run typecheck    # Type-check without emitting
bun run test         # Run all tests (uses bun test natively for bun:sqlite support)
bun run lint         # Lint all files (Biome)
bun run lint:fix     # Auto-fix lint/format issues
```

The test runner is `bun test` (not vitest) so that `bun:sqlite` resolves correctly in the SQLite adapter integration tests. `vitest.config.ts` is retained for IDE integration only.

## Package Design

- This is a **library**, not an application — the public API surface matters. Everything exported from the package entry point is part of the public contract.
- Keep the default export minimal; prefer named exports for discoverability.
- Avoid bundling runtime dependencies that callers likely already have (e.g. React, if used). Mark them as `peerDependencies`.
- The package entry point should be declared in `package.json` under `exports` (and `main`/`module` for legacy consumers).
