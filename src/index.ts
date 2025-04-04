import { zValidator } from "@hono/zod-validator";
import { Hono } from "hono";
import { cors } from "hono/cors";
import { z } from "zod";
import { executeTool, toolRegistry } from "./registry";
import type { MCPServerInfo, MCPToolRequest } from "./types/mcp";
import { config } from "./utils/config";
import { logger } from "./utils/logger";

// Tools
import "./tools/completeTask";
import "./tools/createTask";
import "./tools/example/slowTask";
import "./tools/listTasks";
import "./tools/llmQuery/openaiQuery";

type AppContext = {
  requestStartTime?: number;
  requestId?: string;
};

const serverLogger = logger.child({ component: "server" });

const app = new Hono<{ Variables: AppContext }>();

app.use(
  "*",
  cors({
    origin: "*",
    allowHeaders: ["Content-Type", "Authorization"],
    allowMethods: ["GET", "POST", "OPTIONS"],
    maxAge: 86400,
  })
);

const toolRequestSchema = z.object({
  name: z.string().min(1, "Tool name is required"),
  parameters: z.record(z.any()).optional().default({}),
  stream: z.boolean().optional().default(false),
});

const getServerInfo = (): MCPServerInfo => ({
  name: "hyperion-mcp",
  version: "0.1.0",
  description:
    "High-performance Model Context Protocol (MCP) server built with Bun and Hono",
  vendor: "hyperion-mcp",
  contact: "https://github.com/your-username/hyperion-mcp",
  specs: {
    mcp: "0.1.0",
  },
  tools: toolRegistry.getAllTools(),
});

app.use("*", async (c, next) => {
  const requestId = crypto.randomUUID();
  c.set("requestId", requestId);
  c.set("requestStartTime", Date.now());

  const requestLogger = serverLogger.child({
    requestId,
    method: c.req.method,
    path: c.req.path,
  });

  requestLogger.info("Request started");

  try {
    await next();

    const duration = Date.now() - (c.get("requestStartTime") || 0);
    requestLogger.info("Request completed", {
      status: c.res.status,
      duration: `${duration}ms`,
    });
  } catch (error) {
    const duration = Date.now() - (c.get("requestStartTime") || 0);
    requestLogger.error("Request failed", error as Error, {
      status: 500,
      duration: `${duration}ms`,
    });

    throw error;
  }
});

app.get("/", (c) => {
  serverLogger.debug("Server info requested");
  return c.json(getServerInfo());
});

app.post("/tools", zValidator("json", toolRequestSchema), async (c) => {
  const request = c.req.valid("json") as MCPToolRequest;
  const { name, parameters, stream } = request;
  const requestId = c.get("requestId");

  const toolLogger = serverLogger.child({
    tool: name,
    requestId,
    streaming: stream,
  });

  if (!toolRegistry.isToolRegistered(name)) {
    const availableTools = toolRegistry.getAllTools().map((t) => t.name);
    toolLogger.warn("Unknown tool requested", { availableTools });

    return c.json(
      {
        error: `Unknown tool: ${name}`,
        availableTools,
      },
      400
    );
  }

  toolLogger.info("Tool execution started", { parameters });

  if (stream) {
    toolLogger.debug("Using streaming response");
    return streamToolResponse(c, name, parameters, toolLogger);
  }

  try {
    const response = await executeTool(name, parameters);
    toolLogger.info("Tool execution completed successfully");

    return c.json(response);
  } catch (error) {
    toolLogger.error("Tool execution failed", error as Error);

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
});

async function streamToolResponse(
  c: any,
  toolName: string,
  parameters: Record<string, any>,
  logger: any
) {
  const encoder = new TextEncoder();
  let isClosed = false;

  const stream = new TransformStream({
    start(controller) {
      setTimeout(() => {
        if (isClosed) return;

        executeTool(toolName, parameters, controller).catch((error) => {
          logger.error(`Streaming execution failed`, error as Error);
        });
      }, 0);
    },
  });

  return new Response(stream.readable, {
    headers: {
      "Content-Type": "application/json",
      "Transfer-Encoding": "chunked",
      "X-Content-Type-Options": "nosniff",
    },
  });
}

app.get("/health", (c) => {
  serverLogger.debug("Health check requested");
  return c.json({ status: "ok", timestamp: new Date().toISOString() });
});

app.get("/tools", (c) => {
  serverLogger.debug("Tools list requested");
  return c.json({
    tools: toolRegistry.getAllTools(),
  });
});

app.get("/docs", (c) => {
  serverLogger.debug("Documentation requested");
  const serverInfo = getServerInfo();
  return c.html(`
    <!DOCTYPE html>
    <html>
      <head>
        <title>hyperion-mcp API Documentation</title>
        <meta charset="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <style>
          body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; line-height: 1.6; max-width: 800px; margin: 0 auto; padding: 1rem; }
          h1 { border-bottom: 1px solid #eee; padding-bottom: 0.5rem; }
          pre { background: #f5f5f5; padding: 1rem; overflow: auto; border-radius: 3px; }
          .tool { margin-bottom: 2rem; border: 1px solid #eee; padding: 1rem; border-radius: 5px; }
          .tool h3 { margin-top: 0; }
        </style>
      </head>
      <body>
        <h1>hyperion-mcp API Documentation</h1>
        <p>${serverInfo.description}</p>
        
        <h2>Server Information</h2>
        <pre>${JSON.stringify(serverInfo, null, 2)}</pre>
        
        <h2>Available Tools</h2>
        ${serverInfo.tools
          .map(
            (tool) => `
          <div class="tool">
            <h3>${tool.name}</h3>
            <p>${tool.description}</p>
            <h4>Parameters</h4>
            <pre>${JSON.stringify(tool.parameters, null, 2)}</pre>
            <h4>Example Usage</h4>
            <pre>curl -X POST http://localhost:3333/tools \\
  -H "Content-Type: application/json" \\
  -d '{"name": "${tool.name}", "parameters": {}}'</pre>
          </div>
        `
          )
          .join("")}
      </body>
    </html>
  `);
});

const port = config.server.port;
serverLogger.info(`Server starting on http://localhost:${port}`, {
  port,
  environment: config.server.environment,
  tools: toolRegistry.getAllTools().length,
});

export default {
  port,
  fetch: app.fetch,
};
