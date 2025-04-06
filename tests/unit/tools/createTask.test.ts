import type { Mock } from "bun:test";
import { afterEach, beforeEach, describe, expect, it, spyOn } from "bun:test";
import type { Task } from "../../../src/db/memory"; // Import Task type for better typing
import { db } from "../../../src/db/memory"; // Import the REAL db object
import type { MCPToolResponse } from "../../../src/types/mcp";

// Placeholder if the handler isn't easily importable - we'll need to adjust
// This simulates the core logic of handling the 'create_task' parameters
// and calling the underlying (mocked) db function.
const createTaskHandler = async (params: any): Promise<MCPToolResponse> => {
  if (
    !params.title ||
    typeof params.title !== "string" ||
    params.title.trim() === ""
  ) {
    throw new Error("Title is required and must be a non-empty string");
  }
  // Simulate potential date validation if the tool does it
  if (params.dueDate && isNaN(Date.parse(params.dueDate))) {
    throw new Error("Invalid dueDate format. Please use ISO 8601 format.");
  }

  // Prepare data for the db function (the actual db function expects specific fields)
  const taskInputForDb = {
    title: params.title,
    description: params.description, // Pass along optional fields
    dueDate: params.dueDate,
  };

  // Call the mocked db function
  // The mock should return what the actual db function would (a Task or null)
  const createdTask = await db.createTask(taskInputForDb);

  // The tool handler function returns an MCPToolResponse structure
  if (!createdTask) {
    // Handle case where db interaction failed (though mock usually succeeds)
    throw new Error("Database operation failed to create task.");
  }
  return {
    content: createdTask, // Return the created task object in the content field
    metadata: { timestamp: new Date().toISOString() },
  };
};

describe("Unit Test: Tool create_task", () => {
  let createTaskSpy: Mock<(...args: any[]) => Promise<Task | null>>;

  beforeEach(() => {
    createTaskSpy = spyOn(db, "createTask").mockResolvedValue(null);
  });

  afterEach(() => {
    createTaskSpy.mockRestore();
  });

  it("should call db.createTask with valid parameters and return structured response", async () => {
    const params = {
      title: "Test Task",
      description: "Unit Test Desc",
      dueDate: new Date().toISOString(),
    };
    const mockReturnTask: Task = {
      id: "mock1",
      completed: false,
      createdAt: new Date().toISOString(),
      ...params,
    };
    createTaskSpy.mockResolvedValue(mockReturnTask);

    const result = await createTaskHandler(params);

    expect(createTaskSpy).toHaveBeenCalledTimes(1);
    expect(createTaskSpy).toHaveBeenCalledWith({
      title: params.title,
      description: params.description,
      dueDate: params.dueDate,
    });

    // Verify the handler returned the correct MCP response structure
    expect(result).toEqual({
      content: mockReturnTask,
      metadata: expect.any(Object),
    });
    // Check metadata exists before accessing timestamp
    expect(result.metadata).toBeDefined();
    expect(result.metadata?.timestamp).toMatch(
      /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/
    );
  });

  it("should call db.createTask with only the required title", async () => {
    const params = { title: "Minimal Task" };
    const mockReturnTask: Task = {
      id: "mock2",
      completed: false,
      createdAt: new Date().toISOString(),
      ...params,
    };
    createTaskSpy.mockResolvedValue(mockReturnTask);

    await createTaskHandler(params);

    expect(createTaskSpy).toHaveBeenCalledTimes(1);
    expect(createTaskSpy).toHaveBeenCalledWith({
      title: params.title,
      description: undefined,
      dueDate: undefined,
    });
  });

  it("should throw an error if title is missing or empty", async () => {
    const paramsMissing = { description: "Missing title" };
    const paramsEmpty = { title: "   ", description: "Empty title" };

    await expect(createTaskHandler(paramsMissing)).rejects.toThrow(
      "Title is required and must be a non-empty string"
    );
    expect(createTaskSpy).not.toHaveBeenCalled();

    await expect(createTaskHandler(paramsEmpty)).rejects.toThrow(
      "Title is required and must be a non-empty string"
    );
    expect(createTaskSpy).not.toHaveBeenCalled();
  });

  it("should throw an error for invalid date format before calling db", async () => {
    const params = { title: "Invalid date task", dueDate: "not-a-date" };
    await expect(createTaskHandler(params)).rejects.toThrow(
      "Invalid dueDate format. Please use ISO 8601 format."
    );
    expect(createTaskSpy).not.toHaveBeenCalled();
  });

  it("should throw an error if db.createTask returns null", async () => {
    const params = { title: "DB Null Task" };
    await expect(createTaskHandler(params)).rejects.toThrow(
      "Database operation failed to create task."
    );
    expect(createTaskSpy).toHaveBeenCalledTimes(1);
  });

  it("should re-throw an error if db.createTask rejects", async () => {
    const params = { title: "DB Fail Task" };
    const dbError = new Error("Simulated DB Error");
    createTaskSpy.mockRejectedValue(dbError);

    await expect(createTaskHandler(params)).rejects.toThrow(dbError);
    expect(createTaskSpy).toHaveBeenCalledTimes(1);
  });
});
