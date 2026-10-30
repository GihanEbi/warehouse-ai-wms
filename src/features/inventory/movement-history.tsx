"use client";

import { useMemo, useState } from "react";
import { History } from "lucide-react";
import type { ID, MovementType, StockMovement } from "@/types";
import { DataTable, type Column } from "@/components/shared/data-table";
import { ExportButton } from "@/components/shared/export-button";
import { FilterDropdown, SearchInput, Toolbar } from "@/components/shared/form-controls";
import { ProductImage } from "@/components/shared/product-bits";
import { WarehouseSelector } from "@/components/shared/selectors";
import { useData, useFormat, useIndex, useWarehouseScope } from "@/hooks/use-wms";
import { MOVEMENT_LABELS, MovementTypeBadge, SignedQty } from "./movement-badge";
import { filterMovements } from "./rows";

export function MovementHistory({ productId, onOpenProduct }: { productId?: ID | ""; onOpenProduct: (id: ID) => void }) {
  const data = useData();
  const idx = useIndex();
  const fmt = useFormat();
  const [scope, setScope] = useWarehouseScope();
  const [q, setQ] = useState("");
  const [type, setType] = useState("all");

  const rows = useMemo(() => filterMovements(data, { q, type, warehouse: scope, productId }), [data, q, type, scope, productId]);

  const columns = useMemo<Column<StockMovement>[]>(
    () => [
      { id: "reference", header: "Reference", sortValue: (m) => m.reference, cell: (m) => <span className="font-mono text-xs">{m.reference}</span> },
      {
        id: "product",
        header: "Product",
        sortValue: (m) => idx.products.get(m.productId)?.name,
        cell: (m) => {
          const p = idx.products.get(m.productId);
          return (
            <div className="flex min-w-0 items-center gap-2">
              {p && <ProductImage product={p} size={28} />}
              <div className="min-w-0">
                <p className="truncate font-medium">{p?.name ?? "—"}</p>
                <p className="truncate font-mono text-[11px] text-muted-foreground">{p?.sku}</p>
              </div>
            </div>
          );
        },
      },
      { id: "type", header: "Type", sortValue: (m) => MOVEMENT_LABELS[m.type], cell: (m) => <MovementTypeBadge type={m.type} /> },
      {
        id: "qty",
        header: "Quantity",
        align: "right",
        sortValue: (m) => m.onHandDelta,
        cell: (m) => <SignedQty delta={m.onHandDelta} quantity={m.quantity} />,
      },
      { id: "from", header: "Source", hideOnMobile: true, cell: (m) => <span className="text-xs">{m.fromLabel}</span> },
      { id: "to", header: "Destination", hideOnMobile: true, cell: (m) => <span className="text-xs">{m.toLabel}</span> },
      {
        id: "date",
        header: "Date / time",
        sortValue: (m) => m.createdAt,
        cell: (m) => <span className="text-xs whitespace-nowrap text-muted-foreground">{fmt.dateTime(m.createdAt)}</span>,
      },
      {
        id: "by",
        header: "Performed by",
        hideOnMobile: true,
        sortValue: (m) => idx.users.get(m.performedBy)?.name,
        cell: (m) => <span className="text-xs whitespace-nowrap">{idx.users.get(m.performedBy)?.name ?? "—"}</span>,
      },
    ],
    [idx, fmt],
  );

  const typeOptions = (Object.keys(MOVEMENT_LABELS) as MovementType[]).map((t) => ({ value: t, label: MOVEMENT_LABELS[t] }));

  return (
    <div className="rounded-xl border bg-card shadow-card" data-testid="movement-history">
      <Toolbar>
        <SearchInput value={q} onChange={setQ} placeholder="Search reference, product, SKU…" />
        <FilterDropdown label="Type" value={type} onChange={setType} options={typeOptions} allLabel="All types" />
        <label className="flex items-center gap-2 text-xs text-muted-foreground">
          <span className="shrink-0">Warehouse</span>
          <WarehouseSelector value={scope} onChange={setScope} includeAll className="min-w-[10rem] flex-1 text-foreground" />
        </label>
        <div className="sm:ml-auto">
          <ExportButton
            filename="stock-movements"
            getData={() => ({
              headers: ["Reference", "Product", "SKU", "Type", "Quantity", "Warehouse", "Source", "Destination", "Document", "Date/time", "Performed by", "Note"],
              rows: rows.map((m) => [
                m.reference,
                idx.products.get(m.productId)?.name,
                idx.products.get(m.productId)?.sku,
                MOVEMENT_LABELS[m.type],
                m.onHandDelta === 0 ? m.quantity : m.onHandDelta,
                idx.warehouses.get(m.warehouseId)?.code,
                m.fromLabel,
                m.toLabel,
                m.source?.number,
                fmt.dateTime(m.createdAt),
                idx.users.get(m.performedBy)?.name,
                m.note,
              ]),
            })}
          />
        </div>
      </Toolbar>
      <DataTable
        testId="movement-table"
        data={rows}
        columns={columns}
        getRowId={(m) => m.id}
        initialSort={{ id: "date", desc: true }}
        onRowClick={(m) => onOpenProduct(m.productId)}
        empty={{ title: "No movements found", description: "Try a different type, warehouse or search term.", icon: History }}
        mobileCard={(m) => {
          const p = idx.products.get(m.productId);
          return (
            <div className="space-y-1.5">
              <div className="flex items-start justify-between gap-2">
                <p className="min-w-0 truncate text-sm font-medium">{p?.name}</p>
                <SignedQty delta={m.onHandDelta} quantity={m.quantity} />
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <MovementTypeBadge type={m.type} />
                <span className="font-mono text-xs text-muted-foreground">{m.reference}</span>
              </div>
              <p className="text-xs text-muted-foreground">
                {m.fromLabel} → {m.toLabel} · {fmt.dateTime(m.createdAt)}
              </p>
            </div>
          );
        }}
      />
    </div>
  );
}
