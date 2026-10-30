import type { ID, StockTransfer, TransferLine, WmsData } from "@/types";
import {
  addToBin,
  binFreeSpace,
  binLabel,
  checkLowStock,
  completeTask,
  createTask,
  fail,
  findRecord,
  makeEvent,
  newId,
  notify,
  numbers,
  ok,
  planAllocation,
  recordMovement,
  removeFromBin,
  type TxContext,
} from "@/lib/inventory/core";
import {
  availableInWarehouse,
  indexData,
  stockRecordAvailable,
  storageBinsFor,
} from "@/lib/inventory/selectors";

export interface TransferInput {
  fromWarehouseId: ID;
  toWarehouseId: ID;
  notes: string;
  lines: { productId: ID; quantity: number; fromBinId?: ID | null; toBinId?: ID | null }[];
}

function validate(d: WmsData, input: TransferInput): string | null {
  const idx = indexData(d);
  const from = idx.warehouses.get(input.fromWarehouseId);
  const to = idx.warehouses.get(input.toWarehouseId);
  if (!from) return "Select a source warehouse.";
  if (!to) return "Select a destination warehouse.";
  if (from.status !== "active" || to.status !== "active") return "Both warehouses must be active.";
  if (input.lines.length === 0) return "Add at least one product.";
  const internal = from.id === to.id;
  const wanted = new Map<string, number>();
  for (const l of input.lines) {
    const p = idx.products.get(l.productId);
    if (!p) return "One of the products no longer exists.";
    if (!Number.isInteger(l.quantity) || l.quantity <= 0) return `Quantity for ${p.name} must be a positive whole number.`;
    if (internal) {
      if (!l.fromBinId || !l.toBinId) return `Select source and destination bins for ${p.name}.`;
      if (l.fromBinId === l.toBinId) return `Source and destination bins for ${p.name} must differ.`;
      const fb = idx.bins.get(l.fromBinId);
      const tb = idx.bins.get(l.toBinId);
      if (!fb || !tb || fb.type !== "storage" || tb.type !== "storage") return "Bin-to-bin transfers use storage bins.";
      if (fb.warehouseId !== from.id || tb.warehouseId !== from.id) return "Bins must belong to the selected warehouse.";
      const rec = findRecord(d, l.productId, l.fromBinId);
      const avail = rec ? stockRecordAvailable(rec, fb) : 0;
      const key = `${l.productId}|${l.fromBinId}`;
      const total = (wanted.get(key) ?? 0) + l.quantity;
      wanted.set(key, total);
      if (total > avail) return `${p.name}: only ${avail} available at ${fb.code} (requested ${total}).`;
      if (l.quantity > binFreeSpace(d, tb.id)) return `${tb.code} only has room for ${binFreeSpace(d, tb.id)} more units.`;
    } else {
      const total = (wanted.get(l.productId) ?? 0) + l.quantity;
      wanted.set(l.productId, total);
      const avail = availableInWarehouse(d, l.productId, from.id);
      if (total > avail) return `${p.name}: only ${avail} available at ${from.name} (requested ${total}).`;
    }
  }
  return null;
}

function buildLines(d: WmsData, input: TransferInput, internal: boolean): TransferLine[] {
  return input.lines.map((l) => ({
    id: newId(d, "trl"),
    productId: l.productId,
    quantity: l.quantity,
    fromBinId: internal ? (l.fromBinId ?? null) : null,
    toBinId: internal ? (l.toBinId ?? null) : (l.toBinId ?? null),
    dispatchedQty: 0,
    receivedQty: 0,
  }));
}

/** Moves stock bin-to-bin inside one warehouse (no in-transit stage). */
function executeInternal(d: WmsData, ctx: TxContext, t: StockTransfer): string | null {
  for (const l of t.lines) {
    if (!l.fromBinId || !l.toBinId) return "Missing bins on a transfer line.";
    if (l.quantity > binFreeSpace(d, l.toBinId)) return `${binLabel(d, l.toBinId)} does not have enough free space.`;
    const r = removeFromBin(d, l.productId, l.fromBinId, l.quantity);
    if (!r.ok) return r.error;
    addToBin(d, l.productId, l.toBinId, l.quantity);
    recordMovement(d, ctx, {
      productId: l.productId,
      warehouseId: t.fromWarehouseId,
      type: "bin_transfer",
      quantity: l.quantity,
      onHandDelta: 0,
      fromLabel: binLabel(d, l.fromBinId),
      toLabel: binLabel(d, l.toBinId),
      fromBinId: l.fromBinId,
      toBinId: l.toBinId,
      source: { kind: "transfer", id: t.id, number: t.number },
      note: "Bin-to-bin transfer",
    });
    l.dispatchedQty = l.quantity;
    l.receivedQty = l.quantity;
  }
  t.status = "completed";
  t.events.push(makeEvent(d, ctx, "Bin transfer completed"));
  return null;
}

export function createTransfer(
  d: WmsData,
  ctx: TxContext,
  input: TransferInput,
  mode: "draft" | "submit" = "draft",
) {
  const err = validate(d, input);
  if (err) return fail(err);
  const internal = input.fromWarehouseId === input.toWarehouseId;
  const t: StockTransfer = {
    id: newId(d, "trf"),
    number: numbers.trf(d),
    type: internal ? "internal" : "inter_warehouse",
    fromWarehouseId: input.fromWarehouseId,
    toWarehouseId: input.toWarehouseId,
    status: "draft",
    lines: buildLines(d, input, internal),
    notes: input.notes.trim(),
    createdAt: ctx.now,
    createdBy: ctx.userId,
    events: [],
  };
  t.events.push(makeEvent(d, ctx, "Draft created"));
  d.transfers.push(t);
  if (mode === "submit") {
    const r = submitTransfer(d, ctx, t.id);
    if (!r.ok) return r;
  }
  return ok(t.id);
}

export function updateTransfer(d: WmsData, ctx: TxContext, id: ID, input: TransferInput) {
  const t = d.transfers.find((x) => x.id === id);
  if (!t) return fail("Transfer not found.");
  if (t.status !== "draft") return fail("Only draft transfers can be edited.");
  const err = validate(d, input);
  if (err) return fail(err);
  const internal = input.fromWarehouseId === input.toWarehouseId;
  t.type = internal ? "internal" : "inter_warehouse";
  t.fromWarehouseId = input.fromWarehouseId;
  t.toWarehouseId = input.toWarehouseId;
  t.notes = input.notes.trim();
  t.lines = buildLines(d, input, internal);
  t.events.push(makeEvent(d, ctx, "Draft updated"));
  return ok();
}

/** Draft -> pending approval (inter-warehouse) or executed immediately (bin-to-bin). */
export function submitTransfer(d: WmsData, ctx: TxContext, id: ID) {
  const t = d.transfers.find((x) => x.id === id);
  if (!t) return fail("Transfer not found.");
  if (t.status !== "draft") return fail("Only draft transfers can be submitted.");
  const err = validate(d, {
    fromWarehouseId: t.fromWarehouseId,
    toWarehouseId: t.toWarehouseId,
    notes: t.notes,
    lines: t.lines,
  });
  if (err) return fail(err);
  if (t.type === "internal") {
    const e = executeInternal(d, ctx, t);
    if (e) return fail(e);
    notify(d, ctx, {
      type: "transfer_completed",
      title: `${t.number} completed`,
      message: `Bin-to-bin transfer finished in ${indexData(d).warehouses.get(t.fromWarehouseId)?.name}.`,
      href: `/transfers/${t.id}`,
    });
    return ok();
  }
  t.status = "pending_approval";
  t.events.push(makeEvent(d, ctx, "Submitted for approval"));
  return ok();
}

export function approveTransfer(d: WmsData, ctx: TxContext, id: ID) {
  const t = d.transfers.find((x) => x.id === id);
  if (!t) return fail("Transfer not found.");
  if (t.status !== "pending_approval") return fail("Only transfers pending approval can be approved.");
  t.status = "approved";
  t.events.push(makeEvent(d, ctx, "Approved"));
  createTask(d, ctx, {
    title: `Dispatch ${t.number}`,
    description: "Pick and dispatch the approved inter-warehouse transfer.",
    type: "transfer",
    warehouseId: t.fromWarehouseId,
    link: { kind: "transfer", id: t.id, label: t.number },
  });
  return ok();
}

/** Approved -> in transit. Stock leaves the source warehouse now and is tracked as in-transit. */
export function dispatchTransfer(d: WmsData, ctx: TxContext, id: ID) {
  const t = d.transfers.find((x) => x.id === id);
  if (!t) return fail("Transfer not found.");
  if (t.status !== "approved") return fail("Only approved transfers can be dispatched.");
  const idx = indexData(d);
  const from = idx.warehouses.get(t.fromWarehouseId);
  const to = idx.warehouses.get(t.toWarehouseId);
  // Re-check availability (stock may have been reserved since approval).
  const need = new Map<ID, number>();
  for (const l of t.lines) need.set(l.productId, (need.get(l.productId) ?? 0) + l.quantity);
  for (const [productId, qty] of need) {
    const avail = availableInWarehouse(d, productId, t.fromWarehouseId);
    if (qty > avail) {
      return fail(`${idx.products.get(productId)?.name}: only ${avail} available at ${from?.name} (need ${qty}).`);
    }
  }
  for (const l of t.lines) {
    const plan = planAllocation(d, l.productId, t.fromWarehouseId, l.quantity);
    if (!plan) return fail("Stock is no longer available for this transfer.");
    for (const a of plan) {
      const r = removeFromBin(d, l.productId, a.binId, a.quantity);
      if (!r.ok) return r;
      recordMovement(d, ctx, {
        productId: l.productId,
        warehouseId: t.fromWarehouseId,
        type: "transfer_out",
        quantity: a.quantity,
        onHandDelta: -a.quantity,
        fromLabel: binLabel(d, a.binId),
        toLabel: `In transit → ${to?.code ?? ""}`,
        fromBinId: a.binId,
        source: { kind: "transfer", id: t.id, number: t.number },
        note: `Dispatched to ${to?.name ?? "destination"}`,
      });
    }
    l.dispatchedQty = l.quantity;
    checkLowStock(d, ctx, l.productId, t.fromWarehouseId);
  }
  t.status = "in_transit";
  t.events.push(makeEvent(d, ctx, "Dispatched", `Stock is in transit to ${to?.name ?? "destination"}`));
  closeTransferTasks(d, ctx, t.id);
  createTask(d, ctx, {
    title: `Receive ${t.number} at ${to?.code ?? "destination"}`,
    description: "Check in the inbound transfer and assign storage bins.",
    type: "transfer",
    warehouseId: t.toWarehouseId,
    link: { kind: "transfer", id: t.id, label: t.number },
  });
  return ok();
}

function closeTransferTasks(d: WmsData, ctx: TxContext, transferId: ID) {
  for (const task of d.tasks) {
    if (task.link?.kind === "transfer" && task.link.id === transferId && task.status !== "completed") {
      completeTask(d, ctx, task.id);
    }
  }
}

function autoDestinationBin(d: WmsData, productId: ID, warehouseId: ID, qty: number): ID | null {
  const bins = storageBinsFor(d, warehouseId);
  const holding = bins.find(
    (b) => d.stock.some((r) => r.binId === b.id && r.productId === productId && r.onHand > 0) && binFreeSpace(d, b.id) >= qty,
  );
  if (holding) return holding.id;
  return bins.map((b) => ({ b, free: binFreeSpace(d, b.id) })).sort((a, b) => b.free - a.free).find((x) => x.free >= qty)?.b.id ?? null;
}

/** In transit -> completed. Stock lands in the chosen (or automatically chosen) destination bins. */
export function receiveTransfer(
  d: WmsData,
  ctx: TxContext,
  id: ID,
  binChoices: Record<ID, ID> = {}, // lineId -> binId
) {
  const t = d.transfers.find((x) => x.id === id);
  if (!t) return fail("Transfer not found.");
  if (t.status !== "in_transit") return fail("Only in-transit transfers can be received.");
  const idx = indexData(d);
  const from = idx.warehouses.get(t.fromWarehouseId);
  for (const l of t.lines) {
    const qty = l.dispatchedQty - l.receivedQty;
    if (qty <= 0) continue;
    const binId = binChoices[l.id] ?? l.toBinId ?? autoDestinationBin(d, l.productId, t.toWarehouseId, qty);
    const bin = binId ? idx.bins.get(binId) : undefined;
    if (!bin || bin.type !== "storage" || bin.warehouseId !== t.toWarehouseId) {
      return fail(`No suitable storage bin at the destination for ${idx.products.get(l.productId)?.name}.`);
    }
    if (qty > binFreeSpace(d, bin.id)) return fail(`${bin.code} only has room for ${binFreeSpace(d, bin.id)} more units.`);
    addToBin(d, l.productId, bin.id, qty);
    l.toBinId = bin.id;
    l.receivedQty += qty;
    recordMovement(d, ctx, {
      productId: l.productId,
      warehouseId: t.toWarehouseId,
      type: "transfer_in",
      quantity: qty,
      onHandDelta: qty,
      fromLabel: `In transit ← ${from?.code ?? ""}`,
      toLabel: bin.code,
      toBinId: bin.id,
      source: { kind: "transfer", id: t.id, number: t.number },
      note: `Received from ${from?.name ?? "source"}`,
    });
  }
  t.status = "completed";
  t.events.push(makeEvent(d, ctx, "Received at destination"));
  closeTransferTasks(d, ctx, t.id);
  notify(d, ctx, {
    type: "transfer_completed",
    title: `${t.number} completed`,
    message: `Stock received at ${idx.warehouses.get(t.toWarehouseId)?.name}.`,
    href: `/transfers/${t.id}`,
  });
  return ok();
}

export function cancelTransfer(d: WmsData, ctx: TxContext, id: ID, reason = "") {
  const t = d.transfers.find((x) => x.id === id);
  if (!t) return fail("Transfer not found.");
  if (!["draft", "pending_approval", "approved"].includes(t.status)) {
    return fail("Transfers that are in transit or finished cannot be cancelled.");
  }
  t.status = "cancelled";
  t.events.push(makeEvent(d, ctx, "Cancelled", reason || undefined));
  closeTransferTasks(d, ctx, t.id);
  return ok();
}
