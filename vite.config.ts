import { defineConfig } from "vite";

export default defineConfig({
  resolve: {
    alias: {
      "@": import.meta.dirname + "/src",
    },
    extensions: [".ts", ".js", ".json", ".mjs", ".cjs"],
  },
  build: {
    ssr: true,
    target: "node22",
    outDir: "dist",
    lib: {
      entry: import.meta.dirname + "/src/index.ts",
      formats: ["es"],
      fileName: () => "index.js",
    },
    rollupOptions: {
      external: [
        // Runtime deps — keep as external imports
        "hono",
        "@hono/node-server",
        "@modelcontextprotocol/sdk",
        "js-yaml",
        "zod",
        "pino",
        "pino-pretty",
      ],
    },
    sourcemap: true,
    minify: false,
  },
});