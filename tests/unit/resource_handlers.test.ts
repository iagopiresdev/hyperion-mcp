import { describe, expect, it } from "bun:test";
import {
  handleListResources,
  handleReadResource,
} from "../../src/handlers/resource_handlers";
import type {
  ListResourcesResponseResult,
  ReadResourceResponseResult,
} from "../../src/mcp/types";
import type {
  JsonRpcErrorResponse,
  JsonRpcSuccessResponse,
} from "../../src/types/json-rpc";

const VALID_TEXT_URI = "file:///home/user/docs/example.txt";
const VALID_JSON_URI = "config:///app/settings.json";
const VALID_IMAGE_URI = "image:///logo.png";
const INVALID_URI = "invalid://resource";

describe("Resource Handlers (Unit)", () => {
  describe("handleListResources", () => {
    it("should return a successful JSON-RPC response with a list of resources", async () => {
      const requestId = "list-test-1";
      const response = (await handleListResources(
        {},
        requestId
      )) as JsonRpcSuccessResponse<ListResourcesResponseResult>;

      expect(response.jsonrpc).toBe("2.0");
      expect(response.id).toBe(requestId);
      expect(response.result).toBeDefined();
      expect((response as any).error).toBeUndefined();

      expect(Array.isArray(response.result.resources)).toBe(true);
      expect(response.result.resources.length).toBeGreaterThan(0);

      // Check if known mock resources are present
      expect(
        response.result.resources.some((r) => r.uri === VALID_TEXT_URI)
      ).toBe(true);
      expect(
        response.result.resources.some((r) => r.uri === VALID_JSON_URI)
      ).toBe(true);
      expect(
        response.result.resources.some((r) => r.uri === VALID_IMAGE_URI)
      ).toBe(true);

      // Check structure of one resource
      const sampleResource = response.result.resources.find(
        (r) => r.uri === VALID_TEXT_URI
      );
      expect(sampleResource).toBeDefined();
      expect(sampleResource?.name).toBeString();
      expect(sampleResource?.mimeType).toBe("text/plain");
    });
  });

  describe("handleReadResource", () => {
    it("should return content for a valid text resource URI", async () => {
      const requestId = "read-text-test-1";
      const params = { uri: VALID_TEXT_URI };
      const response = (await handleReadResource(
        params,
        requestId
      )) as JsonRpcSuccessResponse<ReadResourceResponseResult>;

      expect(response.jsonrpc).toBe("2.0");
      expect(response.id).toBe(requestId);
      expect(response.result).toBeDefined();
      expect((response as any).error).toBeUndefined();

      expect(Array.isArray(response.result.contents)).toBe(true);
      expect(response.result.contents.length).toBe(1);

      const content = response.result.contents[0];
      expect(content.uri).toBe(VALID_TEXT_URI);
      expect(content.mimeType).toBe("text/plain");
      expect(content.text).toBeString();
      expect(content.text).toContain("example text document");
      expect(content.blob).toBeUndefined();
    });

    it("should return content for a valid JSON resource URI", async () => {
      const requestId = "read-json-test-1";
      const params = { uri: VALID_JSON_URI };
      const response = (await handleReadResource(
        params,
        requestId
      )) as JsonRpcSuccessResponse<ReadResourceResponseResult>;

      expect(response.jsonrpc).toBe("2.0");
      expect(response.id).toBe(requestId);
      expect(response.result).toBeDefined();
      expect((response as any).error).toBeUndefined();

      expect(response.result.contents.length).toBe(1);
      const content = response.result.contents[0];
      expect(content.uri).toBe(VALID_JSON_URI);
      expect(content.mimeType).toBe("application/json");
      expect(content.text).toBeString();
      expect(() => JSON.parse(content.text!)).not.toThrow(); // Check if it's valid JSON
      expect(content.blob).toBeUndefined();
    });

    it("should return content for a valid binary (image) resource URI", async () => {
      const requestId = "read-image-test-1";
      const params = { uri: VALID_IMAGE_URI };
      const response = (await handleReadResource(
        params,
        requestId
      )) as JsonRpcSuccessResponse<ReadResourceResponseResult>;

      expect(response.jsonrpc).toBe("2.0");
      expect(response.id).toBe(requestId);
      expect(response.result).toBeDefined();
      expect((response as any).error).toBeUndefined();

      expect(response.result.contents.length).toBe(1);
      const content = response.result.contents[0];
      expect(content.uri).toBe(VALID_IMAGE_URI);
      expect(content.mimeType).toBe("image/png");
      expect(content.blob).toBeString(); // Base64 blob
      expect(content.blob?.length).toBeGreaterThan(10); // Basic check it's not empty
      expect(content.text).toBeUndefined();
    });

    it("should return an error response for an invalid resource URI", async () => {
      const requestId = "read-invalid-test-1";
      const params = { uri: INVALID_URI };
      const response = (await handleReadResource(
        params,
        requestId
      )) as JsonRpcErrorResponse;

      expect(response.jsonrpc).toBe("2.0");
      expect(response.id).toBe(requestId);
      expect(response.error).toBeDefined();
      expect((response as any).result).toBeUndefined();

      expect(response.error.code).toBe(-32602);
      expect(response.error.message).toContain("Resource not found");
      expect(response.error.message).toContain(INVALID_URI);
    });

    // Note: Parameter validation (e.g., missing URI) is typically handled by the router/framework (Zod schema in index.ts)
    // before the handler is called, so it's not tested at this unit level.
  });
});
