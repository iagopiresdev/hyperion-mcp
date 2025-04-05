import type { MCPToolResponse } from "../types/mcp";
import { InMemoryToolRegistry } from "./toolRegistry";

// Creates a global shared instance of the tool registry
export const toolRegistry = new InMemoryToolRegistry();
export { InMemoryToolRegistry } from "./toolRegistry";

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
