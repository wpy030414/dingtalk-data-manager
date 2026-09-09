#!/usr/bin/env node

import { loadConfig } from "./config/index.js";
import { createLogger } from "./lib/logger.js";
import { startStdioServer } from "./mcp/server.js";
import { startHttpServer } from "./server.js";

/**
 * Parse CLI arguments.
 */
function parseArgs(): { transport: "stdio" | "http"; port: number } {
  const args = process.argv.slice(2);
  let transport: "stdio" | "http" = "stdio";
  let port = 3000;

  for (let i = 0; i < args.length; i++) {
    if (args[i] === "--transport" && args[i + 1]) {
      const val = args[i + 1]!;
      if (val === "http" || val === "stdio") {
        transport = val;
      }
      i++;
    } else if (args[i] === "--port" && args[i + 1]) {
      port = Number(args[i + 1]);
      if (Number.isNaN(port) || port < 1 || port > 65535) {
        port = 3000;
      }
      i++;
    }
  }

  return { transport, port };
}

/**
 * Main entry point.
 */
async function main(): Promise<void> {
  // Load and validate config first (will exit if invalid)
  const config = loadConfig();

  // Initialize logger with configured level
  createLogger(config.LogLevel);

  const { transport, port } = parseArgs();

  if (transport === "http") {
    await startHttpServer(port);
  } else {
    await startStdioServer();
  }
}

main().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});