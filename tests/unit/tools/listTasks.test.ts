import type { Mock } from "bun:test"; // Import Mock as type
import { afterEach, beforeEach, describe, expect, it, spyOn } from "bun:test";
import type { Task } from "../../../src/db/memory"; // Import Task type
import { db } from "../../../src/db/memory"; // Import REAL db
import type { MCPToolResponse } from "../../../src/types/mcp";

// Placeholder/Simulated handler logic
const listTasksHandler = async (params: any): Promise<MCPToolResponse> => {
  const status = params.status as "all" | "completed" | "active" | undefined;

  // Basic validation (if any done by the tool handler itself)
  if (status && !["all", "completed", "active"].includes(status)) {
    throw new Error(
      "Invalid status parameter. Must be one of: all, completed, active"
    );
  }

  // Call the spy/mock
  const tasks = await db.listTasks(status);

  // Return MCP response structure
  return {
    content: { tasks: tasks },
    metadata: {
      timestamp: new Date().toISOString(),
      count: tasks.length,
      status: status || "all",
    },
  };
};

describe("Unit Test: Tool list_tasks", () => {
  let listTasksSpy: Mock<(...args: any[]) => Promise<Task[]>>;

  beforeEach(() => {
    // Create spy using spyOn from bun:test
    listTasksSpy = spyOn(db, "listTasks").mockResolvedValue([]);
  });

  afterEach(() => {
    listTasksSpy.mockRestore();
  });

  const mockTask1: Task = {
    id: "1",
    title: "Task 1",
    completed: false,
    createdAt: new Date().toISOString(),
  };
  const mockTask2: Task = {
    id: "2",
    title: "Task 2",
    completed: true,
    createdAt: new Date().toISOString(),
  };
  const mockTasks = [mockTask1, mockTask2];

  it("should call db.listTasks and return tasks when status is missing or 'all'", async () => {
    listTasksSpy.mockResolvedValue(mockTasks);

    const resultNoStatus = await listTasksHandler({});
    expect(listTasksSpy).toHaveBeenCalledWith(undefined);
    expect(resultNoStatus.content.tasks).toEqual(mockTasks);
    expect(resultNoStatus.metadata?.count).toBe(2);
    expect(resultNoStatus.metadata?.status).toBe("all");

    const resultAll = await listTasksHandler({ status: "all" });
    expect(listTasksSpy).toHaveBeenCalledWith("all"); // Assuming db layer treats 'all' explicitly or maps to undefined
    expect(resultAll.content.tasks).toEqual(mockTasks);
    expect(resultAll.metadata?.count).toBe(2);
    expect(resultAll.metadata?.status).toBe("all");

    expect(listTasksSpy).toHaveBeenCalledTimes(2);
  });

  it("should call db.listTasks with 'active' status", async () => {
    const activeTasksMock = [mockTask1];
    listTasksSpy.mockResolvedValue(activeTasksMock);

    const result = await listTasksHandler({ status: "active" });

    expect(listTasksSpy).toHaveBeenCalledTimes(1);
    expect(listTasksSpy).toHaveBeenCalledWith("active");
    expect(result.content.tasks).toEqual(activeTasksMock);
    expect(result.metadata?.count).toBe(1);
    expect(result.metadata?.status).toBe("active");
  });

  it("should call db.listTasks with 'completed' status", async () => {
    const completedTasksMock = [mockTask2];
    listTasksSpy.mockResolvedValue(completedTasksMock);

    const result = await listTasksHandler({ status: "completed" });

    expect(listTasksSpy).toHaveBeenCalledTimes(1);
    expect(listTasksSpy).toHaveBeenCalledWith("completed");
    expect(result.content.tasks).toEqual(completedTasksMock);
    expect(result.metadata?.count).toBe(1);
    expect(result.metadata?.status).toBe("completed");
  });

  it("should return an empty list if db returns empty", async () => {
    // Default mock already returns []
    const result = await listTasksHandler({});
    expect(listTasksSpy).toHaveBeenCalledTimes(1);
    expect(result.content.tasks).toEqual([]);
    expect(result.metadata?.count).toBe(0);
  });

  it("should throw error for invalid status parameter", async () => {
    await expect(listTasksHandler({ status: "invalid" })).rejects.toThrow(
      "Invalid status parameter"
    );
    expect(listTasksSpy).not.toHaveBeenCalled();
  });

  it("should re-throw error if db.listTasks rejects", async () => {
    const dbError = new Error("Simulated DB List Error");
    listTasksSpy.mockRejectedValue(dbError);
    await expect(listTasksHandler({})).rejects.toThrow(dbError);
    expect(listTasksSpy).toHaveBeenCalledTimes(1);
  });
});
