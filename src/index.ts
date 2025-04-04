import { zValidator } from "@hono/zod-validator";
import { Hono } from "hono";
import { cors } from "hono/cors";
import { z } from "zod";
import { executeTool, toolRegistry } from "./registry";
import type { MCPServerInfo, MCPToolRequest } from "./types/mcp";

// Import tools to ensure they're registered
import "./tools/completeTask";
import "./tools/createTask";
import "./tools/listTasks";
// Import example streaming tool
import "./tools/example/slowTask";

// Define custom Context type for the app
type AppContext = {
  requestStartTime?: number;
};

const app = new Hono<{ Variables: AppContext }>();

// Apply CORS middleware
app.use(
  "*",
  cors({
    origin: "*",
    allowHeaders: ["Content-Type", "Authorization"],
    allowMethods: ["GET", "POST", "OPTIONS"],
    maxAge: 86400,
  })
);

// Schema validation for tool requests
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

// Tracking request start times for observability
app.use("*", async (c, next) => {
  c.set("requestStartTime", Date.now());
  await next();
  const duration = Date.now() - (c.get("requestStartTime") || 0);
  console.log(
    `${c.req.method} ${c.req.path} - ${c.res.status} (${duration}ms)`
  );
});

// Server info endpoint
app.get("/", (c) => {
  return c.json(getServerInfo());
});

// Tool execution endpoint
app.post("/tools", zValidator("json", toolRequestSchema), async (c) => {
  const request = c.req.valid("json") as MCPToolRequest;
  const { name, parameters, stream } = request;

  // Check if tool exists
  if (!toolRegistry.isToolRegistered(name)) {
    return c.json(
      {
        error: `Unknown tool: ${name}`,
        availableTools: toolRegistry.getAllTools().map((t) => t.name),
      },
      400
    );
  }

  // For streaming responses
  if (stream) {
    return streamToolResponse(c, name, parameters);
  }

  try {
    // Execute the tool
    const response = await executeTool(name, parameters);
    return c.json(response);
  } catch (error) {
    console.error(`Error executing tool ${name}:`, error);

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

// Function to handle streaming responses
async function streamToolResponse(
  c: any,
  toolName: string,
  parameters: Record<string, any>
) {
  const encoder = new TextEncoder();
  let isClosed = false;

  // Create a TransformStream for streaming the response
  const stream = new TransformStream({
    start(controller) {
      setTimeout(() => {
        if (isClosed) return;

        // Execute the tool with streaming support
        executeTool(toolName, parameters, controller).catch((error) => {
          console.error(`Error in streaming execution of ${toolName}:`, error);
          // Error handling is done inside executeTool
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

// Health check endpoint
app.get("/health", (c) => {
  return c.json({ status: "ok", timestamp: new Date().toISOString() });
});

// Registry management endpoints
app.get("/tools", (c) => {
  return c.json({
    tools: toolRegistry.getAllTools(),
  });
});

// Live API documentation
app.get("/docs", (c) => {
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

const port = process.env.PORT || 3333;
console.log(`hyperion-mcp server starting on http://localhost:${port}`);

export default {
  port,
  fetch: app.fetch,
};
