import { defineConfig, devices } from "@playwright/test";

/**
 * E2E configuration.
 *  - default: reuse a running dev server on :3100 (or start one)
 *  - E2E_PROD=1: build + start the production server on :3200 (what `npm run test:e2e:prod` uses)
 *
 * Artifacts (see TESTING.md):
 *   artifacts/test-results   per-test traces/videos (failures + workflow recordings)
 *   artifacts/screenshots    page screenshots in light & dark (tests/e2e/screenshots.spec.ts)
 *   artifacts/videos         recordings of the key workflows (tests/e2e/workflow-videos.spec.ts)
 *   artifacts/report         HTML report
 */
const prod = !!process.env.E2E_PROD;
const port = prod ? 3200 : 3100;

export default defineConfig({
  testDir: "./tests/e2e",
  outputDir: "./artifacts/test-results",
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  workers: process.env.CI ? 2 : 3,
  timeout: 60_000,
  expect: { timeout: 10_000 },
  reporter: [["list"], ["html", { outputFolder: "artifacts/report", open: "never" }]],
  use: {
    baseURL: `http://localhost:${port}`,
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    video: "off",
    actionTimeout: 10_000,
    navigationTimeout: 45_000,
  },
  projects: [
    { name: "desktop", use: { ...devices["Desktop Chrome"], viewport: { width: 1440, height: 900 } }, testIgnore: /mobile\.spec\.ts/ },
    { name: "mobile", use: { ...devices["Pixel 7"] }, testMatch: /mobile\.spec\.ts/ },
  ],
  webServer: {
    command: prod ? `npm run build && npm run start -- -p ${port}` : `npm run dev -- -p ${port}`,
    url: `http://localhost:${port}/dashboard`,
    reuseExistingServer: true,
    timeout: 300_000,
  },
});
