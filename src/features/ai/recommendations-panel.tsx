"use client";

import Link from "next/link";
import { RotateCcw, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { AIRecommendationCard } from "@/components/ai/ai-recommendation-card";
import { useRecommendations } from "@/components/ai/ai-recommendations-widget";
import { useWarehouseScope } from "@/hooks/use-wms";
import { useWmsStore } from "@/stores/wms-store";

/** Side panel on the AI page: current recommendations for the header warehouse scope. */
export function RecommendationsPanel() {
  const [scope] = useWarehouseScope();
  const { visible, enabled, dismissedCount } = useRecommendations(scope);
  const restore = useWmsStore((s) => s.restoreRecommendations);
  const shown = visible.slice(0, 8);

  return (
    <section className="rounded-xl border bg-card shadow-card" aria-label="Recommendations" data-testid="ai-recs-panel">
      <header className="flex items-center justify-between gap-2 border-b px-4 py-3">
        <div className="flex min-w-0 items-center gap-2">
          <Sparkles className="size-4 shrink-0 text-primary" aria-hidden />
          <h2 className="truncate text-sm font-semibold">Recommendations{enabled ? ` (${visible.length})` : ""}</h2>
        </div>
        {dismissedCount > 0 && (
          <Button variant="ghost" size="xs" onClick={restore} data-testid="ai-restore">
            <RotateCcw data-icon="inline-start" />
            Restore {dismissedCount}
          </Button>
        )}
      </header>
      <div className="max-h-[32rem] space-y-2 overflow-y-auto p-3">
        {!enabled ? (
          <p className="text-xs text-muted-foreground">
            Recommendations are turned off.{" "}
            <Link href="/settings" className="font-medium text-primary underline-offset-2 hover:underline">
              Change this in Settings
            </Link>
            .
          </p>
        ) : shown.length === 0 ? (
          <p className="py-4 text-center text-xs text-muted-foreground" data-testid="ai-recs-empty">
            No open recommendations. Everything looks on track.
          </p>
        ) : (
          <>
            {shown.map((r) => (
              <AIRecommendationCard key={r.id} recommendation={r} compact />
            ))}
            {visible.length > shown.length && (
              <p className="text-center text-[11px] text-muted-foreground">{visible.length - shown.length} more suggestions. Ask the assistant to see them.</p>
            )}
          </>
        )}
      </div>
    </section>
  );
}
