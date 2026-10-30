/**
 * Sanity-checks the generated seed: run with `npm run check:seed`.
 * Verifies counts, warnings from the history replay and the stock invariants.
 */
import { generateSeed, seedWarnings } from "../src/data/mock/seed";
import {
  inventoryValue,
  lowStockProducts,
  reconcileMovements,
  reconcileReservations,
  utilization,
  warehouseStock,
  warehouseCapacity,
} from "../src/lib/inventory/selectors";

const d = generateSeed(new Date());
const byStatus = <T extends { status: string }>(rows: T[]) =>
  rows.reduce<Record<string, number>>((m, r) => ((m[r.status] = (m[r.status] ?? 0) + 1), m), {});

console.log("warnings:", seedWarnings.length);
seedWarnings.slice(0, 25).forEach((w) => console.log("  -", w));
console.log({
  warehouses: d.warehouses.length,
  zones: d.zones.length,
  bins: d.bins.length,
  products: d.products.length,
  stockRecords: d.stock.length,
  movements: d.movements.length,
  suppliers: d.suppliers.length,
  customers: d.customers.length,
  users: d.users.length,
  purchaseOrders: d.purchaseOrders.length,
  receipts: d.receipts.length,
  transfers: d.transfers.length,
  orders: d.orders.length,
  shipments: d.shipments.length,
  returns: d.returns.length,
  tasks: d.tasks.length,
  notifications: d.notifications.length,
});
console.log("PO", byStatus(d.purchaseOrders));
console.log("receipts", byStatus(d.receipts));
console.log("transfers", byStatus(d.transfers));
console.log("orders", byStatus(d.orders));
console.log("shipments", byStatus(d.shipments));
console.log("returns", byStatus(d.returns));
console.log("tasks", byStatus(d.tasks));
console.log("unread notifications", d.notifications.filter((n) => !n.read).length);

const mov = reconcileMovements(d);
const res = reconcileReservations(d);
console.log("movement/onHand mismatches:", mov.length, mov.slice(0, 5));
console.log("reservation mismatches:", res.length, res.slice(0, 5));
console.log("negative stock records:", d.stock.filter((r) => r.onHand < 0 || r.reserved < 0 || r.blocked < 0 || r.reserved + r.blocked > r.onHand).length);
console.log("sku unique:", new Set(d.products.map((p) => p.sku)).size === d.products.length);
const all = warehouseStock(d, "all");
console.log("totals", all, "value", Math.round(inventoryValue(d)), "util", utilization(d));
d.warehouses.forEach((w) => console.log(w.code, warehouseCapacity(d, w.id)));
const low = lowStockProducts(d, "all");
console.log("low/out:", low.map((l) => `${l.product.name} [${l.status}] avail=${l.summary.available}`));
const over = (d.bins.filter((b) => b.type === "storage").filter((b) => d.stock.filter((r) => r.binId === b.id).reduce((s, r) => s + r.onHand, 0) > b.capacity)).length;
console.log("bins over capacity:", over);
process.exit(mov.length || res.length ? 1 : 0);
