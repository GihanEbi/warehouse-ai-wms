"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { AlertTriangle, Ban, CheckCircle2, Mail, MapPin, PackageCheck, Pencil, Phone, Printer } from "lucide-react";
import type { PurchaseOrderLine } from "@/types";
import { Textarea } from "@/components/ui/textarea";
import { PageHeader, Section, InfoItem } from "@/components/shared/page-header";
import { DataTable, type Column } from "@/components/shared/data-table";
import { Button } from "@/components/ui/button";
import { ConfirmationDialog } from "@/components/shared/dialogs";
import { EmptyState } from "@/components/shared/states";
import { LinkButton } from "@/components/shared/link-button";
import { ProductImage } from "@/components/shared/product-bits";
import { ActivityTimeline, StepProgress } from "@/components/shared/progress";
import { StatusBadge } from "@/components/shared/status-badge";
import { useData, useFormat, useIndex, usePermission, useTx } from "@/hooks/use-wms";
import { useSubmit } from "@/hooks/use-submit";
import { poOutstanding, poTotal } from "@/lib/workflows/purchasing";
import { isPoOverdue, PO_STEPS, poStepIndex } from "./helpers";

export function PurchaseOrderDetail({ poId }: { poId: string }) {
  const data = useData();
  const idx = useIndex();
  const fmt = useFormat();
  const tx = useTx();
  const { can } = usePermission();
  const { submit } = useSubmit();
  const [confirm, setConfirm] = useState<"approve" | "cancel" | null>(null);
  const [reason, setReason] = useState("");

  const po = data.purchaseOrders.find((p) => p.id === poId);
  const receipts = useMemo(() => data.receipts.filter((r) => r.purchaseOrderId === poId), [data.receipts, poId]);

  const columns = useMemo<Column<PurchaseOrderLine>[]>(
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
                <Link href={`/products/${l.productId}`} className="block truncate font-medium hover:underline">{p?.name ?? "—"}</Link>
                <span className="font-mono text-[11px] text-muted-foreground">{p?.sku}</span>
              </div>
            </div>
          );
        },
      },
      { id: "ordered", header: "Ordered", align: "right", cell: (l) => <span className="tabular-nums">{fmt.number(l.quantity)}</span> },
      { id: "received", header: "Received", align: "right", cell: (l) => <span className="tabular-nums" data-testid="line-received">{fmt.number(l.receivedQty)}</span> },
      { id: "rejected", header: "Rejected", align: "right", cell: (l) => <span className={l.rejectedQty > 0 ? "tabular-nums text-danger" : "tabular-nums text-muted-foreground"}>{fmt.number(l.rejectedQty)}</span> },
      { id: "outstanding", header: "Outstanding", align: "right", cell: (l) => <span className="tabular-nums font-medium" data-testid="line-outstanding">{fmt.number(poOutstanding(l))}</span> },
      { id: "cost", header: "Unit cost", align: "right", hideOnMobile: true, cell: (l) => <span className="tabular-nums">{fmt.money(l.unitCost)}</span> },
      { id: "total", header: "Line total", align: "right", cell: (l) => <span className="tabular-nums font-medium">{fmt.money(l.quantity * l.unitCost)}</span> },
    ],
    [idx, fmt],
  );

  if (!po) {
    return <EmptyState title="Purchase order not found" description="It may have been removed." action={<LinkButton href="/purchase-orders">Back to purchase orders</LinkButton>} />;
  }

  const supplier = idx.suppliers.get(po.supplierId);
  const warehouse = idx.warehouses.get(po.warehouseId);
  const creator = idx.users.get(po.createdBy);
  const overdue = isPoOverdue(po);
  const cancelled = po.status === "cancelled";
  const nothingReceived = po.lines.every((l) => l.receivedQty === 0 && l.rejectedQty === 0);
  const canCancel = (po.status === "draft" || po.status === "approved") && nothingReceived;
  const totalOrdered = po.lines.reduce((s, l) => s + l.quantity, 0);
  const totalReceived = po.lines.reduce((s, l) => s + l.receivedQty, 0);

  const actions = (
    <>
      <LinkButton href={`/purchase-orders/${po.id}/print`} variant="outline" data-testid="print-po">
        <Printer /> Print
      </LinkButton>
      {po.status === "draft" && (
        <>
          {can("po.write") && (
            <LinkButton href={`/purchase-orders/${po.id}/edit`} variant="outline" data-testid="edit-po">
              <Pencil /> Edit
            </LinkButton>
          )}
          <Button onClick={() => setConfirm("approve")} disabled={!can("po.approve")} title={!can("po.approve") ? "Your role cannot approve purchase orders" : undefined} data-testid="approve-po">
            <CheckCircle2 /> Approve
          </Button>
        </>
      )}
      {(po.status === "approved" || po.status === "partially_received") && (
        can("receiving.write") ? (
          <LinkButton href={`/receiving/new?po=${po.id}`} data-testid="receive-goods">
            <PackageCheck /> {po.status === "approved" ? "Receive goods" : "Receive remaining"}
          </LinkButton>
        ) : (
          <Button disabled title="Your role cannot receive goods" data-testid="receive-goods">
            <PackageCheck /> {po.status === "approved" ? "Receive goods" : "Receive remaining"}
          </Button>
        )
      )}
      {canCancel && (
        <Button variant="destructive" onClick={() => setConfirm("cancel")} disabled={!can("po.write")} title={!can("po.write") ? "Your role cannot cancel purchase orders" : undefined} data-testid="cancel-po">
          <Ban /> Cancel
        </Button>
      )}
    </>
  );

  return (
    <>
      <PageHeader
        title={po.number}
        description={`${supplier?.name ?? "Supplier"} → ${warehouse?.name ?? "Warehouse"}`}
        actions={actions}
      />

      <div className="mb-4 flex flex-wrap items-center gap-2">
        <span data-testid="po-status"><StatusBadge status={po.status} /></span>
        {overdue && (
          <span className="inline-flex items-center gap-1 rounded-full bg-danger-soft px-2 py-0.5 text-xs font-medium text-danger" data-testid="overdue-flag">
            <AlertTriangle className="size-3" aria-hidden /> Overdue since {fmt.date(po.expectedDate)}
          </span>
        )}
        <span className="text-xs text-muted-foreground">
          Created {fmt.date(po.orderDate)}{creator ? ` by ${creator.name}` : ""}
        </span>
      </div>

      <Section className="mb-6">
        {cancelled && (
          <div className="mb-4 flex items-center gap-2 rounded-lg bg-danger-soft px-3 py-2 text-sm text-danger" data-testid="po-cancelled-banner">
            <Ban className="size-4" /> This purchase order was cancelled and can no longer be processed.
          </div>
        )}
        <StepProgress steps={PO_STEPS} current={poStepIndex(po.status)} terminated={cancelled} />
      </Section>

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-2">
          <Section
            title="Line items"
            description={`${fmt.number(totalReceived)} of ${fmt.number(totalOrdered)} units received`}
            contentClassName="p-0"
          >
            <DataTable
              testId="po-lines-table"
              data={po.lines}
              columns={columns}
              getRowId={(l) => l.id}
              pageSize={50}
              compact
              mobileCard={(l) => {
                const p = idx.products.get(l.productId);
                return (
                  <div className="space-y-1">
                    <p className="font-medium">{p?.name}</p>
                    <p className="text-xs text-muted-foreground">
                      Ordered {fmt.number(l.quantity)} · Received {fmt.number(l.receivedQty)} · Rejected {fmt.number(l.rejectedQty)} · Outstanding {fmt.number(poOutstanding(l))}
                    </p>
                    <p className="text-sm font-semibold tabular-nums">{fmt.money(l.quantity * l.unitCost)}</p>
                  </div>
                );
              }}
            />
            <div className="flex items-center justify-between border-t bg-muted/30 px-4 py-3">
              <span className="text-sm text-muted-foreground">Order total</span>
              <span className="text-lg font-semibold tabular-nums" data-testid="po-total">{fmt.money(poTotal(po))}</span>
            </div>
          </Section>

          <Section title="Goods receipts" description="Deliveries booked against this purchase order" contentClassName="p-0">
            {receipts.length === 0 ? (
              <EmptyState title="No goods received yet" description={po.status === "approved" ? "Start receiving when the delivery arrives." : undefined} className="py-8" />
            ) : (
              <ul className="divide-y" data-testid="po-receipts">
                {receipts.map((r) => (
                  <li key={r.id}>
                    <Link href={`/receiving/${r.id}`} className="flex items-center justify-between gap-3 px-4 py-3 text-sm hover:bg-muted/50">
                      <span className="min-w-0">
                        <span className="font-medium text-primary">{r.grn}</span>
                        <span className="ml-2 text-xs text-muted-foreground">
                          {fmt.dateTime(r.receivedAt)} · {fmt.number(r.lines.reduce((s, l) => s + l.receivedQty, 0))} received
                          {r.lines.some((l) => l.damagedQty > 0) && `, ${fmt.number(r.lines.reduce((s, l) => s + l.damagedQty, 0))} damaged`}
                        </span>
                      </span>
                      <StatusBadge status={r.status} />
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </Section>
        </div>

        <div className="space-y-6">
          <Section title="Supplier">
            <dl className="space-y-3">
              <InfoItem label="Name">
                {supplier ? <Link href={`/suppliers/${supplier.id}`} className="hover:underline">{supplier.name}</Link> : "—"}
              </InfoItem>
              <InfoItem label="Contact">{supplier?.contactPerson}</InfoItem>
              <div className="flex flex-col gap-1 text-xs text-muted-foreground">
                {supplier?.email && <span className="flex items-center gap-1.5 break-all"><Mail className="size-3.5 shrink-0" />{supplier.email}</span>}
                {supplier?.phone && <span className="flex items-center gap-1.5"><Phone className="size-3.5 shrink-0" />{supplier.phone}</span>}
              </div>
              <InfoItem label="Payment terms">{supplier?.paymentTerms}</InfoItem>
            </dl>
          </Section>
          <Section title="Destination warehouse">
            <dl className="space-y-3">
              <InfoItem label="Warehouse">
                {warehouse ? <Link href={`/warehouses/${warehouse.id}`} className="hover:underline">{warehouse.name} ({warehouse.code})</Link> : "—"}
              </InfoItem>
              <p className="flex items-start gap-1.5 text-xs text-muted-foreground"><MapPin className="mt-0.5 size-3.5 shrink-0" />{warehouse?.address}</p>
              <InfoItem label="Expected delivery">{fmt.date(po.expectedDate)}</InfoItem>
              {po.notes && <InfoItem label="Notes">{po.notes}</InfoItem>}
            </dl>
          </Section>
          <Section title="Activity">
            <ActivityTimeline events={po.events} />
          </Section>
        </div>
      </div>

      <ConfirmationDialog
        open={confirm === "approve"}
        onOpenChange={(o) => !o && setConfirm(null)}
        title={`Approve ${po.number}?`}
        description={`The order for ${fmt.money(poTotal(po))} will be marked approved and can then be received at ${warehouse?.name}. Approved orders can no longer be edited.`}
        confirmLabel="Approve order"
        onConfirm={async () => {
          const res = await submit(() => tx.approvePurchaseOrder(po.id), { success: `${po.number} approved` });
          return res?.ok ?? false;
        }}
      />
      <ConfirmationDialog
        open={confirm === "cancel"}
        onOpenChange={(o) => {
          if (!o) {
            setConfirm(null);
            setReason("");
          }
        }}
        title={`Cancel ${po.number}?`}
        description="The purchase order is cancelled and cannot be received. This cannot be undone."
        confirmLabel="Cancel order"
        destructive
        onConfirm={async () => {
          const res = await submit(() => tx.cancelPurchaseOrder(po.id, reason.trim()), { success: `${po.number} cancelled` });
          if (res?.ok) setReason("");
          return res?.ok ?? false;
        }}
      >
        <Textarea value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Reason (optional)" aria-label="Cancellation reason" rows={2} />
      </ConfirmationDialog>
    </>
  );
}
