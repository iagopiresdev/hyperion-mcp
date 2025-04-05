import { beforeEach, describe, expect, it } from "bun:test";
import { db } from "../../src/db/memory";
import { createTask } from "../../src/tools/createTask";

describe("Tool: create_task", () => {
  beforeEach(() => {
    db._resetTasks();
  });

  it("should create a new task with valid parameters", async () => {
    const params = {
      title: "Test Task",
      description: "This is a test description",
      dueDate: "2025-12-31",
    };

    const response = await createTask(params);

    expect(response.content).toBeDefined();
    expect(response.metadata?.timestamp).toBeDefined();

    const createdTask = response.content;
    expect(createdTask.title).toBe(params.title);
    expect(createdTask.description).toBe(params.description);
    expect(createdTask.dueDate).toBe(params.dueDate);
    expect(createdTask.completed).toBe(false);
    expect(createdTask.id).toBeDefined();
    expect(createdTask.createdAt).toBeDefined();

    const tasksInDb = db.listTasks();
    expect(tasksInDb).toHaveLength(1);
    expect(tasksInDb[0]).toEqual(createdTask);
  });

  it("should create a task with only the required title", async () => {
    const params = {
      title: "Minimal Task",
    };

    const response = await createTask(params);
    expect(response.content.title).toBe(params.title);
    expect(response.content.description).toBeUndefined();
    expect(response.content.dueDate).toBeUndefined();

    const tasksInDb = db.listTasks();
    expect(tasksInDb).toHaveLength(1);
    expect(tasksInDb[0].title).toBe(params.title);
  });

  it("should throw an error if title is missing", async () => {
    const params = {
      description: "Missing title",
    };

    await expect(createTask(params)).rejects.toThrow(
      "Failed to create task: Title is required"
    );

    const tasksInDb = db.listTasks();
    expect(tasksInDb).toHaveLength(0);
  });

  it("should throw an error for invalid date format", async () => {
    const params = {
      title: "Invalid Date Task",
      dueDate: "31-12-2025",
    };

    await expect(createTask(params)).rejects.toThrow(
      "Failed to create task: Due date must be in YYYY-MM-DD format"
    );

    const tasksInDb = db.listTasks();
    expect(tasksInDb).toHaveLength(0);
  });
});
