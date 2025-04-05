import { beforeEach, describe, expect, it } from "bun:test";
import { db } from "../../src/db/memory";
import { listTasks } from "../../src/tools/listTasks";

describe("Tool: list_tasks", () => {
  // Reset and populate the in-memory database before each test
  beforeEach(() => {
    db._resetTasks();
    // Add some test data
    db.createTask({ title: "Active Task 1" });
    db.createTask({ title: "Active Task 2", description: "Second active" });
    const completedTask = db.createTask({ title: "Completed Task" });
    db.completeTask(completedTask.id); // Mark one task as completed
  });

  it("should list all tasks when status is 'all' or missing", async () => {
    const responseAll = await listTasks({ status: "all" });
    expect(responseAll.content).toHaveLength(3);
    expect(responseAll.metadata?.count).toBe(3);
    expect(responseAll.metadata?.status).toBe("all");

    const responseMissing = await listTasks({}); // No status parameter
    expect(responseMissing.content).toHaveLength(3);
    expect(responseMissing.metadata?.count).toBe(3);
    expect(responseMissing.metadata?.status).toBe("all");

    const responseInvalid = await listTasks({ status: "invalid" }); // Invalid status parameter
    expect(responseInvalid.content).toHaveLength(3);
    expect(responseInvalid.metadata?.count).toBe(3);
    expect(responseInvalid.metadata?.status).toBe("all");
  });

  it("should list only active tasks when status is 'active'", async () => {
    const response = await listTasks({ status: "active" });
    expect(response.content).toHaveLength(2);
    expect(response.metadata?.count).toBe(2);
    expect(response.metadata?.status).toBe("active");
    // Check that the returned tasks are indeed active
    expect(response.content.every((task: any) => !task.completed)).toBe(true);
  });

  it("should list only completed tasks when status is 'completed'", async () => {
    const response = await listTasks({ status: "completed" });
    expect(response.content).toHaveLength(1);
    expect(response.metadata?.count).toBe(1);
    expect(response.metadata?.status).toBe("completed");
    // Check that the returned task is indeed completed
    expect(response.content[0].title).toBe("Completed Task");
    expect(response.content[0].completed).toBe(true);
  });

  it("should return an empty list if no tasks match the status", async () => {
    db._resetTasks(); // Start with a completely empty db
    const response = await listTasks({ status: "completed" });
    expect(response.content).toHaveLength(0);
    expect(response.metadata?.count).toBe(0);
    expect(response.metadata?.status).toBe("completed");
  });
});
