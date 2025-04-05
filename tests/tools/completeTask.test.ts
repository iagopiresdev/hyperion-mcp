import { beforeEach, describe, expect, it } from "bun:test";
import { db } from "../../src/db/memory";
import { completeTask } from "../../src/tools/completeTask";

describe("Tool: complete_task", () => {
  let taskToCompleteId: string;

  // Reset and populate the in-memory database before each test
  beforeEach(() => {
    db._resetTasks();
    // Add a task to be completed
    const task = db.createTask({ title: "Task To Complete" });
    taskToCompleteId = task.id;
    // Add another task
    db.createTask({ title: "Another Task" });
  });

  it("should mark an existing task as completed", async () => {
    const params = { id: taskToCompleteId };
    const response = await completeTask(params);

    expect(response.content).toBeDefined();
    expect(response.metadata?.timestamp).toBeDefined();
    expect(response.metadata?.completed).toBe(true);

    const completedTask = response.content;
    expect(completedTask.id).toBe(taskToCompleteId);
    expect(completedTask.completed).toBe(true);

    // Verify in the db
    const taskInDb = db.getTask(taskToCompleteId);
    expect(taskInDb?.completed).toBe(true);

    // Verify other tasks are unaffected
    const otherTasks = db.listTasks().filter((t) => t.id !== taskToCompleteId);
    expect(otherTasks[0].completed).toBe(false);
  });

  it("should throw an error if id is missing", async () => {
    const params = {}; // Missing id
    await expect(completeTask(params)).rejects.toThrow(
      "Failed to complete task: Task ID is required"
    );
  });

  it("should throw an error if task id does not exist", async () => {
    const params = { id: "non-existent-id" };
    await expect(completeTask(params)).rejects.toThrow(
      "Failed to complete task: Task with ID non-existent-id not found"
    );
  });

  it("should return the updated task even if already completed", async () => {
    // Complete it once
    await completeTask({ id: taskToCompleteId });

    // Attempt to complete it again
    const params = { id: taskToCompleteId };
    const response = await completeTask(params);

    expect(response.content).toBeDefined();
    expect(response.content.completed).toBe(true);

    // Verify in the db
    const taskInDb = db.getTask(taskToCompleteId);
    expect(taskInDb?.completed).toBe(true);
  });
});
