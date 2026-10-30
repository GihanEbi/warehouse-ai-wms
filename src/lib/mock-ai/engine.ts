import { startOfDay, subDays } from "date-fns";
import type { AppSettings, ID, WmsData } from "@/types";
import {
  getStockStatus,
  indexData,
  inTransitQty,
  inventoryValue,
  lowStockProducts,
  overstockedProducts,
  productStock,
  utilization,
  warehouseStock,
  type DataIndex,
} from "@/lib/inventory/selectors";
import { createFormatter, titleCase, type Formatter } from "@/lib/format";
import { poOutstanding, poTotal } from "@/lib/workflows/purchasing";
import { generateRecommendations, reorderCandidates } from "./recommendations";
import { explainKpis } from "./kpis";
import { performanceRows, summarizeReport } from "./reports";
import {
  PRIORITY_RANK,
  compareText,
  daysBetween,
  incomingPoQty,
  inScope,
  inventoryHref,
  isDelayedOrder,
  isOpenPO,
  isOverduePO,
  isPendingOrder,
  plural,
  productHref,
  scopeLabel,
  toDate,
} from "./helpers";
import { detectIntent, type IntentId } from "./intents";
import {
  SUGGESTED_PROMPTS,
  type AssistantBlock,
  type AssistantContext,
  type AssistantReply,
  type ProductListItem,
  type Recommendation,
  type StatItem,
  type TableRow,
} from "./types";

export type AssistantSettings = Pick<
  AppSettings,
  "aiResponseStyle" | "aiRecommendationsEnabled" | "lowStockThresholdFactor" | "currency" | "dateFormat" | "timezone"
>;

interface Env {
  data: WmsData;
  idx: DataIndex;
  settings: AssistantSettings;
  scope: ID | "all";
  scopeText: string;
  now: Date;
  fmt: Formatter;
  concise: boolean;
  recsOn: boolean;
  factor: number;
}

/** Extra example questions shown next to the ten headline prompts. */
export const MORE_PROMPTS = [
  "Show out of stock products.",
  "Explain dashboard KPIs.",
  "Show delayed orders.",
  "Show high priority orders.",
  "Show pending putaway.",
  "Show stock movement summary.",
  "Which products are overstocked?",
  "Stock of Samba Rice.",
] as const;

const lim = (env: Env, detailed: number, concise: number) => (env.concise ? concise : detailed);
const where = (env: Env) => (env.scope === "all" ? "across all warehouses" : `at ${env.scopeText}`);
const num = (env: Env, n: number) => env.fmt.number(n);

const reply = (intent: IntentId, text: string, blocks: AssistantBlock[]): AssistantReply => ({ intent, text, blocks });

function recBlock(env: Env, title: string, items: Recommendation[]): AssistantBlock[] {
  return env.recsOn && items.length ? [{ type: "recommendations", title, items }] : [];
}

function nav(env: Env, links: { label: string; href: string }[]): AssistantBlock[] {
  return env.concise ? [] : [{ type: "navigation", links }];
}

function productItems(
  env: Env,
  entries: { product: WmsData["products"][number]; summary: ReturnType<typeof productStock>; status?: string }[],
): ProductListItem[] {
  return entries.map(({ product, summary, status }) => ({
    productId: product.id,
    name: product.name,
    sku: product.sku,
    detail: `Available ${num(env, summary.available)} ${product.uom} · reorder level ${num(env, product.reorderLevel)}`,
    status,
    href: productHref(product.id),
  }));
}

const orderCustomer = (env: Env, id: ID) => env.idx.customers.get(id)?.name ?? "Unknown";
const whName = (env: Env, id: ID) => env.idx.warehouses.get(id)?.name ?? "Unknown";

/* ------------------------------------------------------------------ handlers */

function helpReply(): AssistantReply {
  return reply("help", "I'm your Warehouse Assistant. I read your live inventory, orders, purchasing and warehouse data to answer questions and suggest next steps. I only suggest: I never change inventory or submit anything. Where an action makes sense I link to a pre-filled draft you can review. Try one of these:", [
    { type: "suggestions", title: "Things you can ask", prompts: [...SUGGESTED_PROMPTS, ...MORE_PROMPTS] },
  ]);
}

function fallbackReply(): AssistantReply {
  return reply("fallback", "Sorry, I didn't understand that one. I can answer questions about stock levels, reorders, orders, purchase orders, putaway, warehouses and today's activity. Pick a question below or rephrase yours, and mention a warehouse (for example \"in Kandy\") or product name to narrow it down.", [
    { type: "suggestions", title: "Supported questions", prompts: [...SUGGESTED_PROMPTS] },
  ]);
}

function stockCount(env: Env): AssistantReply {
  const { data, scope } = env;
  const active = data.products.filter((p) => p.status === "active");
  const inStock = active.filter((p) => productStock(data, p.id, scope).onHand > 0);
  const sum = warehouseStock(data, scope);
  const low = lowStockProducts(data, scope, env.factor);
  const out = low.filter((l) => l.status === "out_of_stock").length;
  const stats: StatItem[] = [
    { label: "Products in stock", value: num(env, inStock.length), tone: "success", href: "/products" },
    { label: "Active products", value: num(env, active.length), tone: "primary", href: "/products" },
    { label: "Units on hand", value: num(env, sum.onHand), tone: "info", href: "/inventory" },
    { label: "Available to pick", value: num(env, sum.available), tone: "teal", href: "/inventory" },
    { label: "Low / out of stock", value: `${low.length} / ${out}`, tone: low.length ? "warning" : "success", href: "/inventory" },
  ];
  return reply(
    "stock_count",
    `${num(env, inStock.length)} of ${num(env, active.length)} active products are currently in stock ${where(env)}, holding ${num(env, sum.onHand)} units (${num(env, sum.available)} available to pick after reservations and blocks). ${low.length ? `${plural(low.length, "product")} ${low.length === 1 ? "is" : "are"} low or out of stock.` : "No product is below its reorder level."}`,
    [{ type: "stats", items: env.concise ? stats.slice(0, 3) : stats }, ...nav(env, [{ label: "Open inventory", href: inventoryHref(undefined, scope) }, { label: "Browse products", href: "/products" }])],
  );
}

function lowStockReply(env: Env, mode: "low" | "nearly" | "out"): AssistantReply {
  const { data, scope } = env;
  const all = lowStockProducts(data, scope, env.factor);
  const out = all.filter((l) => l.status === "out_of_stock");
  const lowOnly = all.filter((l) => l.status === "low_stock");
  const intent: IntentId = mode === "low" ? "low_stock" : mode === "nearly" ? "nearly_out" : "out_of_stock";
  const list = mode === "low" ? all : mode === "nearly" ? lowOnly : out;
  const recs = reorderCandidatesAsRecs(env).filter((r) => (mode === "out" ? r.kind === "out_of_stock" : mode === "nearly" ? r.kind === "reorder" : true));

  if (list.length === 0) {
    const text =
      mode === "out"
        ? `Good news: no product is completely out of stock ${where(env)}.`
        : mode === "nearly"
          ? `No product is running low ${where(env)} right now.${out.length ? ` ${plural(out.length, "product")} ${out.length === 1 ? "is" : "are"} already out of stock though.` : ""}`
          : `No product is at or below its reorder level ${where(env)}. Stock looks healthy.`;
    return reply(intent, text, nav(env, [{ label: "Open inventory", href: inventoryHref(undefined, scope) }]));
  }

  const shown = list.slice(0, lim(env, 12, 5));
  const text =
    mode === "out"
      ? `${plural(out.length, "product")} ${out.length === 1 ? "is" : "are"} completely out of stock ${where(env)}.`
      : mode === "nearly"
        ? `${plural(lowOnly.length, "product")} ${lowOnly.length === 1 ? "is" : "are"} running low ${where(env)} (at or below the reorder level but not yet empty), lowest first.${out.length ? ` ${plural(out.length, "other product")} ${out.length === 1 ? "is" : "are"} already out of stock.` : ""}`
        : `${plural(all.length, "product")} ${all.length === 1 ? "is" : "are"} low on stock ${where(env)}: ${out.length} out of stock and ${lowOnly.length} at or below the reorder level, lowest availability first.`;
  const blocks: AssistantBlock[] = [
    {
      type: "product-list",
      title: mode === "out" ? "Out of stock" : mode === "nearly" ? "Nearly out of stock" : "Low stock products",
      items: productItems(env, shown.map((l) => ({ ...l, status: l.status }))),
      footnote: list.length > shown.length ? `Showing ${shown.length} of ${list.length}. Open the inventory page for the full list.` : undefined,
    },
    ...recBlock(env, "Suggested reorders", recs.slice(0, lim(env, 3, 2))),
    ...nav(env, [{ label: "Open inventory", href: inventoryHref(undefined, scope) }]),
  ];
  return reply(intent, text, blocks);
}

/** Reorder / out-of-stock recommendations for the current scope (settings-aware). */
function reorderCandidatesAsRecs(env: Env): Recommendation[] {
  return generateRecommendations(env.data, env.settings, env.scope, env.now).filter((r) => r.kind === "reorder" || r.kind === "out_of_stock");
}

function reorderReply(env: Env): AssistantReply {
  const cands = reorderCandidates(env.data, env.settings, env.scope);
  if (cands.length === 0) {
    return reply("reorder", `Nothing needs reordering ${where(env)} right now: every product is above its reorder level, or incoming purchase orders already cover the gap.`, nav(env, [{ label: "Open purchase orders", href: "/purchase-orders" }]));
  }
  const total = cands.reduce((s, c) => s + c.cost, 0);
  const shown = cands.slice(0, lim(env, 12, 5));
  const rows: TableRow[] = shown.map((c) => ({
    cells: {
      product: c.product.name,
      available: num(env, c.summary.available),
      incoming: num(env, c.incoming),
      qty: `${num(env, c.qty)} ${c.product.uom}`,
      supplier: c.supplier?.name ?? "No preferred supplier",
      cost: env.fmt.money(c.cost),
    },
    href: productHref(c.product.id),
    highlight: c.status === "out_of_stock",
  }));
  const recs = reorderCandidatesAsRecs(env);
  return reply(
    "reorder",
    `${plural(cands.length, "product")} should be reordered ${where(env)}, about ${env.fmt.money(total)} in total at unit cost. Suggested quantity brings stock up to three times the reorder level, net of units already on approved purchase orders. ${env.recsOn ? "Each card below links to a pre-filled draft purchase order that you can review and save." : "Open the product to start a purchase order."}`,
    [
      {
        type: "table",
        title: "Suggested reorders",
        columns: [
          { key: "product", label: "Product" },
          { key: "available", label: "Available", align: "right" },
          { key: "incoming", label: "On PO", align: "right" },
          { key: "qty", label: "Suggested qty", align: "right" },
          { key: "supplier", label: "Preferred supplier" },
          { key: "cost", label: "Est. cost", align: "right" },
        ],
        rows,
        footnote: cands.length > shown.length ? `Showing ${shown.length} of ${cands.length}.` : "Highlighted rows are out of stock.",
      },
      ...recBlock(env, "Draft purchase order suggestions", recs.slice(0, lim(env, 5, 3))),
      ...nav(env, [{ label: "Purchase orders", href: "/purchase-orders" }, { label: "Low stock in inventory", href: inventoryHref(undefined, env.scope) }]),
    ],
  );
}

function overstockReply(env: Env): AssistantReply {
  const list = overstockedProducts(env.data, env.scope);
  if (list.length === 0) return reply("overstock", `No product is significantly overstocked ${where(env)}.`, nav(env, [{ label: "Open inventory", href: inventoryHref(undefined, env.scope) }]));
  const shown = list.slice(0, lim(env, 10, 4));
  const items: ProductListItem[] = shown.map(({ product, summary }) => ({
    productId: product.id,
    name: product.name,
    sku: product.sku,
    detail: `Available ${num(env, summary.available)} ${product.uom} · ${(summary.available / product.reorderLevel).toFixed(1)}x reorder level (${num(env, product.reorderLevel)})`,
    href: productHref(product.id),
  }));
  const tied = shown.reduce((s, x) => s + x.summary.available * x.product.unitCost, 0);
  return reply(
    "overstock",
    `${plural(list.length, "product")} ${list.length === 1 ? "is" : "are"} overstocked ${where(env)} (available stock above 8x the reorder level). The ${shown.length} most excessive tie up about ${env.fmt.money(tied)} of stock. Consider pausing purchases or transferring stock to where it is needed.`,
    [{ type: "product-list", title: "Overstocked products", items, footnote: list.length > shown.length ? `Showing ${shown.length} of ${list.length}.` : undefined }, ...nav(env, [{ label: "Plan a transfer", href: "/transfers/new" }, { label: "Open inventory", href: inventoryHref(undefined, env.scope) }])],
  );
}

function warehouseCompare(env: Env): AssistantReply {
  const { data } = env;
  const whs = data.warehouses.filter((w) => w.status === "active");
  const rows = whs.map((w) => {
    const s = warehouseStock(data, w.id);
    return { w, units: s.onHand, available: s.available, value: inventoryValue(data, w.id), util: utilization(data, w.id) };
  });
  if (rows.length === 0) return reply("warehouse_compare", "There are no active warehouses to compare.", []);
  const maxUnits = Math.max(...rows.map((r) => r.units));
  const top = rows.find((r) => r.units === maxUnits) ?? rows[0];
  const totalUnits = rows.reduce((s, r) => s + r.units, 0);
  const share = totalUnits ? Math.round((top.units / totalUnits) * 100) : 0;
  const topValue = [...rows].sort((a, b) => b.value - a.value)[0];
  const tableRows: TableRow[] = rows.map((r) => ({
    cells: {
      warehouse: `${r.w.name} (${r.w.code})`,
      units: num(env, r.units),
      available: num(env, r.available),
      value: env.fmt.money(r.value),
      util: `${r.util}%`,
    },
    href: `/warehouses/${r.w.id}`,
    highlight: r.w.id === top.w.id,
  }));
  return reply(
    "warehouse_compare",
    `${top.w.name} holds the most inventory: ${num(env, top.units)} units (${share}% of ${num(env, totalUnits)} units across ${rows.length} warehouses)${topValue.w.id === top.w.id ? ", and also the highest stock value" : `, while ${topValue.w.name} has the highest stock value at ${env.fmt.money(topValue.value)}`}. Its storage utilization is ${top.util}%.`,
    [
      {
        type: "table",
        title: "Warehouse comparison",
        columns: [
          { key: "warehouse", label: "Warehouse" },
          { key: "units", label: "Units on hand", align: "right" },
          { key: "available", label: "Available", align: "right" },
          { key: "value", label: "Value", align: "right" },
          { key: "util", label: "Utilization", align: "right" },
        ],
        rows: tableRows,
        footnote: "Highlighted row has the most units on hand.",
      },
      ...nav(env, [{ label: "All warehouses", href: "/warehouses" }, { label: "Open inventory", href: "/inventory" }]),
    ],
  );
}

function orderRows(env: Env, orders: WmsData["orders"]): TableRow[] {
  return orders.map((o) => {
    const delayed = isDelayedOrder(o, env.now);
    const late = delayed ? daysBetween(toDate(o.requiredDate) ?? env.now, env.now) : 0;
    return {
      cells: {
        number: o.number,
        customer: orderCustomer(env, o.customerId),
        status: titleCase(o.status),
        priority: titleCase(o.priority),
        required: env.fmt.date(o.requiredDate),
        flag: delayed ? `Delayed${late >= 1 ? ` ${late}d` : ""}` : "",
      },
      href: `/orders/${o.id}`,
      highlight: delayed || o.priority === "urgent" || o.priority === "high",
    };
  });
}

const ORDER_COLUMNS = [
  { key: "number", label: "Order" },
  { key: "customer", label: "Customer" },
  { key: "status", label: "Status" },
  { key: "priority", label: "Priority" },
  { key: "required", label: "Required" },
  { key: "flag", label: "Flag" },
];

function sortOrders(env: Env, orders: WmsData["orders"]) {
  return [...orders].sort(
    (a, b) =>
      Number(isDelayedOrder(b, env.now)) - Number(isDelayedOrder(a, env.now)) ||
      PRIORITY_RANK[a.priority] - PRIORITY_RANK[b.priority] ||
      compareText(a.requiredDate, b.requiredDate) ||
      compareText(a.number, b.number),
  );
}

function ordersReply(env: Env, mode: "pending" | "priority" | "delayed"): AssistantReply {
  const pending = env.data.orders.filter((o) => inScope(o.warehouseId, env.scope) && isPendingOrder(o));
  const delayed = pending.filter((o) => isDelayedOrder(o, env.now));
  const urgent = pending.filter((o) => o.priority === "high" || o.priority === "urgent");
  const list = mode === "pending" ? pending : mode === "priority" ? urgent : delayed;
  const intent: IntentId = mode === "pending" ? "pending_orders" : mode === "priority" ? "high_priority_orders" : "delayed_orders";
  const links = [{ label: "Open orders", href: "/orders" }, { label: "Picking & packing", href: "/picking-packing" }];
  if (list.length === 0) {
    const none = mode === "pending" ? "There are no pending orders" : mode === "priority" ? "There are no pending high-priority orders" : "No order is past its required date";
    return reply(intent, `${none} ${where(env)}.`, nav(env, links));
  }
  const sorted = sortOrders(env, list);
  const shown = sorted.slice(0, lim(env, 10, 5));
  const byStatus = ["draft", "confirmed", "picking", "picked", "packed"]
    .map((s) => [s, list.filter((o) => o.status === s).length] as const)
    .filter(([, n]) => n > 0)
    .map(([s, n]) => `${n} ${s}`)
    .join(", ");
  const text =
    mode === "pending"
      ? `${plural(pending.length, "order")} ${pending.length === 1 ? "is" : "are"} pending ${where(env)}${env.concise ? "" : ` (${byStatus})`}. ${delayed.length} ${delayed.length === 1 ? "is" : "are"} delayed (past the required date and not dispatched) and ${urgent.length} ${urgent.length === 1 ? "is" : "are"} high or urgent priority.`
      : mode === "priority"
        ? `${plural(urgent.length, "pending order")} ${urgent.length === 1 ? "is" : "are"} high or urgent priority ${where(env)}; ${urgent.filter((o) => isDelayedOrder(o, env.now)).length} of them ${urgent.filter((o) => isDelayedOrder(o, env.now)).length === 1 ? "is" : "are"} already delayed.`
        : `${plural(delayed.length, "order")} ${delayed.length === 1 ? "is" : "are"} delayed ${where(env)}: the required date has passed and ${delayed.length === 1 ? "it has" : "they have"} not been dispatched (${byStatus}).`;
  const shownIds = new Set(shown.map((o) => o.id));
  const recs =
    mode === "pending"
      ? []
      : generateRecommendations(env.data, env.settings, env.scope, env.now).filter(
          (r) => (r.kind === "delayed_order" || r.kind === "priority_order") && shownIds.has(r.related.id),
        );
  return reply(intent, text, [
    {
      type: "table",
      title: mode === "pending" ? "Pending orders" : mode === "priority" ? "High-priority orders" : "Delayed orders",
      columns: ORDER_COLUMNS,
      rows: orderRows(env, shown),
      footnote: [list.length > shown.length ? `Showing ${shown.length} of ${list.length}.` : "", "Highlighted rows are delayed or high priority."].filter(Boolean).join(" "),
    },
    ...recBlock(env, "Suggested follow-ups", recs.slice(0, lim(env, 3, 2))),
    ...nav(env, links),
  ]);
}

function activitiesToday(env: Env): AssistantReply {
  const { data, scope, now } = env;
  const start = startOfDay(now).getTime();
  const today = (iso: string | null) => {
    const t = toDate(iso)?.getTime();
    return t !== undefined && t >= start;
  };
  const moves = data.movements.filter((m) => inScope(m.warehouseId, scope) && today(m.createdAt));
  const received = moves.filter((m) => m.type === "receipt").reduce((s, m) => s + m.quantity, 0);
  const dispatched = moves.filter((m) => m.type === "dispatch").reduce((s, m) => s + m.quantity, 0);
  const tasksDone = data.tasks.filter((t) => inScope(t.warehouseId, scope) && today(t.completedAt)).length;
  const tasksNew = data.tasks.filter((t) => inScope(t.warehouseId, scope) && today(t.createdAt)).length;
  const ordersNew = data.orders.filter((o) => inScope(o.warehouseId, scope) && today(o.orderDate)).length;
  const receipts = data.receipts.filter((r) => inScope(r.warehouseId, scope) && today(r.receivedAt)).length;
  const shipments = data.shipments.filter((s) => inScope(s.warehouseId, scope) && today(s.dispatchDate)).length;
  const stats: StatItem[] = [
    { label: "Stock movements", value: num(env, moves.length), tone: "primary", href: "/inventory" },
    { label: "Units received", value: num(env, received), tone: "success", href: "/receiving" },
    { label: "Units dispatched", value: num(env, dispatched), tone: "info", href: "/shipping" },
    { label: "Tasks completed", value: num(env, tasksDone), tone: "teal", href: "/tasks" },
    { label: "Tasks created", value: num(env, tasksNew), tone: "neutral", href: "/tasks" },
    { label: "New sales orders", value: num(env, ordersNew), tone: "warning", href: "/orders" },
  ];
  if (moves.length + tasksDone + tasksNew + ordersNew + receipts + shipments === 0) {
    const last = data.movements.filter((m) => inScope(m.warehouseId, scope)).sort((a, b) => compareText(b.createdAt, a.createdAt))[0];
    return reply("activities_today", `Nothing has been recorded ${where(env)} yet today.${last ? ` The most recent stock movement was on ${env.fmt.dateTime(last.createdAt)}.` : ""}`, nav(env, [{ label: "Open tasks", href: "/tasks" }]));
  }
  const latest = [...moves].sort((a, b) => compareText(b.createdAt, a.createdAt)).slice(0, lim(env, 8, 4));
  const rows: TableRow[] = latest.map((m) => ({
    cells: {
      time: env.fmt.time(m.createdAt),
      type: titleCase(m.type),
      product: env.idx.products.get(m.productId)?.name ?? "Unknown",
      qty: num(env, m.quantity),
      warehouse: whName(env, m.warehouseId),
    },
    href: productHref(m.productId),
  }));
  return reply(
    "activities_today",
    `Today ${where(env)}: ${plural(moves.length, "stock movement")} (${num(env, received)} units received, ${num(env, dispatched)} dispatched), ${plural(receipts, "goods receipt")}, ${plural(shipments, "shipment")} dispatched, ${tasksDone} ${tasksDone === 1 ? "task" : "tasks"} completed and ${tasksNew} created, and ${plural(ordersNew, "new sales order")}.`,
    [
      { type: "stats", items: env.concise ? stats.slice(0, 4) : stats },
      ...(rows.length
        ? [{
            type: "table" as const,
            title: "Latest movements today",
            columns: [
              { key: "time", label: "Time" },
              { key: "type", label: "Type" },
              { key: "product", label: "Product" },
              { key: "qty", label: "Qty", align: "right" as const },
              { key: "warehouse", label: "Warehouse" },
            ],
            rows,
          }]
        : []),
      ...nav(env, [{ label: "Tasks", href: "/tasks" }, { label: "Receiving", href: "/receiving" }, { label: "Shipping", href: "/shipping" }]),
    ],
  );
}

function pendingPoReply(env: Env): AssistantReply {
  const { data, scope, now } = env;
  const open = data.purchaseOrders.filter((p) => inScope(p.warehouseId, scope) && isOpenPO(p));
  const drafts = data.purchaseOrders.filter((p) => inScope(p.warehouseId, scope) && p.status === "draft");
  const links = [{ label: "Purchase orders", href: "/purchase-orders" }, { label: "Receive goods", href: "/receiving" }];
  const draftNote = drafts.length ? ` ${plural(drafts.length, "draft")} ${drafts.length === 1 ? "is" : "are"} also waiting for approval.` : "";
  if (open.length === 0) return reply("pending_po", `There are no approved purchase orders waiting for delivery ${where(env)}.${draftNote}`, nav(env, links));
  const overdue = open.filter((p) => isOverduePO(p, now));
  const sorted = [...open].sort((a, b) => Number(isOverduePO(b, now)) - Number(isOverduePO(a, now)) || compareText(a.expectedDate, b.expectedDate) || compareText(a.number, b.number));
  const shown = sorted.slice(0, lim(env, 10, 5));
  const rows: TableRow[] = shown.map((p) => {
    const od = isOverduePO(p, now);
    const late = od ? daysBetween(toDate(p.expectedDate) ?? now, now) : 0;
    return {
      cells: {
        number: p.number,
        supplier: env.idx.suppliers.get(p.supplierId)?.name ?? "Unknown",
        warehouse: whName(env, p.warehouseId),
        expected: env.fmt.date(p.expectedDate),
        status: titleCase(p.status),
        outstanding: num(env, p.lines.reduce((s, l) => s + poOutstanding(l), 0)),
        value: env.fmt.money(poTotal(p)),
        flag: od ? `Overdue${late >= 1 ? ` ${late}d` : ""}` : "",
      },
      href: `/purchase-orders/${p.id}`,
      highlight: od,
    };
  });
  return reply(
    "pending_po",
    `${plural(open.length, "purchase order")} ${open.length === 1 ? "is" : "are"} approved or partially received and still awaiting delivery ${where(env)}, ${num(env, incomingPoQty(data, scope))} units outstanding in total. ${overdue.length ? `${overdue.length} ${overdue.length === 1 ? "is" : "are"} overdue (expected date passed).` : "None is overdue."}${draftNote}`,
    [
      {
        type: "table",
        title: "Pending purchase orders",
        columns: [
          { key: "number", label: "PO" },
          { key: "supplier", label: "Supplier" },
          { key: "warehouse", label: "Warehouse" },
          { key: "expected", label: "Expected" },
          { key: "status", label: "Status" },
          { key: "outstanding", label: "Units due", align: "right" },
          { key: "value", label: "Value", align: "right" },
          { key: "flag", label: "Flag" },
        ],
        rows,
        footnote: [open.length > shown.length ? `Showing ${shown.length} of ${open.length}.` : "", "Highlighted rows are overdue."].filter(Boolean).join(" "),
      },
      ...recBlock(env, "Overdue deliveries", generateRecommendations(data, env.settings, scope, now).filter((r) => r.kind === "delayed_delivery").slice(0, lim(env, 3, 2))),
      ...nav(env, links),
    ],
  );
}

function putawayReply(env: Env): AssistantReply {
  const { data, scope, now } = env;
  const receipts = data.receipts.filter((r) => r.status === "awaiting_putaway" && inScope(r.warehouseId, scope));
  const tasks = data.tasks.filter((t) => t.type === "putaway" && t.status !== "completed" && inScope(t.warehouseId, scope));
  const staging = warehouseStock(data, scope).staging;
  const links = [{ label: "Putaway tasks", href: "/tasks" }, { label: "Receiving", href: "/receiving" }];
  if (receipts.length === 0 && tasks.length === 0) return reply("pending_putaway", `Nothing is waiting for putaway ${where(env)}. All received goods are in their storage bins.`, nav(env, links));
  const rows: TableRow[] = receipts.slice(0, lim(env, 10, 5)).map((r) => ({
    cells: {
      grn: r.grn,
      supplier: env.idx.suppliers.get(r.supplierId)?.name ?? "Unknown",
      warehouse: whName(env, r.warehouseId),
      received: env.fmt.date(r.receivedAt),
      units: num(env, r.lines.reduce((s, l) => s + l.receivedQty, 0)),
    },
    href: `/receiving/${r.id}`,
  }));
  return reply(
    "pending_putaway",
    `${plural(receipts.length, "goods receipt")} ${receipts.length === 1 ? "is" : "are"} awaiting putaway ${where(env)}, with ${plural(tasks.length, "open putaway task")} and ${num(env, staging)} units in the staging area. Staged stock cannot be picked until it is put away.`,
    [
      { type: "stats", items: [
        { label: "Receipts awaiting putaway", value: num(env, receipts.length), tone: "warning", href: "/receiving" },
        { label: "Open putaway tasks", value: num(env, tasks.length), tone: "info", href: "/tasks" },
        { label: "Units in staging", value: num(env, staging), tone: "primary" },
      ] },
      ...(rows.length
        ? [{
            type: "table" as const,
            title: "Receipts awaiting putaway",
            columns: [
              { key: "grn", label: "Receipt" },
              { key: "supplier", label: "Supplier" },
              { key: "warehouse", label: "Warehouse" },
              { key: "received", label: "Received" },
              { key: "units", label: "Units", align: "right" as const },
            ],
            rows,
          }]
        : []),
      ...recBlock(env, "Suggested follow-ups", generateRecommendations(data, env.settings, scope, now).filter((r) => r.kind === "pending_putaway").slice(0, lim(env, 3, 2))),
      ...nav(env, links),
    ],
  );
}

function periodOf(now: Date) {
  return { from: subDays(startOfDay(now), 29).toISOString(), to: now.toISOString() };
}

function inventorySummary(env: Env): AssistantReply {
  const { data, scope } = env;
  const sum = warehouseStock(data, scope);
  const active = data.products.filter((p) => p.status === "active");
  const inStock = active.filter((p) => productStock(data, p.id, scope).onHand > 0).length;
  const low = lowStockProducts(data, scope, env.factor);
  const over = overstockedProducts(data, scope);
  const bullets = summarizeReport(data, { report: "inventory-summary", scope, ...periodOf(env.now), settings: env.settings });
  const stats: StatItem[] = [
    { label: "Units on hand", value: num(env, sum.onHand), tone: "primary", href: "/inventory" },
    { label: "Inventory value", value: env.fmt.money(inventoryValue(data, scope)), tone: "success", href: "/inventory" },
    { label: "Products in stock", value: `${num(env, inStock)} / ${num(env, active.length)}`, tone: "info", href: "/products" },
    { label: "Low / out of stock", value: num(env, low.length), tone: low.length ? "warning" : "success", href: "/inventory" },
    { label: "Utilization", value: `${utilization(data, scope)}%`, tone: "teal", href: "/warehouses" },
  ];
  return reply(
    "inventory_summary",
    `Inventory summary ${where(env)}: ${num(env, sum.onHand)} units on hand worth ${env.fmt.money(inventoryValue(data, scope))}, ${inStock} of ${active.length} active products in stock, ${low.length} low or out of stock and ${over.length} overstocked.`,
    [
      { type: "stats", items: env.concise ? stats.slice(0, 3) : stats },
      { type: "summary", heading: "Inventory health", bullets: env.concise ? bullets.slice(0, 2) : bullets },
      ...recBlock(env, "Top priorities", generateRecommendations(data, env.settings, scope, env.now).slice(0, lim(env, 3, 1))),
      ...nav(env, [{ label: "Reports", href: "/reports" }, { label: "Open inventory", href: inventoryHref(undefined, scope) }]),
    ],
  );
}

function performanceReply(env: Env): AssistantReply {
  const { data, scope, now } = env;
  const { from, to } = periodOf(now);
  const rows = performanceRows(data, scope, new Date(from), new Date(to));
  if (rows.length === 0) return reply("warehouse_performance", "There are no warehouses to report on.", []);
  const bullets = summarizeReport(data, { report: "warehouse-performance", scope, from, to, settings: env.settings });
  const best = [...rows].sort((a, b) => b.dispatched - a.dispatched || b.tasks - a.tasks)[0];
  const tableRows: TableRow[] = rows.map((r) => ({
    cells: {
      warehouse: r.warehouse.name,
      units: num(env, r.units),
      util: `${r.utilization}%`,
      pending: num(env, data.orders.filter((o) => o.warehouseId === r.warehouse.id && isPendingOrder(o)).length),
      dispatched: `${r.dispatched}/${r.orders}`,
      receipts: num(env, r.receipts),
      tasks: num(env, r.tasks),
    },
    href: `/warehouses/${r.warehouse.id}`,
    highlight: rows.length > 1 && r.warehouse.id === best.warehouse.id,
  }));
  return reply(
    "warehouse_performance",
    `Warehouse performance over the last 30 days ${where(env)}: ${rows.reduce((s, r) => s + r.dispatched, 0)} orders dispatched, ${rows.reduce((s, r) => s + r.receipts, 0)} goods receipts and ${rows.reduce((s, r) => s + r.tasks, 0)} tasks completed.${rows.length > 1 ? ` ${best.warehouse.name} dispatched the most orders.` : ""}`,
    [
      {
        type: "table",
        title: "Warehouse performance (30 days)",
        columns: [
          { key: "warehouse", label: "Warehouse" },
          { key: "units", label: "Units", align: "right" },
          { key: "util", label: "Utilization", align: "right" },
          { key: "pending", label: "Pending orders", align: "right" },
          { key: "dispatched", label: "Dispatched / orders", align: "right" },
          { key: "receipts", label: "Receipts", align: "right" },
          { key: "tasks", label: "Tasks done", align: "right" },
        ],
        rows: tableRows,
        footnote: rows.length > 1 ? "Highlighted row dispatched the most orders." : undefined,
      },
      { type: "summary", heading: "Performance notes", bullets: env.concise ? bullets.slice(0, 2) : bullets },
      ...nav(env, [{ label: "Reports", href: "/reports" }, { label: "Warehouses", href: "/warehouses" }]),
    ],
  );
}

function kpiReply(env: Env): AssistantReply {
  const kpis = explainKpis(env.data, env.scope, env.settings, env.now);
  return reply(
    "kpi_explain",
    `The dashboard shows ${kpis.length} KPIs. Here is what each one means, with the current value ${where(env)}.`,
    [
      { type: "stats", items: kpis.map((k) => ({ label: k.label, value: k.value, href: k.href, tone: "primary" as const })) },
      { type: "summary", heading: "What each KPI means", bullets: kpis.map((k) => `${k.label} (${k.value}): ${k.explanation}`) },
      ...nav(env, [{ label: "Open dashboard", href: "/dashboard" }]),
    ],
  );
}

function movementSummary(env: Env): AssistantReply {
  const { data, scope, now } = env;
  const { from, to } = periodOf(now);
  const bullets = summarizeReport(data, { report: "stock-movement", scope, from, to, settings: env.settings });
  const start = new Date(from).getTime();
  const moves = data.movements.filter((m) => inScope(m.warehouseId, scope) && (toDate(m.createdAt)?.getTime() ?? 0) >= start);
  const unitsIn = moves.filter((m) => m.onHandDelta > 0).reduce((s, m) => s + m.onHandDelta, 0);
  const unitsOut = moves.filter((m) => m.onHandDelta < 0).reduce((s, m) => s - m.onHandDelta, 0);
  return reply(
    "movement_summary",
    `Stock movement ${where(env)} over the last 30 days: ${num(env, unitsIn)} units in, ${num(env, unitsOut)} units out across ${plural(moves.length, "movement")}.`,
    [
      { type: "stats", items: [
        { label: "Movements", value: num(env, moves.length), tone: "primary" },
        { label: "Units in", value: num(env, unitsIn), tone: "success" },
        { label: "Units out", value: num(env, unitsOut), tone: "warning" },
        { label: "Net change", value: `${unitsIn - unitsOut >= 0 ? "+" : "-"}${num(env, Math.abs(unitsIn - unitsOut))}`, tone: "info" },
      ] },
      { type: "summary", heading: "Movement highlights", bullets: env.concise ? bullets.slice(0, 2) : bullets },
      ...nav(env, [{ label: "Reports", href: "/reports" }, { label: "Open inventory", href: "/inventory" }]),
    ],
  );
}

function productStockReply(env: Env, match: NonNullable<ReturnType<typeof detectIntent>["product"]>): AssistantReply {
  const { data, scope } = env;
  if (match.kind === "candidates") {
    return reply(
      "product_stock",
      "I found several products that could match. Ask again using the full product name or SKU to see its stock by warehouse.",
      [{ type: "product-list", title: "Matching products", items: productItems(env, match.products.map((product) => ({ product, summary: productStock(data, product.id, scope) }))) }],
    );
  }
  const p = match.product;
  const total = productStock(data, p.id, scope);
  const status = getStockStatus(total, p.reorderLevel, env.factor);
  const whs = data.warehouses.filter((w) => inScope(w.id, scope));
  const rows: TableRow[] = whs.map((w) => {
    const s = productStock(data, p.id, w.id);
    return {
      cells: {
        warehouse: w.name,
        onHand: num(env, s.onHand),
        reserved: num(env, s.reserved),
        available: num(env, s.available),
        staging: num(env, s.staging),
        status: titleCase(getStockStatus(s, p.reorderLevel, env.factor)),
      },
      href: inventoryHref(p.id, w.id),
      highlight: s.available === Math.max(...whs.map((x) => productStock(data, p.id, x.id).available)) && whs.length > 1,
    };
  });
  if (whs.length > 1) {
    rows.push({
      cells: {
        warehouse: "Total",
        onHand: num(env, total.onHand),
        reserved: num(env, total.reserved),
        available: num(env, total.available),
        staging: num(env, total.staging),
        status: titleCase(status),
      },
    });
  }
  const transit = inTransitQty(data, { productId: p.id });
  const incoming = incomingPoQty(data, scope, p.id);
  const cand = reorderCandidates(data, env.settings, scope).find((c) => c.product.id === p.id);
  const stats: StatItem[] = [
    { label: "Available", value: `${num(env, total.available)} ${p.uom}`, tone: total.available > 0 ? "success" : "danger" },
    { label: "Reorder level", value: num(env, p.reorderLevel), tone: "neutral" },
    { label: "In transit", value: num(env, transit), tone: "info" },
    { label: "On open POs", value: num(env, incoming), tone: "teal" },
  ];
  const link = (label: string, href: string) => ({ label, href });
  return reply(
    "product_stock",
    `${p.name} (${p.sku}): ${num(env, total.available)} ${p.uom} available ${where(env)} (${num(env, total.onHand)} on hand, ${num(env, total.reserved)} reserved, ${num(env, total.blocked)} blocked). Status: ${titleCase(status)}.${transit ? ` ${num(env, transit)} more are in transit between warehouses.` : ""}${incoming ? ` ${num(env, incoming)} are due on open purchase orders.` : ""}`,
    [
      { type: "stats", items: env.concise ? stats.slice(0, 2) : stats },
      {
        type: "table",
        title: `${p.name} by warehouse`,
        columns: [
          { key: "warehouse", label: "Warehouse" },
          { key: "onHand", label: "On hand", align: "right" },
          { key: "reserved", label: "Reserved", align: "right" },
          { key: "available", label: "Available", align: "right" },
          { key: "staging", label: "Staging", align: "right" },
          { key: "status", label: "Status" },
        ],
        rows,
      },
      { type: "navigation", links: [link("Open product", productHref(p.id)), link("View in inventory", inventoryHref(p.id, scope)), ...(cand ? [link("Review draft purchase order", cand.href)] : [])] },
    ],
  );
}

/* ---------------------------------------------------------------- entry point */

/**
 * Deterministic, read-only assistant. Same data + same message + same clock => same reply.
 * It never mutates `data` and never claims to have performed an action.
 */
export function processMessage(
  text: string,
  data: WmsData,
  settings: AssistantSettings,
  ctx: AssistantContext,
): AssistantReply {
  const intent = detectIntent(text, data);
  const scope: ID | "all" = intent.warehouseId ?? ctx.scope;
  const env: Env = {
    data,
    idx: indexData(data),
    settings,
    scope,
    scopeText: scopeLabel(data, scope),
    now: ctx.now ?? new Date(),
    fmt: createFormatter({ currency: settings.currency, dateFormat: settings.dateFormat, timezone: settings.timezone }),
    concise: settings.aiResponseStyle === "concise",
    recsOn: settings.aiRecommendationsEnabled,
    factor: settings.lowStockThresholdFactor,
  };

  switch (intent.id) {
    case "help":
      return helpReply();
    case "stock_count":
      return stockCount(env);
    case "low_stock":
      return lowStockReply(env, "low");
    case "nearly_out":
      return lowStockReply(env, "nearly");
    case "out_of_stock":
      return lowStockReply(env, "out");
    case "reorder":
      return reorderReply(env);
    case "overstock":
      return overstockReply(env);
    case "warehouse_compare":
      return warehouseCompare({ ...env, scope: "all", scopeText: scopeLabel(data, "all") });
    case "warehouse_performance":
      return performanceReply(env);
    case "pending_orders":
      return ordersReply(env, "pending");
    case "high_priority_orders":
      return ordersReply(env, "priority");
    case "delayed_orders":
      return ordersReply(env, "delayed");
    case "activities_today":
      return activitiesToday(env);
    case "pending_po":
      return pendingPoReply(env);
    case "pending_putaway":
      return putawayReply(env);
    case "inventory_summary":
      return inventorySummary(env);
    case "movement_summary":
      return movementSummary(env);
    case "kpi_explain":
      return kpiReply(env);
    case "product_stock":
      return intent.product ? productStockReply(env, intent.product) : fallbackReply();
    default:
      return fallbackReply();
  }
}
