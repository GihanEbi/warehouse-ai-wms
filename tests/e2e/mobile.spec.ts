import { expect, test } from "@playwright/test";
import { gotoApp } from "./helpers";
import { CREATE_ROUTES, MAIN_ROUTES } from "./routes";

/** Runs in the `mobile` project (Pixel 7, 412px wide). */
test.describe("Mobile layouts", () => {
  test("navigation drawer opens and navigates", async ({ page }) => {
    await gotoApp(page, "/dashboard");
    await expect(page.getByTestId("sidebar")).toBeHidden();
    await page.getByTestId("mobile-menu-button").click();
    await expect(page.getByTestId("mobile-nav")).toBeVisible();
    await page.getByTestId("mobile-nav").getByTestId("nav-products").click();
    await expect(page).toHaveURL(/\/products$/);
    await expect(page.getByTestId("mobile-nav")).toBeHidden();
  });

  for (const r of [...MAIN_ROUTES.map((m) => m.path), ...CREATE_ROUTES]) {
    test(`no horizontal overflow on ${r}`, async ({ page }) => {
      await gotoApp(page, r);
      await page.waitForTimeout(600); // let charts / lists settle
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
      expect(overflow, `page content overflows the viewport by ${overflow}px`).toBeLessThanOrEqual(1);
      await expect(page.getByRole("heading", { level: 1 }).first()).toBeVisible();
    });
  }

  test("dark theme has no overflow either", async ({ page }) => {
    await gotoApp(page, "/dashboard");
    await page.getByTestId("theme-toggle").click();
    await expect(page.locator("html")).toHaveClass(/dark/);
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    expect(overflow).toBeLessThanOrEqual(1);
  });
});
