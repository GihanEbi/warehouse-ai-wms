import { endOfDay, isValid, parseISO } from "date-fns";
import type { ID, Priority, Product, PurchaseOrder, SalesOrder, WmsData } from "@/types";
import { productStock } from "@/lib/inventory/selectors";
import { poOutstanding } from "@/lib/workflows/purchasing";

/** Order statuses that still need warehouse work (draft included: not yet released). */
export const PENDING_ORDER_STATUSES: SalesOrder["status"][] = ["draft", "confirmed", "picking", "picked", "packed"];
/** Purchase orders that are still expected to deliver stock. */
export const OPEN_PO_STATUSES: PurchaseOrder["status"][] = ["approved", "partially_received"];

export const PRIORITY_RANK: Record<Priority, number> = { urgent: 0, high: 1, normal: 2, low: 3 };

export const compareText = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0);

export function toDate(value: string | null | undefined): Date | null {
  if (!value) return null;
  const d = parseISO(value);
  return isValid(d) ? d : null;
}

/** A date counts as "passed" once its calendar day is over. */
export function dayPassed(value: string, now: Date): boolean {
  const d = toDate(value);
  return !!d && endOfDay(d).getTime() < now.getTime();
}

export const daysBetween = (from: Date, to: Date) => Math.max(0, Math.floor((to.getTime() - from.getTime()) / 86_400_000));

export const isPendingOrder = (o: SalesOrder) => PENDING_ORDER_STATUSES.includes(o.status);
export const isDelayedOrder = (o: SalesOrder, now: Date) => isPendingOrder(o) && dayPassed(o.requiredDate, now);
export const isOpenPO = (po: PurchaseOrder) => OPEN_PO_STATUSES.includes(po.status);
export const isOverduePO = (po: PurchaseOrder, now: Date) => isOpenPO(po) && dayPassed(po.expectedDate, now);

export const inScope = (warehouseId: ID, scope: ID | "all") => scope === "all" || warehouseId === scope;

/** Units still expected on approved / partially received POs (optionally one product / warehouse). */
export function incomingPoQty(data: WmsData, scope: ID | "all", productId?: ID): number {
  let total = 0;
  for (const po of data.purchaseOrders) {
    if (!isOpenPO(po) || !inScope(po.warehouseId, scope)) continue;
    for (const l of po.lines) if (!productId || l.productId === productId) total += poOutstanding(l);
  }
  return total;
}

export function incomingByProduct(data: WmsData, scope: ID | "all"): Map<ID, number> {
  const m = new Map<ID, number>();
  for (const po of data.purchaseOrders) {
    if (!isOpenPO(po) || !inScope(po.warehouseId, scope)) continue;
    for (const l of po.lines) m.set(l.productId, (m.get(l.productId) ?? 0) + poOutstanding(l));
  }
  return m;
}

/** suggested = max(reorderLevel x 3 - available - incoming, 10), rounded up to a tidy multiple. */
export function suggestReorderQty(reorderLevel: number, available: number, incoming: number): number {
  const raw = Math.max(reorderLevel * 3 - available - incoming, 10);
  const step = raw >= 100 ? 10 : 5;
  return Math.ceil(raw / step) * step;
}

/** The warehouse a reorder should land in: the scope, else where the product is thinnest. */
export function reorderWarehouse(data: WmsData, product: Product, scope: ID | "all"): ID {
  if (scope !== "all") return scope;
  let best: { id: ID; available: number } | null = null;
  for (const w of data.warehouses) {
    if (w.status !== "active") continue;
    const available = productStock(data, product.id, w.id).available;
    if (!best || available < best.available) best = { id: w.id, available };
  }
  return best?.id ?? data.warehouses[0]?.id ?? "";
}

/** Link to the PRE-FILLED DRAFT purchase-order form (the user reviews and saves it). */
export function reorderHref(p: { productId: ID; supplierId: ID | null; warehouseId: ID; qty: number }): string {
  const q = new URLSearchParams();
  q.set("product", p.productId);
  if (p.supplierId) q.set("supplier", p.supplierId);
  if (p.warehouseId) q.set("warehouse", p.warehouseId);
  q.set("qty", String(p.qty));
  return `/purchase-orders/new?${q.toString()}`;
}

export const productHref = (id: ID) => `/products/${id}`;

export function inventoryHref(productId?: ID, warehouseId?: ID | "all"): string {
  const q = new URLSearchParams();
  if (productId) q.set("product", productId);
  if (warehouseId && warehouseId !== "all") q.set("warehouse", warehouseId);
  const s = q.toString();
  return s ? `/inventory?${s}` : "/inventory";
}

export function scopeLabel(data: WmsData, scope: ID | "all"): string {
  if (scope === "all") return "all warehouses";
  const w = data.warehouses.find((x) => x.id === scope);
  return w ? w.name : "the selected warehouse";
}

export const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;
