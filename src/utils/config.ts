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
  anthropic?: string;
  github?: string;
}

interface PineconeConfig {
  indexName?: string;
}

interface FsToolConfig {
  allowedReadPaths?: string[];
  allowedWritePaths?: string[];
}

interface Config {
  server: ServerConfig;
  auth: AuthConfig;
  apiKeys: ApiKeys;
  pinecone: PineconeConfig;
  fsTool: FsToolConfig;
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
  const anthropicApiKey = process.env.ANTHROPIC_API_KEY;
  const githubToken = process.env.GITHUB_TOKEN;
  const pineconeIndexName = process.env.PINECONE_INDEX_NAME;

  const allowedReadPathsRaw = process.env.FS_ALLOWED_READ_PATHS;
  const allowedWritePathsRaw = process.env.FS_ALLOWED_WRITE_PATHS;
  const allowedReadPaths = allowedReadPathsRaw
    ? allowedReadPathsRaw
        .split(",")
        .map((p) => p.trim())
        .filter((p) => p)
    : undefined;
  const allowedWritePaths = allowedWritePathsRaw
    ? allowedWritePathsRaw
        .split(",")
        .map((p) => p.trim())
        .filter((p) => p)
    : undefined;

  if (environment !== "test" && !openaiApiKey) {
    configLogger.warn(
      "OPENAI_API_KEY not set, OpenAI tools will not work correctly"
    );
  }

  if (environment !== "test" && !anthropicApiKey) {
    configLogger.warn(
      "ANTHROPIC_API_KEY not set, Anthropic tools will not work correctly"
    );
  }

  if (environment !== "test" && !pineconeIndexName) {
    configLogger.warn(
      "PINECONE_INDEX_NAME not set, Pinecone search tool might not work correctly"
    );
  }

  if (
    environment !== "production" &&
    (!allowedReadPaths || allowedReadPaths.length === 0)
  ) {
    configLogger.warn(
      "FS_ALLOWED_READ_PATHS not set or empty, file system read tool might be restricted or disabled."
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
      anthropic: anthropicApiKey,
      github: githubToken,
    },
    pinecone: {
      indexName: pineconeIndexName,
    },
    fsTool: {
      allowedReadPaths: allowedReadPaths,
      allowedWritePaths: allowedWritePaths,
    },
  };

  configLogger.debug("Configuration loaded");
  return config;
}

export const config = createConfig();
