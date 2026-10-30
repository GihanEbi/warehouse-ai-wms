"use client";

import { Settings, Sparkles } from "lucide-react";
import { PageHeader } from "@/components/shared/page-header";
import { EmptyState } from "@/components/shared/states";
import { LinkButton } from "@/components/shared/link-button";
import { AIChatPanel } from "@/components/ai/ai-chat-panel";
import { useIndex, useSettings, useWarehouseScope } from "@/hooks/use-wms";
import { useWmsStore } from "@/stores/wms-store";
import { ChatHistory } from "./chat-history";
import { RecommendationsPanel } from "./recommendations-panel";

export function AIAssistantPage() {
  const settings = useSettings();
  const activeChatId = useWmsStore((s) => s.activeChatId);
  const [scope] = useWarehouseScope();
  const idx = useIndex();

  if (!settings.aiEnabled) {
    return (
      <>
        <PageHeader title="AI Assistant" description="Ask questions about your warehouses in plain English." />
        <div className="rounded-xl border bg-card shadow-card" data-testid="ai-disabled">
          <EmptyState
            icon={Sparkles}
            title="The AI assistant is turned off"
            description="It can be switched back on in Settings. Your existing conversations are kept."
            action={
              <LinkButton href="/settings" variant="outline">
                <Settings data-icon="inline-start" />
                Open settings
              </LinkButton>
            }
          />
        </div>
      </>
    );
  }

  const scopeName = scope === "all" ? "all warehouses" : (idx.warehouses.get(scope)?.name ?? "the selected warehouse");

  return (
    <>
      <PageHeader
        title="AI Assistant"
        description={`Answers are computed from your live data for ${scopeName}. Mention a warehouse or product name to be specific.`}
      />
      <div className="grid gap-4 lg:grid-cols-[300px_minmax(0,1fr)] lg:grid-rows-[auto_1fr] lg:items-start">
        <div className="min-w-0 lg:col-start-1 lg:row-start-1">
          <ChatHistory />
        </div>
        <div className="min-w-0 lg:col-start-2 lg:row-span-2 lg:row-start-1">
          <section
            className="flex h-[min(44rem,calc(100dvh-13rem))] min-h-[28rem] flex-col overflow-hidden rounded-xl border bg-card shadow-card"
            aria-label="AI chat"
          >
            <AIChatPanel chatId={activeChatId} />
          </section>
        </div>
        <div className="min-w-0 lg:col-start-1 lg:row-start-2">
          <RecommendationsPanel />
        </div>
      </div>
    </>
  );
}
