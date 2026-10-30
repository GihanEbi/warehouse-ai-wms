# Developer notes — read this before building a module

Frontend-only WMS prototype. Next.js 16 (App Router) · TypeScript strict · Tailwind v4 · shadcn/ui (**Base UI flavour, not Radix**) · Zustand · React Hook Form + Zod 4 · Recharts · date-fns · Sonner · Playwright.

Dev server: `npm run dev -- -p 3100` (already running while you work — don't start another). Type-check: `npx tsc --noEmit`. Seed sanity check: `npm run check:seed`. Look at a page: `node scripts/shot.mjs /path out.png [--dark] [--mobile]` (prints horizontal-overflow px + console errors), then Read the PNG.

## Architecture in one minute

* **Single source of truth** = `WmsData` (`src/types/index.ts`) held in the Zustand store `useWmsStore` (`src/stores/wms-store.ts`), persisted to localStorage (versioned by `SEED_VERSION`).
* **Seed** (`src/data/mock/seed.ts`) replays ~75 days of history through the same transaction functions the UI uses → balances, reservations, movements, tasks and notifications are consistent. Don't hand-edit seed data in modules.
* **Transactions** live in `src/lib/workflows/*.ts` as pure functions `(draft, ctx, input) => Result`. The store clones state, runs the function, and commits only on `ok`. **UI never mutates data directly** — call `const tx = useTx(); tx.createProduct(input)`. All validation (negative stock, over-picking, capacity…) is inside the workflows; surface `result.error` in the UI.
* **Selectors** (`src/lib/inventory/selectors.ts`) define stock maths once: `productStock`, `warehouseStock`, `getStockStatus`, `lowStockProducts`, `inventoryValue`, `inTransitQty`, `utilization`, `warehouseCapacity`, `availableInWarehouse`, `reconcileMovements`… Use them; never recompute stock rules in components.
* Pages are client components. The shell shows a skeleton until the store is hydrated, so **pages can assume data is loaded**. Page content is inside a `<Suspense>`, so `useSearchParams()` is allowed.

### Stock definitions (do not deviate)
* `onHand` physical units in a bin · `reserved` allocated to confirmed orders · `blocked` quarantined · `available = max(0, onHand − reserved − blocked)` for **storage** bins only.
* Bin types: `storage` (pickable) · `staging` (received, awaiting putaway – **never pickable**) · `returns` (awaiting inspection – never pickable).
* In-transit = dispatched inter-warehouse transfer lines not yet received (held on the transfer, not in any bin). No double counting.
* Dispatch reduces `onHand` **and** releases `reserved`. Receiving → staging → putaway → available.

## Store API (`useWmsStore`)
Hooks in `src/hooks/use-wms.ts`: `useData()`, `useSettings()`, `useTx()`, `useIndex()` (id→entity Maps: products, warehouses, bins, users, suppliers, customers, zones, racks), `useFormat()` (`money`, `moneyCompact`, `number`, `compact`, `date`, `dateTime`, `time`, `relative` — honour currency/date/timezone settings; amounts are stored in LKR), `useCurrentUser()`, `usePermission()` → `{ can("po.approve"), role }` (simulated roles; use `can` to disable/hide actions), `useWarehouseScope()` → `[scope, setScope]` (header warehouse selector; `"all"` or warehouse id), `useHydrated()`.
Other store state/actions (select with `useWmsStore(s => …)`): `dateRange/setDateRange`, notifications (`markNotificationRead`, `markAllNotificationsRead`, `clearNotification`, `clearReadNotifications`), AI (`chats`, `activeChatId`, `newChat`, `appendChatMessages`, `setActiveChat`, `deleteChat`, `dismissedRecommendations`, `dismissRecommendation`, `restoreRecommendations`), `settings/updateSettings`, `resetDemo`, `setCurrentUser`, `currentUserId`.
`tx.*` methods (see the Tail<> list in the store; signatures = workflow function minus `(draft, ctx)`): warehouses/zones/racks/bins, products, suppliers, customers, users, tasks, `adjustStock`, `applyStockCount`, purchase orders (`create/update/approve/cancel`), `confirmGoodsReceipt`, `completePutaway`, transfers (`create/update/submit/approve/dispatch/receive/cancel`), orders (`create/update/confirm/cancel/startPicking/confirmPick/packOrder`), shipping (`createShipment/confirmDispatch/advanceShipment`), returns (`create/receive/inspect/approveRestock/reject`). They return `Result<T>` = `{ok:true,value}` or `{ok:false,error}`. Helpers exported from workflow files: `poTotal`, `orderTotal`, `poOutstanding`, `suggestPutawayBin`, `returnableQty`, `checkOrderAvailability`, `generateSku`, `generateTrackingNumber`, `ADJUSTMENT_TYPE_LABELS`.
**If you truly need a new transaction or selector**, add it in a *new* file or append to the relevant workflow/selector file with minimal, additive edits, register it in the store's `tx` map, and mention it in your report. Do not change existing signatures.

## Shared UI kit (`src/components/shared`) — reuse, don't re-invent
`PageHeader`, `Section` (titled card), `InfoItem` (page-header.tsx) · `StatCard` · `StatusBadge` (`status`, optional `domain` for ambiguous words like return "received") & `PriorityBadge` · `EmptyState`, `TableSkeleton`, `CardGridSkeleton`, `PageSkeleton` (states.tsx) · `DataTable` + `Column<T>` (data-table.tsx: sorting, pagination, `rowHref`/`onRowClick`, `mobileCard`, empty state; give it already-filtered rows) · `SearchInput`, `FilterDropdown`, `NativeSelect`, `FormField`, `Toolbar` (form-controls.tsx) · `ConfirmationDialog`, `FormDialog`, `DetailDrawer` (dialogs.tsx) · `StepProgress`, `ActivityTimeline` (progress.tsx) · `ProductSelector`, `ProductImage`, `BarcodeDisplay` (product-bits.tsx) · `WarehouseSelector` (selectors.tsx) · `DateRangePicker` + `presetRange` · `ExportButton` (+ `lib/csv.ts`) · `LinkButton` (a real `<a>` that looks like a Button) · `NOTIFICATION_META` · `TONE_CLASSES`/`Tone`.
Charts: Recharts. Use CSS vars for colours (`var(--chart-1)`…`--chart-5`, `var(--success)`, `var(--warning)`, `var(--danger)`) so charts adapt to dark mode; wrap in `ResponsiveContainer`; always give axis/tooltip/grid readable colours via `var(--muted-foreground)` / `var(--border)` and a tooltip styled with `var(--popover)`.

### Base UI gotchas (shadcn "base-nova")
* **No `asChild`.** Use `render={<Link …/>}` on triggers, or `LinkButton`. Menu/Popover/Tooltip triggers accept `render`.
* **Do not use `components/ui/select.tsx`** (its `SelectValue` shows raw values). Use `NativeSelect` / `FilterDropdown` / `WarehouseSelector`.
* `Dialog`/`Sheet`/`Popover` are controlled with `open`/`onOpenChange`. `DialogContent` default width is `sm:max-w-sm` — pass a wider class or use `FormDialog`.
* Tabs: `<Tabs value onValueChange><TabsList><TabsTrigger value>…</TabsTrigger></TabsList><TabsContent value>`; add `data-testid`s yourself.
* `DropdownMenuItem` takes `onClick`. Labels need a Group — use a plain `<div>` for headings.
* Icons: `lucide-react` (v1). Check a name exists before using (`grep` in `node_modules/lucide-react/dist/lucide-react.d.ts`).

## Forms recipe (React Hook Form + Zod 4)
```tsx
const schema = z.object({
  name: z.string().trim().min(1, "Name is required"),
  qty: z.number({ error: "Enter a number" }).int("Whole numbers only").min(1, "Must be at least 1"),
});
type Values = z.infer<typeof schema>;
const form = useForm<Values>({ resolver: zodResolver(schema), defaultValues: { name: "", qty: 1 } });
const { submit, pending } = useSubmit();                       // lock + latency + toasts
const onSubmit = form.handleSubmit(async (v) => {
  const res = await submit(() => tx.createThing(v), { success: "Thing created" });
  if (res?.ok) onOpenChange(false);
});
<FormDialog open onOpenChange title="…" pending={pending} onSubmit={onSubmit}>
  <FormField id="name" label="Name" required error={form.formState.errors.name?.message}>
    <Input id="name" {...form.register("name")} />
  </FormField>
  <FormField id="qty" label="Qty" required error={…}><Input id="qty" type="number" {...form.register("qty", { valueAsNumber: true })} /></FormField>
```
Use `valueAsNumber` for numeric inputs (avoid `z.coerce`). Reset the form when the dialog opens. Field-level errors + required `*` markers are mandatory. Submit buttons must be disabled while pending. **Never** use `alert()/confirm()/prompt()`.

## Conventions
* `"use client"` pages under `src/app/(dashboard)/<route>/page.tsx`; feature components in `src/features/<module>/`. Keep page files thin; put forms/tables/dialogs in feature components.
* Every page: `PageHeader` (title, description, primary actions) → toolbar (search/filters) → content in `Section`/cards → loading/empty states. Detail pages: back link/breadcrumb is automatic; show `StatusBadge`, `StepProgress`, `ActivityTimeline` where relevant.
* Every visible button must do something. Navigation = `LinkButton`/`Link`. Disable actions the current role can't do via `usePermission().can(...)` (and show a tooltip/title explaining).
* Tables: search + sort + status filter + pagination + row click → detail; provide `mobileCard`. Lists use *derived* data from `useData()` via `useMemo`; never hold copies of records in React state.
* Money via `fmt.money()`; dates via `fmt.date()/dateTime()`; quantities via `fmt.number()`. No hard-coded business numbers in components.
* Add `data-testid` to key controls/values you expect tests to touch (primary action buttons, stat values, tables, form fields use `id`/labels). Prefer accessible roles/labels in tests.
* Colours only via semantic tokens (`text-success`, `bg-warning-soft`, `text-primary`, `bg-muted`…). No raw hex / `bg-white` / `text-black` outside the barcode & print views — everything must work in dark mode.
* No horizontal page overflow at 390px: wrap long text, use `min-w-0`, put wide tables inside `DataTable` (scrolls inside its container) or give `mobileCard`.
* Strict TS, no `any` (document unavoidable exceptions). Don't add dependencies without need.
* Concurrency etiquette: several people edit the repo at once. **Only edit files you own** (your module's page(s) + `src/features/<your-module>/`). Shared files (`components/shared/*`, `lib/*`, `stores/*`, `types/*`, `components/layout/*`) may only get small additive changes. `npx tsc --noEmit` may show errors from other modules that are mid-edit — ignore those; fix only yours.

## Routes (all must exist, none may be placeholders)
`/dashboard` · `/warehouses`, `/warehouses/[id]` · `/products`, `/products/[id]` · `/inventory` · `/suppliers`, `/suppliers/[id]` · `/purchase-orders`, `/purchase-orders/new`, `/purchase-orders/[id]`, `/purchase-orders/[id]/print` · `/receiving`, `/receiving/new`(?po=<id>), `/receiving/[id]` · `/transfers`, `/transfers/new`, `/transfers/[id]` · `/orders`, `/orders/new`, `/orders/[id]` · `/picking-packing`, `/picking-packing/pack/[orderId]` · `/shipping`, `/shipping/[id]` · `/returns`, `/returns/new`, `/returns/[id]` · `/tasks` · `/ai-assistant` · `/reports`, `/reports/print` · `/notifications` · `/users`, `/users/[id]` (profile) · `/settings`.
Cross-module deep links (agree on these): inventory `?product=<id>&warehouse=<id>` prefilters; tasks `?task=<id>` opens a task; picking-packing `?order=<id>`; purchase-orders/new `?supplier=<id>&warehouse=<id>&product=<id>&qty=<n>` prefills a **draft** (AI "create draft PO"); notifications link to the record `href` stored on each notification.
