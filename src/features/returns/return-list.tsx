"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { Plus, RotateCcw } from "lucide-react";
import type { ReturnRecord } from "@/types";
import { PageHeader } from "@/components/shared/page-header";
import { DataTable, type Column } from "@/components/shared/data-table";
import { ExportButton } from "@/components/shared/export-button";
import { FilterDropdown, SearchInput, Toolbar } from "@/components/shared/form-controls";
import { LinkButton } from "@/components/shared/link-button";
import { StatusBadge } from "@/components/shared/status-badge";
import { useData, useFormat, useIndex, usePermission, useWarehouseScope } from "@/hooks/use-wms";

export const RETURN_STATUS_OPTIONS = [
  { value: "requested", label: "Requested" },
  { value: "received", label: "Received" },
  { value: "inspected", label: "Inspected" },
  { value: "restocked", label: "Restocked" },
  { value: "rejected", label: "Rejected" },
];

export function ReturnList() {
  const data = useData();
  const idx = useIndex();
  const fmt = useFormat();
  const { can } = usePermission();
  const [scope] = useWarehouseScope();
  const [q, setQ] = useState("");
  const [status, setStatus] = useState("all");
  const [warehouse, setWarehouse] = useState<string | null>(null);
  const wh = warehouse ?? scope;

  const orderNo = (r: ReturnRecord) => data.orders.find((o) => o.id === r.orderId)?.number ?? "—";
  const units = (r: ReturnRecord) => r.lines.reduce((s, l) => s + l.quantity, 0);

  const rows = useMemo(() => {
    const term = q.trim().toLowerCase();
    return data.returns.filter((r) => {
      if (wh !== "all" && r.warehouseId !== wh) return false;
      if (status !== "all" && r.status !== status) return false;
      if (term) {
        const hay = `${r.number} ${data.orders.find((o) => o.id === r.orderId)?.number ?? ""} ${idx.customers.get(r.customerId)?.name ?? ""} ${r.reason}`.toLowerCase();
        if (!hay.includes(term)) return false;
      }
      return true;
    });
  }, [data.returns, data.orders, idx.customers, q, status, wh]);

  const cols = useMemo<Column<ReturnRecord>[]>(
    () => [
      { id: "number", header: "RMA", sortValue: (r) => r.number, cell: (r) => <Link href={`/returns/${r.id}`} className="font-medium text-primary hover:underline">{r.number}</Link> },
      {
        id: "order",
        header: "Original order",
        sortValue: (r) => data.orders.find((o) => o.id === r.orderId)?.number,
        cell: (r) => <Link href={`/orders/${r.orderId}`} className="hover:underline" onClick={(e) => e.stopPropagation()}>{data.orders.find((o) => o.id === r.orderId)?.number ?? "—"}</Link>,
      },
      { id: "customer", header: "Customer", sortValue: (r) => idx.customers.get(r.customerId)?.name, cell: (r) => idx.customers.get(r.customerId)?.name ?? "—" },
      { id: "warehouse", header: "Warehouse", hideOnMobile: true, sortValue: (r) => idx.warehouses.get(r.warehouseId)?.name, cell: (r) => idx.warehouses.get(r.warehouseId)?.name ?? "—" },
      { id: "items", header: "Items", align: "right", sortValue: units, cell: (r) => `${r.lines.length} · ${fmt.number(units(r))} units` },
      { id: "status", header: "Status", sortValue: (r) => r.status, cell: (r) => <StatusBadge status={r.status} domain="return" /> },
      { id: "reason", header: "Reason", hideOnMobile: true, className: "max-w-[14rem] truncate", cell: (r) => r.reason },
      { id: "date", header: "Date", sortValue: (r) => r.createdAt, cell: (r) => fmt.date(r.createdAt) },
    ],
    [data.orders, idx, fmt],
  );

  const exportData = () => ({
    headers: ["RMA", "Original order", "Customer", "Warehouse", "Lines", "Units", "Good units", "Damaged units", "Status", "Reason", "Date"],
    rows: rows.map((r) => [
      r.number,
      orderNo(r),
      idx.customers.get(r.customerId)?.name,
      idx.warehouses.get(r.warehouseId)?.name,
      r.lines.length,
      units(r),
      r.lines.reduce((s, l) => s + l.goodQty, 0),
      r.lines.reduce((s, l) => s + l.damagedQty, 0),
      r.status,
      r.reason,
      r.createdAt.slice(0, 10),
    ]),
  });

  return (
    <>
      <PageHeader
        title="Returns"
        description="Customer returns (RMA): receive, inspect and restock or reject. This list doubles as the return history."
        actions={
          <>
            <ExportButton filename="returns" getData={exportData} />
            {can("returns.write") && (
              <LinkButton href="/returns/new" data-testid="new-return">
                <Plus /> New return
              </LinkButton>
            )}
          </>
        }
      />
      <div className="rounded-xl border bg-card shadow-card">
        <Toolbar>
          <SearchInput value={q} onChange={setQ} placeholder="Search RMA, order, customer, reason…" />
          <FilterDropdown label="Status" value={status} onChange={setStatus} options={RETURN_STATUS_OPTIONS} />
          <FilterDropdown label="Warehouse" value={wh} onChange={setWarehouse} allLabel="All warehouses" options={data.warehouses.map((w) => ({ value: w.id, label: w.name }))} />
        </Toolbar>
        <DataTable
          testId="returns-table"
          data={rows}
          columns={cols}
          getRowId={(r) => r.id}
          rowHref={(r) => `/returns/${r.id}`}
          initialSort={{ id: "date", desc: true }}
          empty={{ title: "No returns found", description: "Try adjusting your search or filters.", icon: RotateCcw }}
          footerNote={<span>{rows.length} return{rows.length === 1 ? "" : "s"}</span>}
          mobileCard={(r) => (
            <div className="space-y-1.5">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="font-semibold text-primary">{r.number}</p>
                  <p className="truncate text-sm">{idx.customers.get(r.customerId)?.name}</p>
                </div>
                <StatusBadge status={r.status} domain="return" />
              </div>
              <p className="text-xs text-muted-foreground">Order {orderNo(r)} · {fmt.number(units(r))} units · {fmt.date(r.createdAt)}</p>
              <p className="truncate text-xs text-muted-foreground">{r.reason}</p>
            </div>
          )}
        />
      </div>
    </>
  );
}
