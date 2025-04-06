import {
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  jest,
  spyOn,
} from "bun:test";
import type { Dirent, Stats } from "fs";
import path from "path";
import type { ToolHandler } from "../../../src/types/mcp";

import * as fileSystemTool from "../../../src/tools/connectors/fileSystem";
const { fsPromises: sourceFsPromises } = fileSystemTool;

describe("File System Tool (Unit Tests - Spying on Exported fs)", () => {
  let listDirectoryHandler: ToolHandler | undefined;
  let readFileHandler: ToolHandler | undefined;
  let resolvePathSpy: jest.Mock;
  let readdirSpy: jest.Mock;
  let statSpy: jest.Mock;
  let readFileSpy: jest.Mock;

  const MOCK_SANDBOX_BASE = "/mock/sandbox";

  beforeAll(() => {
    listDirectoryHandler = fileSystemTool.listDirectoryHandler;
    readFileHandler = fileSystemTool.readFileHandler;
    if (!listDirectoryHandler || !readFileHandler) {
      throw new Error("Handlers not found in imported module");
    }
  });

  beforeEach(() => {
    resolvePathSpy = spyOn(
      fileSystemTool,
      "resolveSandboxPath"
    ).mockImplementation((relativePath: string) => {
      if (relativePath.includes("..")) throw new Error("Mock Access denied");
      if (relativePath.includes("\0")) throw new Error("Mock Invalid chars");
      return path.join(MOCK_SANDBOX_BASE, relativePath);
    });

    readdirSpy = spyOn(sourceFsPromises, "readdir");
    statSpy = spyOn(sourceFsPromises, "stat");
    readFileSpy = spyOn(sourceFsPromises, "readFile");
  });

  afterEach(() => {
    resolvePathSpy.mockRestore();
    readdirSpy.mockRestore();
    statSpy.mockRestore();
    readFileSpy.mockRestore();
  });

  describe("list_directory", () => {
    it("should list files and directories successfully", async () => {
      const mockDirents = [
        { name: "file1.txt", isFile: () => true, isDirectory: () => false },
        { name: "subdir", isFile: () => false, isDirectory: () => true },
        { name: "file2.log", isFile: () => true, isDirectory: () => false },
      ] as Dirent[];
      readdirSpy.mockResolvedValue(mockDirents);

      const result = await listDirectoryHandler!({ path: "test_dir" });

      expect(resolvePathSpy).toHaveBeenCalledWith("test_dir");
      expect(readdirSpy).toHaveBeenCalledWith(
        path.join(MOCK_SANDBOX_BASE, "test_dir"),
        { withFileTypes: true }
      );
      expect(result.content).toEqual({
        files: ["file1.txt", "file2.log"],
        directories: ["subdir"],
      });
      expect(result.metadata?.error).toBeUndefined();
    });

    it("should use the default path '.' when no path is provided", async () => {
      const mockDirents = [
        { name: "root_file.txt", isFile: () => true, isDirectory: () => false },
      ] as Dirent[];
      readdirSpy.mockResolvedValue(mockDirents);
      const result = await listDirectoryHandler!({});
      expect(resolvePathSpy).toHaveBeenCalledWith(".");
      expect(readdirSpy).toHaveBeenCalledWith(MOCK_SANDBOX_BASE, {
        withFileTypes: true,
      });
      expect(result.content).toEqual({
        files: ["root_file.txt"],
        directories: [],
      });
    });

    it("should return error from mocked resolveSandboxPath", async () => {
      resolvePathSpy.mockImplementation(() => {
        throw new Error("Mock Access denied");
      });
      const result = await listDirectoryHandler!({ path: "../outside" });
      expect(result.metadata?.error).toContain("Mock Access denied");
      expect(readdirSpy).not.toHaveBeenCalled();
    });

    it("should handle errors from fs.readdir", async () => {
      const fsError = new Error("FS Read Failed");
      readdirSpy.mockRejectedValue(fsError);
      const result = await listDirectoryHandler!({ path: "valid_dir" });
      expect(resolvePathSpy).toHaveBeenCalledWith("valid_dir");
      expect(readdirSpy).toHaveBeenCalledWith(
        path.join(MOCK_SANDBOX_BASE, "valid_dir"),
        { withFileTypes: true }
      );
      expect(result.content).toBeNull();
      expect(result.metadata?.error).toBe(fsError.message);
    });

    it("should handle Zod validation errors", async () => {
      const result = await listDirectoryHandler!({ path: 123 });
      expect(resolvePathSpy).not.toHaveBeenCalled();
      expect(readdirSpy).not.toHaveBeenCalled();
      expect(result.content).toBeNull();
      expect(result.metadata?.error).toContain(
        "Expected string, received number"
      );
    });
  });

  describe("read_file", () => {
    const MAX_READ_LENGTH = 10000;
    const MOCK_FILE_PATH = "my_file.txt";
    const MOCK_RESOLVED_PATH = path.join(MOCK_SANDBOX_BASE, MOCK_FILE_PATH);

    it("should read a file successfully", async () => {
      const mockContent = "File content.";
      const mockStats = {
        isFile: () => true,
        size: mockContent.length,
      } as Stats;
      statSpy.mockResolvedValue(mockStats);
      readFileSpy.mockResolvedValue(mockContent);

      const result = await readFileHandler!({ path: MOCK_FILE_PATH });

      expect(resolvePathSpy).toHaveBeenCalledWith(MOCK_FILE_PATH);
      expect(statSpy).toHaveBeenCalledWith(MOCK_RESOLVED_PATH);
      expect(readFileSpy).toHaveBeenCalledWith(MOCK_RESOLVED_PATH, {
        encoding: "utf8",
      });
      expect(result.content).toBe(mockContent);
      expect(result.metadata?.error).toBeUndefined();
    });

    it("should return error from mocked resolveSandboxPath", async () => {
      resolvePathSpy.mockImplementation(() => {
        throw new Error("Mock Invalid chars");
      });
      const result = await readFileHandler!({ path: "invalid\0file.txt" });
      expect(result.metadata?.error).toContain("Mock Invalid chars");
      expect(statSpy).not.toHaveBeenCalled();
      expect(readFileSpy).not.toHaveBeenCalled();
    });

    it("should handle errors from fs.stat (e.g., file not found)", async () => {
      const fsError = new Error("ENOENT Stat Failed");
      (fsError as any).code = "ENOENT";
      statSpy.mockRejectedValue(fsError);

      const result = await readFileHandler!({ path: MOCK_FILE_PATH });

      expect(resolvePathSpy).toHaveBeenCalledWith(MOCK_FILE_PATH);
      expect(statSpy).toHaveBeenCalledWith(MOCK_RESOLVED_PATH);
      expect(readFileSpy).not.toHaveBeenCalled();
      expect(result.content).toBeNull();
      expect(result.metadata?.error).toBe(fsError.message);
    });

    it("should handle trying to read a directory (isFile returns false)", async () => {
      const mockStats = { isFile: () => false, size: 0 } as Stats;
      statSpy.mockResolvedValue(mockStats);

      const result = await readFileHandler!({ path: "a_directory" });

      expect(resolvePathSpy).toHaveBeenCalledWith("a_directory");
      expect(statSpy).toHaveBeenCalledWith(
        path.join(MOCK_SANDBOX_BASE, "a_directory")
      );
      expect(readFileSpy).not.toHaveBeenCalled();
      expect(result.content).toBeNull();
      expect(result.metadata?.error).toContain("'a_directory' is not a file");
    });

    it("should handle files that are too large", async () => {
      const largeSize = MAX_READ_LENGTH * 2 + 1;
      const mockStats = { isFile: () => true, size: largeSize } as Stats;
      statSpy.mockResolvedValue(mockStats);

      const result = await readFileHandler!({ path: "large_file.bin" });

      expect(resolvePathSpy).toHaveBeenCalledWith("large_file.bin");
      expect(statSpy).toHaveBeenCalledWith(
        path.join(MOCK_SANDBOX_BASE, "large_file.bin")
      );
      expect(readFileSpy).not.toHaveBeenCalled();
      expect(result.content).toBeNull();
      expect(result.metadata?.error).toContain("File is too large to read");
    });

    it("should handle errors from fs.readFile", async () => {
      const mockStats = { isFile: () => true, size: 100 } as Stats;
      const fsError = new Error("FS Read Failed");
      statSpy.mockResolvedValue(mockStats);
      readFileSpy.mockRejectedValue(fsError);

      const result = await readFileHandler!({ path: MOCK_FILE_PATH });

      expect(resolvePathSpy).toHaveBeenCalledWith(MOCK_FILE_PATH);
      expect(statSpy).toHaveBeenCalledWith(MOCK_RESOLVED_PATH);
      expect(readFileSpy).toHaveBeenCalledWith(MOCK_RESOLVED_PATH, {
        encoding: "utf8",
      });
      expect(result.content).toBeNull();
      expect(result.metadata?.error).toBe(fsError.message);
    });

    it("should truncate long file content", async () => {
      const longContent = "a".repeat(MAX_READ_LENGTH + 50);
      const truncatedContent = "a".repeat(MAX_READ_LENGTH) + "... [truncated]";
      const mockStats = {
        isFile: () => true,
        size: longContent.length,
      } as Stats;
      statSpy.mockResolvedValue(mockStats);
      readFileSpy.mockResolvedValue(longContent);

      const result = await readFileHandler!({ path: "long_file.txt" });

      expect(resolvePathSpy).toHaveBeenCalledWith("long_file.txt");
      expect(statSpy).toHaveBeenCalledWith(
        path.join(MOCK_SANDBOX_BASE, "long_file.txt")
      );
      expect(readFileSpy).toHaveBeenCalledWith(
        path.join(MOCK_SANDBOX_BASE, "long_file.txt"),
        { encoding: "utf8" }
      );
      expect(result.content).toBe(truncatedContent);
      expect(result.metadata?.truncated).toBe(true);
    });

    it("should handle Zod validation errors (missing path)", async () => {
      const result = await readFileHandler!({});
      expect(resolvePathSpy).not.toHaveBeenCalled();
      expect(readFileSpy).not.toHaveBeenCalled();
      expect(result.content).toBeNull();
      expect(result.metadata?.error).toMatch(/^Invalid input: Required$/);
    });

    it("should handle Zod validation errors (non-string path)", async () => {
      const result = await readFileHandler!({ path: true });
      expect(resolvePathSpy).not.toHaveBeenCalled();
      expect(statSpy).not.toHaveBeenCalled();
      expect(readFileSpy).not.toHaveBeenCalled();
      expect(result.content).toBeNull();
      expect(result.metadata?.error).toContain(
        "Expected string, received boolean"
      );
    });
  });
});
