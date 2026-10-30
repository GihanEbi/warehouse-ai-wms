import type { ID, Product, WmsData, Warehouse } from "@/types";

export type IntentId =
  | "help"
  | "stock_count"
  | "low_stock"
  | "nearly_out"
  | "out_of_stock"
  | "reorder"
  | "overstock"
  | "warehouse_compare"
  | "warehouse_performance"
  | "pending_orders"
  | "high_priority_orders"
  | "delayed_orders"
  | "activities_today"
  | "pending_po"
  | "pending_putaway"
  | "inventory_summary"
  | "movement_summary"
  | "kpi_explain"
  | "product_stock"
  | "fallback";

/** Lower-case, strip punctuation / apostrophes, collapse whitespace. */
export function normalize(text: string): string {
  return text
    .toLowerCase()
    .replace(/['’`]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

type Rule = [RegExp, number];

/** Rules are matched against the normalised message; the highest total wins (ties: earlier in this list). */
const INTENT_RULES: { id: Exclude<IntentId, "fallback" | "product_stock">; rules: Rule[] }[] = [
  {
    id: "help",
    rules: [
      [/\bwhat can you do\b/, 8],
      [/\bhelp\b/, 4],
      [/\bcapabilit/, 5],
      [/\bhow can you help\b/, 8],
      [/\bwhat do you do\b/, 8],
      [/\bwho are you\b/, 6],
      [/^(hi|hello|hey|good (morning|afternoon|evening))( there)?$/, 8],
      [/\bwhat (can|could) i ask\b/, 8],
    ],
  },
  {
    id: "kpi_explain",
    rules: [
      [/\bkpis?\b/, 7],
      [/\bexplain (the )?(dashboard|metrics|numbers|figures)\b/, 8],
      [/\bdashboard (metrics|numbers|figures|cards|tiles)\b/, 7],
      [/\bwhat do(es)? (the )?(dashboard|numbers|metrics)\b/, 6],
    ],
  },
  {
    id: "reorder",
    rules: [
      [/\bre ?order/, 7],
      [/\brestock\b/, 6],
      [/\breplenish/, 6],
      [/\bwhat (should|do) i (buy|order|purchase)\b/, 7],
      [/\bneed (to )?(order|buy|purchase)\b/, 6],
      [/\bpurchase suggestions?\b/, 6],
      [/\bshould i (buy|order)\b/, 6],
    ],
  },
  {
    id: "nearly_out",
    rules: [
      [/\b(nearly|almost|about to|close to|going to) (run )?out\b/, 8],
      [/\brunning (low|out)\b/, 7],
      [/\brun(ning)? out of\b/, 6],
      [/\bnearly out of stock\b/, 2],
    ],
  },
  {
    id: "out_of_stock",
    rules: [
      [/\bout of stock\b/, 6],
      [/\bstock ?outs?\b/, 6],
      [/\bzero stock\b/, 6],
      [/\bno stock\b/, 5],
      [/\bsold out\b/, 5],
      [/\b(nearly|almost|about to|close to|going to) (run )?out\b/, -9],
    ],
  },
  {
    id: "low_stock",
    rules: [
      [/\blow (on )?stock\b/, 8],
      [/\blow inventory\b/, 7],
      [/\bunder ?stock/, 6],
      [/\b(stock )?shortages?\b/, 6],
      [/\bbelow (the )?re ?order/, 7],
      [/\blow\b/, 3],
      [/\bshow low\b/, 2],
    ],
  },
  {
    id: "overstock",
    rules: [
      [/\bover ?stock/, 8],
      [/\bexcess (stock|inventory)\b/, 8],
      [/\btoo much (stock|inventory)\b/, 8],
      [/\bsurplus\b/, 6],
      [/\bslow moving\b/, 5],
    ],
  },
  {
    id: "high_priority_orders",
    rules: [
      [/\b(high|urgent|top)[ -]?priority\b/, 8],
      [/\burgent (orders?|shipments?)\b/, 8],
      [/\bpriority orders?\b/, 7],
      [/\bimportant orders?\b/, 6],
    ],
  },
  {
    id: "delayed_orders",
    rules: [
      [/\b(delayed|late|overdue|past due|behind schedule|past (their )?(required|due))\b/, 5],
      [/\b(orders?|shipments?|deliver\w*)\b/, 2],
      [/\b(purchase|supplier|po|pos)\b/, -8],
    ],
  },
  {
    id: "pending_putaway",
    rules: [
      [/\bput ?away\b/, 8],
      [/\bawaiting putaway\b/, 4],
      [/\bstaging\b/, 6],
      [/\bunput\b/, 6],
    ],
  },
  {
    id: "pending_po",
    rules: [
      [/\bpurchase orders?\b/, 8],
      [/\b(pos|po)\b/, 5],
      [/\bsupplier orders?\b/, 6],
      [/\bincoming (stock|orders?|deliveries|shipments?)\b/, 6],
      [/\bexpected deliveries\b/, 6],
      [/\b(pending|open|outstanding|overdue)\b/, 1],
    ],
  },
  {
    id: "pending_orders",
    rules: [
      [/\b(pending|open|outstanding|unfulfilled|unprocessed|active|incomplete|waiting) (sales |customer )?orders?\b/, 8],
      [/\borders? (that are |which are )?(are )?(pending|open|outstanding|waiting|unfulfilled)\b/, 8],
      [/\bwhat orders\b/, 6],
      [/\borders? (to|need to|waiting to) (fulfil|fulfill|process|ship|pick)\b/, 7],
      [/\bsales orders?\b/, 4],
      [/\borders?\b/, 3],
      [/\b(purchase|supplier|po|pos)\b/, -9],
      [/\b(delayed|late|overdue|priority)\b/, -4],
    ],
  },
  {
    id: "activities_today",
    rules: [
      [/\btodays?\b/, 5],
      [/\bactivit(y|ies)\b/, 6],
      [/\bwhat happened\b/, 6],
      [/\bwhats (happening|going on)\b/, 6],
      [/\brecent (activity|activities|changes)\b/, 6],
      [/\bso far\b/, 2],
    ],
  },
  {
    id: "warehouse_performance",
    rules: [
      [/\bperformance\b/, 8],
      [/\bwarehouse (summary|report|overview|kpis?)\b/, 7],
      [/\bhow (are|is) (the |our )?(warehouses?|operations?) (doing|performing)\b/, 8],
      [/\befficien/, 5],
    ],
  },
  {
    id: "warehouse_compare",
    rules: [
      [/\bwhich warehouse\b/, 8],
      [/\bwarehouse (has|holds|with) (the )?(most|highest|largest|least|lowest|biggest)\b/, 8],
      [/\b(most|highest|largest|biggest|least|lowest) (inventory|stock)\b/, 6],
      [/\bcompare (the )?warehouses?\b/, 8],
      [/\bwarehouse comparison\b/, 8],
      [/\bhighest utili[sz]ation\b/, 7],
      [/\bwarehouses\b/, 2],
    ],
  },
  {
    id: "inventory_summary",
    rules: [
      [/\binventory (summary|report|overview|health)\b/, 9],
      [/\bstock (summary|report|overview|health)\b/, 8],
      [/\bhealth summary\b/, 8],
      [/\bgenerate (an? |the )?(inventory |stock )?(summary|report)\b/, 8],
      [/\b(summary|overview|summari[sz]e)\b/, 3],
      [/\binventory health\b/, 3],
    ],
  },
  {
    id: "movement_summary",
    rules: [
      [/\bstock movements?\b/, 8],
      [/\bmovements?\b/, 6],
      [/\b(stock|goods) (in|out|flow)\b/, 5],
      [/\binbound\b/, 5],
      [/\boutbound\b/, 5],
      [/\btransactions?\b/, 4],
      [/\bhistory\b/, 3],
    ],
  },
  {
    id: "stock_count",
    rules: [
      [/\bhow many (products?|items?|skus?|units?)\b/, 8],
      [/\b(number|count|total) of (products?|items?|skus?|units?)\b/, 8],
      [/\bproducts? (are )?(currently )?in stock\b/, 8],
      [/\bin stock\b/, 4],
      [/\btotal (stock|inventory|units|products)\b/, 7],
      [/\bhow much (stock|inventory)\b/, 7],
      [/\bstock (level|count|on hand)\b/, 5],
      [/\b(nearly|almost|about to|close to) out\b/, -9],
      [/\b(low|out of) stock\b/, -4],
    ],
  },
];

/** Higher-priority intents win ties because they appear earlier in `INTENT_RULES`. */
export function scoreIntents(norm: string): { id: IntentId; score: number }[] {
  return INTENT_RULES.map((def) => ({
    id: def.id as IntentId,
    score: def.rules.reduce((s, [re, w]) => (re.test(norm) ? s + w : s), 0),
  }));
}

export const MIN_INTENT_SCORE = 4;

/* ------------------------------------------------------------ entity detection */

const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/** Warehouse mentioned by name, code or city. Returns null when none or more than one is mentioned. */
export function detectWarehouse(norm: string, warehouses: Warehouse[]): Warehouse | null {
  const hits = warehouses.filter((w) => {
    const keys = new Set<string>();
    keys.add(normalize(w.name));
    keys.add(normalize(w.code));
    keys.add(normalize(w.code).replace(/ /g, ""));
    keys.add(normalize(w.code).split(" ")[0]);
    if (w.city) keys.add(normalize(w.city));
    return [...keys].filter((k) => k.length >= 3).some((k) => new RegExp(`\\b${escapeRe(k)}\\b`).test(norm));
  });
  return hits.length === 1 ? hits[0] : null;
}

const NAME_STOP = new Set([
  "the", "and", "for", "with", "pack", "pk", "pcs", "box", "roll", "size", "large", "medium", "small", "of",
  "stock", "show", "how", "much", "many", "what", "who", "which", "have", "has", "level", "levels",
]);

const stem = (t: string) => (t.length > 3 && t.endsWith("s") ? t.slice(0, -1) : t);

function nameTokens(name: string): string[] {
  return normalize(name)
    .split(" ")
    .filter((t) => t.length >= 3 && !/\d/.test(t) && !NAME_STOP.has(t))
    .map(stem);
}

export type ProductMatch =
  | { kind: "exact"; product: Product }
  | { kind: "candidates"; products: Product[] }
  | null;

/** Fuzzy product lookup by name tokens or SKU. */
export function detectProduct(norm: string, products: Product[]): ProductMatch {
  const queryTokens = new Set(norm.split(" ").filter((t) => t.length >= 3 && !NAME_STOP.has(t)).map(stem));
  const scored: { product: Product; matched: number; total: number; fraction: number }[] = [];
  for (const p of products) {
    if (norm.includes(normalize(p.sku)) && normalize(p.sku).length >= 6) return { kind: "exact", product: p };
    const tokens = nameTokens(p.name);
    if (tokens.length === 0) continue;
    const matched = tokens.filter((t) => queryTokens.has(t)).length;
    if (matched === 0) continue;
    scored.push({ product: p, matched, total: tokens.length, fraction: matched / tokens.length });
  }
  if (scored.length === 0) return null;
  scored.sort(
    (a, b) =>
      b.fraction - a.fraction ||
      b.matched - a.matched ||
      Number(b.product.status === "active") - Number(a.product.status === "active") ||
      (a.product.name < b.product.name ? -1 : 1),
  );
  const top = scored[0];
  const fullMatches = scored.filter((s) => s.fraction === 1);
  if (fullMatches.length >= 1) {
    const bestFull = fullMatches.sort((a, b) => b.matched - a.matched)[0];
    const tied = fullMatches.filter((s) => s.matched === bestFull.matched);
    if (tied.length === 1 && (bestFull.matched >= 2 || bestFull.total === 1)) return { kind: "exact", product: bestFull.product };
  }
  if (top.fraction >= 0.6 && top.matched >= 2 && scored.filter((s) => s.fraction === top.fraction && s.matched === top.matched).length === 1) {
    return { kind: "exact", product: top.product };
  }
  return { kind: "candidates", products: scored.slice(0, 5).map((s) => s.product) };
}

export const STOCK_WORDS = /\b(stock|inventory|how (many|much)|available|availability|units?|quantity|levels?|on hand|left|remaining|have)\b/;

export interface DetectedIntent {
  id: IntentId;
  score: number;
  warehouseId: ID | null;
  product: ProductMatch;
}

export function detectIntent(text: string, data: Pick<WmsData, "products" | "warehouses">): DetectedIntent {
  const norm = normalize(text);
  const warehouse = detectWarehouse(norm, data.warehouses);
  const product = norm ? detectProduct(norm, data.products) : null;
  const scored = scoreIntents(norm);
  let best: { id: IntentId; score: number } = { id: "fallback", score: 0 };
  for (const s of scored) if (s.score > best.score) best = s;

  // Product questions: an exact product name beats generic intents unless the user clearly asked for another workflow.
  if (product?.kind === "exact" && best.score < 8 && STOCK_WORDS.test(norm)) {
    best = { id: "product_stock", score: 8 };
  } else if (product?.kind === "exact" && best.score < MIN_INTENT_SCORE) {
    best = { id: "product_stock", score: 5 };
  } else if (product?.kind === "candidates" && best.score < MIN_INTENT_SCORE && STOCK_WORDS.test(norm)) {
    best = { id: "product_stock", score: 4 };
  }
  if (best.score < MIN_INTENT_SCORE) best = { id: "fallback", score: best.score };
  return { id: best.id, score: best.score, warehouseId: warehouse?.id ?? null, product };
}
