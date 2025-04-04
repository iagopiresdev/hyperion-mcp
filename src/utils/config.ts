/**
 * Configuration utility for hyperion-mcp
 * Provides structured access to environment variables with defaults
 */

import { logger } from "./logger";

const configLogger = logger.child({ component: "config" });

interface ServerConfig {
  port: number;
  environment: "development" | "production" | "test";
  logLevel: "debug" | "info" | "warn" | "error";
}

interface ApiKeys {
  openai?: string;
}

interface Config {
  server: ServerConfig;
  apiKeys: ApiKeys;
}

function parseNumber(value: string | undefined, defaultValue: number): number {
  if (!value) return defaultValue;
  const parsed = parseInt(value, 10);
  return isNaN(parsed) ? defaultValue : parsed;
}

function createConfig(): Config {
  const port = parseNumber(process.env.PORT, 3333);

  const environment = (process.env.NODE_ENV || "development") as
    | "development"
    | "production"
    | "test";
  if (!["development", "production", "test"].includes(environment)) {
    configLogger.warn(
      `Invalid NODE_ENV: ${process.env.NODE_ENV}, using 'development' instead`
    );
  }

  const logLevel = (process.env.LOG_LEVEL || "info") as
    | "debug"
    | "info"
    | "warn"
    | "error";
  if (!["debug", "info", "warn", "error"].includes(logLevel)) {
    configLogger.warn(
      `Invalid LOG_LEVEL: ${process.env.LOG_LEVEL}, using 'info' instead`
    );
  }

  const openaiApiKey = process.env.OPENAI_API_KEY;
  if (environment !== "test" && !openaiApiKey) {
    configLogger.warn(
      "OPENAI_API_KEY not set, OpenAI tools will not work correctly"
    );
  }

  const config: Config = {
    server: {
      port,
      environment,
      logLevel,
    },
    apiKeys: {
      openai: openaiApiKey,
    },
  };

  configLogger.debug("Configuration loaded");
  return config;
}

export const config = createConfig();
