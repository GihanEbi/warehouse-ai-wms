/**
 * Pure calculation helpers shared by the dashboard, the reports module and tests.
 * Every function is a function of `(data, scope, range, ...)` - no React, no store access.
 *
 * Definitions (documented once, used everywhere):
 *  - Stock IN  : movements with onHandDelta > 0 (receipt, transfer_in, return_receipt, adjustment_in)
 *  - Stock OUT : movements with onHandDelta < 0 (dispatch, transfer_out, adjustment_out, return_writeoff)
 *  - Opening-balance movements (source.kind === "opening") are history seeding, not activity: excluded.
 *  - putaway / bin_transfer / return_restock / block / unblock have onHandDelta 0 and therefore never count.
 *  - Order "created" = SalesOrder.orderDate; "dispatched" = timestamp of the order's last "Dispatched" event.
 *  - Pending orders = draft | confirmed | picking | picked | packed.
 *  - Incoming deliveries = purchase orders approved | partially_received (overdue = expectedDate before today).
 */
import {
  eachDayOfInterval,
  eachWeekOfInterval,
  endOfDay,
  format,
  isSameDay,
  startOfDay,
  startOfWeek,
} from "date-fns";
import type { ID, OrderStatus, PurchaseOrder, SalesOrder, StockMovement, WmsData } from "@/types";
import {
  indexData,
  inventoryValue,
  lowStockProducts,
  utilization,
  warehouseCapacity,
  warehouseStock,
  type WarehouseScope,
} from "@/lib/inventory/selectors";
import { poOutstanding } from "@/lib/workflows/purchasing";

export interface RangeLike {
  from: string;
  to: string;
}

export const PENDING_ORDER_STATUSES: OrderStatus[] = ["draft", "confirmed", "picking", "picked", "packed"];

/* ----------------------------------------------------------------- helpers */

export const inRange = (iso: string | null | undefined, range: RangeLike): boolean => {
  if (!iso) return false;
  const t = new Date(iso).getTime();
  return t >= new Date(range.from).getTime() && t <= new Date(range.to).getTime();
};

export const inScope = (warehouseId: ID, scope: WarehouseScope) => scope === "all" || warehouseId === scope;

/** Timestamp of the order's dispatch (last "Dispatched" event), or null if it was not dispatched. */
export function orderDispatchedAt(order: SalesOrder): string | null {
  if (order.status !== "dispatched") return null;
  for (let i = order.events.length - 1; i >= 0; i--) {
    if (order.events[i].title === "Dispatched") return order.events[i].at;
  }
  return null;
}

/** Timestamp of the order's confirmation (first "Confirmed" event). */
export function orderConfirmedAt(order: SalesOrder): string | null {
  return order.events.find((e) => e.title === "Confirmed")?.at ?? null;
}

export const isRealActivity = (m: StockMovement) => m.source?.kind !== "opening";

/* ---------------------------------------------------------------- buckets */

export interface Bucket {
  key: string;
  label: string;
  start: number;
  end: number;
}

/** Day buckets for ranges up to 31 days, otherwise ISO weeks (Mon-Sun). */
export function buildBuckets(range: RangeLike): { buckets: Bucket[]; unit: "day" | "week" } {
  const start = startOfDay(new Date(range.from));
  const end = new Date(range.to);
  const days = Math.max(1, Math.round((endOfDay(end).getTime() - start.getTime()) / 86_400_000));
  if (days <= 31) {
    const list = eachDayOfInterval({ start, end });
    return {
      unit: "day",
      buckets: list.map((d) => ({
        key: format(d, "yyyy-MM-dd"),
        label: format(d, "d MMM"),
        start: startOfDay(d).getTime(),
        end: endOfDay(d).getTime(),
      })),
    };
  }
  const weeks = eachWeekOfInterval({ start, end }, { weekStartsOn: 1 });
  return {
    unit: "week",
    buckets: weeks.map((w) => {
      const s = startOfWeek(w, { weekStartsOn: 1 });
      return {
        key: format(s, "yyyy-MM-dd"),
        label: format(s, "d MMM"),
        start: s.getTime(),
        end: s.getTime() + 7 * 86_400_000 - 1,
      };
    }),
  };
}

function bucketIndex(buckets: Bucket[], iso: string): number {
  const t = new Date(iso).getTime();
  return buckets.findIndex((b) => t >= b.start && t <= b.end);
}

/* ---------------------------------------------------------------- stock flow */

export interface FlowPoint {
  key: string;
  label: string;
  in: number;
  out: number;
}

export interface MovementFilter {
  scope: WarehouseScope;
  range: RangeLike;
  category?: string;
}

/** Movements that count as real stock activity for the given scope / range / category. */
export function activityMovements(data: WmsData, f: MovementFilter): StockMovement[] {
  const { products } = indexData(data);
  return data.movements.filter((m) => {
    if (!isRealActivity(m) || !inScope(m.warehouseId, f.scope) || !inRange(m.createdAt, f.range)) return false;
    if (f.category && f.category !== "all" && products.get(m.productId)?.category !== f.category) return false;
    return true;
  });
}

export function stockFlowSeries(data: WmsData, f: MovementFilter) {
  const { buckets, unit } = buildBuckets(f.range);
  const points: FlowPoint[] = buckets.map((b) => ({ key: b.key, label: b.label, in: 0, out: 0 }));
  let totalIn = 0;
  let totalOut = 0;
  for (const m of activityMovements(data, f)) {
    if (m.onHandDelta === 0) continue;
    const i = bucketIndex(buckets, m.createdAt);
    if (i < 0) continue;
    if (m.onHandDelta > 0) {
      points[i].in += m.onHandDelta;
      totalIn += m.onHandDelta;
    } else {
      points[i].out += -m.onHandDelta;
      totalOut += -m.onHandDelta;
    }
  }
  return { points, unit, totalIn, totalOut, net: totalIn - totalOut };
}

/* ------------------------------------------------------------ order trend */

export interface OrderTrendPoint {
  key: string;
  label: string;
  created: number;
  dispatched: number;
}

/** Orders created vs dispatched per bucket for an already filtered order list. */
export function orderTrendFromOrders(orders: SalesOrder[], range: RangeLike) {
  const { buckets, unit } = buildBuckets(range);
  const points: OrderTrendPoint[] = buckets.map((b) => ({ key: b.key, label: b.label, created: 0, dispatched: 0 }));
  let created = 0;
  let dispatched = 0;
  for (const o of orders) {
    if (inRange(o.orderDate, range)) {
      const i = bucketIndex(buckets, o.orderDate);
      if (i >= 0) {
        points[i].created += 1;
        created += 1;
      }
    }
    const at = orderDispatchedAt(o);
    if (at && inRange(at, range)) {
      const i = bucketIndex(buckets, at);
      if (i >= 0) {
        points[i].dispatched += 1;
        dispatched += 1;
      }
    }
  }
  return { points, unit, created, dispatched };
}

export function orderTrendSeries(data: WmsData, scope: WarehouseScope, range: RangeLike) {
  return orderTrendFromOrders(
    data.orders.filter((o) => inScope(o.warehouseId, scope)),
    range,
  );
}

/* ------------------------------------------------------------- categories */

export interface CategoryRow {
  category: string;
  units: number;
  value: number;
}

export function categoryBreakdown(data: WmsData, scope: WarehouseScope): CategoryRow[] {
  const { products } = indexData(data);
  const map = new Map<string, CategoryRow>();
  for (const r of data.stock) {
    if (!inScope(r.warehouseId, scope)) continue;
    const p = products.get(r.productId);
    if (!p) continue;
    const row = map.get(p.category) ?? { category: p.category, units: 0, value: 0 };
    row.units += r.onHand;
    row.value += r.onHand * p.unitCost;
    map.set(p.category, row);
  }
  return [...map.values()].filter((r) => r.units > 0).sort((a, b) => b.value - a.value);
}

/* ------------------------------------------------------------ utilization */

export interface UtilizationRow {
  warehouseId: ID;
  name: string;
  code: string;
  percent: number;
  used: number;
  capacity: number;
}

export function warehouseUtilizationRows(data: WmsData, scope: WarehouseScope = "all"): UtilizationRow[] {
  return data.warehouses
    .filter((w) => w.status === "active" && inScope(w.id, scope))
    .map((w) => {
      const c = warehouseCapacity(data, w.id);
      return { warehouseId: w.id, name: w.name, code: w.code, percent: c.utilization, used: c.used, capacity: c.capacity };
    });
}

/* ---------------------------------------------------------- order / PO sets */

export function pendingOrders(data: WmsData, scope: WarehouseScope): SalesOrder[] {
  return data.orders.filter((o) => PENDING_ORDER_STATUSES.includes(o.status) && inScope(o.warehouseId, scope));
}

export function pendingPurchaseOrders(data: WmsData, scope: WarehouseScope): PurchaseOrder[] {
  return data.purchaseOrders.filter(
    (p) => (p.status === "draft" || p.status === "approved" || p.status === "partially_received") && inScope(p.warehouseId, scope),
  );
}

export function incomingPurchaseOrders(data: WmsData, scope: WarehouseScope): PurchaseOrder[] {
  return data.purchaseOrders
    .filter((p) => (p.status === "approved" || p.status === "partially_received") && inScope(p.warehouseId, scope))
    .sort((a, b) => a.expectedDate.localeCompare(b.expectedDate));
}

export const isOverdue = (po: PurchaseOrder, now: Date) => new Date(po.expectedDate).getTime() < startOfDay(now).getTime();

export function dispatchedOn(data: WmsData, scope: WarehouseScope, day: Date): SalesOrder[] {
  return data.orders.filter((o) => {
    if (!inScope(o.warehouseId, scope)) return false;
    const at = orderDispatchedAt(o);
    return !!at && isSameDay(new Date(at), day);
  });
}

/* -------------------------------------------------------------------- KPIs */

export interface DashboardKpis {
  activeProducts: number;
  totalProducts: number;
  physicalQty: number;
  netChange: number;
  value: number;
  stagingQty: number;
  returnsQty: number;
  lowStock: number;
  outOfStock: number;
  pendingOrders: number;
  urgentOrders: number;
  incoming: number;
  overdueIncoming: number;
  incomingUnits: number;
  dispatchedToday: number;
  dispatchedYesterday: number;
  utilization: number;
  warehouses: number;
}

export function computeKpis(
  data: WmsData,
  scope: WarehouseScope,
  range: RangeLike,
  lowStockFactor: number,
  now: Date = new Date(),
): DashboardKpis {
  const stock = warehouseStock(data, scope);
  const stocked = new Set(data.stock.filter((r) => inScope(r.warehouseId, scope) && r.onHand > 0).map((r) => r.productId));
  const active = data.products.filter((p) => p.status === "active");
  const activeProducts = scope === "all" ? active.length : active.filter((p) => stocked.has(p.id)).length;
  const low = lowStockProducts(data, scope, lowStockFactor);
  const pending = pendingOrders(data, scope);
  const incoming = incomingPurchaseOrders(data, scope);
  const flow = stockFlowSeries(data, { scope, range });
  const yesterday = new Date(startOfDay(now).getTime() - 12 * 3_600_000);
  return {
    activeProducts,
    totalProducts: data.products.length,
    physicalQty: stock.physical,
    netChange: flow.net,
    value: inventoryValue(data, scope),
    stagingQty: stock.staging,
    returnsQty: stock.returns,
    lowStock: low.length,
    outOfStock: low.filter((l) => l.status === "out_of_stock").length,
    pendingOrders: pending.length,
    urgentOrders: pending.filter((o) => o.priority === "urgent" || o.priority === "high").length,
    incoming: incoming.length,
    overdueIncoming: incoming.filter((p) => isOverdue(p, now)).length,
    incomingUnits: incoming.reduce((s, p) => s + p.lines.reduce((a, l) => a + poOutstanding(l), 0), 0),
    dispatchedToday: dispatchedOn(data, scope, now).length,
    dispatchedYesterday: dispatchedOn(data, scope, yesterday).length,
    utilization: utilization(data, scope),
    warehouses: scope === "all" ? data.warehouses.filter((w) => w.status === "active").length : 1,
  };
}
