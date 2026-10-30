import { cn } from "@/lib/utils";

/** Thin horizontal bar showing a 0-100 fill (utilization / bin occupancy). */
export function UtilBar({
  pct,
  className,
  label,
  testId,
}: {
  pct: number;
  className?: string;
  label?: string;
  testId?: string;
}) {
  const v = Math.max(0, Math.min(100, Math.round(pct)));
  const tone = v >= 90 ? "bg-danger" : v >= 75 ? "bg-warning" : "bg-primary";
  return (
    <div className={cn("flex items-center gap-2", className)} data-testid={testId}>
      <div
        className="h-1.5 min-w-10 flex-1 overflow-hidden rounded-full bg-muted"
        role="progressbar"
        aria-valuenow={v}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-label={label ?? "Utilization"}
      >
        <div className={cn("h-full rounded-full transition-all", tone)} style={{ width: `${v}%` }} />
      </div>
      <span className="w-9 shrink-0 text-right text-xs tabular-nums text-muted-foreground">{v}%</span>
    </div>
  );
}
