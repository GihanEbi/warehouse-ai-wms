import type { AppSettings, ID, Priority, Product, Supplier, WmsData } from "@/types";
import { indexData, lowStockProducts, overstockedProducts, type StockStatus, type StockSummary } from "@/lib/inventory/selectors";
import { createFormatter } from "@/lib/format";
import type { Recommendation } from "./types";
import {
  PRIORITY_RANK,
  compareText,
  daysBetween,
  incomingByProduct,
  inScope,
  inventoryHref,
  isDelayedOrder,
  isOverduePO,
  isPendingOrder,
  productHref,
  reorderHref,
  reorderWarehouse,
  suggestReorderQty,
  toDate,
} from "./helpers";

export type RecommendationSettings = Pick<AppSettings, "lowStockThresholdFactor"> &
  Partial<Pick<AppSettings, "currency" | "dateFormat" | "timezone">>;

const MAX_OVERSTOCK = 3;

export interface ReorderCandidate {
  product: Product;
  summary: StockSummary;
  status: StockStatus;
  /** units still expected on approved / partially received POs */
  incoming: number;
  qty: number;
  warehouseId: ID;
  supplier: Supplier | undefined;
  cost: number;
  priority: Priority;
  /** pre-filled DRAFT purchase-order form */
  href: string;
}

/**
 * Low / out-of-stock products that still need ordering (incoming PO stock is taken into account),
 * in the same order as `lowStockProducts`.
 */
export function reorderCandidates(
  data: WmsData,
  settings: Pick<AppSettings, "lowStockThresholdFactor">,
  scope: ID | "all",
): ReorderCandidate[] {
  const idx = indexData(data);
  const factor = settings.lowStockThresholdFactor;
  const incoming = incomingByProduct(data, scope);
  const out: ReorderCandidate[] = [];
  for (const { product, summary, status } of lowStockProducts(data, scope, factor)) {
    const inc = incoming.get(product.id) ?? 0;
    const threshold = Math.round(product.reorderLevel * factor);
    if (summary.available + inc > threshold) continue; // incoming stock already resolves the shortage
    const qty = suggestReorderQty(product.reorderLevel, summary.available, inc);
    const warehouseId = reorderWarehouse(data, product, scope);
    const supplier = product.preferredSupplierId ? idx.suppliers.get(product.preferredSupplierId) : undefined;
    out.push({
      product,
      summary,
      status,
      incoming: inc,
      qty,
      warehouseId,
      supplier,
      cost: qty * product.unitCost,
      priority: status === "out_of_stock" ? "urgent" : summary.available <= threshold * 0.5 ? "high" : "normal",
      href: reorderHref({ productId: product.id, supplierId: product.preferredSupplierId, warehouseId, qty }),
    });
  }
  return out;
}

/**
 * Deterministic recommendations derived from the current data. Callers filter dismissed ids.
 * The AI only proposes: every action is a link to an existing page (or a pre-filled DRAFT form).
 */
export function generateRecommendations(
  data: WmsData,
  settings: RecommendationSettings,
  scope: ID | "all",
  now: Date = new Date(),
): Recommendation[] {
  const idx = indexData(data);
  const fmt = createFormatter({
    currency: settings.currency ?? "LKR",
    dateFormat: settings.dateFormat ?? "dd MMM yyyy",
    timezone: settings.timezone ?? "Asia/Colombo",
  });
  const recs: Recommendation[] = [];

  /* ---- reorder / out of stock (skip products already covered by incoming POs) ---- */
  for (const c of reorderCandidates(data, settings, scope)) {
    const { product, summary, incoming: inc, qty, supplier, cost } = c;
    const out = c.status === "out_of_stock";
    const supplierText = supplier ? `from ${supplier.name}` : "(no preferred supplier set)";
    const incomingText = inc > 0 ? ` ${inc} more are already on approved purchase orders, which is not enough.` : "";
    recs.push({
      id: `${out ? "out_of_stock" : "reorder"}:${product.id}:${scope}`,
      kind: out ? "out_of_stock" : "reorder",
      title: out ? `${product.name} is out of stock` : `Reorder ${product.name}`,
      explanation: `${out ? "Nothing is available to pick" : `Only ${summary.available} available`} against a reorder level of ${product.reorderLevel}.${incomingText} Suggested order: ${qty} ${product.uom} ${supplierText}, about ${fmt.money(cost)}.`,
      priority: c.priority,
      related: { type: "product", id: product.id, label: product.name },
      action: { label: "Review draft purchase order", href: c.href },
      secondary: { label: "Open product", href: productHref(product.id) },
    });
  }

  /* ---- overstock (top few, informational) ---- */
  for (const { product, summary } of overstockedProducts(data, scope).slice(0, MAX_OVERSTOCK)) {
    const multiple = (summary.available / product.reorderLevel).toFixed(1);
    recs.push({
      id: `overstock:${product.id}:${scope}`,
      kind: "overstock",
      title: `${product.name} is overstocked`,
      explanation: `${summary.available} ${product.uom} available, ${multiple}x the reorder level of ${product.reorderLevel}. Consider pausing purchases or transferring stock to a warehouse that needs it.`,
      priority: "low",
      related: { type: "product", id: product.id, label: product.name },
      action: { label: "Review stock", href: inventoryHref(product.id, scope) },
      secondary: { label: "Open product", href: productHref(product.id) },
    });
  }

  /* ---- sales orders: delayed first, then other high-priority ones ---- */
  for (const o of data.orders) {
    if (!inScope(o.warehouseId, scope) || !isPendingOrder(o)) continue;
    const customer = idx.customers.get(o.customerId)?.name ?? "the customer";
    const delayed = isDelayedOrder(o, now);
    const urgent = o.priority === "urgent" || o.priority === "high";
    if (!delayed && !(urgent && o.status !== "draft")) continue;
    const required = toDate(o.requiredDate);
    const lateDays = required ? daysBetween(required, now) : 0;
    const secondary =
      o.status === "confirmed" || o.status === "picking"
        ? { label: "Open picking", href: `/picking-packing?order=${o.id}` }
        : o.status === "picked"
          ? { label: "Pack order", href: `/picking-packing/pack/${o.id}` }
          : undefined;
    if (delayed) {
      recs.push({
        id: `delayed_order:${o.id}`,
        kind: "delayed_order",
        title: `${o.number} is past its required date`,
        explanation: `Order for ${customer} was required on ${fmt.date(o.requiredDate)}${lateDays >= 1 ? ` (${lateDays} day${lateDays === 1 ? "" : "s"} ago)` : ""} and is still ${o.status}. Priority: ${o.priority}.`,
        priority: o.priority === "urgent" ? "urgent" : "high",
        related: { type: "order", id: o.id, label: o.number },
        action: { label: "Open order", href: `/orders/${o.id}` },
        ...(secondary ? { secondary } : {}),
      });
    } else {
      recs.push({
        id: `priority_order:${o.id}`,
        kind: "priority_order",
        title: `${o.number} is a ${o.priority}-priority order`,
        explanation: `Order for ${customer} is ${o.status} and due ${fmt.date(o.requiredDate)}. Handle it ahead of normal-priority orders.`,
        priority: o.priority,
        related: { type: "order", id: o.id, label: o.number },
        action: { label: "Open order", href: `/orders/${o.id}` },
        ...(secondary ? { secondary } : {}),
      });
    }
  }

  /* ---- goods waiting for putaway ---- */
  for (const r of data.receipts) {
    if (r.status !== "awaiting_putaway" || !inScope(r.warehouseId, scope)) continue;
    const units = r.lines.reduce((s, l) => s + l.receivedQty, 0);
    const waiting = daysBetween(toDate(r.receivedAt) ?? now, now);
    recs.push({
      id: `pending_putaway:${r.id}`,
      kind: "pending_putaway",
      title: `${r.grn} is waiting for putaway`,
      explanation: `${units} units received${waiting >= 1 ? ` ${waiting} day${waiting === 1 ? "" : "s"} ago` : " today"} are still in the staging area and cannot be picked until they are put away.`,
      priority: waiting >= 2 ? "high" : "normal",
      related: { type: "receipt", id: r.id, label: r.grn },
      action: { label: "Open receipt", href: `/receiving/${r.id}` },
      secondary: { label: "View putaway tasks", href: "/tasks" },
    });
  }

  /* ---- overdue purchase orders ---- */
  for (const po of data.purchaseOrders) {
    if (!isOverduePO(po, now) || !inScope(po.warehouseId, scope)) continue;
    const supplier = idx.suppliers.get(po.supplierId);
    const late = daysBetween(toDate(po.expectedDate) ?? now, now);
    recs.push({
      id: `delayed_delivery:${po.id}`,
      kind: "delayed_delivery",
      title: `${po.number} delivery is overdue`,
      explanation: `${supplier?.name ?? "The supplier"} was expected on ${fmt.date(po.expectedDate)}${late >= 1 ? ` (${late} day${late === 1 ? "" : "s"} late)` : ""}. Follow up with them or plan for the stock gap.`,
      priority: late >= 14 ? "urgent" : "high",
      related: { type: "purchase_order", id: po.id, label: po.number },
      action: { label: "Open purchase order", href: `/purchase-orders/${po.id}` },
      ...(supplier ? { secondary: { label: "Open supplier", href: `/suppliers/${supplier.id}` } } : {}),
    });
  }

  return recs.sort(
    (a, b) =>
      PRIORITY_RANK[a.priority] - PRIORITY_RANK[b.priority] ||
      compareText(a.title.toLowerCase(), b.title.toLowerCase()) ||
      compareText(a.id, b.id),
  );
}
