import { expect, test, type Page } from "@playwright/test";
import { expectToast, gotoApp, navTo, statValue } from "./helpers";

const KPI_IDS = ["kpi-products", "kpi-quantity", "kpi-value", "kpi-low-stock", "kpi-pending-orders", "kpi-incoming", "kpi-dispatched-today", "kpi-utilization"];

/** Opens the adjust dialog from the first table row for a given product search and returns its on-hand. */
async function openRowAdjust(page: Page, search: string) {
  await page.getByPlaceholder("Search product, SKU or location…").fill(search);
  const row = page.getByTestId("inventory-table").locator("tbody tr").first();
  await expect(row).toBeVisible();
  const rowId = (await row.getAttribute("data-row")) as string;
  const onHand = Number((await row.getByTestId("cell-onhand").innerText()).replace(/[^0-9]/g, ""));
  await row.getByTestId("row-adjust").click();
  await expect(page.getByTestId("adjust-stock-dialog")).toBeVisible();
  return { rowId, onHand };
}

test.describe("Dashboard, Inventory & Reports", () => {
  test("dashboard loads with 8 KPI cards, charts and widgets", async ({ page }) => {
    await gotoApp(page, "/dashboard");
    for (const id of KPI_IDS) await expect(page.getByTestId(id)).toBeVisible();
    await expect(page.getByRole("region", { name: "Key performance indicators" }).locator("> a")).toHaveCount(8);
    for (const id of ["chart-stock-flow", "chart-order-trend", "chart-category", "chart-utilization"]) {
      await expect(page.getByTestId(id)).toBeVisible();
    }
    await expect(page.getByRole("heading", { name: "Recent Stock Movements" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Low Stock Products" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "AI Recommendations" })).toBeVisible();
    await page.getByTestId("refresh-dashboard").click();
    await expectToast(page, "Dashboard refreshed");
  });

  test("changing the warehouse selector changes dashboard KPIs", async ({ page }) => {
    await gotoApp(page, "/dashboard");
    const all = await statValue(page, "kpi-quantity");
    await page.getByTestId("warehouse-selector").selectOption({ index: 1 });
    await expect.poll(() => statValue(page, "kpi-quantity")).not.toBe(all);
    expect(await statValue(page, "kpi-quantity")).toBeLessThan(all);
  });

  test("stock adjustment (+10) updates the table, movement history and dashboard quantity", async ({ page }) => {
    await gotoApp(page, "/dashboard");
    const before = await statValue(page, "kpi-quantity");

    await navTo(page, "inventory");
    await expect(page.getByTestId("inventory-table")).toBeVisible({ timeout: 45_000 });
    const { rowId, onHand } = await openRowAdjust(page, "Ceylon Black Tea");

    await page.locator("#adj-qty").fill("10");
    await page.locator("#adj-reason").selectOption("Found stock");
    await expect(page.getByTestId("adjust-preview")).toContainText(`New on-hand: ${onHand + 10}`);
    await page.getByTestId("adjust-confirm").click();
    await page.getByTestId("form-submit").click();
    await expectToast(page, "Stock adjusted");
    await expect(page.getByTestId("adjust-stock-dialog")).toHaveCount(0);

    // table row reflects the change immediately
    await expect(page.getByTestId("inventory-table").locator(`tr[data-row="${rowId}"]`).getByTestId("cell-onhand")).toHaveText(String(onHand + 10));

    // movement history shows it
    await page.getByTestId("tab-movements").click();
    const first = page.getByTestId("movement-table").locator("tbody tr").first();
    await expect(first).toContainText("Adjustment (+)");
    await expect(first).toContainText("+10");

    // dashboard KPI changed by exactly 10
    await navTo(page, "dashboard");
    await expect.poll(() => statValue(page, "kpi-quantity")).toBe(before + 10);
  });

  test("invalid adjustment (remove more than on hand) shows an error and does not change stock", async ({ page }) => {
    await gotoApp(page, "/inventory");
    const { rowId, onHand } = await openRowAdjust(page, "Ceylon Black Tea");
    await page.locator("#adj-type").selectOption("decrease");
    await page.locator("#adj-qty").fill(String(onHand + 50));
    await page.locator("#adj-reason").selectOption("Damaged goods");
    await expect(page.getByTestId("adjust-preview")).toContainText("negative");
    await page.getByTestId("adjust-confirm").click();
    await page.getByTestId("form-submit").click();
    await expect(page.getByTestId("error-adj-qty")).toContainText(/cannot go negative|only/i);
    await expect(page.getByTestId("adjust-stock-dialog")).toBeVisible();
    await page.getByRole("button", { name: "Cancel" }).click();
    await expect(page.getByTestId("inventory-table").locator(`tr[data-row="${rowId}"]`).getByTestId("cell-onhand")).toHaveText(String(onHand));
  });

  test("stock count applies a variance and reconciliation stays consistent", async ({ page }) => {
    await gotoApp(page, "/inventory");
    await page.getByTestId("tab-count").click();
    await expect(page.getByTestId("reconciliation-ok")).toContainText("Movement history matches inventory");
    await page.getByTestId("count-prefill").click();
    const input = page.getByTestId("count-lines").getByRole("spinbutton").first();
    const system = Number(await input.inputValue());
    await input.fill(String(system + 3));
    await expect(page.getByTestId("count-summary")).toContainText("1 variance");
    await page.getByTestId("apply-count").click();
    await expect(page.getByTestId("count-confirm-list")).toContainText(`${system} → ${system + 3}`);
    await page.getByTestId("confirm-action").click();
    await expectToast(page, "Stock count applied");
    await expect(page.getByTestId("reconciliation-ok")).toBeVisible();
  });

  test("inventory deep link opens product drawer; low stock banner filters; CSV export downloads", async ({ page }) => {
    await gotoApp(page, "/inventory");
    await page.getByTestId("low-stock-filter").click();
    await expect(page.getByTestId("active-filters")).toContainText("Low / out of stock");
    await expect(page.getByTestId("inventory-table").locator("tbody tr").first()).toBeVisible();

    const [download] = await Promise.all([page.waitForEvent("download"), page.getByTestId("export-csv").click()]);
    expect(download.suggestedFilename()).toBe("inventory-stock.csv");

    await page.getByTestId("inventory-table").locator("tbody tr").first().click();
    await expect(page.getByTestId("product-drawer")).toBeVisible();
    await expect(page.getByTestId("drawer-movements")).toBeVisible();
  });

  test("reports: every tab renders KPIs, chart, AI summary and exports CSV; print link is built", async ({ page }) => {
    await gotoApp(page, "/reports");
    const kinds = ["inventory-summary", "stock-movement", "low-stock", "purchase-orders", "sales-orders", "warehouse-performance"];
    for (const kind of kinds) {
      await page.getByTestId(`report-tab-${kind}`).click();
      await expect(page.getByTestId(`report-${kind}`)).toBeVisible();
      await expect(page.getByRole("region", { name: "Report KPIs" }).locator("> div")).toHaveCount(4);
      await expect(page.getByTestId("report-chart")).toBeVisible();
      await expect(page.getByTestId("ai-summary")).toBeVisible();
      await expect(page.getByTestId("report-table")).toBeVisible();
      const [download] = await Promise.all([page.waitForEvent("download"), page.getByTestId("export-csv").click()]);
      expect(download.suggestedFilename()).toBe(`${kind}-report.csv`);
    }
    const href = await page.getByTestId("print-report").getAttribute("href");
    expect(href).toContain("/reports/print?report=warehouse-performance");
  });

  test("print view renders a clean report", async ({ page }) => {
    await gotoApp(page, "/reports/print?report=low-stock&warehouse=all&category=all");
    await expect(page.getByTestId("print-title")).toContainText("Low Stock");
    await expect(page.getByTestId("print-table")).toBeVisible();
    await expect(page.getByTestId("print-now")).toBeVisible();
  });
});
