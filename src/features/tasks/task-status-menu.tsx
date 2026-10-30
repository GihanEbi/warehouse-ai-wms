"use client";

import { Check, ChevronDown } from "lucide-react";
import type { TaskStatus, WarehouseTask } from "@/types";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { TASK_STATUSES, TASK_STATUS_LABELS } from "./task-utils";

/** Keyboard/touch friendly status mover (the accessible alternative to drag-and-drop). */
export function TaskStatusMenu({
  task,
  disabled,
  disabledReason,
  onChange,
  className,
  size = "default",
}: {
  task: WarehouseTask;
  disabled?: boolean;
  disabledReason?: string;
  onChange: (status: TaskStatus) => void;
  className?: string;
  size?: "default" | "lg";
}) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        disabled={disabled}
        title={disabled ? disabledReason : "Change status"}
        aria-label={`Change status of ${task.number}`}
        data-testid={`task-status-menu-${task.id}`}
        className={cn(buttonVariants({ variant: "outline", size: size === "lg" ? "lg" : "sm" }), "gap-1", className)}
      >
        Move to <ChevronDown />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-44">
        {TASK_STATUSES.map((s) => (
          <DropdownMenuItem key={s} onClick={() => onChange(s)} data-testid={`task-move-${s}`} className="min-h-8">
            <span className="flex-1">{TASK_STATUS_LABELS[s]}</span>
            {task.status === s && <Check className="size-4 text-primary" />}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
