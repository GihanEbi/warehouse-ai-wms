import type { AppSettings, ID, WmsData } from "@/types";
import { computeKpis } from "@/features/dashboard/metrics";
import { createFormatter } from "@/lib/format";
import { inScope, isPendingOrder, isDelayedOrder } from "./helpers";

export interface KpiExplanation {
  key: string;
  label: string;
  value: string;
  explanation: string;
  href: string;
}

export type KpiSettings = Pick<AppSettings, "lowStockThresholdFactor"> &
  Partial<Pick<AppSettings, "currency" | "dateFormat" | "timezone">>;

/**
 * The 8 dashboard KPIs with their current value and a plain-language explanation.
 * Values come straight from the dashboard's own `computeKpis`, so the assistant can never
 * disagree with the numbers shown on /dashboard.
 */
export function explainKpis(
  data: WmsData,
  scope: ID | "all",
  settings: KpiSettings = { lowStockThresholdFactor: 1 },
  now: Date = new Date(),
): KpiExplanation[] {
  const fmt = createFormatter({
    currency: settings.currency ?? "LKR",
    dateFormat: settings.dateFormat ?? "dd MMM yyyy",
    timezone: settings.timezone ?? "Asia/Colombo",
  });
  const range = { from: new Date(now.getTime() - 29 * 86_400_000).toISOString(), to: now.toISOString() };
  const k = computeKpis(data, scope, range, settings.lowStockThresholdFactor, now);
  const delayed = data.orders.filter((o) => inScope(o.warehouseId, scope) && isPendingOrder(o) && isDelayedOrder(o, now)).length;

  return [
    {
      key: "products",
      label: "Total Products",
      value: fmt.number(k.activeProducts),
      explanation: "Active products in the catalogue (in a single warehouse: those stocked there). Archived and inactive items are not counted.",
      href: "/products",
    },
    {
      key: "quantity",
      label: "Total Inventory Quantity",
      value: fmt.number(k.physicalQty),
      explanation: `Every physical unit in the warehouse, including ${fmt.number(k.stagingQty)} in staging awaiting putaway and ${fmt.number(k.returnsQty)} in returns. Only storage-bin stock net of reservations is available to pick.`,
      href: "/inventory",
    },
    {
      key: "value",
      label: "Inventory Value",
      value: fmt.money(k.value),
      explanation: "Every physical unit (storage, staging and returns bins) multiplied by its unit cost.",
      href: "/inventory",
    },
    {
      key: "low-stock",
      label: "Low Stock Products",
      value: fmt.number(k.lowStock),
      explanation: `Products whose available quantity is at or below their reorder level (${k.outOfStock} of them are completely out of stock). These are the candidates for reordering.`,
      href: "/inventory?status=attention",
    },
    {
      key: "pending-orders",
      label: "Pending Orders",
      value: fmt.number(k.pendingOrders),
      explanation: `Sales orders not yet dispatched (draft, confirmed, picking, picked or packed). ${k.urgentOrders} are high or urgent priority and ${delayed} are past their required date.`,
      href: "/orders",
    },
    {
      key: "incoming",
      label: "Incoming Deliveries",
      value: fmt.number(k.incoming),
      explanation: `Approved or partially received purchase orders still waiting for stock (${fmt.number(k.incomingUnits)} units outstanding). ${k.overdueIncoming} are past their expected delivery date.`,
      href: "/purchase-orders",
    },
    {
      key: "dispatched-today",
      label: "Orders Dispatched Today",
      value: fmt.number(k.dispatchedToday),
      explanation: `Customer orders whose shipment was confirmed today (${fmt.number(k.dispatchedYesterday)} yesterday). Dispatch is when physical stock is reduced.`,
      href: "/shipping",
    },
    {
      key: "utilization",
      label: "Warehouse Utilization",
      value: `${k.utilization}%`,
      explanation: "Units held in storage bins as a share of total storage-bin capacity. Very high values mean limited room for new receipts.",
      href: "/warehouses",
    },
  ];
}
