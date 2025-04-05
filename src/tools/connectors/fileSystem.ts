import fs from "fs/promises";
import path from "path";
import { z } from "zod";
import { registerTool } from "../../registry";
import type { MCPToolResponse } from "../../types/mcp";
import { config } from "../../utils/config";
import { logger } from "../../utils/logger";

const fsLogger = logger.child({ component: "file-system-tool" });

const MAX_READ_LENGTH = 10000;
const SANDBOX_BASE_PATH = path.resolve(config.fsTool.basePath);
fsLogger.info(`File system tool sandboxed to: ${SANDBOX_BASE_PATH}`);

/**
 * Resolves a user-provided relative path against the sandbox base path
 * and ensures it stays within the sandbox.
 * @param relativePath The user-provided path.
 * @returns The absolute, sanitized path within the sandbox.
 * @throws If the path attempts to escape the sandbox or is invalid.
 */
function resolveSandboxPath(relativePath: string): string {
  const absoluteBasePath = SANDBOX_BASE_PATH;
  const requestedPath = path.resolve(absoluteBasePath, relativePath);

  if (!requestedPath.startsWith(absoluteBasePath)) {
    fsLogger.warn("Path traversal attempt detected", {
      relativePath,
      requestedPath,
      absoluteBasePath,
    });
    throw new Error("Access denied: Path is outside the allowed directory.");
  }

  if (relativePath.includes("..") || relativePath.includes("\0")) {
    fsLogger.warn("Potentially malicious characters in path", { relativePath });
    throw new Error("Invalid characters in path.");
  }

  return requestedPath;
}

const ListDirectoryParamsSchema = z.object({
  path: z.string().optional().default("."),
});

async function listDirectoryHandler(
  params: Record<string, any>
): Promise<MCPToolResponse> {
  const validationResult = ListDirectoryParamsSchema.safeParse(params);
  if (!validationResult.success) {
    fsLogger.warn("Invalid parameters for list_directory", {
      errors: validationResult.error.errors,
    });
    return {
      content: null,
      metadata: {
        error: `Invalid input: ${validationResult.error.errors
          .map((e) => e.message)
          .join(", ")}`,
      },
    };
  }
  const { path: relativePath } = validationResult.data;

  try {
    const targetPath = resolveSandboxPath(relativePath);
    fsLogger.info(`Listing directory: ${targetPath}`);

    const dirents = await fs.readdir(targetPath, { withFileTypes: true });
    const files = dirents.filter((d) => d.isFile()).map((d) => d.name);
    const directories = dirents
      .filter((d) => d.isDirectory())
      .map((d) => d.name);

    return {
      content: { files, directories },
      metadata: { path: relativePath, absolutePath: targetPath },
    };
  } catch (error: any) {
    fsLogger.error(`Error listing directory ${relativePath}: ${error.message}`);
    return {
      content: null,
      metadata: { path: relativePath, error: error.message },
    };
  }
}

registerTool(
  "list_directory",
  "Lists files and directories within a specified path relative to the sandbox.",
  {
    type: "object",
    properties: {
      path: {
        type: "string",
        description:
          "The relative path within the sandbox directory (e.g., 'subfolder', '.'). Defaults to the sandbox root.",
        default: ".",
      },
    },
    required: [],
  },
  listDirectoryHandler,
  "admin", // High permission level due to file system access
  {
    category: "connectors",
    tags: ["filesystem", "files", "list"],
  }
);

const ReadFileParamsSchema = z.object({
  path: z.string().min(1, "Path is required"),
});

async function readFileHandler(
  params: Record<string, any>
): Promise<MCPToolResponse> {
  const validationResult = ReadFileParamsSchema.safeParse(params);
  if (!validationResult.success) {
    fsLogger.warn("Invalid parameters for read_file", {
      errors: validationResult.error.errors,
    });
    return {
      content: null,
      metadata: {
        error: `Invalid input: ${validationResult.error.errors
          .map((e) => e.message)
          .join(", ")}`,
      },
    };
  }
  const { path: relativePath } = validationResult.data;

  try {
    const targetPath = resolveSandboxPath(relativePath);
    fsLogger.info(`Reading file: ${targetPath}`);

    // Check if it's actually a file first (prevents reading directories)
    const stats = await fs.stat(targetPath);
    if (!stats.isFile()) {
      throw new Error(`'${relativePath}' is not a file.`);
    }

    // Check file size before reading
    if (stats.size > MAX_READ_LENGTH * 2) {
      // Allow slightly larger raw size before truncating
      fsLogger.warn(`File too large: ${targetPath}, size: ${stats.size}`);
      throw new Error(
        `File is too large to read (max ${MAX_READ_LENGTH * 2} bytes).`
      );
    }

    const rawContent = await fs.readFile(targetPath, { encoding: "utf8" });

    const truncatedContent =
      rawContent.length > MAX_READ_LENGTH
        ? rawContent.substring(0, MAX_READ_LENGTH) + "... [truncated]"
        : rawContent;

    return {
      content: truncatedContent,
      metadata: {
        path: relativePath,
        absolutePath: targetPath,
        originalLength: rawContent.length,
        truncated: rawContent.length > MAX_READ_LENGTH,
      },
    };
  } catch (error: any) {
    fsLogger.error(`Error reading file ${relativePath}: ${error.message}`);
    return {
      content: null,
      metadata: { path: relativePath, error: error.message },
    };
  }
}

registerTool(
  "read_file",
  "Reads the content of a specified file relative to the sandbox.",
  {
    type: "object",
    properties: {
      path: {
        type: "string",
        description:
          "The relative path to the file within the sandbox directory (e.g., 'myfile.txt', 'subfolder/report.md').",
      },
    },
    required: ["path"],
  },
  readFileHandler,
  "admin", // High permission level due to file system access
  {
    category: "connectors",
    tags: ["filesystem", "files", "read"],
  }
);
