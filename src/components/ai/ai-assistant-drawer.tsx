"use client";

import { useEffect } from "react";
import { usePathname } from "next/navigation";
import { Maximize2, Plus, Sparkles } from "lucide-react";
import { Sheet, SheetContent, SheetDescription, SheetTitle } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { LinkButton } from "@/components/shared/link-button";
import { useWmsStore } from "@/stores/wms-store";
import { AIChatPanel } from "./ai-chat-panel";

/** Header drawer: the compact chat panel on the active conversation (a new one is created on first message). */
export function AIAssistantDrawer({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
  const pathname = usePathname();
  const activeChatId = useWmsStore((s) => s.activeChatId);
  const activeEmpty = useWmsStore((s) => {
    const c = s.chats.find((x) => x.id === s.activeChatId);
    return !!c && c.messages.length === 0;
  });
  const newChat = useWmsStore((s) => s.newChat);

  // close the drawer when a link inside it navigates to another route
  useEffect(() => {
    onOpenChange(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- only react to route changes
  }, [pathname]);

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-full gap-0 p-0 sm:max-w-lg" data-testid="ai-drawer">
        <div className="flex items-start gap-2 border-b px-4 py-3 pr-12">
          <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-primary-soft text-primary">
            <Sparkles className="size-4" aria-hidden />
          </span>
          <div className="min-w-0 flex-1">
            <SheetTitle className="text-sm">AI Warehouse Assistant</SheetTitle>
            <SheetDescription className="text-xs">Ask about stock, orders and purchasing.</SheetDescription>
          </div>
          <div className="flex shrink-0 items-center gap-1">
            <Button
              variant="outline"
              size="xs"
              onClick={() => (activeEmpty ? undefined : newChat())}
              disabled={!activeChatId || activeEmpty}
              data-testid="ai-drawer-new-chat"
            >
              <Plus data-icon="inline-start" />
              New
            </Button>
            <LinkButton href="/ai-assistant" variant="ghost" size="icon-xs" aria-label="Open full AI assistant page" title="Open full page" onClick={() => onOpenChange(false)}>
              <Maximize2 />
            </LinkButton>
          </div>
        </div>
        <div className="min-h-0 flex-1">
          <AIChatPanel compact chatId={activeChatId} />
        </div>
      </SheetContent>
    </Sheet>
  );
}

