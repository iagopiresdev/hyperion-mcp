import { beforeAll, beforeEach, describe, expect, mock, test } from "bun:test";
import type { ToolHandler } from "../../../src/types/mcp";
// Assume logger is imported and used internally in the webBrowser tool
import { logger as appLogger } from "../../../src/utils/logger";

// Mock dependencies
// Mock global fetch using Bun's mock function
const mockFetch = mock(global.fetch);
global.fetch = mockFetch as any; // Use type assertion to bypass potential static property mismatch

// Mock logger (similar approach to fileSystem test)
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

// Import the module *after* mocking fetch and potentially logger
import { toolRegistry } from "../../../src/registry";
import "../../../src/tools/connectors/webBrowser"; // This registers the tool

describe("Web Browser Tool (Bun)", () => {
  let fetchWebpageHandler: ToolHandler | undefined;

  beforeAll(() => {
    fetchWebpageHandler = toolRegistry.getToolHandler("fetch_webpage");

    // Override logger if needed (difficult without DI)
    Object.assign(appLogger, mockLogger); // Shallow assign top-level methods

    if (!fetchWebpageHandler) {
      throw new Error(
        "fetch_webpage handler not found in registry. Check tool registration."
      );
    }
  });

  beforeEach(() => {
    // Reset mocks before each test
    mockFetch.mockClear();
    // Reset logger mocks
    mockLogger.child.mockClear();
    mockLogger.info.mockClear();
    mockLogger.warn.mockClear();
    mockLogger.error.mockClear();
    mockLoggerChild.info.mockClear();
    mockLoggerChild.warn.mockClear();
    mockLoggerChild.error.mockClear();
  });

  describe("fetch_webpage", () => {
    const MOCK_URL = "https://example.com/page";
    const MAX_CONTENT_LENGTH = 5000; // Match constant in source

    // Helper to create mock Response objects (compatible with fetch)
    const mockResponse = (
      status: number,
      body: string | null,
      contentType: string | null,
      statusText: string = "OK"
    ): Response => {
      // Return Response directly
      const headers = new Headers();
      if (contentType) {
        headers.set("content-type", contentType);
      }
      const response = new Response(body, { status, statusText, headers });
      // Manually set ok status as Response constructor doesn't always do it based on status
      Object.defineProperty(response, "ok", {
        value: status >= 200 && status < 300,
      });
      return response; // Return the Response object
    };

    test("should fetch webpage content as text successfully", async () => {
      const htmlContent =
        "<html><head><title>Test</title></head><body><p>Hello</p><script>alert('bad')</script></body></html>";
      const textContent = "Test Hello"; // Simplified stripped text (script tags removed)
      mockFetch.mockResolvedValue(mockResponse(200, htmlContent, "text/html"));

      const result = await fetchWebpageHandler!({
        url: MOCK_URL,
        output_format: "text",
      });

      expect(result.content).toBe(textContent);
      expect(result.metadata?.error).toBeUndefined();
      expect(result.metadata?.url).toBe(MOCK_URL);
      expect(result.metadata?.status).toBe(200);
      expect(result.metadata?.contentType).toBe("text/html");
      expect(result.metadata?.truncated).toBe(false);
      expect(mockFetch).toHaveBeenCalledTimes(1);
      // Use expect.any(Object) for headers/options if not testing specifics
      expect(mockFetch).toHaveBeenCalledWith(MOCK_URL, expect.any(Object));
    });

    test("should fetch webpage content as HTML successfully", async () => {
      const htmlContent = "<html><body>Content</body></html>";
      mockFetch.mockResolvedValue(mockResponse(200, htmlContent, "text/html"));

      const result = await fetchWebpageHandler!({
        url: MOCK_URL,
        output_format: "html",
      });

      expect(result.content).toBe(htmlContent);
      expect(result.metadata?.error).toBeUndefined();
      expect(result.metadata?.url).toBe(MOCK_URL);
      expect(result.metadata?.status).toBe(200);
      expect(mockFetch).toHaveBeenCalledTimes(1);
    });

    test("should default to text output format", async () => {
      const htmlContent = "<html><body>Default Text Test</body></html>";
      const textContent = "Default Text Test";
      mockFetch.mockResolvedValue(mockResponse(200, htmlContent, "text/html"));

      const result = await fetchWebpageHandler!({ url: MOCK_URL }); // No format specified

      expect(result.content).toBe(textContent);
      expect(result.metadata?.error).toBeUndefined();
      expect(result.metadata?.output_format).toBeUndefined(); // Check param wasn't added
      expect(mockFetch).toHaveBeenCalledTimes(1);
    });

    test("should truncate long text content", async () => {
      const longHtml = `<html><body>${"a".repeat(
        MAX_CONTENT_LENGTH + 100
      )}</body></html>`;
      // Text stripping happens *before* truncation check in the code
      const longText = "a".repeat(MAX_CONTENT_LENGTH + 100);
      const truncatedText =
        longText.substring(0, MAX_CONTENT_LENGTH) + "... [truncated]";
      mockFetch.mockResolvedValue(mockResponse(200, longHtml, "text/html"));

      const result = await fetchWebpageHandler!({
        url: MOCK_URL,
        output_format: "text",
      });

      expect(result.content).toBe(truncatedText);
      expect(result.metadata?.truncated).toBe(true);
      expect(result.metadata?.contentLength).toBeGreaterThan(
        MAX_CONTENT_LENGTH
      );
      expect(result.metadata?.error).toBeUndefined();
    });

    test("should truncate long HTML content", async () => {
      const longHtml = `<html><body>${"b".repeat(
        MAX_CONTENT_LENGTH + 50
      )}</body></html>`;
      const truncatedHtml =
        longHtml.substring(0, MAX_CONTENT_LENGTH) + "... [truncated]";
      mockFetch.mockResolvedValue(mockResponse(200, longHtml, "text/html"));

      const result = await fetchWebpageHandler!({
        url: MOCK_URL,
        output_format: "html",
      });

      expect(result.content).toBe(truncatedHtml);
      expect(result.metadata?.truncated).toBe(true);
      expect(result.metadata?.contentLength).toBe(longHtml.length);
      expect(result.metadata?.error).toBeUndefined();
    });

    test("should handle non-OK HTTP responses", async () => {
      mockFetch.mockResolvedValue(
        mockResponse(404, "Not Found", "text/plain", "Not Found")
      );

      const result = await fetchWebpageHandler!({ url: MOCK_URL });

      expect(result.content).toBeNull();
      expect(result.metadata?.error).toBe("HTTP Error: Not Found");
      expect(result.metadata?.status).toBe(404);
      expect(mockFetch).toHaveBeenCalledTimes(1);
    });

    test("should handle unsupported content types", async () => {
      mockFetch.mockResolvedValue(
        mockResponse(200, "binary data", "application/octet-stream")
      );

      const result = await fetchWebpageHandler!({ url: MOCK_URL });

      expect(result.content).toBeNull();
      expect(result.metadata?.error).toBe(
        "Unsupported content type: application/octet-stream"
      );
      expect(result.metadata?.status).toBe(200);
      expect(mockFetch).toHaveBeenCalledTimes(1);
    });

    test("should handle network errors during fetch", async () => {
      const error = new Error("Network connection refused");
      mockFetch.mockRejectedValue(error);

      const result = await fetchWebpageHandler!({ url: MOCK_URL });

      expect(result.content).toBeNull();
      expect(result.metadata?.error).toBe(
        `Network or processing error: ${error.message}`
      );
      expect(result.metadata?.status).toBe(500);
      expect(mockFetch).toHaveBeenCalledTimes(1);
    });

    test("should handle invalid URL format (zod schema)", async () => {
      const result = await fetchWebpageHandler!({ url: "not-a-valid-url" });

      expect(result.content).toBeNull();
      expect(result.metadata?.error).toContain(
        "Invalid input: Invalid URL format. Must include http:// or https://"
      );
      expect(mockFetch).not.toHaveBeenCalled();
    });

    test("should handle missing URL parameter", async () => {
      const result = await fetchWebpageHandler!({}); // Missing URL

      expect(result.content).toBeNull();
      expect(result.metadata?.error).toContain("Invalid input: Required"); // Zod error for required field
      expect(mockFetch).not.toHaveBeenCalled();
    });

    test("should handle invalid parameters (e.g., bad output_format)", async () => {
      const result = await fetchWebpageHandler!({
        url: MOCK_URL,
        output_format: "xml",
      }); // Invalid enum value

      expect(result.content).toBeNull();
      // Zod error message might vary slightly, but check for key parts
      expect(result.metadata?.error).toMatch(
        /Invalid input: Invalid enum value.*'text'.*'html'/
      );
      expect(mockFetch).not.toHaveBeenCalled();
    });
  });
});
