import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["convex/**/*.test.ts"],
    exclude: ["opensrc/**", "node_modules/**", ".next/**"],
  },
});
