"use client";

import { useMemo, useState } from "react";
import { ChevronDown, ChevronRight, ExternalLink, Info, Layers, Plus } from "lucide-react";
import type { Bin, ID, Rack, StockRecord, Warehouse, Zone } from "@/types";
import { Button } from "@/components/ui/button";
import { DetailDrawer } from "@/components/shared/dialogs";
import { SearchInput } from "@/components/shared/form-controls";
import { EmptyState } from "@/components/shared/states";
import { LinkButton } from "@/components/shared/link-button";
import { InfoItem, Section } from "@/components/shared/page-header";
import { TONE_CLASSES } from "@/components/shared/status-badge";
import { useData, useFormat, useIndex, usePermission } from "@/hooks/use-wms";
import { stockRecordAvailable, warehouseCapacity, warehouseStock } from "@/lib/inventory/selectors";
import { cn } from "@/lib/utils";
import { UtilBar } from "@/features/master-data/util-bar";
import { AddBinDialog, AddRackDialog, AddZoneDialog } from "./location-dialogs";

const BIN_TYPE_LABEL: Record<Bin["type"], string> = { storage: "Storage", staging: "Staging", returns: "Returns" };
const ZONE_KIND_LABEL: Record<Zone["kind"], string> = { storage: "Storage zone", receiving: "Receiving / staging", returns: "Returns / inspection" };

function BinTypeTag({ type }: { type: Bin["type"] }) {
  if (type === "storage") return null;
  return (
    <span className={cn("rounded-md px-1.5 py-0.5 text-[11px] font-medium", TONE_CLASSES[type === "staging" ? "warning" : "teal"])}>
      {BIN_TYPE_LABEL[type]}
    </span>
  );
}

export function StorageLocations({ warehouse }: { warehouse: Warehouse }) {
  const data = useData();
  const { products } = useIndex();
  const fmt = useFormat();
  const { can } = usePermission();
  const canWrite = can("warehouses.write");
  const [q, setQ] = useState("");
  const [collapsed, setCollapsed] = useState<Set<ID>>(new Set());
  const [zoneOpen, setZoneOpen] = useState(false);
  const [rackZone, setRackZone] = useState<Zone | null>(null);
  const [binRack, setBinRack] = useState<Rack | null>(null);
  const [drawerBinId, setDrawerBinId] = useState<ID | null>(null);

  const cap = warehouseCapacity(data, warehouse.id);
  const wstock = warehouseStock(data, warehouse.id);

  const { zones, racksByZone, binsByRack, stockByBin } = useMemo(() => {
    const zones = data.zones.filter((z) => z.warehouseId === warehouse.id);
    const racksByZone = new Map<ID, Rack[]>();
    for (const r of data.racks) {
      if (r.warehouseId !== warehouse.id) continue;
      racksByZone.set(r.zoneId, [...(racksByZone.get(r.zoneId) ?? []), r]);
    }
    const binsByRack = new Map<ID, Bin[]>();
    for (const b of data.bins) {
      if (b.warehouseId !== warehouse.id) continue;
      binsByRack.set(b.rackId, [...(binsByRack.get(b.rackId) ?? []), b]);
    }
    const stockByBin = new Map<ID, StockRecord[]>();
    for (const s of data.stock) {
      if (s.warehouseId !== warehouse.id || s.onHand <= 0) continue;
      stockByBin.set(s.binId, [...(stockByBin.get(s.binId) ?? []), s]);
    }
    return { zones, racksByZone, binsByRack, stockByBin };
  }, [data.zones, data.racks, data.bins, data.stock, warehouse.id]);

  const usedOf = (binId: ID) => (stockByBin.get(binId) ?? []).reduce((s, r) => s + r.onHand, 0);
  const term = q.trim().toLowerCase();
  const searching = term.length > 0;

  const zoneMap = useMemo(() => new Map(zones.map((z) => [z.id, z])), [zones]);
  const binMatches = (b: Bin) => {
    if (!searching) return true;
    const z = zoneMap.get(b.zoneId);
    if (b.code.toLowerCase().includes(term)) return true;
    if (z && (z.code.toLowerCase().includes(term) || z.name.toLowerCase().includes(term))) return true;
    return (stockByBin.get(b.id) ?? []).some((r) => {
      const p = products.get(r.productId);
      return !!p && (p.name.toLowerCase().includes(term) || p.sku.toLowerCase().includes(term));
    });
  };

  const toggle = (id: ID) =>
    setCollapsed((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const sortedZones = [...zones].sort((a, b) => {
    const order = { receiving: 0, storage: 1, returns: 2 } as const;
    return order[a.kind] - order[b.kind] || a.code.localeCompare(b.code);
  });

  const visibleZones = sortedZones.map((zone) => {
    const racks = (racksByZone.get(zone.id) ?? [])
      .map((rack) => ({ rack, bins: (binsByRack.get(rack.id) ?? []).filter(binMatches) }))
      .filter((r) => !searching || r.bins.length > 0);
    return { zone, racks };
  }).filter((z) => !searching || z.racks.length > 0);

  const drawerBin = drawerBinId ? data.bins.find((b) => b.id === drawerBinId) : undefined;

  return (
    <div className="space-y-4" data-testid="storage-locations">
      <div className="grid gap-3 sm:grid-cols-4">
        <div className="rounded-xl border bg-card p-4 shadow-card">
          <p className="text-xs text-muted-foreground">Storage capacity</p>
          <p className="mt-0.5 text-lg font-semibold tabular-nums" data-testid="loc-capacity">{fmt.number(cap.capacity)}</p>
          <p className="text-xs text-muted-foreground">{fmt.number(cap.binCount)} storage bins</p>
        </div>
        <div className="rounded-xl border bg-card p-4 shadow-card">
          <p className="text-xs text-muted-foreground">Occupied</p>
          <p className="mt-0.5 text-lg font-semibold tabular-nums" data-testid="loc-occupied">{fmt.number(cap.used)}</p>
          <UtilBar pct={cap.utilization} className="mt-1" />
        </div>
        <div className="rounded-xl border bg-card p-4 shadow-card">
          <p className="text-xs text-muted-foreground">Available space</p>
          <p className="mt-0.5 text-lg font-semibold tabular-nums text-success" data-testid="loc-available">{fmt.number(cap.free)}</p>
          <p className="text-xs text-muted-foreground">units can still be stored</p>
        </div>
        <div className="rounded-xl border bg-card p-4 shadow-card">
          <p className="text-xs text-muted-foreground">Awaiting putaway / inspection</p>
          <p className="mt-0.5 text-lg font-semibold tabular-nums" data-testid="loc-staging">{fmt.number(wstock.staging + wstock.returns)}</p>
          <p className="text-xs text-muted-foreground">
            {fmt.number(wstock.staging)} staging · {fmt.number(wstock.returns)} returns
          </p>
        </div>
      </div>

      <div className="flex items-start gap-2 rounded-lg border border-info/30 bg-info-soft p-3 text-sm text-info">
        <Info className="mt-0.5 size-4 shrink-0" aria-hidden />
        <p className="min-w-0 flex-1">
          Products are not assigned to bins here. Stock lands in a bin through inventory workflows such as goods receipt, putaway, transfers and stock adjustments.
        </p>
        <LinkButton href={`/inventory?warehouse=${warehouse.id}`} variant="outline" size="sm" className="shrink-0 bg-card text-foreground" data-testid="open-inventory">
          Open inventory <ExternalLink />
        </LinkButton>
      </div>

      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <SearchInput value={q} onChange={setQ} placeholder="Search bin, zone or product…" ariaLabel="Search storage locations" />
        <div className="flex gap-2">
          <Button
            variant="outline"
            onClick={() => setCollapsed(collapsed.size ? new Set() : new Set([...zones.map((z) => z.id), ...data.racks.filter((r) => r.warehouseId === warehouse.id).map((r) => r.id)]))}
          >
            <Layers />
            {collapsed.size ? "Expand all" : "Collapse all"}
          </Button>
          <Button onClick={() => setZoneOpen(true)} disabled={!canWrite} title={canWrite ? undefined : "Your role cannot change warehouse structure"} data-testid="add-zone">
            <Plus />
            Add zone
          </Button>
        </div>
      </div>

      {visibleZones.length === 0 ? (
        <div className="rounded-xl border bg-card shadow-card">
          <EmptyState title="No locations found" description={searching ? "No bin, zone or product matches your search." : "This warehouse has no zones yet."} icon={Layers} />
        </div>
      ) : (
        visibleZones.map(({ zone, racks }) => {
          const zoneOpenState = searching || !collapsed.has(zone.id);
          const zoneBins = [...(racksByZone.get(zone.id) ?? [])].flatMap((r) => binsByRack.get(r.id) ?? []);
          const zoneUsed = zoneBins.reduce((s, b) => s + usedOf(b.id), 0);
          const zoneCap = zoneBins.reduce((s, b) => s + b.capacity, 0);
          return (
            <section key={zone.id} className="rounded-xl border bg-card shadow-card" data-testid={`zone-${zone.code}`}>
              <header className="flex flex-wrap items-center gap-2 border-b px-3 py-2.5">
                <button
                  type="button"
                  onClick={() => toggle(zone.id)}
                  className="flex min-w-0 flex-1 items-center gap-2 text-left"
                  aria-expanded={zoneOpenState}
                  aria-label={`${zoneOpenState ? "Collapse" : "Expand"} zone ${zone.code}`}
                >
                  {zoneOpenState ? <ChevronDown className="size-4 shrink-0" /> : <ChevronRight className="size-4 shrink-0" />}
                  <span className="min-w-0">
                    <span className="block truncate text-sm font-semibold">
                      Zone {zone.code} · {zone.name}
                    </span>
                    <span className="block text-xs text-muted-foreground">
                      {ZONE_KIND_LABEL[zone.kind]} · {fmt.number(racksByZone.get(zone.id)?.length ?? 0)} racks · {fmt.number(zoneBins.length)} bins · {fmt.number(zoneUsed)} / {fmt.number(zoneCap)} units
                    </span>
                  </span>
                </button>
                {zone.kind === "storage" && (
                  <Button variant="outline" size="sm" onClick={() => setRackZone(zone)} disabled={!canWrite} data-testid={`add-rack-${zone.code}`}>
                    <Plus />
                    Add rack
                  </Button>
                )}
              </header>
              {zoneOpenState && (
                <div className="space-y-3 p-3">
                  {racks.length === 0 && <p className="text-sm text-muted-foreground">No racks in this zone yet.</p>}
                  {racks.map(({ rack, bins }) => {
                    const rackOpen = searching || !collapsed.has(rack.id);
                    const all = binsByRack.get(rack.id) ?? [];
                    const used = all.reduce((s, b) => s + usedOf(b.id), 0);
                    const capacity = all.reduce((s, b) => s + b.capacity, 0);
                    return (
                      <div key={rack.id} className="rounded-lg border bg-background/40" data-testid={`rack-${rack.code}`}>
                        <div className="flex flex-wrap items-center gap-2 px-3 py-2">
                          <button
                            type="button"
                            onClick={() => toggle(rack.id)}
                            className="flex min-w-0 flex-1 items-center gap-2 text-left"
                            aria-expanded={rackOpen}
                            aria-label={`${rackOpen ? "Collapse" : "Expand"} rack ${rack.code}`}
                          >
                            {rackOpen ? <ChevronDown className="size-4 shrink-0 text-muted-foreground" /> : <ChevronRight className="size-4 shrink-0 text-muted-foreground" />}
                            <span className="text-sm font-medium">Rack {rack.code}</span>
                            <span className="text-xs text-muted-foreground">
                              {all.length} bins · {fmt.number(used)} / {fmt.number(capacity)}
                            </span>
                          </button>
                          {zone.kind === "storage" && (
                            <Button variant="ghost" size="sm" onClick={() => setBinRack(rack)} disabled={!canWrite} data-testid={`add-bin-${rack.code}`}>
                              <Plus />
                              Add bin
                            </Button>
                          )}
                        </div>
                        {rackOpen && (
                          <div className="grid gap-2 border-t p-3 sm:grid-cols-2 xl:grid-cols-3">
                            {bins.length === 0 && <p className="text-sm text-muted-foreground sm:col-span-full">No bins on this rack yet.</p>}
                            {bins.map((b) => {
                              const u = usedOf(b.id);
                              const pct = b.capacity > 0 ? (u / b.capacity) * 100 : 0;
                              const count = stockByBin.get(b.id)?.length ?? 0;
                              return (
                                <button
                                  key={b.id}
                                  type="button"
                                  onClick={() => setDrawerBinId(b.id)}
                                  className="min-w-0 rounded-lg border bg-card p-3 text-left transition-colors hover:border-primary/40 hover:bg-accent/40 focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none"
                                  data-testid={`bin-${b.code}`}
                                >
                                  <div className="flex items-start justify-between gap-2">
                                    <span className="min-w-0 truncate font-mono text-xs font-semibold">{b.code}</span>
                                    <BinTypeTag type={b.type} />
                                  </div>
                                  <UtilBar pct={pct} className="mt-2" label={`${b.code} occupancy`} />
                                  <p className="mt-1 text-xs text-muted-foreground tabular-nums">
                                    {fmt.number(u)} / {fmt.number(b.capacity)} units · {count} {count === 1 ? "product" : "products"}
                                  </p>
                                </button>
                              );
                            })}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </section>
          );
        })
      )}

      <AddZoneDialog open={zoneOpen} onOpenChange={setZoneOpen} warehouse={warehouse} />
      <AddRackDialog open={!!rackZone} onOpenChange={(o) => !o && setRackZone(null)} zone={rackZone} />
      <AddBinDialog open={!!binRack} onOpenChange={(o) => !o && setBinRack(null)} rack={binRack} warehouse={warehouse} />

      <DetailDrawer
        open={!!drawerBin}
        onOpenChange={(o) => !o && setDrawerBinId(null)}
        title={drawerBin?.code ?? "Bin"}
        description={drawerBin ? `${BIN_TYPE_LABEL[drawerBin.type]} bin · ${zoneMap.get(drawerBin.zoneId)?.name ?? ""}` : undefined}
        width="sm:max-w-lg"
        footer={
          <LinkButton href={`/inventory?warehouse=${warehouse.id}`} variant="outline">
            Open in inventory <ExternalLink />
          </LinkButton>
        }
      >
        {drawerBin && <BinDetail bin={drawerBin} records={stockByBin.get(drawerBin.id) ?? []} rackCode={data.racks.find((r) => r.id === drawerBin.rackId)?.code ?? "—"} zone={zoneMap.get(drawerBin.zoneId)} />}
      </DetailDrawer>
    </div>
  );
}

function BinDetail({ bin, records, rackCode, zone }: { bin: Bin; records: StockRecord[]; rackCode: string; zone: Zone | undefined }) {
  const fmt = useFormat();
  const { products, bins } = useIndex();
  const used = records.reduce((s, r) => s + r.onHand, 0);
  return (
    <div className="space-y-4" data-testid="bin-detail">
      <dl className="grid grid-cols-2 gap-3">
        <InfoItem label="Zone">{zone ? `${zone.code} · ${zone.name}` : "—"}</InfoItem>
        <InfoItem label="Rack">{rackCode}</InfoItem>
        <InfoItem label="Type">{BIN_TYPE_LABEL[bin.type]}</InfoItem>
        <InfoItem label="Capacity">{fmt.number(bin.capacity)} units</InfoItem>
      </dl>
      <div>
        <div className="mb-1 flex justify-between text-xs text-muted-foreground">
          <span>Occupied {fmt.number(used)}</span>
          <span>Free {fmt.number(Math.max(0, bin.capacity - used))}</span>
        </div>
        <UtilBar pct={bin.capacity > 0 ? (used / bin.capacity) * 100 : 0} />
      </div>
      {bin.type !== "storage" && (
        <p className="rounded-lg bg-muted p-3 text-xs text-muted-foreground">
          {bin.type === "staging"
            ? "Received goods wait here for putaway. Stock in a staging bin is not pickable."
            : "Customer returns wait here for inspection. Stock in a returns bin is not pickable."}
        </p>
      )}
      <Section title="Stock in this bin" contentClassName="p-0">
        {records.length === 0 ? (
          <p className="p-4 text-sm text-muted-foreground">This bin is empty. Stock arrives through receiving, putaway, transfers or adjustments.</p>
        ) : (
          <ul className="divide-y">
            {records.map((r) => {
              const p = products.get(r.productId);
              return (
                <li key={r.id} className="flex items-center justify-between gap-3 px-4 py-2.5">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium">{p?.name ?? r.productId}</p>
                    <p className="font-mono text-[11px] text-muted-foreground">{p?.sku}</p>
                  </div>
                  <div className="shrink-0 text-right text-xs tabular-nums">
                    <p className="text-sm font-medium">{fmt.number(r.onHand)} on hand</p>
                    <p className="text-muted-foreground">
                      {fmt.number(r.reserved)} reserved · {fmt.number(stockRecordAvailable(r, bins.get(r.binId)))} avail.
                    </p>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </Section>
    </div>
  );
}
