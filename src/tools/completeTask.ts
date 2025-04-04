import { db } from "../db/memory";
import type { MCPToolResponse } from "../types/mcp";

/**
 * Complete task tool implementation
 *
 * Marks a task as completed
 */
export async function completeTask(
  params: Record<string, any>
): Promise<MCPToolResponse> {
  try {
    // Validate required fields
    if (!params.id) {
      throw new Error("Task ID is required");
    }

    // Complete the task
    const task = db.completeTask(params.id);

    if (!task) {
      throw new Error(`Task with ID ${params.id} not found`);
    }

    return {
      content: task,
      metadata: {
        timestamp: new Date().toISOString(),
      },
    };
  } catch (error) {
    console.error("Error completing task:", error);
    throw new Error(`Failed to complete task: ${(error as Error).message}`);
  }
}
