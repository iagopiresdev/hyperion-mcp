import { z } from "zod";
import type {
  JsonRpcErrorResponse,
  JsonRpcId,
  JsonRpcResponse,
} from "../types/json-rpc";

/**
 * Represents a discoverable resource provided by an MCP server.
 * Based on: https://spec.modelcontextprotocol.io/specification/latest/feature/resources/
 */
export interface McpResource {
  uri: string; // Unique identifier for the resource (e.g., file:///path/to/file)
  name: string; // Human-readable name (e.g., "My Document")
  description?: string; // Optional description
  mimeType?: string; // Optional MIME type (e.g., "text/plain", "application/pdf")
}

/**
 * Represents the content of a resource read via MCP.
 * Based on: https://spec.modelcontextprotocol.io/specification/latest/feature/resources/
 */
export interface McpResourceContent {
  uri: string; // The URI of the resource this content belongs to
  mimeType?: string; // Optional MIME type

  // Exactly one of the following should be present:
  text?: string; // For text resources (UTF-8 encoded)
  blob?: string; // For binary resources (base64 encoded)
}

// --- Request/Response Structures for Resource Methods ---

// resources/list
export const ListResourcesRequestSchema = z.object({
  // No parameters expected for list request
});
export type ListResourcesRequestParams = z.infer<
  typeof ListResourcesRequestSchema
>;

export interface ListResourcesResponseResult {
  resources: McpResource[];
  // TODO: Add support for resourceTemplates if needed later
  // resourceTemplates?: McpResourceTemplate[];
}
export type ListResourcesResponse =
  JsonRpcResponse<ListResourcesResponseResult>;

// resources/read
export const ReadResourceRequestSchema = z.object({
  uri: z.string().url(), // Validate that the uri is a string (basic validation)
});
export type ReadResourceRequestParams = z.infer<
  typeof ReadResourceRequestSchema
>;

export interface ReadResourceResponseResult {
  contents: McpResourceContent[];
}
export type ReadResourceResponse = JsonRpcResponse<ReadResourceResponseResult>;

// --- General MCP Capability Type ---
// Placeholder - This will likely expand
export interface McpCapabilities {
  resources?: Record<string, unknown>; // Presence indicates support, value could hold options
  tools?: Record<string, unknown>; // Existing capability
  // prompts?: Record<string, unknown>; // Future capability
}

//TODO: Refactor to use JSON Schema types
export type McpHandler<ParamsSchema extends z.ZodTypeAny, Result> = (
  params: z.infer<ParamsSchema>,
  requestId: JsonRpcId
) => Promise<JsonRpcResponse<Result> | JsonRpcErrorResponse>;

//TODO: Refactor to use JSON Schema types
export interface McpTool {
  name: string;
  description: string;
  inputSchema: Record<string, any>; //FIXME: Stricter JSON Schema type
  metadata?: Record<string, any>;
}

//TODO: Add other types as needed
export interface McpToolResultContent {
  type: "text" | "image" | "embedded_resource";
  text?: string;
}

export interface McpToolResult {
  content: McpToolResultContent[];
  isError?: boolean;
  metadata?: Record<string, any>;
}
