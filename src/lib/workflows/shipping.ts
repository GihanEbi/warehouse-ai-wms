import type { ID, Shipment, ShipmentStatus, WmsData } from "@/types";
import {
  binLabel,
  checkLowStock,
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
import { indexData } from "@/lib/inventory/selectors";

export function generateTrackingNumber(d: WmsData, carrier: string): string {
  const prefix = carrier
    .split(" ")
    .map((w) => w[0])
    .join("")
    .toUpperCase();
  return `${prefix}${String(100000 + d.counters.shp * 7919 + d.shipments.length * 31).padStart(8, "0")}LK`;
}

export interface ShipmentInput {
  orderId: ID;
  carrier: string;
  method: string;
  trackingNumber: string;
  dispatchDate: string; // planned, ISO
  estimatedDelivery: string; // ISO
}

export function createShipment(d: WmsData, ctx: TxContext, input: ShipmentInput) {
  const o = d.orders.find((x) => x.id === input.orderId);
  if (!o) return fail("Order not found.");
  if (o.status !== "packed") return fail("Only packed orders can be shipped.");
  if (o.shipmentId) return fail("A shipment already exists for this order.");
  if (!input.carrier || !input.method) return fail("Select a carrier and shipping method.");
  if (!input.trackingNumber.trim()) return fail("Tracking number is required.");
  if (d.shipments.some((s) => s.trackingNumber === input.trackingNumber.trim())) return fail("That tracking number is already in use.");
  const shipment: Shipment = {
    id: newId(d, "shp"),
    number: numbers.shp(d),
    orderId: o.id,
    warehouseId: o.warehouseId,
    carrier: input.carrier,
    method: input.method,
    trackingNumber: input.trackingNumber.trim(),
    status: "ready_to_ship",
    dispatchDate: input.dispatchDate,
    estimatedDelivery: input.estimatedDelivery,
    deliveredAt: null,
    createdAt: ctx.now,
    createdBy: ctx.userId,
    events: [],
  };
  shipment.events.push(makeEvent(d, ctx, "Shipment created", `${input.carrier} · ${input.method}`));
  d.shipments.push(shipment);
  o.shipmentId = shipment.id;
  o.events.push(makeEvent(d, ctx, "Shipment created", shipment.number));
  return ok(shipment.id);
}

/**
 * Confirms dispatch: reduces physical stock, releases the reservation, writes
 * dispatch movements and marks the order dispatched.
 */
export function confirmDispatch(d: WmsData, ctx: TxContext, shipmentId: ID) {
  const s = d.shipments.find((x) => x.id === shipmentId);
  if (!s) return fail("Shipment not found.");
  if (s.status !== "ready_to_ship") return fail("This shipment has already been dispatched.");
  const o = d.orders.find((x) => x.id === s.orderId);
  if (!o) return fail("Order not found.");
  if (o.status !== "packed") return fail("The order must be packed before dispatch.");
  const idx = indexData(d);
  const customer = idx.customers.get(o.customerId);

  for (const l of o.lines) {
    for (const a of l.allocations) {
      const r = removeFromBin(d, l.productId, a.binId, a.quantity, { releaseReservation: true });
      if (!r.ok) return fail(`Cannot dispatch ${idx.products.get(l.productId)?.name}: ${r.error}`);
      recordMovement(d, ctx, {
        productId: l.productId,
        warehouseId: o.warehouseId,
        type: "dispatch",
        quantity: a.quantity,
        onHandDelta: -a.quantity,
        fromLabel: binLabel(d, a.binId),
        toLabel: `Customer: ${customer?.name ?? "—"}`,
        fromBinId: a.binId,
        source: { kind: "order", id: o.id, number: o.number },
        note: `Shipped via ${s.carrier} (${s.trackingNumber})`,
      });
    }
    checkLowStock(d, ctx, l.productId, o.warehouseId);
  }
  o.status = "dispatched";
  o.events.push(makeEvent(d, ctx, "Dispatched", `${s.carrier} · ${s.trackingNumber}`));
  s.status = "dispatched";
  s.dispatchDate = ctx.now;
  s.events.push(makeEvent(d, ctx, "Dispatched"));
  notify(d, ctx, {
    type: "order_dispatched",
    title: `${o.number} dispatched`,
    message: `Shipped to ${customer?.name ?? "customer"} via ${s.carrier}.`,
    href: `/shipping/${s.id}`,
  });
  return ok();
}

export function advanceShipment(d: WmsData, ctx: TxContext, shipmentId: ID, next: Extract<ShipmentStatus, "in_transit" | "delivered">) {
  const s = d.shipments.find((x) => x.id === shipmentId);
  if (!s) return fail("Shipment not found.");
  const allowed: Record<string, ShipmentStatus> = { dispatched: "in_transit", in_transit: "delivered" };
  if (allowed[s.status] !== next) return fail(`A ${s.status.replace("_", " ")} shipment cannot move to ${next.replace("_", " ")}.`);
  s.status = next;
  if (next === "delivered") s.deliveredAt = ctx.now;
  s.events.push(makeEvent(d, ctx, next === "in_transit" ? "In transit" : "Delivered"));
  return ok();
}
