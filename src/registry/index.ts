import { z } from "zod";
import type { MCPToolResponse } from "../types/mcp";
import type { PermissionLevel } from "../utils/auth";
import { logger } from "../utils/logger";
import { InMemoryToolRegistry } from "./toolRegistry";

// Creates a global shared instance of the tool registry
export const toolRegistry = new InMemoryToolRegistry();
export { InMemoryToolRegistry } from "./toolRegistry";

const registryLogger = logger.child({ component: "tool-registry" });

/**
 * Represents an error that occurred during the execution of a tool's logic,
 * distinct from protocol errors. These should be reported within the result.
 */
export class ToolExecutionError extends Error {
  public readonly isToolExecutionError = true;
  public readonly content: any;

  constructor(message: string, content?: any, options?: ErrorOptions) {
    super(message, options);
    this.name = "ToolExecutionError";
    this.content = content || [{ type: "text", text: message }];
    Object.setPrototypeOf(this, ToolExecutionError.prototype);
  }
}

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
 * @param writer Optional writer for streaming responses
 * @param encoder Optional encoder for streaming responses
 * @param jsonRpcId Optional original request ID for streaming JSON-RPC responses
 * @returns The tool response (if not streaming or for final result structure)
 */
export async function executeTool(
  name: string,
  parameters: Record<string, any>,
  writer?: WritableStreamDefaultWriter,
  encoder?: TextEncoder,
  jsonRpcId?: string | number | null
): Promise<MCPToolResponse> {
  const handler = toolRegistry.getToolHandler(name);
  if (!handler) {
    registryLogger.error(
      `Attempted to execute non-existent/disabled tool: ${name}`
    );
    throw new Error(`Tool '${name}' not found or disabled`);
  }

  if (writer && encoder) {
    registryLogger.debug(`Executing tool '${name}' in streaming mode`, {
      jsonRpcId,
    });

    const streamControllerForHandler = {
      _writer: writer,
      _encoder: encoder,
      _closed: false,
      enqueue: function (chunk: Uint8Array) {
        if (this._closed) return;
        this._writer.write(chunk).catch((err) => {
          registryLogger.error(
            `Stream write error for tool '${name}': ${err.message}`,
            err
          );
          this._closed = true;
        });
      },
      error: function (err: Error) {
        if (this._closed) return;
        this._closed = true;
        const errorPayload =
          JSON.stringify({
            jsonrpc: "2.0",
            error: {
              code: -32000, // Generic tool execution error for stream
              message: err.message || "Streaming Error",
            },
            id: jsonRpcId === undefined ? null : jsonRpcId,
          }) + "\n";
        this._writer.write(this._encoder.encode(errorPayload)).finally(() => {
          this._writer
            .close()
            .catch((closeErr) =>
              registryLogger.warn(
                `Error closing writer after stream error: ${closeErr.message}`
              )
            );
        });
      },
      terminate: function () {
        if (this._closed) return;
        this._closed = true;
        this._writer
          .close()
          .catch((closeErr) =>
            registryLogger.warn(
              `Error closing writer on terminate: ${closeErr.message}`
            )
          );
      },
    };

    (async () => {
      try {
        if ((handler as any).length > 2) {
          registryLogger.debug(
            `Handler for '${name}' expects controller and ID, passing them.`
          );
          (handler as any)(parameters, streamControllerForHandler, jsonRpcId);
        } else if ((handler as any).length > 1) {
          registryLogger.debug(
            `Handler for '${name}' expects controller, passing shim.`
          );
          (handler as any)(parameters, streamControllerForHandler);
        } else {
          registryLogger.warn(
            `Handler for '${name}' called in streaming mode but doesn't accept controller. Sending single result.`
          );
          const result = await handler(parameters);
          const finalToolResult: MCPToolResponse = {
            content: result.content,
            metadata: { ...result.metadata, partial: false, final: true },
          };
          const jsonRpcResponse = {
            jsonrpc: "2.0",
            result: finalToolResult,
            id: jsonRpcId === undefined ? null : jsonRpcId,
          };
          streamControllerForHandler.enqueue(
            encoder.encode(JSON.stringify(jsonRpcResponse) + "\n")
          );
          streamControllerForHandler.terminate();
        }
      } catch (error: any) {
        registryLogger.error(
          `Unexpected error initiating streaming handler for tool '${name}'`,
          error instanceof Error ? error : undefined
        );
        try {
          streamControllerForHandler.error(
            new Error("Internal server error initiating stream.")
          );
        } catch (streamError) {
          registryLogger.error(
            "Failed to send error via controller after setup error",
            streamError instanceof Error ? streamError : undefined
          );
        }
      }
    })(); // Fire-and-forget async IIFE

    return Promise.resolve({
      content: { status: "streaming" },
      metadata: { partial: true },
    });
  } else {
    registryLogger.debug(`Executing tool '${name}' in non-streaming mode`);
    try {
      return await handler(parameters);
    } catch (error: any) {
      if (error instanceof ToolExecutionError) {
        registryLogger.warn(
          `Tool '${name}' execution failed (ToolExecutionError - non-streaming)`,
          error
        );
        return {
          content: error.content,
          metadata: { isError: true },
        };
      } else if (error instanceof z.ZodError) {
        registryLogger.warn(
          `Tool '${name}' validation failed (ZodError - non-streaming)`,
          { errors: error.errors }
        );
        return {
          content: {
            message: `Validation failed for tool '${name}'`,
            details: error.errors.map((e) => ({
              path: e.path.join("."),
              message: e.message,
            })),
          },
          metadata: { isError: true },
        };
      } else {
        registryLogger.error(
          `Non-streaming execution failed for tool '${name}' (protocol error)`,
          error
        );
        throw error;
      }
    }
  }
}
