import type { GoodsReceipt, ID, PurchaseOrder, PurchaseOrderLine, WmsData } from "@/types";
import {
  addToBin,
  binFreeSpace,
  binLabel,
  checkLowStock,
  completeTask,
  createTask,
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
import { indexData, stagingBinFor, storageBinsFor } from "@/lib/inventory/selectors";

export const poTotal = (po: Pick<PurchaseOrder, "lines">) =>
  po.lines.reduce((s, l) => s + l.quantity * l.unitCost, 0);

export const poReceivedValue = (po: Pick<PurchaseOrder, "lines">) =>
  po.lines.reduce((s, l) => s + l.receivedQty * l.unitCost, 0);

export const poOutstanding = (line: PurchaseOrderLine) => Math.max(0, line.quantity - line.receivedQty);

export interface PurchaseOrderInput {
  supplierId: ID;
  warehouseId: ID;
  expectedDate: string; // ISO
  notes: string;
  lines: { productId: ID; quantity: number; unitCost: number }[];
}

function validatePO(d: WmsData, input: PurchaseOrderInput) {
  const idx = indexData(d);
  const supplier = idx.suppliers.get(input.supplierId);
  if (!supplier) return "Select a supplier.";
  if (supplier.status !== "active") return "That supplier is inactive.";
  const wh = idx.warehouses.get(input.warehouseId);
  if (!wh) return "Select a destination warehouse.";
  if (wh.status !== "active") return "That warehouse is inactive.";
  if (input.lines.length === 0) return "Add at least one product.";
  const seen = new Set<ID>();
  for (const l of input.lines) {
    const p = idx.products.get(l.productId);
    if (!p) return "One of the products no longer exists.";
    if (seen.has(l.productId)) return `${p.name} is listed more than once.`;
    seen.add(l.productId);
    if (!Number.isInteger(l.quantity) || l.quantity <= 0) return `Quantity for ${p.name} must be a positive whole number.`;
    if (!(l.unitCost >= 0)) return `Unit cost for ${p.name} must be zero or more.`;
  }
  if (!input.expectedDate) return "Expected delivery date is required.";
  return null;
}

function buildLines(d: WmsData, input: PurchaseOrderInput): PurchaseOrderLine[] {
  return input.lines.map((l) => ({
    id: newId(d, "pol"),
    productId: l.productId,
    quantity: l.quantity,
    unitCost: l.unitCost,
    receivedQty: 0,
    rejectedQty: 0,
  }));
}

export function createPurchaseOrder(d: WmsData, ctx: TxContext, input: PurchaseOrderInput) {
  const err = validatePO(d, input);
  if (err) return fail(err);
  const po: PurchaseOrder = {
    id: newId(d, "po"),
    number: numbers.po(d, ctx.now),
    supplierId: input.supplierId,
    warehouseId: input.warehouseId,
    orderDate: ctx.now,
    expectedDate: input.expectedDate,
    status: "draft",
    lines: buildLines(d, input),
    notes: input.notes.trim(),
    createdBy: ctx.userId,
    events: [],
  };
  po.events.push(makeEvent(d, ctx, "Draft created"));
  d.purchaseOrders.push(po);
  return ok(po.id);
}

export function updatePurchaseOrder(d: WmsData, ctx: TxContext, id: ID, input: PurchaseOrderInput) {
  const po = d.purchaseOrders.find((p) => p.id === id);
  if (!po) return fail("Purchase order not found.");
  if (po.status !== "draft") return fail("Only draft purchase orders can be edited.");
  const err = validatePO(d, input);
  if (err) return fail(err);
  po.supplierId = input.supplierId;
  po.warehouseId = input.warehouseId;
  po.expectedDate = input.expectedDate;
  po.notes = input.notes.trim();
  po.lines = buildLines(d, input);
  po.events.push(makeEvent(d, ctx, "Draft updated"));
  return ok();
}

export function approvePurchaseOrder(d: WmsData, ctx: TxContext, id: ID) {
  const po = d.purchaseOrders.find((p) => p.id === id);
  if (!po) return fail("Purchase order not found.");
  if (po.status !== "draft") return fail("Only draft purchase orders can be approved.");
  const err = validatePO(d, {
    supplierId: po.supplierId,
    warehouseId: po.warehouseId,
    expectedDate: po.expectedDate,
    notes: po.notes,
    lines: po.lines,
  });
  if (err) return fail(err);
  po.status = "approved";
  po.events.push(makeEvent(d, ctx, "Submitted and approved"));
  notify(d, ctx, {
    type: "po_approved",
    title: `${po.number} approved`,
    message: `Purchase order for ${indexData(d).suppliers.get(po.supplierId)?.name} is ready to be received.`,
    href: `/purchase-orders/${po.id}`,
  });
  return ok();
}

export function cancelPurchaseOrder(d: WmsData, ctx: TxContext, id: ID, reason = "") {
  const po = d.purchaseOrders.find((p) => p.id === id);
  if (!po) return fail("Purchase order not found.");
  if (po.status !== "draft" && po.status !== "approved") {
    return fail("Only draft or approved purchase orders without receipts can be cancelled.");
  }
  if (po.lines.some((l) => l.receivedQty > 0 || l.rejectedQty > 0)) {
    return fail("Goods have already been received against this purchase order.");
  }
  po.status = "cancelled";
  po.events.push(makeEvent(d, ctx, "Cancelled", reason || undefined));
  return ok();
}

/* ====================================================== goods receiving ==== */

export interface GoodsReceiptInput {
  purchaseOrderId: ID;
  notes: string;
  lines: { poLineId: ID; receivedQty: number; damagedQty: number }[];
}

/** Bin that already holds the product (with room), else the emptiest storage bin that fits. */
export function suggestPutawayBin(d: WmsData, productId: ID, warehouseId: ID, qty: number): ID | null {
  const bins = storageBinsFor(d, warehouseId);
  const holding = bins.find(
    (b) => d.stock.some((r) => r.binId === b.id && r.productId === productId && r.onHand > 0) && binFreeSpace(d, b.id) >= qty,
  );
  if (holding) return holding.id;
  const fits = bins
    .map((b) => ({ b, free: binFreeSpace(d, b.id) }))
    .filter((x) => x.free >= qty)
    .sort((a, b) => b.free - a.free);
  return fits[0]?.b.id ?? null;
}

export function confirmGoodsReceipt(d: WmsData, ctx: TxContext, input: GoodsReceiptInput) {
  const idx = indexData(d);
  const po = d.purchaseOrders.find((p) => p.id === input.purchaseOrderId);
  if (!po) return fail("Purchase order not found.");
  if (po.status !== "approved" && po.status !== "partially_received") {
    return fail("Goods can only be received against approved or partially received purchase orders.");
  }
  const staging = stagingBinFor(d, po.warehouseId);
  if (!staging) return fail("The destination warehouse has no receiving/staging location.");
  const supplier = idx.suppliers.get(po.supplierId);

  const lines = input.lines.filter((l) => l.receivedQty > 0 || l.damagedQty > 0);
  if (lines.length === 0) return fail("Enter a received or damaged quantity for at least one product.");
  let totalAccepted = 0;
  for (const l of lines) {
    const poLine = po.lines.find((x) => x.id === l.poLineId);
    if (!poLine) return fail("A received line does not belong to this purchase order.");
    const name = idx.products.get(poLine.productId)?.name ?? "product";
    if (!Number.isInteger(l.receivedQty) || !Number.isInteger(l.damagedQty) || l.receivedQty < 0 || l.damagedQty < 0) {
      return fail(`Quantities for ${name} must be whole numbers of zero or more.`);
    }
    if (l.receivedQty > poOutstanding(poLine)) {
      return fail(`${name}: received ${l.receivedQty} exceeds the outstanding quantity (${poOutstanding(poLine)}).`);
    }
    if (l.damagedQty > poLine.quantity) return fail(`${name}: damaged quantity is larger than the ordered quantity.`);
    totalAccepted += l.receivedQty;
  }
  if (totalAccepted > binFreeSpace(d, staging.id)) return fail("The staging area does not have enough free space for this delivery.");

  const receipt: GoodsReceipt = {
    id: newId(d, "grn"),
    grn: numbers.grn(d),
    purchaseOrderId: po.id,
    supplierId: po.supplierId,
    warehouseId: po.warehouseId,
    receivedAt: ctx.now,
    receivedBy: ctx.userId,
    status: "completed",
    lines: [],
    notes: input.notes.trim(),
  };

  for (const l of lines) {
    const poLine = po.lines.find((x) => x.id === l.poLineId)!;
    const product = idx.products.get(poLine.productId)!;
    const expected = poOutstanding(poLine);
    receipt.lines.push({
      id: newId(d, "grl"),
      productId: poLine.productId,
      poLineId: poLine.id,
      expectedQty: expected,
      receivedQty: l.receivedQty,
      damagedQty: l.damagedQty,
      stagingBinId: staging.id,
    });
    poLine.receivedQty += l.receivedQty;
    poLine.rejectedQty += l.damagedQty;
    if (l.receivedQty > 0) {
      addToBin(d, poLine.productId, staging.id, l.receivedQty);
      recordMovement(d, ctx, {
        productId: poLine.productId,
        warehouseId: po.warehouseId,
        type: "receipt",
        quantity: l.receivedQty,
        onHandDelta: l.receivedQty,
        fromLabel: `Supplier: ${supplier?.name ?? "—"}`,
        toLabel: staging.code,
        toBinId: staging.id,
        source: { kind: "receipt", id: receipt.id, number: receipt.grn },
        note: `Received against ${po.number}`,
      });
      const suggested = suggestPutawayBin(d, poLine.productId, po.warehouseId, l.receivedQty);
      if (suggested) {
        createTask(d, ctx, {
          title: `Putaway ${l.receivedQty} × ${product.name}`,
          description: `Move from ${staging.code} into a storage bin. Suggested: ${binLabel(d, suggested)}.`,
          type: "putaway",
          priority: "normal",
          warehouseId: po.warehouseId,
          link: { kind: "receipt", id: receipt.id, label: receipt.grn },
          putaway: {
            receiptId: receipt.id,
            lineId: receipt.lines[receipt.lines.length - 1].id,
            productId: poLine.productId,
            quantity: l.receivedQty,
            fromBinId: staging.id,
            suggestedBinId: suggested,
          },
        });
        receipt.status = "awaiting_putaway";
      }
    }
  }

  po.status = po.lines.every((l) => l.receivedQty >= l.quantity) ? "received" : "partially_received";
  const accepted = lines.reduce((s, l) => s + l.receivedQty, 0);
  const damaged = lines.reduce((s, l) => s + l.damagedQty, 0);
  po.events.push(
    makeEvent(d, ctx, `Goods received (${receipt.grn})`, `${accepted} accepted${damaged ? `, ${damaged} damaged/rejected` : ""}`),
  );
  d.receipts.push(receipt);
  notify(d, ctx, {
    type: "goods_received",
    title: `${receipt.grn} received`,
    message: `${accepted} units from ${supplier?.name ?? "supplier"} are in staging awaiting putaway.`,
    href: `/receiving/${receipt.id}`,
  });
  return ok(receipt.id);
}

/**
 * Completes a putaway task: staging -> storage bin. Only after this does the
 * stock become pickable (available).
 */
export function completePutaway(d: WmsData, ctx: TxContext, input: { taskId: ID; binId: ID }) {
  const task = d.tasks.find((t) => t.id === input.taskId);
  if (!task || task.type !== "putaway" || !task.putaway) return fail("Putaway task not found.");
  if (task.status === "completed") return fail("This putaway is already complete.");
  const pw = task.putaway;
  const bin = indexData(d).bins.get(input.binId);
  if (!bin || bin.type !== "storage") return fail("Choose a storage bin.");
  if (bin.warehouseId !== task.warehouseId) return fail("That bin belongs to a different warehouse.");
  if (pw.quantity > binFreeSpace(d, bin.id)) return fail(`${bin.code} only has room for ${binFreeSpace(d, bin.id)} more units.`);

  const removed = removeFromBin(d, pw.productId, pw.fromBinId, pw.quantity);
  if (!removed.ok) return fail("The staged stock for this task is no longer available.");
  addToBin(d, pw.productId, bin.id, pw.quantity);
  const receipt = d.receipts.find((r) => r.id === pw.receiptId);
  recordMovement(d, ctx, {
    productId: pw.productId,
    warehouseId: task.warehouseId,
    type: "putaway",
    quantity: pw.quantity,
    onHandDelta: 0,
    fromLabel: binLabel(d, pw.fromBinId),
    toLabel: bin.code,
    fromBinId: pw.fromBinId,
    toBinId: bin.id,
    source: receipt ? { kind: "receipt", id: receipt.id, number: receipt.grn } : null,
    note: "Putaway completed",
  });
  completeTask(d, ctx, task.id);
  if (receipt) {
    const pending = d.tasks.some(
      (t) => t.type === "putaway" && t.putaway?.receiptId === receipt.id && t.status !== "completed",
    );
    if (!pending) receipt.status = "completed";
  }
  return ok();
}
