// Types for the Hyperion MCP Client SDK

/**
 * Configuration options for the HyperionClient.
 */
export interface HyperionClientOptions {
  /** The base URL of the Hyperion MCP server. */
  baseUrl: string;
  /** Optional API key for authentication. */
  apiKey?: string;
  /** Optional fetch implementation to use. Defaults to global fetch. */
  fetch?: typeof fetch;
}

/**
 * Represents a tool available on the server.
 * Aligned with MCPTool definition from the server.
 */
export interface ToolDefinition {
  /** The name of the tool, used when calling it */
  name: string;
  /** A description of what the tool does, shown to models */
  description: string;
  /** The parameters that the tool accepts (JSON Schema) */
  parameters: {
    type: "object";
    properties: Record<
      string,
      {
        type: string;
        description: string;
        [key: string]: any; // Additional schema properties like enum, default, etc.
      }
    >;
    required?: string[];
  };
  /** The permission level required to use this tool */
  permissionLevel?: string; // Assuming string for now ('public', 'protected', 'admin')
  /** Optional category for grouping tools */
  category?: string;
  /** Optional tags for classifying tools */
  tags?: string[];
}

/**
 * Represents the response from executing a non-streaming tool.
 * Aligned with MCPToolResponse definition from the server.
 */
export interface ToolExecutionResponse {
  /** The tool call response content */
  content: any;
  /** Optional metadata about the response */
  metadata?: Record<string, any>;
}

/**
 * Represents a single chunk received during a streaming tool execution.
 * It will typically be either a partial/final content chunk or an error chunk,
 * based on the structure sent by the server's StreamingToolResponse utility.
 */
export type StreamingChunk =
  | {
      /** The main content of this chunk (can be partial or final). */
      content: any;
      /** Metadata associated with this chunk. */
      metadata: {
        /** Indicates if this is a partial chunk (true) or the final one (false). */
        partial: boolean;
        /** Indicates if this is the final chunk of the stream (true on completion or error). */
        final: boolean;
        /** Timestamp of when the chunk was generated. */
        timestamp: string;
        /** Other tool-specific or server-defined metadata. */
        [key: string]: any;
      };
      error?: never; // Ensure error field is not present in content chunks
    }
  | {
      /** An error message if the stream encountered an error. */
      error: string;
      /** Metadata associated with the error chunk. */
      metadata: {
        /** Always false for error chunks. */
        partial: false;
        /** Always true for error chunks. */
        final: true;
        /** Timestamp of when the error occurred. */
        timestamp: string;
        /** Other potential error-related metadata. */
        [key: string]: any;
      };
      content?: never; // Ensure content field is not present in error chunks
    };
