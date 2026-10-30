import { expect, type Locator, type Page } from "@playwright/test";

/**
 * Opens a route and waits until persisted/seed state has hydrated
 * (the shell shows a skeleton until then).
 */
export async function gotoApp(page: Page, path: string) {
  await page.goto(path);
  await waitForApp(page);
}

export async function waitForApp(page: Page) {
  await expect(page.getByTestId("main-content")).toBeVisible();
  await expect(page.getByTestId("page-skeleton")).toHaveCount(0, { timeout: 30_000 });
}

/** Wait for a toast containing the text (Sonner). */
export async function expectToast(page: Page, text: string | RegExp) {
  await expect(page.locator("[data-sonner-toast]").filter({ hasText: text }).first()).toBeVisible();
}

/** Reads the numeric value of a StatCard by its test id. */
export async function statValue(page: Page, testId: string): Promise<number> {
  const raw = await page.getByTestId(`${testId}-value`).innerText();
  return Number(raw.replace(/[^0-9.-]/g, ""));
}

export async function setNativeSelect(locator: Locator, label: string) {
  await locator.selectOption({ label });
}

/** Navigate through the sidebar (works on desktop; on mobile opens the drawer first). */
export async function navTo(page: Page, slug: string) {
  const link = page.getByTestId(`nav-${slug}`).first();
  if (!(await link.isVisible())) await page.getByTestId("mobile-menu-button").click();
  await page.getByTestId(`nav-${slug}`).first().click();
}
