import { zValidator } from "@hono/zod-validator";
import { Hono } from "hono";
import { z } from "zod";
import type { MCPServerInfo, MCPToolRequest } from "./types/mcp";
import { completeTask } from "./tools/completeTask";
import { createTask } from "./tools/createTask";
import { listTasks } from "./tools/listTasks";

const app = new Hono();

const serverInfo: MCPServerInfo = {
  name: "Task Management MCP Server",
  version: "1.0.0",
  description:
    "MCP server for managing tasks and to-dos, showcasing the Model Context Protocol",
  tools: [
    {
      name: "list_tasks",
      description: "List all tasks or filter by status",
      parameters: {
        type: "object",
        properties: {
          status: {
            type: "string",
            description: "Filter tasks by status (all, completed, active)",
            enum: ["all", "completed", "active"],
          },
        },
        required: [],
      },
    },
    {
      name: "create_task",
      description: "Create a new task",
      parameters: {
        type: "object",
        properties: {
          title: {
            type: "string",
            description: "The title of the task",
          },
          description: {
            type: "string",
            description: "A detailed description of the task",
          },
          dueDate: {
            type: "string",
            description: "The due date of the task in ISO format (YYYY-MM-DD)",
            format: "date",
          },
        },
        required: ["title"],
      },
    },
    {
      name: "complete_task",
      description: "Mark a task as completed",
      parameters: {
        type: "object",
        properties: {
          id: {
            type: "string",
            description: "The ID of the task to mark as completed",
          },
        },
        required: ["id"],
      },
    },
  ],
};

app.get("/", (c) => {
  return c.json(serverInfo);
});

app.post(
  "/tools",
  zValidator(
    "json",
    z.object({
      name: z.string(),
      parameters: z.record(z.any()),
    })
  ),
  async (c) => {
    const request = c.req.valid("json") as MCPToolRequest;
    const { name, parameters } = request;

    try {
      switch (name) {
        case "list_tasks":
          return c.json(await listTasks(parameters));
        case "create_task":
          return c.json(await createTask(parameters));
        case "complete_task":
          return c.json(await completeTask(parameters));
        default:
          return c.json({ error: `Unknown tool: ${name}` }, 400);
      }
    } catch (error) {
      console.error(`Error executing tool ${name}:`, error);
      return c.json(
        { error: `Error executing tool: ${(error as Error).message}` },
        500
      );
    }
  }
);

app.options("*", (c) => {
  c.status(204);
  c.header("Access-Control-Allow-Origin", "*");
  c.header("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  c.header("Access-Control-Allow-Headers", "Content-Type");
  return c.body(null);
});

app.use("*", async (c, next) => {
  await next();
  c.header("Access-Control-Allow-Origin", "*");
  c.header("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  c.header("Access-Control-Allow-Headers", "Content-Type");
});

const port = process.env.PORT || 3333;
console.log(`MCP Server starting on http://localhost:${port}`);

export default {
  port,
  fetch: app.fetch,
};
