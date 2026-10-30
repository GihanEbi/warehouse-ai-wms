"use client";

import { useMemo } from "react";
import type { StockMovement } from "@/types";
import { DataTable, type Column } from "@/components/shared/data-table";
import { TONE_CLASSES } from "@/components/shared/status-badge";
import { useFormat, useIndex } from "@/hooks/use-wms";
import { cn } from "@/lib/utils";
import { MOVEMENT_LABELS, MOVEMENT_TONE } from "./movement-labels";

export function MovementTypeBadge({ type }: { type: StockMovement["type"] }) {
  return (
    <span className={cn("inline-flex items-center whitespace-nowrap rounded-full px-2 py-0.5 text-xs font-medium", TONE_CLASSES[MOVEMENT_TONE[type]])}>
      {MOVEMENT_LABELS[type]}
    </span>
  );
}

function SignedQty({ m }: { m: StockMovement }) {
  const cls = m.onHandDelta > 0 ? "text-success" : m.onHandDelta < 0 ? "text-danger" : "text-muted-foreground";
  const sign = m.onHandDelta > 0 ? "+" : m.onHandDelta < 0 ? "-" : "";
  return (
    <span className={cn("font-medium tabular-nums", cls)}>
      {sign}
      {m.quantity}
    </span>
  );
}

/** Stock movement ledger table shared by the product and warehouse pages. */
export function MovementTable({
  movements,
  showProduct,
  showWarehouse,
  pageSize = 10,
  testId = "movement-table",
  emptyDescription,
}: {
  movements: StockMovement[];
  showProduct?: boolean;
  showWarehouse?: boolean;
  pageSize?: number;
  testId?: string;
  emptyDescription?: string;
}) {
  const fmt = useFormat();
  const { users, products, warehouses } = useIndex();

  const columns = useMemo<Column<StockMovement>[]>(() => {
    const cols: Column<StockMovement>[] = [
      {
        id: "createdAt",
        header: "Date / time",
        sortValue: (m) => m.createdAt,
        cell: (m) => <span className="whitespace-nowrap">{fmt.dateTime(m.createdAt)}</span>,
      },
      {
        id: "reference",
        header: "Reference",
        sortValue: (m) => m.reference,
        cell: (m) => <span className="font-mono text-xs">{m.reference}</span>,
      },
      { id: "type", header: "Type", sortValue: (m) => MOVEMENT_LABELS[m.type], cell: (m) => <MovementTypeBadge type={m.type} /> },
    ];
    if (showProduct) {
      cols.push({
        id: "product",
        header: "Product",
        sortValue: (m) => products.get(m.productId)?.name,
        cell: (m) => <span className="block max-w-48 truncate">{products.get(m.productId)?.name ?? "—"}</span>,
      });
    }
    if (showWarehouse) {
      cols.push({
        id: "warehouse",
        header: "Warehouse",
        sortValue: (m) => warehouses.get(m.warehouseId)?.code,
        cell: (m) => <span className="whitespace-nowrap">{warehouses.get(m.warehouseId)?.code ?? "—"}</span>,
      });
    }
    cols.push(
      { id: "qty", header: "Qty", align: "right", sortValue: (m) => m.onHandDelta, cell: (m) => <SignedQty m={m} /> },
      {
        id: "from",
        header: "Source",
        hideOnMobile: true,
        cell: (m) => (
          <span className="block max-w-48 truncate text-muted-foreground" title={m.fromLabel}>
            {m.fromLabel}
          </span>
        ),
      },
      {
        id: "to",
        header: "Destination",
        hideOnMobile: true,
        cell: (m) => (
          <span className="block max-w-48 truncate text-muted-foreground" title={m.toLabel}>
            {m.toLabel}
          </span>
        ),
      },
      {
        id: "doc",
        header: "Document",
        hideOnMobile: true,
        cell: (m) => <span className="whitespace-nowrap text-xs">{m.source?.number ?? "—"}</span>,
      },
      {
        id: "by",
        header: "Performed by",
        hideOnMobile: true,
        cell: (m) => <span className="whitespace-nowrap">{users.get(m.performedBy)?.name ?? "System"}</span>,
      },
    );
    return cols;
  }, [fmt, users, products, warehouses, showProduct, showWarehouse]);

  return (
    <DataTable
      testId={testId}
      data={movements}
      columns={columns}
      getRowId={(m) => m.id}
      pageSize={pageSize}
      initialSort={{ id: "createdAt", desc: true }}
      empty={{ title: "No stock movements", description: emptyDescription ?? "Nothing has been recorded for the current filters." }}
      mobileCard={(m) => (
        <div className="space-y-1">
          <div className="flex items-center justify-between gap-2">
            <MovementTypeBadge type={m.type} />
            <SignedQty m={m} />
          </div>
          {showProduct && <p className="truncate text-sm font-medium">{products.get(m.productId)?.name}</p>}
          <p className="break-words text-xs text-muted-foreground">
            {m.fromLabel} → {m.toLabel}
          </p>
          <p className="break-words text-xs text-muted-foreground">
            <span className="font-mono">{m.reference}</span> · {fmt.dateTime(m.createdAt)} · {users.get(m.performedBy)?.name ?? "System"}
          </p>
        </div>
      )}
    />
  );
}
