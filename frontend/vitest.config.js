import { defineConfig } from "vitest/config";
import path from "path";
import { fileURLToPath } from 'url'

const templateRoot = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  root: templateRoot,
  resolve: {
    alias: {
      "@": path.resolve(templateRoot, "src"),
      "@contracts": path.resolve(templateRoot, "contracts"),
      "@assets": path.resolve(templateRoot, "attached_assets"),
    },
  },
  test: {
    environment: "node",
    include: ["api/**/*.test.js", "api/**/*.spec.js"],
  },
});
