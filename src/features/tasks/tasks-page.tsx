"use client";

import { useEffect, useMemo, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { KanbanSquare, Plus, Table2, X } from "lucide-react";
import type { TaskStatus, WarehouseTask } from "@/types";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { PageHeader, Section } from "@/components/shared/page-header";
import { FilterDropdown, SearchInput, Toolbar } from "@/components/shared/form-controls";
import { useCurrentUser, useData, useFormat, useIndex, usePermission, useWarehouseScope } from "@/hooks/use-wms";
import { cn } from "@/lib/utils";
import { PutawayDialog } from "./putaway-dialog";
import { TaskDetailDrawer } from "./task-detail-drawer";
import { TaskFormDialog } from "./task-form-dialog";
import { TaskKanban, TaskTable, type TaskViewContext } from "./task-views";
import {
  PRIORITY_LABELS,
  TASK_PRIORITIES,
  TASK_STATUSES,
  TASK_STATUS_LABELS,
  TASK_TYPES,
  TASK_TYPE_LABELS,
  canModifyTask,
  priorityRank,
} from "./task-utils";
import { useTaskStatusChange } from "./use-task-status";

type View = "table" | "kanban";

export function TasksPage() {
  const data = useData();
  const idx = useIndex();
  const fmt = useFormat();
  const user = useCurrentUser();
  const { can } = usePermission();
  const [scope] = useWarehouseScope();
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const { change } = useTaskStatusChange();
  const [nowMs] = useState(() => Date.now());

  const [view, setView] = useState<View>("table");
  const [search, setSearch] = useState("");
  const [assignee, setAssignee] = useState("all");
  const [priority, setPriority] = useState("all");
  const [status, setStatus] = useState("all");
  const [type, setType] = useState("all");
  const [mine, setMine] = useState(false);
  // warehouse filter defaults to the global header scope; an explicit choice is valid until the scope changes
  const [whChoice, setWhChoice] = useState<{ scope: string; value: string } | null>(null);
  const warehouse = whChoice && whChoice.scope === scope ? whChoice.value : scope;

  const [formOpen, setFormOpen] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [putawayId, setPutawayId] = useState<string | null>(null);
  const [drawerId, setDrawerId] = useState<string | null>(null);
  const [drawerOpen, setDrawerOpen] = useState(false);

  const urlTask = params.get("task");
  useEffect(() => {
    if (urlTask) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- deep link ?task=<id> opens the drawer
      setDrawerId(urlTask);
      setDrawerOpen(true);
    }
  }, [urlTask]);

  const openTask = (t: WarehouseTask) => {
    setDrawerId(t.id);
    setDrawerOpen(true);
    router.replace(`${pathname}?task=${t.id}`, { scroll: false });
  };
  const closeDrawer = (o: boolean) => {
    setDrawerOpen(o);
    if (!o && urlTask) router.replace(pathname, { scroll: false });
  };

  const canModify = (t: WarehouseTask) => canModifyTask(t, user, can);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    const list = data.tasks.filter((t) => {
      if (warehouse !== "all" && t.warehouseId !== warehouse) return false;
      if (mine && t.assigneeId !== user?.id) return false;
      if (assignee === "unassigned" ? t.assigneeId !== null : assignee !== "all" && t.assigneeId !== assignee) return false;
      if (priority !== "all" && t.priority !== priority) return false;
      if (view === "table" && status !== "all" && t.status !== status) return false;
      if (type !== "all" && t.type !== type) return false;
      if (q) {
        const who = t.assigneeId ? (idx.users.get(t.assigneeId)?.name ?? "") : "";
        const hay = `${t.number} ${t.title} ${t.description} ${t.link?.label ?? ""} ${who}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
    // open work first (by due date, then priority), completed last (most recent first)
    return list.sort((a, b) => {
      const ac = a.status === "completed";
      const bc = b.status === "completed";
      if (ac !== bc) return ac ? 1 : -1;
      if (ac && bc) return (b.completedAt ?? "").localeCompare(a.completedAt ?? "");
      return a.dueDate.localeCompare(b.dueDate) || priorityRank(a.priority) - priorityRank(b.priority);
    });
  }, [data.tasks, warehouse, mine, user?.id, assignee, priority, status, type, search, view, idx.users]);

  const filtersActive =
    search !== "" || assignee !== "all" || priority !== "all" || (view === "table" && status !== "all") || type !== "all" || mine || warehouse !== scope;
  const clearFilters = () => {
    setSearch("");
    setAssignee("all");
    setPriority("all");
    setStatus("all");
    setType("all");
    setMine(false);
    setWhChoice(null);
  };

  const ctx: TaskViewContext = {
    nowMs,
    fmt,
    users: idx.users,
    warehouses: idx.warehouses,
    canModify,
    onOpen: openTask,
    onStatus: (t: WarehouseTask, s: TaskStatus) => void change(t, s),
    onPutaway: (t) => setPutawayId(t.id),
  };

  const drawerTask = drawerId ? (data.tasks.find((t) => t.id === drawerId) ?? null) : null;
  const editTask = editId ? (data.tasks.find((t) => t.id === editId) ?? null) : null;
  const putawayTask = putawayId ? (data.tasks.find((t) => t.id === putawayId) ?? null) : null;

  const assigneeOptions = [
    { value: "unassigned", label: "Unassigned" },
    ...data.users.filter((u) => u.status === "active").map((u) => ({ value: u.id, label: u.name })),
  ];

  const canCreate = can("tasks.write");

  return (
    <div>
      <PageHeader
        title="Warehouse Tasks"
        description="Assign, track and complete floor work across your warehouses."
        actions={
          <Button onClick={() => setFormOpen(true)} disabled={!canCreate} data-testid="create-task" title={canCreate ? undefined : "Your role cannot create tasks"}>
            <Plus /> Create task
          </Button>
        }
      />

      <Section contentClassName="p-0">
        <Toolbar>
          <SearchInput value={search} onChange={setSearch} placeholder="Search tasks, records, people…" className="sm:w-64" />
          <FilterDropdown label="Employee" value={assignee} onChange={setAssignee} options={assigneeOptions} allLabel="All employees" />
          <FilterDropdown
            label="Warehouse"
            value={warehouse}
            onChange={(v) => setWhChoice({ scope, value: v })}
            options={data.warehouses.map((w) => ({ value: w.id, label: w.code }))}
            allLabel="All warehouses"
          />
          <FilterDropdown label="Priority" value={priority} onChange={setPriority} options={TASK_PRIORITIES.map((p) => ({ value: p, label: PRIORITY_LABELS[p] }))} />
          {view === "table" && (
            <FilterDropdown label="Status" value={status} onChange={setStatus} options={TASK_STATUSES.map((s) => ({ value: s, label: TASK_STATUS_LABELS[s] }))} />
          )}
          <FilterDropdown label="Type" value={type} onChange={setType} options={TASK_TYPES.map((t) => ({ value: t, label: TASK_TYPE_LABELS[t] }))} />
          <label className="flex min-h-8 items-center gap-2 text-xs text-muted-foreground">
            <Switch checked={mine} onCheckedChange={setMine} data-testid="mine-only" aria-label="Show only my tasks" />
            My tasks
          </label>
          {filtersActive && (
            <Button variant="ghost" size="sm" onClick={clearFilters} data-testid="clear-task-filters">
              <X /> Clear
            </Button>
          )}
          <div
            role="group"
            aria-label="Task view"
            className="flex rounded-lg border bg-muted/50 p-0.5 sm:ml-auto"
          >
            {(
              [
                ["table", "Table", Table2],
                ["kanban", "Kanban", KanbanSquare],
              ] as const
            ).map(([v, label, Icon]) => (
              <button
                key={v}
                type="button"
                aria-pressed={view === v}
                data-testid={`task-view-${v}`}
                onClick={() => setView(v)}
                className={cn(
                  "inline-flex h-7 flex-1 items-center justify-center gap-1.5 rounded-md px-3 text-xs font-medium transition-colors",
                  view === v ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground",
                )}
              >
                <Icon className="size-3.5" /> {label}
              </button>
            ))}
          </div>
        </Toolbar>
        {view === "table" ? <TaskTable tasks={filtered} ctx={ctx} /> : <TaskKanban tasks={filtered} ctx={ctx} />}
      </Section>

      <TaskFormDialog open={formOpen} onOpenChange={setFormOpen} />
      <TaskFormDialog
        open={!!editTask}
        onOpenChange={(o) => {
          if (!o) setEditId(null);
        }}
        task={editTask}
      />
      <PutawayDialog task={putawayTask} open={!!putawayTask} onOpenChange={(o) => !o && setPutawayId(null)} />
      <TaskDetailDrawer
        task={drawerTask}
        open={drawerOpen}
        onOpenChange={closeDrawer}
        canModify={drawerTask ? canModify(drawerTask) : false}
        nowMs={nowMs}
        onStatus={(s) => drawerTask && void change(drawerTask, s)}
        onPutaway={() => drawerTask && setPutawayId(drawerTask.id)}
        onEdit={() => drawerTask && setEditId(drawerTask.id)}
      />
    </div>
  );
}
