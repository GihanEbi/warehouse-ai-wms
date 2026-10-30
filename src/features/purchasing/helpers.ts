import type { PurchaseOrder, PurchaseOrderStatus } from "@/types";
import { poOutstanding } from "@/lib/workflows/purchasing";

export const PO_STATUS_OPTIONS: { value: PurchaseOrderStatus; label: string }[] = [
  { value: "draft", label: "Draft" },
  { value: "approved", label: "Approved" },
  { value: "partially_received", label: "Partially Received" },
  { value: "received", label: "Received" },
  { value: "cancelled", label: "Cancelled" },
];

/** POs that goods can still be received against. */
export const isReceivable = (po: Pick<PurchaseOrder, "status">) =>
  po.status === "approved" || po.status === "partially_received";

/** Open PO whose expected delivery date has passed. */
export function isPoOverdue(po: Pick<PurchaseOrder, "status" | "expectedDate">, now = Date.now()) {
  return isReceivable(po) && new Date(po.expectedDate).getTime() < now - 24 * 3600 * 1000;
}

export const poOutstandingQty = (po: Pick<PurchaseOrder, "lines">) =>
  po.lines.reduce((s, l) => s + poOutstanding(l), 0);

export const poOrderedQty = (po: Pick<PurchaseOrder, "lines">) => po.lines.reduce((s, l) => s + l.quantity, 0);
export const poReceivedQty = (po: Pick<PurchaseOrder, "lines">) => po.lines.reduce((s, l) => s + l.receivedQty, 0);

/** yyyy-MM-dd (for <input type="date">) from an ISO timestamp. */
export const toDateInput = (iso: string) => iso.slice(0, 10);

/** ISO timestamp (noon UTC, so it renders as the same calendar day in any timezone) from yyyy-MM-dd. */
export const fromDateInput = (value: string) => `${value}T12:00:00.000Z`;

export function todayPlusDays(days: number) {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}

/** Step index for a PO in the Draft → Approved → Partially Received → Received flow. */
export function poStepIndex(status: PurchaseOrderStatus) {
  switch (status) {
    case "draft":
      return 0;
    case "approved":
      return 1;
    case "partially_received":
      return 2;
    case "received":
      return 4; // all steps complete
    case "cancelled":
      return 0;
  }
}

export const PO_STEPS = [
  { key: "draft", label: "Draft" },
  { key: "approved", label: "Approved" },
  { key: "partially_received", label: "Partially Received" },
  { key: "received", label: "Received" },
];
