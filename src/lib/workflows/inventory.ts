import type { ID, WmsData } from "@/types";
import {
  addToBin,
  binFreeSpace,
  binLabel,
  checkLowStock,
  fail,
  findRecord,
  ok,
  recordMovement,
  removeFromBin,
  type TxContext,
} from "@/lib/inventory/core";
import { indexData } from "@/lib/inventory/selectors";

export type AdjustmentType = "increase" | "decrease" | "set_count" | "block" | "unblock";

export interface AdjustmentInput {
  productId: ID;
  binId: ID;
  type: AdjustmentType;
  /** units to add/remove/block/unblock, or the counted on-hand quantity for "set_count" */
  quantity: number;
  reason: string;
  note?: string;
}

export const ADJUSTMENT_TYPE_LABELS: Record<AdjustmentType, string> = {
  increase: "Add stock",
  decrease: "Remove stock",
  set_count: "Set counted quantity",
  block: "Block (quarantine)",
  unblock: "Unblock",
};

/**
 * Manual stock adjustment. Never allows negative stock, never cuts into
 * reserved units, always writes a stock movement.
 */
export function adjustStock(d: WmsData, ctx: TxContext, input: AdjustmentInput) {
  const idx = indexData(d);
  const product = idx.products.get(input.productId);
  const bin = idx.bins.get(input.binId);
  if (!product) return fail("Product not found.");
  if (!bin) return fail("Storage location not found.");
  if (!Number.isInteger(input.quantity) || input.quantity < 0) return fail("Quantity must be a whole number of zero or more.");
  if (input.type !== "set_count" && input.quantity === 0) return fail("Quantity must be greater than zero.");
  if (ctx.settings.adjustmentReasonRequired && !input.reason.trim()) return fail("A reason is required for stock adjustments.");

  const rec = findRecord(d, input.productId, input.binId);
  const onHand = rec?.onHand ?? 0;
  const reserved = rec?.reserved ?? 0;
  const blocked = rec?.blocked ?? 0;
  const label = bin.code;
  const source = { kind: "adjustment", id: null, number: "Manual adjustment" };
  const note = [input.reason, input.note].filter(Boolean).join(" — ");
  const pickable = bin.type === "storage";

  let delta = 0; // change in on-hand
  switch (input.type) {
    case "increase": {
      delta = input.quantity;
      break;
    }
    case "decrease": {
      if (input.quantity > onHand) return fail(`Cannot remove ${input.quantity}: only ${onHand} on hand at ${label}.`);
      if (pickable && onHand - input.quantity < reserved + blocked) {
        return fail(
          `Only ${Math.max(0, onHand - reserved - blocked)} unreserved units can be removed from ${label} (${reserved} reserved, ${blocked} blocked).`,
        );
      }
      delta = -input.quantity;
      break;
    }
    case "set_count": {
      if (pickable && input.quantity < reserved + blocked) {
        return fail(`Counted quantity cannot be below reserved + blocked units (${reserved + blocked}) at ${label}.`);
      }
      delta = input.quantity - onHand;
      if (delta === 0) return fail("The counted quantity matches the system quantity — no adjustment needed.");
      break;
    }
    case "block": {
      if (!pickable) return fail("Only storage locations can have blocked stock.");
      if (input.quantity > onHand - reserved - blocked) {
        return fail(`Only ${Math.max(0, onHand - reserved - blocked)} available units can be blocked at ${label}.`);
      }
      break;
    }
    case "unblock": {
      if (input.quantity > blocked) return fail(`Only ${blocked} blocked units at ${label}.`);
      break;
    }
  }

  if (Math.abs(delta) > ctx.settings.largeAdjustmentThreshold && (input.note ?? "").trim().length < 10) {
    return fail(`Adjustments larger than ${ctx.settings.largeAdjustmentThreshold} units need a note (min. 10 characters).`);
  }
  if (delta > 0 && delta > binFreeSpace(d, input.binId)) {
    return fail(`${label} only has room for ${binFreeSpace(d, input.binId)} more units.`);
  }

  if (delta > 0) {
    addToBin(d, input.productId, input.binId, delta);
  } else if (delta < 0) {
    const r = removeFromBin(d, input.productId, input.binId, -delta);
    if (!r.ok) return r;
  }
  const record = findRecord(d, input.productId, input.binId)!;
  if (input.type === "block") record.blocked += input.quantity;
  if (input.type === "unblock") record.blocked -= input.quantity;

  const movementType =
    input.type === "block" ? "block" : input.type === "unblock" ? "unblock" : delta >= 0 ? "adjustment_in" : "adjustment_out";
  recordMovement(d, ctx, {
    productId: input.productId,
    warehouseId: bin.warehouseId,
    type: movementType,
    quantity: input.type === "set_count" ? Math.abs(delta) : input.quantity,
    onHandDelta: delta,
    fromLabel: delta < 0 || input.type === "block" ? label : "Adjustment",
    toLabel: delta > 0 ? label : delta < 0 ? "Write-off" : input.type === "block" ? "Quarantine hold" : label,
    fromBinId: delta < 0 || input.type === "block" ? input.binId : null,
    toBinId: delta > 0 ? input.binId : null,
    source,
    note,
  });

  if (delta < 0 || input.type === "block") checkLowStock(d, ctx, input.productId, bin.warehouseId);
  return ok();
}

export interface StockCountLine {
  productId: ID;
  binId: ID;
  counted: number;
}

/**
 * Simple stock count / reconciliation: applies "set_count" adjustments for every
 * line whose counted quantity differs from the system quantity.
 */
export function applyStockCount(
  d: WmsData,
  ctx: TxContext,
  input: { lines: StockCountLine[]; reason?: string },
) {
  const reason = input.reason ?? "Cycle count correction";
  let adjusted = 0;
  for (const line of input.lines) {
    const current = findRecord(d, line.productId, line.binId)?.onHand ?? 0;
    if (current === line.counted) continue;
    const r = adjustStock(d, ctx, {
      productId: line.productId,
      binId: line.binId,
      type: "set_count",
      quantity: line.counted,
      reason,
      note: `Stock count: system ${current}, counted ${line.counted} at ${binLabel(d, line.binId)}`,
    });
    if (!r.ok) return fail(r.error);
    adjusted += 1;
  }
  return ok(adjusted);
}
