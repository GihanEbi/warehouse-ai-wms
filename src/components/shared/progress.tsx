"use client";

import { Check } from "lucide-react";
import type { ActivityEvent } from "@/types";
import { useFormat, useIndex } from "@/hooks/use-wms";
import { cn } from "@/lib/utils";

export interface Step {
  key: string;
  label: string;
  description?: string;
}

/**
 * Step-based progress indicator. `current` is the index of the active step
 * (steps before it are complete). Set `terminated` to show a stopped process (e.g. cancelled).
 */
export function StepProgress({
  steps,
  current,
  terminated,
  className,
  testId = "step-progress",
}: {
  steps: Step[];
  current: number;
  terminated?: boolean;
  className?: string;
  testId?: string;
}) {
  return (
    <ol className={cn("flex flex-col gap-3 sm:flex-row sm:items-start", className)} data-testid={testId} aria-label="Progress">
      {steps.map((s, i) => {
        const done = !terminated && i < current;
        const active = !terminated && i === current;
        return (
          <li key={s.key} className="flex flex-1 items-start gap-3 sm:flex-col sm:items-stretch sm:gap-2" aria-current={active ? "step" : undefined} data-step-state={done ? "done" : active ? "active" : "todo"}>
            <div className="flex items-center sm:w-full">
              <span
                className={cn(
                  "flex size-7 shrink-0 items-center justify-center rounded-full border text-xs font-semibold",
                  done && "border-primary bg-primary text-primary-foreground",
                  active && "border-primary bg-primary-soft text-primary ring-4 ring-primary/10",
                  !done && !active && "border-border bg-card text-muted-foreground",
                  terminated && "border-danger/40 text-danger/70",
                )}
              >
                {done ? <Check className="size-3.5" /> : i + 1}
              </span>
              {i < steps.length - 1 && <span className={cn("ml-2 hidden h-px flex-1 sm:block", done ? "bg-primary" : "bg-border")} aria-hidden />}
            </div>
            <div className="min-w-0">
              <p className={cn("text-sm font-medium", !done && !active && "text-muted-foreground")}>{s.label}</p>
              {s.description && <p className="text-xs text-muted-foreground">{s.description}</p>}
            </div>
          </li>
        );
      })}
    </ol>
  );
}

/** Vertical activity feed from ActivityEvent records. */
export function ActivityTimeline({ events, className }: { events: ActivityEvent[]; className?: string }) {
  const fmt = useFormat();
  const { users } = useIndex();
  const sorted = [...events].sort((a, b) => b.at.localeCompare(a.at));
  if (sorted.length === 0) return <p className="text-sm text-muted-foreground">No activity recorded yet.</p>;
  return (
    <ol className={cn("relative space-y-4 border-l pl-5", className)} data-testid="activity-timeline">
      {sorted.map((e) => (
        <li key={e.id} className="relative">
          <span className="absolute top-1.5 -left-[25px] size-2.5 rounded-full border-2 border-card bg-primary ring-2 ring-primary/20" aria-hidden />
          <p className="text-sm font-medium">{e.title}</p>
          {e.detail && <p className="text-xs text-muted-foreground">{e.detail}</p>}
          <p className="mt-0.5 text-xs text-muted-foreground">
            {fmt.dateTime(e.at)}
            {e.by && users.get(e.by) ? ` · ${users.get(e.by)!.name}` : ""}
          </p>
        </li>
      ))}
    </ol>
  );
}
