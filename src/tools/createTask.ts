import { db } from "../db/memory";
import { registerTool } from "../registry";
import type { MCPToolResponse } from "../types/mcp";
import { logger } from "../utils/logger";

const toolLogger = logger.child({ tool: "create_task" });

/**
 * Create task tool implementation
 * Creates a new task with the specified parameters
 */
export async function createTask(
  params: Record<string, any>
): Promise<MCPToolResponse> {
  try {
    if (!params.title) {
      throw new Error("Title is required");
    }

    if (params.dueDate && !/^\d{4}-\d{2}-\d{2}$/.test(params.dueDate)) {
      throw new Error("Due date must be in YYYY-MM-DD format");
    }

    const newTask = db.createTask({
      title: params.title,
      description: params.description,
      dueDate: params.dueDate,
    });

    return {
      content: newTask,
      metadata: {
        timestamp: new Date().toISOString(),
      },
    };
  } catch (error) {
    if (process.env.NODE_ENV !== "test") {
      toolLogger.error(
        `Failed to create task with params: ${JSON.stringify(params)}. Error: ${
          (error as Error).message
        }`
      );
    }
    throw new Error(`Failed to create task: ${(error as Error).message}`);
  }
}

registerTool(
  "create_task",
  "Create a new task",
  {
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
  createTask,
  {
    category: "tasks",
    tags: ["write", "create"],
  }
);
