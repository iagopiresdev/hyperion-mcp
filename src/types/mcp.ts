// https://modelcontextprotocol.io/quickstart/server

/**
 * MCP Tool Definition
 * Describes a tool capability that an MCP server provides
 */
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
}

/**
 * MCP Tool Request
 * The format of a tool call request from an MCP client
 */
export interface MCPToolRequest {
  name: string;
  parameters: Record<string, any>;
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
}
