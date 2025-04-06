import { describe, expect, it } from "bun:test";
import { fetchWebpageHandler } from "../../../src/tools/connectors/webBrowser";

// Use httpbin.org for reliable test endpoints
const HTTPBIN_BASE = "https://httpbin.org";

describe("Web Browser Tool (Integration Tests)", () => {
  const testTimeout = 15000;

  describe("fetch_webpage", () => {
    it(
      "should fetch and return plain text content by default",
      async () => {
        const url = `${HTTPBIN_BASE}/html`;
        const result = await fetchWebpageHandler({ url });

        expect(result.metadata?.error).toBeUndefined();
        expect(result.metadata?.status).toBe(200);
        expect(result.metadata?.contentType).toContain("text/html");
        expect(result.content).toBeDefined();
        expect(result.content).toContain("Availing himself of the mild");
        expect(result.content).not.toContain("<html");
        expect(result.metadata?.truncated).toBe(false);
      },
      testTimeout
    );

    it(
      "should fetch and return full HTML content when requested",
      async () => {
        const url = `${HTTPBIN_BASE}/html`;
        const result = await fetchWebpageHandler({
          url,
          output_format: "html",
        });

        expect(result.metadata?.error).toBeUndefined();
        expect(result.metadata?.status).toBe(200);
        expect(result.metadata?.contentType).toContain("text/html");
        expect(result.content).toBeDefined();
        expect(result.content).toMatch(/^(<!DOCTYPE html>)?\s*<html/i);
        expect(result.content).toContain(
          "<h1>Herman Melville - Moby-Dick</h1>"
        );
        expect(result.metadata?.truncated).toBe(false);
      },
      testTimeout
    );

    it(
      "should handle HTTP 404 Not Found error",
      async () => {
        const url = `${HTTPBIN_BASE}/status/404`;
        const result = await fetchWebpageHandler({ url });

        expect(result.content).toBeNull();
        expect(result.metadata?.status).toBe(404);
        expect(result.metadata?.error).toMatch(
          /HTTP Error: (NOT FOUND|Not Found)/
        );
      },
      testTimeout
    );

    it(
      "should handle other HTTP errors (e.g., 500)",
      async () => {
        const url = `${HTTPBIN_BASE}/status/500`;
        const result = await fetchWebpageHandler({ url });

        expect(result.content).toBeNull();
        expect(result.metadata?.status).toBe(500);
        expect(result.metadata?.error).toMatch(
          /HTTP Error: (INTERNAL SERVER ERROR|Internal Server Error)/
        );
      },
      testTimeout
    );

    it(
      "should handle redirects",
      async () => {
        // This endpoint redirects to /html
        const url = `${HTTPBIN_BASE}/redirect-to?url=${encodeURIComponent(
          "/html"
        )}`;
        const result = await fetchWebpageHandler({ url });

        expect(result.metadata?.error).toBeUndefined();
        expect(result.metadata?.status).toBe(200);
        expect(result.metadata?.contentType).toContain("text/html");
        expect(result.content).toContain("Availing himself of the mild");
      },
      testTimeout
    );

    it(
      "should return network error for invalid domain",
      async () => {
        const url = `https://non-existent-domain-dfgsdfg.invalid`;
        const result = await fetchWebpageHandler({ url });

        expect(result.content).toBeNull();
        expect(result.metadata?.status).toBe(500);
        expect(result.metadata?.error).toContain("Network or processing error");
        expect(result.metadata?.error).toMatch(
          /(ENOTFOUND|EAI_AGAIN|FETCH_ERROR|Unable to connect)/i
        );
      },
      testTimeout
    );

    // FIXME: We trust the unit test for this functionality.
    it("should return validation error for missing URL", async () => {
      const result = await fetchWebpageHandler({});
      expect(result.content).toBeNull();
      expect(result.metadata?.error).toMatch(/^Invalid input: Required$/);
    });

    it("should return validation or network error for invalid URL format", async () => {
      const result = await fetchWebpageHandler({ url: "htp:/invalid" });
      expect(result.content).toBeNull();
      expect(result.metadata?.error).toMatch(
        /(Invalid URL format|Network or processing error)/i
      );
    });
  });
});
