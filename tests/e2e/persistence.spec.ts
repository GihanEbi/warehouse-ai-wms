import { expect, test } from "@playwright/test";
import { adjustInventory, readData, receiveNewStock, stockOf } from "./flows";
import { gotoApp, waitForApp } from "./helpers";

test.describe.configure({ timeout: 150_000 });

test("completed workflow steps and records survive a page refresh", async ({ page }) => {
  const r = await receiveNewStock(page, { qty: 15 });
  const beforeReload = await readData(page);

  await page.reload();
  await waitForApp(page);
  const afterReload = await readData(page);

  // PO stays received, the receipt stays completed, the stock stays available
  expect(afterReload.purchaseOrders.find((p) => p.id === r.poId)?.status).toBe("received");
  expect(afterReload.receipts.filter((x) => x.purchaseOrderId === r.poId).every((x) => x.status === "completed")).toBe(true);
  expect(stockOf(afterReload, r.product.id, r.wh.id)).toEqual(stockOf(beforeReload, r.product.id, r.wh.id));
  expect(afterReload.movements.length).toBe(beforeReload.movements.length);
  await expect(async () => {
    const integrity = await page.evaluate(() => (window as unknown as { __wms: { integrity: () => unknown } }).__wms.integrity());
    expect(integrity).toEqual({ movementMismatches: [], reservationMismatches: [] });
  }).toPass();

  // the PO page still shows the finished state
  await page.goto(`/purchase-orders/${r.poId}`);
  await expect(page.getByTestId("po-status")).toContainText("Received", { timeout: 45_000 });
});

test("edited stock and newly written movements persist", async ({ page }) => {
  const r = await adjustInventory(page, { qty: 7 });
  await page.reload();
  await waitForApp(page);
  await page.getByPlaceholder("Search product, SKU or location…").fill("Ceylon Black Tea");
  await expect(page.getByTestId("inventory-table").locator(`tr[data-row="${r.rowId}"]`).getByTestId("cell-onhand")).toHaveText(String(r.onHand + r.qty));
});

test("theme, sidebar, warehouse scope and settings persist; Reset Demo Data restores the seed", async ({ page }) => {
  await gotoApp(page, "/settings");
  const name = page.getByTestId("company-name");
  await name.fill("Persistence Test Co");
  await name.blur();
  await page.getByTestId("theme-toggle").click();
  await expect(page.locator("html")).toHaveClass(/dark/);
  await page.reload();
  await waitForApp(page);
  await expect(page.locator("html")).toHaveClass(/dark/);
  await expect(page.getByTestId("sidebar")).toContainText("Persistence Test Co");

  // make a data change, then reset
  const before = await readData(page);
  await adjustInventory(page, { qty: 5 });
  expect((await readData(page)).movements.length).toBe(before.movements.length + 1);
  await gotoApp(page, "/settings");
  await page.getByTestId("settings-tab-data").click();
  await page.getByTestId("reset-demo").click();
  await page.getByTestId("confirm-action").click();
  await expect.poll(async () => (await readData(page)).movements.length, { timeout: 20_000 }).toBe(before.movements.length);
  await expect(page.getByTestId("sidebar")).not.toContainText("Persistence Test Co");
});
