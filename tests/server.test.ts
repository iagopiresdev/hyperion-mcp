import { describe, expect, it } from "bun:test";
import { app } from "../index";

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
