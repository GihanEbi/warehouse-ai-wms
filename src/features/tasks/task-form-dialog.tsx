"use client";

import { useEffect, useMemo } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { format, parseISO, startOfDay } from "date-fns";
import type { Priority, TaskType, WarehouseTask } from "@/types";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { FormDialog } from "@/components/shared/dialogs";
import { FormField, NativeSelect } from "@/components/shared/form-controls";
import { useData, useTx, useWarehouseScope } from "@/hooks/use-wms";
import { useSubmit } from "@/hooks/use-submit";
import { PRIORITY_LABELS, TASK_PRIORITIES, TASK_TYPES, TASK_TYPE_LABELS } from "./task-utils";

const schema = z.object({
  title: z.string().trim().min(1, "Title is required").max(120, "Keep the title under 120 characters"),
  description: z.string().trim().max(600, "Keep the description under 600 characters"),
  type: z.enum(["receiving", "putaway", "picking", "packing", "transfer", "stock_count", "general"]),
  priority: z.enum(["low", "normal", "high", "urgent"]),
  assigneeId: z.string(),
  warehouseId: z.string().min(1, "Warehouse is required"),
  dueDate: z.string().min(1, "Due date is required"),
});
type Values = z.infer<typeof schema>;

/** yyyy-MM-dd (local) -> ISO at 17:00 local time. */
function dueToIso(v: string): string {
  const [y, m, d] = v.split("-").map(Number);
  return new Date(y, m - 1, d, 17, 0, 0).toISOString();
}

export function TaskFormDialog({
  open,
  onOpenChange,
  task,
  onSaved,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  /** when provided the dialog edits this task */
  task?: WarehouseTask | null;
  onSaved?: (id: string) => void;
}) {
  const data = useData();
  const tx = useTx();
  const [scope] = useWarehouseScope();
  const { submit, pending } = useSubmit();
  const editing = !!task;
  const lockedType = !!task?.link;

  const activeWarehouses = useMemo(() => data.warehouses.filter((w) => w.status === "active"), [data.warehouses]);

  const defaults = useMemo<Values>(() => {
    if (task) {
      return {
        title: task.title,
        description: task.description,
        type: task.type,
        priority: task.priority,
        assigneeId: task.assigneeId ?? "",
        warehouseId: task.warehouseId,
        dueDate: format(parseISO(task.dueDate), "yyyy-MM-dd"),
      };
    }
    const wh = scope !== "all" && activeWarehouses.some((w) => w.id === scope) ? scope : (activeWarehouses[0]?.id ?? "");
    return {
      title: "",
      description: "",
      type: "general",
      priority: "normal",
      assigneeId: "",
      warehouseId: wh,
      dueDate: format(new Date(Date.now() + 24 * 3600 * 1000), "yyyy-MM-dd"),
    };
  }, [task, scope, activeWarehouses]);

  const form = useForm<Values>({ resolver: zodResolver(schema), defaultValues: defaults });
  const {
    register,
    handleSubmit,
    reset,
    setValue,
    watch,
    setError,
    formState: { errors },
  } = form;

  // reset only when the dialog opens (or switches task) so live store updates never wipe typed values
  useEffect(() => {
    if (open) reset(defaults);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, task?.id, reset]);

  const warehouseId = watch("warehouseId");
  const assigneeId = watch("assigneeId");
  const assigneeOptions = useMemo(
    () =>
      data.users
        .filter((u) => (u.status === "active" && u.warehouseIds.includes(warehouseId)) || u.id === task?.assigneeId)
        .map((u) => ({ value: u.id, label: u.status === "active" ? u.name : `${u.name} (inactive)` })),
    [data.users, warehouseId, task?.assigneeId],
  );

  // keep the assignee valid when the warehouse changes
  useEffect(() => {
    if (assigneeId && !assigneeOptions.some((o) => o.value === assigneeId)) setValue("assigneeId", "");
  }, [assigneeId, assigneeOptions, setValue]);

  const onSubmit = handleSubmit(async (v) => {
    if (!editing && startOfDay(new Date(dueToIso(v.dueDate))) < startOfDay(new Date())) {
      setError("dueDate", { message: "Due date cannot be in the past" });
      return;
    }
    const input = {
      title: v.title,
      description: v.description,
      type: v.type as TaskType,
      priority: v.priority as Priority,
      assigneeId: v.assigneeId || null,
      warehouseId: v.warehouseId,
      dueDate: dueToIso(v.dueDate),
    };
    if (task) {
      const res = await submit(() => tx.updateTask(task.id, input), { success: "Task updated" });
      if (res?.ok) {
        onOpenChange(false);
        onSaved?.(task.id);
      }
      return;
    }
    const res = await submit(() => tx.createManualTask(input), { success: "Task created" });
    if (res?.ok) {
      onOpenChange(false);
      onSaved?.(res.value);
    }
  });

  return (
    <FormDialog
      open={open}
      onOpenChange={onOpenChange}
      title={editing ? `Edit ${task?.number}` : "Create task"}
      description={editing ? "Update task details, assignee or due date." : "Assign work to an employee in a warehouse."}
      submitLabel={editing ? "Save changes" : "Create task"}
      pending={pending}
      onSubmit={onSubmit}
      testId="task-form"
    >
      <FormField id="task-title" label="Title" required error={errors.title?.message}>
        <Input id="task-title" placeholder="e.g. Cycle count aisle B" aria-invalid={!!errors.title} {...register("title")} />
      </FormField>
      <FormField id="task-description" label="Description" error={errors.description?.message}>
        <Textarea id="task-description" rows={3} placeholder="Optional details for the assignee" {...register("description")} />
      </FormField>
      <div className="grid gap-4 sm:grid-cols-2">
        <FormField id="task-type" label="Type" required error={errors.type?.message}>
          <NativeSelect
            id="task-type"
            disabled={lockedType}
            options={TASK_TYPES.map((t) => ({ value: t, label: TASK_TYPE_LABELS[t] }))}
            {...register("type")}
          />
        </FormField>
        <FormField id="task-priority" label="Priority" required error={errors.priority?.message}>
          <NativeSelect id="task-priority" options={TASK_PRIORITIES.map((p) => ({ value: p, label: PRIORITY_LABELS[p] }))} {...register("priority")} />
        </FormField>
        <FormField id="task-warehouse" label="Warehouse" required error={errors.warehouseId?.message}>
          <NativeSelect
            id="task-warehouse"
            disabled={lockedType}
            invalid={!!errors.warehouseId}
            options={activeWarehouses.map((w) => ({ value: w.id, label: `${w.name} (${w.code})` }))}
            {...register("warehouseId")}
          />
        </FormField>
        <FormField id="task-assignee" label="Assignee" hint="Active employees of the selected warehouse" error={errors.assigneeId?.message}>
          <NativeSelect id="task-assignee" placeholder="Unassigned" options={assigneeOptions} {...register("assigneeId")} />
        </FormField>
        <FormField id="task-due" label="Due date" required error={errors.dueDate?.message}>
          <Input id="task-due" type="date" aria-invalid={!!errors.dueDate} {...register("dueDate")} />
        </FormField>
      </div>
    </FormDialog>
  );
}
