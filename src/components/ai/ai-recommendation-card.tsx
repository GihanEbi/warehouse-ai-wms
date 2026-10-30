"use client";

import Link from "next/link";
import { toast } from "sonner";
import { ArrowRight, Boxes, ClipboardList, FileText, PackageCheck, ShoppingCart, Truck, X, type LucideIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { LinkButton } from "@/components/shared/link-button";
import { PriorityBadge } from "@/components/shared/status-badge";
import { useWmsStore } from "@/stores/wms-store";
import type { Recommendation } from "@/lib/mock-ai/types";
import { cn } from "@/lib/utils";

const RELATED: Record<Recommendation["related"]["type"], { icon: LucideIcon; href: (id: string) => string; label: string }> = {
  product: { icon: Boxes, href: (id) => `/products/${id}`, label: "Product" },
  order: { icon: ClipboardList, href: (id) => `/orders/${id}`, label: "Order" },
  purchase_order: { icon: ShoppingCart, href: (id) => `/purchase-orders/${id}`, label: "Purchase order" },
  receipt: { icon: PackageCheck, href: (id) => `/receiving/${id}`, label: "Receipt" },
  transfer: { icon: Truck, href: (id) => `/transfers/${id}`, label: "Transfer" },
};

const ACCENT: Record<string, string> = {
  urgent: "border-l-danger",
  high: "border-l-warning",
  normal: "border-l-info",
  low: "border-l-muted-foreground/40",
};

/** One AI suggestion: explanation, related record, priority, a navigation action and a dismiss button. */
export function AIRecommendationCard({
  recommendation: rec,
  compact,
  className,
  onDismissed,
}: {
  recommendation: Recommendation;
  compact?: boolean;
  className?: string;
  onDismissed?: (id: string) => void;
}) {
  const dismiss = useWmsStore((s) => s.dismissRecommendation);
  const related = RELATED[rec.related.type];
  const Icon = related.icon;

  function handleDismiss() {
    dismiss(rec.id);
    onDismissed?.(rec.id);
    toast.success("Recommendation dismissed", { description: rec.title });
  }

  return (
    <article
      data-testid="ai-recommendation-card"
      data-rec-id={rec.id}
      data-priority={rec.priority}
      aria-label={rec.title}
      className={cn("min-w-0 rounded-lg border border-l-4 bg-card p-3 shadow-card", ACCENT[rec.priority] ?? ACCENT.normal, className)}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <h4 className="break-words text-sm font-semibold leading-snug">{rec.title}</h4>
          <div className="mt-1 flex flex-wrap items-center gap-1.5">
            <PriorityBadge priority={rec.priority} />
            <Link
              href={related.href(rec.related.id)}
              title={`Open ${related.label.toLowerCase()} ${rec.related.label}`}
              className="inline-flex max-w-full items-center gap-1 rounded-md bg-muted px-1.5 py-0.5 text-xs text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
              data-testid="ai-related"
            >
              <Icon className="size-3 shrink-0" aria-hidden />
              <span className="truncate">{rec.related.label}</span>
            </Link>
          </div>
        </div>
        <Button
          variant="ghost"
          size="icon-xs"
          onClick={handleDismiss}
          aria-label={`Dismiss recommendation: ${rec.title}`}
          title="Dismiss"
          data-testid="ai-dismiss"
        >
          <X />
        </Button>
      </div>
      <p className={cn("mt-2 break-words text-xs leading-relaxed text-muted-foreground", compact && "line-clamp-3")}>{rec.explanation}</p>
      <div className="mt-3 flex flex-wrap items-center gap-2">
        <LinkButton href={rec.action.href} size="sm" data-testid="ai-action">
          {rec.kind === "reorder" || rec.kind === "out_of_stock" ? <FileText data-icon="inline-start" /> : null}
          {rec.action.label}
          <ArrowRight data-icon="inline-end" />
        </LinkButton>
        {rec.secondary && (
          <LinkButton href={rec.secondary.href} variant="ghost" size="sm" data-testid="ai-secondary">
            {rec.secondary.label}
          </LinkButton>
        )}
      </div>
    </article>
  );
}
