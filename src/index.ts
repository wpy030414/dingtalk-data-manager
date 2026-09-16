#!/usr/bin/env node

import { loadConfig } from "./config/index.js";
import { createLogger } from "./lib/logger.js";
import { startHttpServer } from "./server.js";

const DEFAULT_PORT = 11409;

/**
 * Main entry point.
 */
async function main(): Promise<void> {
  // Load and validate config first (will exit if invalid)
  const config = loadConfig();

  // Initialize logger with configured level
  createLogger(config.LogLevel);

  await startHttpServer(DEFAULT_PORT);
}

main().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});
