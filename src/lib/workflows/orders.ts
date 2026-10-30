import type { ID, OrderLine, Priority, SalesOrder, WmsData } from "@/types";
import {
  binLabel,
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
  type TxContext,
} from "@/lib/inventory/core";
import { availableInWarehouse, indexData } from "@/lib/inventory/selectors";

export const orderTotal = (o: Pick<SalesOrder, "lines">) =>
  o.lines.reduce((s, l) => s + l.quantity * l.unitPrice, 0);

export const OPEN_ORDER_STATUSES = ["confirmed", "picking", "picked", "packed"] as const;

export interface OrderInput {
  customerId: ID;
  warehouseId: ID;
  requiredDate: string; // ISO
  priority: Priority;
  notes: string;
  lines: { productId: ID; quantity: number; unitPrice: number }[];
}

function validate(d: WmsData, input: OrderInput): string | null {
  const idx = indexData(d);
  if (!idx.customers.get(input.customerId)) return "Select a customer.";
  const wh = idx.warehouses.get(input.warehouseId);
  if (!wh) return "Select a fulfilment warehouse.";
  if (wh.status !== "active") return "That warehouse is inactive.";
  if (input.lines.length === 0) return "Add at least one product.";
  const seen = new Set<ID>();
  for (const l of input.lines) {
    const p = idx.products.get(l.productId);
    if (!p) return "One of the products no longer exists.";
    if (p.status !== "active") return `${p.name} is not active and cannot be ordered.`;
    if (seen.has(l.productId)) return `${p.name} is listed more than once.`;
    seen.add(l.productId);
    if (!Number.isInteger(l.quantity) || l.quantity <= 0) return `Quantity for ${p.name} must be a positive whole number.`;
    if (!(l.unitPrice >= 0)) return `Price for ${p.name} must be zero or more.`;
  }
  if (!input.requiredDate) return "Required date is required.";
  return null;
}

/** Availability check used by the order form (no mutation). */
export function checkOrderAvailability(
  d: WmsData,
  warehouseId: ID,
  lines: { productId: ID; quantity: number }[],
) {
  return lines.map((l) => {
    const available = availableInWarehouse(d, l.productId, warehouseId);
    return { productId: l.productId, requested: l.quantity, available, ok: l.quantity <= available };
  });
}

const buildLines = (d: WmsData, input: OrderInput): OrderLine[] =>
  input.lines.map((l) => ({
    id: newId(d, "sol"),
    productId: l.productId,
    quantity: l.quantity,
    unitPrice: l.unitPrice,
    allocations: [],
  }));

export function createOrder(d: WmsData, ctx: TxContext, input: OrderInput) {
  const err = validate(d, input);
  if (err) return fail(err);
  const order: SalesOrder = {
    id: newId(d, "so"),
    number: numbers.so(d, ctx.now),
    customerId: input.customerId,
    warehouseId: input.warehouseId,
    orderDate: ctx.now,
    requiredDate: input.requiredDate,
    priority: input.priority,
    status: "draft",
    lines: buildLines(d, input),
    notes: input.notes.trim(),
    packing: null,
    shipmentId: null,
    createdBy: ctx.userId,
    events: [],
  };
  order.events.push(makeEvent(d, ctx, "Draft created"));
  d.orders.push(order);
  return ok(order.id);
}

export function updateOrder(d: WmsData, ctx: TxContext, id: ID, input: OrderInput) {
  const o = d.orders.find((x) => x.id === id);
  if (!o) return fail("Order not found.");
  if (o.status !== "draft") return fail("Only draft orders can be edited.");
  const err = validate(d, input);
  if (err) return fail(err);
  o.customerId = input.customerId;
  o.warehouseId = input.warehouseId;
  o.requiredDate = input.requiredDate;
  o.priority = input.priority;
  o.notes = input.notes.trim();
  o.lines = buildLines(d, input);
  o.events.push(makeEvent(d, ctx, "Draft updated"));
  return ok();
}

/** Confirms the order: validates availability, reserves stock and creates picking tasks. */
export function confirmOrder(d: WmsData, ctx: TxContext, id: ID) {
  const o = d.orders.find((x) => x.id === id);
  if (!o) return fail("Order not found.");
  if (o.status !== "draft") return fail("Only draft orders can be confirmed.");
  const err = validate(d, {
    customerId: o.customerId,
    warehouseId: o.warehouseId,
    requiredDate: o.requiredDate,
    priority: o.priority,
    notes: o.notes,
    lines: o.lines,
  });
  if (err) return fail(err);
  const idx = indexData(d);

  const short = o.lines.find((l) => l.quantity > availableInWarehouse(d, l.productId, o.warehouseId));
  if (short) {
    const p = idx.products.get(short.productId);
    const avail = availableInWarehouse(d, short.productId, o.warehouseId);
    return fail(`Insufficient stock for ${p?.name}: ${avail} available, ${short.quantity} requested.`);
  }

  for (const l of o.lines) {
    const plan = planAllocation(d, l.productId, o.warehouseId, l.quantity);
    if (!plan) return fail("Stock could not be reserved.");
    l.allocations = plan;
    for (const a of plan) {
      const rec = findRecord(d, l.productId, a.binId)!;
      rec.reserved += a.quantity;
    }
  }

  o.status = "confirmed";
  o.events.push(makeEvent(d, ctx, "Confirmed", "Stock reserved for this order"));
  const due = o.requiredDate;
  for (const l of o.lines) {
    const product = idx.products.get(l.productId);
    for (const a of l.allocations) {
      createTask(d, ctx, {
        title: `Pick ${a.quantity} × ${product?.name} for ${o.number}`,
        description: `Pick from ${binLabel(d, a.binId)}.`,
        type: "picking",
        priority: o.priority,
        warehouseId: o.warehouseId,
        dueDate: due,
        link: { kind: "order", id: o.id, label: o.number },
        pick: { orderId: o.id, lineId: l.id, productId: l.productId, binId: a.binId, requiredQty: a.quantity, pickedQty: 0 },
        notifyAssignee: false,
      });
    }
  }
  notify(d, ctx, {
    type: "order_ready_for_picking",
    title: `${o.number} ready for picking`,
    message: `${o.lines.length} line(s) reserved at ${idx.warehouses.get(o.warehouseId)?.name}.`,
    href: `/picking-packing?order=${o.id}`,
  });
  return ok();
}

/** Releases reservations and removes the order's open tasks. Eligible until packed. */
export function cancelOrder(d: WmsData, ctx: TxContext, id: ID, reason = "") {
  const o = d.orders.find((x) => x.id === id);
  if (!o) return fail("Order not found.");
  if (!["draft", "confirmed", "picking", "picked"].includes(o.status)) {
    return fail("Only orders that have not been packed or dispatched can be cancelled.");
  }
  if (o.status !== "draft") {
    for (const l of o.lines) {
      for (const a of l.allocations) {
        const rec = findRecord(d, l.productId, a.binId);
        if (rec) rec.reserved = Math.max(0, rec.reserved - a.quantity);
      }
      l.allocations = [];
    }
    d.tasks = d.tasks.filter((t) => !(t.link?.kind === "order" && t.link.id === o.id && t.status !== "completed"));
  }
  o.status = "cancelled";
  o.events.push(makeEvent(d, ctx, "Cancelled", reason || undefined));
  return ok();
}

/** Marks a pick task as started (assigns the order status "picking"). */
export function startPicking(d: WmsData, ctx: TxContext, taskId: ID) {
  const task = d.tasks.find((t) => t.id === taskId);
  if (!task?.pick) return fail("Picking task not found.");
  if (task.status === "completed") return fail("This pick is already complete.");
  const o = d.orders.find((x) => x.id === task.pick!.orderId);
  if (!o) return fail("Order not found.");
  task.status = "in_progress";
  if (o.status === "confirmed") {
    o.status = "picking";
    o.events.push(makeEvent(d, ctx, "Picking started"));
  }
  return ok();
}

/**
 * Confirms a pick. The picked quantity must equal the required quantity exactly
 * (no over- or short-picks). When every pick of the order is done the order
 * becomes "picked" and a packing task is created.
 */
export function confirmPick(
  d: WmsData,
  ctx: TxContext,
  input: { taskId: ID; pickedQty: number },
) {
  const task = d.tasks.find((t) => t.id === input.taskId);
  if (!task?.pick) return fail("Picking task not found.");
  if (task.status === "completed") return fail("This pick is already complete.");
  const pick = task.pick;
  const o = d.orders.find((x) => x.id === pick.orderId);
  if (!o) return fail("Order not found.");
  if (o.status !== "confirmed" && o.status !== "picking") return fail("This order is not in a pickable state.");
  if (!Number.isInteger(input.pickedQty) || input.pickedQty < 0) return fail("Picked quantity must be a whole number.");
  if (input.pickedQty !== pick.requiredQty) {
    return fail(
      input.pickedQty > pick.requiredQty
        ? `Over-pick: this task requires exactly ${pick.requiredQty}.`
        : `Short pick: ${pick.requiredQty - input.pickedQty} more unit(s) are required. Report a shortage instead.`,
    );
  }
  const line = o.lines.find((l) => l.id === pick.lineId);
  const alloc = line?.allocations.find((a) => a.binId === pick.binId);
  if (!line || !alloc) return fail("The reservation for this pick no longer exists.");
  alloc.pickedQty = input.pickedQty;
  pick.pickedQty = input.pickedQty;
  completeTask(d, ctx, task.id);
  if (o.status === "confirmed") {
    o.status = "picking";
    o.events.push(makeEvent(d, ctx, "Picking started"));
  }
  const allPicked = o.lines.every((l) => l.allocations.every((a) => a.pickedQty >= a.quantity));
  if (allPicked) {
    o.status = "picked";
    o.events.push(makeEvent(d, ctx, "All items picked"));
    createTask(d, ctx, {
      title: `Pack ${o.number}`,
      description: "Verify picked items, choose packaging and generate the packing slip.",
      type: "packing",
      priority: o.priority,
      warehouseId: o.warehouseId,
      dueDate: o.requiredDate,
      link: { kind: "order", id: o.id, label: o.number },
      notifyAssignee: false,
    });
  }
  return ok(allPicked);
}

export interface PackInput {
  orderId: ID;
  packagingType: string;
  packageCount: number;
  weightKg: number;
  notes: string;
}

export function packOrder(d: WmsData, ctx: TxContext, input: PackInput) {
  const o = d.orders.find((x) => x.id === input.orderId);
  if (!o) return fail("Order not found.");
  if (o.status !== "picked") return fail("Only fully picked orders can be packed.");
  if (!input.packagingType) return fail("Select a packaging type.");
  if (!Number.isInteger(input.packageCount) || input.packageCount <= 0) return fail("Package count must be at least 1.");
  if (!(input.weightKg > 0)) return fail("Enter the package weight.");
  o.packing = {
    packagingType: input.packagingType,
    packageCount: input.packageCount,
    weightKg: input.weightKg,
    slipNumber: numbers.slip(d),
    packedAt: ctx.now,
    packedBy: ctx.userId,
    notes: input.notes.trim(),
  };
  o.status = "packed";
  o.events.push(makeEvent(d, ctx, "Packed", `${input.packageCount} × ${input.packagingType}, ${input.weightKg} kg · slip ${o.packing.slipNumber}`));
  for (const t of d.tasks) {
    if (t.type === "packing" && t.link?.kind === "order" && t.link.id === o.id) completeTask(d, ctx, t.id);
  }
  return ok(o.packing.slipNumber);
}
