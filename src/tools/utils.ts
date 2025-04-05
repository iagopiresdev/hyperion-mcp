import type { MCPToolResponse } from "../types/mcp";

/**
 * A wrapper for tool handlers to enable streaming responses
 * Allows tools to incrementally return parts of a response
 */
export class StreamingToolResponse {
  private controller?: TransformStreamDefaultController;
  private encoder = new TextEncoder();
  private isComplete = false;

  /**
   * Create a new streaming tool response
   * @param streamController The transform stream controller to write to
   */
  constructor(streamController?: TransformStreamDefaultController) {
    this.controller = streamController;
  }

  /**
   * Send a partial result to the client
   * @param content The content to stream
   * @param metadata Optional metadata to include
   */
  send(content: any, metadata?: Record<string, any>): void {
    if (this.isComplete) {
      console.warn(
        "Attempting to send data after streaming response is complete"
      );
      return;
    }

    if (!this.controller) {
      console.warn("Streaming not enabled for this response");
      return;
    }

    const response: MCPToolResponse = {
      content,
      metadata: {
        ...metadata,
        partial: true,
        timestamp: new Date().toISOString(),
      },
    };

    this.controller.enqueue(
      this.encoder.encode(JSON.stringify(response) + "\n")
    );
  }

  /**
   * Complete the streaming response
   * @param finalContent The final content to send
   * @param metadata Optional metadata to include
   */
  complete(finalContent: any, metadata?: Record<string, any>): void {
    if (this.isComplete) {
      console.warn("Streaming response already complete");
      return;
    }

    this.isComplete = true;

    if (!this.controller) {
      console.warn("Streaming not enabled for this response");
      return;
    }

    const response: MCPToolResponse = {
      content: finalContent,
      metadata: {
        ...metadata,
        partial: false,
        final: true,
        timestamp: new Date().toISOString(),
      },
    };

    this.controller.enqueue(this.encoder.encode(JSON.stringify(response)));
    this.controller.terminate();
  }

  /**
   * Send an error and complete the streaming response
   * @param error The error to send
   */
  error(error: Error | string): void {
    if (this.isComplete) {
      console.warn("Streaming response already complete");
      return;
    }

    this.isComplete = true;

    if (!this.controller) {
      console.warn("Streaming not enabled for this response");
      return;
    }

    const errorMessage = typeof error === "string" ? error : error.message;

    const response = {
      error: errorMessage,
      metadata: {
        partial: false,
        final: true,
        timestamp: new Date().toISOString(),
      },
    };

    this.controller.enqueue(this.encoder.encode(JSON.stringify(response)));
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

    // Creates a streaming response object
    const streamingResponse = new StreamingToolResponse(stream);

    try {
      const result = await handler(params);
      streamingResponse.complete(result.content, result.metadata);

      // The actual return value won't be used in streaming mode,
      // but we need to return something to satisfy the type system
      return result;
    } catch (error) {
      streamingResponse.error(error as Error);

      // Rethrow to be consistent with non-streaming behavior
      throw error;
    }
  };
}
