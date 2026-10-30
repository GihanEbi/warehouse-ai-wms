"use client";

import Link from "next/link";
import { useState } from "react";
import { AlertCircle, AlertTriangle, ClipboardCheck, FileText, Pencil, PackageCheck, RotateCcw, Truck, XCircle, CheckCircle2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { PageHeader, Section, InfoItem } from "@/components/shared/page-header";
import { ConfirmationDialog } from "@/components/shared/dialogs";
import { EmptyState } from "@/components/shared/states";
import { LinkButton } from "@/components/shared/link-button";
import { PriorityBadge, StatusBadge } from "@/components/shared/status-badge";
import { ActivityTimeline, StepProgress } from "@/components/shared/progress";
import { ProductImage } from "@/components/shared/product-bits";
import { useData, useFormat, useIndex, usePermission, useTx } from "@/hooks/use-wms";
import { useSubmit } from "@/hooks/use-submit";
import { checkOrderAvailability, orderTotal } from "@/lib/workflows/orders";
import { cn } from "@/lib/utils";
import { FULFILMENT_STEPS, customerAddress, fulfilmentIndex, isOverdue, orderQty, pickedQty, reservedQty } from "./order-utils";

export function OrderDetail({ id }: { id: string }) {
  const data = useData();
  const idx = useIndex();
  const fmt = useFormat();
  const tx = useTx();
  const { can } = usePermission();
  const { submit } = useSubmit();
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [confirmError, setConfirmError] = useState<string | null>(null);
  const [cancelOpen, setCancelOpen] = useState(false);
  const [reason, setReason] = useState("");

  const order = data.orders.find((o) => o.id === id);
  if (!order) {
    return <EmptyState title="Order not found" description="It may have been removed." action={<LinkButton href="/orders" variant="outline">Back to orders</LinkButton>} />;
  }

  const customer = idx.customers.get(order.customerId);
  const warehouse = idx.warehouses.get(order.warehouseId);
  const shipment = order.shipmentId ? data.shipments.find((s) => s.id === order.shipmentId) : undefined;
  const returns = data.returns.filter((r) => r.orderId === order.id);
  const tasks = data.tasks.filter((t) => t.link?.kind === "order" && t.link.id === order.id).sort((a, b) => a.number.localeCompare(b.number));
  const canWrite = can("orders.write");
  const canPick = can("picking.write");
  const canShip = can("shipping.write");
  const canReturn = can("returns.write");
  const reserved = reservedQty(order);
  const picked = pickedQty(order);
  const overdue = isOverdue(order);
  const avail = checkOrderAvailability(data, order.warehouseId, order.lines);
  const shortages = avail.filter((a) => !a.ok);
  const cancelled = order.status === "cancelled";
  const status = order.status;
  const noPerm = "Your role cannot perform this action";

  const steps = FULFILMENT_STEPS.map((s) =>
    s.key === "picking" && reserved > 0 && ["confirmed", "picking", "picked"].includes(status)
      ? { ...s, description: `${picked}/${reserved} picked` }
      : s,
  );

  async function doConfirm() {
    setConfirmError(null);
    const res = await submit(() => tx.confirmOrder(order!.id), { success: "Order confirmed - stock reserved and pick tasks created", errorToast: false });
    if (!res) return false;
    if (!res.ok) {
      setConfirmError(res.error);
      return false;
    }
    return true;
  }

  async function doCancel() {
    const res = await submit(() => tx.cancelOrder(order!.id, reason.trim()), { success: "Order cancelled - reservations released" });
    if (res?.ok) setReason("");
    return !!res?.ok;
  }

  return (
    <>
      <PageHeader
        title={order.number}
        description={`${customer?.name ?? "Customer"} · ${warehouse?.name ?? ""}`}
        actions={
          <>
            {status === "draft" && (
              <>
                <LinkButton href={`/orders/new?edit=${order.id}`} variant="outline" aria-disabled={!canWrite} className={cn(!canWrite && "pointer-events-none opacity-50")} data-testid="edit-order">
                  <Pencil /> Edit
                </LinkButton>
                <Button onClick={() => { setConfirmError(null); setConfirmOpen(true); }} disabled={!canWrite} title={canWrite ? undefined : noPerm} data-testid="confirm-order">
                  <CheckCircle2 /> Confirm order
                </Button>
              </>
            )}
            {(status === "confirmed" || status === "picking" || status === "picked") && (
              <LinkButton href={`/picking-packing?order=${order.id}`} variant={status === "picked" ? "outline" : "default"} data-testid="go-to-picking">
                <ClipboardCheck /> Go to picking
              </LinkButton>
            )}
            {status === "picked" && (
              <LinkButton href={`/picking-packing/pack/${order.id}`} aria-disabled={!canPick} className={cn(!canPick && "pointer-events-none opacity-50")} data-testid="pack-order">
                <PackageCheck /> Pack order
              </LinkButton>
            )}
            {status === "packed" && !shipment && (
              <LinkButton href={`/shipping?order=${order.id}`} aria-disabled={!canShip} className={cn(!canShip && "pointer-events-none opacity-50")} data-testid="create-shipment-link">
                <Truck /> Create shipment
              </LinkButton>
            )}
            {status === "packed" && shipment && (
              <LinkButton href={`/shipping/${shipment.id}`} data-testid="view-shipment">
                <Truck /> View shipment
              </LinkButton>
            )}
            {status === "dispatched" && (
              <LinkButton href={`/returns/new?order=${order.id}`} variant="outline" aria-disabled={!canReturn} className={cn(!canReturn && "pointer-events-none opacity-50")} data-testid="register-return">
                <RotateCcw /> Register return
              </LinkButton>
            )}
            {["draft", "confirmed", "picking", "picked"].includes(status) && (
              <Button variant="outline" className="text-danger hover:text-danger" onClick={() => setCancelOpen(true)} disabled={!canWrite} title={canWrite ? undefined : noPerm} data-testid="cancel-order">
                <XCircle /> Cancel order
              </Button>
            )}
          </>
        }
      />

      <div className="mb-4 flex flex-wrap items-center gap-2" data-testid="order-status-row">
        <span data-testid="order-status"><StatusBadge status={status} /></span>
        <PriorityBadge priority={order.priority} />
        {overdue && (
          <span className="inline-flex items-center gap-1 rounded-md bg-danger-soft px-1.5 py-0.5 text-xs font-medium text-danger" data-testid="overdue-flag">
            <AlertCircle className="size-3.5" /> Overdue - required {fmt.date(order.requiredDate)}
          </span>
        )}
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <div className="min-w-0 space-y-4 lg:col-span-2">
          <Section title="Fulfillment progress">
            <StepProgress steps={steps} current={fulfilmentIndex(status)} terminated={cancelled} />
            {cancelled && (
              <p className="mt-3 flex items-center gap-2 rounded-lg bg-danger-soft p-2.5 text-sm text-danger">
                <XCircle className="size-4" /> This order was cancelled. Any reserved stock has been released.
              </p>
            )}
            {status === "draft" && <p className="mt-3 text-sm text-muted-foreground">Draft orders do not reserve stock. Confirm the order to reserve inventory and create pick tasks.</p>}
            {status === "picked" && (
              <p className="mt-3 text-sm text-muted-foreground">All items are picked. Next step: pack the order and generate the packing slip.</p>
            )}
          </Section>

          <Section title="Order items" description={`${order.lines.length} product${order.lines.length === 1 ? "" : "s"} · ${fmt.number(orderQty(order))} units`} contentClassName="p-0">
            <div className="overflow-x-auto">
              <table className="w-full text-sm" data-testid="order-items">
                <thead className="border-b bg-muted/40 text-xs text-muted-foreground">
                  <tr>
                    <th className="px-3 py-2 text-left font-medium">Product</th>
                    <th className="px-3 py-2 text-right font-medium">Qty</th>
                    <th className="px-3 py-2 text-right font-medium">Unit price</th>
                    <th className="px-3 py-2 text-right font-medium">Total</th>
                    <th className="px-3 py-2 text-left font-medium">Allocation (bin)</th>
                    <th className="px-3 py-2 text-right font-medium">Picked</th>
                  </tr>
                </thead>
                <tbody>
                  {order.lines.map((l) => {
                    const p = idx.products.get(l.productId);
                    const lp = l.allocations.reduce((s, a) => s + a.pickedQty, 0);
                    return (
                      <tr key={l.id} className="border-b last:border-b-0" data-testid="order-item-row">
                        <td className="px-3 py-2.5">
                          <div className="flex min-w-[10rem] items-center gap-2">
                            {p && <ProductImage product={p} size={32} />}
                            <div className="min-w-0">
                              {p ? (
                                <Link href={`/products/${p.id}`} className="block truncate font-medium hover:underline">{p.name}</Link>
                              ) : (
                                "—"
                              )}
                              <span className="font-mono text-[11px] text-muted-foreground">{p?.sku}</span>
                            </div>
                          </div>
                        </td>
                        <td className="px-3 py-2.5 text-right tabular-nums">{fmt.number(l.quantity)}</td>
                        <td className="px-3 py-2.5 text-right tabular-nums">{fmt.money(l.unitPrice)}</td>
                        <td className="px-3 py-2.5 text-right font-medium tabular-nums">{fmt.money(l.quantity * l.unitPrice)}</td>
                        <td className="px-3 py-2.5">
                          {l.allocations.length === 0 ? (
                            <span className="text-xs text-muted-foreground">{status === "draft" ? "Not reserved" : status === "dispatched" ? "Dispatched" : "—"}</span>
                          ) : (
                            <ul className="space-y-0.5">
                              {l.allocations.map((a) => (
                                <li key={a.binId} className="whitespace-nowrap font-mono text-xs">
                                  {idx.bins.get(a.binId)?.code ?? a.binId} <span className="text-muted-foreground">× {a.quantity}</span>
                                </li>
                              ))}
                            </ul>
                          )}
                        </td>
                        <td className="px-3 py-2.5 text-right tabular-nums">
                          {l.allocations.length ? <span className={lp >= l.quantity ? "text-success" : ""}>{lp}/{l.quantity}</span> : "—"}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
                <tfoot>
                  <tr className="border-t bg-muted/30">
                    <td className="px-3 py-2.5 text-sm font-medium" colSpan={3}>Order total</td>
                    <td className="px-3 py-2.5 text-right text-sm font-semibold tabular-nums" data-testid="order-total">{fmt.money(orderTotal(order))}</td>
                    <td colSpan={2} />
                  </tr>
                </tfoot>
              </table>
            </div>
          </Section>

          {tasks.length > 0 && (
            <Section title="Related tasks" description="Pick and pack tasks created for this order.">
              <ul className="divide-y" data-testid="order-tasks">
                {tasks.map((t) => (
                  <li key={t.id} className="flex flex-wrap items-center justify-between gap-2 py-2 first:pt-0 last:pb-0">
                    <div className="min-w-0">
                      <Link href={`/tasks?task=${t.id}`} className="text-sm font-medium text-primary hover:underline">{t.number}</Link>
                      <p className="truncate text-xs text-muted-foreground">{t.title}</p>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-xs text-muted-foreground">{t.assigneeId ? idx.users.get(t.assigneeId)?.name : "Unassigned"}</span>
                      <StatusBadge status={t.status} domain="task" />
                    </div>
                  </li>
                ))}
              </ul>
            </Section>
          )}

          <Section title="Activity timeline">
            <ActivityTimeline events={order.events} />
          </Section>
        </div>

        <div className="min-w-0 space-y-4">
          <Section title="Order summary">
            <dl className="grid grid-cols-2 gap-3">
              <InfoItem label="Order number">{order.number}</InfoItem>
              <InfoItem label="Status"><StatusBadge status={status} /></InfoItem>
              <InfoItem label="Warehouse">{warehouse?.name}</InfoItem>
              <InfoItem label="Priority"><PriorityBadge priority={order.priority} /></InfoItem>
              <InfoItem label="Order date">{fmt.date(order.orderDate)}</InfoItem>
              <InfoItem label="Required date"><span className={overdue ? "text-danger" : ""}>{fmt.date(order.requiredDate)}</span></InfoItem>
              <InfoItem label="Total amount">{fmt.money(orderTotal(order))}</InfoItem>
              <InfoItem label="Created by">{idx.users.get(order.createdBy)?.name}</InfoItem>
              {order.notes && <InfoItem label="Notes" className="col-span-2">{order.notes}</InfoItem>}
            </dl>
          </Section>

          <Section title="Customer">
            <dl className="grid grid-cols-2 gap-3">
              <InfoItem label="Name" className="col-span-2">{customer?.name}</InfoItem>
              <InfoItem label="Contact">{customer?.contactPerson}</InfoItem>
              <InfoItem label="Phone">{customer?.phone}</InfoItem>
              <InfoItem label="Email" className="col-span-2">{customer?.email}</InfoItem>
              <InfoItem label="Delivery address" className="col-span-2">{customerAddress(customer)}</InfoItem>
            </dl>
          </Section>

          {order.packing && (
            <Section title="Packing details" actions={
              <LinkButton href={`/picking-packing/pack/${order.id}`} variant="outline" size="sm" data-testid="view-slip">
                <FileText /> Packing slip
              </LinkButton>
            }>
              <dl className="grid grid-cols-2 gap-3">
                <InfoItem label="Slip number"><span data-testid="slip-number">{order.packing.slipNumber}</span></InfoItem>
                <InfoItem label="Packaging">{order.packing.packagingType}</InfoItem>
                <InfoItem label="Packages">{order.packing.packageCount}</InfoItem>
                <InfoItem label="Weight">{order.packing.weightKg} kg</InfoItem>
                <InfoItem label="Packed">{fmt.dateTime(order.packing.packedAt)}</InfoItem>
                <InfoItem label="Packed by">{idx.users.get(order.packing.packedBy)?.name}</InfoItem>
                {order.packing.notes && <InfoItem label="Notes" className="col-span-2">{order.packing.notes}</InfoItem>}
              </dl>
            </Section>
          )}

          {shipment && (
            <Section title="Shipment">
              <div className="flex items-center justify-between gap-2">
                <div className="min-w-0">
                  <Link href={`/shipping/${shipment.id}`} className="font-medium text-primary hover:underline" data-testid="shipment-link">{shipment.number}</Link>
                  <p className="truncate text-xs text-muted-foreground">{shipment.carrier} · {shipment.trackingNumber}</p>
                </div>
                <StatusBadge status={shipment.status} domain="shipment" />
              </div>
            </Section>
          )}

          {returns.length > 0 && (
            <Section title="Returns">
              <ul className="space-y-2" data-testid="order-returns">
                {returns.map((r) => (
                  <li key={r.id} className="flex items-center justify-between gap-2">
                    <Link href={`/returns/${r.id}`} className="text-sm font-medium text-primary hover:underline">{r.number}</Link>
                    <StatusBadge status={r.status} domain="return" />
                  </li>
                ))}
              </ul>
            </Section>
          )}
        </div>
      </div>

      <ConfirmationDialog
        open={confirmOpen}
        onOpenChange={setConfirmOpen}
        title={`Confirm ${order.number}?`}
        description="Confirming reserves stock in the fulfilment warehouse and creates pick tasks. Reserved units are no longer available to other orders."
        confirmLabel="Confirm & reserve stock"
        onConfirm={doConfirm}
      >
        {(shortages.length > 0 || confirmError) && (
          <div className="space-y-1 rounded-lg border border-danger/30 bg-danger-soft p-3 text-sm text-danger" role="alert" data-testid="confirm-error">
            <p className="flex items-center gap-1.5 font-medium"><AlertTriangle className="size-4" /> Insufficient stock</p>
            {shortages.map((s) => (
              <p key={s.productId}>
                {idx.products.get(s.productId)?.name}: {s.available} available, {s.requested} requested
              </p>
            ))}
            {confirmError && shortages.length === 0 && <p>{confirmError}</p>}
          </div>
        )}
      </ConfirmationDialog>

      <ConfirmationDialog
        open={cancelOpen}
        onOpenChange={setCancelOpen}
        title={`Cancel ${order.number}?`}
        description={
          status === "draft"
            ? "This draft will be marked as cancelled."
            : "Reserved stock will be released back to available inventory and open pick tasks will be removed. This cannot be undone."
        }
        confirmLabel="Cancel order"
        destructive
        onConfirm={doCancel}
      >
        <Textarea value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Reason (optional)" aria-label="Cancellation reason" rows={2} />
      </ConfirmationDialog>
    </>
  );
}
