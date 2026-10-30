/**
 * Report builders. Pure functions of (data, params, settings) so the reports page, the print view,
 * the AI summary and tests all show the same numbers. No React in here.
 */
import type { AppSettings, ID, PurchaseOrder, SalesOrder, WmsData } from "@/types";
import {
  getStockStatus,
  indexData,
  lowStockProducts,
  productStock,
  utilization,
  type WarehouseScope,
} from "@/lib/inventory/selectors";
import { orderTotal } from "@/lib/workflows/orders";
import { poOutstanding, poTotal } from "@/lib/workflows/purchasing";
import {
  activityMovements,
  inRange,
  inScope,
  isOverdue,
  orderConfirmedAt,
  orderDispatchedAt,
  orderTrendFromOrders,
  stockFlowSeries,
} from "@/features/dashboard/metrics";
import { MOVEMENT_LABELS } from "@/features/inventory/movement-badge";
import { REPORT_KINDS, type ReportCell, type ReportParams, type ReportResult } from "./types";

type Factor = Pick<AppSettings, "lowStockThresholdFactor">;

const range = (p: ReportParams) => ({ from: p.from, to: p.to });
const catOk = (category: string, productCategory: string | undefined) => category === "all" || productCategory === category;
const top = <T,>(list: T[], n: number) => list.slice(0, n);

export function buildReport(data: WmsData, p: ReportParams, settings: Factor, now: Date = new Date()): ReportResult {
  switch (p.report) {
    case "inventory-summary":
      return inventorySummary(data, p, settings);
    case "stock-movement":
      return stockMovement(data, p);
    case "low-stock":
      return lowStock(data, p, settings);
    case "purchase-orders":
      return purchaseOrders(data, p, now);
    case "sales-orders":
      return salesOrders(data, p);
    case "warehouse-performance":
      return warehousePerformance(data, p);
  }
}

const meta = (kind: ReportParams["report"]) => REPORT_KINDS.find((r) => r.kind === kind)!;

/* --------------------------------------------------------- inventory summary */

function inventorySummary(data: WmsData, p: ReportParams, settings: Factor): ReportResult {
  const scope = p.scope;
  const rows: ReportCell[][] = [];
  const byCategory = new Map<string, number>();
  let units = 0;
  let value = 0;
  let stocked = 0;
  let attention = 0;
  const lines: { name: string; value: number }[] = [];
  for (const product of data.products) {
    if (product.status === "archived" || !catOk(p.category, product.category)) continue;
    const s = productStock(data, product.id, scope);
    if (s.physical <= 0 && product.status !== "active") continue;
    const status = getStockStatus(s, product.reorderLevel, settings.lowStockThresholdFactor);
    const v = s.physical * product.unitCost;
    units += s.physical;
    value += v;
    if (s.physical > 0) stocked += 1;
    if (status === "low_stock" || status === "out_of_stock") attention += 1;
    byCategory.set(product.category, (byCategory.get(product.category) ?? 0) + v);
    lines.push({ name: product.name, value: Math.round(v) });
    rows.push([product.sku, product.name, product.category, s.onHand, s.reserved, s.blocked, s.available, s.staging + s.returns, product.unitCost, v, status]);
  }
  rows.sort((a, b) => Number(b[9]) - Number(a[9]));
  const chartData =
    p.category === "all"
      ? [...byCategory.entries()].sort((a, b) => b[1] - a[1]).map(([name, v]) => ({ name, value: Math.round(v) }))
      : top(lines.sort((a, b) => b.value - a.value), 10);
  return {
    kind: p.report,
    title: meta(p.report).label,
    description: "Current stock position (as at report time) — the date range does not apply.",
    kpis: [
      { id: "stocked", label: "Products in stock", value: stocked, format: "number", tone: "primary" },
      { id: "units", label: "Total units (all locations)", value: units, format: "number", tone: "info" },
      { id: "value", label: "Inventory value", value, format: "money", tone: "teal" },
      { id: "attention", label: "Low / out of stock", value: attention, format: "number", tone: attention ? "warning" : "success" },
    ],
    chart: {
      kind: "hbar",
      title: p.category === "all" ? "Inventory value by category" : `Top products by value — ${p.category}`,
      seriesName: "Value",
      data: chartData,
      valueFormat: "money",
    },
    columns: [
      { id: "sku", header: "SKU", format: "text" },
      { id: "product", header: "Product", format: "text" },
      { id: "category", header: "Category", format: "text" },
      { id: "onHand", header: "On hand (storage)", format: "number" },
      { id: "reserved", header: "Reserved", format: "number" },
      { id: "blocked", header: "Blocked", format: "number" },
      { id: "available", header: "Available", format: "number" },
      { id: "staging", header: "Staging / returns", format: "number" },
      { id: "unitCost", header: "Unit cost", format: "money" },
      { id: "value", header: "Stock value", format: "money" },
      { id: "status", header: "Status", format: "status" },
    ],
    rows,
    notes: ["Stock value = physical units in every location × unit cost.", "Status uses each product's reorder level × the low-stock threshold factor in Settings."],
  };
}

/* ------------------------------------------------------------ stock movement */

function stockMovement(data: WmsData, p: ReportParams): ReportResult {
  const idx = indexData(data);
  const f = { scope: p.scope, range: range(p), category: p.category };
  const moves = activityMovements(data, f).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  const flow = stockFlowSeries(data, f);
  return {
    kind: p.report,
    title: meta(p.report).label,
    description: "All stock movements recorded in the period (opening balances excluded).",
    kpis: [
      { id: "count", label: "Movements", value: moves.length, format: "number", tone: "primary" },
      { id: "in", label: "Units in", value: flow.totalIn, format: "number", tone: "success" },
      { id: "out", label: "Units out", value: flow.totalOut, format: "number", tone: "warning" },
      { id: "net", label: "Net change (units)", value: flow.net, format: "number", tone: flow.net >= 0 ? "info" : "danger" },
    ],
    chart: {
      kind: "bars",
      title: `Stock in vs stock out per ${flow.unit}`,
      xKey: "label",
      series: [
        { key: "in", name: "Stock in", color: "var(--chart-2)" },
        { key: "out", name: "Stock out", color: "var(--chart-1)" },
      ],
      data: flow.points.map((pt) => ({ label: pt.label, in: pt.in, out: pt.out })),
      valueFormat: "number",
    },
    columns: [
      { id: "date", header: "Date / time", format: "datetime" },
      { id: "ref", header: "Reference", format: "text" },
      { id: "product", header: "Product", format: "text" },
      { id: "type", header: "Type", format: "text" },
      { id: "warehouse", header: "Warehouse", format: "text" },
      { id: "qty", header: "Quantity", format: "signed" },
      { id: "from", header: "From", format: "text" },
      { id: "to", header: "To", format: "text" },
      { id: "by", header: "Performed by", format: "text" },
    ],
    rows: moves.map((m) => [
      m.createdAt,
      m.reference,
      idx.products.get(m.productId)?.name ?? "—",
      MOVEMENT_LABELS[m.type],
      idx.warehouses.get(m.warehouseId)?.code ?? "—",
      m.onHandDelta,
      m.fromLabel,
      m.toLabel,
      idx.users.get(m.performedBy)?.name ?? "—",
    ]),
    notes: [
      "Stock in = movements that increase on-hand (receipts, transfers in, return receipts, positive adjustments).",
      "Stock out = movements that decrease on-hand (dispatches, transfers out, negative adjustments, return write-offs).",
      "A quantity of 0 means a movement inside the warehouse (putaway, bin transfer, block/unblock).",
    ],
  };
}

/* ---------------------------------------------------------------- low stock */

function lowStock(data: WmsData, p: ReportParams, settings: Factor): ReportResult {
  const idx = indexData(data);
  const factor = settings.lowStockThresholdFactor;
  const list = lowStockProducts(data, p.scope, factor).filter((l) => catOk(p.category, l.product.category));
  const onOrder = new Map<ID, number>();
  for (const po of data.purchaseOrders) {
    if ((po.status !== "approved" && po.status !== "partially_received") || !inScope(po.warehouseId, p.scope)) continue;
    for (const l of po.lines) onOrder.set(l.productId, (onOrder.get(l.productId) ?? 0) + poOutstanding(l));
  }
  const rows: ReportCell[][] = list.map(({ product, summary, status }) => {
    const level = Math.round(product.reorderLevel * factor);
    const shortfall = Math.max(0, level - summary.available);
    return [
      product.sku,
      product.name,
      product.category,
      summary.available,
      level,
      shortfall,
      onOrder.get(product.id) ?? 0,
      idx.suppliers.get(product.preferredSupplierId ?? "")?.name ?? "—",
      shortfall * product.unitCost,
      status,
    ];
  });
  const out = list.filter((l) => l.status === "out_of_stock").length;
  const shortfallUnits = rows.reduce((s, r) => s + Number(r[5]), 0);
  const cost = rows.reduce((s, r) => s + Number(r[8]), 0);
  return {
    kind: p.report,
    title: meta(p.report).label,
    description: "Products whose available stock is at or below their reorder level (current position).",
    kpis: [
      { id: "low", label: "Low stock products", value: list.length - out, format: "number", tone: "warning" },
      { id: "out", label: "Out of stock", value: out, format: "number", tone: out ? "danger" : "success" },
      { id: "shortfall", label: "Total shortfall (units)", value: shortfallUnits, format: "number", tone: "info" },
      { id: "cost", label: "Est. cost to reach reorder level", value: cost, format: "money", tone: "teal" },
    ],
    chart: {
      kind: "hbar",
      title: "Largest shortfall vs reorder level (units)",
      seriesName: "Shortfall",
      data: top(
        rows
          .map((r) => ({ name: String(r[1]), value: Number(r[5]) }))
          .sort((a, b) => b.value - a.value),
        10,
      ),
      valueFormat: "number",
    },
    columns: [
      { id: "sku", header: "SKU", format: "text" },
      { id: "product", header: "Product", format: "text" },
      { id: "category", header: "Category", format: "text" },
      { id: "available", header: "Available", format: "number" },
      { id: "reorder", header: "Reorder level", format: "number" },
      { id: "shortfall", header: "Shortfall", format: "number" },
      { id: "onOrder", header: "On order", format: "number" },
      { id: "supplier", header: "Preferred supplier", format: "text" },
      { id: "cost", header: "Est. cost", format: "money" },
      { id: "status", header: "Status", format: "status" },
    ],
    rows,
    notes: ["Shortfall = reorder level × threshold factor − available (never below 0).", "On order = outstanding units on approved / partially received purchase orders."],
  };
}

/* ---------------------------------------------------------- purchase orders */

const poCategoryOk = (po: PurchaseOrder, idx: ReturnType<typeof indexData>, category: string) =>
  category === "all" || po.lines.some((l) => idx.products.get(l.productId)?.category === category);

function purchaseOrders(data: WmsData, p: ReportParams, now: Date): ReportResult {
  const idx = indexData(data);
  const list = data.purchaseOrders
    .filter((po) => inScope(po.warehouseId, p.scope) && inRange(po.orderDate, range(p)) && poCategoryOk(po, idx, p.category))
    .sort((a, b) => b.orderDate.localeCompare(a.orderDate));
  const live = list.filter((po) => po.status !== "cancelled");
  const open = list.filter((po) => po.status === "approved" || po.status === "partially_received");
  const bySupplier = new Map<string, number>();
  for (const po of live) {
    const name = idx.suppliers.get(po.supplierId)?.name ?? "—";
    bySupplier.set(name, (bySupplier.get(name) ?? 0) + poTotal(po));
  }
  const rows: ReportCell[][] = list.map((po) => {
    const ordered = po.lines.reduce((s, l) => s + l.quantity, 0);
    const received = po.lines.reduce((s, l) => s + l.receivedQty, 0);
    return [
      po.number,
      idx.suppliers.get(po.supplierId)?.name ?? "—",
      idx.warehouses.get(po.warehouseId)?.code ?? "—",
      po.orderDate,
      po.expectedDate,
      po.status,
      po.lines.length,
      poTotal(po),
      ordered > 0 ? (received / ordered) * 100 : 0,
    ];
  });
  return {
    kind: p.report,
    title: meta(p.report).label,
    description: "Purchase orders raised in the selected period.",
    kpis: [
      { id: "count", label: "Purchase orders", value: list.length, format: "number", tone: "primary" },
      { id: "value", label: "Total value (excl. cancelled)", value: live.reduce((s, po) => s + poTotal(po), 0), format: "money", tone: "teal" },
      { id: "open", label: "Open (awaiting delivery)", value: open.length, format: "number", tone: "info" },
      { id: "overdue", label: "Overdue deliveries", value: open.filter((po) => isOverdue(po, now)).length, format: "number", tone: open.some((po) => isOverdue(po, now)) ? "danger" : "success" },
    ],
    chart: {
      kind: "hbar",
      title: "Order value by supplier",
      seriesName: "Value",
      data: top([...bySupplier.entries()].sort((a, b) => b[1] - a[1]).map(([name, value]) => ({ name, value: Math.round(value) })), 8),
      valueFormat: "money",
    },
    columns: [
      { id: "number", header: "PO number", format: "text" },
      { id: "supplier", header: "Supplier", format: "text" },
      { id: "warehouse", header: "Warehouse", format: "text" },
      { id: "orderDate", header: "Order date", format: "date" },
      { id: "expected", header: "Expected", format: "date" },
      { id: "status", header: "Status", format: "status" },
      { id: "lines", header: "Lines", format: "number" },
      { id: "value", header: "Value", format: "money" },
      { id: "received", header: "Received", format: "percent" },
    ],
    rows,
    notes: ["Received % = accepted units received ÷ units ordered.", p.category !== "all" ? `Only purchase orders containing ${p.category} products are listed (full order value shown).` : "All categories included."],
  };
}

/* ------------------------------------------------------------- sales orders */

const soCategoryOk = (o: SalesOrder, idx: ReturnType<typeof indexData>, category: string) =>
  category === "all" || o.lines.some((l) => idx.products.get(l.productId)?.category === category);

function salesOrders(data: WmsData, p: ReportParams): ReportResult {
  const idx = indexData(data);
  const scoped = data.orders.filter((o) => inScope(o.warehouseId, p.scope) && soCategoryOk(o, idx, p.category));
  const list = scoped.filter((o) => inRange(o.orderDate, range(p))).sort((a, b) => b.orderDate.localeCompare(a.orderDate));
  const trend = orderTrendFromOrders(scoped, range(p));
  const active = list.filter((o) => o.status !== "cancelled");
  const dispatched = list.filter((o) => o.status === "dispatched").length;
  const eligible = list.filter((o) => o.status !== "cancelled" && o.status !== "draft").length;
  return {
    kind: p.report,
    title: meta(p.report).label,
    description: "Customer orders raised in the selected period.",
    kpis: [
      { id: "count", label: "Orders", value: list.length, format: "number", tone: "primary" },
      { id: "revenue", label: "Order value (excl. cancelled)", value: active.reduce((s, o) => s + orderTotal(o), 0), format: "money", tone: "teal" },
      { id: "dispatched", label: "Dispatched", value: dispatched, format: "number", tone: "success" },
      { id: "rate", label: "Fulfilment rate", value: eligible > 0 ? (dispatched / eligible) * 100 : 0, format: "percent", tone: "info", hint: "dispatched ÷ confirmed+ orders" },
    ],
    chart: {
      kind: "line",
      title: `Orders created vs dispatched per ${trend.unit}`,
      xKey: "label",
      series: [
        { key: "created", name: "Orders created", color: "var(--chart-1)" },
        { key: "dispatched", name: "Orders dispatched", color: "var(--chart-2)" },
      ],
      data: trend.points.map((pt) => ({ label: pt.label, created: pt.created, dispatched: pt.dispatched })),
      valueFormat: "number",
    },
    columns: [
      { id: "number", header: "Order", format: "text" },
      { id: "customer", header: "Customer", format: "text" },
      { id: "warehouse", header: "Warehouse", format: "text" },
      { id: "orderDate", header: "Order date", format: "date" },
      { id: "required", header: "Required", format: "date" },
      { id: "priority", header: "Priority", format: "status" },
      { id: "status", header: "Status", format: "status" },
      { id: "lines", header: "Lines", format: "number" },
      { id: "value", header: "Value", format: "money" },
      { id: "dispatchedAt", header: "Dispatched", format: "date" },
    ],
    rows: list.map((o) => [
      o.number,
      idx.customers.get(o.customerId)?.name ?? "—",
      idx.warehouses.get(o.warehouseId)?.code ?? "—",
      o.orderDate,
      o.requiredDate,
      o.priority,
      o.status,
      o.lines.length,
      orderTotal(o),
      orderDispatchedAt(o),
    ]),
    notes: ["Order date = when the order was created; dispatched = date of the dispatch event.", "Dispatches in the chart may belong to orders created before the period."],
  };
}

/* ------------------------------------------------------ warehouse performance */

export interface WarehousePerfRow {
  warehouseId: ID;
  name: string;
  code: string;
  fulfilled: number;
  cycleDays: number | null;
  picks: number;
  receipts: number;
  utilization: number;
  accuracy: number;
}

export function warehousePerformanceRows(data: WmsData, scope: WarehouseScope, from: string, to: string): WarehousePerfRow[] {
  const r = { from, to };
  return data.warehouses
    .filter((w) => w.status === "active" && inScope(w.id, scope))
    .map((w) => {
      const dispatched = data.orders.filter((o) => o.warehouseId === w.id && inRange(orderDispatchedAt(o), r));
      const cycles = dispatched
        .map((o) => {
          const c = orderConfirmedAt(o);
          const d = orderDispatchedAt(o);
          return c && d ? (new Date(d).getTime() - new Date(c).getTime()) / 86_400_000 : null;
        })
        .filter((v): v is number => v !== null && v >= 0);
      const moves = activityMovements(data, { scope: w.id, range: r });
      const moved = moves.reduce((s, m) => s + Math.abs(m.onHandDelta), 0);
      const corrected = moves.filter((m) => m.type === "adjustment_in" || m.type === "adjustment_out").reduce((s, m) => s + Math.abs(m.onHandDelta), 0);
      return {
        warehouseId: w.id,
        name: w.name,
        code: w.code,
        fulfilled: dispatched.length,
        cycleDays: cycles.length ? cycles.reduce((s, v) => s + v, 0) / cycles.length : null,
        picks: data.tasks.filter((t) => t.warehouseId === w.id && t.type === "picking" && t.status === "completed" && inRange(t.completedAt, r)).length,
        receipts: data.receipts.filter((g) => g.warehouseId === w.id && inRange(g.receivedAt, r)).length,
        utilization: utilization(data, w.id),
        accuracy: moved > 0 ? Math.max(0, 100 - (corrected / moved) * 100) : 100,
      };
    });
}

function warehousePerformance(data: WmsData, p: ReportParams): ReportResult {
  const list = warehousePerformanceRows(data, p.scope, p.from, p.to);
  const sum = (f: (r: WarehousePerfRow) => number) => list.reduce((s, r) => s + f(r), 0);
  const cycleRows = list.filter((r) => r.cycleDays !== null);
  const avgCycle = cycleRows.length ? cycleRows.reduce((s, r) => s + (r.cycleDays as number) * r.fulfilled, 0) / Math.max(1, cycleRows.reduce((s, r) => s + r.fulfilled, 0)) : 0;
  const avgUtil = list.length ? sum((r) => r.utilization) / list.length : 0;
  return {
    kind: p.report,
    title: meta(p.report).label,
    description: "Throughput and efficiency per warehouse in the selected period. The category filter does not apply.",
    kpis: [
      { id: "fulfilled", label: "Orders fulfilled", value: sum((r) => r.fulfilled), format: "number", tone: "success" },
      { id: "cycle", label: "Avg order cycle time", value: avgCycle, format: "days", tone: "info", hint: "confirm → dispatch" },
      { id: "picks", label: "Pick tasks completed", value: sum((r) => r.picks), format: "number", tone: "primary" },
      { id: "receipts", label: "Receipts processed", value: sum((r) => r.receipts), format: "number", tone: "teal" },
    ],
    chart: {
      kind: "bars",
      title: "Throughput by warehouse",
      xKey: "warehouse",
      series: [
        { key: "fulfilled", name: "Orders fulfilled", color: "var(--chart-1)" },
        { key: "picks", name: "Pick tasks", color: "var(--chart-2)" },
        { key: "receipts", name: "Receipts", color: "var(--chart-3)" },
      ],
      data: list.map((r) => ({ warehouse: r.code, fulfilled: r.fulfilled, picks: r.picks, receipts: r.receipts })),
      valueFormat: "number",
    },
    columns: [
      { id: "warehouse", header: "Warehouse", format: "text" },
      { id: "fulfilled", header: "Orders fulfilled", format: "number" },
      { id: "cycle", header: "Avg cycle time", format: "days" },
      { id: "picks", header: "Pick tasks completed", format: "number" },
      { id: "receipts", header: "Receipts processed", format: "number" },
      { id: "utilization", header: "Utilization", format: "percent" },
      { id: "accuracy", header: "Stock accuracy", format: "percent" },
    ],
    rows: list.map((r) => [`${r.name} (${r.code})`, r.fulfilled, r.cycleDays, r.picks, r.receipts, r.utilization, r.accuracy]),
    notes: [
      `Average utilization across the selected warehouses: ${Math.round(avgUtil)}%.`,
      "Cycle time = days from the order's Confirmed event to its Dispatched event.",
      "Stock accuracy is a proxy: 100% − (units changed by manual adjustments ÷ all units moved) in the period.",
    ],
  };
}
