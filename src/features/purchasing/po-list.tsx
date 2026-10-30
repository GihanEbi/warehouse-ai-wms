"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { AlertTriangle, ClipboardList, Plus } from "lucide-react";
import type { PurchaseOrder } from "@/types";
import { Button } from "@/components/ui/button";
import { PageHeader } from "@/components/shared/page-header";
import { DataTable, type Column } from "@/components/shared/data-table";
import { ExportButton } from "@/components/shared/export-button";
import { FilterDropdown, SearchInput, Toolbar } from "@/components/shared/form-controls";
import { LinkButton } from "@/components/shared/link-button";
import { StatusBadge } from "@/components/shared/status-badge";
import { useData, useFormat, useIndex, usePermission, useWarehouseScope } from "@/hooks/use-wms";
import { poTotal } from "@/lib/workflows/purchasing";
import { isPoOverdue, PO_STATUS_OPTIONS, poOutstandingQty } from "./helpers";

export function PurchaseOrdersList() {
  const data = useData();
  const idx = useIndex();
  const fmt = useFormat();
  const { can } = usePermission();
  const [scope] = useWarehouseScope();
  const [q, setQ] = useState("");
  const [status, setStatus] = useState("all");
  const [supplier, setSupplier] = useState("all");
  const [warehouse, setWarehouse] = useState("all");

  const rows = useMemo(() => {
    const term = q.trim().toLowerCase();
    return data.purchaseOrders.filter((po) => {
      if (scope !== "all" && po.warehouseId !== scope) return false;
      if (status !== "all" && po.status !== status) return false;
      if (supplier !== "all" && po.supplierId !== supplier) return false;
      if (warehouse !== "all" && po.warehouseId !== warehouse) return false;
      if (!term) return true;
      return (
        po.number.toLowerCase().includes(term) ||
        (idx.suppliers.get(po.supplierId)?.name ?? "").toLowerCase().includes(term) ||
        (idx.warehouses.get(po.warehouseId)?.name ?? "").toLowerCase().includes(term)
      );
    });
  }, [data.purchaseOrders, idx, q, status, supplier, warehouse, scope]);

  const columns = useMemo<Column<PurchaseOrder>[]>(
    () => [
      {
        id: "number",
        header: "PO number",
        sortValue: (r) => r.number,
        cell: (r) => (
          <Link href={`/purchase-orders/${r.id}`} className="font-medium whitespace-nowrap text-primary hover:underline" onClick={(e) => e.stopPropagation()}>
            {r.number}
          </Link>
        ),
      },
      { id: "supplier", header: "Supplier", sortValue: (r) => idx.suppliers.get(r.supplierId)?.name ?? "", cell: (r) => idx.suppliers.get(r.supplierId)?.name ?? "—" },
      { id: "warehouse", header: "Warehouse", hideOnMobile: true, sortValue: (r) => idx.warehouses.get(r.warehouseId)?.name ?? "", cell: (r) => idx.warehouses.get(r.warehouseId)?.name ?? "—" },
      { id: "orderDate", header: "Order date", hideOnMobile: true, sortValue: (r) => r.orderDate, cell: (r) => <span className="whitespace-nowrap">{fmt.date(r.orderDate)}</span> },
      {
        id: "expected",
        header: "Expected delivery",
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
      { id: "total", header: "Total", align: "right", sortValue: (r) => poTotal(r), cell: (r) => <span className="tabular-nums">{fmt.money(poTotal(r))}</span> },
      { id: "status", header: "Status", sortValue: (r) => r.status, cell: (r) => <StatusBadge status={r.status} /> },
      {
        id: "actions",
        header: "Actions",
        align: "right",
        cell: (r) => (
          <span className="inline-flex items-center gap-1" onClick={(e) => e.stopPropagation()}>
            <LinkButton href={`/purchase-orders/${r.id}`} variant="ghost" size="sm">View</LinkButton>
            {r.status === "draft" && can("po.write") && (
              <LinkButton href={`/purchase-orders/${r.id}/edit`} variant="outline" size="sm">Edit</LinkButton>
            )}
            {(r.status === "approved" || r.status === "partially_received") && can("receiving.write") && (
              <LinkButton href={`/receiving/new?po=${r.id}`} variant="outline" size="sm">Receive</LinkButton>
            )}
          </span>
        ),
      },
    ],
    [idx, fmt, can],
  );

  return (
    <>
      <PageHeader
        title="Purchase Orders"
        description="Order stock from suppliers, approve it and track what is still outstanding."
        actions={
          <>
            <ExportButton
              filename="purchase-orders"
              getData={() => ({
                headers: ["PO number", "Supplier", "Warehouse", "Order date", "Expected delivery", "Status", "Ordered qty", "Outstanding qty", "Total (LKR)"],
                rows: rows.map((r) => [
                  r.number,
                  idx.suppliers.get(r.supplierId)?.name,
                  idx.warehouses.get(r.warehouseId)?.name,
                  r.orderDate.slice(0, 10),
                  r.expectedDate.slice(0, 10),
                  r.status,
                  r.lines.reduce((s, l) => s + l.quantity, 0),
                  poOutstandingQty(r),
                  poTotal(r),
                ]),
              })}
            />
            {can("po.write") ? (
              <LinkButton href="/purchase-orders/new" data-testid="new-po">
                <Plus /> New purchase order
              </LinkButton>
            ) : (
              <Button disabled title="Your role cannot create purchase orders" data-testid="new-po">
                <Plus /> New purchase order
              </Button>
            )}
          </>
        }
      />
      <div className="rounded-xl border bg-card shadow-card">
        <Toolbar>
          <SearchInput value={q} onChange={setQ} placeholder="Search PO number, supplier…" />
          <FilterDropdown label="Status" value={status} onChange={setStatus} options={PO_STATUS_OPTIONS} allLabel="All statuses" />
          <FilterDropdown
            label="Supplier"
            value={supplier}
            onChange={setSupplier}
            options={data.suppliers.map((s) => ({ value: s.id, label: s.name }))}
            allLabel="All suppliers"
          />
          <FilterDropdown
            label="Warehouse"
            value={warehouse}
            onChange={setWarehouse}
            options={data.warehouses.map((w) => ({ value: w.id, label: w.name }))}
            allLabel="All warehouses"
          />
        </Toolbar>
        <DataTable
          testId="po-table"
          data={rows}
          columns={columns}
          getRowId={(r) => r.id}
          rowHref={(r) => `/purchase-orders/${r.id}`}
          initialSort={{ id: "orderDate", desc: true }}
          empty={{
            title: "No purchase orders found",
            description: "Try adjusting your search or filters, or create a new purchase order.",
            icon: ClipboardList,
          }}
          mobileCard={(r) => (
            <div className="space-y-1.5">
              <div className="flex items-start justify-between gap-2">
                <Link href={`/purchase-orders/${r.id}`} className="font-medium text-primary" onClick={(e) => e.stopPropagation()}>
                  {r.number}
                </Link>
                <StatusBadge status={r.status} />
              </div>
              <p className="text-sm">{idx.suppliers.get(r.supplierId)?.name}</p>
              <p className="text-xs text-muted-foreground">
                {idx.warehouses.get(r.warehouseId)?.name} · Due {fmt.date(r.expectedDate)}
                {isPoOverdue(r) && <span className="ml-1 font-medium text-danger">Overdue</span>}
              </p>
              <p className="text-sm font-semibold tabular-nums">{fmt.money(poTotal(r))}</p>
            </div>
          )}
        />
      </div>
    </>
  );
}
