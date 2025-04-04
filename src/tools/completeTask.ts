import { db } from "../db/memory";
import { registerTool } from "../registry";
import type { MCPToolResponse } from "../types/mcp";

/**
 * Complete task tool implementation
 * Marks a task as completed based on its ID
 */
export async function completeTask(
  params: Record<string, any>
): Promise<MCPToolResponse> {
  try {
    if (!params.id) {
      throw new Error("Task ID is required");
    }

    const task = db.completeTask(params.id);
    if (!task) {
      throw new Error(`Task with ID ${params.id} not found`);
    }

    return {
      content: task,
      metadata: {
        completed: true,
        timestamp: new Date().toISOString(),
      },
    };
  } catch (error) {
    console.error("Error completing task:", error);
    throw new Error(`Failed to complete task: ${(error as Error).message}`);
  }
}

// Register the tool with the registry
registerTool(
  "complete_task",
  "Mark a task as completed",
  {
    type: "object",
    properties: {
      id: {
        type: "string",
        description: "The ID of the task to mark as completed",
      },
    },
    required: ["id"],
  },
  completeTask,
  {
    category: "tasks",
    tags: ["write", "update"],
  }
);
