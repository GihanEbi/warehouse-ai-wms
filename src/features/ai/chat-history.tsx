"use client";

import { useState } from "react";
import { ChevronDown, MessageSquare, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { ConfirmationDialog } from "@/components/shared/dialogs";
import { useFormat } from "@/hooks/use-wms";
import { useWmsStore } from "@/stores/wms-store";
import { cn } from "@/lib/utils";

/** Conversation list: select, create and delete chats. Collapsible on small screens. */
export function ChatHistory() {
  const fmt = useFormat();
  const chats = useWmsStore((s) => s.chats);
  const activeChatId = useWmsStore((s) => s.activeChatId);
  const newChat = useWmsStore((s) => s.newChat);
  const setActiveChat = useWmsStore((s) => s.setActiveChat);
  const deleteChat = useWmsStore((s) => s.deleteChat);
  const [open, setOpen] = useState(false);
  const [toDelete, setToDelete] = useState<string | null>(null);
  const target = chats.find((c) => c.id === toDelete);
  const activeIsEmpty = chats.find((c) => c.id === activeChatId)?.messages.length === 0;

  function startNew() {
    // reuse an untouched empty chat instead of piling up blank conversations
    if (!activeIsEmpty) newChat();
    setOpen(false);
  }

  return (
    <section className="rounded-xl border bg-card shadow-card" aria-label="Chat history" data-testid="ai-history">
      <header className="flex items-center justify-between gap-2 px-4 py-3">
        <button
          type="button"
          className="flex min-w-0 items-center gap-2 text-left lg:pointer-events-none"
          onClick={() => setOpen((o) => !o)}
          aria-expanded={open}
          aria-controls="ai-history-list"
          data-testid="ai-history-toggle"
        >
          <MessageSquare className="size-4 shrink-0 text-muted-foreground" aria-hidden />
          <h2 className="truncate text-sm font-semibold">Conversations ({chats.length})</h2>
          <ChevronDown className={cn("size-4 shrink-0 text-muted-foreground transition-transform lg:hidden", open && "rotate-180")} aria-hidden />
        </button>
        <Button size="sm" variant="outline" onClick={startNew} data-testid="ai-new-chat">
          <Plus data-icon="inline-start" />
          New chat
        </Button>
      </header>
      <div id="ai-history-list" className={cn("border-t", open ? "block" : "hidden", "lg:block")}>
        {chats.length === 0 ? (
          <p className="px-4 py-6 text-center text-xs text-muted-foreground" data-testid="ai-history-empty">
            No conversations yet. Ask a question to start one.
          </p>
        ) : (
          <ul className="max-h-64 divide-y overflow-y-auto" data-testid="ai-history-items">
            {chats.map((c) => (
              <li key={c.id} className={cn("group flex items-center gap-1 pr-1", c.id === activeChatId && "bg-accent/60")}>
                <button
                  type="button"
                  onClick={() => {
                    setActiveChat(c.id);
                    setOpen(false);
                  }}
                  aria-current={c.id === activeChatId ? "true" : undefined}
                  className="min-w-0 flex-1 px-4 py-2 text-left outline-none focus-visible:bg-accent"
                  data-testid="ai-history-item"
                >
                  <span className="block truncate text-sm font-medium">{c.title}</span>
                  <span className="block truncate text-[11px] text-muted-foreground">
                    {fmt.dateTime(c.createdAt)} · {c.messages.filter((m) => m.role === "user").length} questions
                  </span>
                </button>
                <Button variant="ghost" size="icon-xs" aria-label={`Delete conversation: ${c.title}`} onClick={() => setToDelete(c.id)} data-testid="ai-history-delete">
                  <Trash2 />
                </Button>
              </li>
            ))}
          </ul>
        )}
      </div>
      <ConfirmationDialog
        open={toDelete !== null}
        onOpenChange={(o) => !o && setToDelete(null)}
        title="Delete this conversation?"
        description={target ? `"${target.title}" and its answers will be removed from this browser.` : undefined}
        confirmLabel="Delete"
        destructive
        onConfirm={() => {
          if (toDelete) deleteChat(toDelete);
          toast.success("Conversation deleted");
        }}
      />
    </section>
  );
}
