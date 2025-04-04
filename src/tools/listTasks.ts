import { db } from "../db/memory";
import type { MCPToolResponse } from "../types/mcp";

/**
 * List tasks tool implementation
 * Retrieves a list of tasks, optionally filtered by status
 */
export async function listTasks(
  params: Record<string, any>
): Promise<MCPToolResponse> {
  try {
    const status =
      params.status === "completed" || params.status === "active"
        ? params.status
        : "all";

    const tasks = db.listTasks(status);

    return {
      content: tasks,
      metadata: {
        count: tasks.length,
        status,
        timestamp: new Date().toISOString(),
      },
    };
  } catch (error) {
    console.error("Error listing tasks:", error);
    throw new Error(`Failed to list tasks: ${(error as Error).message}`);
  }
}
