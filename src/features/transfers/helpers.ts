import type { StockTransfer, TransferStatus } from "@/types";

export const TRANSFER_STATUS_OPTIONS: { value: TransferStatus; label: string }[] = [
  { value: "draft", label: "Draft" },
  { value: "pending_approval", label: "Pending Approval" },
  { value: "approved", label: "Approved" },
  { value: "in_transit", label: "In Transit" },
  { value: "completed", label: "Completed" },
  { value: "cancelled", label: "Cancelled" },
];

export const TRANSFER_TYPE_LABEL: Record<StockTransfer["type"], string> = {
  internal: "Bin-to-bin",
  inter_warehouse: "Inter-warehouse",
};

export const INTER_STEPS = [
  { key: "draft", label: "Draft" },
  { key: "pending_approval", label: "Pending Approval" },
  { key: "approved", label: "Approved" },
  { key: "in_transit", label: "In Transit" },
  { key: "completed", label: "Completed" },
];

export const INTERNAL_STEPS = [
  { key: "draft", label: "Draft" },
  { key: "completed", label: "Completed" },
];

export function transferStepIndex(t: Pick<StockTransfer, "type" | "status">) {
  if (t.type === "internal") return t.status === "completed" ? 2 : 0;
  switch (t.status) {
    case "draft":
      return 0;
    case "pending_approval":
      return 1;
    case "approved":
      return 2;
    case "in_transit":
      return 3;
    case "completed":
      return 5; // every step done
    case "cancelled":
      return 0;
  }
}

export const transferUnits = (t: Pick<StockTransfer, "lines">) => t.lines.reduce((s, l) => s + l.quantity, 0);
export const transferInTransit = (t: Pick<StockTransfer, "lines" | "status">) =>
  t.status === "in_transit" ? t.lines.reduce((s, l) => s + (l.dispatchedQty - l.receivedQty), 0) : 0;
