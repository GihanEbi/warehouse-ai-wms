"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { Archive, ArchiveRestore, Package, Pencil, Power, SlidersHorizontal, ShoppingCart } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { FilterDropdown, Toolbar } from "@/components/shared/form-controls";
import { LinkButton } from "@/components/shared/link-button";
import { InfoItem, Section } from "@/components/shared/page-header";
import { BarcodeDisplay, ProductImage } from "@/components/shared/product-bits";
import { EmptyState } from "@/components/shared/states";
import { StatusBadge } from "@/components/shared/status-badge";
import { useData, useFormat, useIndex, usePermission, useSettings } from "@/hooks/use-wms";
import { getStockStatus, productStock, stockRecordAvailable } from "@/lib/inventory/selectors";
import { MovementTable } from "@/features/master-data/movement-table";
import { MOVEMENT_LABELS, MOVEMENT_TYPES } from "@/features/master-data/movement-labels";
import { ProductFormDialog } from "./product-form-dialog";
import { useProductStatusChange } from "./use-product-status";

export function ProductDetail({ id }: { id: string }) {
  const data = useData();
  const { suppliers, bins } = useIndex();
  const settings = useSettings();
  const fmt = useFormat();
  const { can } = usePermission();
  const canWrite = can("products.write");
  const [tab, setTab] = useState("overview");
  const [editOpen, setEditOpen] = useState(false);
  const [whFilter, setWhFilter] = useState("all");
  const [typeFilter, setTypeFilter] = useState("all");
  const statusChange = useProductStatusChange();

  const product = data.products.find((p) => p.id === id);
  const summary = useMemo(() => (product ? productStock(data, product.id) : null), [data, product]);

  const movements = useMemo(
    () =>
      product
        ? data.movements
            .filter((m) => m.productId === product.id && (whFilter === "all" || m.warehouseId === whFilter) && (typeFilter === "all" || m.type === typeFilter))
            .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
        : [],
    [data.movements, product, whFilter, typeFilter],
  );

  if (!product || !summary) {
    return (
      <div className="rounded-xl border bg-card shadow-card">
        <EmptyState icon={Package} title="Product not found" description="It may have been removed, or the link is wrong." action={<LinkButton href="/products">Back to products</LinkButton>} />
      </div>
    );
  }

  const stockStatus = getStockStatus(summary, product.reorderLevel, settings.lowStockThresholdFactor);
  const supplier = product.preferredSupplierId ? suppliers.get(product.preferredSupplierId) : undefined;
  const margin = product.sellingPrice !== null && product.sellingPrice > 0 ? ((product.sellingPrice - product.unitCost) / product.sellingPrice) * 100 : null;
  const stockValue = summary.physical * product.unitCost;
  const poHref = (warehouseId?: string) => {
    const qs = new URLSearchParams({ product: product.id });
    if (product.preferredSupplierId) qs.set("supplier", product.preferredSupplierId);
    if (warehouseId) qs.set("warehouse", warehouseId);
    return `/purchase-orders/new?${qs.toString()}`;
  };

  return (
    <>
      <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex min-w-0 items-start gap-3">
          <ProductImage product={product} size={64} className="size-14 sm:size-16" />
          <div className="min-w-0">
            <h1 className="text-xl font-semibold tracking-tight break-words sm:text-2xl" data-testid="product-title">{product.name}</h1>
            <p className="mt-0.5 text-sm text-muted-foreground">
              <span className="font-mono" data-testid="product-sku">{product.sku}</span> · {product.category}
            </p>
            <div className="mt-2 flex flex-wrap gap-2">
              <StatusBadge status={product.status} />
              <StatusBadge status={stockStatus} />
            </div>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2 sm:justify-end">
            <Button variant="outline" onClick={() => setEditOpen(true)} disabled={!canWrite} title={canWrite ? undefined : "Your role cannot edit products"} data-testid="edit-product">
              <Pencil />
              Edit
            </Button>
            {product.status === "active" && (
              <Button variant="outline" onClick={() => statusChange.request(product, "inactive")} disabled={!canWrite} data-testid="deactivate-product">
                <Power />
                Deactivate
              </Button>
            )}
            {product.status === "inactive" && (
              <Button variant="outline" onClick={() => statusChange.request(product, "active")} disabled={!canWrite} data-testid="reactivate-product">
                <Power />
                Reactivate
              </Button>
            )}
            {product.status === "archived" ? (
              <Button onClick={() => statusChange.request(product, "active")} disabled={!canWrite} data-testid="restore-product">
                <ArchiveRestore />
                Restore
              </Button>
            ) : (
              <Button variant="destructive" onClick={() => statusChange.request(product, "archived")} disabled={!canWrite} data-testid="archive-product">
                <Archive />
                Archive
              </Button>
            )}
        </div>
      </div>

      <Tabs value={tab} onValueChange={setTab} className="gap-4">
        <div className="max-w-full overflow-x-auto">
          <TabsList className="w-max">
            <TabsTrigger value="overview" className="px-3" data-testid="tab-overview">Overview</TabsTrigger>
            <TabsTrigger value="inventory" className="px-3" data-testid="tab-inventory">Inventory by Warehouse</TabsTrigger>
            <TabsTrigger value="history" className="px-3" data-testid="tab-history">Stock Movement History</TabsTrigger>
          </TabsList>
        </div>

        <TabsContent value="overview" className="space-y-4">
          <div className="grid gap-4 lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
            <Section title="Product details">
              <p className="mb-4 text-sm text-muted-foreground" data-testid="product-description">{product.description || "No description provided."}</p>
              <dl className="grid grid-cols-2 gap-4 sm:grid-cols-3">
                <InfoItem label="Category">{product.category}</InfoItem>
                <InfoItem label="Unit of measure">{product.uom}</InfoItem>
                <InfoItem label="Reorder level">{fmt.number(product.reorderLevel)}</InfoItem>
                <InfoItem label="Unit cost"><span data-testid="product-cost">{fmt.money(product.unitCost)}</span></InfoItem>
                <InfoItem label="Selling price"><span data-testid="product-price">{product.sellingPrice === null ? "Not set" : fmt.money(product.sellingPrice)}</span></InfoItem>
                <InfoItem label="Margin"><span data-testid="product-margin">{margin === null ? "—" : `${margin.toFixed(1)}%`}</span></InfoItem>
                <InfoItem label="Preferred supplier">
                  {supplier ? (
                    <Link href={`/suppliers/${supplier.id}`} className="text-primary hover:underline">
                      {supplier.name}
                    </Link>
                  ) : (
                    "None"
                  )}
                </InfoItem>
                <InfoItem label="Created">{fmt.date(product.createdAt)}</InfoItem>
                <InfoItem label="Stock status"><StatusBadge status={stockStatus} /></InfoItem>
              </dl>
            </Section>
            <Section title="Barcode">
              <div className="flex justify-center">
                <BarcodeDisplay value={product.barcode} />
              </div>
            </Section>
          </div>

          <Section title="Stock summary" description="Across all warehouses">
            <dl className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-6">
              <InfoItem label="On hand (storage)"><span className="text-lg tabular-nums" data-testid="stock-onhand">{fmt.number(summary.onHand)}</span></InfoItem>
              <InfoItem label="Reserved"><span className="text-lg tabular-nums" data-testid="stock-reserved">{fmt.number(summary.reserved)}</span></InfoItem>
              <InfoItem label="Blocked"><span className="text-lg tabular-nums" data-testid="stock-blocked">{fmt.number(summary.blocked)}</span></InfoItem>
              <InfoItem label="Available"><span className="text-lg tabular-nums text-success" data-testid="stock-available">{fmt.number(summary.available)}</span></InfoItem>
              <InfoItem label="In staging"><span className="text-lg tabular-nums" data-testid="stock-staging">{fmt.number(summary.staging)}</span></InfoItem>
              <InfoItem label="Stock value"><span className="text-lg tabular-nums" data-testid="stock-value">{fmt.money(stockValue)}</span></InfoItem>
            </dl>
          </Section>
        </TabsContent>

        <TabsContent value="inventory" className="space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-sm text-muted-foreground">Stock held per warehouse and bin. Adjustments and receiving happen in the inventory and purchasing modules.</p>
            <LinkButton href={poHref()} variant="outline" data-testid="create-po" aria-disabled={!can("po.write")} className={can("po.write") ? undefined : "pointer-events-none opacity-50"}>
              <ShoppingCart />
              Create purchase order
            </LinkButton>
          </div>
          {data.warehouses.map((w) => {
            const s = productStock(data, product.id, w.id);
            const records = data.stock.filter((r) => r.productId === product.id && r.warehouseId === w.id && (r.onHand > 0 || r.reserved > 0 || r.blocked > 0));
            return (
              <Section
                key={w.id}
                title={`${w.name} (${w.code})`}
                description={`${fmt.number(s.available)} available · ${fmt.number(s.onHand)} on hand · ${fmt.number(s.reserved)} reserved · ${fmt.number(s.blocked)} blocked · ${fmt.number(s.staging)} staging`}
                actions={
                  <>
                    <LinkButton
                      href={`/inventory?product=${product.id}&warehouse=${w.id}`}
                      variant="outline"
                      size="sm"
                      data-testid={`adjust-${w.code}`}
                      className={can("inventory.adjust") ? undefined : "pointer-events-none opacity-50"}
                      aria-disabled={!can("inventory.adjust")}
                    >
                      <SlidersHorizontal />
                      Adjust stock
                    </LinkButton>
                    <LinkButton href={poHref(w.id)} variant="outline" size="sm" className={can("po.write") ? "hidden sm:inline-flex" : "hidden"}>
                      <ShoppingCart />
                      Create PO
                    </LinkButton>
                  </>
                }
                contentClassName="p-0"
              >
                {records.length === 0 ? (
                  <p className="p-4 text-sm text-muted-foreground">No stock of this product in {w.name}.</p>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead className="border-b bg-muted/40 text-xs text-muted-foreground">
                        <tr>
                          <th className="h-9 px-3 text-left font-medium">Bin</th>
                          <th className="h-9 px-3 text-left font-medium">Type</th>
                          <th className="h-9 px-3 text-right font-medium">On hand</th>
                          <th className="h-9 px-3 text-right font-medium">Reserved</th>
                          <th className="h-9 px-3 text-right font-medium">Blocked</th>
                          <th className="h-9 px-3 text-right font-medium">Available</th>
                        </tr>
                      </thead>
                      <tbody>
                        {records.map((r) => {
                          const bin = bins.get(r.binId);
                          return (
                            <tr key={r.id} className="border-b last:border-b-0" data-testid="bin-row">
                              <td className="px-3 py-2 font-mono text-xs whitespace-nowrap">{bin?.code ?? r.binId}</td>
                              <td className="px-3 py-2 capitalize">{bin?.type}</td>
                              <td className="px-3 py-2 text-right tabular-nums">{fmt.number(r.onHand)}</td>
                              <td className="px-3 py-2 text-right tabular-nums">{fmt.number(r.reserved)}</td>
                              <td className="px-3 py-2 text-right tabular-nums">{fmt.number(r.blocked)}</td>
                              <td className="px-3 py-2 text-right font-medium tabular-nums">{fmt.number(stockRecordAvailable(r, bin))}</td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                )}
              </Section>
            );
          })}
        </TabsContent>

        <TabsContent value="history">
          <div className="rounded-xl border bg-card shadow-card">
            <Toolbar>
              <FilterDropdown
                label="Warehouse"
                value={whFilter}
                onChange={setWhFilter}
                options={data.warehouses.map((w) => ({ value: w.id, label: `${w.name} (${w.code})` }))}
                allLabel="All warehouses"
                className="sm:w-72"
              />
              <FilterDropdown label="Type" value={typeFilter} onChange={setTypeFilter} options={MOVEMENT_TYPES.map((t) => ({ value: t, label: MOVEMENT_LABELS[t] }))} allLabel="All types" className="sm:w-60" />
              <span className="text-xs text-muted-foreground sm:ml-auto" data-testid="movement-count">
                {fmt.number(movements.length)} movements
              </span>
            </Toolbar>
            <MovementTable movements={movements} showWarehouse testId="product-movements" />
          </div>
        </TabsContent>
      </Tabs>

      <ProductFormDialog open={editOpen} onOpenChange={setEditOpen} product={product} />
      {statusChange.dialog}
    </>
  );
}
