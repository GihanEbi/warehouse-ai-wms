"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Send, Sparkles, User } from "lucide-react";
import type { ChatMessage, ID } from "@/types";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useFormat } from "@/hooks/use-wms";
import { useWmsStore } from "@/stores/wms-store";
import { processMessage } from "@/lib/mock-ai/engine";
import { SUGGESTED_PROMPTS } from "@/lib/mock-ai/types";
import { cn } from "@/lib/utils";
import { AssistantBlocks, parseBlocks } from "./ai-blocks";

/** Simulated "thinking" time. A constant (no jitter) keeps behaviour deterministic; it sits in the 600-900ms band. */
export const AI_REPLY_DELAY_MS = 750;

export const AI_DISCLAIMER = "Mock AI — answers are computed from your current data. It only suggests; it never changes inventory.";

let seq = 0;
const messageId = (prefix: string) => `${prefix}_${Date.now().toString(36)}_${(seq++).toString(36)}`;

function Typing() {
  return (
    <div className="flex items-start gap-2" data-testid="ai-typing" role="status" aria-label="The assistant is typing">
      <Avatar role="assistant" />
      <div className="flex items-center gap-1 rounded-2xl rounded-tl-sm border bg-card px-3 py-3">
        {[0, 1, 2].map((i) => (
          <span key={i} className="size-1.5 animate-bounce rounded-full bg-muted-foreground/70 motion-reduce:animate-none" style={{ animationDelay: `${i * 150}ms` }} aria-hidden />
        ))}
        <span className="sr-only">The assistant is typing</span>
      </div>
    </div>
  );
}

function Avatar({ role }: { role: ChatMessage["role"] }) {
  return (
    <span className={cn("mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-full", role === "assistant" ? "bg-primary-soft text-primary" : "bg-muted text-muted-foreground")} aria-hidden>
      {role === "assistant" ? <Sparkles className="size-4" /> : <User className="size-4" />}
    </span>
  );
}

/**
 * Reusable chat surface. `chatId` pins a conversation; without it the active chat is used and a new one is
 * created lazily on the first message. Replies are computed at reply time from live store data.
 */
export function AIChatPanel({ compact = false, chatId, className }: { compact?: boolean; chatId?: ID | null; className?: string }) {
  const fmt = useFormat();
  const activeChatId = useWmsStore((s) => s.activeChatId);
  const resolvedId = chatId ?? activeChatId;
  const chat = useWmsStore((s) => s.chats.find((c) => c.id === resolvedId) ?? null);
  const messages = chat?.messages;
  const [draft, setDraft] = useState("");
  const [pendingId, setPendingId] = useState<ID | null>(null);
  const sending = pendingId !== null;
  const thinking = sending && pendingId === resolvedId;
  const busy = useRef(false);
  const mounted = useRef(true);
  const scroller = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  // auto-scroll to the newest message / typing indicator
  useEffect(() => {
    const el = scroller.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [messages?.length, thinking]);

  const send = useCallback(
    (raw: string) => {
      const text = raw.trim();
      if (!text || busy.current) return;
      busy.current = true;
      const store = useWmsStore.getState();
      const id = resolvedId ?? store.newChat();
      const at = new Date().toISOString();
      const title = text.length > 48 ? `${text.slice(0, 47)}…` : text;
      store.appendChatMessages(id, [{ id: messageId("msg"), role: "user", at, text }], title);
      setDraft("");
      setPendingId(id);
      window.setTimeout(() => {
        // read live state at reply time so re-asking after changes gives updated numbers
        const s = useWmsStore.getState();
        const reply = processMessage(text, s.data, s.settings, { scope: s.selectedWarehouse, now: new Date() });
        s.appendChatMessages(id, [
          { id: messageId("msg"), role: "assistant", at: new Date().toISOString(), text: reply.text, blocks: reply.blocks },
        ]);
        busy.current = false;
        if (mounted.current) {
          setPendingId(null);
          inputRef.current?.focus();
        }
      }, AI_REPLY_DELAY_MS);
    },
    [resolvedId],
  );

  const empty = !messages || messages.length === 0;
  const chips = useMemo(() => [...SUGGESTED_PROMPTS], []);

  return (
    <div className={cn("flex h-full min-h-0 flex-col", className)} data-testid="ai-chat-panel">
      <div
        ref={scroller}
        className={cn("min-h-0 flex-1 space-y-4 overflow-y-auto overflow-x-hidden", compact ? "px-3 py-3" : "px-4 py-4")}
        role="log"
        aria-live="polite"
        aria-relevant="additions"
        aria-label="Conversation with the AI assistant"
        data-testid="ai-messages"
      >
        {empty && !thinking && (
          <div className="space-y-4" data-testid="ai-welcome">
            <div className="flex items-start gap-2">
              <Avatar role="assistant" />
              <div className="min-w-0 rounded-2xl rounded-tl-sm border bg-card px-3 py-2.5 text-sm">
                <p className="font-medium">Hi, I&apos;m your Warehouse Assistant.</p>
                <p className="mt-1 text-muted-foreground">
                  Ask about stock, orders, purchasing or warehouses. I answer from your live data and suggest next steps, but I never change anything myself.
                </p>
              </div>
            </div>
            <div>
              <p className="mb-1.5 text-xs font-medium text-muted-foreground">Try asking</p>
              <div className="flex flex-wrap gap-1.5">
                {chips.map((p) => (
                  <Button
                    key={p}
                    type="button"
                    variant="outline"
                    size="sm"
                    className="h-auto max-w-full whitespace-normal py-1 text-left"
                    onClick={() => send(p)}
                    disabled={sending}
                    data-testid="ai-suggestion"
                  >
                    {p}
                  </Button>
                ))}
              </div>
            </div>
          </div>
        )}

        {messages?.map((m) =>
          m.role === "user" ? (
            <div key={m.id} className="flex flex-row-reverse items-start gap-2" data-testid="ai-message-user">
              <Avatar role="user" />
              <div className="min-w-0 max-w-[85%]">
                <div className="break-words rounded-2xl rounded-tr-sm bg-primary px-3 py-2 text-sm text-primary-foreground">{m.text}</div>
                <p className="mt-0.5 text-right text-[11px] text-muted-foreground">{fmt.time(m.at)}</p>
              </div>
            </div>
          ) : (
            <div key={m.id} className="flex items-start gap-2" data-testid="ai-message-assistant">
              <Avatar role="assistant" />
              <div className="min-w-0 flex-1 space-y-3">
                <div className="break-words rounded-2xl rounded-tl-sm border bg-card px-3 py-2 text-sm" data-testid="ai-message-text">{m.text}</div>
                <AssistantBlocks blocks={parseBlocks(m.blocks)} onAsk={send} disabled={sending} />
                <p className="text-[11px] text-muted-foreground">{fmt.time(m.at)}</p>
              </div>
            </div>
          ),
        )}

        {thinking && <Typing />}
      </div>

      <div className="border-t bg-card/60 p-3">
        {!empty && (
          <div className="-mx-1 mb-2 flex gap-1.5 overflow-x-auto px-1 pb-1" aria-label="Suggested questions">
            {chips.map((p) => (
              <Button
                key={p}
                type="button"
                variant="outline"
                size="xs"
                className="shrink-0"
                onClick={() => send(p)}
                disabled={sending}
                data-testid="ai-suggestion"
              >
                {p}
              </Button>
            ))}
          </div>
        )}
        <form
          className="flex items-center gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            send(draft);
          }}
        >
          <label htmlFor={compact ? "ai-input-compact" : "ai-input"} className="sr-only">
            Ask the AI assistant
          </label>
          <Input
            ref={inputRef}
            id={compact ? "ai-input-compact" : "ai-input"}
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            placeholder="Ask about stock, orders, purchasing…"
            autoComplete="off"
            maxLength={300}
            className="h-9"
            data-testid="ai-input"
          />
          <Button type="submit" size="lg" disabled={sending || draft.trim().length === 0} data-testid="ai-send" aria-label="Send message">
            <Send data-icon="inline-start" />
            <span className="hidden sm:inline">Send</span>
          </Button>
        </form>
        <p className="mt-2 text-[11px] leading-snug text-muted-foreground" data-testid="ai-disclaimer">{AI_DISCLAIMER}</p>
      </div>
    </div>
  );
}
