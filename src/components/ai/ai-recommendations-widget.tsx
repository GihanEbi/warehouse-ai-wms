"use client";

import { useMemo } from "react";
import Link from "next/link";
import { Sparkles } from "lucide-react";
import type { ID } from "@/types";
import { LinkButton } from "@/components/shared/link-button";
import { useData, useSettings } from "@/hooks/use-wms";
import { useWmsStore } from "@/stores/wms-store";
import { generateRecommendations } from "@/lib/mock-ai/recommendations";
import { AIRecommendationCard } from "./ai-recommendation-card";

/** Dismissed-aware recommendations for a scope; shared by the widget and the AI page panel. */
export function useRecommendations(scope: ID | "all") {
  const data = useData();
  const settings = useSettings();
  const dismissed = useWmsStore((s) => s.dismissedRecommendations);
  const all = useMemo(
    () => (settings.aiEnabled && settings.aiRecommendationsEnabled ? generateRecommendations(data, settings, scope) : []),
    [data, settings, scope],
  );
  const visible = useMemo(() => all.filter((r) => !dismissed.includes(r.id)), [all, dismissed]);
  return { visible, total: all.length, dismissedCount: all.length - visible.length, enabled: settings.aiEnabled && settings.aiRecommendationsEnabled };
}

/** Dashboard widget: top AI recommendations for the selected warehouse scope. */
export function AIRecommendationsWidget({ scope, limit = 4 }: { scope: ID | "all"; limit?: number }) {
  const { visible, enabled } = useRecommendations(scope);
  const shown = visible.slice(0, limit);

  if (!enabled) {
    return (
      <div className="rounded-lg border border-dashed p-4 text-sm text-muted-foreground" data-testid="ai-widget-disabled">
        AI recommendations are turned off.{" "}
        <Link href="/settings" className="font-medium text-primary underline-offset-2 hover:underline">
          Enable them in Settings
        </Link>
        .
      </div>
    );
  }

  return (
    <div className="space-y-3" data-testid="ai-recommendations-widget">
      {shown.length === 0 ? (
        <div className="flex flex-col items-center gap-1 rounded-lg border border-dashed px-4 py-8 text-center" data-testid="ai-widget-empty">
          <span className="flex size-10 items-center justify-center rounded-full bg-success-soft text-success">
            <Sparkles className="size-5" aria-hidden />
          </span>
          <p className="text-sm font-medium">All clear</p>
          <p className="text-xs text-muted-foreground">No recommendations right now. Stock, orders and purchasing look on track.</p>
        </div>
      ) : (
        shown.map((r) => <AIRecommendationCard key={r.id} recommendation={r} compact />)
      )}
      <div className="flex items-center justify-between gap-2">
        <p className="text-xs text-muted-foreground">{visible.length > shown.length ? `${visible.length - shown.length} more suggestions` : "Suggestions only; nothing is changed automatically."}</p>
        <LinkButton href="/ai-assistant" variant="outline" size="sm" data-testid="ai-widget-ask">
          <Sparkles data-icon="inline-start" />
          Ask the assistant
        </LinkButton>
      </div>
    </div>
  );
}
