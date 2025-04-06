import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  mock,
  type Mock,
} from "bun:test";
import { fetchWebpageHandler } from "../../../src/tools/connectors/webBrowser";

type MockFetchFn = (
  url: string | URL | Request,
  options?: RequestInit
) => Promise<Response>;
type MockFetch = Mock<MockFetchFn>;

const MAX_CONTENT_LENGTH = 5000; // Match constant in tool

describe("Web Browser Tool (Unit Tests)", () => {
  let mockFetch: MockFetch;
  let originalFetch: typeof fetch;

  beforeEach(() => {
    originalFetch = globalThis.fetch;
    mockFetch = mock<MockFetchFn>(async (url, options) => {
      return new Response("<html><body>Mock Content</body></html>", {
        status: 200,
        headers: { "Content-Type": "text/html" },
      });
    });
    globalThis.fetch = mockFetch as any;
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
    mockFetch.mockRestore();
  });

  describe("fetch_webpage", () => {
    it("should process text content successfully", async () => {
      const url = "https://example.com";
      const result = await fetchWebpageHandler({ url });
      expect(mockFetch).toHaveBeenCalledWith(url, expect.anything());
      expect(result.content).toBe("Mock Content");
      expect(result.metadata?.error).toBeUndefined();
      expect(result.metadata?.truncated).toBe(false);
    });

    it("should process html content successfully when requested", async () => {
      const url = "https://example.com/page.html";
      const htmlContent =
        "<html><head></head><body><h1>Title</h1><p>Paragraph.</p></body></html>";
      mockFetch.mockResolvedValueOnce(
        new Response(htmlContent, {
          status: 200,
          headers: { "Content-Type": "text/html" },
        })
      );

      const result = await fetchWebpageHandler({ url, output_format: "html" });
      expect(mockFetch).toHaveBeenCalledWith(url, expect.anything());
      expect(result.content).toBe(htmlContent);
      expect(result.metadata?.error).toBeUndefined();
      expect(result.metadata?.truncated).toBe(false);
    });

    it("should handle fetch returning HTTP error status", async () => {
      const url = "https://example.com/notfound";
      mockFetch.mockResolvedValueOnce(
        new Response("Not Found", {
          status: 404,
          statusText: "Not Found",
          headers: { "Content-Type": "text/plain" },
        })
      );

      const result = await fetchWebpageHandler({ url });
      expect(mockFetch).toHaveBeenCalledWith(url, expect.anything());
      expect(result.content).toBeNull();
      expect(result.metadata?.status).toBe(404);
      expect(result.metadata?.error).toBe("HTTP Error: Not Found");
    });

    it("should handle fetch throwing a network error", async () => {
      const url = "https://example.com/networkerror";
      const networkError = new Error("Network request failed");
      mockFetch.mockRejectedValueOnce(networkError);

      const result = await fetchWebpageHandler({ url });
      expect(mockFetch).toHaveBeenCalledWith(url, expect.anything());
      expect(result.content).toBeNull();
      expect(result.metadata?.status).toBe(500);
      expect(result.metadata?.error).toBe(
        `Network or processing error: ${networkError.message}`
      );
    });

    it("should handle unsupported content types", async () => {
      const url = "https://example.com/data.json";
      mockFetch.mockResolvedValueOnce(
        new Response(JSON.stringify({ data: 123 }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        })
      );

      const result = await fetchWebpageHandler({ url });
      expect(mockFetch).toHaveBeenCalledWith(url, expect.anything());
      expect(result.content).toBeNull();
      expect(result.metadata?.status).toBe(200);
      expect(result.metadata?.error).toBe(
        "Unsupported content type: application/json"
      );
    });

    it("should truncate long text content", async () => {
      const url = "https://example.com/longtext";
      const longContent = "a".repeat(MAX_CONTENT_LENGTH + 100);
      const truncatedContent =
        "a".repeat(MAX_CONTENT_LENGTH) + "... [truncated]";
      mockFetch.mockResolvedValueOnce(
        new Response(longContent, {
          status: 200,
          headers: { "Content-Type": "text/plain" },
        })
      );

      const result = await fetchWebpageHandler({ url, output_format: "text" });
      expect(mockFetch).toHaveBeenCalledWith(url, expect.anything());
      expect(result.content).toBe(truncatedContent);
      expect(result.metadata?.truncated).toBe(true);
      expect(result.metadata?.error).toBeUndefined();
    });

    it("should truncate long html content", async () => {
      const url = "https://example.com/longhtml";
      const longHtml = `<html><body>${"<p>text</p>".repeat(
        MAX_CONTENT_LENGTH / 10
      )}</body></html>`; // Ensure it exceeds limit
      const truncatedHtml =
        longHtml.substring(0, MAX_CONTENT_LENGTH) + "... [truncated]";
      mockFetch.mockResolvedValueOnce(
        new Response(longHtml, {
          status: 200,
          headers: { "Content-Type": "text/html" },
        })
      );

      const result = await fetchWebpageHandler({ url, output_format: "html" });
      expect(mockFetch).toHaveBeenCalledWith(url, expect.anything());
      expect(result.content).toBe(truncatedHtml);
      expect(result.metadata?.truncated).toBe(true);
      expect(result.metadata?.error).toBeUndefined();
    });

    it("should handle invalid URL format (zod schema)", async () => {
      const result = await fetchWebpageHandler({ url: "invalid-url" });
      expect(mockFetch).not.toHaveBeenCalled();
      expect(result.content).toBeNull();
      expect(result.metadata?.error).toContain(
        "Invalid URL format. Must include http:// or https://"
      );
    });

    it("should handle missing URL parameter", async () => {
      const result = await fetchWebpageHandler({});
      expect(mockFetch).not.toHaveBeenCalled();
      expect(result.content).toBeNull();
      expect(result.metadata?.error).toMatch(/^Invalid input: Required$/);
    });

    it("should handle invalid parameters (e.g., bad output_format)", async () => {
      const result = await fetchWebpageHandler({
        url: "https://example.com",
        output_format: "xml",
      });
      expect(mockFetch).not.toHaveBeenCalled();
      expect(result.content).toBeNull();
      expect(result.metadata?.error).toContain(
        "Invalid enum value. Expected 'text' | 'html', received 'xml'"
      );
    });
  });
});
