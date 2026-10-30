import { expect, test } from "@playwright/test";
import { expectToast, gotoApp, navTo, waitForApp } from "./helpers";
import { CREATE_ROUTES, MAIN_ROUTES } from "./routes";

test.describe("App shell & navigation", () => {
  test("dashboard loads correctly", async ({ page }) => {
    await gotoApp(page, "/dashboard");
    await expect(page.getByRole("heading", { level: 1, name: /dashboard/i })).toBeVisible();
    for (const id of ["kpi-products", "kpi-quantity", "kpi-value", "kpi-low-stock", "kpi-pending-orders", "kpi-incoming", "kpi-dispatched-today", "kpi-utilization"]) {
      await expect(page.getByTestId(id)).toBeVisible();
    }
  });

  test("sidebar navigation reaches every module without errors", async ({ page }) => {
    const errors: string[] = [];
    page.on("pageerror", (e) => errors.push(`${page.url()} pageerror: ${e.message}`));
    await gotoApp(page, "/dashboard");
    for (const r of MAIN_ROUTES) {
      await navTo(page, r.slug);
      await expect(page).toHaveURL(new RegExp(`${r.path}$`));
      await waitForApp(page);
      await expect(page.getByRole("heading", { level: 1 }).first()).toContainText(r.title);
      await expect(page.getByText(/this page could not be found|application error/i)).toHaveCount(0);
      await expect(page.getByTestId("sidebar-toggle")).toBeVisible();
    }
    expect(errors).toEqual([]);
  });

  test("create / wizard routes render", async ({ page }) => {
    const errors: string[] = [];
    page.on("pageerror", (e) => errors.push(`${page.url()} pageerror: ${e.message}`));
    for (const path of CREATE_ROUTES) {
      await gotoApp(page, path);
      await expect(page.getByRole("heading", { level: 1 }).first()).toBeVisible();
      await expect(page.getByText(/this page could not be found|application error/i)).toHaveCount(0);
    }
    expect(errors).toEqual([]);
  });

  test("light / dark theme switching works and persists", async ({ page }) => {
    await gotoApp(page, "/dashboard");
    const html = page.locator("html");
    await expect(html).not.toHaveClass(/dark/);
    await page.getByTestId("theme-toggle").click();
    await expect(html).toHaveClass(/dark/);
    await expect(page.getByTestId("theme-toggle")).toHaveAttribute("data-theme-state", "dark");
    await page.reload();
    await waitForApp(page);
    await expect(html).toHaveClass(/dark/);
    await page.getByTestId("theme-toggle").click();
    await expect(html).not.toHaveClass(/dark/);
  });

  test("sidebar collapses and expands", async ({ page }) => {
    await gotoApp(page, "/dashboard");
    const sidebar = page.getByTestId("sidebar");
    await expect(sidebar).toHaveAttribute("data-collapsed", "false");
    await page.getByTestId("sidebar-toggle").click();
    await expect(sidebar).toHaveAttribute("data-collapsed", "true");
    await page.reload();
    await waitForApp(page);
    await expect(sidebar).toHaveAttribute("data-collapsed", "true");
  });

  test("global search finds products and navigates", async ({ page }) => {
    await gotoApp(page, "/dashboard");
    await page.getByTestId("global-search").click();
    await page.getByTestId("global-search-input").fill("samba");
    const first = page.getByTestId("global-search-results").getByRole("button").first();
    await expect(first).toContainText(/samba/i);
    await first.click();
    await expect(page).toHaveURL(/\/products\//);
  });

  test("notification bell shows unread count and mark-all-read persists after refresh", async ({ page }) => {
    await gotoApp(page, "/dashboard");
    const count = page.getByTestId("notification-count");
    await expect(count).toBeVisible();
    await page.getByTestId("notification-bell").click();
    await page.getByRole("button", { name: /mark all read/i }).click();
    await expect(count).toHaveCount(0);
    await page.reload();
    await waitForApp(page);
    await expect(page.getByTestId("notification-count")).toHaveCount(0);
  });

  test("warehouse selector scope persists", async ({ page }) => {
    await gotoApp(page, "/dashboard");
    const sel = page.getByTestId("warehouse-selector");
    const options = await sel.locator("option").allInnerTexts();
    expect(options.length).toBeGreaterThanOrEqual(4); // all + 3 warehouses
    await sel.selectOption({ index: 2 });
    await page.reload();
    await waitForApp(page);
    await expect(page.getByTestId("warehouse-selector")).not.toHaveValue("all");
  });

  test("demo user switcher changes role-based navigation", async ({ page }) => {
    await gotoApp(page, "/dashboard");
    await expect(page.getByTestId("nav-settings")).toBeVisible();
    await page.getByTestId("user-menu").click();
    await page.getByTestId("switch-user-operator").first().click();
    await expectToast(page, /now viewing as/i);
    await expect(page.getByTestId("nav-settings")).toHaveCount(0);
    await expect(page.getByTestId("nav-users")).toHaveCount(0);
  });
});
