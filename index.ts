import { Hono } from "hono";
import { cors } from "hono/cors";
import { prettyJSON } from "hono/pretty-json";
import { z } from "zod";
import { notFound } from "./src/handlers/notFound";
import {
  handleListResources,
  handleReadResource,
} from "./src/handlers/resource_handlers";
import {
  ListResourcesRequestSchema,
  ReadResourceRequestSchema,
} from "./src/mcp/types";
import type { AuthContext } from "./src/middleware/auth";
import { authentication } from "./src/middleware/auth";
import { metricsHandler, requestMetrics } from "./src/middleware/metrics";
import {
  executeTool as executeToolFunction,
  toolRegistry,
} from "./src/registry";
import type { MCPServerInfo } from "./src/types/mcp";
import { authService } from "./src/utils/auth";
import { config } from "./src/utils/config";
import { createJsonRpcErrorResponse } from "./src/utils/jsonrpc_helpers";
import { logger as serverLogger } from "./src/utils/logger";
import { metrics } from "./src/utils/metrics";

type AppContext = {
  requestStartTime?: number;
  requestId?: string;
} & AuthContext;

const app = new Hono<{ Variables: AppContext }>();

app.use("*", async (c, next) => {
  await next();
  serverLogger.debug(`${c.req.method} ${c.req.path} - ${c.res.status}`);
});

app.use("*", prettyJSON());

app.use(
  "*",
  cors({
    origin: "*",
    allowHeaders: ["Content-Type", "Authorization", "X-API-Key", "X-Client-ID"],
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

const getServerInfo = (): MCPServerInfo => ({
  name: "hyperion-mcp",
  version: "0.1.0",
  description:
    "High-performance Model Context Protocol (MCP) server built with Node.js and Hono",
  vendor: "hyperion-mcp",
  contact: "https://github.com/hyperion-mcp",
  specs: {
    mcp: "0.1.0",
  },
  capabilities: {
    tools: {
      listChanged: false,
    },
    resources: {},
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
  -H "Content-Type": application/json" \\
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

    if (jsonRpcId === null) {
      return c.json(
        createJsonRpcErrorResponse(
          null,
          -32600,
          "Invalid Request: MCP requires non-null 'id' for requests."
        ),
        400
      );
    }
  } catch (e) {
    return c.json(
      createJsonRpcErrorResponse(
        null,
        -32700,
        "Parse error: Invalid JSON received."
      ),
      400
    );
  }

  const JsonRpcIdSchema = z.union([z.string(), z.number(), z.null()]);
  const JsonRpcRequestSchema = z.object({
    jsonrpc: z.literal("2.0"),
    method: z.string().min(1, "Method (tool name) is required"),
    params: z.record(z.any()).optional().default({}),
    id: JsonRpcIdSchema.optional(),
  });

  const parsedRequest = JsonRpcRequestSchema.safeParse(requestBody);

  if (!parsedRequest.success) {
    return c.json(
      createJsonRpcErrorResponse(
        jsonRpcId === undefined ? null : jsonRpcId,
        -32600,
        `Invalid JSON-RPC Request: ${parsedRequest.error.errors
          .map((e) => `${e.path.join(".")} - ${e.message}`)
          .join(", ")}`,
        parsedRequest.error.format()
      ),
      400
    );
  }

  const { method, params, id: requestId } = parsedRequest.data;
  const serverRequestId = c.get("requestId");

  const logger = serverLogger.child({
    method,
    internalRequestId: serverRequestId,
    jsonRpcId: requestId,
  });

  if (method === "resources/list") {
    logger.info("Handling resources/list request");
    try {
      ListResourcesRequestSchema.parse(params);
      const response = await handleListResources(params || {}, requestId!);
      return c.json(response);
    } catch (error: any) {
      logger.error("Error handling resources/list", error);
      return c.json(
        createJsonRpcErrorResponse(
          requestId!,
          -32603,
          `Internal server error handling resources/list: ${error.message}`
        ),
        500
      );
    }
  }
  if (method === "resources/read") {
    logger.info("Handling resources/read request");
    try {
      const validatedParams = ReadResourceRequestSchema.parse(params);
      const response = await handleReadResource(validatedParams, requestId!);
      return c.json(response);
    } catch (error: any) {
      logger.error("Error handling resources/read", error);
      const errorCode = error instanceof z.ZodError ? -32602 : -32603;
      const errorMessage =
        error instanceof z.ZodError
          ? `Invalid parameters for resources/read: ${error.errors
              .map((e) => `${e.path.join(".")} - ${e.message}`)
              .join(", ")}`
          : `Internal server error handling resources/read: ${error.message}`;
      return c.json(
        createJsonRpcErrorResponse(
          requestId!,
          errorCode,
          errorMessage,
          error instanceof z.ZodError ? error.format() : undefined
        ),
        errorCode === -32602 ? 400 : 500
      );
    }
  }

  const toolName = method;
  const toolLogger = logger;
  const parameters = params;

  if (!toolRegistry.isToolRegistered(toolName)) {
    toolLogger.warn("Unknown method/tool requested");
    return c.json(
      createJsonRpcErrorResponse(
        requestId!,
        -32601,
        `Method not found: Method or Tool '${toolName}' is not available.`,
        {
          availableMethods: [
            "resources/list",
            "resources/read",
            ...toolRegistry.getAllTools().map((t) => t.name),
          ],
        }
      ),
      404
    );
  }

  if (config.auth.enableAuth) {
    const auth = c.get("auth") as AuthContext["auth"];
    if (!auth) {
      toolLogger.error(
        "Auth context missing despite auth being enabled. Check middleware order."
      );
      return c.json(
        createJsonRpcErrorResponse(
          requestId!,
          -32603,
          "Internal Server Error: Auth context missing."
        ),
        500
      );
    }
    const tool = toolRegistry.getToolDefinition(toolName);
    if (!tool) {
      toolLogger.error(
        `Tool definition not found for '${toolName}' despite being registered.`
      );
      return c.json(
        createJsonRpcErrorResponse(
          requestId!,
          -32603,
          "Internal Server Error: Tool definition missing."
        ),
        500
      );
    }
    const requiredPermission = tool.metadata?.permissionLevel || "public";
    const clientInfo = auth.isAuthenticated
      ? {
          id: auth.clientId!,
          name: auth.clientName!,
          permissions: auth.permissions as any,
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
        createJsonRpcErrorResponse(
          requestId!,
          -32000,
          `Access Denied: Insufficient permissions to use tool '${toolName}'. Required: ${requiredPermission}.`
        ),
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
  if (wantsStreaming) delete toolParameters.stream;

  toolLogger.info(
    `JSON-RPC tool execution ${
      wantsStreaming ? "started (streaming)" : "started"
    }`,
    { parameters: toolParameters }
  );

  if (wantsStreaming) {
    toolLogger.debug("Initiating streaming response for JSON-RPC request", {
      toolName,
      requestId,
    });
    try {
      const stream = new TransformStream();
      const writer = stream.writable.getWriter();
      const encoder = new TextEncoder();
      executeToolFunction(
        toolName,
        toolParameters,
        writer,
        encoder,
        requestId
      ).catch((err) => {
        toolLogger.error(
          `Error during executeTool setup for streaming: ${
            err instanceof Error ? err.message : String(err)
          }`,
          err instanceof Error ? err : undefined
        );
        try {
          const errorPayload =
            JSON.stringify({
              jsonrpc: "2.0",
              error: {
                code: -32603,
                message: "Server error during streaming setup.",
              },
              id: requestId === undefined ? null : requestId,
            }) + "\n";
          writer.write(encoder.encode(errorPayload));
          writer.close();
        } catch (writeError) {
          toolLogger.error(
            "Failed to close writer after setup error",
            writeError instanceof Error ? writeError : undefined
          );
        }
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
        createJsonRpcErrorResponse(
          requestId!,
          -32603,
          "Internal server error setting up stream.",
          undefined
        ),
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
        createJsonRpcErrorResponse(
          requestId!,
          jsonRpcErrorCode,
          jsonRpcErrorMessage,
          config.server.environment === "development" ? error.stack : undefined
        ),
        jsonRpcErrorCode === -32602 ? 400 : 500
      );
    } finally {
      endToolMetricTracker();
    }
  }
});

app.notFound(notFound);

if (import.meta.main) {
  //TODO: tool loading and Bun.serve call ...
}

export default app;
