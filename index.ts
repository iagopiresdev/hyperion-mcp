import { serve } from "@hono/node-server";
import { Hono } from "hono";
import { cors } from "hono/cors";
import { prettyJSON } from "hono/pretty-json";
import { z } from "zod";
import { notFound } from "./src/handlers/notFound";
import type { AuthContext } from "./src/middleware/auth";
import { authentication } from "./src/middleware/auth";
import { metricsHandler, requestMetrics } from "./src/middleware/metrics";
import {
  executeTool as executeToolFunction,
  toolRegistry,
} from "./src/registry";
import { registerToolsFromDirectory } from "./src/registry/toolLoader";
import type { MCPServerInfo } from "./src/types/mcp";
import { authService } from "./src/utils/auth";
import { config } from "./src/utils/config";
import { logger } from "./src/utils/logger";
import { metrics } from "./src/utils/metrics";

// Tools
import "./src/tools/completeTask";
import "./src/tools/connectors/fileSystem";
import "./src/tools/connectors/webBrowser";
import "./src/tools/createTask";
import "./src/tools/example/slowTask";
import "./src/tools/listTasks";
import "./src/tools/llmQuery/openaiQuery";

type AppContext = {
  requestStartTime?: number;
  requestId?: string;
} & AuthContext;

const serverLogger = logger.child({ component: "server" });
export const app = new Hono<{ Variables: AppContext }>();

app.use("*", async (c, next) => {
  await next();
  serverLogger.debug(`${c.req.method} ${c.req.path} - ${c.res.status}`);
});
app.use("*", prettyJSON());
app.use(
  "*",
  cors({
    origin: "*",
    allowHeaders: ["Content-Type", "Authorization", "X-API-Key"],
    allowMethods: ["POST", "GET", "OPTIONS"],
    exposeHeaders: ["Content-Type"],
    maxAge: 600,
    credentials: true,
  })
);

app.use("*", requestMetrics);
if (config.auth.enableAuth) {
  app.use("*", authentication);
}

app.use("*", (c, next) => {
  const start = Date.now();
  const requestId = crypto.randomUUID();
  c.set("requestStartTime", start);
  c.set("requestId", requestId);
  serverLogger.info("Request started", {
    requestId,
    method: c.req.method,
    path: c.req.path,
  });
  return next();
});

// --- JSON-RPC Schemas --- //
const JsonRpcIdSchema = z.union([z.string(), z.number(), z.null()]);

const JsonRpcRequestSchema = z.object({
  jsonrpc: z.literal("2.0"),
  method: z.string().min(1, "Method (tool name) is required"),
  params: z.record(z.any()).optional().default({}),
  id: JsonRpcIdSchema.optional(),
});

const JsonRpcErrorObjectSchema = z.object({
  code: z.number().int(),
  message: z.string(),
  data: z.any().optional(),
});

const getServerInfo = (): MCPServerInfo => ({
  name: "hyperion-mcp",
  version: "0.1.0",
  description:
    "High-performance Model Context Protocol (MCP) server built with Node.js and Hono",
  vendor: "hyperion-mcp",
  contact: "https://github.com/your-username/hyperion-mcp",
  specs: {
    mcp: "0.1.0",
  },
  tools: toolRegistry.getAllTools(),
});

app.get("/", (c) => {
  serverLogger.debug("Server info requested");
  return c.json(getServerInfo());
});

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
            <h4>Parameters Schema</h4>
            <pre>${JSON.stringify(tool.parameters, null, 2)}</pre>
            <h4>Example JSON-RPC Usage (Non-Streaming)</h4>
            <pre>curl -X POST http://localhost:3333/invoke \\
  -H "Content-Type: application/json" \\
  -H "Authorization: Bearer YOUR_API_KEY" \\  # If auth enabled
  -d '{
    "jsonrpc": "2.0",
    "method": "${tool.name}",
    "params": { },
    "id": "req-123"
  }'</pre>
            <h4>Example JSON-RPC Usage (Streaming)</h4>
            <pre>curl -X POST http://localhost:3333/invoke \\
  -H "Content-Type: application/json" \\
  -H "Authorization: Bearer YOUR_API_KEY" \\  # If auth enabled
  -d '{
    "jsonrpc": "2.0",
    "method": "${tool.name}",
    "params": { "stream": true },
    "id": "req-456"
  }'</pre>
          </div>
        `
          )
          .join("")}
      </body>
    </html>
  `);
});

app.get("/metrics", metricsHandler);

// --- Tool Invocation Endpoints --- //
app.post("/invoke", async (c) => {
  let requestBody: any;
  let jsonRpcId: string | number | null | undefined = undefined;
  try {
    requestBody = await c.req.json();
    if (
      typeof requestBody === "object" &&
      requestBody !== null &&
      "id" in requestBody
    ) {
      jsonRpcId = requestBody.id;
    }
  } catch (e) {
    return c.json(
      {
        jsonrpc: "2.0",
        error: { code: -32700, message: "Parse error: Invalid JSON received." },
        id: null,
      },
      400
    );
  }

  const parsedRequest = JsonRpcRequestSchema.safeParse(requestBody);

  if (!parsedRequest.success) {
    return c.json(
      {
        jsonrpc: "2.0",
        error: {
          code: -32600,
          message: `Invalid JSON-RPC Request: ${parsedRequest.error.errors
            .map((e) => `${e.path.join(".")} - ${e.message}`)
            .join(", ")}`,
          data: parsedRequest.error.format(),
        },
        id: jsonRpcId === undefined ? null : jsonRpcId,
      },
      400
    );
  }

  const {
    method: toolName,
    params: parameters,
    id: requestId,
  } = parsedRequest.data;
  const serverRequestId = c.get("requestId");

  const toolLogger = serverLogger.child({
    tool: toolName,
    internalRequestId: serverRequestId,
    jsonRpcId: requestId,
  });

  if (!toolRegistry.isToolRegistered(toolName)) {
    toolLogger.warn("Unknown tool requested");
    return c.json(
      {
        jsonrpc: "2.0",
        error: {
          code: -32601,
          message: `Method not found: Tool '${toolName}' is not available.`,
          data: {
            availableTools: toolRegistry.getAllTools().map((t) => t.name),
          },
        },
        id: requestId === undefined ? null : requestId,
      },
      404
    );
  }

  // --- Authorization Check --- //
  if (config.auth.enableAuth) {
    const auth = c.get("auth") as AuthContext["auth"];
    // Ensure auth context was set by middleware (it should be if auth is enabled)
    if (!auth) {
      toolLogger.error(
        "Auth context missing despite auth being enabled. Check middleware order."
      );
      return c.json(
        {
          jsonrpc: "2.0",
          error: {
            code: -32603,
            message: "Internal Server Error: Auth context missing.",
          },
          id: requestId === undefined ? null : requestId,
        },
        500
      );
    }

    const tool = toolRegistry.getToolDefinition(toolName); // We know tool exists here
    //TODO: Should ideally check if tool is undefined, though isToolRegistered passed
    if (!tool) {
      toolLogger.error(
        `Tool definition not found for '${toolName}' despite being registered.`
      );
      return c.json(
        {
          jsonrpc: "2.0",
          error: {
            code: -32603,
            message: "Internal Server Error: Tool definition missing.",
          },
          id: requestId === undefined ? null : requestId,
        },
        500
      );
    }

    const requiredPermission = tool.metadata?.permissionLevel || "public";

    const clientInfo = auth.isAuthenticated
      ? {
          id: auth.clientId!,
          name: auth.clientName!,
          permissions: auth.permissions as any, // TODO: Refine 'any' type if possible
        }
      : null;

    const hasPermission = authService.hasPermission(
      clientInfo,
      requiredPermission
    );

    if (!hasPermission) {
      toolLogger.warn("Unauthorized tool access attempt (JSON-RPC)", {
        toolName,
        clientId: auth.clientId,
        requiredPermission,
      });

      return c.json(
        {
          jsonrpc: "2.0",
          error: {
            code: -32000,
            message: `Access Denied: Insufficient permissions to use tool '${toolName}'. Required: ${requiredPermission}.`,
          },
          id: requestId === undefined ? null : requestId,
        },
        403
      );
    }
    toolLogger.debug("Authorization successful for tool", {
      toolName,
      clientId: auth.clientId,
    });
  }
  const wantsStreaming = parameters?.stream === true;

  const toolParameters = { ...parameters };
  if (wantsStreaming) {
    delete toolParameters.stream;
  }

  toolLogger.info(
    `JSON-RPC tool execution ${
      wantsStreaming ? "started (streaming)" : "started"
    }`,
    { parameters: toolParameters }
  );

  // --- Execute Tool (Streaming or Non-Streaming) --- //
  if (wantsStreaming) {
    toolLogger.debug("Initiating streaming response for JSON-RPC request", {
      toolName,
      requestId,
    });
    try {
      const stream = new TransformStream();
      const writer = stream.writable.getWriter();
      const encoder = new TextEncoder();

      const streamControllerShim = {
        enqueue: (chunk: any) => {
          writer.write(encoder.encode(String(chunk))); // Ensure chunk is string encoded
        },
        error: (err: Error) => {
          // Error should be formatted as JSON-RPC error string by executeToolFunction
          const errorPayload =
            JSON.stringify({
              jsonrpc: "2.0",
              error: {
                code: -32603,
                message: err.message || "Streaming Error",
              },
              id: requestId === undefined ? null : requestId,
            }) + "\n";
          writer.write(encoder.encode(errorPayload));
          writer.close();
        },
        terminate: () => {
          writer.close();
        },
      };

      executeToolFunction(
        toolName,
        toolParameters,
        streamControllerShim as any,
        requestId
      ).catch((err) => {
        toolLogger.warn(
          `Streaming executeToolFunction promise rejected (error likely already sent via stream)`,
          err
        );
      });

      return new Response(stream.readable, {
        headers: {
          "Content-Type": "application/jsonl",
          "Transfer-Encoding": "chunked",
          "X-Content-Type-Options": "nosniff",
        },
      });
    } catch (error: any) {
      toolLogger.error(`Error setting up streaming response`, error);
      return c.json(
        {
          jsonrpc: "2.0",
          error: {
            code: -32603,
            message: "Internal server error setting up stream.",
          },
          id: requestId === undefined ? null : requestId,
        },
        500
      );
    }
  } else {
    const endToolMetricTracker = metrics.trackTool(toolName);
    try {
      const result = await executeToolFunction(toolName, toolParameters || {});
      toolLogger.info(
        "JSON-RPC tool execution completed successfully (non-streaming)"
      );
      return c.json({
        jsonrpc: "2.0",
        result: result,
        id: requestId,
      });
    } catch (error: any) {
      toolLogger.error(`JSON-RPC tool execution failed (non-streaming)`, error);
      let jsonRpcErrorCode = -32603;
      let jsonRpcErrorMessage = "Internal server error during tool execution.";
      if (error.message?.includes("Access denied")) {
        jsonRpcErrorCode = -32000;
        jsonRpcErrorMessage =
          "Access Denied: Insufficient permissions to use tool.";
      } else if (error instanceof z.ZodError) {
        jsonRpcErrorCode = -32602;
        jsonRpcErrorMessage = "Invalid tool parameters.";
      } else {
        jsonRpcErrorMessage = error.message || jsonRpcErrorMessage;
      }

      return c.json(
        {
          jsonrpc: "2.0",
          error: {
            code: jsonRpcErrorCode,
            message: jsonRpcErrorMessage,
            data:
              config.server.environment === "development"
                ? error.stack
                : undefined,
          },
          id: requestId === undefined ? null : requestId,
        },
        500
      );
    } finally {
      endToolMetricTracker();
    }
  }
});

app.notFound(notFound);

if (import.meta.main) {
  registerToolsFromDirectory("./src/tools")
    .then((count: number) => {
      serverLogger.info(`Loaded ${count} tools from directory`);

      const port = config.server.port;
      console.log(`Server is running on port ${port}`);

      serve({
        fetch: app.fetch,
        port,
      });
    })
    .catch((error: Error) => {
      serverLogger.error("Failed to load tools:", error);
      process.exit(1);
    });
}
