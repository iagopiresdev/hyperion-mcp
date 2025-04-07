import { describe, expect, it } from "bun:test";
import { app } from "../index";
import { toolRegistry } from "../src/registry";
import { config } from "../src/utils/config";

//TODO: set up in a beforeAll hook using the (future) manage-keys script or direct DB access
const TEST_CLIENT_ID =
  process.env.TEST_AUTH_CLIENT_ID || "test-client-for-auth";
const TEST_API_KEY = process.env.TEST_AUTH_API_KEY || "test-key-for-auth-123";
const TEST_ADMIN_API_KEY =
  process.env.TEST_ADMIN_API_KEY || "test-admin-key-for-auth-123";
const TEST_ADMIN_CLIENT_ID =
  process.env.TEST_ADMIN_CLIENT_ID || "test-admin-client";

describe("Server Endpoints", () => {
  it("GET / should return server info", async () => {
    const res = await app.request("/");
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toHaveProperty("name", "hyperion-mcp");
    expect(body).toHaveProperty("version");
    expect(body).toHaveProperty("tools");
    expect(Array.isArray(body.tools)).toBe(true);
  });

  it("GET /health should return status ok", async () => {
    const res = await app.request("/health");
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toHaveProperty("status", "ok");
    expect(body).toHaveProperty("timestamp");
  });

  it("GET /tools should return a list of tools", async () => {
    const res = await app.request("/tools");
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toHaveProperty("tools");
    expect(Array.isArray(body.tools)).toBe(true);
    const toolNames = body.tools.map((t: { name: string }) => t.name);
    expect(toolNames).toContain("create_task");
    expect(toolNames).toContain("list_tasks");
    expect(toolNames).toContain("complete_task");
    expect(toolNames).toContain("openai_query");
    expect(toolNames).toContain("slow_task");
  });
});

describe("JSON-RPC /invoke Endpoint", () => {
  const request = (payload: any, headers: Record<string, string> = {}) => {
    return app.request("/invoke", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...headers,
      },
      body: JSON.stringify(payload),
    });
  };

  const defaultHeaders: Record<string, string> = {};
  if (config.auth.enabled) {
    defaultHeaders["Authorization"] = `Bearer ${TEST_API_KEY}`;
    defaultHeaders["X-Client-ID"] = TEST_CLIENT_ID;
  }

  // Non-Streaming Tests
  it("should execute a simple tool successfully", async () => {
    const payload = {
      jsonrpc: "2.0",
      method: "list_tasks",
      params: {},
      id: "test-1",
    };
    const res = await request(payload, defaultHeaders);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.jsonrpc).toBe("2.0");
    expect(body.id).toBe("test-1");
    expect(body.result).toBeDefined();
    expect(
      Array.isArray(body.result.content) ||
        (typeof body.result.content === "object" &&
          body.result.content !== null &&
          Object.keys(body.result.content).length === 0)
    ).toBe(true);
    expect(body.error).toBeUndefined();
  });

  it("should return error for non-existent tool", async () => {
    const payload = {
      jsonrpc: "2.0",
      method: "non_existent_tool",
      id: "test-2",
    };
    const res = await request(payload, defaultHeaders);
    expect(res.status).toBe(404);
    const body = await res.json();
    expect(body.jsonrpc).toBe("2.0");
    expect(body.id).toBe("test-2");
    expect(body.error).toBeDefined();
    expect(body.error.code).toBe(-32601);
    expect(body.error.message).toContain("Method not found");
    expect(body.result).toBeUndefined();
  });

  it("should return error for invalid JSON-RPC request (missing method)", async () => {
    const payload = {
      jsonrpc: "2.0",
      // method: "list_tasks", // Missing
      params: {},
      id: "test-3",
    };
    const res = await request(payload, defaultHeaders);
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.jsonrpc).toBe("2.0");
    expect(body.id).toBe("test-3");
    expect(body.error).toBeDefined();
    expect(body.error.code).toBe(-32600); // Invalid Request
    expect(body.error.message).toContain("Invalid JSON-RPC Request");
  });

  it("should return error for invalid JSON payload", async () => {
    const headersToSend = new Headers({ "Content-Type": "application/json" });
    if (config.auth.enabled) {
      headersToSend.set("Authorization", `Bearer ${TEST_API_KEY}`);
      headersToSend.set("X-Client-ID", TEST_CLIENT_ID);
    }
    const res = await app.request("/invoke", {
      method: "POST",
      headers: headersToSend,
      body: '{"jsonrpc": "2.0", "method": "list_tasks", ',
    });
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error?.code).toBe(-32700);
  });

  it("should handle tool execution errors correctly (isError)", async () => {
    // Assumes 'create_task' throws ToolExecutionError if title is invalid/missing per its zod schema
    const payload = {
      jsonrpc: "2.0",
      method: "create_task",
      params: { description: "A task without a title" },
      id: "test-exec-err",
    };
    const res = await request(payload, defaultHeaders);
    expect(res.status).toBe(200); // Tool Execution Error returns 200 OK with error in result
    const body = await res.json();
    expect(body.jsonrpc).toBe("2.0");
    expect(body.id).toBe("test-exec-err");
    expect(body.result).toBeDefined();
    expect(body.result.metadata?.isError).toBe(true);
    expect(body.result.content?.validationErrors).toBeArray();
    expect(body.result.content?.validationErrors[0]?.message).toMatch(
      /title is required/i
    );
    expect(body.error).toBeUndefined(); // No top-level protocol error
  });

  // Streaming Tests
  it("should handle streaming request with JSON Lines response", async () => {
    const payload = {
      jsonrpc: "2.0",
      method: "slow_task", // Use the example streaming tool
      params: { stream: true, items: 3, delay: 100 }, // Increase delay
      id: "test-stream-1",
    };
    const res = await request(payload, defaultHeaders);
    expect(res.status).toBe(200);
    expect(res.headers.get("Content-Type")).toBe("application/jsonl");
    expect(res.headers.get("Transfer-Encoding")).toBe("chunked");

    const reader = res.body?.getReader();
    expect(reader).toBeDefined();
    if (!reader) return;

    const decoder = new TextDecoder();
    let buffer = "";
    let chunksReceived = 0;
    let isComplete = false;
    let finalResult: any = null;

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });

      const lines = buffer.split("\n");
      buffer = lines.pop() || ""; // Keep incomplete line in buffer

      for (const line of lines) {
        if (line.trim()) {
          chunksReceived++;
          try {
            const chunk = JSON.parse(line);
            console.log(
              "[TEST STREAM DEBUG] Received chunk:",
              JSON.stringify(chunk, null, 2)
            );
            expect(chunk.jsonrpc).toBe("2.0");
            expect(chunk.id).toBe("test-stream-1");
            expect(chunk.result).toBeDefined();
            if (chunk.result.metadata?.final === true) {
              console.log("[TEST STREAM DEBUG] Final chunk detected!");
              isComplete = true;
              finalResult = chunk.result;
            }
          } catch (e) {
            console.error("[TEST STREAM DEBUG] Failed to parse line:", line, e);
            throw e;
          }
        }
      }
    }

    // Process any remaining data in the buffer after the loop ends
    if (buffer.trim()) {
      chunksReceived++;
      try {
        const chunk = JSON.parse(buffer);
        console.log(
          "[TEST STREAM DEBUG] Received final buffer chunk:",
          JSON.stringify(chunk, null, 2)
        );
        expect(chunk.jsonrpc).toBe("2.0");
        expect(chunk.id).toBe("test-stream-1");
        expect(chunk.result).toBeDefined();
        if (chunk.result.metadata?.final === true) {
          console.log("[TEST STREAM DEBUG] Final chunk detected in buffer!");
          isComplete = true;
          finalResult = chunk.result;
        }
      } catch (e) {
        console.error(
          "[TEST STREAM DEBUG] Failed to parse final buffer:",
          buffer,
          e
        );
        throw e;
      }
    }

    // Ensure stream ended and we got chunks + a final one
    expect(chunksReceived).toBeGreaterThan(1); // Should receive intermediate + final
    expect(isComplete).toBe(true);
    expect(finalResult?.content?.summary?.total).toBe(3);
  }, 1000);

  // Authentication / Authorization Tests (Run only if auth enabled)
  if (config.auth.enabled) {
    //TODO: create dummy schema here so it's accessible to both tests below
    const dummyAdminToolParams = { type: "object", properties: {} } as const;

    it("should fail without Authorization header", async () => {
      const payload = { jsonrpc: "2.0", method: "list_tasks", id: "auth-1" };
      const res = await request(payload, { "X-Client-ID": TEST_CLIENT_ID }); // No Auth header
      expect(res.status).toBe(401);
      const body = await res.json();
      expect(body.error).toBe("Authentication failed"); // Error from middleware
    });

    it("should fail without X-Client-ID header", async () => {
      const payload = { jsonrpc: "2.0", method: "list_tasks", id: "auth-2" };
      const res = await request(payload, {
        Authorization: `Bearer ${TEST_API_KEY}`,
      }); // No Client ID
      //FIXME: Currently, validation fails inside authenticate(), might return 200 if auth context is just empty
      // OR could return 401/403 depending on how middleware handles it.
      // Let's assume it fails validation and we get a protocol error from /invoke
      expect(res.status).toBe(500); // Or 401/403? Depends on exact flow - CHECK THIS
      // Check if the log shows 'Authentication failed' - requires log inspection or specific error msg
    });

    it("should fail with invalid API Key", async () => {
      const payload = { jsonrpc: "2.0", method: "list_tasks", id: "auth-3" };
      const res = await request(payload, {
        Authorization: `Bearer invalid-key`,
        "X-Client-ID": TEST_CLIENT_ID,
      });
      expect(res.status).toBe(401);
      const body = await res.json();
      expect(body.error).toBe("Authentication failed");
    });

    it("should fail with invalid Client ID", async () => {
      const payload = { jsonrpc: "2.0", method: "list_tasks", id: "auth-4" };
      const res = await request(payload, {
        Authorization: `Bearer ${TEST_API_KEY}`,
        "X-Client-ID": "invalid-client-id",
      });
      expect(res.status).toBe(401);
      const body = await res.json();
      expect(body.error).toBe("Authentication failed"); // Middleware catches failure from authService
    });

    it("should deny access to protected tool with insufficient permissions", async () => {
      toolRegistry.register({
        name: "admin_only_tool",
        description: "Admin only",
        parameters: dummyAdminToolParams,
        permissionLevel: "admin",
        handler: async () => ({ content: "Admin access granted" }),
      });

      const payload = {
        jsonrpc: "2.0",
        method: "admin_only_tool",
        id: "auth-5",
      };
      const res = await request(payload, defaultHeaders);

      expect(res.status).toBe(403);
      const body = await res.json();
      expect(body.jsonrpc).toBe("2.0");
      expect(body.error).toBeDefined();
      expect(body.error.code).toBe(-32000);
      expect(body.error.message).toContain("Access Denied");

      toolRegistry.unregister("admin_only_tool");
    });

    it("should allow access to protected tool with sufficient permissions", async () => {
      toolRegistry.register({
        name: "admin_tool_allowed",
        description: "Admin only",
        parameters: dummyAdminToolParams,
        permissionLevel: "admin",
        handler: async () => ({ content: "Admin access granted" }),
      });

      const payload = {
        jsonrpc: "2.0",
        method: "admin_tool_allowed",
        id: "auth-6",
      };
      const adminHeaders = { ...defaultHeaders };
      adminHeaders["Authorization"] = `Bearer ${TEST_ADMIN_API_KEY}`;
      adminHeaders["X-Client-ID"] = TEST_ADMIN_CLIENT_ID;
      const res = await request(payload, adminHeaders);

      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.jsonrpc).toBe("2.0");
      expect(body.result?.content).toBe("Admin access granted");
      expect(body.error).toBeUndefined();

      toolRegistry.unregister("admin_tool_allowed");
    });
  }
});
