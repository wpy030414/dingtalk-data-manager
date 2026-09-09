import { z } from "zod";

/**
 * Schema for a single Yida application configuration.
 */
export const YidaAppSchema = z.object({
  name: z.string().min(1).max(100).describe("Human-readable app name"),
  desp: z.string().max(500).default("").describe("App description"),
  appId: z
    .string()
    .min(1)
    .describe("Yida application ID (e.g., 'APP_XXXXXXXX')"),
  systemToken: z.string().min(1).describe("Yida systemToken for API access"),
});

/**
 * Root configuration schema for the entire gateway.
 * Loaded from .env.yml and validated at startup.
 */
export const ConfigSchema = z.object({
  ClientID: z.string().min(1).describe("DingTalk AppKey (ClientID)"),
  ClientSecret: z.string().min(1).describe("DingTalk AppSecret (ClientSecret)"),
  YidaApps: z
    .array(YidaAppSchema)
    .default([])
    .describe("Configured Yida applications"),
  LogLevel: z
    .enum(["trace", "debug", "info", "warn", "error", "silent"])
    .default("info")
    .describe("Minimum log level"),
});

/** Inferred TypeScript type for the full config object. */
export type Config = z.infer<typeof ConfigSchema>;

/** Inferred TypeScript type for a single Yida app config. */
export type YidaAppConfig = z.infer<typeof YidaAppSchema>;