import type { Mock } from "bun:test"; // Import Mock as type
import { afterEach, beforeEach, describe, expect, it, spyOn } from "bun:test";

import type { Task } from "../../../src/db/memory";
import { db } from "../../../src/db/memory"; // Import the real db object
import type { MCPToolResponse } from "../../../src/types/mcp";

// Placeholder/Simulated handler logic for complete_task tool
const completeTaskHandler = async (params: any): Promise<MCPToolResponse> => {
  const taskId = params.id as string;

  if (!taskId) {
    throw new Error("Missing required parameter: id");
  }

  // Optional: Handler might check if task exists first using getTask spy
  // const existingTask = await (db.getTask as jest.Mock)(taskId);
  // if (!existingTask) {
  //     throw new Error(`Task with id '${taskId}' not found`);
  // }

  // Call the spy/mock
  const updatedTask = await db.completeTask(taskId);

  if (!updatedTask) {
    throw new Error(
      `Task with id '${taskId}' not found or could not be updated.`
    );
  }

  // Return MCP response structure
  return {
    content: updatedTask,
    metadata: { timestamp: new Date().toISOString() },
  };
};

describe("Unit Test: Tool complete_task", () => {
  // Use Bun's Mock type
  let completeTaskSpy: Mock<(...args: any[]) => Promise<Task | null>>;
  let getTaskSpy: Mock<(...args: any[]) => Promise<Task | null>>;

  const mockTask: Task = {
    id: "task-abc",
    title: "Test Task",
    completed: false,
    createdAt: new Date().toISOString(),
  };
  const mockCompletedTask: Task = { ...mockTask, completed: true };

  beforeEach(() => {
    completeTaskSpy = spyOn(db, "completeTask").mockResolvedValue(null);
    getTaskSpy = spyOn(db, "getTask").mockResolvedValue(mockTask);
  });

  afterEach(() => {
    completeTaskSpy.mockRestore();
    getTaskSpy.mockRestore();
  });

  it("should call db.completeTask with the provided id", async () => {
    completeTaskSpy.mockResolvedValue(mockCompletedTask);
    // getTaskSpy.mockResolvedValue(mockTask); // Ensure getTask mock is set if handler uses it

    const params = { id: mockTask.id };
    const result = await completeTaskHandler(params);

    expect(completeTaskSpy).toHaveBeenCalledTimes(1);
    expect(completeTaskSpy).toHaveBeenCalledWith(mockTask.id);
    expect(result.content).toEqual(mockCompletedTask);
    // Check metadata exists before accessing timestamp
    expect(result.metadata).toBeDefined();
    expect(result.metadata?.timestamp).toMatch(
      /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/
    );
  });

  it("should throw an error if id is missing", async () => {
    const params = {}; // Missing id
    await expect(completeTaskHandler(params)).rejects.toThrow(
      "Missing required parameter: id"
    );
    expect(completeTaskSpy).not.toHaveBeenCalled();
    expect(getTaskSpy).not.toHaveBeenCalled();
  });

  it("should throw an error if db.completeTask returns null (task not found)", async () => {
    // completeTaskSpy already defaults to null
    // If handler uses getTask first:
    // (db.getTask as jest.Mock).mockResolvedValue(mockTask); // Simulate task exists

    const params = { id: "non-existent-id" };
    await expect(completeTaskHandler(params)).rejects.toThrow(
      /not found or could not be updated/
    );
    expect(completeTaskSpy).toHaveBeenCalledTimes(1);
    expect(completeTaskSpy).toHaveBeenCalledWith("non-existent-id");
  });

  it("should re-throw error if db.completeTask rejects", async () => {
    const dbError = new Error("Simulated DB Complete Error");
    completeTaskSpy.mockRejectedValue(dbError);
    // If handler uses getTask first:
    // (db.getTask as jest.Mock).mockResolvedValue(mockTask); // Simulate task exists

    const params = { id: mockTask.id };
    await expect(completeTaskHandler(params)).rejects.toThrow(dbError);
    expect(completeTaskSpy).toHaveBeenCalledTimes(1);
  });

  // Optional test if handler checks existence first using getTask
  // it("should throw an error if getTask returns null", async () => {
  //     (db.getTask as jest.Mock).mockResolvedValue(null); // Simulate task doesn't exist

  //     const params = { id: "non-existent-id" };
  //     await expect(completeTaskHandler(params)).rejects.toThrow(/Task with id .* not found/);
  //     expect(db.getTask).toHaveBeenCalledTimes(1);
  //     expect(db.getTask).toHaveBeenCalledWith("non-existent-id");
  //     expect(db.completeTask).not.toHaveBeenCalled();
  // });
});
