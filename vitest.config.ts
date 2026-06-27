import { defineConfig } from "vitest/config";

// Real-agent runs are slow and share the single SQLite record, so tests are serialized
// and given generous timeouts. These are detector tests, not unit tests.
export default defineConfig({
  test: {
    include: ["tests/**/*.test.ts"],
    testTimeout: 240_000,
    hookTimeout: 180_000,
    pool: "forks",
    fileParallelism: false,
  },
});
