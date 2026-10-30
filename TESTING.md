# Testing

The prototype is covered by Playwright end-to-end tests plus two data-integrity scripts. Everything runs in the browser against the shared mock store — there is no backend to start.

## Quick start

```bash
npm install
npx playwright install chromium        # first time only

npm run dev -- -p 3100                 # terminal 1 (tests reuse it if already running)
npm run test:e2e                       # terminal 2: desktop + mobile projects

# or against the production build (slower to start, closest to what you would ship)
npm run test:e2e:prod                  # builds, serves on :3200, runs every test
```

| Command | What it does |
| --- | --- |
| `npm run typecheck` | `tsc --noEmit` (strict TypeScript) |
| `npm run check:seed` | Generates the seed and verifies it: replay produced zero warnings, **movement history == on-hand** for every product×warehouse, **reservations == open-order allocations**, no negative stock, unique SKUs, bins within capacity |
| `npm run check:ai` | Unit checks of the mock AI engine (determinism, answers equal the shared selectors, fallback, never claims to have acted) |
| `npm run test:e2e` | All Playwright specs (desktop Chrome 1440×900 + mobile Pixel 7) |
| `npm run screenshots` | Full-page screenshots of every major page in light **and** dark → `artifacts/screenshots/{light,dark}/` |
| `npm run videos` | Records the four key workflows → `artifacts/videos/` |

Each test gets a **fresh browser context**, so each starts from a newly generated seed (the seed is anchored to "now", so dates always look live). Tests therefore assert on *relative* changes (e.g. "available stock increases by exactly N") rather than absolute numbers.

## Spec map

| Spec | Covers |
| --- | --- |
| `app.spec.ts` | Dashboard KPIs, sidebar navigation to every module, create/wizard routes render, theme switching + persistence, sidebar collapse persistence, global search, notification badge, warehouse scope persistence, demo-role switcher |
| `master-data.spec.ts` | Product create / edit / archive, warehouse create, supplier create |
| `insights.spec.ts` | Dashboard ↔ warehouse selector, stock adjustment updates inventory + movement history + dashboard, invalid (negative) adjustment is rejected, CSV exports, report tabs |
| `inbound.spec.ts` | Scenario A: PO → approve → receive → **staging (not available)** → putaway → **available**; stock transfers (in-transit, totals); over-transfer rejected |
| `outbound.spec.ts` | Scenario B: order → confirm (reserve) → pick → pack → ship → dispatch (physical stock reduced, reservation released, movements written); over-pick rejected; returns restock only approved units |
| `admin.spec.ts` | Tasks (table/kanban), notifications, users & simulated roles, settings persistence, Reset Demo Data |
| `ai.spec.ts` | Scenario D: assistant answers from live data, recommendations, dismissal persistence, chat history, header drawer |
| `workflows.spec.ts` | Cross-module scenarios A–D end to end + data-integrity invariants after each workflow |
| `persistence.spec.ts` | Created records, completed workflow steps, settings and theme survive a page refresh |
| `mobile.spec.ts` | (mobile project) navigation drawer and **no horizontal overflow** on every route |
| `screenshots.spec.ts` | Screenshot capture (light/dark) |
| `workflow-videos.spec.ts` | Video capture of Goods Receiving, Stock Transfer, Order Fulfillment, Inventory Adjustment |

## Integrity hook

After the store hydrates, the app exposes a **read-only** debugging hook:

```js
window.__wms.data()        // current data snapshot
window.__wms.integrity()   // { movementMismatches: [], reservationMismatches: [] }
```

Workflow tests call `integrity()` after every transaction chain to prove that "movement history matches inventory" and "reservations match open orders" — the two invariants the whole prototype depends on.

## Artifacts

```
artifacts/
  screenshots/light|dark/   page screenshots          (npm run screenshots)
  videos/                   workflow recordings (.webm) (npm run videos)
  test-results/             traces, failure screenshots and per-test videos
  report/                   Playwright HTML report     (npx playwright show-report artifacts/report)
```

Screenshots and videos exist only after the commands above have been run successfully on your machine; they are generated artifacts, not hand-made images.
