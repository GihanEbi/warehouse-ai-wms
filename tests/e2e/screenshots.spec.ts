import { test } from "@playwright/test";
import fs from "node:fs";
import path from "node:path";
import { gotoApp } from "./helpers";
import { MAIN_ROUTES } from "./routes";

/**
 * Captures a full-page screenshot of every major page in light and dark themes into
 * artifacts/screenshots/{light,dark}/<slug>.png  (run: npm run screenshots).
 * Only meaningful when it actually runs — docs reference the files it produces.
 */
const OUT = path.resolve("artifacts/screenshots");

for (const theme of ["light", "dark"] as const) {
  test.describe(`screenshots (${theme})`, () => {
    test.use({ colorScheme: theme, viewport: { width: 1440, height: 900 } });
    test.beforeAll(() => fs.mkdirSync(path.join(OUT, theme), { recursive: true }));

    for (const r of MAIN_ROUTES) {
      test(`${r.slug}`, async ({ page }) => {
        await page.addInitScript((t) => localStorage.setItem("wms-theme", t), theme);
        await gotoApp(page, r.path);
        await page.waitForTimeout(1200); // charts/animations settle
        await page.screenshot({ path: path.join(OUT, theme, `${r.slug}.png`), fullPage: true });
      });
    }
  });
}
