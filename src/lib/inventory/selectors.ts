import type {
  Bin,
  ID,
  Product,
  StockRecord,
  Warehouse,
  WmsData,
} from "@/types";

/* ------------------------------------------------------------------ indexes */

export interface DataIndex {
  products: Map<ID, Product>;
  warehouses: Map<ID, Warehouse>;
  bins: Map<ID, Bin>;
  users: Map<ID, WmsData["users"][number]>;
  suppliers: Map<ID, WmsData["suppliers"][number]>;
  customers: Map<ID, WmsData["customers"][number]>;
  zones: Map<ID, WmsData["zones"][number]>;
  racks: Map<ID, WmsData["racks"][number]>;
}

const indexCache = new WeakMap<WmsData, { sig: string; idx: DataIndex }>();

const signature = (d: WmsData) =>
  [
    d.products.length,
    d.warehouses.length,
    d.bins.length,
    d.users.length,
    d.suppliers.length,
    d.customers.length,
    d.zones.length,
    d.racks.length,
  ].join(".");

/**
 * Cheap id lookups, cached per data snapshot (rebuilt if a mutable draft gained
 * entities since the last call). Snapshots in the store are immutable.
 */
export function indexData(data: WmsData): DataIndex {
  const sig = signature(data);
  const cached = indexCache.get(data);
  if (cached && cached.sig === sig) return cached.idx;
  const toMap = <T extends { id: ID }>(rows: T[]) => new Map(rows.map((r) => [r.id, r]));
  const idx: DataIndex = {
    products: toMap(data.products),
    warehouses: toMap(data.warehouses),
    bins: toMap(data.bins),
    users: toMap(data.users),
    suppliers: toMap(data.suppliers),
    customers: toMap(data.customers),
    zones: toMap(data.zones),
    racks: toMap(data.racks),
  };
  indexCache.set(data, { sig, idx });
  return idx;
}

/* ------------------------------------------------------------ stock summary */

export type WarehouseScope = ID | "all";

export interface StockSummary {
  /** physical units in pickable (storage) bins */
  onHand: number;
  reserved: number;
  blocked: number;
  /** pickable on-hand minus reserved minus blocked (never negative) */
  available: number;
  /** received goods waiting for putaway (not pickable) */
  staging: number;
  /** returned goods waiting for inspection (not pickable) */
  returns: number;
  /** every physical unit, in any bin (onHand + staging + returns) */
  physical: number;
}

export const EMPTY_SUMMARY: StockSummary = {
  onHand: 0,
  reserved: 0,
  blocked: 0,
  available: 0,
  staging: 0,
  returns: 0,
  physical: 0,
};

export function summarizeRecords(
  records: StockRecord[],
  bins: Map<ID, Bin>,
): StockSummary {
  const s = { ...EMPTY_SUMMARY };
  let available = 0;
  for (const r of records) {
    const bin = bins.get(r.binId);
    if (!bin) continue;
    s.physical += r.onHand;
    if (bin.type === "storage") {
      s.onHand += r.onHand;
      s.reserved += r.reserved;
      s.blocked += r.blocked;
      available += Math.max(0, r.onHand - r.reserved - r.blocked);
    } else if (bin.type === "staging") {
      s.staging += r.onHand;
    } else {
      s.returns += r.onHand;
    }
  }
  s.available = available;
  return s;
}

export function stockRecordAvailable(r: StockRecord, bin: Bin | undefined): number {
  if (!bin || bin.type !== "storage") return 0;
  return Math.max(0, r.onHand - r.reserved - r.blocked);
}

export function productStock(
  data: WmsData,
  productId: ID,
  scope: WarehouseScope = "all",
): StockSummary {
  const { bins } = indexData(data);
  const rows = data.stock.filter(
    (r) => r.productId === productId && (scope === "all" || r.warehouseId === scope),
  );
  return summarizeRecords(rows, bins);
}

export function warehouseStock(data: WmsData, scope: WarehouseScope = "all"): StockSummary {
  const { bins } = indexData(data);
  const rows = scope === "all" ? data.stock : data.stock.filter((r) => r.warehouseId === scope);
  return summarizeRecords(rows, bins);
}

/** Pickable quantity of a product in one warehouse (what an order/transfer may consume). */
export function availableInWarehouse(data: WmsData, productId: ID, warehouseId: ID): number {
  return productStock(data, productId, warehouseId).available;
}

/* -------------------------------------------------------------- stock status */

export type StockStatus = "in_stock" | "low_stock" | "out_of_stock" | "reserved" | "blocked";

/**
 * Status of a product within a scope.
 *  out_of_stock : nothing pickable on hand
 *  blocked      : nothing available because the remainder is quarantined
 *  reserved     : nothing available because the remainder is reserved
 *  low_stock    : available <= reorderLevel * factor
 *  in_stock     : otherwise
 */
export function getStockStatus(
  s: StockSummary,
  reorderLevel: number,
  factor = 1,
): StockStatus {
  if (s.onHand <= 0) return "out_of_stock";
  if (s.available <= 0) {
    if (s.blocked > 0 && s.reserved === 0) return "blocked";
    return "reserved";
  }
  if (s.available <= Math.round(reorderLevel * factor)) return "low_stock";
  return "in_stock";
}

export function productStockStatus(
  data: WmsData,
  product: Product,
  scope: WarehouseScope = "all",
  factor = 1,
): StockStatus {
  return getStockStatus(productStock(data, product.id, scope), product.reorderLevel, factor);
}

/** Products (non-archived, active) that are low or out of stock in a scope. */
export function lowStockProducts(
  data: WmsData,
  scope: WarehouseScope = "all",
  factor = 1,
): { product: Product; summary: StockSummary; status: StockStatus }[] {
  const out: { product: Product; summary: StockSummary; status: StockStatus }[] = [];
  for (const product of data.products) {
    if (product.status !== "active") continue;
    const summary = productStock(data, product.id, scope);
    const status = getStockStatus(summary, product.reorderLevel, factor);
    if (status === "low_stock" || status === "out_of_stock") {
      out.push({ product, summary, status });
    }
  }
  return out.sort((a, b) => a.summary.available - b.summary.available);
}

/** Overstocked: available above `multiple` x reorder level. */
export function overstockedProducts(data: WmsData, scope: WarehouseScope = "all", multiple = 8) {
  const out: { product: Product; summary: StockSummary }[] = [];
  for (const product of data.products) {
    if (product.status !== "active" || product.reorderLevel <= 0) continue;
    const summary = productStock(data, product.id, scope);
    if (summary.available > product.reorderLevel * multiple) out.push({ product, summary });
  }
  return out.sort(
    (a, b) => b.summary.available / b.product.reorderLevel - a.summary.available / a.product.reorderLevel,
  );
}

/* ---------------------------------------------------------------- inventory value */

export function inventoryValue(data: WmsData, scope: WarehouseScope = "all"): number {
  const { products } = indexData(data);
  let total = 0;
  for (const r of data.stock) {
    if (scope !== "all" && r.warehouseId !== scope) continue;
    const p = products.get(r.productId);
    if (p) total += r.onHand * p.unitCost;
  }
  return total;
}

/* ---------------------------------------------------------------- in transit */

/** Units dispatched on inter-warehouse transfers that are not yet received. */
export function inTransitQty(
  data: WmsData,
  filter: { productId?: ID; toWarehouseId?: ID; fromWarehouseId?: ID } = {},
): number {
  let total = 0;
  for (const t of data.transfers) {
    if (t.status !== "in_transit") continue;
    if (filter.toWarehouseId && t.toWarehouseId !== filter.toWarehouseId) continue;
    if (filter.fromWarehouseId && t.fromWarehouseId !== filter.fromWarehouseId) continue;
    for (const l of t.lines) {
      if (filter.productId && l.productId !== filter.productId) continue;
      total += l.dispatchedQty - l.receivedQty;
    }
  }
  return total;
}

/* ------------------------------------------------------------------ bins */

export function binUsed(data: WmsData, binId: ID): number {
  let used = 0;
  for (const r of data.stock) if (r.binId === binId) used += r.onHand;
  return used;
}

export function binFree(data: WmsData, binId: ID): number {
  const bin = indexData(data).bins.get(binId);
  if (!bin) return 0;
  return Math.max(0, bin.capacity - binUsed(data, binId));
}

export function warehouseCapacity(data: WmsData, warehouseId: ID) {
  const bins = data.bins.filter((b) => b.warehouseId === warehouseId && b.type === "storage");
  const ids = new Set(bins.map((b) => b.id));
  const capacity = bins.reduce((s, b) => s + b.capacity, 0);
  const used = data.stock.reduce((s, r) => (ids.has(r.binId) ? s + r.onHand : s), 0);
  return {
    capacity,
    used,
    free: Math.max(0, capacity - used),
    utilization: capacity > 0 ? Math.min(100, Math.round((used / capacity) * 100)) : 0,
    binCount: bins.length,
  };
}

/** Overall utilization across the given scope (0-100). */
export function utilization(data: WmsData, scope: WarehouseScope = "all"): number {
  const ids = scope === "all" ? data.warehouses.map((w) => w.id) : [scope];
  let cap = 0;
  let used = 0;
  for (const id of ids) {
    const c = warehouseCapacity(data, id);
    cap += c.capacity;
    used += c.used;
  }
  return cap > 0 ? Math.min(100, Math.round((used / cap) * 100)) : 0;
}

/** The staging bin of a warehouse (where received goods land). */
export function stagingBinFor(data: WmsData, warehouseId: ID): Bin | undefined {
  return data.bins.find((b) => b.warehouseId === warehouseId && b.type === "staging");
}

export function returnsBinFor(data: WmsData, warehouseId: ID): Bin | undefined {
  return data.bins.find((b) => b.warehouseId === warehouseId && b.type === "returns");
}

export function storageBinsFor(data: WmsData, warehouseId: ID): Bin[] {
  return data.bins.filter((b) => b.warehouseId === warehouseId && b.type === "storage");
}

/* ------------------------------------------------------------- integrity */

/**
 * Verifies the invariant "movement history matches inventory": for every
 * (product, warehouse) the sum of movement on-hand deltas equals the physical
 * on-hand across all bins. Returns a list of discrepancies (empty = consistent).
 */
export function reconcileMovements(data: WmsData) {
  const bal = new Map<string, number>();
  const key = (p: ID, w: ID) => `${p}|${w}`;
  for (const m of data.movements) {
    bal.set(key(m.productId, m.warehouseId), (bal.get(key(m.productId, m.warehouseId)) ?? 0) + m.onHandDelta);
  }
  const phys = new Map<string, number>();
  for (const r of data.stock) {
    phys.set(key(r.productId, r.warehouseId), (phys.get(key(r.productId, r.warehouseId)) ?? 0) + r.onHand);
  }
  const keys = new Set([...bal.keys(), ...phys.keys()]);
  const issues: { productId: ID; warehouseId: ID; movements: number; onHand: number }[] = [];
  for (const k of keys) {
    const a = bal.get(k) ?? 0;
    const b = phys.get(k) ?? 0;
    if (a !== b) {
      const [productId, warehouseId] = k.split("|");
      issues.push({ productId, warehouseId, movements: a, onHand: b });
    }
  }
  return issues;
}

/** Reserved totals must match open order allocations. Returns discrepancies. */
export function reconcileReservations(data: WmsData) {
  const expected = new Map<ID, number>(); // `${productId}|${binId}` -> qty
  const open = new Set(["confirmed", "picking", "picked", "packed"]);
  for (const o of data.orders) {
    if (!open.has(o.status)) continue;
    for (const l of o.lines) {
      for (const a of l.allocations) {
        const k = `${l.productId}|${a.binId}`;
        expected.set(k, (expected.get(k) ?? 0) + a.quantity);
      }
    }
  }
  const issues: { productId: ID; binId: ID; reserved: number; expected: number }[] = [];
  const seen = new Set<string>();
  for (const r of data.stock) {
    const k = `${r.productId}|${r.binId}`;
    seen.add(k);
    const e = expected.get(k) ?? 0;
    if (r.reserved !== e) issues.push({ productId: r.productId, binId: r.binId, reserved: r.reserved, expected: e });
  }
  for (const [k, e] of expected) {
    if (!seen.has(k)) {
      const [productId, binId] = k.split("|");
      issues.push({ productId, binId, reserved: 0, expected: e });
    }
  }
  return issues;
}
