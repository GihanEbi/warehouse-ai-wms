"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { Clock, Coins, Factory, FileText, Mail, MapPin, Package, Pencil, Phone, Plus, Power, ShoppingCart, User } from "lucide-react";
import type { PurchaseOrder, Product } from "@/types";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { DataTable, type Column } from "@/components/shared/data-table";
import { LinkButton } from "@/components/shared/link-button";
import { InfoItem, PageHeader, Section } from "@/components/shared/page-header";
import { ProductImage } from "@/components/shared/product-bits";
import { StatCard } from "@/components/shared/stat-card";
import { EmptyState } from "@/components/shared/states";
import { StatusBadge } from "@/components/shared/status-badge";
import { useData, useFormat, useIndex, usePermission } from "@/hooks/use-wms";
import { productStock } from "@/lib/inventory/selectors";
import { poTotal } from "@/lib/workflows/purchasing";
import { SupplierFormDialog } from "./supplier-form-dialog";
import { useSupplierStatusToggle } from "./use-supplier-status";

const OPEN_PO: PurchaseOrder["status"][] = ["approved", "partially_received"];
const SPEND_PO: PurchaseOrder["status"][] = ["approved", "partially_received", "received"];

export function SupplierDetail({ id }: { id: string }) {
  const data = useData();
  const { warehouses } = useIndex();
  const fmt = useFormat();
  const { can } = usePermission();
  const canWrite = can("suppliers.write");
  const [tab, setTab] = useState("overview");
  const [editOpen, setEditOpen] = useState(false);
  const toggle = useSupplierStatusToggle();

  const supplier = data.suppliers.find((s) => s.id === id);

  const pos = useMemo(
    () => data.purchaseOrders.filter((p) => p.supplierId === id).sort((a, b) => b.orderDate.localeCompare(a.orderDate)),
    [data.purchaseOrders, id],
  );
  const products = useMemo(() => data.products.filter((p) => p.preferredSupplierId === id), [data.products, id]);

  const stats = useMemo(
    () => ({
      total: pos.length,
      open: pos.filter((p) => OPEN_PO.includes(p.status)).length,
      spend: pos.filter((p) => SPEND_PO.includes(p.status)).reduce((s, p) => s + poTotal(p), 0),
      products: products.length,
    }),
    [pos, products],
  );

  const poColumns = useMemo<Column<PurchaseOrder>[]>(
    () => [
      { id: "number", header: "PO number", sortValue: (p) => p.number, cell: (p) => <span className="font-mono text-xs font-medium">{p.number}</span> },
      { id: "date", header: "Order date", sortValue: (p) => p.orderDate, cell: (p) => <span className="whitespace-nowrap">{fmt.date(p.orderDate)}</span> },
      { id: "expected", header: "Expected", hideOnMobile: true, sortValue: (p) => p.expectedDate, cell: (p) => <span className="whitespace-nowrap">{fmt.date(p.expectedDate)}</span> },
      { id: "wh", header: "Warehouse", hideOnMobile: true, cell: (p) => warehouses.get(p.warehouseId)?.code ?? "—" },
      { id: "lines", header: "Lines", align: "right", hideOnMobile: true, sortValue: (p) => p.lines.length, cell: (p) => <span className="tabular-nums">{p.lines.length}</span> },
      { id: "total", header: "Total", align: "right", sortValue: (p) => poTotal(p), cell: (p) => <span className="whitespace-nowrap tabular-nums">{fmt.money(poTotal(p))}</span> },
      { id: "status", header: "Status", sortValue: (p) => p.status, cell: (p) => <StatusBadge status={p.status} domain="po" /> },
    ],
    [fmt, warehouses],
  );

  const productColumns = useMemo<Column<Product>[]>(
    () => [
      {
        id: "name",
        header: "Product",
        sortValue: (p) => p.name,
        cell: (p) => (
          <div className="flex min-w-0 items-center gap-2.5">
            <ProductImage product={p} size={32} />
            <div className="min-w-0">
              <Link href={`/products/${p.id}`} className="block max-w-64 truncate font-medium hover:underline" onClick={(e) => e.stopPropagation()}>
                {p.name}
              </Link>
              <p className="font-mono text-[11px] text-muted-foreground">{p.sku}</p>
            </div>
          </div>
        ),
      },
      { id: "category", header: "Category", hideOnMobile: true, sortValue: (p) => p.category, cell: (p) => p.category },
      { id: "cost", header: "Unit cost", align: "right", sortValue: (p) => p.unitCost, cell: (p) => <span className="whitespace-nowrap tabular-nums">{fmt.money(p.unitCost)}</span> },
      { id: "stock", header: "Available", align: "right", sortValue: (p) => productStock(data, p.id).available, cell: (p) => <span className="tabular-nums">{fmt.number(productStock(data, p.id).available)}</span> },
      { id: "status", header: "Status", sortValue: (p) => p.status, cell: (p) => <StatusBadge status={p.status} /> },
    ],
    [fmt, data],
  );

  if (!supplier) {
    return (
      <div className="rounded-xl border bg-card shadow-card">
        <EmptyState icon={Factory} title="Supplier not found" description="It may have been removed, or the link is wrong." action={<LinkButton href="/suppliers">Back to suppliers</LinkButton>} />
      </div>
    );
  }

  return (
    <>
      <PageHeader
        title={supplier.name}
        description={`${supplier.code} · ${supplier.country}`}
        actions={
          <>
            <StatusBadge status={supplier.status} />
            <Button variant="outline" onClick={() => setEditOpen(true)} disabled={!canWrite} title={canWrite ? undefined : "Your role cannot edit suppliers"} data-testid="edit-supplier">
              <Pencil />
              Edit
            </Button>
            <Button
              variant={supplier.status === "active" ? "destructive" : "default"}
              onClick={() => toggle.request(supplier)}
              disabled={!canWrite}
              data-testid="toggle-supplier-status"
            >
              <Power />
              {supplier.status === "active" ? "Deactivate" : "Activate"}
            </Button>
            <LinkButton
              href={`/purchase-orders/new?supplier=${supplier.id}`}
              data-testid="new-po"
              className={can("po.write") && supplier.status === "active" ? undefined : "pointer-events-none opacity-50"}
              aria-disabled={!(can("po.write") && supplier.status === "active")}
            >
              <Plus />
              New purchase order
            </LinkButton>
          </>
        }
      />

      <div className="mb-4 grid grid-cols-2 gap-3 sm:gap-4 xl:grid-cols-4">
        <StatCard testId="sup-total-pos" title="Total purchase orders" value={fmt.number(stats.total)} icon={FileText} tone="primary" />
        <StatCard testId="sup-open-pos" title="Open purchase orders" value={fmt.number(stats.open)} description="Approved or partially received" icon={ShoppingCart} tone={stats.open > 0 ? "warning" : "neutral"} />
        <StatCard testId="sup-spend" title="Total spend" value={fmt.moneyCompact(stats.spend)} description={fmt.money(stats.spend)} icon={Coins} tone="success" />
        <StatCard testId="sup-products" title="Products supplied" value={fmt.number(stats.products)} description="Preferred supplier" icon={Package} tone="teal" />
      </div>

      <Tabs value={tab} onValueChange={setTab} className="gap-4">
        <div className="max-w-full overflow-x-auto">
          <TabsList className="w-max">
            <TabsTrigger value="overview" className="px-3" data-testid="tab-overview">Overview</TabsTrigger>
            <TabsTrigger value="pos" className="px-3" data-testid="tab-pos">Purchase Orders</TabsTrigger>
            <TabsTrigger value="products" className="px-3" data-testid="tab-products">Products</TabsTrigger>
          </TabsList>
        </div>

        <TabsContent value="overview" className="grid gap-4 lg:grid-cols-2">
          <Section title="Contact">
            <ul className="space-y-3 text-sm">
              <li className="flex items-start gap-3"><User className="mt-0.5 size-4 shrink-0 text-muted-foreground" /><span>{supplier.contactPerson}</span></li>
              <li className="flex items-start gap-3"><Mail className="mt-0.5 size-4 shrink-0 text-muted-foreground" /><a href={`mailto:${supplier.email}`} className="min-w-0 break-all text-primary hover:underline">{supplier.email}</a></li>
              <li className="flex items-start gap-3"><Phone className="mt-0.5 size-4 shrink-0 text-muted-foreground" /><a href={`tel:${supplier.phone.replace(/\s/g, "")}`} className="hover:underline">{supplier.phone}</a></li>
              <li className="flex items-start gap-3"><MapPin className="mt-0.5 size-4 shrink-0 text-muted-foreground" /><span>{supplier.address}, {supplier.country}</span></li>
            </ul>
          </Section>
          <Section title="Commercial terms">
            <dl className="grid grid-cols-2 gap-4">
              <InfoItem label="Payment terms">{supplier.paymentTerms}</InfoItem>
              <InfoItem label="Lead time"><span className="inline-flex items-center gap-1.5"><Clock className="size-3.5 text-muted-foreground" />{supplier.leadTimeDays} days</span></InfoItem>
              <InfoItem label="Supplier since">{fmt.date(supplier.createdAt)}</InfoItem>
              <InfoItem label="Status"><StatusBadge status={supplier.status} /></InfoItem>
            </dl>
          </Section>
        </TabsContent>

        <TabsContent value="pos">
          <div className="rounded-xl border bg-card shadow-card">
            <div className="flex items-center justify-between gap-2 border-b p-3">
              <p className="text-sm text-muted-foreground">{fmt.number(pos.length)} purchase orders with this supplier</p>
              <LinkButton href={`/purchase-orders/new?supplier=${supplier.id}`} variant="outline" size="sm" data-testid="new-po-tab">
                <Plus />
                New purchase order
              </LinkButton>
            </div>
            <DataTable
              testId="supplier-pos"
              data={pos}
              columns={poColumns}
              getRowId={(p) => p.id}
              rowHref={(p) => `/purchase-orders/${p.id}`}
              initialSort={{ id: "date", desc: true }}
              compact
              empty={{ title: "No purchase orders yet", description: "Create the first purchase order for this supplier.", icon: ShoppingCart, action: <LinkButton href={`/purchase-orders/new?supplier=${supplier.id}`}>New purchase order</LinkButton> }}
              mobileCard={(p) => (
                <div className="flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <p className="font-mono text-xs font-medium">{p.number}</p>
                    <p className="text-xs text-muted-foreground">{fmt.date(p.orderDate)} · {fmt.money(poTotal(p))}</p>
                  </div>
                  <StatusBadge status={p.status} domain="po" />
                </div>
              )}
            />
          </div>
        </TabsContent>

        <TabsContent value="products">
          <div className="rounded-xl border bg-card shadow-card">
            <DataTable
              testId="supplier-products"
              data={products}
              columns={productColumns}
              getRowId={(p) => p.id}
              rowHref={(p) => `/products/${p.id}`}
              initialSort={{ id: "name" }}
              compact
              empty={{ title: "No products", description: "Products appear here when this supplier is set as their preferred supplier.", icon: Package }}
              mobileCard={(p) => (
                <div className="flex items-center gap-3">
                  <ProductImage product={p} size={36} />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium">{p.name}</p>
                    <p className="font-mono text-[11px] text-muted-foreground">{p.sku}</p>
                  </div>
                  <StatusBadge status={p.status} />
                </div>
              )}
            />
          </div>
        </TabsContent>
      </Tabs>

      <SupplierFormDialog open={editOpen} onOpenChange={setEditOpen} supplier={supplier} />
      {toggle.dialog}
    </>
  );
}
