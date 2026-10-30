"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { ArrowLeftRight, Plus } from "lucide-react";
import type { StockTransfer } from "@/types";
import { Button } from "@/components/ui/button";
import { PageHeader } from "@/components/shared/page-header";
import { DataTable, type Column } from "@/components/shared/data-table";
import { ExportButton } from "@/components/shared/export-button";
import { FilterDropdown, SearchInput, Toolbar } from "@/components/shared/form-controls";
import { LinkButton } from "@/components/shared/link-button";
import { StatusBadge } from "@/components/shared/status-badge";
import { useData, useFormat, useIndex, usePermission, useWarehouseScope } from "@/hooks/use-wms";
import { TRANSFER_STATUS_OPTIONS, TRANSFER_TYPE_LABEL, transferUnits } from "./helpers";

export function TransfersList() {
  const data = useData();
  const idx = useIndex();
  const fmt = useFormat();
  const { can } = usePermission();
  const [scope] = useWarehouseScope();
  const [q, setQ] = useState("");
  const [status, setStatus] = useState("all");
  const [type, setType] = useState("all");
  const [warehouse, setWarehouse] = useState("all");

  const whName = (id: string) => idx.warehouses.get(id)?.name ?? "—";

  const rows = useMemo(() => {
    const term = q.trim().toLowerCase();
    return data.transfers.filter((t) => {
      if (scope !== "all" && t.fromWarehouseId !== scope && t.toWarehouseId !== scope) return false;
      if (status !== "all" && t.status !== status) return false;
      if (type !== "all" && t.type !== type) return false;
      if (warehouse !== "all" && t.fromWarehouseId !== warehouse && t.toWarehouseId !== warehouse) return false;
      if (!term) return true;
      return (
        t.number.toLowerCase().includes(term) ||
        whName(t.fromWarehouseId).toLowerCase().includes(term) ||
        whName(t.toWarehouseId).toLowerCase().includes(term) ||
        t.lines.some((l) => (idx.products.get(l.productId)?.name ?? "").toLowerCase().includes(term))
      );
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data.transfers, idx, q, status, type, warehouse, scope]);

  const columns = useMemo<Column<StockTransfer>[]>(
    () => [
      {
        id: "number",
        header: "Transfer",
        sortValue: (t) => t.number,
        cell: (t) => (
          <Link href={`/transfers/${t.id}`} className="font-medium text-primary hover:underline" onClick={(e) => e.stopPropagation()}>
            {t.number}
          </Link>
        ),
      },
      { id: "type", header: "Type", sortValue: (t) => t.type, cell: (t) => TRANSFER_TYPE_LABEL[t.type] },
      { id: "from", header: "Source", sortValue: (t) => whName(t.fromWarehouseId), cell: (t) => whName(t.fromWarehouseId) },
      {
        id: "to",
        header: "Destination",
        sortValue: (t) => whName(t.toWarehouseId),
        cell: (t) => (t.type === "internal" ? <span className="text-muted-foreground">Same warehouse (bins)</span> : whName(t.toWarehouseId)),
      },
      { id: "products", header: "Products", align: "right", sortValue: (t) => t.lines.length, cell: (t) => <span className="tabular-nums">{t.lines.length} <span className="text-xs text-muted-foreground">({fmt.number(transferUnits(t))} units)</span></span> },
      { id: "status", header: "Status", sortValue: (t) => t.status, cell: (t) => <StatusBadge status={t.status} domain="transfer" /> },
      { id: "date", header: "Date", sortValue: (t) => t.createdAt, cell: (t) => fmt.date(t.createdAt) },
      {
        id: "actions",
        header: "",
        align: "right",
        cell: (t) => (
          <span onClick={(e) => e.stopPropagation()}>
            <LinkButton href={`/transfers/${t.id}`} variant="ghost" size="sm">View</LinkButton>
          </span>
        ),
      },
    ],
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [idx, fmt],
  );

  return (
    <>
      <PageHeader
        title="Stock Transfers"
        description="Move stock between bins or between warehouses, with approval and in-transit tracking."
        actions={
          <>
            <ExportButton
              filename="stock-transfers"
              getData={() => ({
                headers: ["Transfer", "Type", "Source", "Destination", "Products", "Units", "Status", "Created"],
                rows: rows.map((t) => [
                  t.number,
                  TRANSFER_TYPE_LABEL[t.type],
                  whName(t.fromWarehouseId),
                  whName(t.toWarehouseId),
                  t.lines.length,
                  transferUnits(t),
                  t.status,
                  t.createdAt.slice(0, 10),
                ]),
              })}
            />
            {can("transfers.write") ? (
              <LinkButton href="/transfers/new" data-testid="new-transfer"><Plus /> New transfer</LinkButton>
            ) : (
              <Button disabled title="Your role cannot create transfers" data-testid="new-transfer"><Plus /> New transfer</Button>
            )}
          </>
        }
      />
      <div className="rounded-xl border bg-card shadow-card">
        <Toolbar>
          <SearchInput value={q} onChange={setQ} placeholder="Search transfer, warehouse, product…" />
          <FilterDropdown label="Status" value={status} onChange={setStatus} options={TRANSFER_STATUS_OPTIONS} allLabel="All statuses" />
          <FilterDropdown
            label="Type"
            value={type}
            onChange={setType}
            options={[
              { value: "internal", label: "Bin-to-bin" },
              { value: "inter_warehouse", label: "Inter-warehouse" },
            ]}
            allLabel="All types"
          />
          <FilterDropdown label="Warehouse" value={warehouse} onChange={setWarehouse} options={data.warehouses.map((w) => ({ value: w.id, label: w.name }))} allLabel="All warehouses" />
        </Toolbar>
        <DataTable
          testId="transfers-table"
          data={rows}
          columns={columns}
          getRowId={(t) => t.id}
          rowHref={(t) => `/transfers/${t.id}`}
          initialSort={{ id: "date", desc: true }}
          empty={{ title: "No transfers found", description: "Try adjusting your filters, or create a new transfer.", icon: ArrowLeftRight }}
          mobileCard={(t) => (
            <div className="space-y-1.5">
              <div className="flex items-start justify-between gap-2">
                <span className="font-medium text-primary">{t.number}</span>
                <StatusBadge status={t.status} domain="transfer" />
              </div>
              <p className="text-sm">
                {t.type === "internal" ? `Bin-to-bin · ${whName(t.fromWarehouseId)}` : `${whName(t.fromWarehouseId)} → ${whName(t.toWarehouseId)}`}
              </p>
              <p className="text-xs text-muted-foreground">
                {t.lines.length} product{t.lines.length === 1 ? "" : "s"} · {fmt.number(transferUnits(t))} units · {fmt.date(t.createdAt)}
              </p>
            </div>
          )}
        />
      </div>
    </>
  );
}
