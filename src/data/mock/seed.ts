/**
 * Deterministic seed generator.
 *
 * Instead of hand-building inconsistent records, the seed replays ~75 days of
 * warehouse history *through the same transaction functions the UI uses*
 * (opening balances -> POs -> receipts -> putaway -> orders -> picking ->
 * packing -> shipping -> transfers -> adjustments -> returns). That guarantees
 * stock balances, reservations, movements, tasks and notifications agree.
 *
 * Dates are anchored to `now` so the dashboard always looks "live".
 */
import { addDays, addHours, addMinutes, startOfDay, subDays } from "date-fns";
import type { ID, WmsData } from "@/types";
import { SEED_VERSION } from "@/lib/constants";
import { DEFAULT_SETTINGS } from "@/lib/settings-defaults";
import { newId, notify, recordMovement, addToBin, type TxContext } from "@/lib/inventory/core";
import {
  createCustomer,
  createManualTask,
  createProduct,
  createSupplier,
  createUser,
  generateSku,
  setTaskStatus,
} from "@/lib/workflows/master";
import { adjustStock } from "@/lib/workflows/inventory";
import {
  approvePurchaseOrder,
  cancelPurchaseOrder,
  completePutaway,
  confirmGoodsReceipt,
  createPurchaseOrder,
} from "@/lib/workflows/purchasing";
import {
  approveTransfer,
  cancelTransfer,
  createTransfer,
  dispatchTransfer,
  receiveTransfer,
} from "@/lib/workflows/transfers";
import {
  cancelOrder,
  confirmOrder,
  confirmPick,
  createOrder,
  packOrder,
  startPicking,
} from "@/lib/workflows/orders";
import { advanceShipment, confirmDispatch, createShipment, generateTrackingNumber } from "@/lib/workflows/shipping";
import {
  approveRestock,
  createReturn,
  inspectReturn,
  receiveReturn,
  rejectReturn,
} from "@/lib/workflows/returns";
import { CARRIERS, PACKAGING_TYPES, RETURN_REASONS } from "@/lib/constants";
import {
  CATEGORY_ZONE,
  CUSTOMERS,
  PRODUCTS,
  SUPPLIERS,
  USERS,
  WAREHOUSES,
  ZONES,
} from "./catalog";

/** Problems hit while replaying history (empty = seed is clean). Inspected by tests. */
export const seedWarnings: string[] = [];

function mulberry32(a: number) {
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

interface Op {
  at: Date;
  seq: number;
  label: string;
  fn: () => void;
}

export function generateSeed(now: Date = new Date()): WmsData {
  seedWarnings.length = 0;
  const pendingBinDemand: { bin: ID; qty: number }[] = [];
  const usedReturnOrders = new Set<{ id: string }>();
  const rnd = mulberry32(20261030);
  const int = (a: number, b: number) => a + Math.floor(rnd() * (b - a + 1));
  const chance = (p: number) => rnd() < p;
  const roundTo = (n: number, step: number) => Math.max(step, Math.round(n / step) * step);

  const d: WmsData = {
    seedVersion: SEED_VERSION,
    seededAt: now.toISOString(),
    users: [],
    warehouses: [],
    zones: [],
    racks: [],
    bins: [],
    products: [],
    stock: [],
    movements: [],
    suppliers: [],
    customers: [],
    purchaseOrders: [],
    receipts: [],
    transfers: [],
    orders: [],
    shipments: [],
    returns: [],
    tasks: [],
    notifications: [],
    counters: { po: 0, grn: 0, so: 0, trf: 0, rma: 0, shp: 0, tsk: 0, mov: 0, ntf: 0, slip: 0, sku: 0, id: 0 },
  };

  /* ------------------------------------------------------------- clock/ctx */
  let clock = subDays(now, 80);
  const ctx = (userId: ID): TxContext => ({
    userId,
    now: clock.toISOString(),
    settings: {
      lowStockThresholdFactor: DEFAULT_SETTINGS.lowStockThresholdFactor,
      notificationPrefs: DEFAULT_SETTINGS.notificationPrefs,
      adjustmentReasonRequired: DEFAULT_SETTINGS.adjustmentReasonRequired,
      largeAdjustmentThreshold: DEFAULT_SETTINGS.largeAdjustmentThreshold,
    },
  });
  const must = <T extends { ok: boolean }>(res: T, label: string): T => {
    if (!res.ok) seedWarnings.push(`${label}: ${(res as unknown as { error: string }).error}`);
    return res;
  };

  /** A moment `days` ago at roughly `hour` o'clock, never in the future. */
  const ago = (days: number, hour = 10, minute = int(0, 50)): Date => {
    const t = addMinutes(addHours(startOfDay(subDays(now, days)), hour), minute);
    return t > now ? addMinutes(now, -int(10, 40)) : t;
  };
  const todayAt = (hour: number, minute: number): Date => {
    const t = addMinutes(addHours(startOfDay(now), hour), minute);
    return t > now ? addMinutes(now, -(5 + int(0, 20))) : t;
  };

  /* ------------------------------------------------------------ master data */
  const sysCtx = ctx("system");
  const uid: ID[] = [];
  for (const u of USERS) {
    const r = createUser(d, sysCtx, { name: u.name, email: u.email, phone: u.phone, role: u.role, title: u.title, warehouseIds: [] });
    if (r.ok) uid.push(r.value);
  }
  const ADMIN = uid[0];
  const MGR = [uid[1], uid[2], uid[3]];
  const INV = [uid[4], uid[5]];
  const OPS: ID[][] = [[uid[6], uid[7], uid[8]], [uid[9], uid[10]], [uid[11], uid[12]]];
  sysCtx.userId = ADMIN;

  const whIds: ID[] = [];
  WAREHOUSES.forEach((w, wi) => {
    const id = newId(d, "wh");
    whIds.push(id);
    d.warehouses.push({
      id,
      code: w.code,
      name: w.name,
      city: w.city,
      address: w.address,
      managerId: MGR[wi],
      status: "active",
      createdAt: subDays(now, 120).toISOString(),
    });
  });
  USERS.forEach((u, i) => {
    d.users[i].warehouseIds = u.wh.map((w) => whIds[w]);
  });

  // zone -> racks -> bins
  const zoneBins: Record<string, string[]>[] = WAREHOUSES.map(() => ({}));
  WAREHOUSES.forEach((w, wi) => {
    ZONES.forEach((z) => {
      const zid = newId(d, "zn");
      d.zones.push({ id: zid, warehouseId: whIds[wi], code: z.code, name: z.name, kind: z.kind });
      const rackCount = z.kind === "storage" ? 2 : 1;
      for (let r = 1; r <= rackCount; r++) {
        const rid = newId(d, "rk");
        d.racks.push({ id: rid, warehouseId: whIds[wi], zoneId: zid, code: `${z.code}-R${r}` });
        const binCount = z.kind === "storage" ? 4 : 1;
        for (let b = 1; b <= binCount; b++) {
          const type = z.kind === "storage" ? "storage" : z.kind === "receiving" ? "staging" : "returns";
          const code =
            type === "storage"
              ? `${w.code}-${z.code}-R${r}-B${String(b).padStart(2, "0")}`
              : type === "staging"
                ? `${w.code}-RCV-STG`
                : `${w.code}-RTN-01`;
          const bid = newId(d, "bin");
          d.bins.push({
            id: bid,
            warehouseId: whIds[wi],
            zoneId: zid,
            rackId: rid,
            code,
            type,
            capacity: type === "staging" ? 20000 : type === "returns" ? 5000 : 100000, // storage resized below
          });
          (zoneBins[wi][z.code] ??= []).push(bid);
        }
      }
    });
  });

  const supIds: ID[] = [];
  SUPPLIERS.forEach((s) => {
    const r = createSupplier(d, sysCtx, {
      name: s.name,
      contactPerson: s.contact,
      email: s.email,
      phone: s.phone,
      country: s.country,
      address: s.address,
      paymentTerms: s.terms,
      leadTimeDays: s.lead,
    });
    if (r.ok) supIds.push(r.value);
  });
  // a dormant supplier so "inactive" filters have something to show
  const dormant = createSupplier(d, sysCtx, {
    name: "Old Mill Trading Co.",
    contactPerson: "Gamini Alwis",
    email: "info@oldmill.lk",
    phone: "+94 11 270 1100",
    country: "Sri Lanka",
    address: "Maradana, Colombo 10",
    paymentTerms: "Net 15",
    leadTimeDays: 9,
  });
  if (dormant.ok) d.suppliers[d.suppliers.length - 1].status = "inactive";

  const cusIds: ID[] = [];
  CUSTOMERS.forEach((c, i) => {
    const slug = c.name.toLowerCase().replace(/[^a-z]+/g, "");
    const r = createCustomer(d, sysCtx, {
      name: c.name,
      contactPerson: c.contact,
      email: `purchasing@${slug.slice(0, 14)}.lk`,
      phone: `+94 7${i % 2 ? 1 : 7} ${int(100, 999)} ${int(1000, 9999)}`,
      address: c.address,
      city: c.city,
    });
    if (r.ok) cusIds.push(r.value);
  });

  const prodIds: ID[] = [];
  PRODUCTS.forEach((p) => {
    const r = createProduct(d, ctx(ADMIN), {
      sku: generateSku(d, p.category, p.name),
      name: p.name,
      description: `${p.name} — ${p.category.toLowerCase()} supplied by ${SUPPLIERS[p.supplier].name}.`,
      category: p.category,
      uom: p.uom,
      unitCost: p.cost,
      sellingPrice: p.price,
      reorderLevel: p.reorder,
      preferredSupplierId: supIds[p.supplier],
      emoji: p.emoji,
      status: "active",
    });
    if (r.ok) prodIds.push(r.value);
  });
  // one archived legacy item for filters
  const legacy = createProduct(d, ctx(ADMIN), {
    sku: "LEG-OLD-0001",
    name: "Legacy Plastic Tumbler Set",
    description: "Discontinued household item.",
    category: "Household & Cleaning",
    uom: "pack",
    unitCost: 420,
    sellingPrice: 560,
    reorderLevel: 0,
    preferredSupplierId: supIds[4],
    emoji: "🥤",
    status: "archived",
  });
  void legacy;

  /* -------------------------------------------------------- stock planning */
  const planBin = (pi: number, wi: number): ID => {
    const zone = CATEGORY_ZONE[PRODUCTS[pi].category];
    const bins = zoneBins[wi][zone];
    return bins[(pi * 3 + wi) % bins.length];
  };
  const stagingBin = (wi: number) => d.bins.find((b) => b.warehouseId === whIds[wi] && b.type === "staging")!.id;
  const stocks = (pi: number, wi: number) => PRODUCTS[pi].wh.includes(wi);

  const targetFor = (pi: number, wi: number): number => {
    const p = PRODUCTS[pi];
    if (!stocks(pi, wi) || p.profile === "out") return 0;
    if (p.profile === "low") return Math.max(4, Math.round(p.reorder * [0.4, 0.22, 0.18][wi]));
    if (p.profile === "over") return Math.round(p.reorder * [14, 9, 8][wi]);
    const f = wi === 0 ? 2.2 + rnd() * 1.8 : 1.5 + rnd() * 1.3;
    return Math.round(p.reorder * f);
  };
  const targets = PRODUCTS.map((_, pi) => WAREHOUSES.map((_, wi) => targetFor(pi, wi)));

  const net = new Map<string, number>(); // planned net inflow
  const outs = new Map<string, number>(); // planned total outflow
  const ins = new Map<string, number>(); // planned total inflow
  const key = (pi: number, wi: number) => `${pi}|${wi}`;
  const flow = (pi: number, wi: number, delta: number) => {
    net.set(key(pi, wi), (net.get(key(pi, wi)) ?? 0) + delta);
    if (delta < 0) outs.set(key(pi, wi), (outs.get(key(pi, wi)) ?? 0) - delta);
    else ins.set(key(pi, wi), (ins.get(key(pi, wi)) ?? 0) + delta);
  };

  const ops: Op[] = [];
  let seq = 0;
  const at = (date: Date, label: string, fn: () => void) => {
    if (date <= now) ops.push({ at: date, seq: seq++, label, fn });
  };

  const stockedProducts = (wi: number, opts: { allowDesignated?: boolean } = {}) =>
    PRODUCTS.map((p, pi) => ({ p, pi }))
      .filter(({ p, pi }) => stocks(pi, wi) && (opts.allowDesignated || !p.profile))
      .map(({ pi }) => pi);
  const sample = <T,>(arr: T[], n: number): T[] => {
    const copy = arr.slice();
    const out: T[] = [];
    while (out.length < n && copy.length) out.push(copy.splice(int(0, copy.length - 1), 1)[0]);
    return out;
  };
  const roundedQtyFromTarget = (pi: number, wi: number, lo: number, hi: number) =>
    Math.max(10, roundTo(targets[pi][wi] * (lo + rnd() * (hi - lo)), 10));

  /* ----------------------------------------------------- purchase orders (18) */
  interface POPlan {
    daysAgo: number;
    status: "received" | "partial" | "approved" | "draft" | "cancelled";
    wh: number;
    supplier: number;
    receipts: { daysAgo: number; hour: number; fraction: number }[];
    expectedOffset: number; // days from order date (or from now for approved)
  }
  const poPlans: POPlan[] = [
    { daysAgo: 72, status: "received", wh: 0, supplier: 0, receipts: [{ daysAgo: 66, hour: 9, fraction: 0.6 }, { daysAgo: 64, hour: 11, fraction: 0.4 }], expectedOffset: 7 },
    { daysAgo: 66, status: "received", wh: 0, supplier: 2, receipts: [{ daysAgo: 58, hour: 10, fraction: 0.6 }, { daysAgo: 56, hour: 11, fraction: 0.4 }], expectedOffset: 8 },
    { daysAgo: 60, status: "received", wh: 1, supplier: 1, receipts: [{ daysAgo: 53, hour: 14, fraction: 0.5 }, { daysAgo: 51, hour: 9, fraction: 0.3 }, { daysAgo: 48, hour: 10, fraction: 0.2 }], expectedOffset: 7 },
    { daysAgo: 54, status: "received", wh: 0, supplier: 4, receipts: [{ daysAgo: 49, hour: 15, fraction: 0.5 }, { daysAgo: 47, hour: 10, fraction: 0.5 }], expectedOffset: 5 },
    { daysAgo: 47, status: "received", wh: 2, supplier: 3, receipts: [{ daysAgo: 42, hour: 10, fraction: 0.7 }, { daysAgo: 39, hour: 13, fraction: 0.3 }], expectedOffset: 5 },
    { daysAgo: 40, status: "received", wh: 0, supplier: 7, receipts: [{ daysAgo: 26, hour: 11, fraction: 0.5 }, { daysAgo: 24, hour: 9, fraction: 0.3 }, { daysAgo: 22, hour: 10, fraction: 0.2 }], expectedOffset: 15 },
    { daysAgo: 36, status: "received", wh: 1, supplier: 5, receipts: [{ daysAgo: 27, hour: 10, fraction: 0.6 }, { daysAgo: 25, hour: 13, fraction: 0.4 }], expectedOffset: 9 },
    { daysAgo: 30, status: "partial", wh: 0, supplier: 1, receipts: [{ daysAgo: 21, hour: 10, fraction: 0.5 }, { daysAgo: 17, hour: 14, fraction: 0.2 }], expectedOffset: 8 },
    { daysAgo: 22, status: "partial", wh: 2, supplier: 2, receipts: [{ daysAgo: 13, hour: 11, fraction: 0.6 }], expectedOffset: 8 },
    { daysAgo: 12, status: "partial", wh: 0, supplier: 0, receipts: [{ daysAgo: 1, hour: 9, fraction: 0.5 }], expectedOffset: 7 },
    { daysAgo: 9, status: "approved", wh: 0, supplier: 3, receipts: [], expectedOffset: -2 },
    { daysAgo: 6, status: "approved", wh: 1, supplier: 4, receipts: [], expectedOffset: 1 },
    { daysAgo: 3, status: "approved", wh: 0, supplier: 6, receipts: [], expectedOffset: 4 },
    { daysAgo: 2, status: "approved", wh: 2, supplier: 7, receipts: [], expectedOffset: 9 },
    { daysAgo: 2, status: "draft", wh: 0, supplier: 5, receipts: [], expectedOffset: 8 },
    { daysAgo: 1, status: "draft", wh: 1, supplier: 1, receipts: [], expectedOffset: 7 },
    { daysAgo: 0, status: "draft", wh: 0, supplier: 2, receipts: [], expectedOffset: 7 },
    { daysAgo: 40, status: "cancelled", wh: 2, supplier: 6, receipts: [], expectedOffset: 20 },
  ];
  // one more receipt landing "today" so there is fresh staging stock awaiting putaway
  poPlans.push({
    daysAgo: 8,
    status: "partial",
    wh: 1,
    supplier: 2,
    receipts: [{ daysAgo: 0, hour: 9, fraction: 0.4 }],
    expectedOffset: 4,
  });

  poPlans.forEach((plan) => {
    const supplierProducts = PRODUCTS.map((p, pi) => ({ p, pi })).filter(({ p, pi }) => {
      if (p.supplier !== plan.supplier || !stocks(pi, plan.wh)) return false;
      const touchesReceipts = plan.status === "received" || plan.status === "partial";
      return touchesReceipts ? !p.profile : p.profile !== "over";
    });
    let candidates = supplierProducts.map((x) => x.pi);
    if (candidates.length < 2) candidates = stockedProducts(plan.wh).slice(plan.supplier * 2, plan.supplier * 2 + 4);
    const picks = sample(candidates, Math.min(candidates.length, int(3, 5)));
    const lines = picks.map((pi) => {
      const low = PRODUCTS[pi].profile === "low" || PRODUCTS[pi].profile === "out";
      const qty = low
        ? roundTo(PRODUCTS[pi].reorder * (2 + rnd()), 10)
        : roundedQtyFromTarget(pi, plan.wh, 0.2, 0.4);
      return { pi, quantity: qty, unitCost: Math.round(PRODUCTS[pi].cost * (0.97 + rnd() * 0.06)) };
    });
    const orderAt = ago(plan.daysAgo, 9, int(0, 30));
    const expected =
      plan.status === "approved"
        ? addDays(startOfDay(now), plan.expectedOffset)
        : addDays(startOfDay(orderAt), plan.expectedOffset);
    const poRef = { id: "" };
    const buyer = INV[plan.wh === 2 ? 1 : 0];

    at(orderAt, "po.create", () => {
      const r = must(
        createPurchaseOrder(d, ctx(buyer), {
          supplierId: supIds[plan.supplier],
          warehouseId: whIds[plan.wh],
          expectedDate: expected.toISOString(),
          notes: plan.status === "draft" ? "Replenishment draft — review quantities before approval." : "",
          lines: lines.map((l) => ({ productId: prodIds[l.pi], quantity: l.quantity, unitCost: l.unitCost })),
        }),
        "po.create",
      );
      if (r.ok) poRef.id = r.value;
    });
    if (plan.status === "draft") return;
    if (plan.status === "cancelled") {
      at(addHours(orderAt, 3), "po.cancel", () => poRef.id && must(cancelPurchaseOrder(d, ctx(buyer), poRef.id, "Supplier could not meet requested lead time"), "po.cancel"));
      return;
    }
    at(addHours(orderAt, 2), "po.approve", () => poRef.id && must(approvePurchaseOrder(d, ctx(MGR[plan.wh]), poRef.id), "po.approve"));

    const clerk = OPS[plan.wh][1 % OPS[plan.wh].length];
    const cumulative = lines.map(() => 0);
    plan.receipts.forEach((rc, ri) => {
      const isLast = ri === plan.receipts.length - 1 && plan.status === "received";
      const portions = lines.map((l, li) => {
        const want = isLast ? l.quantity - cumulative[li] : Math.max(1, Math.round((l.quantity * rc.fraction) / 5) * 5);
        const q = Math.max(0, Math.min(want, l.quantity - cumulative[li]));
        cumulative[li] += q;
        return q;
      });
      const damaged = lines.map((_, li) => (chance(0.15) && portions[li] > 5 ? int(1, 4) : 0));
      const receivedAt = ago(rc.daysAgo, rc.hour);
      const putawayAt = addHours(receivedAt, int(3, 9));
      // the most recent deliveries are still sitting in staging awaiting putaway
      const putawayDone = rc.daysAgo > 1 && putawayAt <= now;
      lines.forEach((l, li) => {
        if (putawayDone) flow(l.pi, plan.wh, portions[li]);
      });
      const grnRef = { id: "" };
      at(receivedAt, "grn.confirm", () => {
        if (!poRef.id) return;
        const po = d.purchaseOrders.find((p) => p.id === poRef.id);
        if (!po) return;
        const r = must(
          confirmGoodsReceipt(d, ctx(clerk), {
            purchaseOrderId: poRef.id,
            notes: ri > 0 ? "Balance delivery" : "",
            lines: po.lines.map((pl, li) => ({ poLineId: pl.id, receivedQty: portions[li], damagedQty: damaged[li] })),
          }),
          "grn.confirm",
        );
        if (r.ok) grnRef.id = r.value;
      });
      if (putawayDone) at(putawayAt, "putaway", () => {
        if (!grnRef.id) return;
        for (const t of d.tasks.filter((t) => t.type === "putaway" && t.putaway?.receiptId === grnRef.id && t.status !== "completed")) {
          must(completePutaway(d, ctx(clerk), { taskId: t.id, binId: t.putaway!.suggestedBinId }), "putaway");
        }
      });
    });
  });

  /* --------------------------------------------------------------- orders */
  interface DispatchedInfo {
    ref: { id: string };
    dispatchAt: Date;
    wh: number;
    lines: { pi: number; qty: number }[];
  }
  const dispatched: DispatchedInfo[] = [];

  const chooseLines = (wi: number, n: number, qtyLo: number, qtyHi: number, allowDesignated: boolean) => {
    const pool = stockedProducts(wi, { allowDesignated });
    return sample(pool, n).map((pi) => ({ pi, qty: int(qtyLo, qtyHi) }));
  };

  const orderBase = (o: {
    createdAt: Date;
    wh: number;
    lines: { pi: number; qty: number }[];
    priority: "low" | "normal" | "high" | "urgent";
    required: Date;
    notes?: string;
  }) => {
    const ref = { id: "" };
    const customer = cusIds[int(0, cusIds.length - 1)];
    at(o.createdAt, "order.create", () => {
      const r = must(
        createOrder(d, ctx(MGR[o.wh]), {
          customerId: customer,
          warehouseId: whIds[o.wh],
          requiredDate: o.required.toISOString(),
          priority: o.priority,
          notes: o.notes ?? "",
          lines: o.lines.map((l) => ({ productId: prodIds[l.pi], quantity: l.qty, unitPrice: PRODUCTS[l.pi].price })),
        }),
        "order.create",
      );
      if (r.ok) ref.id = r.value;
    });
    return ref;
  };
  const confirmAt = (ref: { id: string }, date: Date, wh: number) =>
    at(date, "order.confirm", () => ref.id && must(confirmOrder(d, ctx(MGR[wh]), ref.id), "order.confirm"));
  const pickAll = (ref: { id: string }, date: Date, wh: number, skipLast = false) =>
    at(date, "order.pick", () => {
      if (!ref.id) return;
      const tasks = d.tasks.filter((t) => t.pick?.orderId === ref.id && t.status !== "completed");
      const todo = skipLast ? tasks.slice(0, Math.max(0, tasks.length - 1)) : tasks;
      for (const t of todo) {
        const picker = OPS[wh][0];
        must(confirmPick(d, ctx(picker), { taskId: t.id, pickedQty: t.pick!.requiredQty }), "order.pick");
      }
      if (skipLast) {
        const rest = tasks[tasks.length - 1];
        if (rest) must(startPicking(d, ctx(OPS[wh][0]), rest.id), "order.startPicking");
      }
    });
  const packAt = (ref: { id: string }, date: Date, wh: number) =>
    at(date, "order.pack", () =>
      ref.id &&
      must(
        packOrder(d, ctx(OPS[wh][0]), {
          orderId: ref.id,
          packagingType: PACKAGING_TYPES[int(0, 2)],
          packageCount: int(1, 4),
          weightKg: Math.round((4 + rnd() * 38) * 10) / 10,
          notes: "",
        }),
        "order.pack",
      ),
    );
  const shipAt = (ref: { id: string }, date: Date, wh: number, planned: Date): { id: string } => {
    const shp = { id: "" };
    at(date, "shipment.create", () => {
      if (!ref.id) return;
      const carrier = CARRIERS[int(0, CARRIERS.length - 1)];
      const r = must(
        createShipment(d, ctx(OPS[wh][OPS[wh].length - 1]), {
          orderId: ref.id,
          carrier: carrier.name,
          method: carrier.methods[int(0, 1)],
          trackingNumber: generateTrackingNumber(d, carrier.name),
          dispatchDate: planned.toISOString(),
          estimatedDelivery: addDays(planned, int(1, 3)).toISOString(),
        }),
        "shipment.create",
      );
      if (r.ok) shp.id = r.value;
    });
    return shp;
  };

  // --- 17 dispatched (history) incl. two dispatched today
  const dispatchDays = [55, 50, 46, 41, 37, 33, 29, 25, 21, 18, 15, 12, 9, 6, 4, 2];
  const dispatchPlans: { createdAgo: number; dispatchAt?: Date; today?: [number, number] }[] = [
    ...dispatchDays.map((dd) => ({ createdAgo: dd })),
    { createdAgo: 1, today: [8, 40] },
  ];
  dispatchPlans.forEach((plan, i) => {
    const wh = i % 5 === 4 ? 2 : i % 3 === 2 ? 1 : 0;
    const lines = chooseLines(wh, int(2, 4), 6, 30, true);
    const createdAt = ago(plan.createdAgo, 9, int(0, 40));
    const dispatchAt = plan.today ? todayAt(plan.today[0], plan.today[1]) : addHours(createdAt, int(26, 30));
    lines.forEach((l) => flow(l.pi, wh, -l.qty));
    const priority = i % 6 === 0 ? "high" : "normal";
    const ref = orderBase({ createdAt, wh, lines, priority, required: addDays(createdAt, 3) });
    confirmAt(ref, addMinutes(createdAt, 40), wh);
    pickAll(ref, addHours(createdAt, int(3, 5)), wh);
    packAt(ref, addHours(createdAt, int(6, 8)), wh);
    const shp = shipAt(ref, addMinutes(dispatchAt, -25), wh, dispatchAt);
    at(dispatchAt, "shipment.dispatch", () => shp.id && must(confirmDispatch(d, ctx(OPS[wh][OPS[wh].length - 1]), shp.id), "shipment.dispatch"));
    at(addHours(dispatchAt, 20), "shipment.transit", () => shp.id && must(advanceShipment(d, ctx(OPS[wh][0]), shp.id, "in_transit"), "shipment.transit"));
    at(addDays(dispatchAt, 3), "shipment.delivered", () => shp.id && must(advanceShipment(d, ctx(OPS[wh][0]), shp.id, "delivered"), "shipment.delivered"));
    dispatched.push({ ref, dispatchAt, wh, lines });
  });
  // two more dispatched today (both warehouses), created yesterday
  [
    { w: 0, h: 10, m: 15 },
    { w: 1, h: 11, m: 5 },
  ].forEach(({ w, h, m }) => {
    const lines = chooseLines(w, 2, 8, 24, false);
    const createdAt = ago(1, 11, 5);
    const dispatchAt = todayAt(h, m);
    lines.forEach((l) => flow(l.pi, w, -l.qty));
    const ref = orderBase({ createdAt, wh: w, lines, priority: "normal", required: addDays(createdAt, 2) });
    confirmAt(ref, addMinutes(createdAt, 30), w);
    pickAll(ref, addHours(createdAt, 3), w);
    packAt(ref, addHours(createdAt, 5), w);
    const shp = shipAt(ref, addMinutes(dispatchAt, -20), w, dispatchAt);
    at(dispatchAt, "shipment.dispatch", () => shp.id && must(confirmDispatch(d, ctx(OPS[w][OPS[w].length - 1]), shp.id), "shipment.dispatch"));
    dispatched.push({ ref, dispatchAt, wh: w, lines });
  });

  // --- open orders (current pipeline)
  const normalLines = (wi: number, n: number) => chooseLines(wi, n, 4, 22, false);
  // draft x3
  [0, 1, 0].forEach((wh, i) => {
    const created = ago(i === 2 ? 0 : 1, 14 - i);
    orderBase({ createdAt: created, wh, lines: normalLines(wh, int(2, 3)), priority: "normal", required: addDays(now, 4), notes: "Awaiting customer PO confirmation." });
  });
  // confirmed x5 (two overdue)
  [
    { wh: 0, ago: 3, req: -1, pr: "urgent" as const },
    { wh: 0, ago: 3, req: -2, pr: "high" as const },
    { wh: 1, ago: 2, req: 1, pr: "normal" as const },
    { wh: 0, ago: 1, req: 2, pr: "high" as const },
    { wh: 2, ago: 1, req: 3, pr: "normal" as const },
  ].forEach((o) => {
    const created = ago(o.ago, 10);
    const ref = orderBase({ createdAt: created, wh: o.wh, lines: normalLines(o.wh, int(2, 3)), priority: o.pr, required: addDays(startOfDay(now), o.req) });
    confirmAt(ref, addMinutes(created, 25), o.wh);
  });
  // picking x3
  [0, 1, 0].forEach((wh, i) => {
    const created = ago(2, 9 + i);
    const ref = orderBase({ createdAt: created, wh, lines: normalLines(wh, 3), priority: i === 0 ? "high" : "normal", required: addDays(startOfDay(now), 1) });
    confirmAt(ref, addMinutes(created, 20), wh);
    pickAll(ref, addHours(created, 4), wh, true);
  });
  // picked x2
  [0, 2].forEach((wh, i) => {
    const created = ago(2, 12 + i);
    const ref = orderBase({ createdAt: created, wh, lines: normalLines(wh, 2), priority: "normal", required: addDays(startOfDay(now), 1) });
    confirmAt(ref, addMinutes(created, 20), wh);
    pickAll(ref, addHours(created, 3), wh);
  });
  // packed x3 (two with a shipment awaiting dispatch)
  [0, 1, 0].forEach((wh, i) => {
    const created = ago(1, 9 + i);
    const ref = orderBase({ createdAt: created, wh, lines: normalLines(wh, 2), priority: i === 2 ? "urgent" : "normal", required: addDays(startOfDay(now), 1) });
    confirmAt(ref, addMinutes(created, 20), wh);
    pickAll(ref, addHours(created, 3), wh);
    packAt(ref, addHours(created, 5), wh);
    if (i < 2) shipAt(ref, addHours(created, 7), wh, addHours(now, 4));
  });
  // cancelled x2
  {
    const c1 = ago(12, 10);
    const r1 = orderBase({ createdAt: c1, wh: 0, lines: normalLines(0, 2), priority: "normal", required: addDays(c1, 3) });
    confirmAt(r1, addMinutes(c1, 20), 0);
    at(addHours(c1, 5), "order.cancel", () => r1.id && must(cancelOrder(d, ctx(MGR[0]), r1.id, "Customer cancelled — duplicate order"), "order.cancel"));
    const c2 = ago(20, 11);
    const r2 = orderBase({ createdAt: c2, wh: 1, lines: normalLines(1, 2), priority: "low", required: addDays(c2, 5) });
    at(addHours(c2, 2), "order.cancel", () => r2.id && must(cancelOrder(d, ctx(MGR[1]), r2.id, "Quote not accepted"), "order.cancel"));
  }

  /* ------------------------------------------------------------ transfers */
  const bothStocked = (a: number, b: number) =>
    PRODUCTS.map((p, pi) => ({ p, pi })).filter(({ p, pi }) => stocks(pi, a) && stocks(pi, b) && !p.profile).map(({ pi }) => pi);
  const interTransfer = (
    from: number,
    to: number,
    createdAgo: number,
    finish: "completed" | "in_transit" | "approved" | "pending" | "draft" | "cancelled",
  ) => {
    const lines = sample(bothStocked(from, to), 2).map((pi) => ({ pi, qty: Math.max(8, Math.round((targets[pi][from] * (0.05 + rnd() * 0.05)) / 2) * 2) }));
    const created = ago(createdAgo, 10);
    const ref = { id: "" };
    const mgr = MGR[from];
    at(created, "trf.create", () => {
      const r = must(
        createTransfer(
          d,
          ctx(mgr),
          {
            fromWarehouseId: whIds[from],
            toWarehouseId: whIds[to],
            notes: finish === "draft" ? "Rebalancing — pending final quantities" : "Stock rebalancing",
            lines: lines.map((l) => ({ productId: prodIds[l.pi], quantity: l.qty })),
          },
          finish === "draft" ? "draft" : "submit",
        ),
        "trf.create",
      );
      if (r.ok) ref.id = r.value;
    });
    if (finish === "draft" || finish === "pending") return;
    if (finish === "cancelled") {
      at(addHours(created, 4), "trf.cancel", () => ref.id && must(cancelTransfer(d, ctx(mgr), ref.id, "Destination no longer needs stock"), "trf.cancel"));
      return;
    }
    at(addHours(created, 3), "trf.approve", () => ref.id && must(approveTransfer(d, ctx(mgr), ref.id), "trf.approve"));
    if (finish === "approved") return;
    const dispatchAt = addDays(created, 1);
    lines.forEach((l) => flow(l.pi, from, -l.qty));
    at(dispatchAt, "trf.dispatch", () => ref.id && must(dispatchTransfer(d, ctx(OPS[from][0]), ref.id), "trf.dispatch"));
    if (finish === "in_transit") return;
    lines.forEach((l) => flow(l.pi, to, l.qty));
    at(addDays(created, 3), "trf.receive", () => ref.id && must(receiveTransfer(d, ctx(OPS[to][0]), ref.id), "trf.receive"));
  };
  interTransfer(0, 1, 48, "completed");
  interTransfer(0, 2, 33, "completed");
  interTransfer(1, 2, 19, "completed");
  interTransfer(0, 1, 3, "in_transit");
  interTransfer(0, 2, 2, "in_transit");
  interTransfer(1, 0, 1, "approved");
  interTransfer(0, 2, 1, "pending");
  interTransfer(2, 0, 0, "draft");
  interTransfer(1, 2, 14, "cancelled");

  // bin-to-bin transfers (executed instantly)
  [{ wh: 0, ago: 28 }, { wh: 1, ago: 16 }, { wh: 0, ago: 8 }].forEach((t) => {
    const pi = sample(stockedProducts(t.wh), 1)[0];
    const from = planBin(pi, t.wh);
    const zone = CATEGORY_ZONE[PRODUCTS[pi].category];
    const siblings = zoneBins[t.wh][zone].filter((b) => b !== from);
    const to = siblings[0];
    const qty = int(6, 18);
    at(ago(t.ago, 15), "trf.internal", () =>
      must(
        createTransfer(
          d,
          ctx(OPS[t.wh][0]),
          {
            fromWarehouseId: whIds[t.wh],
            toWarehouseId: whIds[t.wh],
            notes: "Consolidate slow movers closer to dispatch",
            lines: [{ productId: prodIds[pi], quantity: qty, fromBinId: from, toBinId: to }],
          },
          "submit",
        ),
        "trf.internal",
      ),
    );
    pendingBinDemand.push({ bin: to, qty });
  });

  /* ---------------------------------------------------------- adjustments */
  const adj: { pi: number; wh: number; type: "increase" | "decrease"; qty: number; reason: string; ago: number }[] = [
    { pi: 2, wh: 0, type: "decrease", qty: 4, reason: "Damaged goods", ago: 41 },
    { pi: 10, wh: 0, type: "increase", qty: 12, reason: "Found stock", ago: 36 },
    { pi: 16, wh: 1, type: "decrease", qty: 8, reason: "Cycle count correction", ago: 30 },
    { pi: 30, wh: 0, type: "decrease", qty: 6, reason: "Expired goods", ago: 27 },
    { pi: 19, wh: 0, type: "increase", qty: 20, reason: "Cycle count correction", ago: 22 },
    { pi: 24, wh: 2, type: "decrease", qty: 5, reason: "Damaged goods", ago: 19 },
    { pi: 6, wh: 1, type: "increase", qty: 9, reason: "Data entry correction", ago: 15 },
    { pi: 40, wh: 0, type: "decrease", qty: 3, reason: "Theft / loss", ago: 11 },
    { pi: 20, wh: 2, type: "decrease", qty: 14, reason: "Cycle count correction", ago: 7 },
    { pi: 0, wh: 0, type: "increase", qty: 25, reason: "Found stock", ago: 5 },
  ];
  adj.forEach((a) => {
    if (!stocks(a.pi, a.wh)) return;
    flow(a.pi, a.wh, a.type === "increase" ? a.qty : -a.qty);
    at(ago(a.ago, 16), "adjust", () =>
      must(
        adjustStock(d, ctx(INV[0]), { productId: prodIds[a.pi], binId: planBin(a.pi, a.wh), type: a.type, quantity: a.qty, reason: a.reason, note: "Seed adjustment" }),
        "adjust",
      ),
    );
  });
  // quarantine holds
  [{ pi: 12, wh: 0, qty: 6, ago: 5 }, { pi: 34, wh: 1, qty: 8, ago: 3 }, { pi: 8, wh: 2, qty: 5, ago: 2 }].forEach((b) => {
    if (!stocks(b.pi, b.wh)) return;
    at(ago(b.ago, 11), "block", () =>
      must(
        adjustStock(d, ctx(INV[1]), { productId: prodIds[b.pi], binId: planBin(b.pi, b.wh), type: "block", quantity: b.qty, reason: "Quarantine / quality hold", note: "Supplier quality alert on batch" }),
        "block",
      ),
    );
  });

  /* -------------------------------------------------------------- returns */
  const eligibleOrders = dispatched.filter((o) => o.dispatchAt <= subDays(now, 5)).sort((a, b) => b.dispatchAt.getTime() - a.dispatchAt.getTime());
  const retPlans: {
    state: "requested" | "received" | "inspected" | "restocked" | "rejected";
    created: number;
    recv: number;
    insp: number;
    done: number;
  }[] = [
    { state: "requested", created: 1, recv: 0, insp: 0, done: 0 },
    { state: "requested", created: 2, recv: 0, insp: 0, done: 0 },
    { state: "received", created: 6, recv: 4, insp: 0, done: 0 },
    { state: "received", created: 5, recv: 3, insp: 0, done: 0 },
    { state: "inspected", created: 10, recv: 8, insp: 6, done: 0 },
    { state: "inspected", created: 9, recv: 7, insp: 5, done: 0 },
    { state: "restocked", created: 15, recv: 13, insp: 12, done: 11 },
    { state: "restocked", created: 22, recv: 20, insp: 19, done: 18 },
    { state: "rejected", created: 17, recv: 15, insp: 14, done: 13 },
    { state: "rejected", created: 26, recv: 24, insp: 23, done: 22 },
  ];
  retPlans.forEach((rp, i) => {
    const info = eligibleOrders.find((o) => addDays(o.dispatchAt, 2) <= ago(rp.created, 10) && !usedReturnOrders.has(o.ref));
    if (!info) return;
    usedReturnOrders.add(info.ref);
    const line = info.lines[0];
    const qty = Math.min(line.qty, int(2, 6));
    const dmg = rp.state === "restocked" ? (qty > 2 ? 1 : 0) : rp.state === "rejected" ? qty : qty > 3 ? 1 : 0;
    const good = qty - dmg;
    if (rp.state === "restocked") flow(line.pi, info.wh, good);
    const rr = { id: "" };
    const mgr = MGR[info.wh];
    const reason = RETURN_REASONS[i % RETURN_REASONS.length];
    at(ago(rp.created, 10), "return.create", () => {
      if (!info.ref.id) return;
      const r = must(createReturn(d, ctx(mgr), { orderId: info.ref.id, reason, lines: [{ productId: prodIds[line.pi], quantity: qty, reason }] }), "return.create");
      if (r.ok) rr.id = r.value;
    });
    if (rp.state === "requested") return;
    at(ago(rp.recv, 10), "return.receive", () => rr.id && must(receiveReturn(d, ctx(OPS[info.wh][0]), rr.id), "return.receive"));
    if (rp.state === "received") return;
    at(ago(rp.insp, 11), "return.inspect", () => {
      if (!rr.id) return;
      const ret = d.returns.find((r) => r.id === rr.id);
      if (!ret) return;
      must(inspectReturn(d, ctx(INV[0]), rr.id, ret.lines.map((l) => ({ lineId: l.id, goodQty: good, damagedQty: dmg }))), "return.inspect");
    });
    if (rp.state === "inspected") return;
    at(ago(rp.done, 12), "return.close", () => {
      if (!rr.id) return;
      if (rp.state === "restocked") must(approveRestock(d, ctx(INV[0]), rr.id), "return.restock");
      else must(rejectReturn(d, ctx(INV[0]), rr.id, "Product unfit for resale"), "return.reject");
    });
  });

  /* ------------------------------------------------------- manual tasks */
  const manual: {
    title: string;
    description: string;
    type: "stock_count" | "general" | "receiving" | "transfer";
    wh: number;
    assignee: ID;
    ago: number;
    due: number;
    priority: "low" | "normal" | "high" | "urgent";
    status: "pending" | "in_progress" | "completed" | "blocked";
  }[] = [
    { title: "Cycle count — Zone A (Dry Goods)", description: "Count all bins in zone A and reconcile differences.", type: "stock_count", wh: 0, assignee: OPS[0][2], ago: 6, due: -2, priority: "high", status: "completed" },
    { title: "Cycle count — Zone B (Beverages)", description: "Weekly count of beverage bins.", type: "stock_count", wh: 0, assignee: OPS[0][2], ago: 1, due: 2, priority: "normal", status: "in_progress" },
    { title: "Relabel damaged shelf tags in Zone C", description: "Replace faded bin labels with new barcodes.", type: "general", wh: 0, assignee: OPS[0][0], ago: 3, due: 1, priority: "low", status: "pending" },
    { title: "Prepare dock for Spice Garden delivery", description: "Clear dock 2 and stage pallets before arrival.", type: "receiving", wh: 1, assignee: OPS[1][1], ago: 1, due: 1, priority: "high", status: "pending" },
    { title: "Forklift safety inspection", description: "Monthly forklift check — log in the safety register.", type: "general", wh: 0, assignee: OPS[0][2], ago: 9, due: -3, priority: "normal", status: "completed" },
    { title: "Investigate quarantined batch (CleanWave)", description: "Await supplier test report before releasing blocked units.", type: "general", wh: 0, assignee: INV[1], ago: 5, due: 3, priority: "high", status: "blocked" },
    { title: "Prepare returns area for inspection", description: "Free two inspection tables and set up the grading checklist.", type: "general", wh: 1, assignee: OPS[1][0], ago: 4, due: 0, priority: "normal", status: "in_progress" },
    { title: "Cycle count — Galle fast movers", description: "Count the top 15 SKUs by movement.", type: "stock_count", wh: 2, assignee: OPS[2][0], ago: 2, due: 4, priority: "normal", status: "pending" },
    { title: "Palletise outbound order for Coastline Hotels", description: "Build mixed pallet with stretch wrap and corner guards.", type: "general", wh: 2, assignee: OPS[2][1], ago: 1, due: 1, priority: "urgent", status: "pending" },
    { title: "Reorganise slow-moving bins", description: "Move slow movers to upper racks to free pick faces.", type: "general", wh: 1, assignee: OPS[1][0], ago: 12, due: -6, priority: "low", status: "completed" },
    { title: "Training: barcode scanner usage", description: "Onboard two new operators on handheld scanners.", type: "general", wh: 0, assignee: OPS[0][1], ago: 2, due: 5, priority: "low", status: "pending" },
  ];
  manual.forEach((t) => {
    at(ago(t.ago, 8), "task.create", () => {
      const r = must(
        createManualTask(d, ctx(MGR[t.wh]), {
          title: t.title,
          description: t.description,
          type: t.type,
          priority: t.priority,
          assigneeId: t.assignee,
          warehouseId: whIds[t.wh],
          dueDate: addDays(startOfDay(now), t.due).toISOString(),
        }),
        "task.create",
      );
      if (r.ok && t.status !== "pending") {
        clock = addHours(clock, 2);
        must(setTaskStatus(d, ctx(t.assignee), r.value, t.status), "task.status");
      }
    });
  });

  /* -------------------------------------------- opening balances + capacity */
  const openingQty = (pi: number, wi: number) => {
    const t = targets[pi][wi];
    const o = outs.get(key(pi, wi)) ?? 0;
    const n = net.get(key(pi, wi)) ?? 0;
    if (!stocks(pi, wi)) return 0;
    return Math.max(o, t - n);
  };

  const peak = new Map<ID, number>();
  const addPeak = (bin: ID, qty: number) => peak.set(bin, (peak.get(bin) ?? 0) + qty);
  PRODUCTS.forEach((_, pi) =>
    WAREHOUSES.forEach((_, wi) => {
      if (!stocks(pi, wi)) return;
      addPeak(planBin(pi, wi), openingQty(pi, wi) + (ins.get(key(pi, wi)) ?? 0));
    }),
  );
  for (const x of pendingBinDemand) addPeak(x.bin, x.qty);
  d.bins.forEach((b, i) => {
    if (b.type !== "storage") return;
    const u = 0.5 + ((i * 37) % 30) / 100;
    b.capacity = Math.max(400, Math.ceil((peak.get(b.id) ?? 0) / u / 50) * 50);
  });

  // opening balances are recorded as the first movements of the history
  const openingAt = subDays(now, 78);
  clock = openingAt;
  PRODUCTS.forEach((_, pi) =>
    WAREHOUSES.forEach((_, wi) => {
      const q = openingQty(pi, wi);
      if (q <= 0) return;
      const bin = planBin(pi, wi);
      addToBin(d, prodIds[pi], bin, q);
      recordMovement(d, ctx(ADMIN), {
        productId: prodIds[pi],
        warehouseId: whIds[wi],
        type: "adjustment_in",
        quantity: q,
        onHandDelta: q,
        fromLabel: "Opening balance",
        toLabel: d.bins.find((b) => b.id === bin)!.code,
        toBinId: bin,
        source: { kind: "opening", id: null, number: "Opening balance" },
        note: "Opening balance (system go-live count)",
      });
    }),
  );
  void stagingBin;

  /* --------------------------------------------------------- run history */
  ops.sort((a, b) => a.at.getTime() - b.at.getTime() || a.seq - b.seq);
  for (const op of ops) {
    clock = op.at;
    try {
      op.fn();
    } catch (e) {
      seedWarnings.push(`${op.label}: ${(e as Error).message}`);
    }
  }

  /* ------------------------------------------------------ finishing touches */
  clock = now;
  // AI recommendation notifications (read-only suggestions)
  notify(d, ctx(ADMIN), {
    type: "ai_recommendation",
    title: "AI: reorder recommendations ready",
    message: "Several products are below their reorder level. Review the suggested purchase orders.",
    href: "/ai-assistant",
  });

  // age out notifications: older ones are read
  const cutoff = subDays(now, 2).getTime();
  d.notifications.forEach((n, i) => {
    const t = new Date(n.createdAt).getTime();
    n.read = t < cutoff || (i % 3 === 0 && t < now.getTime() - 6 * 3600 * 1000);
  });
  d.notifications.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  return d;
}
