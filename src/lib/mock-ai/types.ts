import type { ID, Priority } from "@/types";

/**
 * Public contract of the mock AI layer. Other modules (dashboard, reports, header drawer)
 * depend on THESE signatures; implementations behind them may change freely.
 * The AI never mutates data: recommendations only link to pages / pre-filled drafts.
 */
export type RecommendationKind =
  | "reorder"
  | "out_of_stock"
  | "overstock"
  | "delayed_order"
  | "priority_order"
  | "pending_putaway"
  | "delayed_delivery";

export interface Recommendation {
  /** stable across renders for the same situation, e.g. `reorder:<productId>:<warehouseId|all>` */
  id: string;
  kind: RecommendationKind;
  title: string;
  explanation: string;
  priority: Priority;
  related: { type: "product" | "order" | "purchase_order" | "receipt" | "transfer"; id: ID; label: string };
  /** primary navigation action (a link to an existing page; may be a pre-filled draft form) */
  action: { label: string; href: string };
  /** optional secondary navigation, e.g. open the product */
  secondary?: { label: string; href: string };
}

export type ReportKind =
  | "inventory-summary"
  | "stock-movement"
  | "low-stock"
  | "purchase-orders"
  | "sales-orders"
  | "warehouse-performance";

/* ------------------------------------------------------------------ assistant */

export type Tone = "success" | "warning" | "danger" | "info" | "primary" | "teal" | "neutral";

export interface StatItem {
  label: string;
  value: string;
  hint?: string;
  tone?: Tone;
  href?: string;
}

export interface TableColumn {
  key: string;
  label: string;
  align?: "left" | "right";
}

export interface TableRow {
  cells: Record<string, string>;
  href?: string;
  highlight?: boolean;
}

export interface ProductListItem {
  productId: ID;
  name: string;
  sku: string;
  /** short facts line, e.g. "Available 12 · reorder level 40" */
  detail: string;
  /** stock status key understood by StatusBadge (low_stock, out_of_stock, ...) */
  status?: string;
  href: string;
}

/** Everything the chat UI knows how to render. Stored as plain JSON on chat messages. */
export type AssistantBlock =
  | { type: "text"; text: string }
  | { type: "stats"; items: StatItem[] }
  | { type: "table"; title?: string; columns: TableColumn[]; rows: TableRow[]; footnote?: string }
  | { type: "product-list"; title?: string; items: ProductListItem[]; footnote?: string }
  | { type: "recommendations"; title?: string; items: Recommendation[] }
  | { type: "navigation"; links: { label: string; href: string }[] }
  | { type: "summary"; heading: string; paragraph?: string; bullets: string[] }
  | { type: "suggestions"; title?: string; prompts: string[] };

export interface AssistantReply {
  text: string;
  blocks: AssistantBlock[];
  /** detected intent id (useful for tests / analytics) */
  intent: string;
}

export interface AssistantContext {
  /** warehouse selected in the header ("all" or a warehouse id) */
  scope: ID | "all";
  /** clock injected for determinism; defaults to the real clock */
  now?: Date;
}

export const SUGGESTED_PROMPTS = [
  "How many products are currently in stock?",
  "Show low stock products.",
  "Which warehouse has the most inventory?",
  "What orders are pending?",
  "Show today's warehouse activities.",
  "Which products should I reorder?",
  "Generate an inventory summary.",
  "Which products are nearly out of stock?",
  "Show pending purchase orders.",
  "Give me a warehouse performance summary.",
] as const;
