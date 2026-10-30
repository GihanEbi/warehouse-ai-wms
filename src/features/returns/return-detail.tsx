"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useFieldArray, useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Ban, ClipboardCheck, Info, PackageCheck, PackageOpen, Warehouse } from "lucide-react";
import type { ReturnRecord } from "@/types";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { PageHeader, Section, InfoItem } from "@/components/shared/page-header";
import { ConfirmationDialog, FormDialog } from "@/components/shared/dialogs";
import { EmptyState } from "@/components/shared/states";
import { LinkButton } from "@/components/shared/link-button";
import { NativeSelect } from "@/components/shared/form-controls";
import { ProductImage } from "@/components/shared/product-bits";
import { ActivityTimeline, StepProgress, type Step } from "@/components/shared/progress";
import { StatusBadge } from "@/components/shared/status-badge";
import { useData, useFormat, useIndex, usePermission, useTx } from "@/hooks/use-wms";
import { useSubmit } from "@/hooks/use-submit";
import { returnsBinFor, storageBinsFor } from "@/lib/inventory/selectors";
import { suggestPutawayBin } from "@/lib/workflows/purchasing";
import { cn } from "@/lib/utils";

export function ReturnDetail({ id }: { id: string }) {
  const data = useData();
  const idx = useIndex();
  const fmt = useFormat();
  const tx = useTx();
  const { can } = usePermission();
  const { submit } = useSubmit();
  const [receiveOpen, setReceiveOpen] = useState(false);
  const [inspectOpen, setInspectOpen] = useState(false);
  const [restockOpen, setRestockOpen] = useState(false);
  const [rejectOpen, setRejectOpen] = useState(false);
  const [rejectReason, setRejectReason] = useState("");
  const [binOverride, setBinOverride] = useState("");

  const ret = data.returns.find((r) => r.id === id);
  if (!ret) {
    return <EmptyState title="Return not found" action={<LinkButton href="/returns" variant="outline">Back to returns</LinkButton>} />;
  }

  const order = data.orders.find((o) => o.id === ret.orderId);
  const customer = idx.customers.get(ret.customerId);
  const warehouse = idx.warehouses.get(ret.warehouseId);
  const returnsBin = returnsBinFor(data, ret.warehouseId);
  const canWrite = can("returns.write");
  const noPerm = "Your role cannot process returns";
  const status = ret.status;
  const totalUnits = ret.lines.reduce((s, l) => s + l.quantity, 0);
  const goodUnits = ret.lines.reduce((s, l) => s + l.goodQty, 0);
  const damagedUnits = ret.lines.reduce((s, l) => s + l.damagedQty, 0);
  const movements = data.movements.filter((m) => m.source?.kind === "return" && m.source.id === ret.id);
  const rejected = status === "rejected";

  const steps: Step[] = [
    { key: "requested", label: "Requested" },
    { key: "received", label: "Received" },
    { key: "inspected", label: "Inspected" },
    { key: "final", label: rejected ? "Rejected" : "Restocked" },
  ];
  const current = status === "requested" ? 1 : status === "received" ? 2 : status === "inspected" ? 3 : status === "restocked" ? 4 : 0;
  const wasReceived = ret.events.some((e) => e.title === "Received");

  const suggested = ret.lines
    .filter((l) => l.goodQty > 0)
    .map((l) => ({ line: l, binId: suggestPutawayBin(data, l.productId, ret.warehouseId, l.goodQty) }));

  return (
    <>
      <PageHeader
        title={ret.number}
        description={`${customer?.name ?? ""} · against ${order?.number ?? "order"}`}
        actions={
          <>
            {status === "requested" && (
              <Button onClick={() => setReceiveOpen(true)} disabled={!canWrite} title={canWrite ? undefined : noPerm} data-testid="receive-return">
                <PackageOpen /> Mark as received
              </Button>
            )}
            {status === "received" && (
              <Button onClick={() => setInspectOpen(true)} disabled={!canWrite} title={canWrite ? undefined : noPerm} data-testid="inspect-return">
                <ClipboardCheck /> Inspect
              </Button>
            )}
            {status === "inspected" && (
              <Button onClick={() => { setBinOverride(""); setRestockOpen(true); }} disabled={!canWrite || goodUnits === 0} title={!canWrite ? noPerm : goodUnits === 0 ? "No units passed inspection - reject instead" : undefined} data-testid="approve-restock">
                <PackageCheck /> Approve restocking
              </Button>
            )}
            {(status === "requested" || status === "received" || status === "inspected") && (
              <Button variant="outline" className="text-danger hover:text-danger" onClick={() => setRejectOpen(true)} disabled={!canWrite} title={canWrite ? undefined : noPerm} data-testid="reject-return">
                <Ban /> {status === "inspected" ? "Reject / mark damaged" : "Reject"}
              </Button>
            )}
            {order && <LinkButton href={`/orders/${order.id}`} variant="outline">View order</LinkButton>}
          </>
        }
      />
      <div className="mb-4">
        <span data-testid="return-status"><StatusBadge status={status} domain="return" /></span>
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <div className="min-w-0 space-y-4 lg:col-span-2">
          <Section title="Return progress">
            <StepProgress steps={steps} current={current} terminated={rejected} />
          </Section>

          <Section title="Stock effect" description="How this return affects inventory right now.">
            <div className={cn("flex items-start gap-3 rounded-lg border p-3 text-sm", status === "restocked" ? "border-success/30 bg-success-soft" : rejected ? "border-danger/30 bg-danger-soft" : "bg-muted/30")} data-testid="stock-effect">
              <Info className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
              <div className="space-y-1">
                {status === "requested" && <p><strong>No stock effect yet.</strong> The {fmt.number(totalUnits)} unit(s) are still with the customer. They enter the Returns &amp; Inspection area when marked as received.</p>}
                {status === "received" && <p><strong>{fmt.number(totalUnits)} unit(s) are held in the Returns &amp; Inspection area{returnsBin ? ` (${returnsBin.code})` : ""}.</strong> They count toward on-hand but are <strong>not sellable</strong> and not available for orders until inspected and approved.</p>}
                {status === "inspected" && <p><strong>Awaiting approval.</strong> {fmt.number(goodUnits)} good unit(s) will move into sellable storage; {fmt.number(damagedUnits)} damaged unit(s) will be written off. Nothing is available for sale until you approve restocking.</p>}
                {status === "restocked" && <p><strong>{fmt.number(goodUnits)} unit(s) restocked</strong> and available for sale again{damagedUnits > 0 ? `; ${fmt.number(damagedUnits)} damaged unit(s) were written off` : ""}.</p>}
                {rejected && <p><strong>Return rejected.</strong> {wasReceived ? "Units held in the returns area were written off and none re-entered sellable stock." : "No stock was affected."}</p>}
              </div>
            </div>
            {movements.length > 0 && (
              <div className="mt-3 overflow-x-auto">
                <table className="w-full text-sm" data-testid="return-movements">
                  <thead className="border-b text-xs text-muted-foreground">
                    <tr>
                      <th className="py-2 pr-3 text-left font-medium">Movement</th>
                      <th className="py-2 pr-3 text-left font-medium">Type</th>
                      <th className="py-2 pr-3 text-left font-medium">Product</th>
                      <th className="py-2 pr-3 text-left font-medium">From → To</th>
                      <th className="py-2 text-right font-medium">Qty</th>
                    </tr>
                  </thead>
                  <tbody>
                    {movements.map((m) => (
                      <tr key={m.id} className="border-b last:border-b-0">
                        <td className="py-2 pr-3 font-mono text-xs">{m.reference}</td>
                        <td className="py-2 pr-3 text-xs">{m.type.replace("_", " ")}</td>
                        <td className="py-2 pr-3">{idx.products.get(m.productId)?.name}</td>
                        <td className="py-2 pr-3 font-mono text-xs">{m.fromLabel} → {m.toLabel}</td>
                        <td className={cn("py-2 text-right tabular-nums", m.onHandDelta > 0 ? "text-success" : m.onHandDelta < 0 ? "text-danger" : "")}>{m.onHandDelta > 0 ? "+" : m.onHandDelta < 0 ? "-" : ""}{m.quantity}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Section>

          <Section title="Returned items" contentClassName="p-0">
            <div className="overflow-x-auto">
              <table className="w-full text-sm" data-testid="return-items">
                <thead className="border-b bg-muted/40 text-xs text-muted-foreground">
                  <tr>
                    <th className="px-3 py-2 text-left font-medium">Product</th>
                    <th className="px-3 py-2 text-right font-medium">Returned</th>
                    <th className="px-3 py-2 text-left font-medium">Reason</th>
                    <th className="px-3 py-2 text-right font-medium">Good</th>
                    <th className="px-3 py-2 text-right font-medium">Damaged</th>
                  </tr>
                </thead>
                <tbody>
                  {ret.lines.map((l) => {
                    const p = idx.products.get(l.productId);
                    const inspected = status === "inspected" || status === "restocked" || (rejected && l.goodQty + l.damagedQty > 0);
                    return (
                      <tr key={l.id} className="border-b last:border-b-0" data-testid="return-item">
                        <td className="px-3 py-2.5">
                          <div className="flex min-w-[10rem] items-center gap-2">
                            {p && <ProductImage product={p} size={32} />}
                            <div className="min-w-0">
                              <p className="truncate font-medium">{p?.name}</p>
                              <p className="font-mono text-[11px] text-muted-foreground">{p?.sku}</p>
                            </div>
                          </div>
                        </td>
                        <td className="px-3 py-2.5 text-right tabular-nums">{l.quantity}</td>
                        <td className="px-3 py-2.5 text-muted-foreground">{l.reason}</td>
                        <td className="px-3 py-2.5 text-right tabular-nums text-success">{inspected ? l.goodQty : "—"}</td>
                        <td className="px-3 py-2.5 text-right tabular-nums text-danger">{inspected ? l.damagedQty : "—"}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </Section>

          <Section title="Timeline">
            <ActivityTimeline events={ret.events} />
          </Section>
        </div>

        <div className="min-w-0 space-y-4">
          <Section title="Return summary">
            <dl className="grid grid-cols-2 gap-3">
              <InfoItem label="RMA">{ret.number}</InfoItem>
              <InfoItem label="Status"><StatusBadge status={status} domain="return" /></InfoItem>
              <InfoItem label="Original order">
                {order ? <Link href={`/orders/${order.id}`} className="text-primary hover:underline" data-testid="order-link">{order.number}</Link> : "—"}
              </InfoItem>
              <InfoItem label="Requested">{fmt.date(ret.createdAt)}</InfoItem>
              <InfoItem label="Customer" className="col-span-2">{customer?.name}</InfoItem>
              <InfoItem label="Warehouse" className="col-span-2"><span className="inline-flex items-center gap-1"><Warehouse className="size-3.5 text-muted-foreground" />{warehouse?.name}</span></InfoItem>
              <InfoItem label="Units returned">{fmt.number(totalUnits)}</InfoItem>
              <InfoItem label="Requested by">{idx.users.get(ret.createdBy)?.name}</InfoItem>
              <InfoItem label="Reason" className="col-span-2">{ret.reason}</InfoItem>
            </dl>
          </Section>
        </div>
      </div>

      {/* Receive */}
      <ConfirmationDialog
        open={receiveOpen}
        onOpenChange={setReceiveOpen}
        title={`Mark ${ret.number} as received?`}
        description={`The ${fmt.number(totalUnits)} returned unit(s) will be booked into the Returns & Inspection area${returnsBin ? ` (${returnsBin.code})` : ""}. They are NOT sellable until inspected and approved for restocking.`}
        confirmLabel="Mark as received"
        onConfirm={async () => {
          const res = await submit(() => tx.receiveReturn(ret.id), { success: "Return received - units are in the Returns & Inspection area" });
          return !!res?.ok;
        }}
      />

      {/* Inspect */}
      <InspectDialog ret={ret} open={inspectOpen} onOpenChange={setInspectOpen} />

      {/* Approve restock */}
      <ConfirmationDialog
        open={restockOpen}
        onOpenChange={setRestockOpen}
        title={`Approve restocking for ${ret.number}?`}
        description={`Only the ${fmt.number(goodUnits)} approved unit(s) become available stock. ${fmt.number(damagedUnits)} damaged unit(s) will be written off.`}
        confirmLabel="Approve restocking"
        onConfirm={async () => {
          const res = await submit(() => tx.approveRestock(ret.id, binOverride || undefined), { success: `Return restocked - ${goodUnits} unit(s) available for sale` });
          return !!res?.ok;
        }}
      >
        <div className="space-y-3 text-sm">
          <ul className="space-y-1 rounded-lg border bg-muted/30 p-3" data-testid="restock-plan">
            {suggested.map(({ line, binId }) => (
              <li key={line.id} className="flex items-center justify-between gap-2">
                <span className="min-w-0 truncate">{line.goodQty} × {idx.products.get(line.productId)?.name}</span>
                <span className="shrink-0 font-mono text-xs">{(binOverride ? idx.bins.get(binOverride)?.code : binId ? idx.bins.get(binId)?.code : null) ?? "no bin available"}</span>
              </li>
            ))}
          </ul>
          <div className="space-y-1">
            <label htmlFor="restock-bin" className="text-xs font-medium">Storage bin</label>
            <NativeSelect
              id="restock-bin"
              value={binOverride}
              onChange={(e) => setBinOverride(e.target.value)}
              options={[{ value: "", label: "Use suggested bin per product" }, ...storageBinsFor(data, ret.warehouseId).map((b) => ({ value: b.id, label: b.code }))]}
            />
          </div>
        </div>
      </ConfirmationDialog>

      {/* Reject */}
      <ConfirmationDialog
        open={rejectOpen}
        onOpenChange={setRejectOpen}
        title={status === "inspected" ? `Reject / mark ${ret.number} as damaged?` : `Reject ${ret.number}?`}
        description={
          status === "requested"
            ? "The return will be closed. No stock is affected because the goods were not received."
            : "All units of this return held in the Returns & Inspection area will be written off. None will re-enter sellable stock. This cannot be undone."
        }
        confirmLabel="Reject return"
        destructive
        onConfirm={async () => {
          const res = await submit(() => tx.rejectReturn(ret.id, rejectReason.trim()), { success: "Return rejected" });
          if (res?.ok) setRejectReason("");
          return !!res?.ok;
        }}
      >
        <Textarea value={rejectReason} onChange={(e) => setRejectReason(e.target.value)} placeholder="Reason (optional)" aria-label="Rejection reason" rows={2} />
      </ConfirmationDialog>
    </>
  );
}

/* ---------------------------------------------------------------- Inspect */

type InspectValues = { lines: { lineId: string; quantity: number; goodQty: number; damagedQty: number }[] };

const inspectSchema = z
  .object({
    lines: z.array(
      z.object({
        lineId: z.string(),
        quantity: z.number(),
        goodQty: z.number({ error: "Enter a number" }).int("Whole numbers only").min(0, "Cannot be negative"),
        damagedQty: z.number({ error: "Enter a number" }).int("Whole numbers only").min(0, "Cannot be negative"),
      }),
    ),
  })
  .superRefine((v, ctx) => {
    v.lines.forEach((l, i) => {
      if (Number.isFinite(l.goodQty) && Number.isFinite(l.damagedQty) && l.goodQty + l.damagedQty !== l.quantity) {
        ctx.addIssue({ code: "custom", path: ["lines", i, "damagedQty"], message: `Good + damaged must equal ${l.quantity}` });
      }
    });
  });

function InspectDialog({ ret, open, onOpenChange }: { ret: ReturnRecord; open: boolean; onOpenChange: (o: boolean) => void }) {
  const idx = useIndex();
  const tx = useTx();
  const { submit, pending } = useSubmit();
  const form = useForm<InspectValues>({
    resolver: zodResolver(inspectSchema),
    defaultValues: { lines: ret.lines.map((l) => ({ lineId: l.id, quantity: l.quantity, goodQty: l.quantity, damagedQty: 0 })) },
  });
  const { fields } = useFieldArray({ control: form.control, name: "lines" });
  const { errors } = form.formState;

  useEffect(() => {
    if (open) form.reset({ lines: ret.lines.map((l) => ({ lineId: l.id, quantity: l.quantity, goodQty: l.quantity, damagedQty: 0 })) });
    // eslint-disable-next-line react-hooks/exhaustive-deps -- reset when opened
  }, [open]);

  const onSubmit = form.handleSubmit(async (v) => {
    const res = await submit(() => tx.inspectReturn(ret.id, v.lines.map((l) => ({ lineId: l.lineId, goodQty: l.goodQty, damagedQty: l.damagedQty }))), {
      success: "Inspection recorded",
    });
    if (res?.ok) onOpenChange(false);
  });

  return (
    <FormDialog
      open={open}
      onOpenChange={onOpenChange}
      title={`Inspect ${ret.number}`}
      description="For every product, split the returned units into good (fit for resale) and damaged. They must add up to the returned quantity."
      submitLabel="Record inspection"
      submitTestId="confirm-inspect"
      testId="inspect-dialog"
      size="lg"
      pending={pending}
      onSubmit={onSubmit}
    >
      <ul className="space-y-3">
        {fields.map((f, i) => {
          const line = ret.lines.find((l) => l.id === f.lineId);
          const p = line ? idx.products.get(line.productId) : undefined;
          const err = errors.lines?.[i];
          return (
            <li key={f.id} className="rounded-lg border p-3" data-testid="inspect-row">
              <div className="flex items-center gap-3">
                {p && <ProductImage product={p} size={36} />}
                <div className="min-w-0 flex-1">
                  <p className="truncate font-medium">{p?.name}</p>
                  <p className="text-xs text-muted-foreground">Returned: {f.quantity}</p>
                </div>
              </div>
              <div className="mt-3 grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <label htmlFor={`good-${i}`} className="text-xs font-medium">Good qty</label>
                  <Input id={`good-${i}`} type="number" min={0} inputMode="numeric" data-testid="good-qty" aria-invalid={!!err?.goodQty} {...form.register(`lines.${i}.goodQty`, { valueAsNumber: true })} />
                  {err?.goodQty && <p className="text-xs text-danger" role="alert">{err.goodQty.message}</p>}
                </div>
                <div className="space-y-1">
                  <label htmlFor={`dmg-${i}`} className="text-xs font-medium">Damaged qty</label>
                  <Input id={`dmg-${i}`} type="number" min={0} inputMode="numeric" data-testid="damaged-qty" aria-invalid={!!err?.damagedQty} {...form.register(`lines.${i}.damagedQty`, { valueAsNumber: true })} />
                  {err?.damagedQty && <p className="text-xs text-danger" role="alert">{err.damagedQty.message}</p>}
                </div>
              </div>
            </li>
          );
        })}
      </ul>
    </FormDialog>
  );
}
