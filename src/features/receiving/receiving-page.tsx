"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { AlertTriangle, CheckCheck, Info, PackageCheck, PackageOpen, Truck, Warehouse as WarehouseIcon } from "lucide-react";
import type { GoodsReceipt, PurchaseOrder, WarehouseTask } from "@/types";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { PageHeader } from "@/components/shared/page-header";
import { DataTable, type Column } from "@/components/shared/data-table";
import { ConfirmationDialog } from "@/components/shared/dialogs";
import { ExportButton } from "@/components/shared/export-button";
import { FilterDropdown, SearchInput, Toolbar } from "@/components/shared/form-controls";
import { LinkButton } from "@/components/shared/link-button";
import { StatusBadge } from "@/components/shared/status-badge";
import { useData, useFormat, useIndex, usePermission, useTx, useWarehouseScope } from "@/hooks/use-wms";
import { useSubmit } from "@/hooks/use-submit";
import { isPoOverdue, isReceivable, poOutstandingQty } from "@/features/purchasing/helpers";
import { isPendingPutaway, PutawayControl } from "./putaway-control";

type TabKey = "expected" | "history" | "putaway";

export function ReceivingPage() {
  const params = useSearchParams();
  const router = useRouter();
  const data = useData();
  const initial = params.get("tab");
  const [tab, setTab] = useState<TabKey>(initial === "history" || initial === "putaway" ? initial : "expected");
  const [scope] = useWarehouseScope();
  const { can } = usePermission();

  const expectedCount = data.purchaseOrders.filter((p) => isReceivable(p) && (scope === "all" || p.warehouseId === scope)).length;
  const putawayCount = data.tasks.filter((t) => isPendingPutaway(t) && (scope === "all" || t.warehouseId === scope)).length;

  return (
    <>
      <PageHeader
        title="Goods Receiving"
        description="Receive supplier deliveries into staging, then put the stock away so it becomes available."
        actions={
          can("receiving.write") ? (
            <LinkButton href="/receiving/new" data-testid="new-receipt">
              <PackageCheck /> Receive goods
            </LinkButton>
          ) : (
            <Button disabled title="Your role cannot receive goods"><PackageCheck /> Receive goods</Button>
          )
        }
      />
      <Tabs
        value={tab}
        onValueChange={(v) => {
          setTab(v as TabKey);
          router.replace(`/receiving?tab=${v}`, { scroll: false });
        }}
      >
        <TabsList className="mb-3 max-w-full overflow-x-auto" aria-label="Receiving sections">
          <TabsTrigger value="expected" data-testid="tab-expected" className="px-3">
            Expected<span className="hidden sm:inline"> deliveries</span> <CountPill n={expectedCount} />
          </TabsTrigger>
          <TabsTrigger value="history" data-testid="tab-history" className="px-3"><span className="sm:hidden">History</span><span className="hidden sm:inline">Receiving history</span></TabsTrigger>
          <TabsTrigger value="putaway" data-testid="tab-putaway" className="px-3">
            Putaway <CountPill n={putawayCount} tone="warning" />
          </TabsTrigger>
        </TabsList>
        <TabsContent value="expected"><ExpectedDeliveries /></TabsContent>
        <TabsContent value="history"><ReceivingHistory /></TabsContent>
        <TabsContent value="putaway"><PutawayTab /></TabsContent>
      </Tabs>
    </>
  );
}

function CountPill({ n, tone }: { n: number; tone?: "warning" }) {
  if (n === 0) return null;
  return (
    <span className={`rounded-full px-1.5 text-[11px] font-semibold tabular-nums ${tone === "warning" ? "bg-warning-soft text-warning" : "bg-primary-soft text-primary"}`}>{n}</span>
  );
}

/* ------------------------------------------------------- expected deliveries */

function ExpectedDeliveries() {
  const data = useData();
  const idx = useIndex();
  const fmt = useFormat();
  const { can } = usePermission();
  const [scope] = useWarehouseScope();
  const [q, setQ] = useState("");

  const rows = useMemo(() => {
    const term = q.trim().toLowerCase();
    return data.purchaseOrders.filter((po) => {
      if (!isReceivable(po)) return false;
      if (scope !== "all" && po.warehouseId !== scope) return false;
      if (!term) return true;
      return po.number.toLowerCase().includes(term) || (idx.suppliers.get(po.supplierId)?.name ?? "").toLowerCase().includes(term);
    });
  }, [data.purchaseOrders, idx, q, scope]);

  const columns = useMemo<Column<PurchaseOrder>[]>(
    () => [
      {
        id: "po",
        header: "Purchase order",
        sortValue: (r) => r.number,
        cell: (r) => (
          <Link href={`/purchase-orders/${r.id}`} className="font-medium text-primary hover:underline" onClick={(e) => e.stopPropagation()}>
            {r.number}
          </Link>
        ),
      },
      { id: "supplier", header: "Supplier", sortValue: (r) => idx.suppliers.get(r.supplierId)?.name ?? "", cell: (r) => idx.suppliers.get(r.supplierId)?.name ?? "—" },
      { id: "warehouse", header: "Warehouse", hideOnMobile: true, sortValue: (r) => idx.warehouses.get(r.warehouseId)?.name ?? "", cell: (r) => idx.warehouses.get(r.warehouseId)?.name ?? "—" },
      {
        id: "expected",
        header: "Expected",
        sortValue: (r) => r.expectedDate,
        cell: (r) => (
          <span className="inline-flex flex-wrap items-center gap-1.5">
            {fmt.date(r.expectedDate)}
            {isPoOverdue(r) && (
              <span className="inline-flex items-center gap-1 rounded-full bg-danger-soft px-1.5 py-0.5 text-[11px] font-medium text-danger" data-testid="overdue-flag">
                <AlertTriangle className="size-3" aria-hidden /> Overdue
              </span>
            )}
          </span>
        ),
      },
      { id: "outstanding", header: "Outstanding qty", align: "right", sortValue: (r) => poOutstandingQty(r), cell: (r) => <span className="tabular-nums font-medium">{fmt.number(poOutstandingQty(r))}</span> },
      { id: "status", header: "Status", cell: (r) => <StatusBadge status={r.status} /> },
      {
        id: "action",
        header: "",
        align: "right",
        cell: (r) => (
          <span onClick={(e) => e.stopPropagation()}>
            {can("receiving.write") ? (
              <LinkButton href={`/receiving/new?po=${r.id}`} size="sm" data-testid="start-receiving">
                <PackageOpen /> Start receiving
              </LinkButton>
            ) : (
              <Button size="sm" disabled title="Your role cannot receive goods" data-testid="start-receiving"><PackageOpen /> Start receiving</Button>
            )}
          </span>
        ),
      },
    ],
    [idx, fmt, can],
  );

  return (
    <div className="rounded-xl border bg-card shadow-card">
      <Toolbar>
        <SearchInput value={q} onChange={setQ} placeholder="Search PO or supplier…" />
        <span className="text-xs text-muted-foreground sm:ml-auto">Approved and partially received purchase orders</span>
      </Toolbar>
      <DataTable
        testId="expected-table"
        data={rows}
        columns={columns}
        getRowId={(r) => r.id}
        rowHref={(r) => `/purchase-orders/${r.id}`}
        initialSort={{ id: "expected" }}
        empty={{ title: "No deliveries expected", description: "Approve a purchase order and it will show up here.", icon: Truck }}
        mobileCard={(r) => (
          <div className="space-y-2">
            <div className="flex items-start justify-between gap-2">
              <span className="font-medium text-primary">{r.number}</span>
              <StatusBadge status={r.status} />
            </div>
            <p className="text-sm">{idx.suppliers.get(r.supplierId)?.name}</p>
            <p className="text-xs text-muted-foreground">
              {idx.warehouses.get(r.warehouseId)?.name} · Due {fmt.date(r.expectedDate)} · {fmt.number(poOutstandingQty(r))} units outstanding
              {isPoOverdue(r) && <span className="ml-1 font-medium text-danger">Overdue</span>}
            </p>
            <div onClick={(e) => e.stopPropagation()}>
              <LinkButton href={`/receiving/new?po=${r.id}`} size="sm" className={can("receiving.write") ? "" : "pointer-events-none opacity-50"}>
                <PackageOpen /> Start receiving
              </LinkButton>
            </div>
          </div>
        )}
      />
    </div>
  );
}

/* ---------------------------------------------------------- receiving history */

function ReceivingHistory() {
  const data = useData();
  const idx = useIndex();
  const fmt = useFormat();
  const [scope] = useWarehouseScope();
  const [q, setQ] = useState("");
  const [status, setStatus] = useState("all");
  const [warehouse, setWarehouse] = useState("all");
  const [supplier, setSupplier] = useState("all");

  const poNumber = (id: string) => data.purchaseOrders.find((p) => p.id === id)?.number ?? "—";

  const rows = useMemo(() => {
    const term = q.trim().toLowerCase();
    return data.receipts.filter((r) => {
      if (scope !== "all" && r.warehouseId !== scope) return false;
      if (status !== "all" && r.status !== status) return false;
      if (warehouse !== "all" && r.warehouseId !== warehouse) return false;
      if (supplier !== "all" && r.supplierId !== supplier) return false;
      if (!term) return true;
      return (
        r.grn.toLowerCase().includes(term) ||
        (data.purchaseOrders.find((p) => p.id === r.purchaseOrderId)?.number ?? "").toLowerCase().includes(term) ||
        (idx.suppliers.get(r.supplierId)?.name ?? "").toLowerCase().includes(term)
      );
    });
  }, [data.receipts, data.purchaseOrders, idx, q, status, warehouse, supplier, scope]);

  const sum = (r: GoodsReceipt, k: "expectedQty" | "receivedQty" | "damagedQty") => r.lines.reduce((s, l) => s + l[k], 0);

  const columns = useMemo<Column<GoodsReceipt>[]>(
    () => [
      { id: "grn", header: "GRN", sortValue: (r) => r.grn, cell: (r) => <span className="font-medium text-primary">{r.grn}</span> },
      {
        id: "po",
        header: "Purchase order",
        sortValue: (r) => poNumber(r.purchaseOrderId),
        cell: (r) => (
          <Link href={`/purchase-orders/${r.purchaseOrderId}`} className="hover:underline" onClick={(e) => e.stopPropagation()}>
            {poNumber(r.purchaseOrderId)}
          </Link>
        ),
      },
      { id: "supplier", header: "Supplier", hideOnMobile: true, sortValue: (r) => idx.suppliers.get(r.supplierId)?.name ?? "", cell: (r) => idx.suppliers.get(r.supplierId)?.name ?? "—" },
      { id: "warehouse", header: "Warehouse", hideOnMobile: true, sortValue: (r) => idx.warehouses.get(r.warehouseId)?.name ?? "", cell: (r) => idx.warehouses.get(r.warehouseId)?.name ?? "—" },
      { id: "expected", header: "Expected", align: "right", sortValue: (r) => sum(r, "expectedQty"), cell: (r) => <span className="tabular-nums">{fmt.number(sum(r, "expectedQty"))}</span> },
      { id: "received", header: "Received", align: "right", sortValue: (r) => sum(r, "receivedQty"), cell: (r) => <span className="tabular-nums font-medium">{fmt.number(sum(r, "receivedQty"))}</span> },
      {
        id: "damaged",
        header: "Damaged",
        align: "right",
        sortValue: (r) => sum(r, "damagedQty"),
        cell: (r) => <span className={sum(r, "damagedQty") > 0 ? "tabular-nums text-danger" : "tabular-nums text-muted-foreground"}>{fmt.number(sum(r, "damagedQty"))}</span>,
      },
      { id: "status", header: "Status", sortValue: (r) => r.status, cell: (r) => <StatusBadge status={r.status} /> },
      { id: "date", header: "Date", sortValue: (r) => r.receivedAt, cell: (r) => fmt.date(r.receivedAt) },
    ],
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [idx, fmt, data.purchaseOrders],
  );

  return (
    <div className="rounded-xl border bg-card shadow-card">
      <Toolbar>
        <SearchInput value={q} onChange={setQ} placeholder="Search GRN, PO, supplier…" />
        <FilterDropdown
          label="Status"
          value={status}
          onChange={setStatus}
          options={[
            { value: "awaiting_putaway", label: "Awaiting Putaway" },
            { value: "completed", label: "Completed" },
          ]}
          allLabel="All statuses"
        />
        <FilterDropdown label="Warehouse" value={warehouse} onChange={setWarehouse} options={data.warehouses.map((w) => ({ value: w.id, label: w.name }))} allLabel="All warehouses" />
        <FilterDropdown label="Supplier" value={supplier} onChange={setSupplier} options={data.suppliers.map((s) => ({ value: s.id, label: s.name }))} allLabel="All suppliers" />
        <div className="sm:ml-auto">
          <ExportButton
            size="sm"
            filename="goods-receipts"
            getData={() => ({
              headers: ["GRN", "Purchase order", "Supplier", "Warehouse", "Expected qty", "Received qty", "Damaged qty", "Status", "Received at"],
              rows: rows.map((r) => [
                r.grn,
                poNumber(r.purchaseOrderId),
                idx.suppliers.get(r.supplierId)?.name,
                idx.warehouses.get(r.warehouseId)?.name,
                sum(r, "expectedQty"),
                sum(r, "receivedQty"),
                sum(r, "damagedQty"),
                r.status,
                r.receivedAt.slice(0, 10),
              ]),
            })}
          />
        </div>
      </Toolbar>
      <DataTable
        testId="receipts-table"
        data={rows}
        columns={columns}
        getRowId={(r) => r.id}
        rowHref={(r) => `/receiving/${r.id}`}
        initialSort={{ id: "date", desc: true }}
        empty={{ title: "No goods receipts yet", description: "Receipts appear here after a delivery is confirmed.", icon: PackageCheck }}
        mobileCard={(r) => (
          <div className="space-y-1.5">
            <div className="flex items-start justify-between gap-2">
              <span className="font-medium text-primary">{r.grn}</span>
              <StatusBadge status={r.status} />
            </div>
            <p className="text-sm">{poNumber(r.purchaseOrderId)} · {idx.suppliers.get(r.supplierId)?.name}</p>
            <p className="text-xs text-muted-foreground">
              {fmt.date(r.receivedAt)} · Received {fmt.number(sum(r, "receivedQty"))} of {fmt.number(sum(r, "expectedQty"))}
              {sum(r, "damagedQty") > 0 && ` · ${fmt.number(sum(r, "damagedQty"))} damaged`}
            </p>
          </div>
        )}
      />
    </div>
  );
}

/* -------------------------------------------------------------------- putaway */

function PutawayTab() {
  const data = useData();
  const idx = useIndex();
  const tx = useTx();
  const fmt = useFormat();
  const { can } = usePermission();
  const [scope] = useWarehouseScope();
  const { submit, pending } = useSubmit();
  const [confirmAll, setConfirmAll] = useState(false);

  const tasks = useMemo(
    () =>
      data.tasks
        .filter((t) => isPendingPutaway(t) && (scope === "all" || t.warehouseId === scope))
        .sort((a, b) => a.createdAt.localeCompare(b.createdAt)),
    [data.tasks, scope],
  );

  const grnOf = (t: WarehouseTask) => data.receipts.find((r) => r.id === t.putaway?.receiptId);
  const binCode = (id?: string) => (id ? (idx.bins.get(id)?.code ?? "—") : "—");

  const columns = useMemo<Column<WarehouseTask>[]>(
    () => [
      {
        id: "product",
        header: "Product",
        sortValue: (t) => idx.products.get(t.putaway?.productId ?? "")?.name ?? "",
        cell: (t) => {
          const p = idx.products.get(t.putaway?.productId ?? "");
          return (
            <div className="min-w-[10rem]">
              <p className="font-medium">{p?.name ?? "—"}</p>
              <p className="font-mono text-[11px] text-muted-foreground">{p?.sku}</p>
            </div>
          );
        },
      },
      { id: "qty", header: "Qty", align: "right", sortValue: (t) => t.putaway?.quantity ?? 0, cell: (t) => <span className="tabular-nums font-medium">{fmt.number(t.putaway?.quantity ?? 0)}</span> },
      { id: "from", header: "From (staging)", cell: (t) => <span className="font-mono text-xs whitespace-nowrap">{binCode(t.putaway?.fromBinId)}</span> },
      { id: "suggested", header: "Suggested bin", cell: (t) => <span className="font-mono text-xs whitespace-nowrap">{binCode(t.putaway?.suggestedBinId)}</span> },
      { id: "warehouse", header: "Warehouse", hideOnMobile: true, cell: (t) => idx.warehouses.get(t.warehouseId)?.code ?? "—" },
      {
        id: "grn",
        header: "GRN",
        sortValue: (t) => grnOf(t)?.grn ?? "",
        cell: (t) => {
          const g = grnOf(t);
          return g ? (
            <Link href={`/receiving/${g.id}`} className="whitespace-nowrap text-primary hover:underline">{g.grn}</Link>
          ) : "—";
        },
      },
      { id: "action", header: "Put away to", cell: (t) => <PutawayControl task={t} compact /> },
    ],
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [idx, fmt, data.receipts, data.bins],
  );

  async function completeAll() {
    const res = await submit(
      () => {
        let done = 0;
        const failed: string[] = [];
        for (const t of tasks) {
          const r = tx.completePutaway({ taskId: t.id, binId: t.putaway!.suggestedBinId });
          if (r.ok) done++;
          else failed.push(r.error);
        }
        return { ok: true as const, value: { done, failed } };
      },
      { errorToast: false },
    );
    if (res?.ok) {
      const { done, failed } = res.value;
      if (failed.length === 0) toast.success(`${done} putaway task${done === 1 ? "" : "s"} completed`);
      else toast.warning(`${done} completed, ${failed.length} need a different bin: ${failed[0]}`);
    }
    return true;
  }

  return (
    <div className="space-y-4">
      <Alert data-testid="putaway-alert">
        <Info />
        <AlertTitle>Received stock is not pickable yet</AlertTitle>
        <AlertDescription>
          Goods wait in the staging bin after receiving. They only become <strong>available</strong> for orders and transfers once the putaway is completed into a storage bin.
        </AlertDescription>
      </Alert>
      <div className="rounded-xl border bg-card shadow-card">
        <Toolbar>
          <span className="text-sm text-muted-foreground" data-testid="putaway-count">
            {tasks.length} pending putaway task{tasks.length === 1 ? "" : "s"}
          </span>
          <div className="sm:ml-auto">
            <Button
              variant="outline"
              size="sm"
              disabled={tasks.length === 0 || pending || !can("receiving.write")}
              onClick={() => setConfirmAll(true)}
              data-testid="complete-all-putaway"
            >
              <CheckCheck /> Complete all with suggested bins
            </Button>
          </div>
        </Toolbar>
        <DataTable
          testId="putaway-table"
          data={tasks}
          columns={columns}
          getRowId={(t) => t.id}
          pageSize={10}
          empty={{ title: "Nothing waiting for putaway", description: "All received stock has been stored.", icon: WarehouseIcon }}
          mobileCard={(t) => {
            const p = idx.products.get(t.putaway?.productId ?? "");
            const g = grnOf(t);
            return (
              <div className="space-y-2">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="font-medium">{p?.name}</p>
                    <p className="text-xs text-muted-foreground">
                      {fmt.number(t.putaway?.quantity ?? 0)} units · {binCode(t.putaway?.fromBinId)} → suggested {binCode(t.putaway?.suggestedBinId)}
                    </p>
                  </div>
                  {g && <Link href={`/receiving/${g.id}`} className="shrink-0 text-xs text-primary">{g.grn}</Link>}
                </div>
                <PutawayControl task={t} />
              </div>
            );
          }}
        />
      </div>
      <ConfirmationDialog
        open={confirmAll}
        onOpenChange={setConfirmAll}
        title="Complete all putaway tasks?"
        description={`${tasks.length} task${tasks.length === 1 ? "" : "s"} will be moved from staging into their suggested bins. Tasks whose suggested bin no longer has room stay pending.`}
        confirmLabel="Complete all"
        onConfirm={completeAll}
      />
    </div>
  );
}
