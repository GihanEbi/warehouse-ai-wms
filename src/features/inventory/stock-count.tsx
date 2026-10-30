"use client";

import { useMemo, useState } from "react";
import { CheckCircle2, ClipboardCheck, TriangleAlert } from "lucide-react";
import { toast } from "sonner";
import type { ID } from "@/types";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ConfirmationDialog } from "@/components/shared/dialogs";
import { EmptyState } from "@/components/shared/states";
import { NativeSelect } from "@/components/shared/form-controls";
import { Section } from "@/components/shared/page-header";
import { WarehouseSelector } from "@/components/shared/selectors";
import { useData, useFormat, useIndex, usePermission, useTx, useWarehouseScope } from "@/hooks/use-wms";
import { PRODUCT_CATEGORIES } from "@/lib/constants";
import { reconcileMovements, reconcileReservations } from "@/lib/inventory/selectors";
import { cn } from "@/lib/utils";

const PAGE = 25;

export function StockCount() {
  const data = useData();
  const idx = useIndex();
  const tx = useTx();
  const fmt = useFormat();
  const { can } = usePermission();
  const [scope] = useWarehouseScope();
  const [warehouseId, setWarehouseId] = useState<ID>(() => (scope !== "all" ? scope : (data.warehouses.find((w) => w.status === "active")?.id ?? "")));
  const [zoneId, setZoneId] = useState("all");
  const [category, setCategory] = useState("all");
  const [counts, setCounts] = useState<Record<string, string>>({});
  const [shown, setShown] = useState(PAGE);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [checkedAt, setCheckedAt] = useState(() => new Date());

  const canAdjust = can("inventory.adjust");
  const zones = useMemo(() => data.zones.filter((z) => z.warehouseId === warehouseId), [data.zones, warehouseId]);

  const lines = useMemo(() => {
    return data.stock
      .filter((r) => {
        if (r.warehouseId !== warehouseId || (r.onHand <= 0 && r.reserved <= 0)) return false;
        const bin = idx.bins.get(r.binId);
        if (zoneId !== "all" && bin?.zoneId !== zoneId) return false;
        if (category !== "all" && idx.products.get(r.productId)?.category !== category) return false;
        return true;
      })
      .map((r) => ({ record: r, bin: idx.bins.get(r.binId)!, product: idx.products.get(r.productId)! }))
      .filter((l) => l.bin && l.product)
      .sort((a, b) => a.bin.code.localeCompare(b.bin.code) || a.product.name.localeCompare(b.product.name));
  }, [data.stock, warehouseId, zoneId, category, idx]);

  const entered = lines
    .map((l) => ({ ...l, counted: counts[l.record.id] === undefined || counts[l.record.id] === "" ? null : Number(counts[l.record.id]) }))
    .filter((l) => l.counted !== null && Number.isInteger(l.counted) && l.counted >= 0);
  const variances = entered.filter((l) => l.counted !== l.record.onHand);
  const netVariance = variances.reduce((s, l) => s + ((l.counted as number) - l.record.onHand), 0);

  const movementIssues = useMemo(() => reconcileMovements(data), [data, checkedAt]); // eslint-disable-line react-hooks/exhaustive-deps -- re-run on demand
  const reservationIssues = useMemo(() => reconcileReservations(data), [data, checkedAt]); // eslint-disable-line react-hooks/exhaustive-deps
  const consistent = movementIssues.length === 0 && reservationIssues.length === 0;

  function apply() {
    const res = tx.applyStockCount({
      lines: variances.map((l) => ({ productId: l.record.productId, binId: l.record.binId, counted: l.counted as number })),
      reason: "Cycle count correction",
    });
    if (!res.ok) {
      toast.error(res.error);
      return false;
    }
    toast.success(`Stock count applied — ${res.value} adjustment${res.value === 1 ? "" : "s"} recorded`);
    setCounts({});
    setCheckedAt(new Date());
    return true;
  }

  return (
    <div className="space-y-4" data-testid="stock-count">
      <Section
        title="Reconciliation check"
        description="Compares the movement history and open-order reservations with the stock records"
        actions={
          <Button variant="outline" size="sm" onClick={() => setCheckedAt(new Date())} data-testid="rerun-reconciliation">
            Re-run check
          </Button>
        }
      >
        {consistent ? (
          <p className="flex items-center gap-2 text-sm font-medium text-success" data-testid="reconciliation-ok" role="status">
            <CheckCircle2 className="size-4" aria-hidden />
            Movement history matches inventory ✓
            <span className="font-normal text-muted-foreground">· reservations match open orders · checked {fmt.time(checkedAt)}</span>
          </p>
        ) : (
          <div className="space-y-2" data-testid="reconciliation-issues" role="alert">
            <p className="flex items-center gap-2 text-sm font-medium text-danger">
              <TriangleAlert className="size-4" aria-hidden />
              {movementIssues.length + reservationIssues.length} discrepanc{movementIssues.length + reservationIssues.length === 1 ? "y" : "ies"} found
            </p>
            <ul className="space-y-1 text-xs text-muted-foreground">
              {movementIssues.slice(0, 8).map((i) => (
                <li key={`m-${i.productId}-${i.warehouseId}`}>
                  {idx.products.get(i.productId)?.name} @ {idx.warehouses.get(i.warehouseId)?.code}: movements say {i.movements}, bins hold {i.onHand}
                </li>
              ))}
              {reservationIssues.slice(0, 8).map((i) => (
                <li key={`r-${i.productId}-${i.binId}`}>
                  {idx.products.get(i.productId)?.name} @ {idx.bins.get(i.binId)?.code}: reserved {i.reserved}, open orders need {i.expected}
                </li>
              ))}
            </ul>
          </div>
        )}
      </Section>

      <Section
        title="Stock count"
        description="Enter the physical quantity you counted. Only locations with a variance are adjusted."
        contentClassName="p-0"
        actions={
          <>
            <Button variant="outline" size="sm" onClick={() => setCounts(Object.fromEntries(lines.map((l) => [l.record.id, String(l.record.onHand)])))} disabled={lines.length === 0} data-testid="count-prefill">
              Prefill system qty
            </Button>
            <Button variant="ghost" size="sm" onClick={() => setCounts({})} disabled={Object.keys(counts).length === 0}>
              Clear
            </Button>
          </>
        }
      >
        <div className="flex flex-col gap-2 border-b p-3 sm:flex-row sm:flex-wrap sm:items-center">
          <label className="flex items-center gap-2 text-xs text-muted-foreground">
            <span className="shrink-0">Warehouse</span>
            <WarehouseSelector
              id="count-warehouse"
              value={warehouseId}
              onChange={(v) => {
                setWarehouseId(v);
                setZoneId("all");
                setCounts({});
                setShown(PAGE);
              }}
              className="min-w-[12rem] flex-1 text-foreground"
            />
          </label>
          <label className="flex items-center gap-2 text-xs text-muted-foreground">
            <span className="shrink-0">Zone</span>
            <NativeSelect
              aria-label="Zone"
              value={zoneId}
              onChange={(e) => {
                setZoneId(e.target.value);
                setShown(PAGE);
              }}
              options={[{ value: "all", label: "All zones" }, ...zones.map((z) => ({ value: z.id, label: `${z.code} — ${z.name}` }))]}
              className="min-w-[9rem] flex-1 text-foreground"
            />
          </label>
          <label className="flex items-center gap-2 text-xs text-muted-foreground">
            <span className="shrink-0">Category</span>
            <NativeSelect
              aria-label="Category"
              value={category}
              onChange={(e) => {
                setCategory(e.target.value);
                setShown(PAGE);
              }}
              options={[{ value: "all", label: "All categories" }, ...PRODUCT_CATEGORIES.map((c) => ({ value: c, label: c }))]}
              className="min-w-[10rem] flex-1 text-foreground"
            />
          </label>
        </div>

        {lines.length === 0 ? (
          <EmptyState icon={ClipboardCheck} title="Nothing to count" description="No stock records match this warehouse, zone and category." />
        ) : (
          <>
            <div className="hidden grid-cols-[minmax(0,2fr)_minmax(0,1fr)_5rem_7rem_5rem] gap-x-3 border-b bg-muted/40 px-4 py-2 text-xs font-medium text-muted-foreground sm:grid">
              <span>Product</span>
              <span>Location</span>
              <span className="text-right">System</span>
              <span>Counted</span>
              <span className="text-right">Variance</span>
            </div>
            <ul className="divide-y" data-testid="count-lines">
              {lines.slice(0, shown).map((l) => {
                const raw = counts[l.record.id] ?? "";
                const counted = raw === "" ? null : Number(raw);
                const invalid = counted !== null && (!Number.isInteger(counted) || counted < 0);
                const variance = counted !== null && !invalid ? counted - l.record.onHand : 0;
                return (
                  <li
                    key={l.record.id}
                    className={cn("grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-3 gap-y-1 px-4 py-2.5 sm:grid-cols-[minmax(0,2fr)_minmax(0,1fr)_5rem_7rem_5rem]", variance !== 0 && "bg-warning-soft/60")}
                    data-variance={variance !== 0 ? variance : undefined}
                  >
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium">{l.product.name}</p>
                      <p className="truncate font-mono text-[11px] text-muted-foreground">{l.product.sku}</p>
                    </div>
                    <p className="hidden truncate font-mono text-xs sm:block">
                      {l.bin.code}
                      {l.bin.type !== "storage" && <span className="ml-1 font-sans text-muted-foreground">({l.bin.type})</span>}
                    </p>
                    <p className="hidden text-right text-sm tabular-nums sm:block" title="System quantity">
                      {l.record.onHand}
                    </p>
                    <Input
                      type="number"
                      min={0}
                      step={1}
                      inputMode="numeric"
                      placeholder="Counted"
                      aria-label={`Counted quantity for ${l.product.name} at ${l.bin.code}`}
                      aria-invalid={invalid || undefined}
                      value={raw}
                      onChange={(e) => setCounts((c) => ({ ...c, [l.record.id]: e.target.value }))}
                      disabled={!canAdjust}
                      className="row-span-2 w-24 sm:row-span-1 sm:w-full"
                    />
                    <p className={cn("hidden text-right text-sm font-medium tabular-nums sm:block", variance > 0 && "text-success", variance < 0 && "text-danger", variance === 0 && "text-muted-foreground")} data-testid="count-variance">
                      {counted === null || invalid ? "—" : variance === 0 ? "OK" : `${variance > 0 ? "+" : "−"}${Math.abs(variance)}`}
                    </p>
                    <p className="text-xs text-muted-foreground sm:hidden">
                      {l.bin.code} · system {l.record.onHand}
                      {variance !== 0 && <strong className={variance > 0 ? "text-success" : "text-danger"}> · {variance > 0 ? "+" : "−"}{Math.abs(variance)}</strong>}
                    </p>
                  </li>
                );
              })}
            </ul>
            <div className="flex flex-col gap-3 border-t px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
              <div className="text-xs text-muted-foreground" data-testid="count-summary">
                {lines.length} location{lines.length === 1 ? "" : "s"} · {entered.length} counted ·{" "}
                <span className={variances.length ? "font-medium text-foreground" : undefined}>
                  {variances.length} variance{variances.length === 1 ? "" : "s"}
                </span>
                {variances.length > 0 && ` (net ${netVariance > 0 ? "+" : netVariance < 0 ? "−" : ""}${Math.abs(netVariance)} units)`}
                {shown < lines.length && (
                  <Button variant="link" size="xs" className="ml-2" onClick={() => setShown((s) => s + PAGE)}>
                    Show more
                  </Button>
                )}
              </div>
              <Button onClick={() => setConfirmOpen(true)} disabled={!canAdjust || variances.length === 0} title={canAdjust ? undefined : "Your role cannot adjust stock"} data-testid="apply-count">
                Apply count
              </Button>
            </div>
          </>
        )}
      </Section>

      <ConfirmationDialog
        open={confirmOpen}
        onOpenChange={setConfirmOpen}
        title="Apply stock count?"
        description={`${variances.length} location${variances.length === 1 ? "" : "s"} will be adjusted to the counted quantity. Each variance is recorded as a stock movement.`}
        confirmLabel="Apply count"
        onConfirm={() => apply()}
      >
        <ul className="max-h-56 space-y-1 overflow-y-auto rounded-lg border bg-muted/40 p-3 text-xs" data-testid="count-confirm-list">
          {variances.map((l) => {
            const v = (l.counted as number) - l.record.onHand;
            return (
              <li key={l.record.id} className="flex justify-between gap-3">
                <span className="min-w-0 truncate">
                  {l.product.name} <span className="font-mono text-muted-foreground">{l.bin.code}</span>
                </span>
                <span className="shrink-0 tabular-nums">
                  {l.record.onHand} → {l.counted}{" "}
                  <strong className={v > 0 ? "text-success" : "text-danger"}>
                    ({v > 0 ? "+" : "−"}
                    {Math.abs(v)})
                  </strong>
                </span>
              </li>
            );
          })}
        </ul>
      </ConfirmationDialog>
    </div>
  );
}
