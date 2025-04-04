import type { MCPToolResponse } from "../types/mcp";
import { InMemoryToolRegistry } from "./toolRegistry";

// Create a global shared instance of the tool registry
export const toolRegistry = new InMemoryToolRegistry();

// Re-export the tool registry implementation
export { InMemoryToolRegistry } from "./toolRegistry";

// Convenience function to register a tool
export function registerTool(
  name: string,
  description: string,
  parameters: any,
  handler: (params: Record<string, any>) => Promise<MCPToolResponse>,
  options?: {
    tags?: string[];
    category?: string;
    enabled?: boolean;
  }
) {
  toolRegistry.register({
    name,
    description,
    parameters,
    handler,
    ...options,
  });
}

// Convenience function to execute a tool by name
export async function executeTool(
  name: string,
  parameters: Record<string, any>,
  streamController?: TransformStreamDefaultController
): Promise<MCPToolResponse> {
  const handler = toolRegistry.getToolHandler(name);
  if (!handler) {
    throw new Error(`Tool '${name}' not found or disabled`);
  }

  // If streamController is provided, we need to pass it to the handler
  if (streamController) {
    // Handle a streaming-capable function (with expanded signature)
    if ((handler as any).length > 1) {
      return (handler as any)(parameters, streamController);
    }

    // For non-streaming handlers, we'll wrap the result manually
    const encoder = new TextEncoder();

    try {
      const result = await handler(parameters);
      streamController.enqueue(encoder.encode(JSON.stringify(result)));
      streamController.terminate();
      return result;
    } catch (error) {
      streamController.enqueue(
        encoder.encode(
          JSON.stringify({
            error: `Error executing tool: ${(error as Error).message}`,
            metadata: {
              timestamp: new Date().toISOString(),
            },
          })
        )
      );
      streamController.terminate();
      throw error;
    }
  }

  // Standard non-streaming execution
  return handler(parameters);
}
