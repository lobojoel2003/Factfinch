import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// BASE_PATH is set in CI for GitHub Pages (https://<user>.github.io/Factfinch/).
export default defineConfig({
  base: process.env.BASE_PATH ?? "/",
  plugins: [react()],
  build: { sourcemap: true },
});
