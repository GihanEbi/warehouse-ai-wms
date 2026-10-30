import type { MovementType } from "@/types";
import type { Tone } from "@/components/shared/status-badge";

export const MOVEMENT_LABELS: Record<MovementType, string> = {
  receipt: "Goods Receipt",
  putaway: "Putaway",
  adjustment_in: "Adjustment (+)",
  adjustment_out: "Adjustment (-)",
  block: "Blocked",
  unblock: "Unblocked",
  transfer_out: "Transfer Out",
  transfer_in: "Transfer In",
  bin_transfer: "Bin Transfer",
  dispatch: "Dispatch",
  return_receipt: "Return Receipt",
  return_restock: "Return Restock",
  return_writeoff: "Return Write-off",
};

export const MOVEMENT_TONE: Record<MovementType, Tone> = {
  receipt: "success",
  putaway: "primary",
  adjustment_in: "success",
  adjustment_out: "danger",
  block: "warning",
  unblock: "info",
  transfer_out: "warning",
  transfer_in: "info",
  bin_transfer: "neutral",
  dispatch: "danger",
  return_receipt: "teal",
  return_restock: "success",
  return_writeoff: "danger",
};

export const MOVEMENT_TYPES = Object.keys(MOVEMENT_LABELS) as MovementType[];
