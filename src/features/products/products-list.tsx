"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Archive, ArchiveRestore, Eye, PackageSearch, Pencil, Plus, Power } from "lucide-react";
import type { Product } from "@/types";
import { Button } from "@/components/ui/button";
import { DataTable, type Column } from "@/components/shared/data-table";
import { ExportButton } from "@/components/shared/export-button";
import { FilterDropdown, NativeSelect, SearchInput, Toolbar } from "@/components/shared/form-controls";
import { PageHeader } from "@/components/shared/page-header";
import { ProductImage } from "@/components/shared/product-bits";
import { StatusBadge } from "@/components/shared/status-badge";
import { useData, useFormat, usePermission, useSettings } from "@/hooks/use-wms";
import { getStockStatus, productStock, type StockStatus, type StockSummary } from "@/lib/inventory/selectors";
import { PRODUCT_CATEGORIES } from "@/lib/constants";
import { RowActions } from "@/features/master-data/row-actions";
import { ProductFormDialog } from "./product-form-dialog";
import { useProductStatusChange } from "./use-product-status";

interface Row {
  product: Product;
  summary: StockSummary;
  stockStatus: StockStatus;
}

const STOCK_FILTERS = [
  { value: "in_stock", label: "In stock" },
  { value: "low_stock", label: "Low stock" },
  { value: "out_of_stock", label: "Out of stock" },
  { value: "reserved", label: "Fully reserved" },
  { value: "blocked", label: "Blocked" },
];

export function ProductsList() {
  const data = useData();
  const settings = useSettings();
  const fmt = useFormat();
  const router = useRouter();
  const { can } = usePermission();
  const canWrite = can("products.write");
  const [q, setQ] = useState("");
  const [category, setCategory] = useState("all");
  const [stock, setStock] = useState("all");
  const [status, setStatus] = useState("current");
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<Product | null>(null);
  const statusChange = useProductStatusChange();

  const rows = useMemo<Row[]>(
    () =>
      data.products.map((product) => {
        const summary = productStock(data, product.id);
        return { product, summary, stockStatus: getStockStatus(summary, product.reorderLevel, settings.lowStockThresholdFactor) };
      }),
    [data, settings.lowStockThresholdFactor],
  );

  const filtered = useMemo(() => {
    const term = q.trim().toLowerCase();
    return rows.filter((r) => {
      const p = r.product;
      if (status === "current" ? p.status === "archived" : status !== "all" && p.status !== status) return false;
      if (category !== "all" && p.category !== category) return false;
      if (stock !== "all" && r.stockStatus !== stock) return false;
      return !term || p.name.toLowerCase().includes(term) || p.sku.toLowerCase().includes(term) || p.barcode.includes(term);
    });
  }, [rows, q, category, stock, status]);

  const openCreate = () => {
    setEditing(null);
    setFormOpen(true);
  };

  const columns = useMemo<Column<Row>[]>(
    () => [
      {
        id: "name",
        header: "Product",
        sortValue: (r) => r.product.name,
        cell: (r) => (
          <div className="flex min-w-0 items-center gap-2.5">
            <ProductImage product={r.product} size={36} />
            <span className="block max-w-44 truncate font-medium" title={r.product.name}>{r.product.name}</span>
          </div>
        ),
      },
      { id: "sku", header: "SKU", sortValue: (r) => r.product.sku, cell: (r) => <span className="font-mono text-xs whitespace-nowrap">{r.product.sku}</span> },
      { id: "category", header: "Category", hideOnMobile: true, sortValue: (r) => r.product.category, cell: (r) => <span className="block max-w-32 text-xs leading-snug">{r.product.category}</span> },
      {
        id: "cost",
        header: "Cost / Price",
        align: "right",
        sortValue: (r) => r.product.unitCost,
        cell: (r) => (
          <div className="tabular-nums whitespace-nowrap">
            <p>{fmt.money(r.product.unitCost)}</p>
            <p className="text-xs text-muted-foreground">{r.product.sellingPrice === null ? "No price" : fmt.money(r.product.sellingPrice)}</p>
          </div>
        ),
      },
      {
        id: "stock",
        header: "Total stock",
        align: "right",
        sortValue: (r) => r.summary.available,
        cell: (r) => (
          <div className="tabular-nums whitespace-nowrap" data-testid="product-stock">
            <p className="font-medium">
              {fmt.number(r.summary.available)} <span className="text-xs font-normal text-muted-foreground">{r.product.uom}</span>
            </p>
            <p className="text-xs text-muted-foreground">{fmt.number(r.summary.onHand)} on hand</p>
          </div>
        ),
      },
      { id: "reorder", header: "Reorder", align: "right", hideOnMobile: true, sortValue: (r) => r.product.reorderLevel, cell: (r) => <span className="tabular-nums">{fmt.number(r.product.reorderLevel)}</span> },
      { id: "stockStatus", header: "Stock status", sortValue: (r) => r.stockStatus, cell: (r) => <StatusBadge status={r.stockStatus} /> },
      { id: "status", header: "Status", sortValue: (r) => r.product.status, cell: (r) => <StatusBadge status={r.product.status} /> },
      {
        id: "actions",
        header: "Actions",
        align: "right",
        cell: (r) => {
          const p = r.product;
          return (
            <RowActions
              actions={[
                { key: "view", label: "View details", icon: Eye, onClick: () => router.push(`/products/${p.id}`) },
                {
                  key: "edit",
                  label: "Edit",
                  icon: Pencil,
                  disabled: !canWrite,
                  onClick: () => {
                    setEditing(p);
                    setFormOpen(true);
                  },
                },
                { key: "deactivate", label: "Deactivate", icon: Power, hidden: p.status !== "active", disabled: !canWrite, onClick: () => statusChange.request(p, "inactive") },
                { key: "reactivate", label: "Reactivate", icon: Power, hidden: p.status !== "inactive", disabled: !canWrite, onClick: () => statusChange.request(p, "active") },
                { key: "archive", label: "Archive", icon: Archive, hidden: p.status === "archived", destructive: true, disabled: !canWrite, onClick: () => statusChange.request(p, "archived") },
                { key: "restore", label: "Restore", icon: ArchiveRestore, hidden: p.status !== "archived", disabled: !canWrite, onClick: () => statusChange.request(p, "active") },
              ]}
            />
          );
        },
      },
    ],
    // eslint-disable-next-line react-hooks/exhaustive-deps -- statusChange.request only sets state
    [fmt, router, canWrite],
  );

  return (
    <>
      <PageHeader
        title="Products"
        description="Catalog of everything you stock, with live availability across warehouses."
        actions={
          <>
            <ExportButton
              filename="products"
              getData={() => ({
                headers: ["SKU", "Name", "Category", "UoM", "Unit cost", "Selling price", "Total stock (available)", "On hand", "Reserved", "Blocked", "Reorder level", "Stock status", "Status", "Barcode"],
                rows: filtered.map((r) => [
                  r.product.sku, r.product.name, r.product.category, r.product.uom, r.product.unitCost, r.product.sellingPrice,
                  r.summary.available, r.summary.onHand, r.summary.reserved, r.summary.blocked, r.product.reorderLevel, r.stockStatus, r.product.status, r.product.barcode,
                ]),
              })}
            />
            <Button onClick={openCreate} disabled={!canWrite} title={canWrite ? undefined : "Your role cannot add products"} data-testid="add-product">
              <Plus />
              Add product
            </Button>
          </>
        }
      />

      <div className="rounded-xl border bg-card shadow-card">
        <Toolbar>
          <SearchInput value={q} onChange={setQ} placeholder="Search name, SKU or barcode…" />
          <FilterDropdown label="Category" value={category} onChange={setCategory} options={PRODUCT_CATEGORIES.map((c) => ({ value: c, label: c }))} allLabel="All categories" className="sm:w-60" />
          <FilterDropdown label="Stock" value={stock} onChange={setStock} options={STOCK_FILTERS} allLabel="All levels" className="sm:w-48" />
          <label className="flex items-center gap-2 text-xs text-muted-foreground sm:w-60">
            <span className="shrink-0">Status</span>
            <NativeSelect
              aria-label="Status"
              value={status}
              onChange={(e) => setStatus(e.target.value)}
              className="min-w-[8rem] flex-1 text-foreground"
              options={[
                { value: "current", label: "Active & inactive" },
                { value: "active", label: "Active" },
                { value: "inactive", label: "Inactive" },
                { value: "archived", label: "Archived" },
                { value: "all", label: "All (incl. archived)" },
              ]}
            />
          </label>
        </Toolbar>
        <DataTable
          testId="products-table"
          data={filtered}
          columns={columns}
          getRowId={(r) => r.product.id}
          rowHref={(r) => `/products/${r.product.id}`}
          initialSort={{ id: "name" }}
          footerNote={<span>{filtered.length === rows.length ? `${rows.length} products` : `${filtered.length} of ${rows.length} products`}</span>}
          empty={{
            title: "No products match",
            description: "Try a different search or clear the filters.",
            icon: PackageSearch,
            action: canWrite ? (
              <Button onClick={openCreate}>
                <Plus />
                Add product
              </Button>
            ) : undefined,
          }}
          mobileCard={(r) => (
            <div className="flex items-start gap-3">
              <ProductImage product={r.product} size={44} />
              <div className="min-w-0 flex-1 space-y-1">
                <div className="flex items-start justify-between gap-2">
                  <p className="min-w-0 truncate font-medium">{r.product.name}</p>
                  <StatusBadge status={r.stockStatus} />
                </div>
                <p className="font-mono text-xs text-muted-foreground">{r.product.sku}</p>
                <p className="text-xs text-muted-foreground">
                  {fmt.number(r.summary.available)} {r.product.uom} available · {fmt.money(r.product.unitCost)}
                </p>
                {r.product.status !== "active" && <StatusBadge status={r.product.status} />}
              </div>
              <RowActions
                actions={[
                  { key: "view", label: "View details", icon: Eye, onClick: () => router.push(`/products/${r.product.id}`) },
                  { key: "edit", label: "Edit", icon: Pencil, disabled: !canWrite, onClick: () => { setEditing(r.product); setFormOpen(true); } },
                  { key: "archive", label: "Archive", icon: Archive, hidden: r.product.status === "archived", destructive: true, disabled: !canWrite, onClick: () => statusChange.request(r.product, "archived") },
                ]}
              />
            </div>
          )}
        />
      </div>

      <ProductFormDialog open={formOpen} onOpenChange={setFormOpen} product={editing} />
      {statusChange.dialog}
    </>
  );
}
