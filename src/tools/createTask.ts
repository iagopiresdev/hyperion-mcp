import { db } from "../db/memory";
import { registerTool } from "../registry";
import type { MCPToolResponse } from "../types/mcp";

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
    console.error("Error creating task:", error);
    throw new Error(`Failed to create task: ${(error as Error).message}`);
  }
}

// Register the tool with the registry
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
