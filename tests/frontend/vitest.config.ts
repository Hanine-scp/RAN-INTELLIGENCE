import path from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

const root = fileURLToPath(new URL("../..", import.meta.url));

export default defineConfig({
  test: {
    environment: "node",
    include: ["unit/**/*.test.ts"],
  },
  resolve: {
    alias: {
      "@": path.join(root, "frontend"),
    },
  },
});
