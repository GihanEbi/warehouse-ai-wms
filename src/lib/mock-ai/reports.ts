import { endOfDay, startOfDay } from "date-fns";
import type { AppSettings, ID, Warehouse, WmsData } from "@/types";
import {
  indexData,
  inventoryValue,
  lowStockProducts,
  overstockedProducts,
  productStock,
  utilization,
  warehouseStock,
} from "@/lib/inventory/selectors";
import { createFormatter } from "@/lib/format";
import { poTotal } from "@/lib/workflows/purchasing";
import { orderTotal } from "@/lib/workflows/orders";
import { inScope, isDelayedOrder, isOverduePO, plural, toDate } from "./helpers";
import type { ReportKind } from "./types";


export interface PerformanceRow {
  warehouse: Warehouse;
  orders: number;
  dispatched: number;
  receipts: number;
  tasks: number;
  utilization: number;
  units: number;
}

/** Per-warehouse activity in a period (shared by the report summary and the chat answer). */
export function performanceRows(data: WmsData, scope: ID | "all", from: Date, to: Date): PerformanceRow[] {
  const start = startOfDay(from).getTime();
  const end = endOfDay(to).getTime();
  const inPeriod = (iso: string) => {
    const t = toDate(iso)?.getTime();
    return t !== undefined && t >= start && t <= end;
  };
  return data.warehouses
    .filter((w) => inScope(w.id, scope))
    .map((w) => {
      const orders = data.orders.filter((o) => o.warehouseId === w.id && inPeriod(o.orderDate) && o.status !== "cancelled");
      return {
        warehouse: w,
        orders: orders.length,
        dispatched: orders.filter((o) => o.status === "dispatched").length,
        receipts: data.receipts.filter((r) => r.warehouseId === w.id && inPeriod(r.receivedAt)).length,
        tasks: data.tasks.filter((t) => t.warehouseId === w.id && t.completedAt && inPeriod(t.completedAt)).length,
        utilization: utilization(data, w.id),
        units: warehouseStock(data, w.id).onHand,
      };
    });
}

type Counter = Map<string, number>;
const bump = (m: Counter, k: string, by: number) => m.set(k, (m.get(k) ?? 0) + by);
const topOf = (m: Counter, n = 3) =>
  [...m.entries()].sort((a, b) => b[1] - a[1] || (a[0] < b[0] ? -1 : 1)).slice(0, n);

/**
 * Natural-language bullet points summarising a report period (shown in the "AI Summary" section of reports).
 * Everything is computed from live data; nothing is invented.
 */
export function summarizeReport(
  data: WmsData,
  opts: {
    report: ReportKind;
    scope: ID | "all";
    from: string;
    to: string;
    category?: string;
    /** optional display settings (currency / date format); defaults to LKR */
    settings?: Partial<Pick<AppSettings, "currency" | "dateFormat" | "timezone">>;
  },
  now: Date = new Date(),
): string[] {
  const idx = indexData(data);
  const fmt = createFormatter({
    currency: opts.settings?.currency ?? "LKR",
    dateFormat: opts.settings?.dateFormat ?? "dd MMM yyyy",
    timezone: opts.settings?.timezone ?? "Asia/Colombo",
  });
  const { scope } = opts;
  const fromD = toDate(opts.from);
  const toD = toDate(opts.to);
  const start = fromD ? startOfDay(fromD).getTime() : Number.NEGATIVE_INFINITY;
  const end = toD ? endOfDay(toD).getTime() : Number.POSITIVE_INFINITY;
  const category = opts.category && opts.category !== "all" ? opts.category : undefined;
  const inPeriod = (iso: string) => {
    const t = toDate(iso)?.getTime();
    return t !== undefined && t >= start && t <= end;
  };
  const inCategory = (productId: ID) => !category || idx.products.get(productId)?.category === category;
  const where = scope === "all" ? "across all warehouses" : `at ${idx.warehouses.get(scope)?.name ?? "the selected warehouse"}`;
  const catText = category ? ` in ${category}` : "";
  const periodText = fromD && toD ? `${fmt.date(fromD)} to ${fmt.date(toD)}` : "the selected period";
  const name = (id: ID) => idx.products.get(id)?.name ?? "Unknown product";

  switch (opts.report) {
    case "inventory-summary": {
      const products = data.products.filter((p) => p.status === "active" && (!category || p.category === category));
      let onHand = 0;
      let available = 0;
      let value = 0;
      const valueByProduct: Counter = new Map();
      for (const p of products) {
        const s = productStock(data, p.id, scope);
        onHand += s.onHand;
        available += s.available;
        const v = s.physical * p.unitCost;
        value += v;
        bump(valueByProduct, p.id, v);
      }
      const low = lowStockProducts(data, scope).filter((l) => inCategory(l.product.id));
      const out = low.filter((l) => l.status === "out_of_stock").length;
      const over = overstockedProducts(data, scope).filter((o) => inCategory(o.product.id));
      const bullets = [
        `${fmt.number(onHand)} units are on hand${catText} ${where}, of which ${fmt.number(available)} are available to pick. Stock is valued at ${fmt.money(category ? value : inventoryValue(data, scope))}.`,
        `${plural(low.length, "product")} ${low.length === 1 ? "is" : "are"} low on stock (${out} completely out), while ${plural(over.length, "product")} ${over.length === 1 ? "is" : "are"} overstocked.`,
      ];
      const top = topOf(valueByProduct, 3).filter(([, v]) => v > 0);
      if (top.length) bullets.push(`Highest-value lines: ${top.map(([id, v]) => `${name(id)} (${fmt.moneyCompact(v)})`).join(", ")}.`);
      bullets.push(`Storage utilization ${where} is ${utilization(data, scope)}%.`);
      if (scope === "all" && data.warehouses.length > 1) {
        const ranked = data.warehouses
          .map((w) => ({ w, units: warehouseStock(data, w.id).onHand }))
          .sort((a, b) => b.units - a.units);
        bullets.push(`${ranked[0].w.name} holds the most stock (${fmt.number(ranked[0].units)} units); ${ranked[ranked.length - 1].w.name} holds the least (${fmt.number(ranked[ranked.length - 1].units)}).`);
      }
      return bullets;
    }

    case "stock-movement": {
      const rows = data.movements.filter((m) => inScope(m.warehouseId, scope) && inPeriod(m.createdAt) && inCategory(m.productId));
      if (rows.length === 0) return [`No stock movements were recorded${catText} ${where} between ${periodText}.`];
      const unitsIn = rows.filter((m) => m.onHandDelta > 0).reduce((s, m) => s + m.onHandDelta, 0);
      const unitsOut = rows.filter((m) => m.onHandDelta < 0).reduce((s, m) => s - m.onHandDelta, 0);
      const byType: Counter = new Map();
      const dispatched: Counter = new Map();
      for (const m of rows) {
        bump(byType, m.type, 1);
        if (m.type === "dispatch") bump(dispatched, m.productId, m.quantity);
      }
      const bullets = [
        `${plural(rows.length, "stock movement")} ${where}${catText} between ${periodText}: ${fmt.number(unitsIn)} units in and ${fmt.number(unitsOut)} units out, a net ${unitsIn - unitsOut >= 0 ? "gain" : "reduction"} of ${fmt.number(Math.abs(unitsIn - unitsOut))} units.`,
        `Mix: ${byType.get("receipt") ?? 0} receipts, ${byType.get("dispatch") ?? 0} dispatches, ${(byType.get("adjustment_in") ?? 0) + (byType.get("adjustment_out") ?? 0)} adjustments, ${(byType.get("transfer_in") ?? 0) + (byType.get("transfer_out") ?? 0)} transfer movements.`,
      ];
      const top = topOf(dispatched, 3);
      if (top.length) bullets.push(`Top movers (units dispatched): ${top.map(([id, q]) => `${name(id)} (${fmt.number(q)})`).join(", ")}.`);
      const returns = rows.filter((m) => m.type === "return_receipt").reduce((s, m) => s + m.quantity, 0);
      const writeoffs = rows.filter((m) => m.type === "return_writeoff").reduce((s, m) => s + m.quantity, 0);
      if (returns || writeoffs) bullets.push(`${fmt.number(returns)} units came back as customer returns and ${fmt.number(writeoffs)} were written off.`);
      return bullets;
    }

    case "low-stock": {
      const low = lowStockProducts(data, scope).filter((l) => inCategory(l.product.id));
      if (low.length === 0) return [`No products${catText} are at or below their reorder level ${where}. Stock levels look healthy.`];
      const out = low.filter((l) => l.status === "out_of_stock");
      const critical = low.filter((l) => l.summary.available <= l.product.reorderLevel * 0.5);
      const bullets = [
        `${plural(low.length, "product")}${catText} ${low.length === 1 ? "is" : "are"} at or below the reorder level ${where}; ${out.length} ${out.length === 1 ? "is" : "are"} completely out of stock.`,
        `${critical.length} ${critical.length === 1 ? "is" : "are"} below half of the reorder level and should be treated as high priority.`,
        `Most critical: ${low.slice(0, 3).map((l) => `${l.product.name} (${l.summary.available} available / level ${l.product.reorderLevel})`).join(", ")}.`,
      ];
      const shortfall = low.reduce((s, l) => s + Math.max(0, l.product.reorderLevel - l.summary.available) * l.product.unitCost, 0);
      bullets.push(`Bringing every low item back up to its reorder level would cost roughly ${fmt.money(shortfall)} at current unit costs.`);
      return bullets;
    }

    case "purchase-orders": {
      const pos = data.purchaseOrders.filter(
        (p) => inScope(p.warehouseId, scope) && inPeriod(p.orderDate) && (!category || p.lines.some((l) => inCategory(l.productId))),
      );
      if (pos.length === 0) return [`No purchase orders were raised ${where} between ${periodText}.`];
      const live = pos.filter((p) => p.status !== "cancelled");
      const total = live.reduce((s, p) => s + poTotal(p), 0);
      const bySupplier: Counter = new Map();
      for (const p of live) bump(bySupplier, p.supplierId, poTotal(p));
      const byStatus: Counter = new Map();
      for (const p of pos) bump(byStatus, p.status, 1);
      const open = data.purchaseOrders.filter((p) => inScope(p.warehouseId, scope) && (p.status === "approved" || p.status === "partially_received"));
      const overdue = open.filter((p) => isOverduePO(p, now));
      const bullets = [
        `${plural(pos.length, "purchase order")} ${where} between ${periodText}, worth ${fmt.money(total)} excluding cancelled ones.`,
        `Status: ${["draft", "approved", "partially_received", "received", "cancelled"].map((s) => `${byStatus.get(s) ?? 0} ${s.replace("_", " ")}`).join(", ")}.`,
      ];
      const top = topOf(bySupplier, 1)[0];
      if (top) bullets.push(`Largest supplier by value: ${idx.suppliers.get(top[0])?.name ?? "Unknown"} (${fmt.money(top[1])}).`);
      bullets.push(
        overdue.length
          ? `${plural(overdue.length, "open purchase order")} ${overdue.length === 1 ? "is" : "are"} past the expected delivery date: ${overdue.slice(0, 3).map((p) => p.number).join(", ")}.`
          : `${plural(open.length, "open purchase order")} ${open.length === 1 ? "is" : "are"} awaiting delivery and none is overdue.`,
      );
      return bullets;
    }

    case "sales-orders": {
      const orders = data.orders.filter(
        (o) => inScope(o.warehouseId, scope) && inPeriod(o.orderDate) && (!category || o.lines.some((l) => inCategory(l.productId))),
      );
      if (orders.length === 0) return [`No sales orders were placed ${where} between ${periodText}.`];
      const live = orders.filter((o) => o.status !== "cancelled" && o.status !== "draft");
      const dispatched = live.filter((o) => o.status === "dispatched");
      const revenue = live.reduce((s, o) => s + orderTotal(o), 0);
      const rate = live.length ? Math.round((dispatched.length / live.length) * 100) : 0;
      const byCustomer: Counter = new Map();
      const byProduct: Counter = new Map();
      for (const o of live) {
        bump(byCustomer, o.customerId, orderTotal(o));
        for (const l of o.lines) bump(byProduct, l.productId, l.quantity);
      }
      const delayed = orders.filter((o) => isDelayedOrder(o, now));
      const bullets = [
        `${plural(orders.length, "sales order")} ${where} between ${periodText}; ${live.length} active orders worth ${fmt.money(revenue)}.`,
        `Fulfilment rate is ${rate}%: ${dispatched.length} of ${live.length} active orders have been dispatched.`,
      ];
      const cust = topOf(byCustomer, 1)[0];
      if (cust) bullets.push(`Top customer: ${idx.customers.get(cust[0])?.name ?? "Unknown"} (${fmt.money(cust[1])}).`);
      const prod = topOf(byProduct, 3);
      if (prod.length) bullets.push(`Best sellers by units: ${prod.map(([id, q]) => `${name(id)} (${fmt.number(q)})`).join(", ")}.`);
      bullets.push(delayed.length ? `${plural(delayed.length, "order")} ${delayed.length === 1 ? "is" : "are"} past the required date and not yet dispatched.` : "No order is past its required date.");
      return bullets;
    }

    case "warehouse-performance": {
      const rows = performanceRows(data, scope, new Date(start), new Date(end)).map((r) => ({
        w: r.warehouse,
        orders: r.orders,
        dispatched: r.dispatched,
        receipts: r.receipts,
        tasks: r.tasks,
        util: r.utilization,
        units: r.units,
      }));
      if (rows.every((r) => r.orders + r.receipts + r.tasks === 0)) return [`No warehouse activity was recorded ${where} between ${periodText}.`];
      const bullets = rows.map(
        (r) => `${r.w.name}: ${r.dispatched}/${r.orders} orders dispatched, ${plural(r.receipts, "goods receipt")}, ${plural(r.tasks, "task")} completed, ${r.util}% utilization (${fmt.number(r.units)} units).`,
      );
      if (rows.length > 1) {
        const best = [...rows].sort((a, b) => b.tasks - a.tasks || (a.w.name < b.w.name ? -1 : 1))[0];
        const busiest = [...rows].sort((a, b) => b.dispatched - a.dispatched || (a.w.name < b.w.name ? -1 : 1))[0];
        bullets.push(
          best.w.id === busiest.w.id
            ? `${best.w.name} leads on both completed tasks (${best.tasks}) and dispatched orders (${busiest.dispatched}).`
            : `${best.w.name} completed the most tasks (${best.tasks}); ${busiest.w.name} dispatched the most orders (${busiest.dispatched}).`,
        );
      }
      return bullets.slice(0, 6);
    }
  }
}
