import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["test/**/*.test.ts"],
    coverage: {
      provider: "v8",
      include: ["src/**/*.ts"],
      exclude: ["src/cli.ts", "src/build-info.ts"],
      reporter: ["text", "lcov", "json-summary"],
      thresholds: { lines: 85, functions: 85, branches: 80, statements: 85 },
    },
  },
});
