import { expect, type Page } from "@playwright/test";
import type { WmsData } from "../../src/types";
import { expectToast, gotoApp } from "./helpers";

/**
 * Reusable UI-driven workflows. They only click what a user would click, so the same code
 * powers the cross-module scenario tests and the recorded workflow videos.
 */
const NAV = { timeout: 45_000 };

export async function readData(page: Page): Promise<WmsData> {
  return page.evaluate(() => (window as unknown as { __wms: { data: () => WmsData } }).__wms.data());
}

export async function expectIntegrity(page: Page) {
  const res = await page.evaluate(() => (window as unknown as { __wms: { integrity: () => unknown } }).__wms.integrity());
  expect(res, "movement history must match inventory and reservations must match open orders").toEqual({
    movementMismatches: [],
    reservationMismatches: [],
  });
}

export interface StockView {
  onHand: number;
  available: number;
  staging: number;
  reserved: number;
}

export function stockOf(d: WmsData, productId: string, warehouseId?: string): StockView {
  const bins = new Map(d.bins.map((b) => [b.id, b]));
  const s: StockView = { onHand: 0, available: 0, staging: 0, reserved: 0 };
  for (const r of d.stock) {
    if (r.productId !== productId || (warehouseId && r.warehouseId !== warehouseId)) continue;
    const bin = bins.get(r.binId);
    if (!bin) continue;
    if (bin.type === "storage") {
      s.onHand += r.onHand;
      s.reserved += r.reserved;
      s.available += Math.max(0, r.onHand - r.reserved - r.blocked);
    } else if (bin.type === "staging") s.staging += r.onHand;
  }
  return s;
}

/** Scenario A: create + approve a PO, receive it, then complete putaway. Returns what was ordered. */
export async function receiveNewStock(page: Page, opts: { qty?: number; pause?: (ms?: number) => Promise<void> } = {}) {
  const qty = opts.qty ?? 24;
  const pause = opts.pause ?? (async () => undefined);
  await gotoApp(page, "/purchase-orders");
  const d = await readData(page);
  const wh = d.warehouses.find((w) => w.status === "active")!;
  const product = d.products.find((p) => p.status === "active" && p.preferredSupplierId && p.sku.startsWith("TEA") )
    ?? d.products.find((p) => p.status === "active" && p.preferredSupplierId)!;
  const before = stockOf(d, product.id, wh.id);

  await page.getByTestId("new-po").click();
  await expect(page).toHaveURL(/\/purchase-orders\/new$/, NAV);
  await page.locator("#supplierId").selectOption(product.preferredSupplierId!);
  await page.locator("#warehouseId").selectOption(wh.id);
  await pause();
  await page.locator("#add-product").click();
  await page.getByLabel("Search products").fill(product.sku);
  await page.getByTestId("product-option").first().click();
  await page.getByTestId("line-qty").first().fill(String(qty));
  await pause();
  await page.getByTestId("save-approve").click();
  await expect(page.getByTestId("po-status")).toContainText("Approved", NAV);
  const poId = page.url().split("/").pop()!;
  await pause();

  await page.getByTestId("receive-goods").click();
  await expect(page.getByTestId("review-table")).toBeVisible({ timeout: 30_000 });
  await page.getByTestId("wizard-next").click();
  await page.getByTestId("fill-outstanding").click();
  await pause();
  await page.getByTestId("wizard-next").click();
  await page.getByTestId("confirm-receipt").click();
  await expect(page.getByTestId("receipt-success")).toBeVisible();
  const grn = (await page.getByTestId("grn-number").innerText()).trim();
  await pause(1200);

  const mid = stockOf(await readData(page), product.id, wh.id);
  await gotoApp(page, "/receiving?tab=putaway");
  await page.getByTestId("tab-putaway").click();
  const rows = page.getByTestId("putaway-table").getByRole("row").filter({ hasText: grn });
  await expect(rows.first()).toBeVisible({ timeout: 30_000 }); // wait for hydration before counting
  const n = await rows.count();
  for (let i = 0; i < n; i++) {
    await rows.first().getByTestId("complete-putaway").click();
    await expect(rows).toHaveCount(n - i - 1);
    await pause(500);
  }
  const after = stockOf(await readData(page), product.id, wh.id);
  return { product, wh, poId, grn, qty, before, mid, after };
}

/** Scenario C: inter-warehouse transfer through approval, dispatch and receipt. */
export async function transferStock(page: Page, opts: { qty?: number; pause?: (ms?: number) => Promise<void> } = {}) {
  const qty = opts.qty ?? 9;
  const pause = opts.pause ?? (async () => undefined);
  await gotoApp(page, "/transfers");
  const d0 = await readData(page);
  const [src, dst] = d0.warehouses.filter((w) => w.status === "active");
  const cand = d0.products
    .filter((p) => p.status === "active")
    .map((p) => ({ p, avail: stockOf(d0, p.id, src.id).available }))
    .sort((a, b) => b.avail - a.avail)[0];
  const srcBefore = stockOf(d0, cand.p.id, src.id);
  const dstBefore = stockOf(d0, cand.p.id, dst.id);

  await page.getByTestId("new-transfer").click();
  await page.locator("#fromWarehouseId").selectOption(src.id);
  await page.locator("#toWarehouseId").selectOption(dst.id);
  await pause();
  await page.locator("#add-product").click();
  await page.getByLabel("Search products").fill(cand.p.sku);
  await page.getByTestId("product-option").first().click();
  await page.getByTestId("line-qty").fill(String(qty));
  await pause();
  await page.getByTestId("submit-transfer").click();
  await expect(page.getByTestId("transfer-status")).toContainText("Pending Approval", NAV);
  await pause();
  await page.getByTestId("approve-transfer").click();
  await page.getByTestId("confirm-action").click();
  await expect(page.getByTestId("transfer-status")).toContainText("Approved");
  await page.getByTestId("dispatch-transfer").click();
  await page.getByTestId("confirm-action").click();
  await expect(page.getByTestId("transfer-status")).toContainText("In Transit");
  await expect(page.getByTestId("in-transit-qty")).toHaveText(String(qty));
  const inTransit = await readData(page);
  await pause(1200);
  await page.getByTestId("receive-transfer").click();
  await page.getByTestId("confirm-action").click();
  await expect(page.getByTestId("transfer-status")).toContainText("Completed");
  const after = await readData(page);
  return {
    product: cand.p,
    src,
    dst,
    qty,
    srcBefore,
    dstBefore,
    srcInTransit: stockOf(inTransit, cand.p.id, src.id),
    dstInTransit: stockOf(inTransit, cand.p.id, dst.id),
    srcAfter: stockOf(after, cand.p.id, src.id),
    dstAfter: stockOf(after, cand.p.id, dst.id),
  };
}

/** Scenario B: create order -> confirm (reserve) -> pick -> pack -> ship -> dispatch. */
export async function fulfilOrder(page: Page, opts: { pause?: (ms?: number) => Promise<void> } = {}) {
  const pause = opts.pause ?? (async () => undefined);
  await gotoApp(page, "/orders");
  const d = await readData(page);
  const wh = d.warehouses.find((w) => w.status === "active")!;
  const customer = d.customers[0];
  const picks = d.products
    .filter((p) => p.status === "active")
    .map((p) => ({ p, avail: stockOf(d, p.id, wh.id).available }))
    .filter((x) => x.avail > 30)
    .slice(0, 2);
  const qty = [6, 4];
  const before = picks.map((x) => stockOf(d, x.p.id, wh.id));

  await page.getByTestId("new-order").click();
  await page.locator("#customerId").selectOption({ label: customer.name });
  await page.locator("#warehouseId").selectOption(wh.id);
  for (let i = 0; i < picks.length; i++) {
    if (i > 0) await page.getByTestId("add-line").click(); // the form starts with one empty line
    await page.getByTestId("product-selector").nth(i).click();
    await page.getByLabel("Search products").fill(picks[i].p.sku);
    await page.getByTestId("product-option").first().click();
    await page.getByTestId("line-qty").nth(i).fill(String(qty[i]));
  }
  await pause();
  await page.getByTestId("confirm-order").click();
  await expect(page).toHaveURL(/\/orders\/(?!new)[^/]+$/, NAV);
  await expect(page.getByTestId("order-status")).toContainText("Confirmed");
  const orderId = page.url().split("/").pop()!.split("?")[0];
  const reserved = await readData(page);
  await pause(1200);

  await gotoApp(page, `/picking-packing?order=${orderId}`);
  const tasks = page.locator('[data-testid="pick-task"]:visible');
  await expect(tasks.first()).toBeVisible({ timeout: 30_000 }); // wait for hydration before counting
  const taskCount = await tasks.count();
  for (let i = 0; i < taskCount; i++) {
    await tasks.first().click();
    await expect(page.getByTestId("pick-dialog")).toBeVisible();
    await page.getByTestId("scan-product-simulate").click();
    await page.getByTestId("scan-bin-simulate").click();
    await expect(page.getByTestId("scan-bin-ok")).toBeVisible();
    await pause(400);
    await page.getByTestId("confirm-pick").click();
    await expect(page.getByTestId("pick-dialog")).toBeHidden();
  }
  await expect(page.getByTestId("picked-banner")).toBeVisible();
  await page.getByTestId("banner-pack").click();
  await page.getByTestId("verify-all").click();
  await page.getByTestId("to-package-details").click();
  await page.locator("#weightKg").fill("8.5");
  await page.locator("#packageCount").fill("2");
  await page.getByTestId("to-review").click();
  await pause();
  await page.getByTestId("mark-packed").click();
  await expect(page.getByTestId("packing-slip")).toBeVisible();
  await pause(1200);
  await page.getByTestId("create-shipment-link").click();
  await page.getByTestId("generate-tracking").click();
  await page.getByTestId("confirm-create-shipment").click();
  await expect(page.getByTestId("shipment-status")).toContainText("Ready to Ship", NAV);
  await pause();
  await page.getByTestId("confirm-dispatch").click();
  await page.getByTestId("confirm-action").click();
  await expect(page.getByTestId("shipment-status")).toContainText("Dispatched");
  const after = await readData(page);
  return { wh, orderId, picks: picks.map((x) => x.p), qty, before, reserved, after };
}

/** Manual inventory adjustment (+qty) through the dialog. */
export async function adjustInventory(page: Page, opts: { search?: string; qty?: number; pause?: (ms?: number) => Promise<void> } = {}) {
  const search = opts.search ?? "Ceylon Black Tea";
  const qty = opts.qty ?? 12;
  const pause = opts.pause ?? (async () => undefined);
  await gotoApp(page, "/inventory");
  await page.getByPlaceholder("Search product, SKU or location…").fill(search);
  const row = page.getByTestId("inventory-table").locator("tbody tr").first();
  await expect(row).toBeVisible();
  const rowId = (await row.getAttribute("data-row")) as string;
  const onHand = Number((await row.getByTestId("cell-onhand").innerText()).replace(/[^0-9]/g, ""));
  await pause();
  await row.getByTestId("row-adjust").click();
  await expect(page.getByTestId("adjust-stock-dialog")).toBeVisible();
  await page.locator("#adj-qty").fill(String(qty));
  await page.locator("#adj-reason").selectOption("Found stock");
  await expect(page.getByTestId("adjust-preview")).toContainText(`New on-hand: ${onHand + qty}`);
  await pause();
  await page.getByTestId("adjust-confirm").click();
  await page.getByTestId("form-submit").click();
  await expectToast(page, "Stock adjusted");
  await expect(page.getByTestId("inventory-table").locator(`tr[data-row="${rowId}"]`).getByTestId("cell-onhand")).toHaveText(String(onHand + qty));
  await pause(800);
  await page.getByTestId("tab-movements").click();
  const first = page.getByTestId("movement-table").locator("tbody tr").first();
  await expect(first).toContainText("Adjustment (+)");
  await pause(1200);
  return { rowId, onHand, qty };
}
