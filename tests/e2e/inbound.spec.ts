import { expect, test, type Page } from "@playwright/test";
import type { WmsData } from "../../src/types";
import { expectToast, gotoApp } from "./helpers";

/** Dev-server route compilation can make the first client-side navigation slow. */
const NAV = { timeout: 45_000 };

/** Reads the persisted shared state straight from localStorage (independent of any page UI). */
async function readData(page: Page): Promise<WmsData> {
  return page.evaluate(() => JSON.parse(localStorage.getItem("wms-state")!).state.data as WmsData);
}

interface StockView {
  /** physical units in storage bins */
  onHand: number;
  /** pickable units (storage, minus reserved/blocked) */
  available: number;
  /** received units waiting for putaway */
  staging: number;
}

function stockOf(d: WmsData, productId: string, warehouseId: string): StockView {
  const bins = new Map(d.bins.map((b) => [b.id, b]));
  const s: StockView = { onHand: 0, available: 0, staging: 0 };
  for (const r of d.stock) {
    if (r.productId !== productId || r.warehouseId !== warehouseId) continue;
    const bin = bins.get(r.binId);
    if (!bin) continue;
    if (bin.type === "storage") {
      s.onHand += r.onHand;
      s.available += Math.max(0, r.onHand - r.reserved - r.blocked);
    } else if (bin.type === "staging") s.staging += r.onHand;
  }
  return s;
}

/** Picks a product by searching in the shared ProductSelector popover. */
async function addProduct(page: Page, search: string) {
  await page.locator("#add-product").click();
  await page.getByLabel("Search products").fill(search);
  await page.getByTestId("product-option").first().click();
}

test.describe("Inbound: purchase orders, receiving, putaway", () => {
  test("Scenario A - PO -> approve -> partial + complete receiving -> putaway makes stock available", async ({ page }) => {
    test.setTimeout(150_000); // many dev-server route compilations on a cold start
    await gotoApp(page, "/purchase-orders");
    const before = await readData(page);
    const supplier = before.suppliers.find((s) => s.status === "active")!;
    const warehouse = before.warehouses.find((w) => w.status === "active")!;
    const [p1, p2] = before.products.filter((p) => p.status === "active").slice(0, 2);

    // ---- create PO with 2 lines
    await page.getByTestId("new-po").click();
    await expect(page).toHaveURL(/\/purchase-orders\/new$/, NAV);

    // validation: empty submit shows field errors
    await page.getByTestId("save-draft").click();
    await expect(page.getByTestId("error-supplierId")).toBeVisible();
    await expect(page.getByTestId("error-lines")).toBeVisible();

    await page.locator("#supplierId").selectOption({ label: supplier.name });
    await page.locator("#warehouseId").selectOption({ value: warehouse.id });
    await addProduct(page, p1.sku);
    await addProduct(page, p2.sku);
    await expect(page.getByTestId("po-line")).toHaveCount(2);

    // a product cannot be added twice (it is excluded from the picker)
    await page.locator("#add-product").click();
    await page.getByLabel("Search products").fill(p1.sku);
    await expect(page.getByText("No products found")).toBeVisible();
    await page.keyboard.press("Escape");

    await page.getByTestId("line-qty").nth(0).fill("10");
    await page.getByTestId("line-qty").nth(1).fill("6");
    await page.getByTestId("line-cost").nth(0).fill("100");
    await page.getByTestId("line-cost").nth(1).fill("250");
    // 10*100 + 6*250 = 2,500
    await expect(page.getByTestId("grand-total")).toContainText("2,500");

    await page.getByTestId("save-approve").click();
    await expect(page).toHaveURL(/\/purchase-orders\/(?!new)[^/]+$/, NAV);
    await expect(page.getByTestId("po-status")).toContainText("Approved");

    const poId = page.url().split("/").pop()!;
    let d = await readData(page);
    const po = d.purchaseOrders.find((p) => p.id === poId)!;
    expect(po.lines).toHaveLength(2);
    expect(po.status).toBe("approved");
    const [l1, l2] = po.lines;
    const base1 = stockOf(d, l1.productId, warehouse.id);
    const base2 = stockOf(d, l2.productId, warehouse.id);

    // approved: no edit, receive + cancel available
    await expect(page.getByTestId("edit-po")).toHaveCount(0);
    await expect(page.getByTestId("receive-goods")).toBeVisible();
    await expect(page.getByTestId("cancel-po")).toBeVisible();

    // ---- receiving, partial: 4 of 10 and 3 of 6 (1 damaged)
    await page.getByTestId("receive-goods").click();
    await expect(page).toHaveURL(/\/receiving\/new\?po=/, NAV);
    await expect(page.getByTestId("review-table")).toBeVisible({ timeout: 30_000 }); // preselected PO starts at "Review items"
    await page.getByTestId("wizard-next").click();

    // validation: nothing entered / over-receiving
    await page.getByTestId("wizard-next").click();
    await expect(page.getByTestId("error-quantities")).toBeVisible();
    await page.getByTestId("received-input").nth(0).fill("11");
    await expect(page.getByTestId("error-received")).toContainText("outstanding");
    await page.getByTestId("received-input").nth(0).fill("4");
    await page.getByTestId("received-input").nth(1).fill("3");
    await page.getByTestId("damaged-input").nth(1).fill("1");
    await page.getByTestId("wizard-next").click();
    await expect(page.getByTestId("confirm-table")).toBeVisible();
    await expect(page.getByTestId("sum-staging")).toContainText("7");
    await expect(page.getByTestId("sum-po-status")).toContainText("Partially Received");
    await page.getByTestId("confirm-receipt").click();
    await expect(page.getByTestId("receipt-success")).toBeVisible();
    const grn1 = (await page.getByTestId("grn-number").innerText()).trim();
    expect(grn1).toMatch(/^GRN-/);

    d = await readData(page);
    expect(d.purchaseOrders.find((p) => p.id === poId)!.status).toBe("partially_received");
    let s1 = stockOf(d, l1.productId, warehouse.id);
    let s2 = stockOf(d, l2.productId, warehouse.id);
    expect(s1.staging).toBe(base1.staging + 4);
    expect(s2.staging).toBe(base2.staging + 3);
    // NOT pickable yet
    expect(s1.available).toBe(base1.available);
    expect(s2.available).toBe(base2.available);
    expect(s1.onHand).toBe(base1.onHand);

    // PO detail reflects partial receipt
    await page.goto(`/purchase-orders/${poId}`);
    await expect(page.getByTestId("po-status")).toContainText("Partially Received");
    await expect(page.getByTestId("po-receipts").getByRole("link")).toHaveCount(1);
    await expect(page.getByTestId("receive-goods")).toContainText("Receive remaining");
    await expect(page.getByTestId("cancel-po")).toHaveCount(0);

    // ---- receive the remainder using "Fill outstanding"
    await page.getByTestId("receive-goods").click();
    await expect(page.getByTestId("review-table")).toBeVisible({ timeout: 30_000 });
    await page.getByTestId("wizard-next").click();
    await page.getByTestId("fill-outstanding").click();
    await expect(page.getByTestId("total-received")).toHaveText("9"); // 6 + 3
    await page.getByTestId("wizard-next").click();
    await expect(page.getByTestId("sum-po-status")).toContainText("Received");
    await page.getByTestId("confirm-receipt").click();
    await expect(page.getByTestId("receipt-success")).toBeVisible();
    const grn2 = (await page.getByTestId("grn-number").innerText()).trim();
    expect(grn2).not.toBe(grn1);

    d = await readData(page);
    expect(d.purchaseOrders.find((p) => p.id === poId)!.status).toBe("received");
    s1 = stockOf(d, l1.productId, warehouse.id);
    s2 = stockOf(d, l2.productId, warehouse.id);
    expect(s1.staging).toBe(base1.staging + 10);
    expect(s2.staging).toBe(base2.staging + 6);
    expect(s1.available).toBe(base1.available);
    expect(s2.available).toBe(base2.available);

    // ---- receipts appear in history
    await page.goto("/receiving?tab=history");
    await expect(page.getByTestId("receipts-table")).toContainText(grn1);
    await expect(page.getByTestId("receipts-table")).toContainText(grn2);
    await expect(page.getByTestId("receipts-table").getByRole("row").filter({ hasText: grn1 })).toContainText("Awaiting Putaway");

    // ---- putaway: stock becomes available only now
    await page.getByTestId("tab-putaway").click();
    await expect(page.getByTestId("putaway-alert")).toContainText("not pickable");
    for (const grn of [grn1, grn2]) {
      const rows = page.getByTestId("putaway-table").getByRole("row").filter({ hasText: grn });
      const n = await rows.count();
      expect(n).toBeGreaterThan(0);
      for (let i = 0; i < n; i++) {
        const remaining = n - i;
        await expect(rows).toHaveCount(remaining);
        await rows.first().getByTestId("complete-putaway").click();
        await expect(rows).toHaveCount(remaining - 1);
      }
    }

    d = await readData(page);
    s1 = stockOf(d, l1.productId, warehouse.id);
    s2 = stockOf(d, l2.productId, warehouse.id);
    expect(s1.staging).toBe(base1.staging);
    expect(s2.staging).toBe(base2.staging);
    expect(s1.available).toBe(base1.available + 10);
    expect(s2.available).toBe(base2.available + 6);
    expect(d.receipts.filter((r) => r.purchaseOrderId === poId).every((r) => r.status === "completed")).toBe(true);

    // PO detail: received, no actions left, receipts linked
    await page.goto(`/purchase-orders/${poId}`);
    await expect(page.getByTestId("po-status")).toContainText("Received");
    await expect(page.getByTestId("receive-goods")).toHaveCount(0);
    await expect(page.getByTestId("cancel-po")).toHaveCount(0);
    await expect(page.getByTestId("po-receipts").getByRole("link")).toHaveCount(2);
  });

  test("draft PO: save, edit and approve from the detail page with confirmation", async ({ page }) => {
    await gotoApp(page, "/purchase-orders/new");
    const d0 = await readData(page);
    const supplier = d0.suppliers.find((s) => s.status === "active")!;
    const product = d0.products.find((p) => p.status === "active")!;
    await page.locator("#supplierId").selectOption({ label: supplier.name });
    await addProduct(page, product.sku);
    await page.getByTestId("line-qty").first().fill("5");
    await page.getByTestId("save-draft").click();
    await expect(page).toHaveURL(/\/purchase-orders\/(?!new)[^/]+$/, NAV);
    await expect(page.getByTestId("po-status")).toContainText("Draft");
    // no receiving for drafts
    await expect(page.getByTestId("receive-goods")).toHaveCount(0);

    await page.getByTestId("edit-po").click();
    await expect(page).toHaveURL(/\/edit$/, NAV);
    await page.getByTestId("line-qty").first().fill("8");
    await page.getByTestId("save-draft").click();
    await expect(page.getByTestId("po-lines-table")).toContainText("8");

    await page.getByTestId("approve-po").click();
    await page.getByTestId("confirm-action").click();
    await expectToast(page, /approved/i);
    await expect(page.getByTestId("po-status")).toContainText("Approved");
  });

  test("Reorder link prefills a PO draft (nothing is created until saved)", async ({ page }) => {
    await gotoApp(page, "/dashboard");
    const d = await readData(page);
    const product = d.products.find((p) => p.status === "active" && p.preferredSupplierId)!;
    const wh = d.warehouses[0];
    const count = d.purchaseOrders.length;
    await page.goto(`/purchase-orders/new?supplier=${product.preferredSupplierId}&warehouse=${wh.id}&product=${product.id}&qty=42`);
    await expect(page.getByTestId("po-line")).toHaveCount(1);
    await expect(page.getByTestId("line-qty")).toHaveValue("42");
    await expect(page.locator("#supplierId")).toHaveValue(product.preferredSupplierId!);
    expect((await readData(page)).purchaseOrders.length).toBe(count);
  });

  test("PO print page renders a printable document", async ({ page }) => {
    await gotoApp(page, "/dashboard");
    const d = await readData(page);
    const po = d.purchaseOrders[0];
    await page.goto(`/purchase-orders/${po.id}/print`);
    await expect(page.getByTestId("po-print")).toBeVisible();
    await expect(page.getByTestId("print-po-number")).toHaveText(po.number);
    await expect(page.getByText("Authorised by")).toBeVisible();
    await expect(page.getByTestId("print-po-total")).toBeVisible();
    await expect(page.getByTestId("print-now")).toBeVisible();
    // the print button is hidden in print media
    await page.emulateMedia({ media: "print" });
    await expect(page.getByTestId("print-now")).toBeHidden();
    await expect(page.getByTestId("po-print")).toBeVisible();
  });
});

test.describe("Transfers", () => {
  test("Scenario B - inter-warehouse transfer: create -> submit -> approve -> dispatch -> receive", async ({ page }) => {
    await gotoApp(page, "/transfers");
    const d0 = await readData(page);
    const [src, dst] = d0.warehouses.filter((w) => w.status === "active");
    // product with plenty of available stock at the source
    const candidate = d0.products
      .filter((p) => p.status === "active")
      .map((p) => ({ p, avail: stockOf(d0, p.id, src.id).available }))
      .sort((a, b) => b.avail - a.avail)[0];
    expect(candidate.avail).toBeGreaterThan(10);
    const qty = 7;
    const srcBefore = stockOf(d0, candidate.p.id, src.id);
    const dstBefore = stockOf(d0, candidate.p.id, dst.id);

    await page.getByTestId("new-transfer").click();
    await page.locator("#fromWarehouseId").selectOption(src.id);
    await page.locator("#toWarehouseId").selectOption(dst.id);
    await expect(page.getByTestId("transfer-type")).toHaveText("Inter-warehouse");
    await addProduct(page, candidate.p.sku);
    await page.getByTestId("line-qty").fill(String(qty));
    await page.getByTestId("submit-transfer").click();
    await expect(page).toHaveURL(/\/transfers\/(?!new)[^/]+$/, NAV);
    const trfId = page.url().split("/").pop()!;
    await expect(page.getByTestId("transfer-status")).toContainText("Pending Approval");
    // source stock not touched before dispatch
    expect(stockOf(await readData(page), candidate.p.id, src.id).onHand).toBe(srcBefore.onHand);

    await page.getByTestId("approve-transfer").click();
    await page.getByTestId("confirm-action").click();
    await expect(page.getByTestId("transfer-status")).toContainText("Approved");

    await page.getByTestId("dispatch-transfer").click();
    await page.getByTestId("confirm-action").click();
    await expect(page.getByTestId("transfer-status")).toContainText("In Transit");
    await expect(page.getByTestId("in-transit-qty")).toHaveText(String(qty));
    await expect(page.getByTestId("received-qty")).toHaveText("0");

    let d = await readData(page);
    expect(stockOf(d, candidate.p.id, src.id).onHand).toBe(srcBefore.onHand - qty);
    expect(stockOf(d, candidate.p.id, dst.id).onHand).toBe(dstBefore.onHand); // in transit is in no bin

    await page.getByTestId("receive-transfer").click();
    await page.getByTestId("confirm-action").click();
    await expect(page.getByTestId("transfer-status")).toContainText("Completed");
    await expect(page.getByTestId("in-transit-qty")).toHaveText("0");
    await expect(page.getByTestId("received-qty")).toHaveText(String(qty));
    // nothing left to do on a completed transfer
    await expect(page.getByTestId("receive-transfer")).toHaveCount(0);
    await expect(page.getByTestId("cancel-transfer")).toHaveCount(0);

    d = await readData(page);
    expect(d.transfers.find((t) => t.id === trfId)!.status).toBe("completed");
    const srcAfter = stockOf(d, candidate.p.id, src.id);
    const dstAfter = stockOf(d, candidate.p.id, dst.id);
    expect(srcAfter.onHand).toBe(srcBefore.onHand - qty);
    expect(dstAfter.onHand).toBe(dstBefore.onHand + qty);
    expect(dstAfter.available).toBe(dstBefore.available + qty);
    // total across both warehouses unchanged
    expect(srcAfter.onHand + dstAfter.onHand).toBe(srcBefore.onHand + dstBefore.onHand);

    // it shows up in the list
    await page.goto("/transfers");
    await expect(page.getByTestId("transfers-table")).toContainText(d.transfers.find((t) => t.id === trfId)!.number);
  });

  test("bin-to-bin transfer completes immediately", async ({ page }) => {
    await gotoApp(page, "/transfers/new");
    const d0 = await readData(page);
    const wh = d0.warehouses.find((w) => w.status === "active")!;
    const bins = new Map(d0.bins.map((b) => [b.id, b]));
    // a stock record in a storage bin of this warehouse with stock to move
    const rec = d0.stock.find((r) => r.warehouseId === wh.id && bins.get(r.binId)!.type === "storage" && r.onHand - r.reserved - r.blocked >= 3)!;
    const product = d0.products.find((p) => p.id === rec.productId)!;
    const toBin = d0.bins.find(
      (b) => b.warehouseId === wh.id && b.type === "storage" && b.id !== rec.binId && b.capacity - d0.stock.filter((r) => r.binId === b.id).reduce((s, r) => s + r.onHand, 0) >= 3,
    )!;
    const sumBin = (d: WmsData, binId: string) => d.stock.filter((r) => r.binId === binId && r.productId === product.id).reduce((s, r) => s + r.onHand, 0);

    await page.locator("#fromWarehouseId").selectOption(wh.id);
    await page.locator("#toWarehouseId").selectOption(wh.id);
    await expect(page.getByTestId("transfer-type")).toHaveText("Bin-to-bin");
    await addProduct(page, product.sku);
    await page.getByTestId("line-qty").fill("3");
    await page.getByTestId("from-bin").selectOption(rec.binId);
    await page.getByTestId("to-bin").selectOption(toBin.id);
    await page.getByTestId("submit-transfer").click();
    await expect(page).toHaveURL(/\/transfers\/(?!new)[^/]+$/, NAV);
    await expect(page.getByTestId("transfer-status")).toContainText("Completed");
    const d = await readData(page);
    expect(sumBin(d, rec.binId)).toBe(sumBin(d0, rec.binId) - 3);
    expect(sumBin(d, toBin.id)).toBe(sumBin(d0, toBin.id) + 3);
  });

  test("Scenario C - transfer exceeding available stock is rejected with a visible error", async ({ page }) => {
    await gotoApp(page, "/transfers/new");
    const d0 = await readData(page);
    const [src, dst] = d0.warehouses.filter((w) => w.status === "active");
    const p = d0.products.find((x) => x.status === "active")!;
    const avail = stockOf(d0, p.id, src.id).available;
    const count = d0.transfers.length;

    await page.locator("#fromWarehouseId").selectOption(src.id);
    await page.locator("#toWarehouseId").selectOption(dst.id);
    await addProduct(page, p.sku);
    await page.getByTestId("line-qty").fill(String(avail + 1));
    // live feedback
    await expect(page.getByTestId("error-line-qty")).toContainText(`Only ${avail} available`);
    await page.getByTestId("submit-transfer").click();
    await expect(page).toHaveURL(/\/transfers\/new$/, NAV);
    await expect(page.getByTestId("error-line-qty")).toContainText(`Only ${avail} available`);
    expect((await readData(page)).transfers.length).toBe(count);
    // saving a draft is blocked as well
    await page.getByTestId("save-draft").click();
    await expect(page).toHaveURL(/\/transfers\/new$/, NAV);
    expect((await readData(page)).transfers.length).toBe(count);
  });
});
