import type { MovementType } from "@/types";
import { TONE_CLASSES, TONE_DOT, type Tone } from "@/components/shared/status-badge";
import { cn } from "@/lib/utils";

export const MOVEMENT_LABELS: Record<MovementType, string> = {
  receipt: "Goods Receipt",
  putaway: "Putaway",
  adjustment_in: "Adjustment (+)",
  adjustment_out: "Adjustment (−)",
  block: "Blocked",
  unblock: "Unblocked",
  transfer_out: "Transfer Out",
  transfer_in: "Transfer In",
  bin_transfer: "Bin Transfer",
  dispatch: "Dispatch",
  return_receipt: "Return Received",
  return_restock: "Return Restocked",
  return_writeoff: "Return Write-off",
};

const MOVEMENT_TONES: Record<MovementType, Tone> = {
  receipt: "success",
  putaway: "info",
  adjustment_in: "success",
  adjustment_out: "warning",
  block: "danger",
  unblock: "info",
  transfer_out: "warning",
  transfer_in: "success",
  bin_transfer: "neutral",
  dispatch: "primary",
  return_receipt: "teal",
  return_restock: "info",
  return_writeoff: "danger",
};

export function MovementTypeBadge({ type, className }: { type: MovementType; className?: string }) {
  const tone = MOVEMENT_TONES[type] ?? "neutral";
  return (
    <span
      data-movement-type={type}
      className={cn("inline-flex items-center gap-1.5 whitespace-nowrap rounded-full px-2 py-0.5 text-xs font-medium", TONE_CLASSES[tone], className)}
    >
      <span className={cn("size-1.5 rounded-full", TONE_DOT[tone])} aria-hidden />
      {MOVEMENT_LABELS[type] ?? type}
    </span>
  );
}

/** "+12" / "−5" / "0" with colour; neutral for non-quantity movements. */
export function SignedQty({ delta, quantity }: { delta: number; quantity: number }) {
  if (delta === 0) {
    return <span className="tabular-nums text-muted-foreground">{quantity.toLocaleString()}</span>;
  }
  return (
    <span className={cn("font-medium tabular-nums", delta > 0 ? "text-success" : "text-danger")}>
      {delta > 0 ? "+" : "−"}
      {Math.abs(delta).toLocaleString()}
    </span>
  );
}
