import { PostgrestError } from "@supabase/supabase-js";
import { supabase } from "../utils/supabaseClient";

export interface Task {
  id: string;
  title: string;
  description?: string | null;
  dueDate?: string | null; // Allow null from DB, map to due_date
  completed: boolean;
  createdAt: string;
}

const handleSupabaseError = (error: PostgrestError | null, context: string) => {
  if (error) {
    console.error(`Supabase error in ${context}:`, error.message);
    return true;
  }
  return false;
};

// Supabase JS v2 handles this automatically for basic cases, but explicit is safer
const mapRowToTask = (row: any): Task => ({
  id: row.id,
  title: row.title,
  description: row.description,
  dueDate: row.due_date ? new Date(row.due_date).toISOString() : null,
  completed: row.completed,
  createdAt: new Date(row.created_at).toISOString(),
});

export const db = {
  listTasks: async (
    status?: "all" | "completed" | "active"
  ): Promise<Task[]> => {
    let query = supabase.from("tasks").select("*");

    if (status === "completed") {
      query = query.eq("completed", true);
    } else if (status === "active") {
      query = query.eq("completed", false);
    }
    // Default 'all' requires no filter on completed status

    query = query.order("created_at", { ascending: false }); // Example ordering

    const { data, error } = await query;

    if (handleSupabaseError(error, "listTasks")) {
      return [];
    }

    return data ? data.map(mapRowToTask) : [];
  },

  getTask: async (id: string): Promise<Task | null> => {
    const { data, error } = await supabase
      .from("tasks")
      .select("*")
      .eq("id", id)
      .maybeSingle();

    if (handleSupabaseError(error, `getTask (id: ${id})`)) {
      return null;
    }

    return data ? mapRowToTask(data) : null;
  },

  //FIXME: Omit might not be fully type-safe with DB defaults (like createdAt, completed)
  createTask: async (
    taskInput: Omit<Task, "id" | "completed" | "createdAt">
  ): Promise<Task | null> => {
    const { data, error } = await supabase
      .from("tasks")
      .insert({
        title: taskInput.title,
        description: taskInput.description,
        due_date: taskInput.dueDate
          ? new Date(taskInput.dueDate).toISOString()
          : null,
      })
      .select()
      .single();

    if (handleSupabaseError(error, "createTask")) {
      return null;
    }

    return data ? mapRowToTask(data) : null;
  },

  updateTask: async (
    id: string,
    updates: Partial<Omit<Task, "id" | "createdAt">>
  ): Promise<Task | null> => {
    // Map Task fields (camelCase) to DB columns (snake_case)
    const dbUpdates: { [key: string]: any } = {};
    if (updates.title !== undefined) dbUpdates.title = updates.title;
    if (updates.description !== undefined)
      dbUpdates.description = updates.description;
    if (updates.dueDate !== undefined) {
      dbUpdates.due_date = updates.dueDate
        ? new Date(updates.dueDate).toISOString()
        : null;
    }
    if (updates.completed !== undefined)
      dbUpdates.completed = updates.completed;

    if (Object.keys(dbUpdates).length === 0) {
      return db.getTask(id);
    }

    const { data, error } = await supabase
      .from("tasks")
      .update(dbUpdates)
      .eq("id", id)
      .select()
      .single();

    if (handleSupabaseError(error, `updateTask (id: ${id})`)) {
      //TODO: Specific check for not found might be needed depending on Supabase error codes (e.g., P0002)
      return null;
    }

    return data ? mapRowToTask(data) : null;
  },

  completeTask: async (id: string): Promise<Task | null> => {
    return db.updateTask(id, { completed: true });
  },

  deleteTask: async (id: string): Promise<boolean> => {
    const { error } = await supabase.from("tasks").delete().eq("id", id);

    if (handleSupabaseError(error, `deleteTask (id: ${id})`)) {
      //FIXME: The operation might "succeed" even if 0 rows were deleted.
      return false;
    }
    return true;
  },
};
