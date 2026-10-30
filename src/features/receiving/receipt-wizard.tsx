"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useMemo, useState } from "react";
import { AlertTriangle, ArrowLeft, ArrowRight, Check, CheckCircle2, ClipboardCheck, Loader2, PackageCheck, Wand2 } from "lucide-react";
import type { ID, PurchaseOrder } from "@/types";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { PageHeader, Section } from "@/components/shared/page-header";
import { EmptyState } from "@/components/shared/states";
import { LinkButton } from "@/components/shared/link-button";
import { ProductImage } from "@/components/shared/product-bits";
import { StepProgress } from "@/components/shared/progress";
import { StatusBadge } from "@/components/shared/status-badge";
import { useData, useFormat, useIndex, usePermission, useTx } from "@/hooks/use-wms";
import { useSubmit } from "@/hooks/use-submit";
import { binFree, stagingBinFor } from "@/lib/inventory/selectors";
import { poOutstanding, suggestPutawayBin } from "@/lib/workflows/purchasing";
import { isPoOverdue, isReceivable, poOutstandingQty } from "@/features/purchasing/helpers";
import { cn } from "@/lib/utils";

const STEPS = [
  { key: "po", label: "Select order" },
  { key: "review", label: "Review items" },
  { key: "quantities", label: "Enter quantities" },
  { key: "confirm", label: "Confirm" },
];

type QtyState = Record<ID, { r: string; d: string }>;

const WHOLE = /^\d+$/;
const parse = (s: string | undefined) => (s && WHOLE.test(s.trim()) ? Number(s.trim()) : s && s.trim() !== "" ? NaN : 0);

export function ReceiptWizard() {
  const params = useSearchParams();
  const data = useData();
  const idx = useIndex();
  const fmt = useFormat();
  const tx = useTx();
  const { can } = usePermission();
  const { submit, pending } = useSubmit();

  const preselected = params.get("po");
  const preselectedPo = preselected ? data.purchaseOrders.find((p) => p.id === preselected) : undefined;
  const validPre = !!preselectedPo && isReceivable(preselectedPo);

  const [poId, setPoId] = useState<ID | null>(validPre ? preselected : null);
  const [step, setStep] = useState(validPre ? 1 : 0);
  const [qty, setQty] = useState<QtyState>({});
  const [notes, setNotes] = useState("");
  const [touched, setTouched] = useState(false);
  const [done, setDone] = useState<{ receiptId: ID } | null>(null);

  const receivable = useMemo(
    () => data.purchaseOrders.filter(isReceivable).sort((a, b) => a.expectedDate.localeCompare(b.expectedDate)),
    [data.purchaseOrders],
  );
  const po: PurchaseOrder | undefined = poId ? data.purchaseOrders.find((p) => p.id === poId) : undefined;
  const supplier = po ? idx.suppliers.get(po.supplierId) : undefined;
  const warehouse = po ? idx.warehouses.get(po.warehouseId) : undefined;
  const staging = po ? stagingBinFor(data, po.warehouseId) : undefined;

  const parsed = po
    ? po.lines.map((l) => {
        const cur = qty[l.id] ?? { r: "", d: "" };
        return { line: l, r: parse(cur.r), d: parse(cur.d), raw: cur };
      })
    : [];

  /* -------------------------------------------------------------- validation */
  const lineErrors = (() => {
    const out: Record<ID, { r?: string; d?: string }> = {};
    for (const p of parsed) {
      const e: { r?: string; d?: string } = {};
      const out_ = poOutstanding(p.line);
      if (Number.isNaN(p.r) || p.r < 0) e.r = "Enter a whole number (0 or more)";
      else if (p.r > out_) e.r = `Cannot exceed the outstanding ${out_}`;
      if (Number.isNaN(p.d) || p.d < 0) e.d = "Enter a whole number (0 or more)";
      else if (p.d > p.line.quantity) e.d = `Cannot exceed the ordered ${p.line.quantity}`;
      if (e.r || e.d) out[p.line.id] = e;
    }
    return out;
  })();

  const totalR = parsed.reduce((s, p) => s + (Number.isFinite(p.r) ? p.r : 0), 0);
  const totalD = parsed.reduce((s, p) => s + (Number.isFinite(p.d) ? p.d : 0), 0);
  const stagingFree = staging ? binFree(data, staging.id) : 0;

  const generalError = useMemo(() => {
    if (!staging) return "The destination warehouse has no receiving/staging location.";
    if (totalR === 0 && totalD === 0) return "Enter a received or damaged quantity for at least one product.";
    if (totalR > stagingFree) return `The staging area only has room for ${stagingFree} more units (entered ${totalR}).`;
    return null;
  }, [staging, totalR, totalD, stagingFree]);

  const quantitiesValid = Object.keys(lineErrors).length === 0 && !generalError;

  /* ---------------------------------------------------------------- preview */
  const preview = useMemo(() => {
    if (!po) return null;
    let remaining = 0;
    const putaway: { lineId: ID; productId: ID; qty: number; bin: ID | null }[] = [];
    // each putaway suggestion is computed independently (as the workflow does at confirm time)
    for (const p of parsed) {
      const r = Number.isFinite(p.r) ? p.r : 0;
      remaining += poOutstanding(p.line) - r;
      if (r > 0) putaway.push({ lineId: p.line.id, productId: p.line.productId, qty: r, bin: suggestPutawayBin(data, p.line.productId, po.warehouseId, r) });
    }
    return { resultStatus: remaining <= 0 ? "received" : "partially_received", putaway };
  }, [po, parsed, data]);

  function setField(lineId: ID, key: "r" | "d", value: string) {
    setQty((q) => ({ ...q, [lineId]: { r: q[lineId]?.r ?? "", d: q[lineId]?.d ?? "", [key]: value } }));
  }
  function fillOutstanding() {
    if (!po) return;
    setQty((q) => {
      const next = { ...q };
      for (const l of po.lines) next[l.id] = { r: String(poOutstanding(l)), d: q[l.id]?.d ?? "" };
      return next;
    });
  }
  function clearAll() {
    setQty({});
  }

  function next() {
    if (step === 0 && !poId) return;
    if (step === 2) {
      setTouched(true);
      if (!quantitiesValid) return;
    }
    setStep((s) => Math.min(3, s + 1));
  }

  async function confirm() {
    if (!po) return;
    const res = await submit(
      () =>
        tx.confirmGoodsReceipt({
          purchaseOrderId: po.id,
          notes,
          lines: parsed.map((p) => ({ poLineId: p.line.id, receivedQty: Number.isFinite(p.r) ? p.r : 0, damagedQty: Number.isFinite(p.d) ? p.d : 0 })),
        }),
      { success: "Goods receipt confirmed" },
    );
    if (res?.ok) setDone({ receiptId: res.value });
  }

  /* ---------------------------------------------------------------- success */
  if (done) {
    const receipt = data.receipts.find((r) => r.id === done.receiptId);
    const tasks = data.tasks.filter((t) => t.type === "putaway" && t.putaway?.receiptId === done.receiptId);
    const poNow = receipt ? data.purchaseOrders.find((p) => p.id === receipt.purchaseOrderId) : undefined;
    return (
      <>
        <PageHeader title="Goods receipt confirmed" description="The delivery has been booked into the staging area." />
        <div className="mx-auto max-w-2xl rounded-xl border bg-card p-6 text-center shadow-card" data-testid="receipt-success">
          <span className="mx-auto flex size-12 items-center justify-center rounded-full bg-success-soft text-success">
            <CheckCircle2 className="size-6" />
          </span>
          <p className="mt-3 text-sm text-muted-foreground">Goods receipt reference</p>
          <p className="text-2xl font-semibold tracking-tight" data-testid="grn-number">{receipt?.grn}</p>
          <p className="mt-2 text-sm text-muted-foreground">
            {poNow?.number} is now <StatusBadge status={poNow?.status ?? "received"} />. {tasks.length > 0 ? `${tasks.length} putaway task${tasks.length === 1 ? "" : "s"} created - stock becomes available once stored.` : "No putaway tasks were created."}
          </p>
          <div className="mt-5 flex flex-col justify-center gap-2 sm:flex-row">
            <LinkButton href={`/receiving/${done.receiptId}`} data-testid="view-receipt"><ClipboardCheck /> View receipt</LinkButton>
            <LinkButton href="/receiving?tab=putaway" variant="outline" data-testid="go-putaway"><PackageCheck /> Go to putaway</LinkButton>
            {poNow && <LinkButton href={`/purchase-orders/${poNow.id}`} variant="ghost">View purchase order</LinkButton>}
          </div>
        </div>
      </>
    );
  }

  if (!can("receiving.write")) {
    return (
      <>
        <PageHeader title="Receive goods" />
        <EmptyState title="Your role cannot receive goods" description="Switch to a role with receiving permission to book deliveries." action={<LinkButton href="/receiving">Back to receiving</LinkButton>} />
      </>
    );
  }

  /* ------------------------------------------------------------------ steps */
  return (
    <>
      <PageHeader title="Receive goods" description="Book a supplier delivery against a purchase order. Accepted stock lands in staging until it is put away." />
      <Section className="mb-6">
        <StepProgress steps={STEPS} current={step} />
      </Section>

      {preselected && !validPre && step === 0 && (
        <Alert className="mb-4" variant="destructive">
          <AlertTriangle />
          <AlertTitle>That purchase order cannot be received</AlertTitle>
          <AlertDescription>Only approved or partially received purchase orders can receive goods. Pick another order below.</AlertDescription>
        </Alert>
      )}

      {/* STEP 0 */}
      {step === 0 && (
        <Section title="Select a purchase order" description="Approved and partially received orders" contentClassName="p-0">
          {receivable.length === 0 ? (
            <EmptyState title="No receivable purchase orders" description="Approve a purchase order first." action={<LinkButton href="/purchase-orders">Go to purchase orders</LinkButton>} />
          ) : (
            <ul className="divide-y" data-testid="receivable-pos">
              {receivable.map((p) => {
                const selected = p.id === poId;
                return (
                  <li key={p.id}>
                    <button
                      type="button"
                      onClick={() => setPoId(p.id)}
                      aria-pressed={selected}
                      data-testid="select-po"
                      className={cn("flex w-full items-center gap-3 px-4 py-3 text-left hover:bg-muted/50", selected && "bg-primary-soft")}
                    >
                      <span className={cn("flex size-5 shrink-0 items-center justify-center rounded-full border", selected ? "border-primary bg-primary text-primary-foreground" : "border-border")}>
                        {selected && <Check className="size-3" />}
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block font-medium">{p.number} <StatusBadge status={p.status} className="ml-1" /></span>
                        <span className="block truncate text-xs text-muted-foreground">
                          {idx.suppliers.get(p.supplierId)?.name} → {idx.warehouses.get(p.warehouseId)?.name} · Due {fmt.date(p.expectedDate)}
                          {isPoOverdue(p) && <span className="ml-1 font-medium text-danger">Overdue</span>}
                        </span>
                      </span>
                      <span className="shrink-0 text-right text-xs text-muted-foreground">
                        <span className="block text-sm font-semibold tabular-nums text-foreground">{fmt.number(poOutstandingQty(p))}</span>
                        outstanding
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </Section>
      )}

      {/* STEP 1 */}
      {step === 1 && po && (
        <Section title={`Expected items - ${po.number}`} description={`${supplier?.name} → ${warehouse?.name}${staging ? ` (staging bin ${staging.code})` : ""}`} contentClassName="p-0">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[30rem] text-sm" data-testid="review-table">
              <thead className="border-b bg-muted/40 text-xs text-muted-foreground">
                <tr>
                  <th className="px-3 py-2 text-left font-medium">Product</th>
                  <th className="px-3 py-2 text-right font-medium">Ordered</th>
                  <th className="px-3 py-2 text-right font-medium">Already received</th>
                  <th className="px-3 py-2 text-right font-medium">Outstanding</th>
                </tr>
              </thead>
              <tbody>
                {po.lines.map((l) => {
                  const p = idx.products.get(l.productId);
                  return (
                    <tr key={l.id} className="border-b last:border-b-0">
                      <td className="px-3 py-2.5"><ProductCell productId={l.productId} /></td>
                      <td className="px-3 py-2.5 text-right tabular-nums">{fmt.number(l.quantity)} <span className="text-xs text-muted-foreground">{p?.uom}</span></td>
                      <td className="px-3 py-2.5 text-right tabular-nums">{fmt.number(l.receivedQty)}</td>
                      <td className="px-3 py-2.5 text-right font-medium tabular-nums">{fmt.number(poOutstanding(l))}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </Section>
      )}

      {/* STEP 2 */}
      {step === 2 && po && (
        <Section
          title="Enter received quantities"
          description="Accepted quantity goes to staging. Damaged / rejected units are recorded but not added to stock."
          actions={
            <>
              <Button variant="outline" size="sm" onClick={fillOutstanding} data-testid="fill-outstanding"><Wand2 /> Fill outstanding</Button>
              <Button variant="ghost" size="sm" onClick={clearAll}>Clear</Button>
            </>
          }
          contentClassName="p-0"
        >
          <div className="hidden grid-cols-[minmax(0,1fr)_5.5rem_8rem_8rem] gap-3 border-b bg-muted/40 px-4 py-2 text-xs font-medium text-muted-foreground md:grid">
            <span>Product</span>
            <span className="text-right">Outstanding</span>
            <span>Received *</span>
            <span>Damaged / rejected</span>
          </div>
          <ul className="divide-y" data-testid="qty-lines">
            {po.lines.map((l) => {
              const e = lineErrors[l.id];
              const cur = qty[l.id] ?? { r: "", d: "" };
              const out_ = poOutstanding(l);
              return (
                <li key={l.id} className="grid gap-3 px-4 py-3 md:grid-cols-[minmax(0,1fr)_5.5rem_8rem_8rem] md:items-start" data-testid="qty-line">
                  <ProductCell productId={l.productId} />
                  <div className="flex items-center justify-between md:block md:pt-1.5 md:text-right">
                    <span className="text-xs text-muted-foreground md:hidden">Outstanding</span>
                    <span className="text-sm font-medium tabular-nums">{fmt.number(out_)}</span>
                  </div>
                  <div>
                    <label htmlFor={`recv-${l.id}`} className="mb-1 block text-xs text-muted-foreground md:hidden">Received *</label>
                    <div className="flex gap-1">
                      <Input
                        id={`recv-${l.id}`}
                        type="number"
                        inputMode="numeric"
                        min={0}
                        step={1}
                        placeholder="0"
                        value={cur.r}
                        aria-label={`Received quantity for ${idx.products.get(l.productId)?.name}`}
                        aria-invalid={!!e?.r}
                        data-testid="received-input"
                        onChange={(ev) => setField(l.id, "r", ev.target.value)}
                      />
                      <Button type="button" variant="ghost" size="icon" title="Fill outstanding" aria-label="Fill outstanding for this line" onClick={() => setField(l.id, "r", String(out_))} disabled={out_ === 0}>
                        <Wand2 />
                      </Button>
                    </div>
                    {e?.r && <p className="mt-1 text-xs text-danger" role="alert" data-testid="error-received">{e.r}</p>}
                  </div>
                  <div>
                    <label htmlFor={`dmg-${l.id}`} className="mb-1 block text-xs text-muted-foreground md:hidden">Damaged / rejected</label>
                    <Input
                      id={`dmg-${l.id}`}
                      type="number"
                      inputMode="numeric"
                      min={0}
                      step={1}
                      placeholder="0"
                      value={cur.d}
                      aria-label={`Damaged quantity for ${idx.products.get(l.productId)?.name}`}
                      aria-invalid={!!e?.d}
                      data-testid="damaged-input"
                      onChange={(ev) => setField(l.id, "d", ev.target.value)}
                    />
                    {e?.d && <p className="mt-1 text-xs text-danger" role="alert">{e.d}</p>}
                  </div>
                </li>
              );
            })}
          </ul>
          <div className="flex flex-wrap items-center justify-between gap-2 border-t bg-muted/30 px-4 py-3 text-sm">
            <span className="text-muted-foreground">Totals</span>
            <span className="tabular-nums">
              <strong data-testid="total-received">{fmt.number(totalR)}</strong> accepted · <strong>{fmt.number(totalD)}</strong> damaged
            </span>
          </div>
          {touched && generalError && (
            <p className="border-t px-4 py-2 text-sm text-danger" role="alert" data-testid="error-quantities">{generalError}</p>
          )}
        </Section>
      )}

      {/* STEP 3 */}
      {step === 3 && po && preview && (
        <div className="space-y-4">
          <Section title="Review & confirm" description={`${po.number} · ${supplier?.name} → ${warehouse?.name}`} contentClassName="p-0">
            <div className="overflow-x-auto">
              <table className="w-full min-w-[32rem] text-sm" data-testid="confirm-table">
                <thead className="border-b bg-muted/40 text-xs text-muted-foreground">
                  <tr>
                    <th className="px-3 py-2 text-left font-medium">Product</th>
                    <th className="px-3 py-2 text-right font-medium">Accepted</th>
                    <th className="px-3 py-2 text-right font-medium">Damaged</th>
                    <th className="px-3 py-2 text-left font-medium">Goes to</th>
                    <th className="px-3 py-2 text-left font-medium">Suggested putaway</th>
                  </tr>
                </thead>
                <tbody>
                  {parsed
                    .filter((p) => p.r > 0 || p.d > 0)
                    .map((p) => {
                      const put = preview.putaway.find((x) => x.lineId === p.line.id);
                      return (
                        <tr key={p.line.id} className="border-b last:border-b-0">
                          <td className="px-3 py-2.5"><ProductCell productId={p.line.productId} /></td>
                          <td className="px-3 py-2.5 text-right font-medium tabular-nums">{fmt.number(p.r)}</td>
                          <td className={cn("px-3 py-2.5 text-right tabular-nums", p.d > 0 && "text-danger")}>{fmt.number(p.d)}</td>
                          <td className="px-3 py-2.5 font-mono text-xs">{p.r > 0 ? staging?.code : "—"}</td>
                          <td className="px-3 py-2.5 font-mono text-xs">{put ? (put.bin ? (idx.bins.get(put.bin)?.code ?? "—") : <span className="text-warning">No bin with room</span>) : "—"}</td>
                        </tr>
                      );
                    })}
                </tbody>
              </table>
            </div>
          </Section>
          <div className="grid gap-4 sm:grid-cols-3">
            <SummaryTile label="Moves to staging" value={`${fmt.number(totalR)} units`} hint={staging ? `Bin ${staging.code}` : undefined} testId="sum-staging" />
            <SummaryTile label="Putaway tasks created" value={String(preview.putaway.filter((x) => x.bin).length)} hint="Stock is not pickable until stored" testId="sum-putaway" />
            <div className="rounded-xl border bg-card p-4 shadow-card">
              <p className="text-xs text-muted-foreground">Purchase order will become</p>
              <p className="mt-1" data-testid="sum-po-status"><StatusBadge status={preview.resultStatus} /></p>
            </div>
          </div>
          {preview.putaway.some((x) => !x.bin) && (
            <Alert>
              <AlertTriangle />
              <AlertTitle>Some items have no storage bin with enough room</AlertTitle>
              <AlertDescription>No putaway task is created for those lines. Free up space or adjust bins, then move the stock out of staging manually.</AlertDescription>
            </Alert>
          )}
          <Section title="Notes">
            <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} placeholder="Delivery note number, driver, condition of goods…" aria-label="Receipt notes" />
          </Section>
        </div>
      )}

      {/* navigation */}
      <div className="mt-6 flex flex-col-reverse gap-2 sm:flex-row sm:justify-between">
        <div>
          {step > 0 && (
            <Button variant="outline" onClick={() => setStep((s) => s - 1)} disabled={pending} data-testid="wizard-back"><ArrowLeft /> Back</Button>
          )}
          {step === 0 && <LinkButton href="/receiving" variant="outline">Cancel</LinkButton>}
        </div>
        {step < 3 ? (
          <Button onClick={next} disabled={(step === 0 && !poId) || (step === 2 && touched && !quantitiesValid)} data-testid="wizard-next">
            Continue <ArrowRight />
          </Button>
        ) : (
          <Button onClick={confirm} disabled={pending || !quantitiesValid} data-testid="confirm-receipt">
            {pending ? <Loader2 className="animate-spin" /> : <PackageCheck />} Confirm receipt
          </Button>
        )}
      </div>
      {step === 1 && po && (
        <p className="mt-3 text-xs text-muted-foreground">
          Wrong order? <button type="button" className="underline" onClick={() => { setStep(0); setPoId(null); }}>Choose a different purchase order</button> or <Link href={`/purchase-orders/${po.id}`} className="underline">open {po.number}</Link>.
        </p>
      )}
    </>
  );
}

function ProductCell({ productId }: { productId: ID }) {
  const idx = useIndex();
  const p = idx.products.get(productId);
  return (
    <div className="flex min-w-0 items-center gap-2.5">
      {p && <ProductImage product={p} size={34} />}
      <div className="min-w-0">
        <p className="truncate text-sm font-medium">{p?.name ?? "—"}</p>
        <p className="truncate font-mono text-[11px] text-muted-foreground">{p?.sku}</p>
      </div>
    </div>
  );
}

function SummaryTile({ label, value, hint, testId }: { label: string; value: string; hint?: string; testId?: string }) {
  return (
    <div className="rounded-xl border bg-card p-4 shadow-card">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="mt-1 text-xl font-semibold tabular-nums" data-testid={testId}>{value}</p>
      {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
    </div>
  );
}
