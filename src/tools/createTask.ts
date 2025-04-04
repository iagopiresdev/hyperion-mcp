import { db } from "../db/memory";
import type { MCPToolResponse } from "../types/mcp";

/**
 * Create task tool implementation
 * Creates a new task with the given parameters
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

    const task = db.createTask({
      title: params.title,
      description: params.description,
      dueDate: params.dueDate,
    });

    return {
      content: task,
      metadata: {
        timestamp: new Date().toISOString(),
      },
    };
  } catch (error) {
    console.error("Error creating task:", error);
    throw new Error(`Failed to create task: ${(error as Error).message}`);
  }
}
