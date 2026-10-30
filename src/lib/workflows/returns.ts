import type { ID, ReturnRecord, WmsData } from "@/types";
import {
  addToBin,
  binFreeSpace,
  binLabel,
  fail,
  makeEvent,
  newId,
  notify,
  numbers,
  ok,
  recordMovement,
  removeFromBin,
  type TxContext,
} from "@/lib/inventory/core";
import { indexData, returnsBinFor } from "@/lib/inventory/selectors";
import { suggestPutawayBin } from "./purchasing";

export interface ReturnInput {
  orderId: ID;
  reason: string;
  lines: { productId: ID; quantity: number; reason: string }[];
}

/** Units of each product on an order that can still be returned. */
export function returnableQty(d: WmsData, orderId: ID): Map<ID, number> {
  const order = d.orders.find((o) => o.id === orderId);
  const map = new Map<ID, number>();
  if (!order || order.status !== "dispatched") return map;
  for (const l of order.lines) map.set(l.productId, (map.get(l.productId) ?? 0) + l.quantity);
  for (const r of d.returns) {
    if (r.orderId !== orderId || r.status === "rejected") continue;
    for (const l of r.lines) map.set(l.productId, (map.get(l.productId) ?? 0) - l.quantity);
  }
  return map;
}

export function createReturn(d: WmsData, ctx: TxContext, input: ReturnInput) {
  const order = d.orders.find((o) => o.id === input.orderId);
  if (!order) return fail("Select the original order.");
  if (order.status !== "dispatched") return fail("Returns can only be registered for dispatched orders.");
  if (!input.reason.trim()) return fail("Enter a return reason.");
  const lines = input.lines.filter((l) => l.quantity > 0);
  if (lines.length === 0) return fail("Enter a return quantity for at least one product.");
  const allowed = returnableQty(d, order.id);
  const idx = indexData(d);
  for (const l of lines) {
    if (!Number.isInteger(l.quantity)) return fail("Return quantities must be whole numbers.");
    const max = allowed.get(l.productId) ?? 0;
    if (l.quantity > max) return fail(`${idx.products.get(l.productId)?.name}: at most ${max} unit(s) can still be returned.`);
  }
  const ret: ReturnRecord = {
    id: newId(d, "rma"),
    number: numbers.rma(d),
    orderId: order.id,
    customerId: order.customerId,
    warehouseId: order.warehouseId,
    status: "requested",
    reason: input.reason.trim(),
    lines: lines.map((l) => ({
      id: newId(d, "rtl"),
      productId: l.productId,
      quantity: l.quantity,
      reason: l.reason || input.reason,
      goodQty: 0,
      damagedQty: 0,
    })),
    createdAt: ctx.now,
    createdBy: ctx.userId,
    events: [],
  };
  ret.events.push(makeEvent(d, ctx, "Return requested", `Against ${order.number}`));
  d.returns.push(ret);
  return ok(ret.id);
}

/** Requested -> received: units are physically in the returns/inspection area (not sellable). */
export function receiveReturn(d: WmsData, ctx: TxContext, id: ID) {
  const r = d.returns.find((x) => x.id === id);
  if (!r) return fail("Return not found.");
  if (r.status !== "requested") return fail("Only requested returns can be marked as received.");
  const bin = returnsBinFor(d, r.warehouseId);
  if (!bin) return fail("The warehouse has no returns location.");
  const total = r.lines.reduce((s, l) => s + l.quantity, 0);
  if (total > binFreeSpace(d, bin.id)) return fail("The returns area is full.");
  const customer = indexData(d).customers.get(r.customerId);
  const order = d.orders.find((o) => o.id === r.orderId);
  for (const l of r.lines) {
    addToBin(d, l.productId, bin.id, l.quantity);
    recordMovement(d, ctx, {
      productId: l.productId,
      warehouseId: r.warehouseId,
      type: "return_receipt",
      quantity: l.quantity,
      onHandDelta: l.quantity,
      fromLabel: `Customer: ${customer?.name ?? "—"}`,
      toLabel: bin.code,
      toBinId: bin.id,
      source: { kind: "return", id: r.id, number: r.number },
      note: `Return of ${order?.number ?? "order"} - awaiting inspection`,
    });
  }
  r.status = "received";
  r.events.push(makeEvent(d, ctx, "Received", "Held in the returns area - not available for sale"));
  return ok();
}

export function inspectReturn(
  d: WmsData,
  ctx: TxContext,
  id: ID,
  results: { lineId: ID; goodQty: number; damagedQty: number }[],
) {
  const r = d.returns.find((x) => x.id === id);
  if (!r) return fail("Return not found.");
  if (r.status !== "received") return fail("Only received returns can be inspected.");
  for (const line of r.lines) {
    const res = results.find((x) => x.lineId === line.id);
    if (!res) return fail("Inspect every returned product.");
    if (!Number.isInteger(res.goodQty) || !Number.isInteger(res.damagedQty) || res.goodQty < 0 || res.damagedQty < 0) {
      return fail("Inspection quantities must be whole numbers.");
    }
    if (res.goodQty + res.damagedQty !== line.quantity) {
      return fail(`${indexData(d).products.get(line.productId)?.name}: good + damaged must equal ${line.quantity}.`);
    }
  }
  for (const line of r.lines) {
    const res = results.find((x) => x.lineId === line.id)!;
    line.goodQty = res.goodQty;
    line.damagedQty = res.damagedQty;
  }
  r.status = "inspected";
  const good = r.lines.reduce((s, l) => s + l.goodQty, 0);
  const bad = r.lines.reduce((s, l) => s + l.damagedQty, 0);
  r.events.push(makeEvent(d, ctx, "Inspected", `${good} fit for resale, ${bad} damaged`));
  return ok();
}

/** Inspected -> restocked: only the approved good units become available; damaged units are written off. */
export function approveRestock(d: WmsData, ctx: TxContext, id: ID, binId?: ID) {
  const r = d.returns.find((x) => x.id === id);
  if (!r) return fail("Return not found.");
  if (r.status !== "inspected") return fail("Only inspected returns can be restocked.");
  const good = r.lines.reduce((s, l) => s + l.goodQty, 0);
  if (good === 0) return fail("No units passed inspection. Reject this return instead.");
  const returnsBin = returnsBinFor(d, r.warehouseId);
  if (!returnsBin) return fail("The warehouse has no returns location.");
  const idx = indexData(d);
  for (const l of r.lines) {
    if (l.goodQty > 0) {
      const target = binId ?? suggestPutawayBin(d, l.productId, r.warehouseId, l.goodQty);
      const bin = target ? idx.bins.get(target) : undefined;
      if (!bin || bin.type !== "storage" || bin.warehouseId !== r.warehouseId) {
        return fail(`No storage bin with enough room for ${idx.products.get(l.productId)?.name}.`);
      }
      if (l.goodQty > binFreeSpace(d, bin.id)) return fail(`${bin.code} only has room for ${binFreeSpace(d, bin.id)} more units.`);
      const rem = removeFromBin(d, l.productId, returnsBin.id, l.goodQty);
      if (!rem.ok) return rem;
      addToBin(d, l.productId, bin.id, l.goodQty);
      recordMovement(d, ctx, {
        productId: l.productId,
        warehouseId: r.warehouseId,
        type: "return_restock",
        quantity: l.goodQty,
        onHandDelta: 0,
        fromLabel: returnsBin.code,
        toLabel: bin.code,
        fromBinId: returnsBin.id,
        toBinId: bin.id,
        source: { kind: "return", id: r.id, number: r.number },
        note: "Approved for restocking",
      });
    }
    if (l.damagedQty > 0) writeOff(d, ctx, r, l.productId, l.damagedQty, returnsBin.id);
  }
  r.status = "restocked";
  r.events.push(makeEvent(d, ctx, "Restocked", `${good} unit(s) returned to sellable stock`));
  notify(d, ctx, {
    type: "return_processed",
    title: `${r.number} restocked`,
    message: `${good} unit(s) are available for sale again.`,
    href: `/returns/${r.id}`,
  });
  return ok();
}

function writeOff(d: WmsData, ctx: TxContext, r: ReturnRecord, productId: ID, qty: number, returnsBinId: ID) {
  const rem = removeFromBin(d, productId, returnsBinId, qty);
  if (!rem.ok) return;
  recordMovement(d, ctx, {
    productId,
    warehouseId: r.warehouseId,
    type: "return_writeoff",
    quantity: qty,
    onHandDelta: -qty,
    fromLabel: binLabel(d, returnsBinId),
    toLabel: "Write-off (damaged / rejected)",
    fromBinId: returnsBinId,
    source: { kind: "return", id: r.id, number: r.number },
    note: "Damaged or rejected return written off",
  });
}

/** Reject a return: everything still held in the returns area for it is written off. */
export function rejectReturn(d: WmsData, ctx: TxContext, id: ID, reason = "") {
  const r = d.returns.find((x) => x.id === id);
  if (!r) return fail("Return not found.");
  if (r.status === "restocked" || r.status === "rejected") return fail("This return is already closed.");
  const returnsBin = returnsBinFor(d, r.warehouseId);
  if (r.status !== "requested" && returnsBin) {
    for (const l of r.lines) writeOff(d, ctx, r, l.productId, l.quantity, returnsBin.id);
  }
  r.status = "rejected";
  r.events.push(makeEvent(d, ctx, "Rejected", reason || "Returned goods not accepted for resale"));
  notify(d, ctx, {
    type: "return_processed",
    title: `${r.number} rejected`,
    message: "Returned units were not accepted back into stock.",
    href: `/returns/${r.id}`,
  });
  return ok();
}
