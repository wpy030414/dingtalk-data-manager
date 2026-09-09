import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    alias: {
      "@": import.meta.dirname + "/src",
    },
    extensions: [".ts", ".js", ".json", ".mjs", ".cjs"],
  },
  test: {
    globals: true,
    environment: "node",
    include: ["tests/**/*.test.ts"],
    coverage: {
      provider: "v8",
      include: ["src/**/*.ts"],
      exclude: ["src/index.ts", "src/server.ts"],
    },
    server: {
      deps: {
        inline: ["@modelcontextprotocol/sdk"],
      },
    },
  },
});