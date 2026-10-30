import type { Bin, ID, Product, StockMovement, StockRecord, Warehouse, WmsData } from "@/types";
import {
  getStockStatus,
  indexData,
  productStock,
  stockRecordAvailable,
  type StockStatus,
  type WarehouseScope,
} from "@/lib/inventory/selectors";
import { MOVEMENT_LABELS } from "./movement-badge";

/** One row of the inventory table = a product in a bin (or a depleted product/warehouse placeholder). */
export interface StockRow {
  id: string;
  product: Product;
  warehouse: Warehouse;
  /** null for "depleted" placeholder rows (stocked before, nothing left) */
  bin: Bin | null;
  record: StockRecord | null;
  onHand: number;
  reserved: number;
  blocked: number;
  /** pickable quantity (0 for staging / returns bins) */
  available: number;
  /** status of the product's aggregate in this warehouse (same rule as the dashboard) */
  status: StockStatus;
}

export type StockStatusFilter = "all" | "attention" | StockStatus;

export function buildStockRows(data: WmsData, scope: WarehouseScope, lowStockFactor: number): StockRow[] {
  const idx = indexData(data);
  const aggCache = new Map<string, StockStatus>();
  const statusOf = (p: Product, wid: ID): StockStatus => {
    const k = `${p.id}|${wid}`;
    let s = aggCache.get(k);
    if (!s) {
      s = getStockStatus(productStock(data, p.id, wid), p.reorderLevel, lowStockFactor);
      aggCache.set(k, s);
    }
    return s;
  };
  const rows: StockRow[] = [];
  const withStock = new Set<string>();
  const anyRecord = new Set<string>();
  for (const r of data.stock) {
    if (scope !== "all" && r.warehouseId !== scope) continue;
    const product = idx.products.get(r.productId);
    const warehouse = idx.warehouses.get(r.warehouseId);
    const bin = idx.bins.get(r.binId);
    if (!product || !warehouse || !bin || product.status === "archived") continue;
    anyRecord.add(`${r.productId}|${r.warehouseId}`);
    if (r.onHand <= 0 && r.reserved <= 0 && r.blocked <= 0) continue;
    withStock.add(`${r.productId}|${r.warehouseId}`);
    rows.push({
      id: r.id,
      product,
      warehouse,
      bin,
      record: r,
      onHand: r.onHand,
      reserved: r.reserved,
      blocked: r.blocked,
      available: stockRecordAvailable(r, bin),
      status: statusOf(product, r.warehouseId),
    });
  }
  // depleted combinations still show up so "out of stock" is visible and filterable
  for (const k of anyRecord) {
    if (withStock.has(k)) continue;
    const [pid, wid] = k.split("|");
    const product = idx.products.get(pid);
    const warehouse = idx.warehouses.get(wid);
    if (!product || !warehouse || product.status !== "active") continue;
    rows.push({
      id: `empty-${k}`,
      product,
      warehouse,
      bin: null,
      record: null,
      onHand: 0,
      reserved: 0,
      blocked: 0,
      available: 0,
      status: statusOf(product, wid),
    });
  }
  return rows;
}

export interface StockFilters {
  q: string;
  category: string;
  status: StockStatusFilter;
  includeStaging: boolean;
  productId?: ID | "";
}

export function filterStockRows(rows: StockRow[], f: StockFilters): StockRow[] {
  const term = f.q.trim().toLowerCase();
  return rows.filter((r) => {
    if (f.productId && r.product.id !== f.productId) return false;
    if (!f.includeStaging && r.bin && r.bin.type !== "storage") return false;
    if (f.category !== "all" && r.product.category !== f.category) return false;
    if (f.status === "attention" ? r.status !== "low_stock" && r.status !== "out_of_stock" : f.status !== "all" && r.status !== f.status) return false;
    if (term) {
      const hay = `${r.product.name} ${r.product.sku} ${r.bin?.code ?? ""}`.toLowerCase();
      if (!hay.includes(term)) return false;
    }
    return true;
  });
}

/* ---------------------------------------------------------------- movements */

export interface MovementFilters {
  q: string;
  type: string;
  warehouse: WarehouseScope;
  productId?: ID | "";
}

export function filterMovements(data: WmsData, f: MovementFilters): StockMovement[] {
  const idx = indexData(data);
  const term = f.q.trim().toLowerCase();
  return data.movements
    .filter((m) => {
      if (f.productId && m.productId !== f.productId) return false;
      if (f.warehouse !== "all" && m.warehouseId !== f.warehouse) return false;
      if (f.type !== "all" && m.type !== f.type) return false;
      if (term) {
        const p = idx.products.get(m.productId);
        const hay = `${m.reference} ${p?.name ?? ""} ${p?.sku ?? ""} ${m.source?.number ?? ""} ${m.fromLabel} ${m.toLabel} ${MOVEMENT_LABELS[m.type]}`.toLowerCase();
        if (!hay.includes(term)) return false;
      }
      return true;
    })
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt) || b.reference.localeCompare(a.reference));
}
