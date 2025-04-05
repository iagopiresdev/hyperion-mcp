import type { Context } from "hono";
import {
  executeTool as executeToolFromRegistry,
  toolRegistry,
} from "../registry";
import { logger } from "../utils/logger";

const toolLogger = logger.child({ component: "tool-executor" });

/**
 * Handler for executing tools via HTTP requests
 */
export const executeTool = async (c: Context) => {
  const { tool } = c.req.param();

  if (!tool) {
    return c.json({ error: "Tool name is required" }, 400);
  }

  if (!toolRegistry.isToolRegistered(tool)) {
    const availableTools = toolRegistry.getAllTools().map((t) => t.name);
    return c.json(
      {
        error: `Unknown tool: ${tool}`,
        availableTools,
      },
      404
    );
  }

  try {
    const body = await c.req.json();
    const parameters = body.parameters || {};

    toolLogger.info(`Executing tool: ${tool}`, { parameters });
    const result = await executeToolFromRegistry(tool, parameters);

    return c.json(result);
  } catch (error) {
    toolLogger.error(`Error executing tool: ${tool}`, error as Error);

    return c.json(
      {
        error: `Error executing tool: ${(error as Error).message}`,
        details:
          process.env.NODE_ENV === "development"
            ? (error as Error).stack
            : undefined,
      },
      500
    );
  }
};

/**
 * Handler for streaming tool execution
 */
export const executeStreamedTool = async (c: Context) => {
  const { tool } = c.req.param();

  if (!tool) {
    return c.json({ error: "Tool name is required" }, 400);
  }

  if (!toolRegistry.isToolRegistered(tool)) {
    const availableTools = toolRegistry.getAllTools().map((t) => t.name);
    return c.json(
      {
        error: `Unknown tool: ${tool}`,
        availableTools,
      },
      404
    );
  }

  try {
    const body = await c.req.json();
    const parameters = body.parameters || {};

    toolLogger.info(`Executing streaming tool: ${tool}`, { parameters });

    const stream = new TransformStream();
    const writer = stream.writable.getWriter();
    const encoder = new TextEncoder();

    setTimeout(() => {
      const streamController = {
        enqueue: (chunk: any) => {
          const jsonChunk = JSON.stringify(chunk);
          writer.write(encoder.encode(jsonChunk + "\n"));
        },
        error: (err: Error) => {
          writer.write(
            encoder.encode(
              JSON.stringify({
                error: err.message,
              }) + "\n"
            )
          );
          writer.close();
        },
      };

      executeToolFromRegistry(tool, parameters, streamController as any)
        .then(() => {
          writer.close();
        })
        .catch((error) => {
          toolLogger.error(
            `Streaming execution failed for tool: ${tool}`,
            error as Error
          );
          writer.close();
        });
    }, 0);

    return new Response(stream.readable, {
      headers: {
        "Content-Type": "application/json",
        "Transfer-Encoding": "chunked",
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch (error) {
    toolLogger.error(
      `Error setting up streaming tool: ${tool}`,
      error as Error
    );

    return c.json(
      {
        error: `Error executing tool: ${(error as Error).message}`,
        details:
          process.env.NODE_ENV === "development"
            ? (error as Error).stack
            : undefined,
      },
      500
    );
  }
};
