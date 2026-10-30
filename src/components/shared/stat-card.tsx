import Link from "next/link";
import type { LucideIcon } from "lucide-react";
import { ArrowDownRight, ArrowUpRight, Minus } from "lucide-react";
import { cn } from "@/lib/utils";
import { TONE_CLASSES, type Tone } from "./status-badge";

export interface StatCardProps {
  title: string;
  value: string | number;
  description?: string;
  icon: LucideIcon;
  tone?: Tone;
  /** navigates to the related module when set */
  href?: string;
  trend?: { value: string; direction: "up" | "down" | "flat"; good?: boolean };
  /** small status pill e.g. "Action needed" */
  status?: { label: string; tone: Tone };
  className?: string;
  testId?: string;
}

export function StatCard({ title, value, description, icon: Icon, tone = "primary", href, trend, status, className, testId }: StatCardProps) {
  const body = (
    <div
      data-testid={testId}
      className={cn(
        "group relative flex h-full flex-col gap-3 rounded-xl border bg-card p-4 shadow-card transition-colors",
        href && "hover:border-primary/40 hover:bg-accent/40",
        className,
      )}
    >
      <div className="flex items-start justify-between gap-2">
        <span className={cn("flex size-9 items-center justify-center rounded-lg", TONE_CLASSES[tone])}>
          <Icon className="size-[18px]" aria-hidden />
        </span>
        {status && (
          <span className={cn("rounded-full px-2 py-0.5 text-[11px] font-medium", TONE_CLASSES[status.tone])}>{status.label}</span>
        )}
      </div>
      <div className="min-w-0">
        <p className="truncate text-xs font-medium text-muted-foreground">{title}</p>
        <p className="mt-0.5 truncate text-2xl font-semibold tracking-tight tabular-nums" data-testid={testId ? `${testId}-value` : undefined}>
          {value}
        </p>
      </div>
      {(description || trend) && (
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          {trend && (
            <span
              className={cn(
                "inline-flex items-center gap-0.5 font-medium",
                trend.direction === "flat" ? "text-muted-foreground" : trend.good ? "text-success" : "text-danger",
              )}
            >
              {trend.direction === "up" ? <ArrowUpRight className="size-3.5" /> : trend.direction === "down" ? <ArrowDownRight className="size-3.5" /> : <Minus className="size-3.5" />}
              {trend.value}
            </span>
          )}
          {description && <span className="truncate">{description}</span>}
        </div>
      )}
    </div>
  );
  return href ? (
    <Link href={href} className="block rounded-xl outline-none focus-visible:ring-3 focus-visible:ring-ring/50">
      {body}
    </Link>
  ) : (
    body
  );
}
