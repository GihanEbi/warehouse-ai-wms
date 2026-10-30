import { format, parse, startOfDay } from "date-fns";
import type { Customer, OrderStatus, Product, SalesOrder } from "@/types";
import type { Step } from "@/components/shared/progress";
import { OPEN_ORDER_STATUSES } from "@/lib/workflows/orders";

export const PRIORITY_OPTIONS = [
  { value: "low", label: "Low" },
  { value: "normal", label: "Normal" },
  { value: "high", label: "High" },
  { value: "urgent", label: "Urgent" },
] as const;

export const ORDER_STATUS_OPTIONS: { value: OrderStatus; label: string }[] = [
  { value: "draft", label: "Draft" },
  { value: "confirmed", label: "Confirmed" },
  { value: "picking", label: "Picking" },
  { value: "picked", label: "Picked" },
  { value: "packed", label: "Packed" },
  { value: "dispatched", label: "Dispatched" },
  { value: "cancelled", label: "Cancelled" },
];

export const FULFILMENT_STEPS: Step[] = [
  { key: "confirmed", label: "Confirmed" },
  { key: "picking", label: "Picking" },
  { key: "picked", label: "Picked" },
  { key: "packed", label: "Packed" },
  { key: "dispatched", label: "Dispatched" },
];

/** Active step index for the fulfilment progress indicator (steps before it are complete). */
export function fulfilmentIndex(status: OrderStatus): number {
  switch (status) {
    case "draft":
      return 0;
    case "confirmed":
    case "picking":
      return 1;
    case "picked":
      return 3;
    case "packed":
      return 4;
    case "dispatched":
      return 5;
    default:
      return 0;
  }
}

/** Open (in-flight) order whose required date is before today. */
export function isOverdue(o: Pick<SalesOrder, "status" | "requiredDate">): boolean {
  if (!(OPEN_ORDER_STATUSES as readonly string[]).includes(o.status)) return false;
  return new Date(o.requiredDate).getTime() < startOfDay(new Date()).getTime();
}

export function orderQty(o: Pick<SalesOrder, "lines">): number {
  return o.lines.reduce((s, l) => s + l.quantity, 0);
}

export function pickedQty(o: Pick<SalesOrder, "lines">): number {
  return o.lines.reduce((s, l) => s + l.allocations.reduce((a, x) => a + x.pickedQty, 0), 0);
}

export function reservedQty(o: Pick<SalesOrder, "lines">): number {
  return o.lines.reduce((s, l) => s + l.allocations.reduce((a, x) => a + x.quantity, 0), 0);
}

/** yyyy-MM-dd for <input type="date"> from an ISO timestamp (local day). */
export function toDateInput(iso: string | Date): string {
  return format(typeof iso === "string" ? new Date(iso) : iso, "yyyy-MM-dd");
}

/** ISO timestamp (local noon, to be safe across timezones) from a yyyy-MM-dd value. */
export function fromDateInput(v: string): string {
  return parse(`${v} 12:00`, "yyyy-MM-dd HH:mm", new Date()).toISOString();
}

export function defaultUnitPrice(p: Pick<Product, "sellingPrice" | "unitCost">): number {
  return p.sellingPrice ?? Math.round(p.unitCost * 1.3);
}

export function customerAddress(c: Pick<Customer, "address" | "city"> | undefined): string {
  if (!c) return "—";
  return [c.address, c.city].filter(Boolean).join(", ") || "—";
}
