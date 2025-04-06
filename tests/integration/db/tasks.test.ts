import { afterAll, describe, expect, it } from "bun:test";
import { db } from "../../../src/db/memory";
import { supabase } from "../../../src/utils/supabaseClient";

//TODO: Skip tests if Supabase creds aren't set, prevents CI failures
const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_KEY;
const runSupabaseTests = SUPABASE_URL && SUPABASE_KEY;

describe.if(Boolean(runSupabaseTests))(
  "Task DB Integration Tests (Supabase)",
  () => {
    const testTasksIds: string[] = []; // Keeps track of created IDs for cleanup

    afterAll(async () => {
      if (testTasksIds.length > 0) {
        console.log(
          `Cleaning up ${testTasksIds.length} test tasks from Supabase...`
        );
        const { error } = await supabase
          .from("tasks")
          .delete()
          .in("id", testTasksIds);
        if (error) {
          console.error("Error during test task cleanup:", error);
        }
      }
    });

    it("should create a new task", async () => {
      const taskData = {
        title: "Supabase Test Task 1",
        description: "Testing creation",
      };
      const createdTask = await db.createTask(taskData);

      expect(createdTask).toBeDefined();
      expect(createdTask).not.toBeNull();
      expect(createdTask?.id).toBeString();
      expect(createdTask?.title).toBe(taskData.title);
      expect(createdTask?.description).toBe(taskData.description);
      expect(createdTask?.completed).toBe(false);
      expect(createdTask?.createdAt).toBeString();
      if (createdTask?.id) testTasksIds.push(createdTask.id);
    });

    it("should retrieve a specific task by ID", async () => {
      const taskData = {
        title: "Supabase Test Task 2 (for get)",
        description: "Testing getTask",
      };
      const createdTask = await db.createTask(taskData);
      expect(createdTask?.id).toBeDefined();
      if (createdTask?.id) testTasksIds.push(createdTask.id);

      const fetchedTask = await db.getTask(createdTask!.id);
      expect(fetchedTask).toBeDefined();
      expect(fetchedTask).not.toBeNull();
      expect(fetchedTask?.id).toBe(createdTask!.id);
      expect(fetchedTask?.title).toBe(taskData.title);
    });

    it("should return null when getting a non-existent task", async () => {
      const fetchedTask = await db.getTask("non-existent-id-123");
      expect(fetchedTask).toBeNull();
    });

    it("should list all tasks", async () => {
      const task1 = await db.createTask({ title: "List Test Task 1" });
      const task2 = await db.createTask({ title: "List Test Task 2" });
      if (task1?.id) testTasksIds.push(task1.id);
      if (task2?.id) testTasksIds.push(task2.id);

      const allTasks = await db.listTasks();
      expect(allTasks).toBeArray();
      expect(allTasks.length).toBeGreaterThanOrEqual(2); //FIXME: Should include at least the ones we just created
      //TODO: Check if our specific tasks are present (more robust check)
      expect(allTasks.some((t) => t.id === task1?.id)).toBeTrue();
      expect(allTasks.some((t) => t.id === task2?.id)).toBeTrue();
    });

    it("should list only active tasks", async () => {
      const activeTask = await db.createTask({ title: "Active List Test" });
      const completedTaskData = { title: "Completed List Test" };
      let completedTask = await db.createTask(completedTaskData);
      if (activeTask?.id) testTasksIds.push(activeTask.id);
      if (completedTask?.id) {
        testTasksIds.push(completedTask.id);
        completedTask = await db.updateTask(completedTask.id, {
          completed: true,
        });
        expect(completedTask?.completed).toBeTrue();
      }

      const activeTasks = await db.listTasks("active");
      expect(activeTasks).toBeArray();
      expect(activeTasks.some((t) => t.id === activeTask?.id)).toBeTrue();
      expect(activeTasks.some((t) => t.id === completedTask?.id)).toBeFalse(); //FIXME: Ensure completed one is not listed
    });

    it("should list only completed tasks", async () => {
      const activeTask = await db.createTask({ title: "Active List Test 2" });
      const completedTaskData = { title: "Completed List Test 2" };
      let completedTask = await db.createTask(completedTaskData);
      if (activeTask?.id) testTasksIds.push(activeTask.id);
      if (completedTask?.id) {
        testTasksIds.push(completedTask.id);
        completedTask = await db.updateTask(completedTask.id, {
          completed: true,
        });
        expect(completedTask?.completed).toBeTrue();
      }

      const completedTasks = await db.listTasks("completed");
      expect(completedTasks).toBeArray();
      expect(completedTasks.some((t) => t.id === activeTask?.id)).toBeFalse();
      expect(completedTasks.some((t) => t.id === completedTask?.id)).toBeTrue();
    });

    it("should update a task", async () => {
      const taskData = {
        title: "Update Test Task",
        description: "Initial Desc",
      };
      const createdTask = await db.createTask(taskData);
      expect(createdTask?.id).toBeDefined();
      if (createdTask?.id) testTasksIds.push(createdTask.id);

      const updates = {
        title: "Updated Task Title",
        description: "Updated Desc",
        completed: true,
      };
      const updatedTask = await db.updateTask(createdTask!.id, updates);

      expect(updatedTask).toBeDefined();
      expect(updatedTask?.id).toBe(createdTask!.id);
      expect(updatedTask?.title).toBe(updates.title);
      expect(updatedTask?.description).toBe(updates.description);
      expect(updatedTask?.completed).toBe(updates.completed);

      //TODO: Verify directly in DB (optional but good sanity check)
      const { data: dbData, error } = await supabase
        .from("tasks")
        .select("*")
        .eq("id", createdTask!.id)
        .single();
      expect(error).toBeNull();
      expect(dbData).toBeDefined();
      expect(dbData.title).toBe(updates.title);
      expect(dbData.completed).toBe(updates.completed);
    });

    it("should return null when updating a non-existent task", async () => {
      const updatedTask = await db.updateTask("non-existent-id-456", {
        title: "Wont Happen",
      });
      expect(updatedTask).toBeNull();
    });

    it("should delete a task", async () => {
      const taskData = { title: "Delete Test Task" };
      const createdTask = await db.createTask(taskData);
      expect(createdTask?.id).toBeDefined();
      const taskId = createdTask!.id;

      const deleted = await db.deleteTask(taskId);
      expect(deleted).toBeTrue();

      const fetchedTask = await db.getTask(taskId);
      expect(fetchedTask).toBeNull();

      const { data: dbData, error } = await supabase
        .from("tasks")
        .select("*")
        .eq("id", taskId)
        .maybeSingle();
      expect(error).toBeNull();
      expect(dbData).toBeNull();
    });

    it("should return false when deleting a non-existent task", async () => {
      const deleted = await db.deleteTask("non-existent-id-789");
      expect(deleted).toBeFalse();
    });
  }
);
