// Dev helper: node scripts/shot.mjs <path> [out.png] [--dark] [--mobile]
import { chromium } from "@playwright/test";

const [, , path = "/dashboard", out = "shot.png", ...flags] = process.argv;
const dark = flags.includes("--dark");
const mobile = flags.includes("--mobile");
const browser = await chromium.launch();
const ctx = await browser.newContext({
  viewport: mobile ? { width: 390, height: 844 } : { width: 1440, height: 900 },
  colorScheme: dark ? "dark" : "light",
});
const page = await ctx.newPage();
const errors = [];
page.on("pageerror", (e) => errors.push("pageerror: " + e.message));
page.on("console", (m) => m.type() === "error" && errors.push("console: " + m.text()));
await page.addInitScript((d) => localStorage.setItem("wms-theme", d ? "dark" : "light"), dark);
await page.goto("http://localhost:3100" + path, { waitUntil: "networkidle" });
await page.waitForSelector('[data-testid="main-content"]');
await page.waitForTimeout(800);
const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
await page.screenshot({ path: out, fullPage: true });
console.log(JSON.stringify({ path, horizontalOverflowPx: overflow, errors }, null, 2));
await browser.close();
