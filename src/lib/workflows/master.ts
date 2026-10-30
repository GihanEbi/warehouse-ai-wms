import type {
  Customer,
  ID,
  Priority,
  Product,
  ProductStatus,
  Supplier,
  TaskStatus,
  TaskType,
  User,
  Warehouse,
  WarehouseTask,
  WmsData,
  Role,
} from "@/types";
import {
  createTask,
  fail,
  nextCounter,
  newId,
  notify,
  ok,
  type TxContext,
} from "@/lib/inventory/core";
import { indexData } from "@/lib/inventory/selectors";

const norm = (s: string) => s.trim().toLowerCase();

/* -------------------------------------------------------------- warehouses */

export interface WarehouseInput {
  code: string;
  name: string;
  city: string;
  address: string;
  managerId: ID | null;
}

export function createWarehouse(d: WmsData, ctx: TxContext, input: WarehouseInput) {
  const code = input.code.trim().toUpperCase();
  if (d.warehouses.some((w) => w.code === code)) return fail(`Warehouse code ${code} already exists.`);
  const wh: Warehouse = {
    id: newId(d, "wh"),
    code,
    name: input.name.trim(),
    city: input.city.trim(),
    address: input.address.trim(),
    managerId: input.managerId,
    status: "active",
    createdAt: ctx.now,
  };
  d.warehouses.push(wh);
  // Every warehouse gets a receiving (staging) and returns zone, plus one storage zone to start with.
  const rcvZone = newId(d, "zn");
  d.zones.push({ id: rcvZone, warehouseId: wh.id, code: "RCV", name: "Receiving & Staging", kind: "receiving" });
  const rcvRack = newId(d, "rk");
  d.racks.push({ id: rcvRack, warehouseId: wh.id, zoneId: rcvZone, code: "RCV-R1" });
  d.bins.push({
    id: newId(d, "bin"),
    warehouseId: wh.id,
    zoneId: rcvZone,
    rackId: rcvRack,
    code: `${code}-RCV-STG`,
    type: "staging",
    capacity: 20000,
  });
  const rtnZone = newId(d, "zn");
  d.zones.push({ id: rtnZone, warehouseId: wh.id, code: "RTN", name: "Returns & Inspection", kind: "returns" });
  const rtnRack = newId(d, "rk");
  d.racks.push({ id: rtnRack, warehouseId: wh.id, zoneId: rtnZone, code: "RTN-R1" });
  d.bins.push({
    id: newId(d, "bin"),
    warehouseId: wh.id,
    zoneId: rtnZone,
    rackId: rtnRack,
    code: `${code}-RTN-01`,
    type: "returns",
    capacity: 5000,
  });
  const zr = createZone(d, ctx, { warehouseId: wh.id, code: "A", name: "Ambient Storage A" });
  if (zr.ok) {
    const rk = createRack(d, ctx, { zoneId: zr.value });
    if (rk.ok) {
      createBin(d, ctx, { rackId: rk.value, capacity: 1000 });
      createBin(d, ctx, { rackId: rk.value, capacity: 1000 });
    }
  }
  return ok(wh.id);
}

export function updateWarehouse(d: WmsData, _ctx: TxContext, id: ID, patch: Partial<WarehouseInput>) {
  const wh = d.warehouses.find((w) => w.id === id);
  if (!wh) return fail("Warehouse not found.");
  if (patch.code !== undefined) {
    const code = patch.code.trim().toUpperCase();
    if (d.warehouses.some((w) => w.id !== id && w.code === code)) return fail(`Warehouse code ${code} already exists.`);
    wh.code = code;
  }
  if (patch.name !== undefined) wh.name = patch.name.trim();
  if (patch.city !== undefined) wh.city = patch.city.trim();
  if (patch.address !== undefined) wh.address = patch.address.trim();
  if (patch.managerId !== undefined) wh.managerId = patch.managerId;
  return ok();
}

export function setWarehouseStatus(d: WmsData, _ctx: TxContext, id: ID, status: Warehouse["status"]) {
  const wh = d.warehouses.find((w) => w.id === id);
  if (!wh) return fail("Warehouse not found.");
  if (status === "inactive") {
    const active = d.warehouses.filter((w) => w.status === "active" && w.id !== id);
    if (active.length === 0) return fail("At least one warehouse must stay active.");
    const openOrders = d.orders.some(
      (o) => o.warehouseId === id && ["confirmed", "picking", "picked", "packed"].includes(o.status),
    );
    if (openOrders) return fail("This warehouse has open customer orders. Complete or cancel them first.");
  }
  wh.status = status;
  return ok();
}

export function createZone(
  d: WmsData,
  _ctx: TxContext,
  input: { warehouseId: ID; code: string; name: string },
) {
  const code = input.code.trim().toUpperCase();
  if (!d.warehouses.some((w) => w.id === input.warehouseId)) return fail("Warehouse not found.");
  if (d.zones.some((z) => z.warehouseId === input.warehouseId && z.code === code)) {
    return fail(`Zone ${code} already exists in this warehouse.`);
  }
  const zone = { id: newId(d, "zn"), warehouseId: input.warehouseId, code, name: input.name.trim(), kind: "storage" as const };
  d.zones.push(zone);
  return ok(zone.id);
}

export function createRack(d: WmsData, _ctx: TxContext, input: { zoneId: ID }) {
  const zone = d.zones.find((z) => z.id === input.zoneId);
  if (!zone) return fail("Zone not found.");
  if (zone.kind !== "storage") return fail("Racks can only be added to storage zones.");
  const n = d.racks.filter((r) => r.zoneId === zone.id).length + 1;
  const rack = { id: newId(d, "rk"), warehouseId: zone.warehouseId, zoneId: zone.id, code: `${zone.code}-R${n}` };
  d.racks.push(rack);
  return ok(rack.id);
}

export function createBin(d: WmsData, _ctx: TxContext, input: { rackId: ID; capacity: number }) {
  const rack = d.racks.find((r) => r.id === input.rackId);
  if (!rack) return fail("Rack not found.");
  if (!Number.isInteger(input.capacity) || input.capacity <= 0) return fail("Capacity must be a positive whole number.");
  const wh = d.warehouses.find((w) => w.id === rack.warehouseId);
  const zone = d.zones.find((z) => z.id === rack.zoneId);
  if (!wh || !zone || zone.kind !== "storage") return fail("Bins can only be added to storage racks.");
  const n = d.bins.filter((b) => b.rackId === rack.id).length + 1;
  const bin = {
    id: newId(d, "bin"),
    warehouseId: rack.warehouseId,
    zoneId: rack.zoneId,
    rackId: rack.id,
    code: `${wh.code}-${rack.code}-B${String(n).padStart(2, "0")}`,
    type: "storage" as const,
    capacity: input.capacity,
  };
  d.bins.push(bin);
  return ok(bin.id);
}

/* ---------------------------------------------------------------- products */

export interface ProductInput {
  sku: string;
  name: string;
  description: string;
  category: string;
  uom: string;
  unitCost: number;
  sellingPrice: number | null;
  reorderLevel: number;
  preferredSupplierId: ID | null;
  emoji?: string;
  imageUrl?: string | null;
  status: ProductStatus;
}

export function generateSku(d: WmsData, category: string, name: string): string {
  const cat = category.replace(/[^A-Za-z]/g, "").slice(0, 3).toUpperCase().padEnd(3, "X");
  const nm = name.replace(/[^A-Za-z]/g, "").slice(0, 3).toUpperCase().padEnd(3, "X");
  let n = d.products.length + 1;
  let sku = `${cat}-${nm}-${String(n).padStart(4, "0")}`;
  while (d.products.some((p) => p.sku === sku)) {
    n += 1;
    sku = `${cat}-${nm}-${String(n).padStart(4, "0")}`;
  }
  return sku;
}

/** Deterministic EAN-13 style barcode derived from the SKU (GS1 Sri Lanka prefix 479). */
export function barcodeFromSku(sku: string): string {
  let h = 7;
  for (const ch of sku) h = (h * 31 + ch.charCodeAt(0)) % 1_000_000_000;
  const body = `479${String(h).padStart(9, "0")}`;
  let sum = 0;
  for (let i = 0; i < 12; i++) sum += Number(body[i]) * (i % 2 === 0 ? 1 : 3);
  return body + String((10 - (sum % 10)) % 10);
}

function validateProduct(d: WmsData, input: ProductInput, selfId?: ID) {
  if (!input.name.trim()) return "Product name is required.";
  if (!input.sku.trim()) return "SKU is required.";
  if (d.products.some((p) => p.id !== selfId && norm(p.sku) === norm(input.sku))) return `SKU ${input.sku} already exists.`;
  if (!(input.unitCost >= 0)) return "Unit cost must be zero or more.";
  if (!Number.isInteger(input.reorderLevel) || input.reorderLevel < 0) return "Reorder level must be a whole number.";
  if (input.sellingPrice !== null && input.sellingPrice < 0) return "Selling price must be zero or more.";
  return null;
}

export function createProduct(d: WmsData, ctx: TxContext, input: ProductInput) {
  const err = validateProduct(d, input);
  if (err) return fail(err);
  const sku = input.sku.trim().toUpperCase();
  const product: Product = {
    id: newId(d, "prd"),
    sku,
    name: input.name.trim(),
    description: input.description.trim(),
    category: input.category,
    uom: input.uom,
    unitCost: input.unitCost,
    sellingPrice: input.sellingPrice,
    reorderLevel: input.reorderLevel,
    preferredSupplierId: input.preferredSupplierId,
    emoji: input.emoji ?? "📦",
    imageUrl: input.imageUrl ?? null,
    barcode: barcodeFromSku(sku),
    status: input.status,
    createdAt: ctx.now,
  };
  d.products.push(product);
  return ok(product.id);
}

export function updateProduct(d: WmsData, _ctx: TxContext, id: ID, input: ProductInput) {
  const p = d.products.find((x) => x.id === id);
  if (!p) return fail("Product not found.");
  const err = validateProduct(d, input, id);
  if (err) return fail(err);
  Object.assign(p, {
    sku: input.sku.trim().toUpperCase(),
    name: input.name.trim(),
    description: input.description.trim(),
    category: input.category,
    uom: input.uom,
    unitCost: input.unitCost,
    sellingPrice: input.sellingPrice,
    reorderLevel: input.reorderLevel,
    preferredSupplierId: input.preferredSupplierId,
    emoji: input.emoji ?? p.emoji,
    imageUrl: input.imageUrl === undefined ? p.imageUrl : input.imageUrl,
    status: input.status,
  });
  p.barcode = barcodeFromSku(p.sku);
  return ok();
}

export function setProductStatus(d: WmsData, _ctx: TxContext, id: ID, status: ProductStatus) {
  const p = d.products.find((x) => x.id === id);
  if (!p) return fail("Product not found.");
  if (status !== "active") {
    const open = d.orders.some(
      (o) => ["confirmed", "picking", "picked", "packed"].includes(o.status) && o.lines.some((l) => l.productId === id),
    );
    if (open) return fail("This product is on open customer orders and cannot be archived yet.");
  }
  p.status = status;
  return ok();
}

/* --------------------------------------------------------------- suppliers */

export interface SupplierInput {
  name: string;
  contactPerson: string;
  email: string;
  phone: string;
  country: string;
  address: string;
  paymentTerms: string;
  leadTimeDays: number;
}

export function createSupplier(d: WmsData, ctx: TxContext, input: SupplierInput) {
  if (d.suppliers.some((s) => norm(s.name) === norm(input.name))) return fail("A supplier with that name already exists.");
  const supplier: Supplier = {
    id: newId(d, "sup"),
    code: `SUP-${String(d.suppliers.length + 1).padStart(3, "0")}`,
    ...input,
    status: "active",
    createdAt: ctx.now,
  };
  while (d.suppliers.some((s) => s.code === supplier.code)) {
    supplier.code = `SUP-${String(nextCounter(d, "id")).padStart(3, "0")}`;
  }
  d.suppliers.push(supplier);
  return ok(supplier.id);
}

export function updateSupplier(d: WmsData, _ctx: TxContext, id: ID, input: SupplierInput) {
  const s = d.suppliers.find((x) => x.id === id);
  if (!s) return fail("Supplier not found.");
  if (d.suppliers.some((x) => x.id !== id && norm(x.name) === norm(input.name))) return fail("A supplier with that name already exists.");
  Object.assign(s, input);
  return ok();
}

export function setSupplierStatus(d: WmsData, _ctx: TxContext, id: ID, status: Supplier["status"]) {
  const s = d.suppliers.find((x) => x.id === id);
  if (!s) return fail("Supplier not found.");
  if (status === "inactive") {
    const open = d.purchaseOrders.some(
      (po) => po.supplierId === id && (po.status === "approved" || po.status === "partially_received"),
    );
    if (open) return fail("This supplier has open purchase orders. Receive or cancel them first.");
  }
  s.status = status;
  return ok();
}

/* --------------------------------------------------------------- customers */

export type CustomerInput = Omit<Customer, "id" | "code">;

export function createCustomer(d: WmsData, _ctx: TxContext, input: CustomerInput) {
  if (d.customers.some((c) => norm(c.name) === norm(input.name))) return fail("A customer with that name already exists.");
  const customer: Customer = {
    id: newId(d, "cus"),
    code: `CUS-${String(d.customers.length + 1).padStart(3, "0")}`,
    ...input,
  };
  d.customers.push(customer);
  return ok(customer.id);
}

/* ------------------------------------------------------------------- users */

export interface UserInput {
  name: string;
  email: string;
  phone: string;
  role: Role;
  title: string;
  warehouseIds: ID[];
}

export function createUser(d: WmsData, ctx: TxContext, input: UserInput) {
  if (d.users.some((u) => norm(u.email) === norm(input.email))) return fail("A user with that email already exists.");
  const user: User = { id: newId(d, "usr"), ...input, status: "active", createdAt: ctx.now };
  d.users.push(user);
  return ok(user.id);
}

export function updateUser(d: WmsData, _ctx: TxContext, id: ID, input: UserInput) {
  const u = d.users.find((x) => x.id === id);
  if (!u) return fail("User not found.");
  if (d.users.some((x) => x.id !== id && norm(x.email) === norm(input.email))) return fail("A user with that email already exists.");
  Object.assign(u, input);
  return ok();
}

export function setUserStatus(d: WmsData, ctx: TxContext, id: ID, status: User["status"]) {
  const u = d.users.find((x) => x.id === id);
  if (!u) return fail("User not found.");
  if (status === "inactive") {
    if (id === ctx.userId) return fail("You cannot deactivate the user you are currently signed in as.");
    const admins = d.users.filter((x) => x.role === "admin" && x.status === "active" && x.id !== id);
    if (u.role === "admin" && admins.length === 0) return fail("At least one active administrator is required.");
  }
  u.status = status;
  return ok();
}

/* ------------------------------------------------------------------- tasks */

export interface TaskInput {
  title: string;
  description: string;
  type: TaskType;
  priority: Priority;
  assigneeId: ID | null;
  warehouseId: ID;
  dueDate: string;
}

export function createManualTask(d: WmsData, ctx: TxContext, input: TaskInput) {
  if (!input.title.trim()) return fail("Task title is required.");
  const task = createTask(d, ctx, { ...input, title: input.title.trim(), link: null });
  return ok(task.id);
}

export function updateTask(d: WmsData, ctx: TxContext, id: ID, input: Partial<TaskInput>) {
  const t = d.tasks.find((x) => x.id === id);
  if (!t) return fail("Task not found.");
  const prevAssignee = t.assigneeId;
  Object.assign(t, input);
  if (input.assigneeId && input.assigneeId !== prevAssignee) {
    const who = indexData(d).users.get(input.assigneeId);
    notify(d, ctx, {
      type: "task_assigned",
      title: `Task assigned: ${t.title}`,
      message: `${t.number} was assigned to ${who?.name ?? "an employee"}.`,
      href: `/tasks?task=${t.id}`,
    });
  }
  return ok();
}

/**
 * Manual status change. Tasks that belong to a workflow (picking, packing, transfer, receiving)
 * are completed by performing the workflow step, so "completed" is refused for them here.
 * Putaway tasks are completed through completePutaway (receiving.ts).
 */
export function setTaskStatus(d: WmsData, ctx: TxContext, id: ID, status: TaskStatus) {
  const t: WarehouseTask | undefined = d.tasks.find((x) => x.id === id);
  if (!t) return fail("Task not found.");
  if (status === "completed" && t.link && t.type !== "general" && t.type !== "stock_count") {
    return fail("This task completes automatically when you finish the linked workflow step. Open the linked record to complete it.");
  }
  t.status = status;
  t.completedAt = status === "completed" ? ctx.now : null;
  return ok();
}
