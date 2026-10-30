"use client";

import Link from "next/link";
import { ArrowUpRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { LinkButton } from "@/components/shared/link-button";
import { PriorityBadge, StatusBadge, TONE_CLASSES } from "@/components/shared/status-badge";
import { ProductImage } from "@/components/shared/product-bits";
import { useIndex } from "@/hooks/use-wms";
import { useWmsStore } from "@/stores/wms-store";
import type { AssistantBlock } from "@/lib/mock-ai/types";
import { cn } from "@/lib/utils";
import { AIRecommendationCard } from "./ai-recommendation-card";

/** Narrow the untyped payload stored on a chat message to renderable blocks. */
export function parseBlocks(raw: unknown): AssistantBlock[] {
  if (!Array.isArray(raw)) return [];
  return raw.filter((b): b is AssistantBlock => typeof b === "object" && b !== null && typeof (b as { type?: unknown }).type === "string");
}

const snake = (s: string) => s.trim().toLowerCase().replace(/\s+/g, "_");

function BlockTitle({ children }: { children?: React.ReactNode }) {
  return children ? <h4 className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">{children}</h4> : null;
}

function Stats({ block }: { block: Extract<AssistantBlock, { type: "stats" }> }) {
  return (
    <div className="grid grid-cols-2 gap-2 sm:grid-cols-3" data-testid="ai-stats">
      {block.items.map((s) => {
        const body = (
          <div className={cn("h-full min-w-0 rounded-lg border bg-card p-2.5", s.href && "transition-colors hover:border-primary/40 hover:bg-accent/40")}>
            <p className="flex items-center gap-1.5 truncate text-xs text-muted-foreground">
              <span className={cn("size-2 shrink-0 rounded-full", TONE_CLASSES[s.tone ?? "neutral"].split(" ")[0])} aria-hidden />
              <span className="truncate">{s.label}</span>
            </p>
            <p className="mt-0.5 truncate text-base font-semibold tabular-nums" data-testid="ai-stat-value">{s.value}</p>
            {s.hint && <p className="truncate text-[11px] text-muted-foreground">{s.hint}</p>}
          </div>
        );
        return s.href ? (
          <Link key={s.label} href={s.href} className="block min-w-0 rounded-lg outline-none focus-visible:ring-3 focus-visible:ring-ring/50">{body}</Link>
        ) : (
          <div key={s.label} className="min-w-0">{body}</div>
        );
      })}
    </div>
  );
}

function DataTable({ block }: { block: Extract<AssistantBlock, { type: "table" }> }) {
  return (
    <div data-testid="ai-table">
      <BlockTitle>{block.title}</BlockTitle>
      <div className="overflow-x-auto rounded-lg border">
        <table className="w-full min-w-max text-left text-xs">
          <thead className="bg-muted/60 text-muted-foreground">
            <tr>
              {block.columns.map((c) => (
                <th key={c.key} scope="col" className={cn("whitespace-nowrap px-2.5 py-1.5 font-medium", c.align === "right" && "text-right")}>
                  {c.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {block.rows.map((row, i) => (
              <tr key={i} className={cn("border-t", row.highlight && "bg-warning-soft/60")} data-highlight={row.highlight ? "true" : undefined}>
                {block.columns.map((c, ci) => {
                  const v = row.cells[c.key] ?? "";
                  let content: React.ReactNode = v;
                  if (v && c.key === "status") content = <StatusBadge status={snake(v)} />;
                  else if (v && c.key === "priority") content = <PriorityBadge priority={snake(v)} />;
                  else if (v && c.key === "flag") content = <span className={cn("rounded-full px-2 py-0.5 text-[11px] font-medium", TONE_CLASSES.danger)}>{v}</span>;
                  else if (ci === 0 && row.href)
                    content = (
                      <Link href={row.href} className="font-medium text-primary underline-offset-2 hover:underline">
                        {v}
                      </Link>
                    );
                  return (
                    <td key={c.key} className={cn("px-2.5 py-1.5 align-middle", c.align === "right" ? "text-right tabular-nums" : "max-w-56 truncate", ci === 0 && "font-medium")} title={typeof content === "string" ? v : undefined}>
                      {content}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {block.footnote && <p className="mt-1 text-[11px] text-muted-foreground">{block.footnote}</p>}
    </div>
  );
}

function ProductList({ block }: { block: Extract<AssistantBlock, { type: "product-list" }> }) {
  const idx = useIndex();
  return (
    <div data-testid="ai-product-list">
      <BlockTitle>{block.title}</BlockTitle>
      <ul className="divide-y rounded-lg border bg-card">
        {block.items.map((item) => {
          const product = idx.products.get(item.productId);
          return (
            <li key={item.productId} className="flex items-center gap-2.5 p-2" data-testid="ai-product-item">
              {product ? <ProductImage product={product} size={36} /> : <span className="size-9 shrink-0 rounded-lg border bg-muted" aria-hidden />}
              <div className="min-w-0 flex-1">
                <Link href={item.href} className="line-clamp-2 break-words text-sm font-medium leading-snug text-primary underline-offset-2 hover:underline" data-testid="ai-product-link">
                  {item.name}
                </Link>
                <p className="truncate text-xs text-muted-foreground">
                  <span className="font-mono">{item.sku}</span> · {item.detail}
                </p>
              </div>
              {item.status && <StatusBadge status={item.status} className="shrink-0" />}
            </li>
          );
        })}
      </ul>
      {block.footnote && <p className="mt-1 text-[11px] text-muted-foreground">{block.footnote}</p>}
    </div>
  );
}

function Recommendations({ block }: { block: Extract<AssistantBlock, { type: "recommendations" }> }) {
  const dismissed = useWmsStore((s) => s.dismissedRecommendations);
  const visible = block.items.filter((r) => !dismissed.includes(r.id));
  return (
    <div data-testid="ai-recommendations">
      <BlockTitle>{block.title ?? "Recommendations"}</BlockTitle>
      {visible.length === 0 ? (
        <p className="rounded-lg border border-dashed p-2.5 text-xs text-muted-foreground">All of these suggestions have been dismissed.</p>
      ) : (
        <div className="space-y-2">
          {visible.map((r) => (
            <AIRecommendationCard key={r.id} recommendation={r} />
          ))}
        </div>
      )}
    </div>
  );
}

/** Renders every assistant block type as a compact data-answer card. */
export function AssistantBlocks({ blocks, onAsk, disabled }: { blocks: AssistantBlock[]; onAsk?: (prompt: string) => void; disabled?: boolean }) {
  return (
    <div className="space-y-3">
      {blocks.map((block, i) => {
        switch (block.type) {
          case "text":
            return <p key={i} className="text-sm">{block.text}</p>;
          case "stats":
            return <Stats key={i} block={block} />;
          case "table":
            return <DataTable key={i} block={block} />;
          case "product-list":
            return <ProductList key={i} block={block} />;
          case "recommendations":
            return <Recommendations key={i} block={block} />;
          case "navigation":
            return (
              <div key={i} className="flex flex-wrap gap-2" data-testid="ai-navigation">
                {block.links.map((l) => (
                  <LinkButton key={l.href + l.label} href={l.href} variant="outline" size="sm">
                    {l.label}
                    <ArrowUpRight data-icon="inline-end" />
                  </LinkButton>
                ))}
              </div>
            );
          case "summary":
            return (
              <div key={i} className="rounded-lg border bg-muted/40 p-3" data-testid="ai-summary">
                <h4 className="text-sm font-semibold">{block.heading}</h4>
                {block.paragraph && <p className="mt-1 text-sm text-muted-foreground">{block.paragraph}</p>}
                <ul className="mt-1.5 list-disc space-y-1 pl-4 text-xs leading-relaxed text-muted-foreground marker:text-primary">
                  {block.bullets.map((b, j) => (
                    <li key={j} className="break-words">{b}</li>
                  ))}
                </ul>
              </div>
            );
          case "suggestions":
            return (
              <div key={i}>
                <BlockTitle>{block.title}</BlockTitle>
                <div className="flex flex-wrap gap-1.5">
                  {block.prompts.map((p) => (
                    <Button
                      key={p}
                      type="button"
                      variant="outline"
                      size="sm"
                      className="h-auto max-w-full whitespace-normal py-1 text-left"
                      disabled={disabled}
                      onClick={() => onAsk?.(p)}
                      data-testid="ai-suggestion"
                    >
                      {p}
                    </Button>
                  ))}
                </div>
              </div>
            );
          default:
            return null;
        }
      })}
    </div>
  );
}
