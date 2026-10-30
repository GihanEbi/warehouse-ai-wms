import { expect, test, type Page } from "@playwright/test";
import type { SalesOrder, WmsData } from "../../src/types";
import { expectToast, gotoApp } from "./helpers";

/** Reads the persisted shared state straight from localStorage (independent of any page UI). */
async function readData(page: Page): Promise<WmsData> {
  return page.evaluate(() => JSON.parse(localStorage.getItem("wms-state")!).state.data as WmsData);
}

interface StockView {
  /** physical units in storage bins */
  onHand: number;
  reserved: number;
  /** pickable units (storage, minus reserved/blocked) */
  available: number;
  /** units waiting in the returns & inspection bin */
  returns: number;
}

function stockOf(d: WmsData, productId: string, warehouseId: string): StockView {
  const bins = new Map(d.bins.map((b) => [b.id, b]));
  const s: StockView = { onHand: 0, reserved: 0, available: 0, returns: 0 };
  for (const r of d.stock) {
    if (r.productId !== productId || r.warehouseId !== warehouseId) continue;
    const bin = bins.get(r.binId);
    if (!bin) continue;
    if (bin.type === "storage") {
      s.onHand += r.onHand;
      s.reserved += r.reserved;
      s.available += Math.max(0, r.onHand - r.reserved - r.blocked);
    } else if (bin.type === "returns") s.returns += r.onHand;
  }
  return s;
}

const orderIdFromUrl = (page: Page) => page.url().split("/").pop()!.split("?")[0];

/** Picks a product in the n-th order line using the shared ProductSelector popover. */
async function selectProduct(page: Page, line: number, sku: string) {
  await page.getByTestId("product-selector").nth(line).click();
  await page.getByLabel("Search products").fill(sku);
  await page.getByTestId("product-option").first().click();
}

/** Completes every open pick task of an order through the Pick dialog (scan product + bin, exact qty). */
async function pickAll(page: Page, orderId: string) {
  await gotoApp(page, `/picking-packing?order=${orderId}`);
  const tasks = page.locator('[data-testid="pick-task"]:visible');
  const n = await tasks.count();
  expect(n).toBeGreaterThan(0);
  for (let i = 0; i < n; i++) {
    await tasks.first().click();
    await expect(page.getByTestId("pick-dialog")).toBeVisible();
    await page.getByTestId("scan-product-simulate").click();
    await page.getByTestId("scan-bin-simulate").click();
    await expect(page.getByTestId("scan-product-ok")).toBeVisible();
    await expect(page.getByTestId("scan-bin-ok")).toBeVisible();
    await page.getByTestId("confirm-pick").click();
    await expect(page.getByTestId("pick-dialog")).toBeHidden();
  }
}

test.describe("Outbound: orders, picking, packing, shipping, returns", () => {
  test("Scenario B - order -> confirm (reserve) -> pick -> pack -> ship -> dispatch reduces stock exactly", async ({ page }) => {
    await gotoApp(page, "/orders");
    const seed = await readData(page);
    const warehouse = seed.warehouses.find((w) => w.status === "active")!;
    const customer = seed.customers[0];
    const candidates = seed.products.filter((p) => p.status === "active" && stockOf(seed, p.id, warehouse.id).available >= 20);
    const [p1, p2] = candidates;
    const qty = [4, 3];
    const before = [stockOf(seed, p1.id, warehouse.id), stockOf(seed, p2.id, warehouse.id)];

    // ---- create order with two products
    await page.getByTestId("new-order").click();
    await expect(page).toHaveURL(/\/orders\/new$/, { timeout: 40_000 });

    // validation: empty submit shows field errors
    await page.getByTestId("save-draft").click();
    await expect(page.getByTestId("error-customerId")).toBeVisible();

    await page.locator("#customerId").selectOption({ label: customer.name });
    await page.locator("#warehouseId").selectOption({ value: warehouse.id });
    await selectProduct(page, 0, p1.sku);
    await page.getByTestId("add-line").click();
    await selectProduct(page, 1, p2.sku);
    await page.getByTestId("line-qty").nth(0).fill(String(qty[0]));
    await page.getByTestId("line-qty").nth(1).fill(String(qty[1]));
    await expect(page.getByTestId("line-availability").first()).toContainText("available");
    await expect(page.getByTestId("line-availability").first()).toHaveAttribute("data-ok", "true");
    const price1 = p1.sellingPrice ?? Math.round(p1.unitCost * 1.3);
    const price2 = p2.sellingPrice ?? Math.round(p2.unitCost * 1.3);
    const expectedTotal = qty[0] * price1 + qty[1] * price2;
    await expect(page.getByTestId("order-total")).toContainText(expectedTotal.toLocaleString("en-US"));

    await page.getByTestId("confirm-order").click();
    await expect(page).toHaveURL(/\/orders\/(?!new)[^/]+$/, { timeout: 40_000 });
    await expect(page.getByTestId("order-status")).toContainText("Confirmed");
    const orderId = orderIdFromUrl(page);

    // ---- reservation: reserved up, available down by exactly the ordered qty
    const confirmed = await readData(page);
    for (const [i, p] of [p1, p2].entries()) {
      const after = stockOf(confirmed, p.id, warehouse.id);
      expect(after.reserved).toBe(before[i].reserved + qty[i]);
      expect(after.available).toBe(before[i].available - qty[i]);
      expect(after.onHand).toBe(before[i].onHand);
    }
    const order = confirmed.orders.find((o) => o.id === orderId) as SalesOrder;
    expect(order.status).toBe("confirmed");
    const pickTasks = confirmed.tasks.filter((t) => t.pick?.orderId === orderId);
    expect(pickTasks.length).toBeGreaterThanOrEqual(2);

    // ---- picking
    await pickAll(page, orderId);
    await expect(page.getByTestId("picked-banner")).toContainText(order.number);
    const picked = await readData(page);
    expect(picked.orders.find((o) => o.id === orderId)!.status).toBe("picked");

    // ---- packing
    await page.getByTestId("banner-pack").click();
    await expect(page).toHaveURL(new RegExp(`/picking-packing/pack/${orderId}$`), { timeout: 40_000 });
    await expect(page.getByTestId("to-package-details")).toBeDisabled();
    await page.getByTestId("verify-all").click();
    await expect(page.getByTestId("to-package-details")).toBeEnabled();
    await page.getByTestId("to-package-details").click();
    await page.getByTestId("to-review").click();
    await expect(page.getByTestId("error-weightKg")).toBeVisible();
    await page.locator("#weightKg").fill("4.5");
    await page.locator("#packageCount").fill("2");
    await page.getByTestId("to-review").click();
    await page.getByTestId("mark-packed").click();
    await expect(page.getByTestId("packing-slip")).toBeVisible();
    await expect(page.getByTestId("slip-number")).toHaveText(/PS-\d{6}/);
    await expect(page.getByTestId("slip-weight")).toContainText("4.5");
    await expect(page.getByTestId("slip-packages")).toHaveText("2");

    // ---- shipment
    await page.getByTestId("create-shipment-link").click();
    await expect(page.getByTestId("shipment-dialog")).toBeVisible();
    await page.getByTestId("generate-tracking").click();
    await expect(page.locator("#trackingNumber")).not.toHaveValue("");
    await page.getByTestId("confirm-create-shipment").click();
    await expect(page).toHaveURL(/\/shipping\/(?!\?)[^/]+$/, { timeout: 40_000 });
    await expect(page.getByTestId("shipment-status")).toContainText("Ready to Ship");

    // nothing physical changed yet
    const shipped = await readData(page);
    expect(stockOf(shipped, p1.id, warehouse.id).onHand).toBe(before[0].onHand);

    // ---- dispatch
    await page.getByTestId("confirm-dispatch").click();
    await expect(page.getByTestId("confirmation-dialog")).toContainText("Physical stock will be reduced");
    await page.getByTestId("confirm-action").click();
    await expect(page.getByTestId("shipment-status")).toContainText("Dispatched");
    await expect(page.getByTestId("dispatch-result")).toBeVisible();
    await expect(page.getByTestId("dispatch-movement")).toHaveCount(pickTasks.length);

    const done = await readData(page);
    expect(done.orders.find((o) => o.id === orderId)!.status).toBe("dispatched");
    for (const [i, p] of [p1, p2].entries()) {
      const after = stockOf(done, p.id, warehouse.id);
      expect(after.onHand).toBe(before[i].onHand - qty[i]); // physical stock reduced by exactly the ordered qty
      expect(after.reserved).toBe(before[i].reserved); // reservation released
      expect(after.available).toBe(before[i].available - qty[i]);
    }
    const moves = done.movements.filter((m) => m.type === "dispatch" && m.source?.id === orderId);
    expect(moves.length).toBe(pickTasks.length);
    expect(moves.reduce((s, m) => s + m.quantity, 0)).toBe(qty[0] + qty[1]);
    const integrity = await page.evaluate(() => (window as unknown as { __wms: { integrity: () => { movementMismatches: unknown[]; reservationMismatches: unknown[] } } }).__wms.integrity());
    expect(integrity.movementMismatches).toHaveLength(0);
    expect(integrity.reservationMismatches).toHaveLength(0);

    // order page reflects it; progress ends at Dispatched and a return can be registered
    await page.getByTestId("order-link").click();
    await expect(page.getByTestId("order-status")).toContainText("Dispatched");
    await expect(page.getByTestId("register-return")).toBeVisible();

    // shipment progresses
    await page.getByTestId("shipment-link").click();
    await page.getByTestId("mark-in-transit").click();
    await expect(page.getByTestId("shipment-status")).toContainText("In Transit");
    await page.getByTestId("mark-delivered").click();
    await expect(page.getByTestId("shipment-status")).toContainText("Delivered");
  });

  test("picking: wrong scan, over-pick and short pick are rejected; exact qty succeeds", async ({ page }) => {
    await gotoApp(page, "/picking-packing");
    const seed = await readData(page);
    const task = seed.tasks.find((t) => t.pick && t.status !== "completed")!;
    const order = seed.orders.find((o) => o.id === task.pick!.orderId)!;
    const required = task.pick!.requiredQty;

    await gotoApp(page, `/picking-packing?order=${order.id}`);
    const row = page.locator(`[data-testid="pick-task"]:visible`).first();
    await row.click();
    const dialog = page.getByTestId("pick-dialog");
    await expect(dialog).toBeVisible();
    await expect(page.getByTestId("pick-required")).toHaveText(String(required));

    // wrong barcode / bin
    await page.getByTestId("scan-product").fill("0000000000000");
    await page.getByTestId("scan-bin").fill("WRONG-BIN");
    await page.getByTestId("confirm-pick").click();
    await expect(dialog.getByText("Scanned barcode does not match this product").first()).toBeVisible();
    await expect(dialog.getByText("Scanned location does not match the pick bin").first()).toBeVisible();

    await page.getByTestId("scan-product-simulate").click();
    await page.getByTestId("scan-bin-simulate").click();

    // over-pick
    await page.getByTestId("picked-qty").fill(String(required + 1));
    await page.getByTestId("confirm-pick").click();
    await expect(dialog.getByText("Over-pick")).toBeVisible();
    await expect(dialog).toBeVisible();
    // short pick
    await page.getByTestId("picked-qty").fill(String(required - 1));
    await page.getByTestId("confirm-pick").click();
    await expect(dialog.getByText("Short pick")).toBeVisible();

    // nothing was picked
    const mid = await readData(page);
    expect(mid.tasks.find((t) => t.id === task.id)!.pick!.pickedQty).toBe(0);

    // exact quantity works
    await page.getByTestId("picked-qty").fill(String(required));
    await page.getByTestId("confirm-pick").click();
    await expect(dialog).toBeHidden();
    await expectToast(page, /Pick confirmed/);
    const after = await readData(page);
    expect(after.tasks.find((t) => t.id === task.id)!.status).toBe("completed");
    expect(after.tasks.find((t) => t.id === task.id)!.pick!.pickedQty).toBe(required);
  });

  test("an order that exceeds availability can be saved as draft but cannot be confirmed", async ({ page }) => {
    await gotoApp(page, "/orders/new");
    const seed = await readData(page);
    const warehouse = seed.warehouses.find((w) => w.status === "active")!;
    const customer = seed.customers[0];
    const product = seed.products.find((p) => p.status === "active" && stockOf(seed, p.id, warehouse.id).available >= 5)!;
    const avail = stockOf(seed, product.id, warehouse.id).available;

    await page.locator("#customerId").selectOption({ label: customer.name });
    await page.locator("#warehouseId").selectOption({ value: warehouse.id });
    await selectProduct(page, 0, product.sku);
    await page.getByTestId("line-qty").first().fill(String(avail + 1));
    await expect(page.getByTestId("line-availability")).toHaveAttribute("data-ok", "false");
    await expect(page.getByTestId("line-availability")).toContainText(`Only ${avail} available`);
    await expect(page.getByTestId("availability-warning")).toBeVisible();
    await expect(page.getByTestId("confirm-order")).toBeDisabled();

    // saving as a draft is allowed and reserves nothing
    await page.getByTestId("save-draft").click();
    await expect(page).toHaveURL(/\/orders\/(?!new)[^/]+$/, { timeout: 40_000 });
    await expect(page.getByTestId("order-status")).toContainText("Draft");
    const draft = await readData(page);
    expect(stockOf(draft, product.id, warehouse.id).reserved).toBe(stockOf(seed, product.id, warehouse.id).reserved);

    // confirming from the detail page surfaces the shortage and keeps the draft
    await page.getByTestId("confirm-order").click();
    await expect(page.getByTestId("confirm-error")).toContainText("Insufficient stock");
    await page.getByTestId("confirm-action").click();
    await expect(page.getByTestId("confirm-error")).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(page.getByTestId("order-status")).toContainText("Draft");
    const still = await readData(page);
    expect(still.orders.find((o) => o.id === orderIdFromUrl(page))!.status).toBe("draft");
  });

  test("cancelling a confirmed order releases its reservation", async ({ page }) => {
    await gotoApp(page, "/orders");
    const seed = await readData(page);
    const order = seed.orders.find((o) => o.status === "confirmed")!;
    const before = order.lines.map((l) => stockOf(seed, l.productId, order.warehouseId));

    await gotoApp(page, `/orders/${order.id}`);
    await page.getByTestId("cancel-order").click();
    await expect(page.getByTestId("confirmation-dialog")).toContainText("released");
    await page.getByTestId("confirm-action").click();
    await expect(page.getByTestId("order-status")).toContainText("Cancelled");
    const after = await readData(page);
    order.lines.forEach((l, i) => {
      const s = stockOf(after, l.productId, order.warehouseId);
      expect(s.reserved).toBe(before[i].reserved - l.quantity);
      expect(s.available).toBe(before[i].available + l.quantity);
    });
  });

  test("return flow - register -> receive -> inspect -> approve restock adds only the good units", async ({ page }) => {
    await gotoApp(page, "/returns");
    const seed = await readData(page);
    const order = seed.orders.find(
      (o) => o.status === "dispatched" && !seed.returns.some((r) => r.orderId === o.id) && o.lines.some((l) => l.quantity >= 3),
    )!;
    const line = order.lines.find((l) => l.quantity >= 3)!;
    const ret = 3;
    const good = 2;
    const damaged = 1;
    const wh = order.warehouseId;
    const before = stockOf(seed, line.productId, wh);

    // ---- register
    await page.getByTestId("new-return").click();
    await expect(page).toHaveURL(/\/returns\/new$/, { timeout: 40_000 });
    await page.locator("#orderId").selectOption({ value: order.id });
    await expect(page.getByTestId("return-line").first()).toBeVisible();

    // more than returnable is rejected with a field error
    const lineIdx = order.lines.findIndex((l) => l.productId === line.productId);
    const qtyInput = page.getByTestId("return-qty").nth(lineIdx);
    await qtyInput.fill(String(line.quantity + 1));
    await page.locator("#reason").selectOption({ index: 1 });
    await page.getByTestId("submit-return").click();
    await expect(page.getByText(/At most \d+ unit\(s\) can still be returned/)).toBeVisible();

    await qtyInput.fill(String(ret));
    await page.getByTestId("submit-return").click();
    await expect(page).toHaveURL(/\/returns\/(?!new)[^/]+$/, { timeout: 40_000 });
    await expect(page.getByTestId("return-status")).toContainText("Requested");
    const returnId = orderIdFromUrl(page);
    expect(stockOf(await readData(page), line.productId, wh)).toEqual(before); // registering changes no stock

    // ---- receive: units go to the returns bin, NOT sellable
    await page.getByTestId("receive-return").click();
    await expect(page.getByTestId("confirmation-dialog")).toContainText("NOT sellable");
    await page.getByTestId("confirm-action").click();
    await expect(page.getByTestId("return-status")).toContainText("Received");
    const received = stockOf(await readData(page), line.productId, wh);
    expect(received.returns).toBe(before.returns + ret);
    expect(received.available).toBe(before.available);
    expect(received.onHand).toBe(before.onHand);

    // ---- inspect: good + damaged must equal returned qty
    await page.getByTestId("inspect-return").click();
    await page.getByTestId("good-qty").first().fill("1");
    await page.getByTestId("damaged-qty").first().fill("1");
    await page.getByTestId("confirm-inspect").click();
    await expect(page.getByText(`Good + damaged must equal ${ret}`)).toBeVisible();
    await page.getByTestId("good-qty").first().fill(String(good));
    await page.getByTestId("damaged-qty").first().fill(String(damaged));
    await page.getByTestId("confirm-inspect").click();
    await expect(page.getByTestId("return-status")).toContainText("Inspected");
    expect(stockOf(await readData(page), line.productId, wh).available).toBe(before.available);

    // ---- approve restocking: only good units become available, damaged are written off
    await page.getByTestId("approve-restock").click();
    await expect(page.getByTestId("confirmation-dialog")).toContainText("written off");
    await page.getByTestId("confirm-action").click();
    await expect(page.getByTestId("return-status")).toContainText("Restocked");
    const data = await readData(page);
    const final = stockOf(data, line.productId, wh);
    expect(final.available).toBe(before.available + good);
    expect(final.onHand).toBe(before.onHand + good);
    expect(final.returns).toBe(before.returns);
    const rmaMoves = data.movements.filter((m) => m.source?.id === returnId);
    expect(rmaMoves.map((m) => m.type).sort()).toEqual(["return_receipt", "return_restock", "return_writeoff"]);
    await expect(page.getByTestId("return-movements")).toBeVisible();

    // return history list shows it
    await gotoApp(page, "/returns");
    await expect(page.getByTestId("returns-table")).toContainText("Restocked");
  });
});
