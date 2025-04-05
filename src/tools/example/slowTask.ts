import { registerTool } from "../../registry";
import type { MCPToolResponse } from "../../types/mcp";
import { StreamingToolResponse } from "../utils";

/**
 * Slow task tool implementation - demonstrates streaming capabilities
 * Processes data slowly and streams back results in chunks
 */
async function slowTaskHandler(
  params: Record<string, any>
): Promise<MCPToolResponse> {
  const items = params.items || 5;
  const delay = params.delay || 1000;
  const shouldFail = params.fail === true;

  // In non-streaming mode, we just wait and return everything at once
  if (shouldFail) {
    await new Promise((resolve) => setTimeout(resolve, delay));
    throw new Error("Task failed as requested");
  }

  // Process all items with delay
  const results = [];
  for (let i = 0; i < items; i++) {
    await new Promise((resolve) => setTimeout(resolve, delay));
    results.push({
      item: i + 1,
      status: "processed",
      timestamp: new Date().toISOString(),
    });
  }

  return {
    content: {
      results,
      summary: {
        total: items,
        processingTimeMs: items * delay,
      },
    },
    metadata: {
      completed: true,
      timestamp: new Date().toISOString(),
    },
  };
}

/**
 * Streaming version that returns results incrementally
 */
export async function slowTaskStreamingHandler(
  params: Record<string, any>,
  controller?: TransformStreamDefaultController
): Promise<MCPToolResponse> {
  const items = params.items || 5;
  const delay = params.delay || 1000;
  const shouldFail = params.fail === true;

  // If not streaming, delegate to regular handler
  if (!controller) {
    return slowTaskHandler(params);
  }

  // Create a streaming response handler
  const streaming = new StreamingToolResponse(controller);
  const results = [];

  try {
    // Send initial status
    streaming.send(
      {
        status: "started",
        totalItems: items,
      },
      {
        progress: 0,
        estimatedTimeMs: items * delay,
      }
    );

    // Process each item with delay and stream the result
    for (let i = 0; i < items; i++) {
      // Fail in the middle if requested
      if (shouldFail && i === Math.floor(items / 2)) {
        throw new Error("Task failed halfway as requested");
      }

      // Wait for the specified delay
      await new Promise((resolve) => setTimeout(resolve, delay));

      // Process this item
      const result = {
        item: i + 1,
        status: "processed",
        timestamp: new Date().toISOString(),
      };

      results.push(result);

      // Stream progress update
      streaming.send(
        {
          latestItem: result,
          processedItems: i + 1,
          totalItems: items,
        },
        {
          progress: Math.round(((i + 1) / items) * 100),
          remainingTimeMs: (items - i - 1) * delay,
        }
      );
    }

    // Complete the streaming response with final result
    streaming.complete(
      {
        results,
        summary: {
          total: items,
          processingTimeMs: items * delay,
        },
      },
      {
        completed: true,
      }
    );

    // Return the complete result (won't be used in streaming mode, but needed for type consistency)
    return {
      content: {
        results,
        summary: {
          total: items,
          processingTimeMs: items * delay,
        },
      },
      metadata: {
        completed: true,
        timestamp: new Date().toISOString(),
      },
    };
  } catch (error) {
    // Handle errors by sending an error message
    streaming.error(error as Error);
    throw error;
  }
}

// Register the tool with the registry
registerTool(
  "slow_task",
  "Process items slowly, with optional streaming progress updates",
  {
    type: "object",
    properties: {
      items: {
        type: "integer",
        description: "Number of items to process",
        minimum: 1,
        maximum: 20,
        default: 5,
      },
      delay: {
        type: "integer",
        description: "Delay in milliseconds between processing items",
        minimum: 100,
        maximum: 5000,
        default: 1000,
      },
      fail: {
        type: "boolean",
        description: "Simulate a failure during processing",
        default: false,
      },
    },
    required: [],
  },
  slowTaskStreamingHandler,
  {
    category: "demo",
    tags: ["streaming", "example"],
  }
);
