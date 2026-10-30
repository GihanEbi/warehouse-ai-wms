"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { PackageCheck, Truck } from "lucide-react";
import type { SalesOrder, Shipment } from "@/types";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { PageHeader } from "@/components/shared/page-header";
import { DataTable, type Column } from "@/components/shared/data-table";
import { ExportButton } from "@/components/shared/export-button";
import { FilterDropdown, SearchInput, Toolbar } from "@/components/shared/form-controls";
import { StatusBadge } from "@/components/shared/status-badge";
import { useData, useFormat, useIndex, usePermission, useWarehouseScope } from "@/hooks/use-wms";
import { CARRIERS } from "@/lib/constants";
import { customerAddress } from "@/features/orders/order-utils";
import { CreateShipmentDialog } from "./create-shipment-dialog";

const SHIPMENT_STATUSES = [
  { value: "ready_to_ship", label: "Ready to Ship" },
  { value: "dispatched", label: "Dispatched" },
  { value: "in_transit", label: "In Transit" },
  { value: "delivered", label: "Delivered" },
];

export function ShippingPage() {
  const params = useSearchParams();
  const data = useData();
  const [tab, setTab] = useState(params.get("tab") === "shipments" ? "shipments" : "ready");
  const [dialogOrderId, setDialogOrderId] = useState<string | null>(params.get("order"));
  const dialogOrder = data.orders.find((o) => o.id === dialogOrderId && o.status === "packed" && !o.shipmentId) ?? null;

  const readyCount = data.orders.filter((o) => o.status === "packed" && !o.shipmentId).length;

  return (
    <>
      <PageHeader title="Shipping" description="Create shipments for packed orders, dispatch them and track delivery." />
      <Tabs value={tab} onValueChange={(v) => setTab(String(v))}>
        <TabsList>
          <TabsTrigger value="ready" data-testid="tab-ready">Ready to ship{readyCount > 0 ? ` (${readyCount})` : ""}</TabsTrigger>
          <TabsTrigger value="shipments" data-testid="tab-shipments">Shipments</TabsTrigger>
        </TabsList>
        <TabsContent value="ready">
          <ReadyToShip onCreate={(o) => setDialogOrderId(o.id)} />
        </TabsContent>
        <TabsContent value="shipments">
          <ShipmentList />
        </TabsContent>
      </Tabs>
      <CreateShipmentDialog order={dialogOrder} onOpenChange={(o) => !o && setDialogOrderId(null)} />
    </>
  );
}

function ReadyToShip({ onCreate }: { onCreate: (o: SalesOrder) => void }) {
  const data = useData();
  const idx = useIndex();
  const fmt = useFormat();
  const { can } = usePermission();
  const [scope] = useWarehouseScope();
  const canShip = can("shipping.write");

  const rows = useMemo(
    () =>
      data.orders
        .filter((o) => o.status === "packed" && !o.shipmentId && (scope === "all" || o.warehouseId === scope))
        .sort((a, b) => (a.packing?.packedAt ?? "").localeCompare(b.packing?.packedAt ?? "")),
    [data.orders, scope],
  );

  const createBtn = (o: SalesOrder, full?: boolean) => (
    <Button size={full ? "lg" : "sm"} className={full ? "h-11 w-full text-base" : undefined} onClick={() => onCreate(o)} disabled={!canShip} title={canShip ? undefined : "Your role cannot create shipments"} data-testid="create-shipment">
      <Truck /> Create shipment
    </Button>
  );

  const cols = useMemo<Column<SalesOrder>[]>(
    () => [
      { id: "order", header: "Order", sortValue: (o) => o.number, cell: (o) => <Link href={`/orders/${o.id}`} className="font-medium text-primary hover:underline">{o.number}</Link> },
      { id: "customer", header: "Customer", sortValue: (o) => idx.customers.get(o.customerId)?.name, cell: (o) => idx.customers.get(o.customerId)?.name ?? "—" },
      { id: "warehouse", header: "Warehouse", hideOnMobile: true, cell: (o) => idx.warehouses.get(o.warehouseId)?.name ?? "—" },
      { id: "packages", header: "Packages / weight", sortValue: (o) => o.packing?.packageCount, cell: (o) => `${o.packing?.packageCount} pkg · ${o.packing?.weightKg} kg` },
      { id: "address", header: "Delivery address", hideOnMobile: true, className: "max-w-[16rem] truncate", cell: (o) => customerAddress(idx.customers.get(o.customerId)) },
      { id: "packed", header: "Packed", sortValue: (o) => o.packing?.packedAt, cell: (o) => fmt.date(o.packing?.packedAt) },
      { id: "action", header: "", align: "right", cell: (o) => createBtn(o) },
    ],
    // eslint-disable-next-line react-hooks/exhaustive-deps -- createBtn closes over canShip/onCreate
    [idx, fmt, canShip],
  );

  return (
    <div className="rounded-xl border bg-card shadow-card">
      <DataTable
        testId="ready-table"
        data={rows}
        columns={cols}
        getRowId={(o) => o.id}
        compact
        empty={{ title: "No orders ready to ship", description: "Packed orders without a shipment appear here.", icon: PackageCheck }}
        mobileCard={(o) => (
          <div className="space-y-2">
            <div className="flex items-start justify-between gap-2">
              <div>
                <Link href={`/orders/${o.id}`} className="font-semibold text-primary">{o.number}</Link>
                <p className="text-sm">{idx.customers.get(o.customerId)?.name}</p>
              </div>
              <span className="text-xs text-muted-foreground">{o.packing?.packageCount} pkg · {o.packing?.weightKg} kg</span>
            </div>
            <p className="text-xs text-muted-foreground">{customerAddress(idx.customers.get(o.customerId))}</p>
            {createBtn(o, true)}
          </div>
        )}
      />
    </div>
  );
}

function ShipmentList() {
  const data = useData();
  const idx = useIndex();
  const fmt = useFormat();
  const [scope] = useWarehouseScope();
  const [q, setQ] = useState("");
  const [status, setStatus] = useState("all");
  const [carrier, setCarrier] = useState("all");
  const [warehouse, setWarehouse] = useState<string | null>(null);
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const wh = warehouse ?? scope;

  const orderOf = (s: Shipment) => data.orders.find((o) => o.id === s.orderId);
  const customerOf = (s: Shipment) => {
    const o = orderOf(s);
    return o ? idx.customers.get(o.customerId)?.name ?? "" : "";
  };
  const dateOf = (s: Shipment) => (s.dispatchDate ?? s.createdAt).slice(0, 10);

  const rows = useMemo(() => {
    const term = q.trim().toLowerCase();
    return data.shipments.filter((s) => {
      if (wh !== "all" && s.warehouseId !== wh) return false;
      if (status !== "all" && s.status !== status) return false;
      if (carrier !== "all" && s.carrier !== carrier) return false;
      const d = (s.dispatchDate ?? s.createdAt).slice(0, 10);
      if (from && d < from) return false;
      if (to && d > to) return false;
      if (term) {
        const o = data.orders.find((x) => x.id === s.orderId);
        const cust = o ? idx.customers.get(o.customerId)?.name ?? "" : "";
        const hay = `${s.number} ${s.trackingNumber} ${o?.number ?? ""} ${cust}`.toLowerCase();
        if (!hay.includes(term)) return false;
      }
      return true;
    });
  }, [data.shipments, data.orders, idx.customers, q, status, carrier, wh, from, to]);

  const cols = useMemo<Column<Shipment>[]>(
    () => [
      { id: "number", header: "Shipment", sortValue: (s) => s.number, cell: (s) => <Link href={`/shipping/${s.id}`} className="font-medium text-primary hover:underline">{s.number}</Link> },
      {
        id: "order",
        header: "Order",
        sortValue: (s) => data.orders.find((o) => o.id === s.orderId)?.number,
        cell: (s) => {
          const o = data.orders.find((x) => x.id === s.orderId);
          return o ? <Link href={`/orders/${o.id}`} className="hover:underline" onClick={(e) => e.stopPropagation()}>{o.number}</Link> : "—";
        },
      },
      { id: "customer", header: "Customer", sortValue: (s) => customerOf(s), cell: (s) => customerOf(s) || "—" },
      { id: "carrier", header: "Carrier", hideOnMobile: true, sortValue: (s) => s.carrier, cell: (s) => s.carrier },
      { id: "method", header: "Method", hideOnMobile: true, cell: (s) => s.method },
      { id: "tracking", header: "Tracking", cell: (s) => <span className="font-mono text-xs">{s.trackingNumber}</span> },
      { id: "status", header: "Status", sortValue: (s) => s.status, cell: (s) => <StatusBadge status={s.status} domain="shipment" /> },
      { id: "dispatch", header: "Dispatch", sortValue: (s) => s.dispatchDate, cell: (s) => fmt.date(s.dispatchDate) },
      { id: "eta", header: "ETA", sortValue: (s) => s.estimatedDelivery, cell: (s) => fmt.date(s.estimatedDelivery) },
    ],
    // eslint-disable-next-line react-hooks/exhaustive-deps -- helpers derive from data/idx
    [data.orders, idx, fmt],
  );

  const exportData = () => ({
    headers: ["Shipment", "Order", "Customer", "Carrier", "Method", "Tracking", "Status", "Dispatch date", "ETA", "Delivered"],
    rows: rows.map((s) => [s.number, orderOf(s)?.number, customerOf(s), s.carrier, s.method, s.trackingNumber, s.status, dateOf(s), s.estimatedDelivery?.slice(0, 10), s.deliveredAt?.slice(0, 10)]),
  });

  return (
    <div className="rounded-xl border bg-card shadow-card">
      <Toolbar>
        <SearchInput value={q} onChange={setQ} placeholder="Search shipment, order, tracking, customer…" />
        <FilterDropdown label="Status" value={status} onChange={setStatus} options={SHIPMENT_STATUSES} />
        <FilterDropdown label="Carrier" value={carrier} onChange={setCarrier} options={CARRIERS.map((c) => ({ value: c.name, label: c.name }))} />
        <FilterDropdown label="Warehouse" value={wh} onChange={setWarehouse} allLabel="All warehouses" options={data.warehouses.map((w) => ({ value: w.id, label: w.name }))} />
        <label className="flex items-center gap-2 text-xs text-muted-foreground">
          From
          <Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} aria-label="Dispatch date from" className="w-36" />
        </label>
        <label className="flex items-center gap-2 text-xs text-muted-foreground">
          To
          <Input type="date" value={to} onChange={(e) => setTo(e.target.value)} aria-label="Dispatch date to" className="w-36" />
        </label>
        <div className="sm:ml-auto">
          <ExportButton filename="shipments" getData={exportData} size="sm" />
        </div>
      </Toolbar>
      <DataTable
        testId="shipments-table"
        data={rows}
        columns={cols}
        getRowId={(s) => s.id}
        rowHref={(s) => `/shipping/${s.id}`}
        initialSort={{ id: "dispatch", desc: true }}
        empty={{ title: "No shipments found", description: "Try adjusting your search or filters.", icon: Truck }}
        footerNote={<span>{rows.length} shipment{rows.length === 1 ? "" : "s"}</span>}
        mobileCard={(s) => (
          <div className="space-y-1.5">
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <p className="font-semibold text-primary">{s.number}</p>
                <p className="truncate text-sm">{customerOf(s)}</p>
              </div>
              <StatusBadge status={s.status} domain="shipment" />
            </div>
            <p className="text-xs text-muted-foreground">{s.carrier} · {s.method}</p>
            <p className="break-all font-mono text-xs text-muted-foreground">{s.trackingNumber}</p>
            <p className="text-xs text-muted-foreground">Dispatch {fmt.date(s.dispatchDate)} · ETA {fmt.date(s.estimatedDelivery)}</p>
          </div>
        )}
      />
    </div>
  );
}
