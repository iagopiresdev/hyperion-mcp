import type {
  MCPTool,
  ToolHandler,
  ToolRegistrationOptions,
  ToolRegistry,
} from "../types/mcp";
import type { PermissionLevel } from "../utils/auth";

/**
 * In-memory implementation of the ToolRegistry interface
 * Provides a central registry for tools that can be dynamically registered and used
 */
export class InMemoryToolRegistry implements ToolRegistry {
  private tools: Map<string, ToolRegistrationOptions & { enabled: boolean }> =
    new Map();

  /**
   * Register a new tool with the registry
   * @param options The tool configuration and handler
   */
  register(options: ToolRegistrationOptions): void {
    if (this.tools.has(options.name)) {
      throw new Error(`Tool with name '${options.name}' is already registered`);
    }

    const registrationOptions = {
      ...options,
      enabled: options.enabled !== false,
      permissionLevel: options.permissionLevel || "public",
    };

    this.tools.set(options.name, registrationOptions);
  }

  /**
   * Unregister a tool from the registry
   * @param name The name of the tool to unregister
   * @returns true if the tool was unregistered, false if it wasn't found
   */
  unregister(name: string): boolean {
    return this.tools.delete(name);
  }

  /**
   * Get the handler function for a specific tool
   * @param name The name of the tool
   * @returns The handler function or undefined if the tool is not found
   */
  getToolHandler(name: string): ToolHandler | undefined {
    const tool = this.tools.get(name);
    return tool?.enabled ? tool.handler : undefined;
  }

  /**
   * Get the tool definition for a specific tool
   * @param name The name of the tool
   * @returns The tool definition or undefined if the tool is not found
   */
  getToolDefinition(name: string): MCPTool | undefined {
    const tool = this.tools.get(name);
    if (!tool || !tool.enabled) {
      return undefined;
    }

    return {
      name: tool.name,
      description: tool.description,
      parameters: tool.parameters,
      permissionLevel: tool.permissionLevel || "public",
      category: tool.category,
      tags: tool.tags,
    };
  }

  /**
   * Get all registered and enabled tools
   * @returns Array of tool definitions
   */
  getAllTools(): MCPTool[] {
    const result: MCPTool[] = [];

    for (const [_, tool] of this.tools.entries()) {
      if (tool.enabled) {
        result.push({
          name: tool.name,
          description: tool.description,
          parameters: tool.parameters,
          permissionLevel: tool.permissionLevel || "public",
          category: tool.category,
          tags: tool.tags,
        });
      }
    }

    return result;
  }

  /**
   * Get all registered and enabled tools with the specified permission level
   * @param permissionLevel The permission level to filter by
   * @returns Array of tool definitions for the specified permission level
   */
  getToolsByPermission(permissionLevel: PermissionLevel): MCPTool[] {
    const result: MCPTool[] = [];

    for (const [_, tool] of this.tools.entries()) {
      if (
        tool.enabled &&
        (tool.permissionLevel || "public") === permissionLevel
      ) {
        result.push({
          name: tool.name,
          description: tool.description,
          parameters: tool.parameters,
          permissionLevel: tool.permissionLevel || "public",
          category: tool.category,
          tags: tool.tags,
        });
      }
    }

    return result;
  }

  /**
   * Check if a tool is registered
   * @param name The name of the tool
   * @returns true if the tool is registered, false otherwise
   */
  isToolRegistered(name: string): boolean {
    const tool = this.tools.get(name);
    return !!tool && tool.enabled;
  }

  /**
   * Enable a tool
   * @param name The name of the tool to enable
   * @returns true if the tool was enabled, false if it wasn't found
   */
  enableTool(name: string): boolean {
    const tool = this.tools.get(name);
    if (!tool) {
      return false;
    }

    tool.enabled = true;
    this.tools.set(name, tool);
    return true;
  }

  /**
   * Disable a tool
   * @param name The name of the tool to disable
   * @returns true if the tool was disabled, false if it wasn't found
   */
  disableTool(name: string): boolean {
    const tool = this.tools.get(name);
    if (!tool) {
      return false;
    }

    tool.enabled = false;
    this.tools.set(name, tool);
    return true;
  }

  /**
   * Get tools by category
   * @param category The category to filter by
   * @returns Array of tool definitions in the specified category
   */
  getToolsByCategory(category: string): MCPTool[] {
    const result: MCPTool[] = [];

    for (const [_, tool] of this.tools.entries()) {
      if (tool.enabled && tool.category === category) {
        result.push({
          name: tool.name,
          description: tool.description,
          parameters: tool.parameters,
          permissionLevel: tool.permissionLevel || "public",
          category: tool.category,
          tags: tool.tags,
        });
      }
    }

    return result;
  }

  /**
   * Get tools by tag
   * @param tag The tag to filter by
   * @returns Array of tool definitions with the specified tag
   */
  getToolsByTag(tag: string): MCPTool[] {
    const result: MCPTool[] = [];

    for (const [_, tool] of this.tools.entries()) {
      if (tool.enabled && tool.tags?.includes(tag)) {
        result.push({
          name: tool.name,
          description: tool.description,
          parameters: tool.parameters,
          permissionLevel: tool.permissionLevel || "public",
          category: tool.category,
          tags: tool.tags,
        });
      }
    }

    return result;
  }
}
