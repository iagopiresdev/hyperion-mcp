/**
 * Simple in-memory database for tasks (pre-MVP only)
 */

export interface Task {
  id: string;
  title: string;
  description?: string;
  dueDate?: string;
  completed: boolean;
  createdAt: string;
}

let tasks: Task[] = [
  {
    id: "1",
    title: "Implement MCP server",
    description: "Create a Model Context Protocol server for demonstration",
    completed: false,
    createdAt: new Date().toISOString(),
  },
  {
    id: "2",
    title: "Add tool implementations",
    description: "Create proper handlers for MCP tools",
    completed: true,
    createdAt: new Date().toISOString(),
  },
];

export const db = {
  listTasks: (status?: "all" | "completed" | "active") => {
    if (!status || status === "all") {
      return [...tasks];
    }
    return tasks.filter((task) =>
      status === "completed" ? task.completed : !task.completed
    );
  },

  getTask: (id: string) => {
    return tasks.find((task) => task.id === id);
  },

  createTask: (task: Omit<Task, "id" | "completed" | "createdAt">) => {
    const newTask: Task = {
      id: Math.random().toString(36).substring(2, 9),
      ...task,
      completed: false,
      createdAt: new Date().toISOString(),
    };
    tasks.push(newTask);
    return newTask;
  },

  updateTask: (
    id: string,
    updates: Partial<Omit<Task, "id" | "createdAt">>
  ) => {
    const index = tasks.findIndex((task) => task.id === id);
    if (index === -1) return null;

    tasks[index] = {
      ...tasks[index],
      ...updates,
    };
    return tasks[index];
  },

  completeTask: (id: string) => {
    const index = tasks.findIndex((task) => task.id === id);
    if (index === -1) return null;

    tasks[index].completed = true;
    return tasks[index];
  },

  deleteTask: (id: string) => {
    const index = tasks.findIndex((task) => task.id === id);
    if (index === -1) return false;

    tasks.splice(index, 1);
    return true;
  },
};
