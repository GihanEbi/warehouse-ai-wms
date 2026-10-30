import { expect, test, type Page } from "@playwright/test";
import { gotoApp } from "./helpers";
import { lowStockProducts } from "../../src/lib/inventory/selectors";
import type { WmsData } from "../../src/types";

interface PersistedState {
  data: WmsData;
  settings: { lowStockThresholdFactor: number; aiEnabled: boolean };
  chats: { id: string; title: string; messages: { role: string; text: string }[] }[];
  dismissedRecommendations: string[];
}

const readState = (page: Page) =>
  page.evaluate(() => JSON.parse(localStorage.getItem("wms-state")!).state) as Promise<PersistedState>;

async function ask(page: Page, text: string) {
  const before = await page.getByTestId("ai-message-assistant").count();
  await page.getByTestId("ai-input").fill(text);
  await page.getByTestId("ai-send").click();
  await expect(page.getByTestId("ai-message-assistant")).toHaveCount(before + 1, { timeout: 10_000 });
  return page.getByTestId("ai-message-assistant").last();
}

test.describe("AI assistant", () => {
  test("a suggested prompt shows the typing indicator, then an answer", async ({ page }) => {
    await gotoApp(page, "/ai-assistant");
    const chips = page.getByTestId("ai-suggestion");
    await expect(chips).toHaveCount(10);
    await chips.filter({ hasText: "How many products are currently in stock?" }).click();
    await expect(page.getByTestId("ai-message-user")).toContainText("How many products are currently in stock?");
    await expect(page.getByTestId("ai-typing")).toBeVisible();
    await expect(page.getByTestId("ai-send")).toBeDisabled();
    const answer = page.getByTestId("ai-message-assistant");
    await expect(answer).toBeVisible();
    await expect(page.getByTestId("ai-typing")).toHaveCount(0);
    await expect(answer).toContainText("active products are currently in stock");
    await expect(answer.getByTestId("ai-stats")).toBeVisible();
    await expect(page.getByTestId("ai-disclaimer")).toContainText("it never changes inventory");
  });

  test("Enter sends once and the answer never claims an action was performed", async ({ page }) => {
    await gotoApp(page, "/ai-assistant");
    const input = page.getByTestId("ai-input");
    await input.fill("Which products should I reorder?");
    await input.press("Enter");
    await input.press("Enter"); // empty / busy: must not duplicate
    const answer = page.getByTestId("ai-message-assistant");
    await expect(answer).toHaveCount(1);
    await expect(page.getByTestId("ai-message-user")).toHaveCount(1);
    await expect(answer).toContainText("pre-filled draft purchase order");
    await expect(answer).not.toContainText(/I('| ha)ve (created|submitted|placed)/i);
  });

  test("low-stock answer lists the same products as the shared low-stock selector (scenario D)", async ({ page }) => {
    await gotoApp(page, "/ai-assistant");
    const answer = await ask(page, "Show low stock products");
    const state = await readState(page);
    const expected = lowStockProducts(state.data, "all", state.settings.lowStockThresholdFactor).map((l) => l.product.name);
    expect(expected.length).toBeGreaterThan(0);
    const names = await answer.getByTestId("ai-product-link").allInnerTexts();
    expect(names).toEqual(expected.slice(0, 12));

    // reorder recommendation cards with pre-filled draft PO links
    const cards = answer.getByTestId("ai-recommendation-card");
    await expect(cards.first()).toBeVisible();
    const href = await cards.first().getByTestId("ai-action").getAttribute("href");
    expect(href).toMatch(/^\/purchase-orders\/new\?product=[^&]+&supplier=[^&]+&warehouse=[^&]+&qty=\d+$/);

    // product link opens the product page
    const productId = (await answer.getByTestId("ai-product-link").first().getAttribute("href"))!.split("/").pop()!;
    await answer.getByTestId("ai-product-link").first().click();
    await expect(page).toHaveURL(new RegExp(`/products/${productId}$`), { timeout: 45_000 });
  });

  test("a recommendation action opens the pre-filled purchase order form", async ({ page }) => {
    await gotoApp(page, "/ai-assistant");
    const card = page.getByTestId("ai-recs-panel").getByTestId("ai-recommendation-card").filter({ has: page.locator('a[href^="/purchase-orders/new"]') }).first();
    const href = await card.getByTestId("ai-action").getAttribute("href");
    await card.getByTestId("ai-action").click();
    await expect(page).toHaveURL(new RegExp(`${href!.replace(/[?]/g, "\\?")}$`), { timeout: 45_000 });
  });

  test("unsupported question gets a friendly fallback with clickable suggestions", async ({ page }) => {
    await gotoApp(page, "/ai-assistant");
    const answer = await ask(page, "What is the weather like on Mars?");
    await expect(answer).toContainText("didn't understand");
    const chips = answer.getByTestId("ai-suggestion");
    await expect(chips).toHaveCount(10);
    await chips.filter({ hasText: "Show low stock products." }).click();
    await expect(page.getByTestId("ai-message-assistant")).toHaveCount(2);
    await expect(page.getByTestId("ai-message-assistant").last().getByTestId("ai-product-list")).toBeVisible();
  });

  test("a warehouse mentioned in the question scopes the answer", async ({ page }) => {
    await gotoApp(page, "/ai-assistant");
    const answer = await ask(page, "How many products are in stock in Kandy?");
    await expect(answer).toContainText("Kandy Regional Hub");
  });

  test("dismissing a recommendation hides it everywhere and it stays hidden after reload", async ({ page }) => {
    await gotoApp(page, "/ai-assistant");
    const panelCards = page.getByTestId("ai-recs-panel").getByTestId("ai-recommendation-card");
    await expect(panelCards.first()).toBeVisible();
    const id = (await panelCards.first().getAttribute("data-rec-id"))!;
    // show the same recommendation inside the chat too
    const answer = await ask(page, "Which products should I reorder?");
    const inChat = answer.locator(`[data-rec-id="${id}"]`);
    const chatHasIt = (await inChat.count()) > 0;

    await page.getByTestId("ai-recs-panel").locator(`[data-rec-id="${id}"]`).getByTestId("ai-dismiss").click();
    await expect(page.locator("[data-sonner-toast]").filter({ hasText: "Recommendation dismissed" }).first()).toBeVisible();
    await expect(page.locator(`[data-rec-id="${id}"]`)).toHaveCount(0);
    expect((await readState(page)).dismissedRecommendations).toContain(id);
    if (chatHasIt) await expect(inChat).toHaveCount(0);

    await page.reload();
    await expect(page.getByTestId("page-skeleton")).toHaveCount(0);
    await expect(page.getByTestId("ai-recs-panel")).toBeVisible();
    await expect(page.locator(`[data-rec-id="${id}"]`)).toHaveCount(0);
    await expect(page.getByTestId("ai-restore")).toBeVisible();
  });

  test("chat history persists after reload and can be deleted with confirmation", async ({ page }) => {
    await gotoApp(page, "/ai-assistant");
    await ask(page, "Show pending purchase orders.");
    await expect(page.getByTestId("ai-history-item")).toHaveCount(1);
    await expect(page.getByTestId("ai-history-item")).toContainText("Show pending purchase orders.");

    await page.reload();
    await expect(page.getByTestId("page-skeleton")).toHaveCount(0);
    await expect(page.getByTestId("ai-message-user")).toContainText("Show pending purchase orders.");
    await expect(page.getByTestId("ai-message-assistant").getByTestId("ai-table")).toBeVisible();
    await expect(page.getByTestId("ai-history-item")).toHaveCount(1);

    // new chat then switch back
    await page.getByTestId("ai-new-chat").click();
    await expect(page.getByTestId("ai-message-user")).toHaveCount(0);
    await page.getByTestId("ai-history-item").filter({ hasText: "Show pending purchase orders." }).click();
    await expect(page.getByTestId("ai-message-user")).toHaveCount(1);

    // delete asks for confirmation
    await page.getByRole("button", { name: /Delete conversation: Show pending purchase orders/ }).click();
    await expect(page.getByTestId("confirmation-dialog")).toBeVisible();
    await page.getByTestId("confirm-action").click();
    await expect(page.getByTestId("ai-history-item").filter({ hasText: "Show pending purchase orders." })).toHaveCount(0);
  });

  test("answers use live data: an approved PO shows up under pending purchase orders", async ({ page }) => {
    await gotoApp(page, "/ai-assistant");
    const before = await ask(page, "Show pending purchase orders");
    const state = await readState(page);
    const draft = state.data.purchaseOrders.find((p) => p.status === "draft")!;
    await expect(before.getByTestId("ai-table")).not.toContainText(draft.number);

    // approve a draft directly in persisted state (the PO module's UI is built separately)
    await page.evaluate((number) => {
      const raw = JSON.parse(localStorage.getItem("wms-state")!);
      const po = raw.state.data.purchaseOrders.find((p: { number: string }) => p.number === number);
      po.status = "approved";
      localStorage.setItem("wms-state", JSON.stringify(raw));
    }, draft.number);
    await page.reload();
    await expect(page.getByTestId("page-skeleton")).toHaveCount(0);
    const after = await ask(page, "Show pending purchase orders");
    await expect(after.getByTestId("ai-table")).toContainText(draft.number);
  });

  test("the header drawer opens, answers questions and shares the conversation", async ({ page }) => {
    await gotoApp(page, "/dashboard");
    await page.getByTestId("open-ai-drawer").click();
    const drawer = page.getByTestId("ai-drawer");
    await expect(drawer).toBeVisible();
    await drawer.getByTestId("ai-input").fill("Which warehouse has the most inventory?");
    await drawer.getByTestId("ai-input").press("Enter");
    await expect(drawer.getByTestId("ai-typing")).toBeVisible();
    const answer = drawer.getByTestId("ai-message-assistant");
    await expect(answer).toContainText("holds the most inventory");
    await expect(answer.getByTestId("ai-table")).toBeVisible();
    expect(await answer.locator("tr[data-highlight='true']").count()).toBe(1);
    // the conversation is stored, so the full page shows it
    await page.keyboard.press("Escape");
    await gotoApp(page, "/ai-assistant");
    await expect(page.getByTestId("ai-message-user")).toContainText("Which warehouse has the most inventory?");
  });

  test("disabled assistant shows an explanation with a link to settings", async ({ page }) => {
    await gotoApp(page, "/ai-assistant");
    await page.evaluate(() => {
      const raw = JSON.parse(localStorage.getItem("wms-state")!);
      raw.state.settings.aiEnabled = false;
      localStorage.setItem("wms-state", JSON.stringify(raw));
    });
    await page.reload();
    await expect(page.getByTestId("page-skeleton")).toHaveCount(0);
    await expect(page.getByTestId("ai-disabled")).toBeVisible();
    await expect(page.getByTestId("ai-disabled").getByRole("link", { name: /settings/i })).toHaveAttribute("href", "/settings");
    await expect(page.getByTestId("ai-input")).toHaveCount(0);
  });

  test("same question twice gives identical answers (deterministic)", async ({ page }) => {
    await gotoApp(page, "/ai-assistant");
    const a = await ask(page, "Which warehouse has the most inventory?");
    const textA = await a.innerText();
    const b = await ask(page, "Which warehouse has the most inventory?");
    // timestamps differ; compare the answer sentence and table
    expect(await b.getByTestId("ai-message-text").innerText()).toBe(await a.getByTestId("ai-message-text").innerText());
    expect(await b.getByTestId("ai-table").innerText()).toBe(await a.getByTestId("ai-table").innerText());
    expect(textA.length).toBeGreaterThan(0);
  });
});
