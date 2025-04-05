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

interface AuthConfig {
  enabled: boolean;
  enableAuth: boolean;
  apiKeys: string[];
}

interface ApiKeys {
  openai?: string;
}

interface Config {
  server: ServerConfig;
  auth: AuthConfig;
  apiKeys: ApiKeys;
}

function parseNumber(value: string | undefined, defaultValue: number): number {
  if (!value) return defaultValue;
  const parsed = parseInt(value, 10);
  return isNaN(parsed) ? defaultValue : parsed;
}

function parseBoolean(
  value: string | undefined,
  defaultValue: boolean
): boolean {
  if (value === undefined) return defaultValue;
  return value.toLowerCase() === "true" || value === "1";
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

  const authEnabled = parseBoolean(
    process.env.ENABLE_AUTH,
    environment === "production"
  );

  const apiKeys: string[] = [];
  if (process.env.API_KEY) {
    apiKeys.push(process.env.API_KEY);
    configLogger.debug("API_KEY loaded from environment");
  }

  if (process.env.MCP_API_KEY) {
    apiKeys.push(process.env.MCP_API_KEY);
    configLogger.debug("MCP_API_KEY loaded from environment");
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
    auth: {
      enabled: authEnabled,
      enableAuth: authEnabled,
      apiKeys,
    },
    apiKeys: {
      openai: openaiApiKey,
    },
  };

  configLogger.debug("Configuration loaded");
  return config;
}

export const config = createConfig();
