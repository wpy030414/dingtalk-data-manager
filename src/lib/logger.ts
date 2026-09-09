import pino from "pino";
import type { Config } from "../config/schema.js";

let _logger: pino.Logger | null = null;

/**
 * Creates a pino logger instance.
 * If LogLevel is "silent", suppresses all output (useful for testing).
 */
export function createLogger(level: Config["LogLevel"] = "info"): pino.Logger {
  if (_logger) return _logger;

  const isDev = process.env["NODE_ENV"] !== "production";

  _logger = pino({
    level,
    ...(isDev && {
      transport: {
        target: "pino-pretty",
        options: {
          colorize: true,
          translateTime: "SYS:HH:MM:ss",
          ignore: "pid,hostname",
        },
      },
    }),
  });

  return _logger;
}

/**
 * Returns the singleton logger.
 * Must call createLogger() first, or it will create a default one.
 */
export function getLogger(): pino.Logger {
  if (!_logger) {
    return createLogger("info");
  }
  return _logger;
}

/**
 * Resets the logger singleton (useful for testing).
 */
export function resetLogger(): void {
  _logger = null;
}