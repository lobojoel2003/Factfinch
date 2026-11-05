/// <reference types="vitest/config" />
import { fileURLToPath } from "node:url";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

export default defineConfig({
  // BASE_PATH is set in CI for GitHub Pages (https://<user>.github.io/Factfinch/).
  base: process.env.BASE_PATH ?? "/",
  plugins: [react()],
  resolve: {
    // Use the library's source directly: edits to the engine show up instantly
    // and the demo never depends on a prebuilt dist/. Subpaths such as
    // factfinch/rules/*.json still resolve through the package's exports.
    alias: [
      {
        find: /^factfinch$/,
        replacement: fileURLToPath(
          new URL("../../packages/factfinch/src/index.ts", import.meta.url),
        ),
      },
    ],
  },
  build: { sourcemap: true },
  test: {
    environment: "jsdom",
    include: ["test/**/*.test.tsx"],
    setupFiles: ["test/setup.ts"],
  },
});
