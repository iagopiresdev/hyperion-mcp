import {
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  mock,
  spyOn,
  test,
} from "bun:test";
import type { Dirent, Stats } from "fs"; // Import Dirent and Stats from 'fs'
import * as fsPromises from "fs/promises";
import type { ToolHandler } from "../../../src/types/mcp";
import { config as appConfig } from "../../../src/utils/config";
import { logger as appLogger } from "../../../src/utils/logger";

// Mock dependencies using spyOn
let readdirSpy: ReturnType<typeof spyOn<typeof fsPromises, "readdir">>;
let statSpy: ReturnType<typeof spyOn<typeof fsPromises, "stat">>;
let readFileSpy: ReturnType<typeof spyOn<typeof fsPromises, "readFile">>;

// Mock config and logger
const mockConfig = {
  fsTool: {
    basePath: "/tmp/sandbox", // Use a mock sandbox path
  },
};
// Use spyOn for logger methods if needed, or just provide a simple mock structure
const mockLoggerChild = {
  info: mock(() => {}),
  warn: mock(() => {}),
  error: mock(() => {}),
};
const mockLogger = {
  child: mock(() => mockLoggerChild),
  info: mock(() => {}),
  warn: mock(() => {}),
  error: mock(() => {}),
};

// How to inject these mocks? Bun's module mocking might not easily override these.
// Let's assume the modules *using* config/logger import them directly.
// We might need to adjust the tool implementation or use a DI pattern for better testability.
// For now, we'll rely on the fsPromises mock primarily and assume config/logger are used internally.

// Import the module *after* potentially setting up spies
import { toolRegistry } from "../../../src/registry"; // Path to registry index
import "../../../src/tools/connectors/fileSystem"; // This registers the tool

describe("File System Tool (Bun) - spyOn Mocks", () => {
  let listDirectoryHandler: ToolHandler | undefined;
  let readFileHandler: ToolHandler | undefined;

  beforeAll(() => {
    // Retrieve handlers using the exported registry instance and its method
    listDirectoryHandler = toolRegistry.getToolHandler("list_directory");
    readFileHandler = toolRegistry.getToolHandler("read_file");

    // Override config/logger *if possible* (depends on how they are imported/used)
    // This is often difficult without DI. For now, tests rely on the mock path being used.
    Object.assign(appConfig.fsTool, mockConfig.fsTool);
    Object.assign(appLogger, mockLogger); // Shallow assign top-level methods

    if (!listDirectoryHandler || !readFileHandler) {
      throw new Error("Handlers not found");
    }
  });

  beforeEach(() => {
    // Setup spies with default resolved values
    readdirSpy = spyOn(fsPromises, "readdir").mockResolvedValue([] as Dirent[]);
    statSpy = spyOn(fsPromises, "stat").mockResolvedValue({
      isFile: () => false,
      size: 0,
    } as Stats);
    readFileSpy = spyOn(fsPromises, "readFile").mockResolvedValue("");

    // Reset logger mocks
    mockLogger.child.mockClear();
    mockLogger.info.mockClear();
    mockLogger.warn.mockClear();
    mockLogger.error.mockClear();
    mockLoggerChild.info.mockClear();
    mockLoggerChild.warn.mockClear();
    mockLoggerChild.error.mockClear();
  });

  afterEach(() => {
    // Restore spies
    readdirSpy.mockRestore();
    statSpy.mockRestore();
    readFileSpy.mockRestore();
  });

  describe("list_directory", () => {
    test("should list files and directories successfully", async () => {
      const mockDirents = [
        { name: "file1.txt", isFile: () => true, isDirectory: () => false },
        { name: "subdir", isFile: () => false, isDirectory: () => true },
        { name: "file2.log", isFile: () => true, isDirectory: () => false },
      ] as Dirent[];

      readdirSpy.mockResolvedValue(mockDirents);

      const result = await listDirectoryHandler!({ path: "test_dir" });

      expect(result.content).toEqual({
        files: ["file1.txt", "file2.log"],
        directories: ["subdir"],
      });
      expect(result.metadata?.error).toBeUndefined();
      expect(result.metadata?.path).toBe("test_dir");
      expect(result.metadata?.absolutePath).toBe("/tmp/sandbox/test_dir"); // Assumes mockConfig path is used
      expect(readdirSpy).toHaveBeenCalledWith("/tmp/sandbox/test_dir", {
        withFileTypes: true,
      });
    });

    test("should use the default path '.' when no path is provided", async () => {
      const mockDirents = [
        { name: "root_file.txt", isFile: () => true, isDirectory: () => false },
      ] as Dirent[];
      readdirSpy.mockResolvedValue(mockDirents);

      const result = await listDirectoryHandler!({});

      expect(result.content).toEqual({
        files: ["root_file.txt"],
        directories: [],
      });
      expect(result.metadata?.error).toBeUndefined();
      expect(result.metadata?.path).toBe(".");
      expect(result.metadata?.absolutePath).toBe("/tmp/sandbox"); // Assumes mockConfig path is used
      expect(readdirSpy).toHaveBeenCalledWith("/tmp/sandbox", {
        withFileTypes: true,
      });
    });

    test("should handle path traversal attempts", async () => {
      const result = await listDirectoryHandler!({ path: "../outside" });

      expect(result.content).toBeNull();
      expect(result.metadata?.error).toContain(
        "Access denied: Path is outside the allowed directory."
      );
      expect(readdirSpy).not.toHaveBeenCalled();
    });

    test("should handle invalid characters in path", async () => {
      const result = await listDirectoryHandler!({ path: "valid\0invalid" });

      expect(result.content).toBeNull();
      expect(result.metadata?.error).toContain("Invalid characters in path.");
      expect(readdirSpy).not.toHaveBeenCalled();
    });

    test("should handle non-existent directories", async () => {
      const error = new Error("ENOENT: no such file or directory");
      (error as any).code = "ENOENT";
      readdirSpy.mockRejectedValue(error);

      const result = await listDirectoryHandler!({ path: "non_existent" });

      expect(result.content).toBeNull();
      expect(result.metadata?.error).toBe(error.message);
      expect(readdirSpy).toHaveBeenCalledWith("/tmp/sandbox/non_existent", {
        withFileTypes: true,
      });
    });

    test("should handle invalid parameters (non-string path)", async () => {
      const result = await listDirectoryHandler!({ path: 123 });

      expect(result.content).toBeNull();
      expect(result.metadata?.error).toContain(
        "Expected string, received number"
      );
      expect(readdirSpy).not.toHaveBeenCalled();
    });
  });

  describe("read_file", () => {
    const MAX_READ_LENGTH = 10000; // Match the constant in the source

    test("should read a file successfully", async () => {
      const mockContent = "This is the file content.";
      const mockStats = {
        isFile: () => true,
        size: mockContent.length,
      } as Stats;

      statSpy.mockResolvedValue(mockStats);
      readFileSpy.mockResolvedValue(mockContent);

      const result = await readFileHandler!({ path: "my_file.txt" });

      expect(result.content).toBe(mockContent);
      expect(result.metadata?.error).toBeUndefined();
      expect(result.metadata?.path).toBe("my_file.txt");
      expect(result.metadata?.absolutePath).toBe("/tmp/sandbox/my_file.txt"); // Assumes mockConfig path is used
      expect(result.metadata?.truncated).toBe(false);
      expect(result.metadata?.originalLength).toBe(mockContent.length);
      expect(statSpy).toHaveBeenCalledWith("/tmp/sandbox/my_file.txt");
      expect(readFileSpy).toHaveBeenCalledWith("/tmp/sandbox/my_file.txt", {
        encoding: "utf8",
      });
    });

    test("should handle path traversal attempts", async () => {
      const result = await readFileHandler!({ path: "../../etc/passwd" });

      expect(result.content).toBeNull();
      expect(result.metadata?.error).toContain(
        "Access denied: Path is outside the allowed directory."
      );
      expect(statSpy).not.toHaveBeenCalled();
      expect(readFileSpy).not.toHaveBeenCalled();
    });

    test("should handle invalid characters in path", async () => {
      const result = await readFileHandler!({ path: "valid\0invalid.txt" });

      expect(result.content).toBeNull();
      expect(result.metadata?.error).toContain("Invalid characters in path.");
      expect(statSpy).not.toHaveBeenCalled();
      expect(readFileSpy).not.toHaveBeenCalled();
    });

    test("should handle non-existent files", async () => {
      const error = new Error("ENOENT: no such file or directory");
      (error as any).code = "ENOENT";
      statSpy.mockRejectedValue(error);

      const result = await readFileHandler!({ path: "not_a_file.txt" });

      expect(result.content).toBeNull();
      expect(result.metadata?.error).toBe(error.message);
      expect(statSpy).toHaveBeenCalledWith("/tmp/sandbox/not_a_file.txt");
      expect(readFileSpy).not.toHaveBeenCalled();
    });

    test("should handle trying to read a directory", async () => {
      const mockStats = { isFile: () => false, size: 0 } as Stats; // It's not a file
      statSpy.mockResolvedValue(mockStats);

      const result = await readFileHandler!({ path: "a_directory" });

      expect(result.content).toBeNull();
      expect(result.metadata?.error).toContain("'a_directory' is not a file.");
      expect(statSpy).toHaveBeenCalledWith("/tmp/sandbox/a_directory");
      expect(readFileSpy).not.toHaveBeenCalled();
    });

    test("should handle files that are too large", async () => {
      const largeSize = MAX_READ_LENGTH * 2 + 1;
      const mockStats = { isFile: () => true, size: largeSize } as Stats;
      statSpy.mockResolvedValue(mockStats);

      const result = await readFileHandler!({ path: "large_file.bin" });

      expect(result.content).toBeNull();
      expect(result.metadata?.error).toContain("File is too large to read");
      expect(statSpy).toHaveBeenCalledWith("/tmp/sandbox/large_file.bin");
      expect(readFileSpy).not.toHaveBeenCalled();
    });

    test("should truncate long file content", async () => {
      const longContent = "a".repeat(MAX_READ_LENGTH + 10);
      const truncatedContent =
        longContent.substring(0, MAX_READ_LENGTH) + "... [truncated]";
      const mockStats = {
        isFile: () => true,
        size: longContent.length,
      } as Stats;

      statSpy.mockResolvedValue(mockStats);
      readFileSpy.mockResolvedValue(longContent);

      const result = await readFileHandler!({ path: "long_file.txt" });

      expect(result.content).toBe(truncatedContent);
      expect(result.metadata?.error).toBeUndefined();
      expect(result.metadata?.path).toBe("long_file.txt");
      expect(result.metadata?.absolutePath).toBe("/tmp/sandbox/long_file.txt"); // Assumes mockConfig path is used
      expect(result.metadata?.truncated).toBe(true);
      expect(result.metadata?.originalLength).toBe(longContent.length);
      expect(statSpy).toHaveBeenCalledWith("/tmp/sandbox/long_file.txt");
      expect(readFileSpy).toHaveBeenCalledWith("/tmp/sandbox/long_file.txt", {
        encoding: "utf8",
      });
    });

    test("should handle invalid parameters (missing path)", async () => {
      const result = await readFileHandler!({}); // Missing required path

      expect(result.content).toBeNull();
      expect(result.metadata?.error).toContain("Invalid input: Required");
      expect(statSpy).not.toHaveBeenCalled();
      expect(readFileSpy).not.toHaveBeenCalled();
    });

    test("should handle invalid parameters (non-string path)", async () => {
      const result = await readFileHandler!({ path: false }); // Invalid type

      expect(result.content).toBeNull();
      expect(result.metadata?.error).toContain(
        "Expected string, received boolean"
      );
      expect(statSpy).not.toHaveBeenCalled();
      expect(readFileSpy).not.toHaveBeenCalled();
    });
  });
});
