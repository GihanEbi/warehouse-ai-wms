import { expect, test } from "@playwright/test";
import { adjustInventory, expectIntegrity, fulfilOrder, readData, receiveNewStock, stockOf, transferStock } from "./flows";
import { gotoApp, navTo, statValue } from "./helpers";

/**
 * Cross-module acceptance scenarios (A-D from the product brief). Each one drives the UI end to end,
 * then checks the numbers on *other* modules (inventory, dashboard, reports) and the global invariants.
 */
test.describe.configure({ timeout: 180_000 });

test("Scenario A - receive new inventory: PO -> approve -> receive -> putaway -> inventory & dashboard", async ({ page }) => {
  await gotoApp(page, "/dashboard");
  const qtyBefore = await statValue(page, "kpi-quantity");
  const valueOf = async () => {
    const d = await readData(page);
    const cost = new Map(d.products.map((p) => [p.id, p.unitCost]));
    return d.stock.reduce((sum, r) => sum + r.onHand * (cost.get(r.productId) ?? 0), 0);
  };
  const valueBefore = await valueOf();

  const r = await receiveNewStock(page, { qty: 24 });
  // received goods sit in staging - NOT available - until putaway
  expect(r.mid.staging).toBe(r.before.staging + r.qty);
  expect(r.mid.available).toBe(r.before.available);
  // after putaway they are pickable
  expect(r.after.staging).toBe(r.before.staging);
  expect(r.after.available).toBe(r.before.available + r.qty);
  expect(r.after.onHand).toBe(r.before.onHand + r.qty);

  // Inventory page shows the product with the new available quantity
  await page.goto(`/inventory?product=${r.product.id}&warehouse=${r.wh.id}`);
  await expect(page.getByTestId("inventory-table")).toBeVisible({ timeout: 45_000 });
  await expect(page.getByTestId("inventory-table")).toContainText(r.product.name);

  // Dashboard KPIs moved by exactly the received quantity
  await page.keyboard.press("Escape"); // close the product drawer opened by the deep link
  await navTo(page, "dashboard");
  // the inventory deep link scoped the app to one warehouse; compare network-wide like the baseline
  await page.getByTestId("warehouse-selector").selectOption("all");
  await expect.poll(() => statValue(page, "kpi-quantity")).toBe(qtyBefore + r.qty);
  // inventory value (shown compactly on the KPI) rose by received qty x unit cost
  expect(await valueOf()).toBe(valueBefore + r.qty * r.product.unitCost);

  await expectIntegrity(page);
});

test("Scenario B - fulfil a customer order: confirm reserves, dispatch reduces physical stock", async ({ page }) => {
  await gotoApp(page, "/dashboard");
  const dispatchedBefore = await statValue(page, "kpi-dispatched-today");

  const r = await fulfilOrder(page);
  r.picks.forEach((p, i) => {
    const wasReserved = stockOf(r.reserved, p.id, r.wh.id);
    expect(wasReserved.reserved).toBe(r.before[i].reserved + r.qty[i]);
    expect(wasReserved.available).toBe(r.before[i].available - r.qty[i]);
    expect(wasReserved.onHand).toBe(r.before[i].onHand);

    const done = stockOf(r.after, p.id, r.wh.id);
    expect(done.onHand).toBe(r.before[i].onHand - r.qty[i]);
    expect(done.reserved).toBe(r.before[i].reserved); // reservation released
    expect(done.available).toBe(r.before[i].available - r.qty[i]);
  });
  const order = r.after.orders.find((o) => o.id === r.orderId)!;
  expect(order.status).toBe("dispatched");
  const mv = r.after.movements.filter((m) => m.type === "dispatch" && m.source?.id === r.orderId);
  expect(mv.reduce((s, m) => s + m.quantity, 0)).toBe(r.qty[0] + r.qty[1]);

  await navTo(page, "dashboard");
  await expect.poll(() => statValue(page, "kpi-dispatched-today")).toBe(dispatchedBefore + 1);
  await expectIntegrity(page);
});

test("Scenario C - transfer inventory: in-transit is tracked separately, totals are conserved", async ({ page }) => {
  const r = await transferStock(page, { qty: 9 });
  // while in transit the stock left the source and has not arrived
  expect(r.srcInTransit.onHand).toBe(r.srcBefore.onHand - r.qty);
  expect(r.dstInTransit.onHand).toBe(r.dstBefore.onHand);
  // after receipt: source -qty, destination +qty, network total unchanged
  expect(r.srcAfter.onHand).toBe(r.srcBefore.onHand - r.qty);
  expect(r.dstAfter.onHand).toBe(r.dstBefore.onHand + r.qty);
  expect(r.srcAfter.onHand + r.dstAfter.onHand).toBe(r.srcBefore.onHand + r.dstBefore.onHand);
  await expectIntegrity(page);
});

test("Inventory adjustment updates stock, movement history and reports", async ({ page }) => {
  const r = await adjustInventory(page, { qty: 12 });
  const d = await readData(page);
  const mv = d.movements.filter((m) => m.type === "adjustment_in" && m.quantity === 12 && m.note.includes("Found stock"));
  expect(mv.length).toBeGreaterThanOrEqual(1);
  expect(r.qty).toBe(12);
  await page.goto("/reports");
  await expect(page.getByRole("heading", { level: 1 })).toContainText(/reports/i);
  await expectIntegrity(page);
});

test("Scenario D - AI assistant: low stock -> recommendation -> draft PO -> assistant sees the new PO", async ({ page }) => {
  await gotoApp(page, "/ai-assistant");
  const d = await readData(page);

  async function ask(text: string) {
    const before = await page.getByTestId("ai-message-assistant").count();
    await page.getByTestId("ai-input").fill(text);
    await page.getByTestId("ai-send").click();
    await expect(page.getByTestId("ai-message-assistant")).toHaveCount(before + 1, { timeout: 15_000 });
    return page.getByTestId("ai-message-assistant").last();
  }

  const answer = await ask("Show low stock products.");
  // the answer lists products that really are low / out of stock in the live data
  const lowNames = d.products
    .filter((p) => p.status === "active")
    .filter((p) => stockOf(d, p.id).available <= p.reorderLevel)
    .map((p) => p.name);
  expect(lowNames.length).toBeGreaterThan(0);
  await expect(answer).toContainText(lowNames[0].slice(0, 12));

  const reorder = await ask("Which products should I reorder?");
  await expect(reorder.getByTestId("ai-recommendation-card").first()).toBeVisible();
  // AI proposes - it never changes data on its own
  const poCountBefore = (await readData(page)).purchaseOrders.length;
  expect(poCountBefore).toBe(d.purchaseOrders.length);

  // follow the recommendation: opens a pre-filled draft form (nothing saved yet)
  await reorder.getByTestId("ai-action").first().click();
  await expect(page).toHaveURL(/\/purchase-orders\/new\?/, { timeout: 45_000 });
  await expect(page.getByTestId("po-line")).toHaveCount(1);
  expect((await readData(page)).purchaseOrders.length).toBe(poCountBefore);

  // the user reviews, saves and approves the PO
  await page.getByTestId("save-approve").click();
  await expect(page.getByTestId("po-status")).toContainText("Approved", { timeout: 45_000 });
  const poNumber = (await page.getByTestId("po-number").innerText().catch(() => "")).trim();
  const poId = page.url().split("/").pop()!;
  const after = await readData(page);
  expect(after.purchaseOrders.length).toBe(poCountBefore + 1);
  const created = after.purchaseOrders.find((p) => p.id === poId)!;

  // the assistant now reads the updated data
  await page.goto("/ai-assistant");
  await expect(page.getByTestId("ai-input")).toBeVisible({ timeout: 45_000 });
  const pending = await ask("Show pending purchase orders.");
  await expect(pending).toContainText(poNumber || created.number);
  await expectIntegrity(page);
});
