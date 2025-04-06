/**
 * MCP - Protocol Revision: 2025-03-26
 * https://spec.modelcontextprotocol.io/specification/2025-03-26/
 */
import type { PermissionLevel } from "../utils/auth";

export interface MCPTool {
  // The name of the tool, used when calling it
  name: string;

  // A description of what the tool does, shown to models
  description: string;

  // The parameters that the tool accepts
  parameters: {
    // Each tool uses a JSON schema to define its parameters
    type: "object";
    properties: Record<
      string,
      {
        type: string;
        description: string;
        // Additional properties like enum, format, etc.
        [key: string]: any;
      }
    >;
    required?: string[];
  };

  // Optional metadata object for custom fields
  metadata?: {
    permissionLevel?: PermissionLevel;
    category?: string;
    tags?: string[];
    // Allow other custom metadata
    [key: string]: any;
  };
}

/**
 * MCP Tool Request
 * The format of a tool call request from an MCP client
 */
export interface MCPToolRequest {
  name: string;
  parameters: Record<string, any>;
  stream?: boolean;
}

/**
 * MCP Tool Response
 * The format of a tool call response from an MCP server
 */
export interface MCPToolResponse {
  // The tool call response content
  content: any;

  // Optional metadata about the response
  metadata?: Record<string, any>;
}

/**
 * MCP Resource Definition
 * Describes a resource type that an MCP server can expose
 */
export interface MCPResource {
  name: string;
  description: string;
  // Additional properties specific to resources
}

/**
 * MCP Server Info
 * Information about an MCP server for discovery
 */
export interface MCPServerInfo {
  name: string;
  version: string;
  description: string;
  tools: MCPTool[];
  resources?: MCPResource[];
  // Additional fields
  vendor?: string;
  contact?: string;
  specs?: {
    mcp: string;
    [key: string]: string;
  };
}

/**
 * Tool Handler Function
 * Function signature for tool implementation handlers
 */
export type ToolHandler = (
  parameters: Record<string, any>
) => Promise<MCPToolResponse>;

/**
 * Tool Registration Options
 * Configuration options when registering a new tool
 */
export interface ToolRegistrationOptions {
  name: string;
  description: string;
  parameters: {
    type: "object";
    properties: Record<
      string,
      {
        type: string;
        description: string;
        [key: string]: any;
      }
    >;
    required?: string[];
  };
  handler: ToolHandler;
  permissionLevel?: PermissionLevel;
  tags?: string[];
  category?: string;
  enabled?: boolean;
}

/**
 * Tool Registry
 * Interface for a registry that manages tool registrations
 */
export interface ToolRegistry {
  register(options: ToolRegistrationOptions): void;
  unregister(name: string): boolean;
  getToolHandler(name: string): ToolHandler | undefined;
  getToolDefinition(name: string): MCPTool | undefined;
  getAllTools(): MCPTool[];
  isToolRegistered(name: string): boolean;
}
