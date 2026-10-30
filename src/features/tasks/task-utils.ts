import { endOfDay } from "date-fns";
import type { Priority, TaskLink, TaskStatus, TaskType, User, WarehouseTask } from "@/types";
import type { Permission } from "@/lib/constants";
import { parseDate } from "@/lib/format";

export const TASK_TYPES: TaskType[] = ["receiving", "putaway", "picking", "packing", "transfer", "stock_count", "general"];

export const TASK_TYPE_LABELS: Record<TaskType, string> = {
  receiving: "Receiving",
  putaway: "Putaway",
  picking: "Picking",
  packing: "Packing",
  transfer: "Transfer",
  stock_count: "Stock Count",
  general: "General",
};

export const TASK_STATUSES: TaskStatus[] = ["pending", "in_progress", "blocked", "completed"];

export const TASK_STATUS_LABELS: Record<TaskStatus, string> = {
  pending: "Pending",
  in_progress: "In Progress",
  blocked: "Blocked",
  completed: "Completed",
};

export const TASK_PRIORITIES: Priority[] = ["low", "normal", "high", "urgent"];

export const PRIORITY_LABELS: Record<Priority, string> = { low: "Low", normal: "Normal", high: "High", urgent: "Urgent" };

const PRIORITY_RANK: Record<Priority, number> = { urgent: 0, high: 1, normal: 2, low: 3 };
export const priorityRank = (p: Priority) => PRIORITY_RANK[p];

export function taskLinkHref(link: TaskLink): string {
  switch (link.kind) {
    case "order":
      return `/orders/${link.id}`;
    case "receipt":
      return `/receiving/${link.id}`;
    case "transfer":
      return `/transfers/${link.id}`;
    case "return":
      return `/returns/${link.id}`;
    case "purchase_order":
      return `/purchase-orders/${link.id}`;
    case "product":
      return `/products/${link.id}`;
  }
}

/** Overdue = still open and the due day has fully passed. */
export function isTaskOverdue(task: WarehouseTask, nowMs: number): boolean {
  if (task.status === "completed") return false;
  const due = parseDate(task.dueDate);
  return !!due && endOfDay(due).getTime() < nowMs;
}

/** Workflow-generated tasks are completed by performing the linked workflow step. */
export function isWorkflowTask(task: WarehouseTask): boolean {
  return !!task.link && task.type !== "general" && task.type !== "stock_count";
}

/**
 * Simulated permission rule: needs tasks.write; operators may only touch their own tasks.
 * (Prototype only - not real security.)
 */
export function canModifyTask(task: WarehouseTask, user: User | null, can: (p: Permission) => boolean): boolean {
  if (!user || !can("tasks.write")) return false;
  if (user.role === "operator") return task.assigneeId === user.id;
  return true;
}
