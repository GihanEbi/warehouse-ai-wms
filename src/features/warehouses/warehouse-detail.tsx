"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { ArrowDownToLine, ArrowUpFromLine, Boxes, Coins, Layers, MapPin, Package, Pencil, Power, Warehouse as WarehouseIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { LinkButton } from "@/components/shared/link-button";
import { InfoItem, PageHeader, Section } from "@/components/shared/page-header";
import { StatCard } from "@/components/shared/stat-card";
import { StatusBadge } from "@/components/shared/status-badge";
import { EmptyState } from "@/components/shared/states";
import { useData, useFormat, useIndex, usePermission } from "@/hooks/use-wms";
import { inTransitQty, inventoryValue, warehouseCapacity, warehouseStock } from "@/lib/inventory/selectors";
import { ROLE_LABELS } from "@/lib/constants";
import { UtilBar } from "@/features/master-data/util-bar";
import { StorageLocations } from "./storage-locations";
import { WarehouseInventory } from "./warehouse-inventory";
import { WarehouseActivity } from "./warehouse-activity";
import { WarehouseFormDialog } from "./warehouse-form-dialog";
import { useWarehouseStatusToggle } from "./use-warehouse-status";

export function WarehouseDetail({ id }: { id: string }) {
  const data = useData();
  const { users } = useIndex();
  const fmt = useFormat();
  const { can } = usePermission();
  const canWrite = can("warehouses.write");
  const [tab, setTab] = useState("overview");
  const [editOpen, setEditOpen] = useState(false);
  const toggle = useWarehouseStatusToggle();

  const warehouse = data.warehouses.find((w) => w.id === id);

  const metrics = useMemo(() => {
    if (!warehouse) return null;
    const cap = warehouseCapacity(data, warehouse.id);
    const stock = warehouseStock(data, warehouse.id);
    const productIds = new Set<string>();
    for (const r of data.stock) if (r.warehouseId === warehouse.id && r.onHand > 0) productIds.add(r.productId);
    return {
      cap,
      stock,
      productCount: productIds.size,
      value: inventoryValue(data, warehouse.id),
      inbound: inTransitQty(data, { toWarehouseId: warehouse.id }),
      outbound: inTransitQty(data, { fromWarehouseId: warehouse.id }),
      zones: data.zones.filter((z) => z.warehouseId === warehouse.id).length,
      bins: data.bins.filter((b) => b.warehouseId === warehouse.id).length,
    };
  }, [data, warehouse]);

  if (!warehouse || !metrics) {
    return (
      <div className="rounded-xl border bg-card shadow-card">
        <EmptyState
          icon={WarehouseIcon}
          title="Warehouse not found"
          description="It may have been removed, or the link is wrong."
          action={<LinkButton href="/warehouses">Back to warehouses</LinkButton>}
        />
      </div>
    );
  }

  const manager = warehouse.managerId ? users.get(warehouse.managerId) : undefined;

  return (
    <>
      <PageHeader
        title={warehouse.name}
        description={`${warehouse.code} · ${warehouse.city}`}
        actions={
          <>
            <StatusBadge status={warehouse.status} />
            <Button variant="outline" onClick={() => setEditOpen(true)} disabled={!canWrite} title={canWrite ? undefined : "Your role cannot edit warehouses"} data-testid="edit-warehouse">
              <Pencil />
              Edit
            </Button>
            <Button
              variant={warehouse.status === "active" ? "destructive" : "default"}
              onClick={() => toggle.request(warehouse)}
              disabled={!canWrite}
              title={canWrite ? undefined : "Your role cannot change warehouse status"}
              data-testid="toggle-warehouse-status"
            >
              <Power />
              {warehouse.status === "active" ? "Deactivate" : "Activate"}
            </Button>
          </>
        }
      />

      <Tabs value={tab} onValueChange={setTab} className="gap-4">
        <div className="max-w-full overflow-x-auto">
          <TabsList className="w-max">
            <TabsTrigger value="overview" className="px-3" data-testid="tab-overview">Overview</TabsTrigger>
            <TabsTrigger value="locations" className="px-3" data-testid="tab-locations">Storage Locations</TabsTrigger>
            <TabsTrigger value="inventory" className="px-3" data-testid="tab-inventory">Inventory</TabsTrigger>
            <TabsTrigger value="activity" className="px-3" data-testid="tab-activity">Recent Activity</TabsTrigger>
          </TabsList>
        </div>

        <TabsContent value="overview" className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <StatCard testId="wh-utilization" title="Utilization" value={`${metrics.cap.utilization}%`} description={`${fmt.number(metrics.cap.used)} of ${fmt.number(metrics.cap.capacity)} units`} icon={Boxes} tone={metrics.cap.utilization >= 90 ? "danger" : metrics.cap.utilization >= 75 ? "warning" : "primary"} />
            <StatCard testId="wh-products" title="Products stocked" value={fmt.number(metrics.productCount)} description="Distinct SKUs with stock" icon={Package} tone="teal" />
            <StatCard testId="wh-value" title="Stock value" value={fmt.moneyCompact(metrics.value)} description={fmt.money(metrics.value)} icon={Coins} tone="success" />
            <StatCard testId="wh-staging" title="Awaiting putaway" value={fmt.number(metrics.stock.staging)} description="Units in staging" icon={Layers} tone={metrics.stock.staging > 0 ? "warning" : "neutral"} />
          </div>

          <div className="grid gap-4 lg:grid-cols-2">
            <Section title="Capacity">
              <UtilBar pct={metrics.cap.utilization} />
              <dl className="mt-4 grid grid-cols-3 gap-3">
                <InfoItem label="Total capacity"><span data-testid="wh-capacity">{fmt.number(metrics.cap.capacity)}</span></InfoItem>
                <InfoItem label="Used"><span data-testid="wh-used">{fmt.number(metrics.cap.used)}</span></InfoItem>
                <InfoItem label="Free"><span data-testid="wh-free">{fmt.number(metrics.cap.free)}</span></InfoItem>
                <InfoItem label="Storage bins">{fmt.number(metrics.cap.binCount)}</InfoItem>
                <InfoItem label="All bins">{fmt.number(metrics.bins)}</InfoItem>
                <InfoItem label="Zones">{fmt.number(metrics.zones)}</InfoItem>
              </dl>
            </Section>
            <Section title="In transit" description="Inter-warehouse transfers dispatched but not yet received">
              <div className="grid grid-cols-2 gap-3">
                <div className="flex items-center gap-3 rounded-lg border p-3">
                  <span className="flex size-9 items-center justify-center rounded-lg bg-info-soft text-info"><ArrowDownToLine className="size-4" /></span>
                  <div>
                    <p className="text-xs text-muted-foreground">Inbound</p>
                    <p className="text-lg font-semibold tabular-nums" data-testid="wh-in-transit-in">{fmt.number(metrics.inbound)}</p>
                  </div>
                </div>
                <div className="flex items-center gap-3 rounded-lg border p-3">
                  <span className="flex size-9 items-center justify-center rounded-lg bg-warning-soft text-warning"><ArrowUpFromLine className="size-4" /></span>
                  <div>
                    <p className="text-xs text-muted-foreground">Outbound</p>
                    <p className="text-lg font-semibold tabular-nums" data-testid="wh-in-transit-out">{fmt.number(metrics.outbound)}</p>
                  </div>
                </div>
              </div>
              <Link href="/transfers" className="mt-3 inline-block text-xs text-primary hover:underline">View transfers</Link>
            </Section>
          </div>

          <Section title="Details">
            <dl className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              <InfoItem label="Manager">
                {manager ? (
                  <span>
                    {manager.name}
                    <span className="block text-xs font-normal text-muted-foreground">{ROLE_LABELS[manager.role]}</span>
                  </span>
                ) : (
                  "Unassigned"
                )}
              </InfoItem>
              <InfoItem label="Address">
                <span className="inline-flex items-start gap-1.5"><MapPin className="mt-0.5 size-3.5 shrink-0 text-muted-foreground" />{warehouse.address}</span>
              </InfoItem>
              <InfoItem label="City">{warehouse.city}</InfoItem>
              <InfoItem label="Created">{fmt.date(warehouse.createdAt)}</InfoItem>
            </dl>
          </Section>
        </TabsContent>

        <TabsContent value="locations">
          <StorageLocations warehouse={warehouse} />
        </TabsContent>
        <TabsContent value="inventory">
          <WarehouseInventory warehouse={warehouse} />
        </TabsContent>
        <TabsContent value="activity">
          <WarehouseActivity warehouse={warehouse} />
        </TabsContent>
      </Tabs>

      <WarehouseFormDialog open={editOpen} onOpenChange={setEditOpen} warehouse={warehouse} />
      {toggle.dialog}
    </>
  );
}
