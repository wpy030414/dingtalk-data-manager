import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import yaml from "js-yaml";
import { ConfigSchema, type Config } from "./schema.js";
import { ConfigError } from "../lib/errors.js";
import { createLogger } from "../lib/logger.js";

let _config: Config | null = null;

/**
 * Finds the .env.yml file.
 *
 * Priority:
 * 1. `DINGTALK_CONFIG_PATH` env var (explicit path)
 * 2. `process.cwd()/.env.yml` (project root, works for dev + built)
 */
function findConfigPath(): string {
  if (process.env["DINGTALK_CONFIG_PATH"]) {
    return process.env["DINGTALK_CONFIG_PATH"];
  }
  return resolve(process.cwd(), ".env.yml");
}

/**
 * Loads and validates the configuration from .env.yml.
 *
 * Searches for .env.yml in the project root.
 * Caches the result and returns the same frozen object on subsequent calls.
 *
 * @throws {ConfigError} if the file is missing, unparseable, or invalid
 */
export function loadConfig(): Config {
  if (_config) return _config;

  const configPath = findConfigPath();

  let raw: unknown;
  try {
    const fileContents = readFileSync(configPath, "utf-8");
    raw = yaml.load(fileContents);
  } catch (err) {
    const logger = createLogger("silent");
    const message =
      err instanceof Error ? err.message : String(err);
    logger.error(`Failed to load config from ${configPath}: ${message}`);
    throw new ConfigError(
      `Cannot load .env.yml: ${message}. ` +
        `Copy .env.yml.example to .env.yml and fill in your credentials.`,
    );
  }

  const result = ConfigSchema.safeParse(raw);
  if (!result.success) {
    const logger = createLogger("silent");
    const issues = result.error.issues
      .map((i) => `  - ${i.path.join(".")}: ${i.message}`)
      .join("\n");
    logger.error(`Invalid config:\n${issues}`);
    throw new ConfigError(`Invalid .env.yml configuration:\n${issues}`);
  }

  _config = Object.freeze(result.data);
  return _config;
}

/**
 * Synchronous wrapper — returns cached config or throws.
 * Use this for backward compat in modules that can't be async.
 */
export function getConfig(): Config {
  if (!_config) {
    throw new ConfigError(
      "Config not loaded. Call loadConfig() first during startup.",
    );
  }
  return _config;
}

/**
 * Resets the cached config (useful for testing).
 */
export function resetConfig(): void {
  _config = null;
}