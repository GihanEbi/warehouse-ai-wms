import { expect, test, type Page } from "@playwright/test";
import { expectToast, gotoApp } from "./helpers";

async function createTask(page: Page, title: string) {
  await page.getByTestId("create-task").click();
  await page.locator("#task-title").fill(title);
  await page.getByTestId("form-submit").click();
  await expectToast(page, "Task created");
  await expect(page.getByTestId("task-form")).toHaveCount(0);
}

const taskSearch = (page: Page) => page.getByRole("searchbox", { name: /search tasks/i });

test.describe("Tasks", () => {
  test("create a task, switch to Kanban and move its status", async ({ page }) => {
    await gotoApp(page, "/tasks");
    const title = "E2E cycle count aisle A";

    // validation: empty title shows a field error
    await page.getByTestId("create-task").click();
    await page.getByTestId("form-submit").click();
    await expect(page.getByTestId("error-task-title")).toBeVisible();
    await page.getByRole("button", { name: "Cancel" }).click();

    await createTask(page, title);
    await taskSearch(page).fill(title);
    await expect(page.getByTestId("tasks-table")).toContainText(title);

    await page.getByTestId("task-view-kanban").click();
    const card = page.locator('[data-testid^="task-card-"]').filter({ hasText: title });
    await expect(page.getByTestId("kanban-col-pending")).toContainText(title);

    await card.getByRole("button", { name: /change status/i }).click();
    await page.getByTestId("task-move-in_progress").click();
    await expectToast(page, "moved to In Progress");
    await expect(page.getByTestId("kanban-col-in_progress")).toContainText(title);
    await expect(page.getByTestId("kanban-col-pending")).not.toContainText(title);
  });

  test("workflow tasks cannot be completed manually", async ({ page }) => {
    await gotoApp(page, "/tasks");
    await taskSearch(page).fill("Pick");
    const row = page.locator("tbody tr").first();
    await row.getByRole("button", { name: /change status/i }).click();
    await page.getByTestId("task-move-completed").click();
    await expectToast(page, /completes automatically/i);
  });
});

test.describe("Notifications", () => {
  test("mark all as read clears the header unread count", async ({ page }) => {
    await gotoApp(page, "/notifications");
    await expect(page.getByTestId("notification-count")).toBeVisible();
    await page.getByTestId("mark-all-read").click();
    await expect(page.getByTestId("notification-count")).toHaveCount(0);
    await expect(page.getByTestId("unread-count")).toContainText("0 unread");
  });

  test("opening an item navigates to its record and marks it read", async ({ page }) => {
    await gotoApp(page, "/notifications");
    const before = Number((await page.getByTestId("notification-count").innerText()).trim());
    await page.getByTestId("notification-item").first().getByTestId("notification-open").click();
    await expect(page).not.toHaveURL(/\/notifications$/);
    await expect(page.getByTestId("main-content")).toBeVisible();
    await expect(page.getByTestId("notification-count")).toHaveText(String(before - 1));
  });

  test("details drawer shows the full message", async ({ page }) => {
    await gotoApp(page, "/notifications");
    await page.getByTestId("notification-item").first().getByTestId("notification-details").click();
    await expect(page.getByTestId("notification-detail")).toBeVisible();
  });
});

test.describe("Users & roles", () => {
  test("add a user, then deactivate it", async ({ page }) => {
    await gotoApp(page, "/users");
    await expect(page.getByTestId("simulated-roles-alert")).toBeVisible();
    await page.getByTestId("add-user").click();

    await page.getByTestId("form-submit").click();
    await expect(page.getByTestId("error-user-name")).toBeVisible();

    await page.locator("#user-name").fill("Test Operator");
    await page.locator("#user-title").fill("Picker");
    await page.locator("#user-email").fill("test.operator@wms.lk");
    await page.getByTestId("user-wh-CMB-01").click();
    await page.getByTestId("form-submit").click();
    await expectToast(page, "Test Operator added");

    await page.getByRole("searchbox", { name: /search name/i }).fill("Test Operator");
    const row = page.locator("tbody tr").filter({ hasText: "Test Operator" });
    await expect(row).toHaveCount(1);
    await row.getByRole("button", { name: /deactivate/i }).click();
    await page.getByTestId("confirm-action").click();
    await expectToast(page, "Test Operator deactivated");
    await expect(row.getByText("Inactive")).toBeVisible();
  });

  test("duplicate email is rejected", async ({ page }) => {
    await gotoApp(page, "/users");
    await page.getByTestId("add-user").click();
    await page.locator("#user-name").fill("Dup User");
    await page.locator("#user-title").fill("Clerk");
    await page.locator("#user-email").fill("nimal.perera@wms.lk");
    await page.getByTestId("user-wh-CMB-01").click();
    await page.getByTestId("form-submit").click();
    await expect(page.getByTestId("error-user-email")).toContainText(/already exists/i);
  });

  test("switching to an Operator hides admin areas", async ({ page }) => {
    await gotoApp(page, "/users");
    await expect(page.getByTestId("nav-users")).toBeVisible();
    await page.getByTestId("user-menu").click();
    await page.getByTestId("switch-user-operator").first().click();
    await expect(page.getByTestId("current-role")).toContainText("Operator");
    await expect(page.getByTestId("nav-users")).toHaveCount(0);
    await expect(page.getByTestId("nav-settings")).toHaveCount(0);
    await gotoApp(page, "/settings");
    await expect(page.getByTestId("role-blocked")).toBeVisible();
  });

  test("profile page shows permissions and switches demo user", async ({ page }) => {
    await gotoApp(page, "/users");
    await page.locator("tbody tr").filter({ hasText: "Chamara Rathnayake" }).click();
    await expect(page).toHaveURL(/\/users\/.+/);
    await expect(page.getByTestId("permission-matrix")).toBeVisible();
    await page.getByTestId("switch-to-user").click();
    await expectToast(page, "Now viewing as Chamara Rathnayake");
    await expect(page.getByTestId("current-role")).toContainText("Operator");
  });
});

test.describe("Settings", () => {
  test("company name persists after reload", async ({ page }) => {
    await gotoApp(page, "/settings");
    const input = page.getByTestId("company-name");
    await input.fill("Ceylon Test Traders");
    await input.blur();
    await expectToast(page, "Settings saved");
    await page.reload();
    await expect(page.getByTestId("main-content")).toBeVisible();
    await expect(page.getByTestId("company-name")).toHaveValue("Ceylon Test Traders");
    await expect(page.getByTestId("sidebar")).toContainText("Ceylon Test Traders");
  });

  test("currency change updates the money format preview", async ({ page }) => {
    await gotoApp(page, "/settings");
    await expect(page.getByTestId("currency-preview")).toContainText("Rs");
    await page.getByTestId("currency-select").selectOption("USD");
    await expect(page.getByTestId("currency-preview")).toContainText("$");
    await page.reload();
    await expect(page.getByTestId("currency-preview")).toContainText("$");
  });

  test("dark theme choice persists after reload", async ({ page }) => {
    await gotoApp(page, "/settings");
    await page.getByTestId("settings-tab-appearance").click();
    await page.getByTestId("theme-option-dark").click();
    await expect(page.locator("html")).toHaveClass(/dark/);
    await page.reload();
    await expect(page.getByTestId("main-content")).toBeVisible();
    await expect(page.locator("html")).toHaveClass(/dark/);
  });

  test("low-stock factor shows a live flagged count", async ({ page }) => {
    await gotoApp(page, "/settings");
    await page.getByTestId("settings-tab-warehouse").click();
    const text = async () => (await page.getByTestId("low-stock-count").innerText()).trim();
    const before = await text();
    await page.getByTestId("low-stock-factor").fill("0.5");
    await expect(page.getByTestId("low-stock-factor-value")).toContainText("0.5");
    await expect.poll(text).not.toBe(before);
  });

  test("Reset Demo Data restores the seed", async ({ page }) => {
    await gotoApp(page, "/tasks");
    const title = "E2E reset me";
    await createTask(page, title);
    await taskSearch(page).fill(title);
    await expect(page.getByTestId("tasks-table")).toContainText(title);

    await gotoApp(page, "/settings");
    await page.getByTestId("settings-tab-data").click();
    await expect(page.getByTestId("data-info")).toBeVisible();
    await page.getByTestId("reset-demo").click();
    await page.getByTestId("confirm-action").click();
    await expect(page).toHaveURL(/\/dashboard/);

    await gotoApp(page, "/tasks");
    await taskSearch(page).fill(title);
    await expect(page.getByTestId("tasks-table")).toHaveCount(0);
    await expect(page.getByTestId("empty-state")).toBeVisible();
  });
});
