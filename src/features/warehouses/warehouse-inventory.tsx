"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { ExternalLink, PackageSearch } from "lucide-react";
import type { Bin, Product, StockRecord, Warehouse } from "@/types";
import { DataTable, type Column } from "@/components/shared/data-table";
import { SearchInput, Toolbar } from "@/components/shared/form-controls";
import { LinkButton } from "@/components/shared/link-button";
import { ProductImage } from "@/components/shared/product-bits";
import { StatusBadge } from "@/components/shared/status-badge";
import { useData, useFormat, useIndex, useSettings } from "@/hooks/use-wms";
import { getStockStatus, productStock, stockRecordAvailable } from "@/lib/inventory/selectors";

interface Row {
  record: StockRecord;
  product: Product;
  bin: Bin;
  available: number;
  status: string;
}

export function WarehouseInventory({ warehouse }: { warehouse: Warehouse }) {
  const data = useData();
  const { products, bins } = useIndex();
  const settings = useSettings();
  const fmt = useFormat();
  const [q, setQ] = useState("");

  const rows = useMemo<Row[]>(() => {
    const statusByProduct = new Map<string, string>();
    const out: Row[] = [];
    for (const r of data.stock) {
      if (r.warehouseId !== warehouse.id || r.onHand <= 0) continue;
      const product = products.get(r.productId);
      const bin = bins.get(r.binId);
      if (!product || !bin) continue;
      if (!statusByProduct.has(product.id)) {
        statusByProduct.set(
          product.id,
          getStockStatus(productStock(data, product.id, warehouse.id), product.reorderLevel, settings.lowStockThresholdFactor),
        );
      }
      out.push({
        record: r,
        product,
        bin,
        available: stockRecordAvailable(r, bin),
        status: bin.type === "storage" ? statusByProduct.get(product.id)! : bin.type === "staging" ? "awaiting_putaway" : "requested",
      });
    }
    return out;
  }, [data, products, bins, warehouse.id, settings.lowStockThresholdFactor]);

  const filtered = useMemo(() => {
    const term = q.trim().toLowerCase();
    return rows.filter((r) => !term || [r.product.name, r.product.sku, r.bin.code].some((s) => s.toLowerCase().includes(term)));
  }, [rows, q]);

  const columns = useMemo<Column<Row>[]>(
    () => [
      {
        id: "product",
        header: "Product",
        sortValue: (r) => r.product.name,
        cell: (r) => (
          <div className="flex min-w-0 items-center gap-2.5">
            <ProductImage product={r.product} size={32} />
            <div className="min-w-0">
              <Link href={`/products/${r.product.id}`} className="block max-w-56 truncate font-medium hover:underline" onClick={(e) => e.stopPropagation()}>
                {r.product.name}
              </Link>
              <p className="font-mono text-[11px] text-muted-foreground">{r.product.sku}</p>
            </div>
          </div>
        ),
      },
      { id: "bin", header: "Bin", sortValue: (r) => r.bin.code, cell: (r) => <span className="font-mono text-xs">{r.bin.code}</span> },
      { id: "onHand", header: "On hand", align: "right", sortValue: (r) => r.record.onHand, cell: (r) => <span className="tabular-nums">{fmt.number(r.record.onHand)}</span> },
      { id: "reserved", header: "Reserved", align: "right", hideOnMobile: true, sortValue: (r) => r.record.reserved, cell: (r) => <span className="tabular-nums">{fmt.number(r.record.reserved)}</span> },
      { id: "available", header: "Available", align: "right", sortValue: (r) => r.available, cell: (r) => <span className="font-medium tabular-nums">{fmt.number(r.available)}</span> },
      {
        id: "status",
        header: "Status",
        sortValue: (r) => r.status,
        cell: (r) =>
          r.bin.type === "storage" ? (
            <StatusBadge status={r.status} />
          ) : (
            <StatusBadge status={r.bin.type === "staging" ? "awaiting_putaway" : "pending"} label={r.bin.type === "staging" ? "Awaiting putaway" : "Awaiting inspection"} />
          ),
      },
    ],
    [fmt],
  );

  return (
    <div className="rounded-xl border bg-card shadow-card" data-testid="warehouse-inventory">
      <Toolbar>
        <SearchInput value={q} onChange={setQ} placeholder="Search product, SKU or bin…" />
        <LinkButton href={`/inventory?warehouse=${warehouse.id}`} variant="outline" className="sm:ml-auto" data-testid="view-in-inventory">
          Open in inventory <ExternalLink />
        </LinkButton>
      </Toolbar>
      <DataTable
        testId="warehouse-inventory-table"
        data={filtered}
        columns={columns}
        getRowId={(r) => r.record.id}
        initialSort={{ id: "product" }}
        pageSize={10}
        empty={{ title: "No stock in this warehouse", description: "Stock appears here after goods are received and put away.", icon: PackageSearch }}
        mobileCard={(r) => (
          <div className="flex items-center gap-3">
            <ProductImage product={r.product} size={36} />
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium">{r.product.name}</p>
              <p className="font-mono text-[11px] text-muted-foreground">{r.bin.code}</p>
            </div>
            <div className="shrink-0 text-right text-xs tabular-nums">
              <p className="text-sm font-medium">{fmt.number(r.available)} avail.</p>
              <p className="text-muted-foreground">{fmt.number(r.record.onHand)} on hand</p>
            </div>
          </div>
        )}
      />
    </div>
  );
}
