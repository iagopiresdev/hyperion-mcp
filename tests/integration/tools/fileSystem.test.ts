import { afterAll, beforeAll, describe, expect, it } from "bun:test";
import fs from "fs/promises";
import os from "os";
import path from "path";
import {
  listDirectoryHandler,
  readFileHandler,
} from "../../../src/tools/connectors/fileSystem";
import { config } from "../../../src/utils/config";

let originalBasePath: string;
let tempDir: string;

describe("File System Tool (Integration Tests)", () => {
  beforeAll(async () => {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "hyperion-fs-test-"));

    originalBasePath = config.fsTool.basePath;
    config.fsTool.basePath = tempDir;

    await fs.mkdir(path.join(tempDir, "subdir1"));
    await fs.writeFile(
      path.join(tempDir, "root_file.txt"),
      "Root file content."
    );
    await fs.writeFile(
      path.join(tempDir, "subdir1", "nested_file.log"),
      "Log data\nMore log data"
    );
    await fs.writeFile(
      path.join(tempDir, "large_file.bin"),
      "a".repeat(15000) // Larger than MAX_READ_LENGTH
    );
    await fs.mkdir(path.join(tempDir, "empty_subdir"));

    console.log(`Created temp dir for FS integration tests: ${tempDir}`);
  });

  afterAll(async () => {
    config.fsTool.basePath = originalBasePath;
    if (tempDir) {
      await fs.rm(tempDir, { recursive: true, force: true });
      console.log(`Removed temp dir: ${tempDir}`);
    }
  });

  describe("list_directory", () => {
    it("should list contents of the root directory", async () => {
      const result = await listDirectoryHandler({});
      expect(result.metadata?.error).toBeUndefined();
      expect(result.content).toBeDefined();
      expect(result.content.files).toEqual(
        expect.arrayContaining(["root_file.txt", "large_file.bin"])
      );
      expect(result.content.directories).toEqual(
        expect.arrayContaining(["subdir1", "empty_subdir"])
      );
      expect(result.content.files.length).toBe(2);
      expect(result.content.directories.length).toBe(2);
    });

    it("should list contents of a subdirectory", async () => {
      const result = await listDirectoryHandler({ path: "subdir1" });
      expect(result.metadata?.error).toBeUndefined();
      expect(result.content).toBeDefined();
      expect(result.content.files).toEqual(["nested_file.log"]);
      expect(result.content.directories).toEqual([]);
    });

    it("should list contents of an empty subdirectory", async () => {
      const result = await listDirectoryHandler({ path: "empty_subdir" });
      expect(result.metadata?.error).toBeUndefined();
      expect(result.content).toBeDefined();
      expect(result.content.files).toEqual([]);
      expect(result.content.directories).toEqual([]);
    });

    it("should return error for non-existent directory", async () => {
      const result = await listDirectoryHandler({ path: "non_existent_dir" });
      expect(result.content).toBeNull();
      expect(result.metadata?.error).toBe("No such file or directory");
    });

    it("should return error for path traversal attempt", async () => {
      const result = await listDirectoryHandler({ path: "../outside" });
      expect(result.content).toBeNull();
      expect(result.metadata?.error).toContain("Access denied");
    });

    it("should return error for path pointing to a file", async () => {
      const result = await listDirectoryHandler({ path: "root_file.txt" });
      expect(result.content).toBeNull();
      expect(result.metadata?.error).toBe("Not a directory");
    });
  });

  describe("read_file", () => {
    const MAX_READ_LENGTH = 10000; // Match constant in tool

    it("should read a file in the root directory", async () => {
      const result = await readFileHandler({ path: "root_file.txt" });
      expect(result.metadata?.error).toBeUndefined();
      expect(result.content).toBe("Root file content.");
      expect(result.metadata?.truncated).toBe(false);
    });

    it("should read a nested file", async () => {
      const result = await readFileHandler({ path: "subdir1/nested_file.log" });
      expect(result.metadata?.error).toBeUndefined();
      expect(result.content).toBe("Log data\nMore log data");
      expect(result.metadata?.truncated).toBe(false);
    });

    it("should return error for non-existent file", async () => {
      const result = await readFileHandler({ path: "not_a_real_file.txt" });
      expect(result.content).toBeNull();
      expect(result.metadata?.error).toBe("No such file or directory");
    });

    it("should return error when trying to read a directory", async () => {
      const result = await readFileHandler({ path: "subdir1" });
      expect(result.content).toBeNull();
      expect(result.metadata?.error).toContain("'subdir1' is not a file");
    });

    it("should return error for path traversal attempt", async () => {
      const result = await readFileHandler({ path: "../outside_file" });
      expect(result.content).toBeNull();
      expect(result.metadata?.error).toContain("Access denied");
    });

    it("should read and truncate a large file", async () => {
      const result = await readFileHandler({ path: "large_file.bin" });
      const expectedTruncatedContent =
        "a".repeat(MAX_READ_LENGTH) + "... [truncated]";
      expect(result.metadata?.error).toBeUndefined();
      expect(result.content).toBe(expectedTruncatedContent);
      expect(result.metadata?.truncated).toBe(true);
      expect(result.metadata?.originalLength).toBe(15000);
    });

    it("should return validation error for missing path", async () => {
      const result = await readFileHandler({});
      expect(result.content).toBeNull();
      expect(result.metadata?.error).toMatch(/^Invalid input: Required$/);
    });
  });
});
