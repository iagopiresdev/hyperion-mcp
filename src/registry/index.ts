import { z } from "zod";
import type { MCPToolResponse } from "../types/mcp";
import type { PermissionLevel } from "../utils/auth";
import { config } from "../utils/config";
import { logger } from "../utils/logger";
import { InMemoryToolRegistry } from "./toolRegistry";

// Creates a global shared instance of the tool registry
export const toolRegistry = new InMemoryToolRegistry();
export { InMemoryToolRegistry } from "./toolRegistry";

const registryLogger = logger.child({ component: "tool-registry" });

export function registerTool(
  name: string,
  description: string,
  parameters: any,
  handler: (params: Record<string, any>) => Promise<MCPToolResponse>,
  permissionLevel?: PermissionLevel,
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
    permissionLevel,
    ...options,
  });
}

/**
 * Execute a registered tool function. Handles both streaming and non-streaming.
 * @param name The name of the tool
 * @param parameters The parameters for the tool
 * @param streamController Optional controller for streaming responses
 * @param jsonRpcId Optional original request ID for streaming JSON-RPC responses
 * @returns The tool response (if not streaming or for final result structure)
 */
export async function executeTool(
  name: string,
  parameters: Record<string, any>,
  streamController?: TransformStreamDefaultController,
  jsonRpcId?: string | number | null
): Promise<MCPToolResponse> {
  const handler = toolRegistry.getToolHandler(name);
  if (!handler) {
    // This case should ideally be caught earlier, but handle defensively
    registryLogger.error(
      `Attempted to execute non-existent/disabled tool: ${name}`
    );
    throw new Error(`Tool '${name}' not found or disabled`);
  }

  // If streamController is provided, handle streaming
  if (streamController) {
    registryLogger.debug(`Executing tool '${name}' in streaming mode`, {
      jsonRpcId,
    });
    const encoder = new TextEncoder();

    // Helper to send JSON-RPC formatted data to the stream
    const sendJsonRpc = (data: any) => {
      streamController.enqueue(encoder.encode(JSON.stringify(data) + "\\n"));
    };

    try {
      if ((handler as any).length > 1) {
        registryLogger.debug(`Tool '${name}' handler is stream-aware`);
        return await (handler as any)(parameters, streamController, jsonRpcId);
      } else {
        registryLogger.debug(
          `Tool '${name}' handler is not stream-aware, wrapping single result.`
        );
        const result = await handler(parameters);
        sendJsonRpc({
          jsonrpc: "2.0",
          result: result,
          id: jsonRpcId === undefined ? null : jsonRpcId,
        });
        streamController.terminate();
        return result;
      }
    } catch (error: any) {
      registryLogger.error(
        `Streaming execution failed for tool '${name}'. JSON-RPC ID: ${jsonRpcId}`,
        error
      );
      // Send a JSON-RPC error object
      let jsonRpcErrorCode = -32603;
      let jsonRpcErrorMessage = "Internal server error during tool execution.";
      if (error instanceof z.ZodError) {
        jsonRpcErrorCode = -32602;
        jsonRpcErrorMessage = `Invalid parameters for tool '${name}': ${error.errors
          .map((e) => `${e.path.join(".")} - ${e.message}`)
          .join(", ")}`;
      } else {
        jsonRpcErrorMessage = error.message || jsonRpcErrorMessage;
      }

      sendJsonRpc({
        jsonrpc: "2.0",
        error: {
          code: jsonRpcErrorCode,
          message: jsonRpcErrorMessage,
          data:
            config.server.environment === "development"
              ? error.stack
              : undefined,
        },
        id: jsonRpcId === undefined ? null : jsonRpcId,
      });
      streamController.terminate();
      throw error;
    }
  } else {
    // Standard non-streaming execution
    registryLogger.debug(`Executing tool '${name}' in non-streaming mode`);
    return handler(parameters);
  }
}
