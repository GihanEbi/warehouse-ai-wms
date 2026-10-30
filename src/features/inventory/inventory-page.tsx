"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { AlertTriangle, Boxes, Lock, PackageCheck, SlidersHorizontal, Wallet, X } from "lucide-react";
import type { ID } from "@/types";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { DataTable, type Column } from "@/components/shared/data-table";
import { ExportButton } from "@/components/shared/export-button";
import { FilterDropdown, SearchInput, Toolbar } from "@/components/shared/form-controls";
import { PageHeader } from "@/components/shared/page-header";
import { ProductImage } from "@/components/shared/product-bits";
import { WarehouseSelector } from "@/components/shared/selectors";
import { StatCard } from "@/components/shared/stat-card";
import { StatusBadge } from "@/components/shared/status-badge";
import { useData, useFormat, usePermission, useSettings, useWarehouseScope } from "@/hooks/use-wms";
import { PRODUCT_CATEGORIES } from "@/lib/constants";
import { inTransitQty, inventoryValue, lowStockProducts, warehouseStock } from "@/lib/inventory/selectors";
import { AdjustStockDialog, type AdjustInitial } from "./adjust-stock-dialog";
import { MovementHistory } from "./movement-history";
import { ProductStockDrawer } from "./product-stock-drawer";
import { buildStockRows, filterStockRows, type StockRow, type StockStatusFilter } from "./rows";
import { StockCount } from "./stock-count";

type TabKey = "stock" | "movements" | "count";
const TABS: TabKey[] = ["stock", "movements", "count"];

const STATUS_OPTIONS = [
  { value: "attention", label: "Low / out of stock" },
  { value: "in_stock", label: "In stock" },
  { value: "low_stock", label: "Low stock" },
  { value: "out_of_stock", label: "Out of stock" },
  { value: "reserved", label: "Reserved" },
  { value: "blocked", label: "Blocked" },
];

export function InventoryPage() {
  const data = useData();
  const settings = useSettings();
  const fmt = useFormat();
  const { can } = usePermission();
  const router = useRouter();
  const params = useSearchParams();
  const [scope, setScope] = useWarehouseScope();

  const [tab, setTab] = useState<TabKey>("stock");
  const [q, setQ] = useState("");
  const [category, setCategory] = useState("all");
  const [status, setStatus] = useState<StockStatusFilter>("all");
  const [includeStaging, setIncludeStaging] = useState(false);
  const [productFilter, setProductFilter] = useState<ID | "">("");
  const [drawerProduct, setDrawerProduct] = useState<ID | null>(null);
  const [bannerDismissed, setBannerDismissed] = useState(false);
  const [adjust, setAdjust] = useState<{ open: boolean; initial?: AdjustInitial; reopenDrawer?: boolean }>({ open: false });

  // deep links: ?product=&warehouse=&status=&tab=
  const paramKey = params.toString();
  /* eslint-disable react-hooks/set-state-in-effect -- deep links intentionally sync URL params into local filter state */
  useEffect(() => {
    const p = new URLSearchParams(paramKey);
    const product = p.get("product");
    const warehouse = p.get("warehouse");
    const st = p.get("status");
    const t = p.get("tab");
    if (warehouse && data.warehouses.some((w) => w.id === warehouse)) setScope(warehouse);
    if (st && (st === "attention" || STATUS_OPTIONS.some((o) => o.value === st))) {
      setStatus(st as StockStatusFilter);
      setTab("stock");
    }
    if (t && (TABS as string[]).includes(t)) setTab(t as TabKey);
    if (product && data.products.some((x) => x.id === product)) {
      setProductFilter(product);
      setDrawerProduct(product);
      if (!t) setTab("stock");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- apply deep-link params when the URL changes
  }, [paramKey]);
  /* eslint-enable react-hooks/set-state-in-effect */

  const rows = useMemo(() => buildStockRows(data, scope, settings.lowStockThresholdFactor), [data, scope, settings.lowStockThresholdFactor]);
  const filtered = useMemo(
    () => filterStockRows(rows, { q, category, status, includeStaging, productId: productFilter }),
    [rows, q, category, status, includeStaging, productFilter],
  );

  const summary = useMemo(() => warehouseStock(data, scope), [data, scope]);
  const value = useMemo(() => inventoryValue(data, scope), [data, scope]);
  const low = useMemo(() => lowStockProducts(data, scope, settings.lowStockThresholdFactor), [data, scope, settings.lowStockThresholdFactor]);
  const transit = useMemo(() => inTransitQty(data, scope === "all" ? {} : { toWarehouseId: scope }), [data, scope]);
  const outCount = low.filter((l) => l.status === "out_of_stock").length;
  const canAdjust = can("inventory.adjust");
  const productFilterName = productFilter ? data.products.find((p) => p.id === productFilter)?.name : undefined;

  const openAdjust = useCallback((initial?: AdjustInitial, reopenDrawer = false) => {
    setDrawerProduct(null);
    setAdjust({ open: true, initial, reopenDrawer });
  }, []);

  const closeDrawer = useCallback(() => {
    setDrawerProduct(null);
    if (params.get("product")) {
      const p = new URLSearchParams(paramKey);
      p.delete("product");
      router.replace(p.toString() ? `/inventory?${p.toString()}` : "/inventory", { scroll: false });
    }
  }, [params, paramKey, router]);

  const columns = useMemo<Column<StockRow>[]>(
    () => [
      {
        id: "product",
        header: "Product",
        sortValue: (r) => r.product.name,
        cell: (r) => (
          <div className="flex min-w-0 items-center gap-2.5">
            <ProductImage product={r.product} size={32} />
            <span className="max-w-[11rem] truncate font-medium xl:max-w-[14rem]" title={r.product.name}>{r.product.name}</span>
          </div>
        ),
      },
      { id: "sku", header: "SKU", sortValue: (r) => r.product.sku, cell: (r) => <span className="font-mono text-xs whitespace-nowrap">{r.product.sku}</span> },
      { id: "warehouse", header: "Warehouse", sortValue: (r) => r.warehouse.code, hideOnMobile: true, cell: (r) => <span title={r.warehouse.name}>{r.warehouse.code}</span> },
      {
        id: "bin",
        header: "Location",
        sortValue: (r) => r.bin?.code ?? "~",
        cell: (r) =>
          r.bin ? (
            <span className="inline-flex items-center gap-1.5 whitespace-nowrap">
              <span className="font-mono text-xs">{r.bin.code}</span>
              {r.bin.type !== "storage" && (
                <span className="rounded bg-neutral-soft px-1 text-[10px] font-medium text-muted-foreground uppercase">{r.bin.type}</span>
              )}
            </span>
          ) : (
            <span className="text-muted-foreground">—</span>
          ),
      },
      { id: "onHand", header: "On hand", align: "right", sortValue: (r) => r.onHand, cell: (r) => <span className="tabular-nums" data-testid="cell-onhand">{fmt.number(r.onHand)}</span> },
      { id: "reserved", header: "Reserved", align: "right", sortValue: (r) => r.reserved, hideOnMobile: true, cell: (r) => <span className="tabular-nums">{fmt.number(r.reserved)}</span> },
      { id: "available", header: "Available", align: "right", sortValue: (r) => r.available, cell: (r) => <span className="font-medium tabular-nums">{fmt.number(r.available)}</span> },
      { id: "reorder", header: "Reorder level", align: "right", sortValue: (r) => r.product.reorderLevel, hideOnMobile: true, cell: (r) => <span className="tabular-nums text-muted-foreground">{fmt.number(r.product.reorderLevel)}</span> },
      { id: "status", header: "Status", sortValue: (r) => r.status, cell: (r) => <RowStatus row={r} /> },
      {
        id: "actions",
        header: "",
        align: "right",
        cell: (r) => (
          <Button
            variant="ghost"
            size="icon-sm"
            disabled={!canAdjust}
            title={canAdjust ? "Adjust this stock record" : "Your role cannot adjust stock"}
            aria-label={`Adjust ${r.product.name}`}
            data-testid="row-adjust"
            onClick={(e) => {
              e.stopPropagation();
              openAdjust({ productId: r.product.id, warehouseId: r.warehouse.id, binId: r.bin?.id });
            }}
          >
            <SlidersHorizontal />
          </Button>
        ),
      },
    ],
    [fmt, canAdjust, openAdjust],
  );

  return (
    <div className="space-y-5">
      <PageHeader
        title="Inventory"
        description="Stock levels by location, movement history and stock counts"
        actions={
          <Button onClick={() => openAdjust()} disabled={!canAdjust} title={canAdjust ? undefined : "Your role cannot adjust stock"} data-testid="adjust-stock">
            <SlidersHorizontal />
            Adjust Stock
          </Button>
        }
      />

      <section aria-label="Stock summary" className="grid grid-cols-2 gap-3 lg:grid-cols-3 xl:grid-cols-5">
        <StatCard testId="stat-total" title="Total Stock Quantity" value={fmt.number(summary.physical)} description="All locations" icon={Boxes} tone="info" />
        <StatCard testId="stat-available" title="Available" value={fmt.number(summary.available)} description="Pickable now" icon={PackageCheck} tone="success" />
        <StatCard testId="stat-reserved" title="Reserved" value={fmt.number(summary.reserved)} description="Allocated to orders" icon={Lock} tone="primary" />
        <StatCard
          testId="stat-low-stock"
          title="Low Stock Items"
          value={fmt.number(low.length)}
          description={`${outCount} out of stock`}
          icon={AlertTriangle}
          tone={outCount > 0 ? "danger" : low.length > 0 ? "warning" : "success"}
        />
        <StatCard testId="stat-value" title="Inventory Value" value={fmt.moneyCompact(value)} description={fmt.money(value)} icon={Wallet} tone="teal" className="col-span-2 lg:col-span-1" />
      </section>
      <div className="-mt-2 flex flex-wrap gap-2 text-xs" data-testid="stock-chips">
        <Chip label="Staging (awaiting putaway)" value={fmt.number(summary.staging)} />
        <Chip label="Returns (awaiting inspection)" value={fmt.number(summary.returns)} />
        <Chip label="In transit" value={fmt.number(transit)} />
        <Chip label="Blocked" value={fmt.number(summary.blocked)} />
      </div>

      {low.length > 0 && !bannerDismissed && (
        <Alert className="border-warning/40 bg-warning-soft" data-testid="low-stock-banner">
          <AlertTriangle className="text-warning" />
          <AlertTitle>
            {low.length} product{low.length === 1 ? "" : "s"} need attention
          </AlertTitle>
          <AlertDescription className="flex flex-wrap items-center gap-2 text-foreground/80">
            <span>
              {low.length - outCount} low on stock and {outCount} out of stock{scope === "all" ? " across all warehouses" : " in this warehouse"}.
            </span>
            <Button
              size="xs"
              variant="outline"
              onClick={() => {
                setStatus("attention");
                setProductFilter("");
                setTab("stock");
              }}
              data-testid="low-stock-filter"
            >
              Show low stock items
            </Button>
            <Button size="icon-xs" variant="ghost" className="ml-auto" onClick={() => setBannerDismissed(true)} aria-label="Dismiss low stock warning">
              <X />
            </Button>
          </AlertDescription>
        </Alert>
      )}

      <Tabs value={tab} onValueChange={(v) => setTab(v as TabKey)}>
        <TabsList className="max-w-full overflow-x-auto">
          <TabsTrigger value="stock" data-testid="tab-stock" className="px-3">
            Stock Levels
          </TabsTrigger>
          <TabsTrigger value="movements" data-testid="tab-movements" className="px-3">
            Movement History
          </TabsTrigger>
          <TabsTrigger value="count" data-testid="tab-count" className="px-3">
            Stock Count
          </TabsTrigger>
        </TabsList>

        <TabsContent value="stock">
          <div className="rounded-xl border bg-card shadow-card">
            <Toolbar>
              <SearchInput value={q} onChange={setQ} placeholder="Search product, SKU or location…" />
              <label className="flex items-center gap-2 text-xs text-muted-foreground">
                <span className="shrink-0">Warehouse</span>
                <WarehouseSelector value={scope} onChange={setScope} includeAll className="min-w-[10rem] flex-1 text-foreground" />
              </label>
              <FilterDropdown
                label="Category"
                value={category}
                onChange={setCategory}
                options={PRODUCT_CATEGORIES.map((c) => ({ value: c, label: c }))}
                allLabel="All categories"
              />
              <FilterDropdown label="Status" value={status} onChange={(v) => setStatus(v as StockStatusFilter)} options={STATUS_OPTIONS} allLabel="All statuses" />
              <label className="flex cursor-pointer items-center gap-2 text-xs text-muted-foreground">
                <Checkbox checked={includeStaging} onCheckedChange={(c) => setIncludeStaging(c === true)} data-testid="include-staging" aria-label="Include staging and returns locations" />
                Include staging / returns
              </label>
              <div className="sm:ml-auto">
                <ExportButton
                  filename="inventory-stock"
                  getData={() => ({
                    headers: ["Product", "SKU", "Category", "Warehouse", "Location", "Location type", "On hand", "Reserved", "Blocked", "Available", "Reorder level", "Status"],
                    rows: filtered.map((r) => [
                      r.product.name,
                      r.product.sku,
                      r.product.category,
                      r.warehouse.code,
                      r.bin?.code ?? "",
                      r.bin?.type ?? "",
                      r.onHand,
                      r.reserved,
                      r.blocked,
                      r.available,
                      r.product.reorderLevel,
                      r.status,
                    ]),
                  })}
                />
              </div>
            </Toolbar>
            {(productFilterName || status !== "all") && (
              <div className="flex flex-wrap items-center gap-2 border-b px-3 py-2 text-xs" data-testid="active-filters">
                <span className="text-muted-foreground">Filtered by:</span>
                {productFilterName && (
                  <FilterChip label={`Product: ${productFilterName}`} onClear={() => setProductFilter("")} />
                )}
                {status !== "all" && <FilterChip label={`Status: ${STATUS_OPTIONS.find((o) => o.value === status)?.label ?? status}`} onClear={() => setStatus("all")} />}
              </div>
            )}
            <DataTable
              testId="inventory-table"
              data={filtered}
              columns={columns}
              getRowId={(r) => r.id}
              initialSort={{ id: "product" }}
              onRowClick={(r) => setDrawerProduct(r.product.id)}
              empty={{ title: "No stock records match", description: "Adjust the filters, or include staging / returns locations." }}
              footerNote={<span className="hidden sm:inline">{fmt.number(filtered.reduce((s, r) => s + r.onHand, 0))} units in view</span>}
              mobileCard={(r) => (
                <div className="space-y-2">
                  <div className="flex items-center gap-2.5">
                    <ProductImage product={r.product} size={36} />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium">{r.product.name}</p>
                      <p className="truncate font-mono text-[11px] text-muted-foreground">
                        {r.product.sku} · {r.bin?.code ?? "no stock"} · {r.warehouse.code}
                      </p>
                    </div>
                    <RowStatus row={r} />
                  </div>
                  <div className="grid grid-cols-3 gap-2 text-center text-xs">
                    <MiniStat label="On hand" value={fmt.number(r.onHand)} />
                    <MiniStat label="Reserved" value={fmt.number(r.reserved)} />
                    <MiniStat label="Available" value={fmt.number(r.available)} />
                  </div>
                </div>
              )}
            />
          </div>
        </TabsContent>

        <TabsContent value="movements">
          <MovementHistory productId={productFilter} onOpenProduct={setDrawerProduct} />
        </TabsContent>

        <TabsContent value="count">
          <StockCount />
        </TabsContent>
      </Tabs>

      <ProductStockDrawer
        productId={drawerProduct}
        scope={scope}
        onClose={closeDrawer}
        onAdjust={(productId, warehouseId, binId) => openAdjust({ productId, warehouseId, binId }, true)}
      />

      <AdjustStockDialog
        open={adjust.open}
        onOpenChange={(o) => setAdjust((a) => ({ ...a, open: o }))}
        initial={adjust.initial}
        defaultWarehouseId={scope}
        onSuccess={(productId) => {
          if (adjust.reopenDrawer) setDrawerProduct(productId);
        }}
      />
    </div>
  );
}

function RowStatus({ row }: { row: StockRow }) {
  if (row.bin && row.bin.type === "staging") return <StatusBadge status="pending" label="Awaiting putaway" />;
  if (row.bin && row.bin.type === "returns") return <StatusBadge status="pending" label="Awaiting inspection" />;
  return <StatusBadge status={row.status} />;
}

function Chip({ label, value }: { label: string; value: string }) {
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full border bg-card px-2.5 py-1">
      <span className="text-muted-foreground">{label}</span>
      <strong className="tabular-nums">{value}</strong>
    </span>
  );
}

function FilterChip({ label, onClear }: { label: string; onClear: () => void }) {
  return (
    <span className="inline-flex items-center gap-1 rounded-full bg-primary-soft py-0.5 pr-1 pl-2.5 font-medium text-primary">
      {label}
      <button type="button" onClick={onClear} aria-label={`Remove filter ${label}`} className="flex size-4 items-center justify-center rounded-full hover:bg-primary/15">
        <X className="size-3" />
      </button>
    </span>
  );
}

function MiniStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md bg-muted/60 px-2 py-1">
      <p className="text-[10px] text-muted-foreground">{label}</p>
      <p className="font-semibold tabular-nums">{value}</p>
    </div>
  );
}
