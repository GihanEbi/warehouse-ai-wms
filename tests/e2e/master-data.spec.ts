import { expect, test, type Page } from "@playwright/test";
import { expectToast, gotoApp } from "./helpers";

async function searchProducts(page: Page, term: string) {
  await page.getByRole("searchbox", { name: /search name, sku or barcode/i }).fill(term);
}

async function addProduct(page: Page, name: string) {
  await page.getByTestId("add-product").click();
  const dialog = page.getByTestId("product-form");
  await expect(dialog).toBeVisible();
  await dialog.locator("#p-name").fill(name);
  await dialog.getByTestId("generate-sku").click();
  await expect(dialog.locator("#p-sku")).not.toHaveValue("");
  await dialog.locator("#p-cost").fill("150");
  await dialog.locator("#p-price").fill("240");
  await dialog.locator("#p-reorder").fill("25");
  await dialog.getByTestId("form-submit").click();
  await expectToast(page, /created/i);
  await expect(dialog).toHaveCount(0);
}

test.describe("master data", () => {
  test("creating a product shows it in the list and via search", async ({ page }) => {
    await gotoApp(page, "/products");
    // validation: empty submit shows field errors
    await page.getByTestId("add-product").click();
    await page.getByTestId("form-submit").click();
    await expect(page.getByTestId("error-p-name")).toBeVisible();
    await expect(page.getByTestId("error-p-sku")).toBeVisible();
    await page.getByRole("button", { name: "Cancel" }).click();

    await addProduct(page, "Zesty Test Cinnamon Rolls");
    await searchProducts(page, "Zesty Test");
    const row = page.locator("[data-testid='products-table'] tr[data-row]").filter({ hasText: "Zesty Test Cinnamon Rolls" });
    await expect(row).toHaveCount(1);
    await expect(row).toContainText("Out of Stock"); // brand new product has no stock yet
    await expect(row).toContainText("Active");
  });

  test("editing a product persists", async ({ page }) => {
    await gotoApp(page, "/products");
    await searchProducts(page, "Ceylon Black Tea");
    await page.locator("[data-testid='products-table'] tr[data-row]").first().click();
    await expect(page.getByTestId("product-title")).toContainText("Ceylon Black Tea");
    await page.getByTestId("edit-product").click();
    const dialog = page.getByTestId("product-form");
    await dialog.locator("#p-name").fill("Ceylon Black Tea Premium 100g");
    await dialog.locator("#p-price").fill("510");
    await dialog.getByTestId("form-submit").click();
    await expectToast(page, /product updated/i);
    await expect(page.getByTestId("product-title")).toHaveText("Ceylon Black Tea Premium 100g");
    await expect(page.getByTestId("product-price")).toContainText("510");

    await page.reload();
    await expect(page.getByTestId("page-skeleton")).toHaveCount(0, { timeout: 30_000 });
    await expect(page.getByTestId("product-title")).toHaveText("Ceylon Black Tea Premium 100g");
    await expect(page.getByTestId("product-price")).toContainText("510");
  });

  test("archiving a product hides it from the default list", async ({ page }) => {
    await gotoApp(page, "/products");
    await searchProducts(page, "Bleach 1L");
    const row = page.locator("[data-testid='products-table'] tr[data-row]").filter({ hasText: "Bleach 1L" });
    await expect(row).toHaveCount(1);
    await row.getByTestId("row-actions").click();
    await page.getByTestId("action-archive").click();
    await expect(page.getByTestId("confirmation-dialog")).toContainText("Archive Bleach 1L?");
    await page.getByTestId("confirm-action").click();
    await expectToast(page, /archived/i);
    await expect(page.locator("[data-testid='products-table'] tr[data-row]").filter({ hasText: "Bleach 1L" })).toHaveCount(0);

    await page.getByLabel("Status", { exact: true }).selectOption({ label: "Archived" });
    const archived = page.locator("[data-testid='products-table'] tr[data-row]").filter({ hasText: "Bleach 1L" });
    await expect(archived).toHaveCount(1);
    await expect(archived).toContainText("Archived");
  });

  test("creating a warehouse adds it to the list with default locations", async ({ page }) => {
    await gotoApp(page, "/warehouses");
    await page.getByTestId("add-warehouse").click();
    const dialog = page.getByTestId("warehouse-form");
    // duplicate code is rejected with a field error
    await dialog.locator("#wh-code").fill("cmb-01");
    await dialog.locator("#wh-name").fill("Duplicate");
    await dialog.locator("#wh-city").fill("Colombo");
    await dialog.locator("#wh-address").fill("1 Test Street, Colombo");
    await dialog.getByTestId("form-submit").click();
    await expect(page.getByTestId("error-wh-code")).toContainText(/already/i);

    await dialog.locator("#wh-code").fill("neg-01");
    await expect(dialog.locator("#wh-code")).toHaveValue("NEG-01");
    await dialog.locator("#wh-name").fill("Negombo Coastal Depot");
    await dialog.locator("#wh-city").fill("Negombo");
    await dialog.getByTestId("form-submit").click();
    await expectToast(page, /NEG-01 created/i);

    const row = page.locator("[data-testid='warehouses-table'] tr[data-row]").filter({ hasText: "Negombo Coastal Depot" });
    await expect(row).toHaveCount(1);
    await expect(row).toContainText("NEG-01");
    await expect(row).toContainText("Negombo");
    await row.click();
    await expect(page.getByRole("heading", { name: "Negombo Coastal Depot" })).toBeVisible();
    await page.getByTestId("tab-locations").click();
    await expect(page.getByTestId("storage-locations")).toContainText("NEG-01-RCV-STG");
    await expect(page.getByTestId("loc-capacity")).toHaveText("2,000");
  });

  test("creating a supplier validates and adds it to the list", async ({ page }) => {
    await gotoApp(page, "/suppliers");
    await page.getByTestId("add-supplier").click();
    const dialog = page.getByTestId("supplier-form");
    await dialog.locator("#s-name").fill("Test Spice Traders");
    await dialog.locator("#s-contact").fill("Kamal Silva");
    await dialog.locator("#s-email").fill("not-an-email");
    await dialog.locator("#s-phone").fill("+94 77 123 4567");
    await dialog.locator("#s-address").fill("12 Galle Road, Colombo 03");
    await dialog.getByTestId("form-submit").click();
    await expect(page.getByTestId("error-s-email")).toContainText(/valid email/i);

    await dialog.locator("#s-email").fill("kamal@testspice.lk");
    await dialog.getByTestId("form-submit").click();
    await expectToast(page, /Test Spice Traders created/i);

    await page.getByRole("searchbox", { name: /search name, code/i }).fill("Test Spice");
    const row = page.locator("[data-testid='suppliers-table'] tr[data-row]").filter({ hasText: "Test Spice Traders" });
    await expect(row).toHaveCount(1);
    await expect(row).toContainText("Kamal Silva");
    await row.click();
    await expect(page.getByRole("heading", { name: "Test Spice Traders" })).toBeVisible();
    await expect(page.getByTestId("sup-total-pos-value")).toHaveText("0");
  });
});
