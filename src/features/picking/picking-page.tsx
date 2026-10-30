"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { ArrowRight, CheckCircle2, ClipboardCheck, FileText, Loader2, PackageCheck, Play, ScanBarcode, X } from "lucide-react";
import type { SalesOrder } from "@/types";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { PageHeader } from "@/components/shared/page-header";
import { DataTable, type Column } from "@/components/shared/data-table";
import { FilterDropdown, SearchInput, Toolbar } from "@/components/shared/form-controls";
import { LinkButton } from "@/components/shared/link-button";
import { ProductImage } from "@/components/shared/product-bits";
import { PriorityBadge, StatusBadge } from "@/components/shared/status-badge";
import { useData, useFormat, useIndex, usePermission, useTx, useWarehouseScope } from "@/hooks/use-wms";
import { useSubmit } from "@/hooks/use-submit";
import { orderQty } from "@/features/orders/order-utils";
import { cn } from "@/lib/utils";
import { PickDialog, type PickRow } from "./pick-dialog";

const PRIORITY_RANK: Record<string, number> = { urgent: 0, high: 1, normal: 2, low: 3 };

function ProgressBar({ done, total }: { done: number; total: number }) {
  const pct = total === 0 ? 0 : Math.round((done / total) * 100);
  return (
    <div className="mt-1 flex items-center gap-2" data-testid="order-pick-progress">
      <div className="h-1.5 w-20 overflow-hidden rounded-full bg-muted" role="progressbar" aria-valuenow={done} aria-valuemin={0} aria-valuemax={total}>
        <div className={cn("h-full rounded-full", done === total ? "bg-success" : "bg-primary")} style={{ width: `${pct}%` }} />
      </div>
      <span className="text-[11px] text-muted-foreground tabular-nums">{done}/{total} picked</span>
    </div>
  );
}

export function PickingPackingPage() {
  const params = useSearchParams();
  const [tab, setTab] = useState(params.get("tab") === "packing" ? "packing" : "picking");
  return (
    <>
      <PageHeader title="Picking & Packing" description="Pick reserved stock from its bins, then verify, pack and generate packing slips." />
      <Tabs value={tab} onValueChange={(v) => setTab(String(v))}>
        <TabsList>
          <TabsTrigger value="picking" data-testid="tab-picking">Picking</TabsTrigger>
          <TabsTrigger value="packing" data-testid="tab-packing">Packing</TabsTrigger>
        </TabsList>
        <TabsContent value="picking">
          <PickingTab />
        </TabsContent>
        <TabsContent value="packing">
          <PackingTab />
        </TabsContent>
      </Tabs>
    </>
  );
}

/* ------------------------------------------------------------------ Picking */

function PickingTab() {
  const data = useData();
  const idx = useIndex();
  const tx = useTx();
  const fmt = useFormat();
  const router = useRouter();
  const params = useSearchParams();
  const { can } = usePermission();
  const [scope] = useWarehouseScope();
  const { submit } = useSubmit();
  const canPick = can("picking.write");

  const orderParam = params.get("order");
  const [q, setQ] = useState("");
  const [status, setStatus] = useState("all"); // all = open tasks
  const [assignee, setAssignee] = useState("all");
  const [warehouse, setWarehouse] = useState<string | null>(null);
  const wh = warehouse ?? scope;
  const [active, setActive] = useState<PickRow | null>(null);
  const [startingId, setStartingId] = useState<string | null>(null);

  const allRows = useMemo<PickRow[]>(() => {
    const out: PickRow[] = [];
    for (const t of data.tasks) {
      if (!t.pick) continue;
      const order = data.orders.find((o) => o.id === t.pick!.orderId);
      const product = idx.products.get(t.pick.productId);
      if (!order || !product || order.status === "cancelled") continue;
      const bin = idx.bins.get(t.pick.binId);
      out.push({
        task: t,
        order,
        customerName: idx.customers.get(order.customerId)?.name ?? "—",
        product,
        bin,
        zoneCode: (bin && idx.zones.get(bin.zoneId)?.code) || "—",
        assigneeName: t.assigneeId ? (idx.users.get(t.assigneeId)?.name ?? "—") : "Unassigned",
        required: t.pick.requiredQty,
        picked: t.pick.pickedQty,
      });
    }
    return out;
  }, [data.tasks, data.orders, idx]);

  const orderProgress = useMemo(() => {
    const m = new Map<string, { done: number; total: number }>();
    for (const r of allRows) {
      const e = m.get(r.order.id) ?? { done: 0, total: 0 };
      e.total += 1;
      if (r.task.status === "completed") e.done += 1;
      m.set(r.order.id, e);
    }
    return m;
  }, [allRows]);

  const assigneeOptions = useMemo(() => {
    const ids = new Set(allRows.map((r) => r.task.assigneeId).filter((x): x is string => !!x));
    return [...ids].map((id) => ({ value: id, label: idx.users.get(id)?.name ?? id })).sort((a, b) => a.label.localeCompare(b.label));
  }, [allRows, idx.users]);

  const rows = useMemo(() => {
    const term = q.trim().toLowerCase();
    return allRows
      .filter((r) => {
        if (orderParam && r.order.id !== orderParam) return false;
        if (wh !== "all" && r.task.warehouseId !== wh) return false;
        if (status === "all" ? r.task.status === "completed" : r.task.status !== status) return false;
        if (assignee !== "all" && r.task.assigneeId !== assignee) return false;
        if (term) {
          const hay = `${r.order.number} ${r.customerName} ${r.product.name} ${r.product.sku} ${r.bin?.code ?? ""}`.toLowerCase();
          if (!hay.includes(term)) return false;
        }
        return true;
      })
      .sort((a, b) => PRIORITY_RANK[a.task.priority] - PRIORITY_RANK[b.task.priority] || a.task.dueDate.localeCompare(b.task.dueDate) || a.task.number.localeCompare(b.task.number));
  }, [allRows, orderParam, wh, status, assignee, q]);

  const readyToPack = useMemo(
    () => data.orders.filter((o) => o.status === "picked" && (!orderParam || o.id === orderParam) && (wh === "all" || o.warehouseId === wh)),
    [data.orders, orderParam, wh],
  );
  const filteredOrder = orderParam ? data.orders.find((o) => o.id === orderParam) : undefined;

  async function start(row: PickRow) {
    setStartingId(row.task.id);
    await submit(() => tx.startPicking(row.task.id), { success: `Picking started for ${row.order.number}`, delay: 200 });
    setStartingId(null);
  }

  const columns = useMemo<Column<PickRow>[]>(
    () => [
      {
        id: "order",
        header: "Order / customer",
        sortValue: (r) => r.order.number,
        cell: (r) => {
          const p = orderProgress.get(r.order.id);
          return (
            <div className="min-w-[8.5rem]">
              <Link href={`/orders/${r.order.id}`} className="font-medium text-primary hover:underline" data-testid="pick-order-link">{r.order.number}</Link>
              <p className="max-w-[11rem] truncate text-xs text-muted-foreground">{r.customerName}</p>
              {p && <ProgressBar done={p.done} total={p.total} />}
            </div>
          );
        },
      },
      {
        id: "product",
        header: "Product",
        sortValue: (r) => r.product.name,
        cell: (r) => (
          <div className="flex min-w-[10rem] items-center gap-2">
            <ProductImage product={r.product} size={32} />
            <div className="min-w-0">
              <p className="max-w-[12rem] truncate font-medium">{r.product.name}</p>
              <p className="font-mono text-[11px] text-muted-foreground">{r.product.sku}</p>
            </div>
          </div>
        ),
      },
      {
        id: "required",
        header: "Picked / required",
        align: "right",
        sortValue: (r) => r.required,
        cell: (r) => (
          <span className="tabular-nums">
            <span className="text-muted-foreground">{r.picked} / </span>
            <span className="font-semibold">{fmt.number(r.required)}</span>
          </span>
        ),
      },
      {
        id: "bin",
        header: "Location",
        sortValue: (r) => r.bin?.code,
        cell: (r) => (
          <div>
            <span className="font-mono text-xs font-medium whitespace-nowrap">{r.bin?.code ?? "—"}</span>
            <p className="text-[11px] text-muted-foreground">Zone {r.zoneCode}</p>
          </div>
        ),
      },
      { id: "assignee", header: "Assigned to", hideOnMobile: true, className: "whitespace-nowrap", sortValue: (r) => r.assigneeName, cell: (r) => r.assigneeName },
      { id: "priority", header: "Priority", sortValue: (r) => PRIORITY_RANK[r.task.priority], cell: (r) => <PriorityBadge priority={r.task.priority} /> },
      { id: "status", header: "Status", sortValue: (r) => r.task.status, cell: (r) => <StatusBadge status={r.task.status} domain="task" /> },
      {
        id: "actions",
        header: "",
        align: "right",
        cell: (r) => renderActions(r),
      },
    ],
    // eslint-disable-next-line react-hooks/exhaustive-deps -- renderActions closes over start/startingId/canPick
    [orderProgress, fmt, startingId, canPick],
  );

  function renderActions(row: PickRow, large?: boolean) {
    if (row.task.status === "completed") return <span className="inline-flex items-center gap-1 text-xs text-success"><CheckCircle2 className="size-4" /> Done</span>;
    const sz = large ? "h-11 flex-1 text-base" : "";
    return (
      <div className="flex justify-end gap-2" onClick={(e) => e.stopPropagation()}>
        {row.task.status === "pending" && (
          <Button variant="outline" size={large ? "lg" : "sm"} className={sz} disabled={!canPick || startingId === row.task.id} title={canPick ? undefined : "Your role cannot perform picking"} onClick={() => void start(row)} data-testid="start-pick">
            {startingId === row.task.id ? <Loader2 className="animate-spin" /> : <Play />} Start
          </Button>
        )}
        <Button size={large ? "lg" : "sm"} className={sz} disabled={!canPick} title={canPick ? undefined : "Your role cannot perform picking"} onClick={() => setActive(row)} data-testid="pick-task">
          <ScanBarcode /> Pick
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {readyToPack.length > 0 && (
        <div className="space-y-2" data-testid="picked-banners">
          {readyToPack.slice(0, 3).map((o) => (
            <div key={o.id} className="flex flex-col gap-2 rounded-xl border border-success/30 bg-success-soft p-3 sm:flex-row sm:items-center sm:justify-between" data-testid="picked-banner">
              <p className="flex items-center gap-2 text-sm font-medium text-success">
                <CheckCircle2 className="size-4 shrink-0" /> {o.number} is fully picked and ready for packing.
              </p>
              <LinkButton href={`/picking-packing/pack/${o.id}`} size="sm" data-testid="banner-pack">
                <PackageCheck /> Go to packing <ArrowRight />
              </LinkButton>
            </div>
          ))}
          {readyToPack.length > 3 && <p className="text-xs text-muted-foreground">+{readyToPack.length - 3} more orders ready for packing - see the Packing tab.</p>}
        </div>
      )}
      <div className="rounded-xl border bg-card shadow-card">
        <Toolbar>
          <SearchInput value={q} onChange={setQ} placeholder="Search order, customer, product, bin…" />
          <FilterDropdown label="Warehouse" value={wh} onChange={setWarehouse} allLabel="All warehouses" options={data.warehouses.map((w) => ({ value: w.id, label: w.name }))} />
          <FilterDropdown
            label="Status"
            value={status}
            onChange={setStatus}
            allLabel="Open tasks"
            options={[
              { value: "pending", label: "Pending" },
              { value: "in_progress", label: "In progress" },
              { value: "completed", label: "Completed" },
            ]}
          />
          <FilterDropdown label="Assignee" value={assignee} onChange={setAssignee} options={assigneeOptions} />
          {filteredOrder && (
            <button
              type="button"
              onClick={() => router.replace("/picking-packing")}
              className="inline-flex h-8 items-center gap-1.5 rounded-lg bg-primary-soft px-2.5 text-xs font-medium text-primary"
              data-testid="order-filter-chip"
            >
              Order {filteredOrder.number} <X className="size-3.5" aria-label="Clear order filter" />
            </button>
          )}
        </Toolbar>
        <DataTable
          testId="pick-table"
          data={rows}
          columns={columns}
          getRowId={(r) => r.task.id}
          pageSize={25}
          empty={{
            title: status === "all" ? "No open pick tasks" : "No pick tasks match",
            description: status === "all" ? "Confirmed orders create pick tasks here. All caught up!" : "Try adjusting your search or filters.",
            icon: ClipboardCheck,
          }}
          mobileCard={(r) => (
            <div className="space-y-3" data-testid="pick-card">
              <div className="flex items-start justify-between gap-2">
                <div>
                  <Link href={`/orders/${r.order.id}`} className="font-semibold text-primary" onClick={(e) => e.stopPropagation()}>{r.order.number}</Link>
                  <p className="text-xs text-muted-foreground">{r.customerName}</p>
                </div>
                <div className="flex flex-col items-end gap-1">
                  <StatusBadge status={r.task.status} domain="task" />
                  <PriorityBadge priority={r.task.priority} />
                </div>
              </div>
              <div className="flex items-center gap-3">
                <ProductImage product={r.product} size={52} />
                <div className="min-w-0 flex-1">
                  <p className="font-medium leading-tight">{r.product.name}</p>
                  <p className="font-mono text-xs text-muted-foreground">{r.product.sku}</p>
                </div>
                <div className="text-right">
                  <p className="text-[11px] text-muted-foreground">Qty</p>
                  <p className="text-2xl leading-none font-semibold tabular-nums">{r.required}</p>
                </div>
              </div>
              <div className="flex items-center justify-between rounded-lg bg-muted/50 px-3 py-2 text-sm">
                <span>
                  <span className="font-mono font-semibold">{r.bin?.code ?? "—"}</span>
                  <span className="text-muted-foreground"> · Zone {r.zoneCode}</span>
                </span>
                <span className="text-xs text-muted-foreground">{r.assigneeName}</span>
              </div>
              {orderProgress.get(r.order.id) && <ProgressBar done={orderProgress.get(r.order.id)!.done} total={orderProgress.get(r.order.id)!.total} />}
              {renderActions(r, true)}
            </div>
          )}
        />
      </div>
      <PickDialog row={active} onOpenChange={(o) => !o && setActive(null)} />
    </div>
  );
}

/* ------------------------------------------------------------------ Packing */

function PackingTab() {
  const data = useData();
  const idx = useIndex();
  const fmt = useFormat();
  const { can } = usePermission();
  const [scope] = useWarehouseScope();
  const canPack = can("picking.write");

  const inScope = (o: SalesOrder) => scope === "all" || o.warehouseId === scope;
  const ready = useMemo(
    () => data.orders.filter((o) => o.status === "picked" && inScope(o)).sort((a, b) => a.requiredDate.localeCompare(b.requiredDate)),
    // eslint-disable-next-line react-hooks/exhaustive-deps -- inScope derives from scope
    [data.orders, scope],
  );
  const packed = useMemo(
    () =>
      data.orders
        .filter((o) => o.packing && (o.status === "packed" || o.status === "dispatched") && inScope(o))
        .sort((a, b) => (b.packing!.packedAt).localeCompare(a.packing!.packedAt))
        .slice(0, 30),
    // eslint-disable-next-line react-hooks/exhaustive-deps -- inScope derives from scope
    [data.orders, scope],
  );

  const readyCols = useMemo<Column<SalesOrder>[]>(
    () => [
      { id: "order", header: "Order", sortValue: (o) => o.number, cell: (o) => <Link href={`/orders/${o.id}`} className="font-medium text-primary hover:underline">{o.number}</Link> },
      { id: "customer", header: "Customer", sortValue: (o) => idx.customers.get(o.customerId)?.name, cell: (o) => idx.customers.get(o.customerId)?.name ?? "—" },
      { id: "items", header: "Items", align: "right", sortValue: (o) => orderQty(o), cell: (o) => `${o.lines.length} lines · ${fmt.number(orderQty(o))} units` },
      { id: "priority", header: "Priority", sortValue: (o) => PRIORITY_RANK[o.priority], cell: (o) => <PriorityBadge priority={o.priority} /> },
      {
        id: "action",
        header: "",
        align: "right",
        cell: (o) => (
          <LinkButton href={`/picking-packing/pack/${o.id}`} size="sm" aria-disabled={!canPack} className={cn(!canPack && "pointer-events-none opacity-50")} data-testid="pack-order">
            <PackageCheck /> Pack
          </LinkButton>
        ),
      },
    ],
    [idx.customers, fmt, canPack],
  );

  const packedCols = useMemo<Column<SalesOrder>[]>(
    () => [
      { id: "order", header: "Order", sortValue: (o) => o.number, cell: (o) => <Link href={`/orders/${o.id}`} className="font-medium text-primary hover:underline">{o.number}</Link> },
      { id: "customer", header: "Customer", sortValue: (o) => idx.customers.get(o.customerId)?.name, cell: (o) => idx.customers.get(o.customerId)?.name ?? "—" },
      { id: "slip", header: "Slip", sortValue: (o) => o.packing?.slipNumber, cell: (o) => <span className="font-mono text-xs">{o.packing?.slipNumber}</span> },
      { id: "packages", header: "Packages", hideOnMobile: true, align: "right", sortValue: (o) => o.packing?.packageCount, cell: (o) => `${o.packing?.packageCount} · ${o.packing?.weightKg} kg` },
      { id: "packedAt", header: "Packed", sortValue: (o) => o.packing?.packedAt, cell: (o) => fmt.dateTime(o.packing?.packedAt) },
      { id: "status", header: "Status", sortValue: (o) => o.status, cell: (o) => <StatusBadge status={o.status} /> },
      {
        id: "action",
        header: "",
        align: "right",
        cell: (o) => (
          <LinkButton href={`/picking-packing/pack/${o.id}`} variant="outline" size="sm" data-testid="view-packing-slip">
            <FileText /> View packing slip
          </LinkButton>
        ),
      },
    ],
    [idx.customers, fmt],
  );

  return (
    <div className="space-y-4">
      <section className="rounded-xl border bg-card shadow-card">
        <header className="border-b px-4 py-3">
          <h2 className="text-sm font-semibold">Ready to pack</h2>
          <p className="text-xs text-muted-foreground">Fully picked orders waiting for packing.</p>
        </header>
        <DataTable
          testId="ready-pack-table"
          data={ready}
          columns={readyCols}
          getRowId={(o) => o.id}
          compact
          empty={{ title: "Nothing to pack", description: "Orders appear here once every pick task is complete.", icon: PackageCheck }}
          mobileCard={(o) => (
            <div className="space-y-2">
              <div className="flex items-start justify-between gap-2">
                <div>
                  <p className="font-semibold text-primary">{o.number}</p>
                  <p className="text-xs text-muted-foreground">{idx.customers.get(o.customerId)?.name}</p>
                </div>
                <PriorityBadge priority={o.priority} />
              </div>
              <p className="text-xs text-muted-foreground">{o.lines.length} lines · {fmt.number(orderQty(o))} units</p>
              <LinkButton href={`/picking-packing/pack/${o.id}`} size="lg" className="h-11 w-full text-base" data-testid="pack-order">
                <PackageCheck /> Pack order
              </LinkButton>
            </div>
          )}
        />
      </section>
      <section className="rounded-xl border bg-card shadow-card">
        <header className="border-b px-4 py-3">
          <h2 className="text-sm font-semibold">Recently packed</h2>
          <p className="text-xs text-muted-foreground">Packing slips for the latest packed orders.</p>
        </header>
        <DataTable
          testId="packed-table"
          data={packed}
          columns={packedCols}
          getRowId={(o) => o.id}
          compact
          pageSize={10}
          empty={{ title: "No packed orders yet", icon: FileText }}
          mobileCard={(o) => (
            <div className="space-y-2">
              <div className="flex items-start justify-between gap-2">
                <div>
                  <p className="font-semibold text-primary">{o.number}</p>
                  <p className="text-xs text-muted-foreground">{idx.customers.get(o.customerId)?.name}</p>
                </div>
                <StatusBadge status={o.status} />
              </div>
              <p className="text-xs text-muted-foreground">Slip <span className="font-mono">{o.packing?.slipNumber}</span> · {fmt.dateTime(o.packing?.packedAt)}</p>
              <LinkButton href={`/picking-packing/pack/${o.id}`} variant="outline" className="w-full">
                <FileText /> View packing slip
              </LinkButton>
            </div>
          )}
        />
      </section>
    </div>
  );
}
