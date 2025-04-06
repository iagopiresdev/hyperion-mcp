import type { MCPToolResponse } from "../types/mcp";

/**
 * A wrapper for tool handlers to enable streaming JSON-RPC responses.
 * Allows tools to incrementally return parts of a response formatted correctly.
 */
export class StreamingToolResponse {
  private controller?: TransformStreamDefaultController;
  private encoder = new TextEncoder();
  private isComplete = false;
  private jsonRpcId: string | number | null | undefined;

  /**
   * Create a new streaming tool response
   * @param streamController The transform stream controller to write to
   * @param jsonRpcId The original JSON-RPC request ID
   */
  constructor(
    streamController?: TransformStreamDefaultController,
    jsonRpcId?: string | number | null // Added jsonRpcId
  ) {
    this.controller = streamController;
    // Store the ID, default to null if undefined (per JSON-RPC spec for errors without ID)
    this.jsonRpcId = jsonRpcId === undefined ? null : jsonRpcId;
  }

  /**
   * Send a partial result to the client as a JSON-RPC response.
   * @param content The content to stream
   * @param metadata Optional metadata to include
   */
  send(content: any, metadata?: Record<string, any>): void {
    if (this.isComplete || !this.controller) {
      console.warn(
        "Attempting to send data when streaming is complete or not enabled."
      );
      return;
    }

    const toolResult: MCPToolResponse = {
      content,
      metadata: {
        ...metadata,
        partial: true, // Indicate this is an intermediate chunk
        timestamp: new Date().toISOString(),
      },
    };

    const jsonRpcResponse = {
      jsonrpc: "2.0",
      result: toolResult,
      id: this.jsonRpcId,
    };

    this.controller.enqueue(
      this.encoder.encode(JSON.stringify(jsonRpcResponse) + "\n")
    );
  }

  /**
   * Complete the streaming response with the final result as a JSON-RPC response.
   * @param finalContent The final content to send
   * @param metadata Optional metadata to include
   */
  complete(finalContent: any, metadata?: Record<string, any>): void {
    if (this.isComplete || !this.controller) {
      console.warn(
        "Attempting to complete when streaming is complete or not enabled."
      );
      return;
    }
    this.isComplete = true;

    const finalToolResult: MCPToolResponse = {
      content: finalContent,
      metadata: {
        ...metadata,
        partial: false, // Indicate this is the final result
        final: true,
        timestamp: new Date().toISOString(),
      },
    };

    const jsonRpcResponse = {
      jsonrpc: "2.0",
      result: finalToolResult,
      id: this.jsonRpcId,
    };

    this.controller.enqueue(
      this.encoder.encode(JSON.stringify(jsonRpcResponse) + "\n")
    );
    this.controller.terminate();
  }

  /**
   * Send an error as a JSON-RPC error response and complete the stream.
   * @param error The error to send
   */
  error(error: Error | string): void {
    if (this.isComplete || !this.controller) {
      console.warn(
        "Attempting to send error when streaming is complete or not enabled."
      );
      return;
    }
    this.isComplete = true;

    const errorMessage = typeof error === "string" ? error : error.message;
    const errorCode = -32000;

    const jsonRpcErrorResponse = {
      jsonrpc: "2.0",
      error: {
        code: errorCode,
        message: errorMessage,
        //TODO: Add error.stack in dev mode
      },
      id: this.jsonRpcId,
    };

    this.controller.enqueue(
      this.encoder.encode(JSON.stringify(jsonRpcErrorResponse) + "\n")
    );
    this.controller.terminate();
  }
}

/**
 * Create a streaming handler from a regular tool handler
 * @param handler The original handler function
 * @returns A streaming-capable handler
 */
export function createStreamingHandler(
  handler: (params: Record<string, any>) => Promise<MCPToolResponse>
) {
  return async (
    params: Record<string, any>,
    stream?: TransformStreamDefaultController
  ): Promise<MCPToolResponse> => {
    // If streaming is not enabled, just call the original handler
    if (!stream) {
      return handler(params);
    }

    const streamingResponse = new StreamingToolResponse(stream);

    try {
      const result = await handler(params);
      streamingResponse.complete(result.content, result.metadata);

      // The actual return value won't be used in streaming mode,
      // but we need to return something to satisfy the type system
      return result;
    } catch (error) {
      streamingResponse.error(error as Error);

      throw error;
    }
  };
}
