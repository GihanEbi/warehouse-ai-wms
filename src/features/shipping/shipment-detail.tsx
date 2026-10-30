"use client";

import Link from "next/link";
import { useState } from "react";
import { CheckCircle2, MapPinned, PackageCheck, Send, Truck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { PageHeader, Section, InfoItem } from "@/components/shared/page-header";
import { ConfirmationDialog } from "@/components/shared/dialogs";
import { EmptyState } from "@/components/shared/states";
import { LinkButton } from "@/components/shared/link-button";
import { ProductImage } from "@/components/shared/product-bits";
import { ActivityTimeline, StepProgress, type Step } from "@/components/shared/progress";
import { StatusBadge } from "@/components/shared/status-badge";
import { useData, useFormat, useIndex, usePermission, useTx } from "@/hooks/use-wms";
import { useSubmit } from "@/hooks/use-submit";
import { customerAddress, orderQty } from "@/features/orders/order-utils";
import type { ShipmentStatus } from "@/types";

const STEPS: Step[] = [
  { key: "ready_to_ship", label: "Ready to Ship" },
  { key: "dispatched", label: "Dispatched" },
  { key: "in_transit", label: "In Transit" },
  { key: "delivered", label: "Delivered" },
];
const STEP_INDEX: Record<ShipmentStatus, number> = { ready_to_ship: 0, dispatched: 1, in_transit: 2, delivered: 4 };

export function ShipmentDetail({ id }: { id: string }) {
  const data = useData();
  const idx = useIndex();
  const fmt = useFormat();
  const tx = useTx();
  const { can } = usePermission();
  const { submit, pending } = useSubmit();
  const [dispatchOpen, setDispatchOpen] = useState(false);

  const shipment = data.shipments.find((s) => s.id === id);
  if (!shipment) {
    return <EmptyState title="Shipment not found" action={<LinkButton href="/shipping?tab=shipments" variant="outline">Back to shipments</LinkButton>} />;
  }
  const order = data.orders.find((o) => o.id === shipment.orderId);
  const customer = order ? idx.customers.get(order.customerId) : undefined;
  const warehouse = idx.warehouses.get(shipment.warehouseId);
  const canShip = can("shipping.write");
  const movements = data.movements.filter((m) => m.type === "dispatch" && m.source?.kind === "order" && m.source.id === shipment.orderId);
  const unitsOut = movements.reduce((s, m) => s + m.quantity, 0);
  const dispatched = shipment.status !== "ready_to_ship";
  const noPerm = "Your role cannot perform shipping actions";

  async function advance(next: "in_transit" | "delivered") {
    await submit(() => tx.advanceShipment(shipment!.id, next), { success: next === "in_transit" ? "Shipment is in transit" : "Shipment delivered" });
  }

  return (
    <>
      <PageHeader
        title={shipment.number}
        description={`${shipment.carrier} · ${shipment.method}`}
        actions={
          <>
            {shipment.status === "ready_to_ship" && (
              <Button onClick={() => setDispatchOpen(true)} disabled={!canShip} title={canShip ? undefined : noPerm} data-testid="confirm-dispatch">
                <Send /> Confirm dispatch
              </Button>
            )}
            {shipment.status === "dispatched" && (
              <Button onClick={() => void advance("in_transit")} disabled={!canShip || pending} title={canShip ? undefined : noPerm} data-testid="mark-in-transit">
                <Truck /> Mark in transit
              </Button>
            )}
            {shipment.status === "in_transit" && (
              <Button onClick={() => void advance("delivered")} disabled={!canShip || pending} title={canShip ? undefined : noPerm} data-testid="mark-delivered">
                <PackageCheck /> Mark delivered
              </Button>
            )}
            {order && (
              <LinkButton href={`/orders/${order.id}`} variant="outline">
                View order {order.number}
              </LinkButton>
            )}
          </>
        }
      />
      <div className="mb-4 flex items-center gap-2">
        <span data-testid="shipment-status"><StatusBadge status={shipment.status} domain="shipment" /></span>
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <div className="min-w-0 space-y-4 lg:col-span-2">
          <Section title="Delivery progress">
            <StepProgress steps={STEPS} current={STEP_INDEX[shipment.status]} />
          </Section>

          {dispatched ? (
            <Section title="Stock impact of dispatch" className="border-success/30" description="What changed in inventory when this shipment was dispatched." >
              <div data-testid="dispatch-result" className="space-y-3">
                <p className="flex items-center gap-2 text-sm text-success">
                  <CheckCircle2 className="size-4" /> {fmt.number(unitsOut)} unit(s) left {warehouse?.name}; the matching reservations were released.
                </p>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead className="border-b text-xs text-muted-foreground">
                      <tr>
                        <th className="py-2 pr-3 text-left font-medium">Movement</th>
                        <th className="py-2 pr-3 text-left font-medium">Product</th>
                        <th className="py-2 pr-3 text-left font-medium">From bin</th>
                        <th className="py-2 text-right font-medium">On hand</th>
                      </tr>
                    </thead>
                    <tbody>
                      {movements.map((m) => (
                        <tr key={m.id} className="border-b last:border-b-0" data-testid="dispatch-movement">
                          <td className="py-2 pr-3 font-mono text-xs">{m.reference}</td>
                          <td className="py-2 pr-3">{idx.products.get(m.productId)?.name}</td>
                          <td className="py-2 pr-3 font-mono text-xs">{m.fromLabel}</td>
                          <td className="py-2 text-right font-medium text-danger tabular-nums">-{m.quantity}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </Section>
          ) : (
            <Section title="What happens on dispatch" className="border-warning/30">
              <p className="text-sm text-muted-foreground">
                Confirming dispatch reduces the physical stock by <span className="font-medium text-foreground">{order ? fmt.number(orderQty(order)) : 0} unit(s)</span>, releases the matching reservations and writes dispatch stock movements. The order becomes <strong>Dispatched</strong>.
              </p>
            </Section>
          )}

          {order && (
            <Section title="Items in this shipment" contentClassName="p-0">
              <div className="overflow-x-auto">
                <table className="w-full text-sm" data-testid="shipment-items">
                  <thead className="border-b bg-muted/40 text-xs text-muted-foreground">
                    <tr>
                      <th className="px-3 py-2 text-left font-medium">Product</th>
                      <th className="px-3 py-2 text-right font-medium">Qty</th>
                      <th className="px-3 py-2 text-left font-medium">Picked from</th>
                    </tr>
                  </thead>
                  <tbody>
                    {order.lines.map((l) => {
                      const p = idx.products.get(l.productId);
                      return (
                        <tr key={l.id} className="border-b last:border-b-0">
                          <td className="px-3 py-2.5">
                            <div className="flex items-center gap-2">
                              {p && <ProductImage product={p} size={32} />}
                              <div className="min-w-0">
                                <p className="truncate font-medium">{p?.name}</p>
                                <p className="font-mono text-[11px] text-muted-foreground">{p?.sku}</p>
                              </div>
                            </div>
                          </td>
                          <td className="px-3 py-2.5 text-right tabular-nums">{fmt.number(l.quantity)}</td>
                          <td className="px-3 py-2.5 font-mono text-xs">{l.allocations.map((a) => `${idx.bins.get(a.binId)?.code} × ${a.quantity}`).join(", ") || "—"}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </Section>
          )}

          <Section title="Timeline">
            <ActivityTimeline events={shipment.events} />
          </Section>
        </div>

        <div className="min-w-0 space-y-4">
          <Section title="Shipment information">
            <dl className="grid grid-cols-2 gap-3">
              <InfoItem label="Shipment">{shipment.number}</InfoItem>
              <InfoItem label="Status"><StatusBadge status={shipment.status} domain="shipment" /></InfoItem>
              <InfoItem label="Carrier">{shipment.carrier}</InfoItem>
              <InfoItem label="Method">{shipment.method}</InfoItem>
              <InfoItem label="Tracking number" className="col-span-2"><span className="font-mono" data-testid="tracking-number">{shipment.trackingNumber}</span></InfoItem>
              <InfoItem label={dispatched ? "Dispatched" : "Planned dispatch"}>{fmt.date(shipment.dispatchDate)}</InfoItem>
              <InfoItem label="Estimated delivery">{fmt.date(shipment.estimatedDelivery)}</InfoItem>
              {shipment.deliveredAt && <InfoItem label="Delivered" className="col-span-2">{fmt.dateTime(shipment.deliveredAt)}</InfoItem>}
              <InfoItem label="Warehouse" className="col-span-2">{warehouse?.name}</InfoItem>
              {order?.packing && (
                <InfoItem label="Packages" className="col-span-2">
                  {order.packing.packageCount} × {order.packing.packagingType} · {order.packing.weightKg} kg
                </InfoItem>
              )}
            </dl>
          </Section>

          {order && (
            <Section title="Order & customer">
              <dl className="grid grid-cols-2 gap-3">
                <InfoItem label="Order">
                  <Link href={`/orders/${order.id}`} className="text-primary hover:underline" data-testid="order-link">{order.number}</Link>
                </InfoItem>
                <InfoItem label="Order status"><StatusBadge status={order.status} /></InfoItem>
                <InfoItem label="Customer" className="col-span-2">{customer?.name}</InfoItem>
                <InfoItem label="Contact">{customer?.contactPerson}</InfoItem>
                <InfoItem label="Phone">{customer?.phone}</InfoItem>
                <InfoItem label="Delivery address" className="col-span-2">
                  <span className="inline-flex items-start gap-1"><MapPinned className="mt-0.5 size-3.5 shrink-0 text-muted-foreground" />{customerAddress(customer)}</span>
                </InfoItem>
              </dl>
            </Section>
          )}
        </div>
      </div>

      <ConfirmationDialog
        open={dispatchOpen}
        onOpenChange={setDispatchOpen}
        title={`Confirm dispatch of ${shipment.number}?`}
        description={
          <>
            Physical stock will be reduced by {order ? fmt.number(orderQty(order)) : 0} unit(s) and the order&apos;s reservations will be released. Dispatch stock movements are created and the order becomes Dispatched. This cannot be undone.
          </>
        }
        confirmLabel="Confirm dispatch"
        onConfirm={async () => {
          const res = await submit(() => tx.confirmDispatch(shipment.id), { success: "Shipment dispatched - stock reduced and reservations released" });
          return !!res?.ok;
        }}
      />
    </>
  );
}
