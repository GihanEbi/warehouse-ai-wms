/**
 * Unit checks for the deterministic mock AI: run with `npx tsx scripts/check-ai.ts`.
 * Uses the seed generator and the shared selectors; exits non-zero on the first batch of failures.
 */
import { generateSeed } from "../src/data/mock/seed";
import { DEFAULT_SETTINGS } from "../src/lib/settings-defaults";
import { lowStockProducts, overstockedProducts, warehouseStock, inventoryValue } from "../src/lib/inventory/selectors";
import { generateRecommendations, processMessage, summarizeReport, explainKpis } from "../src/lib/mock-ai";
import { SUGGESTED_PROMPTS, type AssistantBlock, type AssistantReply, type ReportKind } from "../src/lib/mock-ai/types";
import { MORE_PROMPTS } from "../src/lib/mock-ai/engine";
import type { AppSettings } from "../src/types";

let failures = 0;
let checks = 0;
function check(name: string, cond: boolean, detail?: unknown) {
  checks++;
  if (!cond) {
    failures++;
    console.error(`FAIL  ${name}`, detail === undefined ? "" : detail);
  } else {
    console.log(`ok    ${name}`);
  }
}

const now = new Date();
const data = generateSeed(now);
const settings: AppSettings = { ...DEFAULT_SETTINGS };
const ask = (text: string, s: Partial<AppSettings> = {}, scope: string = "all"): AssistantReply =>
  processMessage(text, data, { ...settings, ...s }, { scope, now });
const blocksOf = <T extends AssistantBlock["type"]>(r: AssistantReply, t: T) =>
  r.blocks.filter((b): b is Extract<AssistantBlock, { type: T }> => b.type === t);

// ---------------------------------------------------------------- low stock
const low = lowStockProducts(data, "all", settings.lowStockThresholdFactor);
const lowReply = ask("Show low stock products");
check("low-stock intent", lowReply.intent === "low_stock", lowReply.intent);
const lowList = blocksOf(lowReply, "product-list")[0];
check("low-stock list equals lowStockProducts()", !!lowList && JSON.stringify(lowList.items.map((i) => i.productId)) === JSON.stringify(low.slice(0, 12).map((l) => l.product.id)));
check("low-stock has reorder recommendation cards", blocksOf(lowReply, "recommendations").length === 1);
const outReply = ask("Which products are out of stock?");
check("out-of-stock intent", outReply.intent === "out_of_stock", outReply.intent);
const nearly = ask("Which products are nearly out of stock?");
check("nearly-out intent", nearly.intent === "nearly_out", nearly.intent);
const nearlyIds = blocksOf(nearly, "product-list")[0]?.items.map((i) => i.productId) ?? [];
check("nearly-out = low-stock status only", JSON.stringify(nearlyIds) === JSON.stringify(low.filter((l) => l.status === "low_stock").map((l) => l.product.id)));

// ---------------------------------------------------------------- intent coverage for the 10 headline prompts
const expectedIntent: Record<string, string> = {
  "How many products are currently in stock?": "stock_count",
  "Show low stock products.": "low_stock",
  "Which warehouse has the most inventory?": "warehouse_compare",
  "What orders are pending?": "pending_orders",
  "Show today's warehouse activities.": "activities_today",
  "Which products should I reorder?": "reorder",
  "Generate an inventory summary.": "inventory_summary",
  "Which products are nearly out of stock?": "nearly_out",
  "Show pending purchase orders.": "pending_po",
  "Give me a warehouse performance summary.": "warehouse_performance",
  "Explain dashboard KPIs.": "kpi_explain",
  "Show delayed orders.": "delayed_orders",
  "Show high priority orders.": "high_priority_orders",
  "Show pending putaway.": "pending_putaway",
  "Show stock movement summary.": "movement_summary",
  "Show out of stock products.": "out_of_stock",
  "Which products are overstocked?": "overstock",
  "Stock of Samba Rice.": "product_stock",
  "What can you do?": "help",
};
for (const [q, intent] of Object.entries(expectedIntent)) {
  const r = ask(q);
  check(`intent "${q}" -> ${intent}`, r.intent === intent, r.intent);
}
check("all suggested prompts are supported", [...SUGGESTED_PROMPTS, ...MORE_PROMPTS].every((p) => ask(p).intent !== "fallback"));

// ---------------------------------------------------------------- stock count
const sc = ask("How many products are currently in stock?");
const active = data.products.filter((p) => p.status === "active");
const unitsOnHand = warehouseStock(data, "all").onHand;
check("stock count mentions live unit total", sc.text.includes(new Intl.NumberFormat("en-US").format(unitsOnHand)), sc.text);
check("stock count mentions active product total", sc.text.includes(`of ${active.length} active`), sc.text);

// ---------------------------------------------------------------- warehouse comparison
const wc = ask("Which warehouse has the most inventory?");
const wcTable = blocksOf(wc, "table")[0];
check("warehouse comparison lists every warehouse", wcTable?.rows.length === data.warehouses.length);
const maxWh = [...data.warehouses].sort((a, b) => warehouseStock(data, b.id).onHand - warehouseStock(data, a.id).onHand)[0];
check("warehouse comparison highlights the max", wcTable.rows.filter((r) => r.highlight).length === 1 && wcTable.rows.find((r) => r.highlight)?.cells.warehouse.startsWith(maxWh.name) === true, wcTable.rows.map((r) => r.cells.warehouse));
check("warehouse comparison text names the max", wc.text.startsWith(maxWh.name), wc.text);

// ---------------------------------------------------------------- warehouse scoping
const kandy = data.warehouses.find((w) => w.city === "Kandy");
if (kandy) {
  const scoped = ask("Show low stock products in Kandy");
  const exp = lowStockProducts(data, kandy.id, settings.lowStockThresholdFactor).map((l) => l.product.id);
  const got = blocksOf(scoped, "product-list")[0]?.items.map((i) => i.productId) ?? [];
  check("warehouse-aware (Kandy mention)", JSON.stringify(got) === JSON.stringify(exp.slice(0, 12)) || (exp.length === 0 && got.length === 0), { exp, got });
  const byHeader = processMessage("Show low stock products", data, settings, { scope: kandy.id, now });
  check("scope from header context", byHeader.text.includes(kandy.name), byHeader.text);
}

// ---------------------------------------------------------------- reorder
const rr = ask("Which products should I reorder?");
const recBlock = blocksOf(rr, "recommendations")[0];
const productIds = new Set(data.products.map((p) => p.id));
check("reorder shows recommendation cards", !!recBlock && recBlock.items.length > 0);
check("reorder recs reference existing products", (recBlock?.items ?? []).every((r) => r.related.type === "product" && productIds.has(r.related.id)));
check("reorder actions are pre-filled draft PO links", (recBlock?.items ?? []).every((r) => /^\/purchase-orders\/new\?product=[^&]+(&supplier=[^&]+)?&warehouse=[^&]+&qty=\d+$/.test(r.action.href)), recBlock?.items.map((r) => r.action.href));
const qtys = (recBlock?.items ?? []).map((r) => Number(new URL(r.action.href, "http://x").searchParams.get("qty")));
check("reorder quantities are positive multiples of 5", qtys.every((q) => q >= 10 && q % 5 === 0), qtys);
const norec = ask("Which products should I reorder?", { aiRecommendationsEnabled: false });
check("no recommendation cards when disabled", blocksOf(norec, "recommendations").length === 0);
check("reorder table still present when recs disabled", blocksOf(norec, "table").length === 1);

// ---------------------------------------------------------------- generateRecommendations
const recs = generateRecommendations(data, settings, "all", now);
check("recommendations exist", recs.length > 0);
check("recommendation ids unique", new Set(recs.map((r) => r.id)).size === recs.length);
check("recommendations are sorted by priority", recs.every((r, i) => i === 0 || ["urgent", "high", "normal", "low"].indexOf(recs[i - 1].priority) <= ["urgent", "high", "normal", "low"].indexOf(r.priority)));
check("out-of-stock recs are urgent", recs.filter((r) => r.kind === "out_of_stock").every((r) => r.priority === "urgent"));
check("recommendation ids follow kind:ref format", recs.every((r) => r.id.startsWith(`${r.kind}:`)));
check("recommendation numbers present in explanation", recs.filter((r) => r.kind === "reorder").every((r) => /\d/.test(r.explanation)));
check("generateRecommendations is deterministic", JSON.stringify(recs) === JSON.stringify(generateRecommendations(data, settings, "all", now)));
for (const w of data.warehouses) {
  const scoped = generateRecommendations(data, settings, w.id, now);
  check(`scoped recommendations (${w.code}) reference scope in id`, scoped.filter((r) => r.kind === "reorder" || r.kind === "out_of_stock").every((r) => r.id.endsWith(`:${w.id}`) && r.action.href.includes(`warehouse=${w.id}`)));
}

// A product with an approved PO that covers the shortage must not be recommended
{
  const lowCand = low.find((l) => l.status === "low_stock");
  if (lowCand) {
    const clone = structuredClone(data);
    const po = clone.purchaseOrders.find((p) => p.status === "draft");
    if (po) {
      po.status = "approved";
      po.lines = [{ id: "pol_test", productId: lowCand.product.id, quantity: 10_000, unitCost: 1, receivedQty: 0, rejectedQty: 0 }];
      const after = generateRecommendations(clone, settings, "all", now);
      check("incoming PO covering the shortage suppresses the reorder rec", !after.some((r) => r.related.id === lowCand.product.id && (r.kind === "reorder" || r.kind === "out_of_stock")));
      const pending = processMessage("Show pending purchase orders", clone, settings, { scope: "all", now });
      const rows = blocksOf(pending, "table")[0]?.rows ?? [];
      check("approved PO appears in pending purchase orders", rows.some((r) => r.cells.number === po.number), rows.map((r) => r.cells.number));
    }
  }
}

// ---------------------------------------------------------------- pending / delayed orders, POs, putaway
const pend = ask("What orders are pending?");
const pendRows = blocksOf(pend, "table")[0]?.rows ?? [];
const pendingStatuses = new Set(["draft", "confirmed", "picking", "picked", "packed"]);
const pendingOrders = data.orders.filter((o) => pendingStatuses.has(o.status));
check("pending orders table only holds pending orders", pendRows.every((r) => pendingOrders.some((o) => o.number === r.cells.number)));
check("pending orders text states the pending count", pend.text.startsWith(`${pendingOrders.length} order`), pend.text);
const delayedReply = ask("Show delayed orders");
const delayedRows = blocksOf(delayedReply, "table")[0]?.rows ?? [];
check("delayed orders are really past required date", delayedRows.every((r) => r.cells.flag.startsWith("Delayed")));
const poReply = ask("Show pending purchase orders.");
const poRows = blocksOf(poReply, "table")[0]?.rows ?? [];
const openPos = data.purchaseOrders.filter((p) => p.status === "approved" || p.status === "partially_received");
check("pending POs = approved + partially received", poRows.length === Math.min(openPos.length, 10) && poRows.every((r) => openPos.some((p) => p.number === r.cells.number)));

// ---------------------------------------------------------------- product-aware
const samba = ask("What is the stock of Samba Rice?");
check("product query resolves Samba Rice", samba.intent === "product_stock" && samba.text.startsWith("Samba Rice"), samba.text);
const sambaTable = blocksOf(samba, "table")[0];
check("product table has one row per warehouse + total", sambaTable?.rows.length === data.warehouses.length + 1);
const bySku = ask("stock of GRA-NAD-0018");
check("SKU lookup", bySku.text.startsWith("Nadu Rice"), bySku.text);

// ---------------------------------------------------------------- summaries / kpis
const inv = ask("Generate an inventory summary.");
check("inventory summary includes live unit total", inv.text.includes(new Intl.NumberFormat("en-US").format(warehouseStock(data, "all").onHand)));
check("inventory summary has summary block", blocksOf(inv, "summary").length === 1);
const kpi = ask("Explain dashboard KPIs");
check("KPI explanation covers 8 KPIs", blocksOf(kpi, "summary")[0]?.bullets.length === 8);
check("explainKpis() returns 8", explainKpis(data, "all", settings, now).length === 8);
check("KPI inventory value uses selector", explainKpis(data, "all", settings, now).some((k) => k.value.includes(new Intl.NumberFormat("en-LK", { maximumFractionDigits: 0 }).format(Math.round(inventoryValue(data, "all"))))));

// ---------------------------------------------------------------- report summaries
const reports: ReportKind[] = ["inventory-summary", "stock-movement", "low-stock", "purchase-orders", "sales-orders", "warehouse-performance"];
const from = new Date(now.getTime() - 29 * 86_400_000).toISOString();
for (const report of reports) {
  const b = summarizeReport(data, { report, scope: "all", from, to: now.toISOString() });
  check(`summarizeReport(${report}) 1-6 non-empty bullets`, b.length >= 1 && b.length <= 6 && b.every((s) => s.trim().length > 20), b);
  const w = summarizeReport(data, { report, scope: data.warehouses[0].id, from, to: now.toISOString(), category: data.products[0].category });
  check(`summarizeReport(${report}) scoped + category works`, w.length >= 1);
  check(`summarizeReport(${report}) deterministic`, JSON.stringify(b) === JSON.stringify(summarizeReport(data, { report, scope: "all", from, to: now.toISOString() }, now)));
}
check("low-stock summary counts match selector", summarizeReport(data, { report: "low-stock", scope: "all", from, to: now.toISOString() })[0].startsWith(`${low.length} product`));
check("overstock count in inventory summary", summarizeReport(data, { report: "inventory-summary", scope: "all", from, to: now.toISOString() })[1].includes(`${overstockedProducts(data, "all").length} product`));

// ---------------------------------------------------------------- determinism / fallback / safety
for (const q of [...SUGGESTED_PROMPTS, "Stock of Samba Rice", "banana smoothie recipe"]) {
  check(`deterministic: "${q}"`, JSON.stringify(ask(q)) === JSON.stringify(ask(q)));
}
const fb = ask("What is the weather like on Mars?");
check("unsupported -> fallback", fb.intent === "fallback");
check("fallback lists clickable suggestions", blocksOf(fb, "suggestions")[0]?.prompts.length === SUGGESTED_PROMPTS.length);
check("empty input -> fallback", ask("   ").intent === "fallback");
const concise = ask("Show pending purchase orders", { aiResponseStyle: "concise" });
const detailed = ask("Show pending purchase orders", { aiResponseStyle: "detailed" });
check("concise style is no longer than detailed", JSON.stringify(concise).length <= JSON.stringify(detailed).length && concise.blocks.length <= detailed.blocks.length);

const BAD = /\b(i('| ha)ve (created|submitted|placed|ordered|updated|adjusted|approved|sent|changed)|i (created|submitted|placed|ordered|updated|adjusted|approved|have created)|has been (created|submitted|placed)|i will (create|order|place))\b/i;
const everything = [...SUGGESTED_PROMPTS, ...MORE_PROMPTS, "Show low stock products in Galle", "banana"];
for (const q of everything) {
  for (const style of ["concise", "detailed"] as const) {
    const r = ask(q, { aiResponseStyle: style });
    const flat = JSON.stringify(r);
    if (BAD.test(flat)) check(`no action claims: "${q}" (${style})`, false, flat.match(BAD)?.[0]);
  }
}
check("no reply claims an action was performed", true);

// ---------------------------------------------------------------- purity: AI never mutates data
{
  const snapshot = JSON.stringify(data);
  for (const q of everything) ask(q);
  generateRecommendations(data, settings, "all", now);
  for (const report of reports) summarizeReport(data, { report, scope: "all", from, to: now.toISOString() });
  check("AI never mutates the data set", JSON.stringify(data) === snapshot);
}

// replies must be JSON-serialisable (persisted in the chat store)
check("replies survive JSON round-trip", everything.every((q) => { const r = ask(q); return JSON.stringify(JSON.parse(JSON.stringify(r))) === JSON.stringify(r); }));

console.log(`\n${checks - failures}/${checks} checks passed`);
process.exit(failures ? 1 : 0);
