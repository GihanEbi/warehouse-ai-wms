"use client";

import { AlertCircle, CheckCheck, ExternalLink, Pencil } from "lucide-react";
import type { TaskStatus, WarehouseTask } from "@/types";
import { Button } from "@/components/ui/button";
import { DetailDrawer } from "@/components/shared/dialogs";
import { InfoItem } from "@/components/shared/page-header";
import { PriorityBadge, StatusBadge } from "@/components/shared/status-badge";
import { LinkButton } from "@/components/shared/link-button";
import { useData, useFormat, useIndex } from "@/hooks/use-wms";
import { UserAvatar } from "@/features/users/user-avatar";
import { TaskStatusMenu } from "./task-status-menu";
import { TASK_TYPE_LABELS, isTaskOverdue, taskLinkHref } from "./task-utils";

export function TaskDetailDrawer({
  task,
  open,
  onOpenChange,
  canModify,
  nowMs,
  onStatus,
  onPutaway,
  onEdit,
}: {
  task: WarehouseTask | null;
  open: boolean;
  onOpenChange: (o: boolean) => void;
  canModify: boolean;
  nowMs: number;
  onStatus: (s: TaskStatus) => void;
  onPutaway: () => void;
  onEdit: () => void;
}) {
  const fmt = useFormat();
  const idx = useIndex();
  const data = useData();

  if (!task) {
    return (
      <DetailDrawer open={open} onOpenChange={onOpenChange} title="Task not found" description="This task may have been removed.">
        <p className="text-sm text-muted-foreground">We could not find that task.</p>
      </DetailDrawer>
    );
  }

  const assignee = task.assigneeId ? idx.users.get(task.assigneeId) : undefined;
  const creator = idx.users.get(task.createdBy);
  const warehouse = idx.warehouses.get(task.warehouseId);
  const overdue = isTaskOverdue(task, nowMs);
  const pick = task.pick;
  const pw = task.putaway;
  const order = pick ? data.orders.find((o) => o.id === pick.orderId) : undefined;
  const pickProduct = pick ? idx.products.get(pick.productId) : undefined;
  const pickBin = pick ? idx.bins.get(pick.binId) : undefined;
  const pwProduct = pw ? idx.products.get(pw.productId) : undefined;
  const pwFrom = pw ? idx.bins.get(pw.fromBinId) : undefined;
  const pwTo = pw ? idx.bins.get(pw.suggestedBinId) : undefined;

  return (
    <DetailDrawer
      open={open}
      onOpenChange={onOpenChange}
      title={task.title}
      description={`${task.number} · ${TASK_TYPE_LABELS[task.type]}`}
      width="sm:max-w-lg"
      footer={
        <div className="flex w-full flex-wrap items-center gap-2">
          <TaskStatusMenu
            task={task}
            size="lg"
            disabled={!canModify}
            disabledReason="Operators can only update tasks assigned to them"
            onChange={onStatus}
          />
          {task.type === "putaway" && task.putaway && task.status !== "completed" && (
            <Button size="lg" disabled={!canModify} onClick={onPutaway} data-testid="drawer-complete-putaway">
              <CheckCheck /> Complete putaway
            </Button>
          )}
          <Button variant="outline" size="lg" disabled={!canModify} onClick={onEdit} data-testid="edit-task">
            <Pencil /> Edit
          </Button>
        </div>
      }
    >
      <div className="space-y-5" data-testid="task-detail">
        <div className="flex flex-wrap items-center gap-2">
          <StatusBadge status={task.status} domain="task" />
          <PriorityBadge priority={task.priority} />
          {overdue && (
            <span className="inline-flex items-center gap-1 rounded-md bg-danger-soft px-1.5 py-0.5 text-xs font-medium text-danger">
              <AlertCircle className="size-3.5" aria-hidden /> Overdue
            </span>
          )}
        </div>

        <div>
          <p className="text-xs text-muted-foreground">Description</p>
          <p className="mt-0.5 text-sm whitespace-pre-wrap">{task.description || "No description provided."}</p>
        </div>

        <dl className="grid grid-cols-2 gap-x-4 gap-y-3">
          <InfoItem label="Type">{TASK_TYPE_LABELS[task.type]}</InfoItem>
          <InfoItem label="Warehouse">{warehouse ? `${warehouse.name} (${warehouse.code})` : "—"}</InfoItem>
          <InfoItem label="Assignee">
            {assignee ? (
              <span className="inline-flex items-center gap-1.5">
                <UserAvatar name={assignee.name} /> {assignee.name}
              </span>
            ) : (
              "Unassigned"
            )}
          </InfoItem>
          <InfoItem label="Due date">
            <span className={overdue ? "text-danger" : undefined}>{fmt.date(task.dueDate)}</span>
          </InfoItem>
          <InfoItem label="Created by">{creator?.name ?? "System"}</InfoItem>
          <InfoItem label="Created at">{fmt.dateTime(task.createdAt)}</InfoItem>
          {task.completedAt && <InfoItem label="Completed at">{fmt.dateTime(task.completedAt)}</InfoItem>}
        </dl>

        {task.link && (
          <div className="rounded-lg border bg-muted/30 p-3">
            <p className="text-xs text-muted-foreground">Linked record</p>
            <div className="mt-1 flex flex-wrap items-center justify-between gap-2">
              <p className="min-w-0 truncate text-sm font-medium">{task.link.label}</p>
              <LinkButton href={taskLinkHref(task.link)} variant="outline" size="sm" data-testid="task-linked-record">
                Open record <ExternalLink />
              </LinkButton>
            </div>
          </div>
        )}

        {pick && (
          <div className="rounded-lg border p-3" data-testid="pick-details">
            <p className="mb-2 text-sm font-semibold">Pick details</p>
            <dl className="grid grid-cols-2 gap-x-4 gap-y-3">
              <InfoItem label="Order">{order?.number ?? "—"}</InfoItem>
              <InfoItem label="Product">{pickProduct?.name}</InfoItem>
              <InfoItem label="Pick from bin">{pickBin?.code}</InfoItem>
              <InfoItem label="Picked / required">
                {fmt.number(pick.pickedQty)} / {fmt.number(pick.requiredQty)} {pickProduct?.uom}
              </InfoItem>
            </dl>
          </div>
        )}

        {pw && (
          <div className="rounded-lg border p-3" data-testid="putaway-details">
            <p className="mb-2 text-sm font-semibold">Putaway details</p>
            <dl className="grid grid-cols-2 gap-x-4 gap-y-3">
              <InfoItem label="Product">{pwProduct?.name}</InfoItem>
              <InfoItem label="Quantity">
                {fmt.number(pw.quantity)} {pwProduct?.uom}
              </InfoItem>
              <InfoItem label="From (staging)">{pwFrom?.code}</InfoItem>
              <InfoItem label="Suggested bin">{pwTo?.code}</InfoItem>
            </dl>
          </div>
        )}
      </div>
    </DetailDrawer>
  );
}
