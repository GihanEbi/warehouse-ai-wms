import { test } from "@playwright/test";
import fs from "node:fs";
import path from "node:path";
import { adjustInventory, fulfilOrder, receiveNewStock, transferStock } from "./flows";

/**
 * Records the four key workflows as .webm videos into artifacts/videos/ (run: npm run videos).
 * Each recording uses a fresh browser context with video enabled and short human-paced pauses.
 */
const OUT = path.resolve("artifacts/videos");
test.describe.configure({ mode: "serial", timeout: 240_000 });

const flows: { name: string; run: (page: import("@playwright/test").Page, pause: (ms?: number) => Promise<void>) => Promise<unknown> }[] = [
  { name: "goods-receiving", run: (page, pause) => receiveNewStock(page, { qty: 24, pause }) },
  { name: "stock-transfer", run: (page, pause) => transferStock(page, { qty: 9, pause }) },
  { name: "order-fulfillment", run: (page, pause) => fulfilOrder(page, { pause }) },
  { name: "inventory-adjustment", run: (page, pause) => adjustInventory(page, { qty: 12, pause }) },
];

for (const flow of flows) {
  test(`record: ${flow.name}`, async ({ browser }) => {
    fs.mkdirSync(OUT, { recursive: true });
    const context = await browser.newContext({
      viewport: { width: 1280, height: 800 },
      recordVideo: { dir: path.join(OUT, ".tmp"), size: { width: 1280, height: 800 } },
    });
    const page = await context.newPage();
    const pause = (ms = 700) => page.waitForTimeout(ms);
    try {
      await flow.run(page, pause);
      await pause(1500);
    } finally {
      const video = page.video();
      await context.close(); // finalises the file
      if (video) await video.saveAs(path.join(OUT, `${flow.name}.webm`));
      fs.rmSync(path.join(OUT, ".tmp"), { recursive: true, force: true });
    }
  });
}
