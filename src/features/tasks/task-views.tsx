"use client";

import { useState } from "react";
import Link from "next/link";
import { AlertCircle, CalendarClock, CheckCheck, ExternalLink, GripVertical } from "lucide-react";
import type { ID, TaskStatus, User, Warehouse, WarehouseTask } from "@/types";
import { Button } from "@/components/ui/button";
import { DataTable, type Column } from "@/components/shared/data-table";
import { PriorityBadge, StatusBadge } from "@/components/shared/status-badge";
import type { Formatter } from "@/lib/format";
import { cn } from "@/lib/utils";
import { UserAvatar } from "@/features/users/user-avatar";
import { TaskStatusMenu } from "./task-status-menu";
import {
  TASK_STATUSES,
  TASK_STATUS_LABELS,
  TASK_TYPE_LABELS,
  isTaskOverdue,
  priorityRank,
  taskLinkHref,
} from "./task-utils";

export interface TaskViewContext {
  nowMs: number;
  fmt: Formatter;
  users: Map<ID, User>;
  warehouses: Map<ID, Warehouse>;
  canModify: (t: WarehouseTask) => boolean;
  onOpen: (t: WarehouseTask) => void;
  onStatus: (t: WarehouseTask, s: TaskStatus) => void;
  onPutaway: (t: WarehouseTask) => void;
}

const stop = (e: React.SyntheticEvent) => e.stopPropagation();
const MODIFY_REASON = "Operators can only update tasks assigned to them";

function DueLabel({ task, ctx, compact }: { task: WarehouseTask; ctx: TaskViewContext; compact?: boolean }) {
  const overdue = isTaskOverdue(task, ctx.nowMs);
  return (
    <span
      className={cn("inline-flex items-center gap-1 whitespace-nowrap text-xs", overdue ? "font-medium text-danger" : "text-muted-foreground")}
      data-overdue={overdue || undefined}
      title={overdue ? "Overdue" : undefined}
    >
      {overdue ? <AlertCircle className="size-3.5" aria-hidden /> : <CalendarClock className="size-3.5" aria-hidden />}
      {ctx.fmt.date(task.dueDate)}
      {overdue && <span className={compact ? "sr-only" : undefined}>{compact ? "Overdue" : "· Overdue"}</span>}
    </span>
  );
}

function Assignee({ task, ctx }: { task: WarehouseTask; ctx: TaskViewContext }) {
  const u = task.assigneeId ? ctx.users.get(task.assigneeId) : undefined;
  if (!u) return <span className="text-xs text-muted-foreground">Unassigned</span>;
  return (
    <span className="inline-flex min-w-0 items-center gap-1.5">
      <UserAvatar name={u.name} />
      <span className="truncate text-xs">{u.name}</span>
    </span>
  );
}

function PutawayButton({ task, ctx, size = "sm", short }: { task: WarehouseTask; ctx: TaskViewContext; size?: "sm" | "lg"; short?: boolean }) {
  if (task.type !== "putaway" || !task.putaway || task.status === "completed") return null;
  const allowed = ctx.canModify(task);
  return (
    <Button
      size={size}
      disabled={!allowed}
      title={allowed ? "Complete putaway into the suggested bin" : MODIFY_REASON}
      onClick={() => ctx.onPutaway(task)}
      aria-label="Complete putaway"
      data-testid={`complete-putaway-${task.id}`}
    >
      <CheckCheck /> {short ? "Putaway" : "Complete putaway"}
    </Button>
  );
}

/** Card used for the Kanban board and the mobile task list. */
export function TaskCard({
  task,
  ctx,
  showStatus,
  draggable,
}: {
  task: WarehouseTask;
  ctx: TaskViewContext;
  showStatus?: boolean;
  draggable?: boolean;
}) {
  const allowed = ctx.canModify(task);
  return (
    <div
      data-testid={`task-card-${task.id}`}
      data-status={task.status}
      draggable={draggable && allowed}
      onDragStart={(e) => {
        e.dataTransfer.setData("text/task-id", task.id);
        e.dataTransfer.effectAllowed = "move";
      }}
      className={cn(
        "space-y-2.5 rounded-lg border bg-card p-3 shadow-card",
        draggable && allowed && "cursor-grab active:cursor-grabbing",
      )}
    >
      <button
        type="button"
        onClick={() => ctx.onOpen(task)}
        className="block w-full min-w-0 space-y-1.5 rounded-md text-left outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
      >
        <span className="flex items-center justify-between gap-2">
          <span className="flex items-center gap-1 text-xs text-muted-foreground">
            {draggable && allowed && <GripVertical className="size-3.5" aria-hidden />}
            {task.number}
          </span>
          <PriorityBadge priority={task.priority} />
        </span>
        <span className="line-clamp-2 block text-sm font-medium break-words">{task.title}</span>
        <span className="flex flex-wrap items-center gap-1.5">
          <span className="rounded-md bg-muted px-1.5 py-0.5 text-[11px] font-medium text-muted-foreground">{TASK_TYPE_LABELS[task.type]}</span>
          {showStatus && <StatusBadge status={task.status} domain="task" />}
        </span>
      </button>
      <div className="flex items-center justify-between gap-2">
        <Assignee task={task} ctx={ctx} />
        <DueLabel task={task} ctx={ctx} />
      </div>
      <div className="flex flex-wrap items-center gap-2" onClick={stop}>
        <TaskStatusMenu
          task={task}
          size="lg"
          disabled={!allowed}
          disabledReason={MODIFY_REASON}
          onChange={(s) => ctx.onStatus(task, s)}
          className="flex-1 sm:flex-none"
        />
        <PutawayButton task={task} ctx={ctx} size="lg" />
      </div>
    </div>
  );
}

export function TaskTable({ tasks, ctx }: { tasks: WarehouseTask[]; ctx: TaskViewContext }) {
  const columns: Column<WarehouseTask>[] = [
    {
      id: "number",
      header: "Task",
      sortValue: (t) => t.number,
      cell: (t) => (
        <div className="min-w-0 max-w-56">
          <p className="text-xs text-muted-foreground">{t.number}</p>
          <p className="truncate font-medium" title={t.title}>
            {t.title}
          </p>
        </div>
      ),
    },
    { id: "type", header: "Type", sortValue: (t) => TASK_TYPE_LABELS[t.type], cell: (t) => TASK_TYPE_LABELS[t.type] },
    { id: "priority", header: "Priority", sortValue: (t) => priorityRank(t.priority), cell: (t) => <PriorityBadge priority={t.priority} /> },
    { id: "status", header: "Status", sortValue: (t) => TASK_STATUSES.indexOf(t.status), cell: (t) => <StatusBadge status={t.status} domain="task" /> },
    {
      id: "assignee",
      header: "Assignee",
      sortValue: (t) => (t.assigneeId ? ctx.users.get(t.assigneeId)?.name : "~") ?? "~",
      cell: (t) => <Assignee task={t} ctx={ctx} />,
    },
    {
      id: "warehouse",
      header: "Warehouse",
      hideOnMobile: true,
      sortValue: (t) => ctx.warehouses.get(t.warehouseId)?.code,
      cell: (t) => <span className="text-xs">{ctx.warehouses.get(t.warehouseId)?.code ?? "—"}</span>,
    },
    { id: "due", header: "Due", sortValue: (t) => t.dueDate, cell: (t) => <DueLabel task={t} ctx={ctx} compact /> },
    {
      id: "link",
      header: "Linked record",
      hideOnMobile: true,
      cell: (t) =>
        t.link ? (
          <Link
            href={taskLinkHref(t.link)}
            onClick={stop}
            className="inline-flex items-center gap-1 whitespace-nowrap text-xs font-medium text-primary hover:underline"
            data-testid={`task-link-${t.id}`}
          >
            {t.link.label} <ExternalLink className="size-3" aria-hidden />
          </Link>
        ) : (
          <span className="text-xs text-muted-foreground">—</span>
        ),
    },
    {
      id: "actions",
      header: "Actions",
      align: "right",
      cell: (t) => (
        <div className="flex items-center justify-end gap-1.5" onClick={stop}>
          <PutawayButton task={t} ctx={ctx} short />
          <TaskStatusMenu task={t} disabled={!ctx.canModify(t)} disabledReason={MODIFY_REASON} onChange={(s) => ctx.onStatus(t, s)} />
        </div>
      ),
    },
  ];

  return (
    <DataTable
      data={tasks}
      columns={columns}
      getRowId={(t) => t.id}
      onRowClick={ctx.onOpen}
      testId="tasks-table"
      pageSize={10}
      mobileCard={(t) => <TaskCard task={t} ctx={ctx} showStatus />}
      empty={{ title: "No tasks match your filters", description: "Try clearing a filter or create a new task." }}
    />
  );
}

const COLUMN_TONE: Record<TaskStatus, string> = {
  pending: "bg-muted-foreground/60",
  in_progress: "bg-info",
  blocked: "bg-danger",
  completed: "bg-success",
};
const COLUMN_LIMIT = 8;

export function TaskKanban({ tasks, ctx }: { tasks: WarehouseTask[]; ctx: TaskViewContext }) {
  const [dragOver, setDragOver] = useState<TaskStatus | null>(null);
  const [expanded, setExpanded] = useState<Partial<Record<TaskStatus, boolean>>>({});
  const byId = new Map(tasks.map((t) => [t.id, t]));

  return (
    <div className="grid gap-3 p-3 md:grid-cols-2 xl:grid-cols-4" data-testid="tasks-kanban">
      {TASK_STATUSES.map((status) => {
        const items = tasks.filter((t) => t.status === status);
        const shown = expanded[status] ? items : items.slice(0, COLUMN_LIMIT);
        return (
          <section
            key={status}
            aria-label={`${TASK_STATUS_LABELS[status]} tasks`}
            data-testid={`kanban-col-${status}`}
            onDragOver={(e) => {
              e.preventDefault();
              e.dataTransfer.dropEffect = "move";
              if (dragOver !== status) setDragOver(status);
            }}
            onDragLeave={(e) => {
              if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setDragOver(null);
            }}
            onDrop={(e) => {
              e.preventDefault();
              setDragOver(null);
              const task = byId.get(e.dataTransfer.getData("text/task-id"));
              if (task && task.status !== status && ctx.canModify(task)) ctx.onStatus(task, status);
            }}
            className={cn(
              "flex min-w-0 flex-col rounded-xl border bg-muted/30 transition-colors",
              dragOver === status && "border-primary bg-primary-soft/40",
            )}
          >
            <header className="flex items-center justify-between gap-2 px-3 py-2.5">
              <h3 className="flex items-center gap-2 text-sm font-semibold">
                <span className={cn("size-2 rounded-full", COLUMN_TONE[status])} aria-hidden />
                {TASK_STATUS_LABELS[status]}
              </h3>
              <span
                className="rounded-full bg-background px-2 py-0.5 text-xs font-medium text-muted-foreground tabular-nums"
                data-testid={`kanban-count-${status}`}
              >
                {items.length}
              </span>
            </header>
            <div className="flex-1 space-y-2 px-2 pb-2">
              {shown.map((t) => (
                <TaskCard key={t.id} task={t} ctx={ctx} draggable />
              ))}
              {items.length === 0 && (
                <p className="rounded-lg border border-dashed px-3 py-6 text-center text-xs text-muted-foreground">No tasks</p>
              )}
              {items.length > COLUMN_LIMIT && (
                <Button variant="ghost" size="sm" className="w-full" onClick={() => setExpanded((p) => ({ ...p, [status]: !p[status] }))}>
                  {expanded[status] ? "Show fewer" : `Show ${items.length - COLUMN_LIMIT} more`}
                </Button>
              )}
            </div>
          </section>
        );
      })}
    </div>
  );
}
