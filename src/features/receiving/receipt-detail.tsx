"use client";

import Link from "next/link";
import { useMemo } from "react";
import { Info } from "lucide-react";
import type { ActivityEvent, GoodsReceiptLine } from "@/types";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { PageHeader, Section, InfoItem } from "@/components/shared/page-header";
import { DataTable, type Column } from "@/components/shared/data-table";
import { EmptyState } from "@/components/shared/states";
import { LinkButton } from "@/components/shared/link-button";
import { ProductImage } from "@/components/shared/product-bits";
import { ActivityTimeline } from "@/components/shared/progress";
import { StatusBadge } from "@/components/shared/status-badge";
import { useData, useFormat, useIndex } from "@/hooks/use-wms";
import { PutawayControl } from "./putaway-control";

export function ReceiptDetail({ receiptId }: { receiptId: string }) {
  const data = useData();
  const idx = useIndex();
  const fmt = useFormat();
  const receipt = data.receipts.find((r) => r.id === receiptId);

  const tasks = useMemo(
    () => data.tasks.filter((t) => t.type === "putaway" && t.putaway?.receiptId === receiptId).sort((a, b) => a.createdAt.localeCompare(b.createdAt)),
    [data.tasks, receiptId],
  );

  const events = useMemo<ActivityEvent[]>(() => {
    if (!receipt) return [];
    const out: ActivityEvent[] = [
      { id: "recv", at: receipt.receivedAt, by: receipt.receivedBy, title: `Goods received (${receipt.grn})`, detail: receipt.notes || undefined },
    ];
    for (const t of tasks) {
      if (t.completedAt) {
        const p = idx.products.get(t.putaway?.productId ?? "");
        out.push({ id: `pw-${t.id}`, at: t.completedAt, by: t.assigneeId, title: `Putaway completed - ${t.putaway?.quantity} × ${p?.name ?? "product"}` });
      }
    }
    return out;
  }, [receipt, tasks, idx]);

  const columns = useMemo<Column<GoodsReceiptLine>[]>(
    () => [
      {
        id: "product",
        header: "Product",
        cell: (l) => {
          const p = idx.products.get(l.productId);
          return (
            <div className="flex min-w-[10rem] items-center gap-2">
              {p && <ProductImage product={p} size={32} />}
              <div className="min-w-0">
                <Link href={`/products/${l.productId}`} className="block truncate font-medium hover:underline">{p?.name}</Link>
                <span className="font-mono text-[11px] text-muted-foreground">{p?.sku}</span>
              </div>
            </div>
          );
        },
      },
      { id: "expected", header: "Expected", align: "right", cell: (l) => <span className="tabular-nums">{fmt.number(l.expectedQty)}</span> },
      { id: "received", header: "Received", align: "right", cell: (l) => <span className="tabular-nums font-medium">{fmt.number(l.receivedQty)}</span> },
      { id: "damaged", header: "Damaged", align: "right", cell: (l) => <span className={l.damagedQty > 0 ? "tabular-nums text-danger" : "tabular-nums text-muted-foreground"}>{fmt.number(l.damagedQty)}</span> },
      { id: "bin", header: "Staging bin", cell: (l) => <span className="font-mono text-xs">{idx.bins.get(l.stagingBinId)?.code ?? "—"}</span> },
    ],
    [idx, fmt],
  );

  if (!receipt) {
    return <EmptyState title="Goods receipt not found" action={<LinkButton href="/receiving">Back to receiving</LinkButton>} />;
  }
  const po = data.purchaseOrders.find((p) => p.id === receipt.purchaseOrderId);
  const supplier = idx.suppliers.get(receipt.supplierId);
  const warehouse = idx.warehouses.get(receipt.warehouseId);
  const receiver = idx.users.get(receipt.receivedBy);
  const pending = tasks.filter((t) => t.status !== "completed");

  return (
    <>
      <PageHeader
        title={receipt.grn}
        description={`Received ${fmt.dateTime(receipt.receivedAt)}${receiver ? ` by ${receiver.name}` : ""}`}
        actions={po && <LinkButton href={`/purchase-orders/${po.id}`} variant="outline">View {po.number}</LinkButton>}
      />
      <div className="mb-4"><span data-testid="receipt-status"><StatusBadge status={receipt.status} /></span></div>

      {pending.length > 0 && (
        <Alert className="mb-6">
          <Info />
          <AlertTitle>{pending.length} putaway task{pending.length === 1 ? "" : "s"} pending</AlertTitle>
          <AlertDescription>This stock is in staging and is not available for orders until it is stored in a bin.</AlertDescription>
        </Alert>
      )}

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-2">
          <Section title="Received items" contentClassName="p-0">
            <DataTable
              testId="receipt-lines"
              data={receipt.lines}
              columns={columns}
              getRowId={(l) => l.id}
              compact
              pageSize={50}
              mobileCard={(l) => {
                const p = idx.products.get(l.productId);
                return (
                  <div className="space-y-0.5">
                    <p className="font-medium">{p?.name}</p>
                    <p className="text-xs text-muted-foreground">
                      Expected {fmt.number(l.expectedQty)} · Received {fmt.number(l.receivedQty)} · Damaged {fmt.number(l.damagedQty)} · {idx.bins.get(l.stagingBinId)?.code}
                    </p>
                  </div>
                );
              }}
            />
          </Section>

          <Section title="Putaway tasks" description="Move received stock from staging into storage bins" contentClassName="p-0">
            {tasks.length === 0 ? (
              <EmptyState title="No putaway tasks" description="Nothing was accepted into staging on this receipt." className="py-8" />
            ) : (
              <ul className="divide-y" data-testid="receipt-putaway">
                {tasks.map((t) => {
                  const p = idx.products.get(t.putaway?.productId ?? "");
                  const done = t.status === "completed";
                  return (
                    <li key={t.id} className="flex flex-col gap-2 px-4 py-3 lg:flex-row lg:items-center lg:justify-between" data-testid="putaway-task">
                      <div className="min-w-0">
                        <p className="text-sm font-medium">
                          {t.putaway?.quantity} × {p?.name}
                          <span className="ml-2"><StatusBadge status={t.status} domain="task" /></span>
                        </p>
                        <p className="text-xs text-muted-foreground">
                          {t.number} · from {idx.bins.get(t.putaway?.fromBinId ?? "")?.code} · suggested {idx.bins.get(t.putaway?.suggestedBinId ?? "")?.code}
                          {done && t.completedAt && ` · done ${fmt.dateTime(t.completedAt)}`}
                        </p>
                      </div>
                      {!done && <PutawayControl task={t} />}
                    </li>
                  );
                })}
              </ul>
            )}
          </Section>
        </div>

        <div className="space-y-6">
          <Section title="Details">
            <dl className="space-y-3">
              <InfoItem label="Purchase order">{po ? <Link href={`/purchase-orders/${po.id}`} className="text-primary hover:underline">{po.number}</Link> : "—"}</InfoItem>
              <InfoItem label="Supplier">{supplier ? <Link href={`/suppliers/${supplier.id}`} className="hover:underline">{supplier.name}</Link> : "—"}</InfoItem>
              <InfoItem label="Warehouse">{warehouse ? `${warehouse.name} (${warehouse.code})` : "—"}</InfoItem>
              <InfoItem label="Received by">{receiver?.name}</InfoItem>
              {receipt.notes && <InfoItem label="Notes">{receipt.notes}</InfoItem>}
            </dl>
          </Section>
          <Section title="Timeline">
            <ActivityTimeline events={events} />
          </Section>
        </div>
      </div>
    </>
  );
}
