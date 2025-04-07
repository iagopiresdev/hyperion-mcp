import { db } from "../db/memory";
import { registerTool } from "../registry";
import type { MCPToolResponse } from "../types/mcp";
import { logger } from "../utils/logger";

const toolLogger = logger.child({ tool: "complete_task" });

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
    if (process.env.NODE_ENV !== "test") {
      toolLogger.error(
        `Failed to complete task with params: ${JSON.stringify(
          params
        )}. Error: ${(error as Error).message}`
      );
    }
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
  "public",
  {
    category: "tasks",
    tags: ["write", "update"],
  }
);
