"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { AlertCircle, Plus, ShoppingCart } from "lucide-react";
import type { SalesOrder } from "@/types";
import { PageHeader } from "@/components/shared/page-header";
import { DataTable, type Column } from "@/components/shared/data-table";
import { ExportButton } from "@/components/shared/export-button";
import { FilterDropdown, SearchInput, Toolbar } from "@/components/shared/form-controls";
import { LinkButton } from "@/components/shared/link-button";
import { PriorityBadge, StatusBadge } from "@/components/shared/status-badge";
import { useData, useFormat, useIndex, usePermission, useWarehouseScope } from "@/hooks/use-wms";
import { orderTotal } from "@/lib/workflows/orders";
import { ORDER_STATUS_OPTIONS, PRIORITY_OPTIONS, isOverdue, orderQty } from "./order-utils";

export function OrderList() {
  const data = useData();
  const idx = useIndex();
  const fmt = useFormat();
  const { can } = usePermission();
  const [scope] = useWarehouseScope();
  const [q, setQ] = useState("");
  const [status, setStatus] = useState("all");
  const [priority, setPriority] = useState("all");
  const [warehouse, setWarehouse] = useState<string | null>(null);
  const wh = warehouse ?? scope;

  const rows = useMemo(() => {
    const term = q.trim().toLowerCase();
    return data.orders.filter((o) => {
      if (wh !== "all" && o.warehouseId !== wh) return false;
      if (status !== "all" && o.status !== status) return false;
      if (priority !== "all" && o.priority !== priority) return false;
      if (term) {
        const cust = idx.customers.get(o.customerId)?.name.toLowerCase() ?? "";
        if (!o.number.toLowerCase().includes(term) && !cust.includes(term)) return false;
      }
      return true;
    });
  }, [data.orders, idx.customers, q, status, priority, wh]);

  const cols = useMemo<Column<SalesOrder>[]>(
    () => [
      {
        id: "number",
        header: "Order",
        sortValue: (o) => o.number,
        cell: (o) => (
          <Link href={`/orders/${o.id}`} className="font-medium text-primary hover:underline" data-testid="order-link">
            {o.number}
          </Link>
        ),
      },
      { id: "customer", header: "Customer", sortValue: (o) => idx.customers.get(o.customerId)?.name, cell: (o) => idx.customers.get(o.customerId)?.name ?? "—" },
      { id: "warehouse", header: "Warehouse", hideOnMobile: true, sortValue: (o) => idx.warehouses.get(o.warehouseId)?.name, cell: (o) => idx.warehouses.get(o.warehouseId)?.name ?? "—" },
      { id: "date", header: "Order date", sortValue: (o) => o.orderDate, cell: (o) => fmt.date(o.orderDate) },
      { id: "products", header: "Products", align: "right", sortValue: (o) => o.lines.length, cell: (o) => fmt.number(o.lines.length) },
      { id: "total", header: "Total", align: "right", sortValue: (o) => orderTotal(o), cell: (o) => <span className="tabular-nums">{fmt.money(orderTotal(o))}</span> },
      { id: "priority", header: "Priority", sortValue: (o) => ["low", "normal", "high", "urgent"].indexOf(o.priority), cell: (o) => <PriorityBadge priority={o.priority} /> },
      { id: "status", header: "Status", sortValue: (o) => o.status, cell: (o) => <StatusBadge status={o.status} /> },
      {
        id: "required",
        header: "Required",
        sortValue: (o) => o.requiredDate,
        cell: (o) => (
          <span className={isOverdue(o) ? "inline-flex items-center gap-1 font-medium text-danger" : ""}>
            {isOverdue(o) && <AlertCircle className="size-3.5" aria-hidden />}
            {fmt.date(o.requiredDate)}
            {isOverdue(o) && <span className="sr-only"> (overdue)</span>}
          </span>
        ),
      },
    ],
    [idx, fmt],
  );

  const exportData = () => ({
    headers: ["Order", "Customer", "Warehouse", "Order date", "Products", "Units", "Total (LKR)", "Priority", "Status", "Required date", "Overdue"],
    rows: rows.map((o) => [
      o.number,
      idx.customers.get(o.customerId)?.name,
      idx.warehouses.get(o.warehouseId)?.name,
      o.orderDate.slice(0, 10),
      o.lines.length,
      orderQty(o),
      orderTotal(o),
      o.priority,
      o.status,
      o.requiredDate.slice(0, 10),
      isOverdue(o) ? "yes" : "no",
    ]),
  });

  return (
    <>
      <PageHeader
        title="Customer Orders"
        description="Create, confirm and track outbound customer orders."
        actions={
          <>
            <ExportButton filename="customer-orders" getData={exportData} />
            {can("orders.write") ? (
              <LinkButton href="/orders/new" data-testid="new-order">
                <Plus /> New order
              </LinkButton>
            ) : null}
          </>
        }
      />
      <div className="rounded-xl border bg-card shadow-card">
        <Toolbar>
          <SearchInput value={q} onChange={setQ} placeholder="Search order number or customer…" />
          <FilterDropdown label="Status" value={status} onChange={setStatus} options={ORDER_STATUS_OPTIONS} />
          <FilterDropdown label="Priority" value={priority} onChange={setPriority} options={PRIORITY_OPTIONS.map((p) => ({ value: p.value, label: p.label }))} />
          <FilterDropdown
            label="Warehouse"
            value={wh}
            onChange={setWarehouse}
            allLabel="All warehouses"
            options={data.warehouses.map((w) => ({ value: w.id, label: w.name }))}
          />
        </Toolbar>
        <DataTable
          testId="orders-table"
          data={rows}
          columns={cols}
          getRowId={(o) => o.id}
          rowHref={(o) => `/orders/${o.id}`}
          initialSort={{ id: "date", desc: true }}
          empty={{
            title: "No orders found",
            description: "Try adjusting your search or filters, or create a new order.",
            icon: ShoppingCart,
            action: can("orders.write") ? <LinkButton href="/orders/new">New order</LinkButton> : undefined,
          }}
          footerNote={<span>{rows.length} order{rows.length === 1 ? "" : "s"}</span>}
          mobileCard={(o) => (
            <div className="space-y-2">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="font-medium text-primary">{o.number}</p>
                  <p className="truncate text-sm">{idx.customers.get(o.customerId)?.name ?? "—"}</p>
                </div>
                <StatusBadge status={o.status} />
              </div>
              <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-muted-foreground">
                <span>{o.lines.length} product{o.lines.length === 1 ? "" : "s"} · {fmt.money(orderTotal(o))}</span>
                <PriorityBadge priority={o.priority} />
              </div>
              <p className={isOverdue(o) ? "text-xs font-medium text-danger" : "text-xs text-muted-foreground"}>
                {isOverdue(o) ? "Overdue - " : "Required "}
                {fmt.date(o.requiredDate)}
              </p>
            </div>
          )}
        />
      </div>
    </>
  );
}
