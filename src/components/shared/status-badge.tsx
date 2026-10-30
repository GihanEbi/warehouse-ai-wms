import { cn } from "@/lib/utils";
import { titleCase } from "@/lib/format";

export type Tone = "success" | "warning" | "danger" | "info" | "primary" | "teal" | "neutral";

export const TONE_CLASSES: Record<Tone, string> = {
  success: "bg-success-soft text-success",
  warning: "bg-warning-soft text-warning",
  danger: "bg-danger-soft text-danger",
  info: "bg-info-soft text-info",
  primary: "bg-primary-soft text-primary",
  teal: "bg-teal-soft text-teal",
  neutral: "bg-neutral-soft text-muted-foreground",
};

export const TONE_DOT: Record<Tone, string> = {
  success: "bg-success",
  warning: "bg-warning",
  danger: "bg-danger",
  info: "bg-info",
  primary: "bg-primary",
  teal: "bg-teal",
  neutral: "bg-muted-foreground/60",
};

interface StatusDef {
  label?: string;
  tone: Tone;
}

/** One place that decides how every status in the product looks. */
const STATUS: Record<string, StatusDef> = {
  // generic
  active: { tone: "success" },
  inactive: { tone: "neutral" },
  archived: { tone: "neutral" },
  draft: { tone: "neutral" },
  cancelled: { tone: "danger" },
  completed: { tone: "success" },
  // purchase orders
  approved: { tone: "info" },
  partially_received: { tone: "warning", label: "Partially Received" },
  received: { tone: "success" },
  // goods receipts
  awaiting_putaway: { tone: "warning", label: "Awaiting Putaway" },
  // transfers
  pending_approval: { tone: "warning", label: "Pending Approval" },
  in_transit: { tone: "info", label: "In Transit" },
  // orders
  confirmed: { tone: "info" },
  picking: { tone: "primary" },
  picked: { tone: "teal" },
  packed: { tone: "teal" },
  dispatched: { tone: "success" },
  // shipments
  ready_to_ship: { tone: "warning", label: "Ready to Ship" },
  delivered: { tone: "success" },
  // returns
  requested: { tone: "warning" },
  inspected: { tone: "primary" },
  restocked: { tone: "success" },
  rejected: { tone: "danger" },
  // tasks
  pending: { tone: "neutral" },
  in_progress: { tone: "info", label: "In Progress" },
  blocked: { tone: "danger" },
  // stock
  in_stock: { tone: "success", label: "In Stock" },
  low_stock: { tone: "warning", label: "Low Stock" },
  out_of_stock: { tone: "danger", label: "Out of Stock" },
  reserved: { tone: "info" },
};

/** Domain-specific overrides where the same word means different things. */
const OVERRIDES: Record<string, StatusDef> = {
  "return:received": { tone: "info" },
  "transfer:completed": { tone: "success" },
  "shipment:dispatched": { tone: "info" },
  "task:pending": { tone: "neutral" },
};

export function StatusBadge({
  status,
  domain,
  label,
  className,
  dot = true,
}: {
  status: string;
  domain?: "return" | "transfer" | "shipment" | "task" | "po" | "order";
  label?: string;
  className?: string;
  dot?: boolean;
}) {
  const def = (domain && OVERRIDES[`${domain}:${status}`]) || STATUS[status] || { tone: "neutral" as Tone };
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 whitespace-nowrap rounded-full px-2 py-0.5 text-xs font-medium",
        TONE_CLASSES[def.tone],
        className,
      )}
      data-status={status}
    >
      {dot && <span className={cn("size-1.5 rounded-full", TONE_DOT[def.tone])} aria-hidden />}
      {label ?? def.label ?? titleCase(status)}
    </span>
  );
}

const PRIORITY: Record<string, { tone: Tone; label: string }> = {
  low: { tone: "neutral", label: "Low" },
  normal: { tone: "info", label: "Normal" },
  high: { tone: "warning", label: "High" },
  urgent: { tone: "danger", label: "Urgent" },
};

export function PriorityBadge({ priority, className }: { priority: string; className?: string }) {
  const def = PRIORITY[priority] ?? PRIORITY.normal;
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 whitespace-nowrap rounded-md px-1.5 py-0.5 text-xs font-medium",
        TONE_CLASSES[def.tone],
        className,
      )}
      data-priority={priority}
    >
      {def.label}
    </span>
  );
}
