/**
 * Low-level mutation primitives. They all operate on a *draft* copy of WmsData
 * (the store clones the state before running a transaction and only commits
 * the draft when the transaction returns `ok`). Never call these from UI.
 */
import type {
  ActivityEvent,
  AppNotification,
  AppSettings,
  CounterKey,
  ID,
  MovementType,
  NotificationType,
  OrderAllocation,
  StockMovement,
  StockRecord,
  TaskLink,
  TaskStatus,
  TaskType,
  Priority,
  WarehouseTask,
  WmsData,
  Result,
} from "@/types";
import {
  getStockStatus,
  indexData,
  productStock,
  stockRecordAvailable,
} from "./selectors";

export interface TxContext {
  userId: ID;
  now: string; // ISO timestamp
  settings: Pick<
    AppSettings,
    "lowStockThresholdFactor" | "notificationPrefs" | "adjustmentReasonRequired" | "largeAdjustmentThreshold"
  >;
}

export const ok = <T = void>(value?: T): Result<T> => ({ ok: true, value: value as T });
export const fail = (error: string): Result<never> => ({ ok: false, error });

/* --------------------------------------------------------------- numbering */

export function nextCounter(draft: WmsData, key: CounterKey): number {
  draft.counters[key] = (draft.counters[key] ?? 0) + 1;
  return draft.counters[key];
}

export function newId(draft: WmsData, prefix: string): ID {
  return `${prefix}_${nextCounter(draft, "id").toString(36).padStart(4, "0")}`;
}

const pad = (n: number, w: number) => String(n).padStart(w, "0");

export const numbers = {
  po: (d: WmsData, now: string) => `PO-${now.slice(0, 4)}-${pad(nextCounter(d, "po"), 4)}`,
  grn: (d: WmsData) => `GRN-${pad(nextCounter(d, "grn"), 6)}`,
  so: (d: WmsData, now: string) => `SO-${now.slice(0, 4)}-${pad(nextCounter(d, "so"), 4)}`,
  trf: (d: WmsData) => `TRF-${pad(nextCounter(d, "trf"), 4)}`,
  rma: (d: WmsData) => `RMA-${pad(nextCounter(d, "rma"), 4)}`,
  shp: (d: WmsData) => `SHP-${pad(nextCounter(d, "shp"), 4)}`,
  tsk: (d: WmsData) => `TSK-${pad(nextCounter(d, "tsk"), 4)}`,
  slip: (d: WmsData) => `PS-${pad(nextCounter(d, "slip"), 6)}`,
  mov: (d: WmsData) => `MV-${pad(nextCounter(d, "mov"), 6)}`,
};

export function makeEvent(
  draft: WmsData,
  ctx: TxContext,
  title: string,
  detail?: string,
): ActivityEvent {
  return { id: newId(draft, "evt"), at: ctx.now, by: ctx.userId, title, detail };
}

/* ------------------------------------------------------------------ stock */

export function findRecord(draft: WmsData, productId: ID, binId: ID): StockRecord | undefined {
  return draft.stock.find((r) => r.productId === productId && r.binId === binId);
}

function getOrCreateRecord(draft: WmsData, productId: ID, binId: ID): StockRecord {
  let rec = findRecord(draft, productId, binId);
  if (!rec) {
    const bin = indexData(draft).bins.get(binId);
    if (!bin) throw new Error(`Unknown bin ${binId}`);
    rec = {
      id: newId(draft, "stk"),
      productId,
      warehouseId: bin.warehouseId,
      binId,
      onHand: 0,
      reserved: 0,
      blocked: 0,
    };
    draft.stock.push(rec);
  }
  return rec;
}

/** Capacity left in a bin right now (draft state). */
export function binFreeSpace(draft: WmsData, binId: ID): number {
  const bin = indexData(draft).bins.get(binId);
  if (!bin) return 0;
  let used = 0;
  for (const r of draft.stock) if (r.binId === binId) used += r.onHand;
  return Math.max(0, bin.capacity - used);
}

/** Adds physical units to a bin. Caller records the movement. */
export function addToBin(draft: WmsData, productId: ID, binId: ID, qty: number): void {
  const rec = getOrCreateRecord(draft, productId, binId);
  rec.onHand += qty;
}

/**
 * Removes physical units from a bin. Refuses to cut into reserved/blocked units
 * unless `releaseReservation` is set (dispatch consumes its own reservation).
 */
export function removeFromBin(
  draft: WmsData,
  productId: ID,
  binId: ID,
  qty: number,
  opts: { releaseReservation?: boolean } = {},
): Result {
  const rec = findRecord(draft, productId, binId);
  if (!rec || rec.onHand < qty) return fail("Not enough stock in that location.");
  const bin = indexData(draft).bins.get(binId);
  if (bin?.type === "storage") {
    const free = opts.releaseReservation
      ? rec.onHand - rec.blocked
      : rec.onHand - rec.reserved - rec.blocked;
    if (free < qty) return fail("That quantity is reserved or blocked and cannot be removed.");
  }
  rec.onHand -= qty;
  if (opts.releaseReservation) rec.reserved = Math.max(0, rec.reserved - qty);
  return ok();
}

export interface MovementInput {
  productId: ID;
  warehouseId: ID;
  type: MovementType;
  quantity: number;
  onHandDelta: number;
  fromLabel: string;
  toLabel: string;
  fromBinId?: ID | null;
  toBinId?: ID | null;
  source?: StockMovement["source"];
  note?: string;
}

export function recordMovement(draft: WmsData, ctx: TxContext, m: MovementInput): StockMovement {
  const movement: StockMovement = {
    id: newId(draft, "mov"),
    reference: numbers.mov(draft),
    productId: m.productId,
    warehouseId: m.warehouseId,
    type: m.type,
    quantity: m.quantity,
    onHandDelta: m.onHandDelta,
    fromLabel: m.fromLabel,
    toLabel: m.toLabel,
    fromBinId: m.fromBinId ?? null,
    toBinId: m.toBinId ?? null,
    source: m.source ?? null,
    note: m.note ?? "",
    performedBy: ctx.userId,
    createdAt: ctx.now,
  };
  draft.movements.push(movement);
  return movement;
}

/**
 * Chooses storage bins to cover `qty` of a product in a warehouse
 * (largest available bin first, to keep picks consolidated).
 * Returns null when pickable availability is insufficient.
 */
export function planAllocation(
  draft: WmsData,
  productId: ID,
  warehouseId: ID,
  qty: number,
): OrderAllocation[] | null {
  const { bins } = indexData(draft);
  const candidates = draft.stock
    .filter((r) => r.productId === productId && r.warehouseId === warehouseId)
    .map((r) => ({ rec: r, avail: stockRecordAvailable(r, bins.get(r.binId)) }))
    .filter((c) => c.avail > 0)
    .sort((a, b) => b.avail - a.avail);
  const total = candidates.reduce((s, c) => s + c.avail, 0);
  if (total < qty) return null;
  const out: OrderAllocation[] = [];
  let remaining = qty;
  for (const c of candidates) {
    if (remaining <= 0) break;
    const take = Math.min(c.avail, remaining);
    out.push({ binId: c.rec.binId, quantity: take, pickedQty: 0 });
    remaining -= take;
  }
  return out;
}

/* ----------------------------------------------------------- notifications */

export function notify(
  draft: WmsData,
  ctx: TxContext,
  n: { type: NotificationType; title: string; message: string; href?: string | null },
): AppNotification | null {
  if (ctx.settings.notificationPrefs[n.type] === false) return null;
  const notification: AppNotification = {
    id: newId(draft, "ntf"),
    type: n.type,
    title: n.title,
    message: n.message,
    createdAt: ctx.now,
    read: false,
    href: n.href ?? null,
  };
  draft.notifications.unshift(notification);
  return notification;
}

/** Emits a low-stock notification when a product crosses below its reorder level. */
export function checkLowStock(draft: WmsData, ctx: TxContext, productId: ID, warehouseId: ID): void {
  const idx = indexData(draft);
  const product = idx.products.get(productId);
  if (!product || product.status !== "active") return;
  const summary = productStock(draft, productId, warehouseId);
  const status = getStockStatus(summary, product.reorderLevel, ctx.settings.lowStockThresholdFactor);
  if (status !== "low_stock" && status !== "out_of_stock") return;
  const wh = idx.warehouses.get(warehouseId);
  const href = `/inventory?product=${productId}&warehouse=${warehouseId}`;
  const already = draft.notifications.some(
    (n) => n.type === "low_stock" && !n.read && n.href === href,
  );
  if (already) return;
  notify(draft, ctx, {
    type: "low_stock",
    title: status === "out_of_stock" ? `Out of stock: ${product.name}` : `Low stock: ${product.name}`,
    message: `${summary.available} ${product.uom} available at ${wh?.name ?? "warehouse"} (reorder level ${product.reorderLevel}).`,
    href,
  });
}

/* ------------------------------------------------------------------- tasks */

export function createTask(
  draft: WmsData,
  ctx: TxContext,
  t: {
    title: string;
    description?: string;
    type: TaskType;
    priority?: Priority;
    status?: TaskStatus;
    assigneeId?: ID | null;
    warehouseId: ID;
    dueDate?: string;
    link?: TaskLink | null;
    pick?: WarehouseTask["pick"];
    putaway?: WarehouseTask["putaway"];
    notifyAssignee?: boolean;
  },
): WarehouseTask {
  const due = t.dueDate ?? new Date(new Date(ctx.now).getTime() + 24 * 3600 * 1000).toISOString();
  const assigneeId = t.assigneeId === undefined ? pickAssignee(draft, t.warehouseId, t.type) : t.assigneeId;
  const task: WarehouseTask = {
    id: newId(draft, "tsk"),
    number: numbers.tsk(draft),
    title: t.title,
    description: t.description ?? "",
    type: t.type,
    priority: t.priority ?? "normal",
    status: t.status ?? "pending",
    assigneeId,
    warehouseId: t.warehouseId,
    dueDate: due,
    createdAt: ctx.now,
    createdBy: ctx.userId,
    completedAt: null,
    link: t.link ?? null,
    pick: t.pick,
    putaway: t.putaway,
  };
  draft.tasks.push(task);
  if (t.notifyAssignee !== false && assigneeId) {
    const who = indexData(draft).users.get(assigneeId);
    notify(draft, ctx, {
      type: "task_assigned",
      title: `Task assigned: ${task.title}`,
      message: `${task.number} was assigned to ${who?.name ?? "an employee"}.`,
      href: `/tasks?task=${task.id}`,
    });
  }
  return task;
}

/** Deterministic assignment: next active operator of the warehouse (round-robin by task count). */
export function pickAssignee(draft: WmsData, warehouseId: ID, _type: TaskType): ID | null {
  const pool = draft.users.filter(
    (u) => u.status === "active" && u.role === "operator" && u.warehouseIds.includes(warehouseId),
  );
  if (pool.length === 0) return null;
  const load = (id: ID) => draft.tasks.filter((t) => t.assigneeId === id && t.status !== "completed").length;
  return pool.slice().sort((a, b) => load(a.id) - load(b.id) || a.name.localeCompare(b.name))[0].id;
}

export function completeTask(draft: WmsData, ctx: TxContext, taskId: ID): void {
  const t = draft.tasks.find((x) => x.id === taskId);
  if (t && t.status !== "completed") {
    t.status = "completed";
    t.completedAt = ctx.now;
  }
}

/* ------------------------------------------------------------------ labels */

export function binLabel(draft: WmsData, binId: ID | null | undefined): string {
  if (!binId) return "—";
  return indexData(draft).bins.get(binId)?.code ?? binId;
}
