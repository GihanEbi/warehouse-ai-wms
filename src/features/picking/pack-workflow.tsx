"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { ArrowLeft, ArrowRight, CheckCircle2, Loader2, PackageCheck, Printer, ScanBarcode, Truck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { PageHeader, Section, InfoItem } from "@/components/shared/page-header";
import { FormField, NativeSelect } from "@/components/shared/form-controls";
import { EmptyState } from "@/components/shared/states";
import { LinkButton } from "@/components/shared/link-button";
import { ProductImage } from "@/components/shared/product-bits";
import { StepProgress, type Step } from "@/components/shared/progress";
import { StatusBadge } from "@/components/shared/status-badge";
import { useData, useFormat, useIndex, usePermission, useTx } from "@/hooks/use-wms";
import { useSubmit } from "@/hooks/use-submit";
import { PACKAGING_TYPES } from "@/lib/constants";
import { customerAddress, orderQty } from "@/features/orders/order-utils";
import { cn } from "@/lib/utils";
import { PackingSlip } from "./packing-slip";
import { ScanField, sameCode } from "./scan-field";

const STEPS: Step[] = [
  { key: "confirmed", label: "Confirmed" },
  { key: "picking", label: "Picking" },
  { key: "picked", label: "Picked" },
  { key: "packing", label: "Packing" },
  { key: "packed", label: "Packed" },
];

const schema = z.object({
  packagingType: z.string().min(1, "Select a packaging type"),
  packageCount: z.number({ error: "Enter the number of packages" }).int("Whole numbers only").min(1, "At least 1 package"),
  weightKg: z.number({ error: "Enter the total weight" }).gt(0, "Weight must be greater than 0"),
  notes: z.string(),
});
type Values = z.infer<typeof schema>;

export function PackWorkflow({ orderId }: { orderId: string }) {
  const data = useData();
  const idx = useIndex();
  const fmt = useFormat();
  const tx = useTx();
  const { can } = usePermission();
  const { submit, pending } = useSubmit();
  const [step, setStep] = useState<1 | 2 | 3>(1);
  const [scans, setScans] = useState<Record<string, string>>({});

  const form = useForm<Values>({
    resolver: zodResolver(schema),
    defaultValues: { packagingType: PACKAGING_TYPES[1], packageCount: 1, weightKg: undefined as unknown as number, notes: "" },
  });
  const { errors } = form.formState;
  const values = form.watch();

  const order = data.orders.find((o) => o.id === orderId);
  const verified = useMemo(() => {
    const m: Record<string, boolean> = {};
    if (!order) return m;
    for (const l of order.lines) {
      const p = idx.products.get(l.productId);
      m[l.id] = !!p && sameCode(scans[l.id] ?? "", p.barcode) && (scans[l.id] ?? "").trim() !== "";
    }
    return m;
  }, [order, scans, idx.products]);

  if (!order) {
    return <EmptyState title="Order not found" action={<LinkButton href="/picking-packing" variant="outline">Back to picking & packing</LinkButton>} />;
  }

  const customer = idx.customers.get(order.customerId);
  const canPack = can("picking.write");
  const status = order.status;
  const current = status === "picked" ? 3 : status === "packed" || status === "dispatched" ? 5 : status === "confirmed" || status === "picking" ? 1 : 0;
  const allVerified = order.lines.length > 0 && order.lines.every((l) => verified[l.id]);
  const verifiedCount = order.lines.filter((l) => verified[l.id]).length;

  /* ---- already packed: success / slip view ---- */
  if (order.packing && (status === "packed" || status === "dispatched")) {
    return (
      <>
        <div className="print-hidden">
          <PageHeader
            title={`Packing slip ${order.packing.slipNumber}`}
            description={`${order.number} · ${customer?.name ?? ""}`}
            actions={
              <>
                <Button variant="outline" onClick={() => window.print()} data-testid="print-slip">
                  <Printer /> Print slip
                </Button>
                {status === "packed" && !order.shipmentId && (
                  <LinkButton href={`/shipping?order=${order.id}`} data-testid="create-shipment-link" aria-disabled={!can("shipping.write")} className={cn(!can("shipping.write") && "pointer-events-none opacity-50")}>
                    <Truck /> Create shipment
                  </LinkButton>
                )}
                {order.shipmentId && (
                  <LinkButton href={`/shipping/${order.shipmentId}`} variant="outline">
                    <Truck /> View shipment
                  </LinkButton>
                )}
              </>
            }
          />
          <div className="mb-4 space-y-4">
            <StepProgress steps={STEPS} current={5} />
            <div className="flex items-center gap-2 rounded-xl border border-success/30 bg-success-soft p-3 text-sm text-success" data-testid="pack-success">
              <CheckCircle2 className="size-4 shrink-0" />
              <p>
                {order.number} is packed ({order.packing.packageCount} × {order.packing.packagingType}, {order.packing.weightKg} kg).{" "}
                {status === "packed" && !order.shipmentId ? "Next step: create the shipment." : null}
              </p>
            </div>
          </div>
        </div>
        <PackingSlip order={order} />
        <div className="print-hidden mt-4 flex justify-center">
          <LinkButton href="/picking-packing?tab=packing" variant="ghost">
            <ArrowLeft /> Back to picking & packing
          </LinkButton>
        </div>
      </>
    );
  }

  /* ---- not packable ---- */
  if (status !== "picked") {
    return (
      <>
        <PageHeader title={`Pack ${order.number}`} description={customer?.name} />
        <Section>
          <StepProgress steps={STEPS} current={current} terminated={status === "cancelled"} />
          <div className="mt-4 rounded-lg border bg-muted/30 p-4 text-sm" data-testid="pack-not-ready">
            <p className="flex items-center gap-2 font-medium">
              Order status: <StatusBadge status={status} />
            </p>
            <p className="mt-1 text-muted-foreground">
              {status === "confirmed" || status === "picking"
                ? "Every pick task must be completed before this order can be packed."
                : status === "draft"
                  ? "This order has not been confirmed yet."
                  : "This order cannot be packed."}
            </p>
            <div className="mt-3 flex gap-2">
              {(status === "confirmed" || status === "picking") && (
                <LinkButton href={`/picking-packing?order=${order.id}`}>Go to picking</LinkButton>
              )}
              <LinkButton href={`/orders/${order.id}`} variant="outline">View order</LinkButton>
            </div>
          </div>
        </Section>
      </>
    );
  }

  /* ---- packing wizard ---- */
  async function markPacked() {
    const v = form.getValues();
    const res = await submit(
      () => tx.packOrder({ orderId: order!.id, packagingType: v.packagingType, packageCount: v.packageCount, weightKg: v.weightKg, notes: v.notes }),
      { success: (slip) => `Order packed - packing slip ${slip} generated` },
    );
    void res;
  }

  const goReview = form.handleSubmit(() => setStep(3));
  const stepTitle = ["Verify picked products", "Package details", "Review & pack"];

  return (
    <>
      <PageHeader title={`Pack ${order.number}`} description={`${customer?.name ?? ""} · ${fmt.number(orderQty(order))} units`} />
      <div className="mb-4 rounded-xl border bg-card p-4 shadow-card">
        <StepProgress steps={STEPS} current={3} />
      </div>
      {!canPack && (
        <p className="mb-4 rounded-lg border border-warning/30 bg-warning-soft p-3 text-sm text-warning">Your role cannot pack orders. You can review the details only.</p>
      )}

      <div className="grid gap-4 lg:grid-cols-3">
        <div className="min-w-0 lg:col-span-2">
          <Section
            title={`Step ${step} of 3 · ${stepTitle[step - 1]}`}
            actions={<span className="text-xs text-muted-foreground" data-testid="verify-count">{verifiedCount}/{order.lines.length} verified</span>}
          >
            {step === 1 && (
              <div className="space-y-3" data-testid="verify-step">
                <p className="text-sm text-muted-foreground">Scan each product barcode to confirm the right items were picked.</p>
                <ul className="space-y-3">
                  {order.lines.map((l) => {
                    const p = idx.products.get(l.productId);
                    if (!p) return null;
                    const ok = verified[l.id];
                    return (
                      <li key={l.id} className={cn("rounded-lg border p-3", ok && "border-success/40 bg-success-soft/40")} data-testid="verify-row" data-verified={ok}>
                        <div className="flex items-center gap-3">
                          <ProductImage product={p} size={40} />
                          <div className="min-w-0 flex-1">
                            <p className="truncate font-medium">{p.name}</p>
                            <p className="font-mono text-[11px] text-muted-foreground">{p.sku} · barcode {p.barcode}</p>
                            <p className="text-xs text-muted-foreground">
                              Bin{l.allocations.length > 1 ? "s" : ""}: {l.allocations.map((a) => `${idx.bins.get(a.binId)?.code} (${a.quantity})`).join(", ")}
                            </p>
                          </div>
                          <div className="text-right">
                            <p className="text-[11px] text-muted-foreground">Qty</p>
                            <p className="text-xl font-semibold tabular-nums">{l.quantity}</p>
                          </div>
                        </div>
                        <div className="mt-3 flex items-center gap-2">
                          <div className="min-w-0 flex-1">
                            <ScanField
                              id={`verify-${l.id}`}
                              label="Scan"
                              expected={p.barcode}
                              value={scans[l.id] ?? ""}
                              onChange={(v) => setScans((s) => ({ ...s, [l.id]: v }))}
                              testId="verify-scan"
                              compact
                            />
                          </div>
                        </div>
                      </li>
                    );
                  })}
                </ul>
                <div className="flex flex-wrap justify-between gap-2 pt-1">
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => setScans(Object.fromEntries(order.lines.map((l) => [l.id, idx.products.get(l.productId)?.barcode ?? ""])))}
                    data-testid="verify-all"
                  >
                    <ScanBarcode /> Simulate scan for all
                  </Button>
                  <Button type="button" onClick={() => setStep(2)} disabled={!allVerified} data-testid="to-package-details">
                    Continue <ArrowRight />
                  </Button>
                </div>
              </div>
            )}

            {step === 2 && (
              <form onSubmit={goReview} noValidate className="space-y-4" data-testid="package-step">
                <div className="grid gap-4 sm:grid-cols-3">
                  <FormField id="packagingType" label="Packaging type" required error={errors.packagingType?.message}>
                    <NativeSelect id="packagingType" {...form.register("packagingType")} options={PACKAGING_TYPES.map((t) => ({ value: t, label: t }))} invalid={!!errors.packagingType} />
                  </FormField>
                  <FormField id="packageCount" label="Number of packages" required error={errors.packageCount?.message}>
                    <Input id="packageCount" type="number" min={1} inputMode="numeric" {...form.register("packageCount", { valueAsNumber: true })} aria-invalid={!!errors.packageCount} />
                  </FormField>
                  <FormField id="weightKg" label="Total weight (kg)" required error={errors.weightKg?.message}>
                    <Input id="weightKg" type="number" min={0} step="any" inputMode="decimal" {...form.register("weightKg", { valueAsNumber: true })} aria-invalid={!!errors.weightKg} />
                  </FormField>
                </div>
                <FormField id="notes" label="Packing notes">
                  <Textarea id="notes" rows={2} {...form.register("notes")} placeholder="Fragile, keep upright…" />
                </FormField>
                <div className="flex justify-between gap-2">
                  <Button type="button" variant="outline" onClick={() => setStep(1)}>
                    <ArrowLeft /> Back
                  </Button>
                  <Button type="submit" data-testid="to-review">
                    Review <ArrowRight />
                  </Button>
                </div>
              </form>
            )}

            {step === 3 && (
              <div className="space-y-4" data-testid="review-step">
                <dl className="grid grid-cols-2 gap-3 rounded-lg border bg-muted/30 p-3 sm:grid-cols-4">
                  <InfoItem label="Packaging">{values.packagingType}</InfoItem>
                  <InfoItem label="Packages">{values.packageCount}</InfoItem>
                  <InfoItem label="Total weight">{values.weightKg} kg</InfoItem>
                  <InfoItem label="Items verified">{verifiedCount}/{order.lines.length}</InfoItem>
                  {values.notes && <InfoItem label="Notes" className="col-span-2 sm:col-span-4">{values.notes}</InfoItem>}
                </dl>
                <p className="text-sm text-muted-foreground">Marking as packed generates the packing slip and makes the order ready for shipment.</p>
                <div className="flex justify-between gap-2">
                  <Button type="button" variant="outline" onClick={() => setStep(2)} disabled={pending}>
                    <ArrowLeft /> Back
                  </Button>
                  <Button type="button" onClick={() => void markPacked()} disabled={pending || !canPack} title={canPack ? undefined : "Your role cannot pack orders"} data-testid="mark-packed">
                    {pending ? <Loader2 className="animate-spin" /> : <PackageCheck />} Mark as packed
                  </Button>
                </div>
              </div>
            )}
          </Section>
        </div>

        <div className="space-y-4">
          <Section title="Order">
            <dl className="grid grid-cols-2 gap-3">
              <InfoItem label="Order"><Link href={`/orders/${order.id}`} className="text-primary hover:underline">{order.number}</Link></InfoItem>
              <InfoItem label="Required">{fmt.date(order.requiredDate)}</InfoItem>
              <InfoItem label="Customer" className="col-span-2">{customer?.name}</InfoItem>
              <InfoItem label="Ship to" className="col-span-2">{customerAddress(customer)}</InfoItem>
            </dl>
          </Section>
        </div>
      </div>
    </>
  );
}
