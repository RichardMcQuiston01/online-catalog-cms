import { defineConfig } from 'vitest/config';

// Note: the primary test runner is bun test (bun run test).
// This config is retained for IDE integration only.
export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    coverage: {
      provider: 'v8',
      reporter: ['text', 'lcov'],
    },
  },
});
