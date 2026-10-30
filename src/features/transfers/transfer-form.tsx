"use client";

import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import { Controller, useFieldArray, useForm, useWatch } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { ArrowRight, Loader2, Plus, Save, Send, Trash2 } from "lucide-react";
import type { ID, Result, WmsData } from "@/types";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { PageHeader, Section } from "@/components/shared/page-header";
import { FormField, NativeSelect } from "@/components/shared/form-controls";
import { EmptyState } from "@/components/shared/states";
import { LinkButton } from "@/components/shared/link-button";
import { ProductImage, ProductSelector } from "@/components/shared/product-bits";
import { WarehouseSelector } from "@/components/shared/selectors";
import { useData, useIndex, usePermission, useTx, useWarehouseScope } from "@/hooks/use-wms";
import { useSubmit } from "@/hooks/use-submit";
import { availableInWarehouse, binFree, stockRecordAvailable, storageBinsFor } from "@/lib/inventory/selectors";
import { cn } from "@/lib/utils";
import { TRANSFER_TYPE_LABEL } from "./helpers";

const lineSchema = z.object({
  productId: z.string().min(1, "Select a product"),
  quantity: z.number({ error: "Enter a quantity" }).int("Whole numbers only").min(1, "Must be at least 1"),
  fromBinId: z.string(),
  toBinId: z.string(),
});

const schema = z.object({
  fromWarehouseId: z.string().min(1, "Select the source warehouse"),
  toWarehouseId: z.string().min(1, "Select the destination warehouse"),
  notes: z.string(),
  lines: z.array(lineSchema).min(1, "Add at least one product"),
});
type Values = z.infer<typeof schema>;
type Line = Values["lines"][number];

interface LineProblems {
  qty?: string;
  fromBin?: string;
  toBin?: string;
}

/** Availability / capacity checks shared by the live hints and the submit validation. */
function lineProblems(d: WmsData, v: Pick<Values, "fromWarehouseId" | "toWarehouseId" | "lines">, i: number): LineProblems {
  const out: LineProblems = {};
  const l = v.lines[i];
  if (!l || !v.fromWarehouseId || !v.toWarehouseId) return out;
  const wh = d.warehouses.find((w) => w.id === v.fromWarehouseId);
  const qty = Number(l.quantity);
  const valid = Number.isInteger(qty) && qty > 0;
  const internal = v.fromWarehouseId === v.toWarehouseId;
  if (!internal) {
    if (!valid) return out;
    const sameProduct = v.lines.filter((x) => x.productId === l.productId);
    const requested = sameProduct.reduce((s, x) => s + (Number(x.quantity) || 0), 0);
    const avail = availableInWarehouse(d, l.productId, v.fromWarehouseId);
    if (requested > avail) out.qty = `Only ${avail} available at ${wh?.name ?? "the source warehouse"}${sameProduct.length > 1 ? ` (${requested} requested in total)` : ""}`;
    return out;
  }
  if (!l.fromBinId) out.fromBin = "Select the source bin";
  if (!l.toBinId) out.toBin = "Select the destination bin";
  if (l.fromBinId && l.toBinId && l.fromBinId === l.toBinId) out.toBin = "Must differ from the source bin";
  if (l.fromBinId && valid) {
    const bin = d.bins.find((b) => b.id === l.fromBinId);
    const rec = d.stock.find((r) => r.productId === l.productId && r.binId === l.fromBinId);
    const avail = rec ? stockRecordAvailable(rec, bin) : 0;
    const requested = v.lines.reduce((s, x) => (x.productId === l.productId && x.fromBinId === l.fromBinId ? s + (Number(x.quantity) || 0) : s), 0);
    if (requested > avail) out.qty = `Only ${avail} available at ${bin?.code ?? "that bin"}${requested !== qty ? ` (${requested} requested in total)` : ""}`;
  }
  if (l.toBinId && l.toBinId !== l.fromBinId && valid) {
    const free = binFree(d, l.toBinId);
    if (qty > free && !out.toBin) out.toBin = `${d.bins.find((b) => b.id === l.toBinId)?.code ?? "Bin"} only has room for ${free} more units`;
  }
  return out;
}

export function TransferForm({ transferId }: { transferId?: ID }) {
  const router = useRouter();
  const data = useData();
  const idx = useIndex();
  const tx = useTx();
  const { can } = usePermission();
  const [scope] = useWarehouseScope();
  const { submit, pending } = useSubmit();
  const savedId = useRef<ID | undefined>(transferId);
  const dataRef = useRef(data);
  useEffect(() => {
    dataRef.current = data;
  }, [data]);

  const existing = transferId ? data.transfers.find((t) => t.id === transferId) : undefined;
  const [wasDraft] = useState(existing?.status === "draft");

  const defaults = useMemo<Values>(() => {
    if (existing) {
      return {
        fromWarehouseId: existing.fromWarehouseId,
        toWarehouseId: existing.toWarehouseId,
        notes: existing.notes,
        lines: existing.lines.map((l) => ({ productId: l.productId, quantity: l.quantity, fromBinId: l.fromBinId ?? "", toBinId: l.toBinId ?? "" })),
      };
    }
    const active = data.warehouses.filter((w) => w.status === "active");
    const from = scope !== "all" && active.some((w) => w.id === scope) ? scope : (active[0]?.id ?? "");
    const to = active.find((w) => w.id !== from)?.id ?? "";
    return { fromWarehouseId: from, toWarehouseId: to, notes: "", lines: [] };
    // computed once per mount
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // dataRef is read lazily inside the validator (on submit/change), not while rendering
  /* eslint-disable react-hooks/refs */
  const resolver = useMemo(
    () =>
      zodResolver(
        schema.superRefine((v, ctx) => {
          const internal = v.fromWarehouseId === v.toWarehouseId;
          const seen = new Set<string>();
          v.lines.forEach((l, i) => {
            const key = internal ? `${l.productId}|${l.fromBinId}` : l.productId;
            if (l.productId && seen.has(key)) {
              ctx.addIssue({ code: "custom", path: ["lines", i, "productId"], message: internal ? "Already listed for this bin" : "This product is already on the transfer" });
            }
            seen.add(key);
            const p = lineProblems(dataRef.current, v, i);
            if (p.qty) ctx.addIssue({ code: "custom", path: ["lines", i, "quantity"], message: p.qty });
            if (p.fromBin) ctx.addIssue({ code: "custom", path: ["lines", i, "fromBinId"], message: p.fromBin });
            if (p.toBin) ctx.addIssue({ code: "custom", path: ["lines", i, "toBinId"], message: p.toBin });
          });
        }),
      ),
    [],
  );
  /* eslint-enable react-hooks/refs */

  const form = useForm<Values>({ resolver, defaultValues: defaults });
  const { control, register, formState, setValue } = form;
  const { errors } = formState;
  const { fields, append, remove } = useFieldArray({ control, name: "lines" });
  const watched = useWatch({ control });
  const lines: Line[] = (watched.lines as Line[] | undefined) ?? [];
  const fromWh = watched.fromWarehouseId ?? "";
  const toWh = watched.toWarehouseId ?? "";
  const internal = !!fromWh && fromWh === toWh;
  const typeLabel = fromWh && toWh ? TRANSFER_TYPE_LABEL[internal ? "internal" : "inter_warehouse"] : null;

  const live = useMemo(
    () => lines.map((_, i) => lineProblems(data, { fromWarehouseId: fromWh, toWarehouseId: toWh, lines }, i)),
    [data, fromWh, toWh, lines],
  );

  if (transferId && !existing) {
    return <EmptyState title="Transfer not found" action={<LinkButton href="/transfers">Back to transfers</LinkButton>} />;
  }
  if (existing && !wasDraft) {
    return (
      <EmptyState
        title="Only draft transfers can be edited"
        description={`${existing.number} is already ${existing.status.replace("_", " ")}.`}
        action={<LinkButton href={`/transfers/${existing.id}`}>View transfer</LinkButton>}
      />
    );
  }

  const lineErrors = errors.lines;
  const rootLinesError = typeof lineErrors?.message === "string" ? lineErrors.message : lineErrors?.root?.message;

  function resetBins() {
    lines.forEach((_, i) => {
      setValue(`lines.${i}.fromBinId`, "");
      setValue(`lines.${i}.toBinId`, "");
    });
  }

  async function save(v: Values, mode: "draft" | "submit") {
    const input = {
      fromWarehouseId: v.fromWarehouseId,
      toWarehouseId: v.toWarehouseId,
      notes: v.notes,
      lines: v.lines.map((l) => ({
        productId: l.productId,
        quantity: l.quantity,
        fromBinId: v.fromWarehouseId === v.toWarehouseId ? l.fromBinId : null,
        toBinId: v.fromWarehouseId === v.toWarehouseId ? l.toBinId : null,
      })),
    };
    const res = await submit(
      (): Result<ID> => {
        if (savedId.current) {
          const id = savedId.current;
          const u = tx.updateTransfer(id, input);
          if (!u.ok) return u;
          if (mode === "submit") {
            const s = tx.submitTransfer(id);
            if (!s.ok) return s;
          }
          return { ok: true, value: id };
        }
        const c = tx.createTransfer(input, mode);
        if (c.ok) savedId.current = c.value;
        return c;
      },
      {
        success: mode === "draft" ? "Transfer saved as draft" : internal ? "Bin-to-bin transfer completed" : "Transfer submitted for approval",
      },
    );
    if (res?.ok) router.push(`/transfers/${res.value}`);
  }
  // `save` only touches savedId.current inside the async submit handler, never while rendering
  /* eslint-disable react-hooks/refs */
  const onDraft = form.handleSubmit((v) => save(v, "draft"));
  const onSubmit = form.handleSubmit((v) => save(v, "submit"));
  /* eslint-enable react-hooks/refs */

  const whOptionsDisabled = !can("transfers.write");

  return (
    <>
      <PageHeader
        title={transferId ? `Edit ${existing?.number}` : "New stock transfer"}
        description="Same source and destination warehouse moves stock bin-to-bin instantly. Different warehouses create an inter-warehouse transfer that needs approval."
      />
      <form onSubmit={onDraft} noValidate className="space-y-6" data-testid="transfer-form">
        <Section title="Route" actions={typeLabel ? <span className="rounded-full bg-primary-soft px-2 py-0.5 text-xs font-medium text-primary" data-testid="transfer-type">{typeLabel}</span> : undefined}>
          <div className="grid gap-4 md:grid-cols-[1fr_auto_1fr] md:items-start">
            <FormField id="fromWarehouseId" label="Source warehouse" required error={errors.fromWarehouseId?.message}>
              <Controller
                control={control}
                name="fromWarehouseId"
                render={({ field }) => (
                  <WarehouseSelector
                    id="fromWarehouseId"
                    value={field.value}
                    invalid={!!errors.fromWarehouseId}
                    placeholder="Select source…"
                    onChange={(v) => {
                      field.onChange(v);
                      resetBins();
                    }}
                  />
                )}
              />
            </FormField>
            <ArrowRight className="mt-7 hidden size-5 text-muted-foreground md:block" aria-hidden />
            <FormField id="toWarehouseId" label="Destination warehouse" required error={errors.toWarehouseId?.message}>
              <Controller
                control={control}
                name="toWarehouseId"
                render={({ field }) => (
                  <WarehouseSelector
                    id="toWarehouseId"
                    value={field.value}
                    invalid={!!errors.toWarehouseId}
                    placeholder="Select destination…"
                    onChange={(v) => {
                      field.onChange(v);
                      resetBins();
                    }}
                  />
                )}
              />
            </FormField>
            <FormField id="notes" label="Notes" className="md:col-span-3">
              <Textarea id="notes" rows={2} placeholder="Reason for the transfer, handling instructions…" {...register("notes")} />
            </FormField>
          </div>
        </Section>

        <Section
          title="Products"
          description={
            fromWh
              ? internal
                ? "Choose the product, quantity, and the bins to move it between."
                : "Quantities are checked against stock available at the source warehouse."
              : "Select the source warehouse first."
          }
          actions={
            <div className="w-56 sm:w-72">
              <ProductSelector
                id="add-product"
                value=""
                placeholder="Add a product…"
                disabled={!fromWh}
                stockWarehouseId={fromWh || undefined}
                excludeIds={internal ? [] : lines.map((l) => l.productId)}
                onChange={(pid) => append({ productId: pid, quantity: 1, fromBinId: "", toBinId: "" })}
              />
            </div>
          }
          contentClassName="p-0"
        >
          {fields.length === 0 ? (
            <div className="p-4">
              <EmptyState icon={Plus} title="No products yet" description="Use “Add a product…” to choose what to move." className="py-8" />
              {rootLinesError && <p className="text-center text-xs text-danger" role="alert" data-testid="error-lines">{rootLinesError}</p>}
            </div>
          ) : (
            <ul className="divide-y" data-testid="transfer-lines">
              {fields.map((f, i) => {
                const l = lines[i] ?? f;
                const product = idx.products.get(l.productId);
                const le = Array.isArray(lineErrors) ? lineErrors[i] : undefined;
                const prob = live[i] ?? {};
                const qtyMsg = prob.qty ?? le?.quantity?.message;
                const fromMsg = prob.fromBin ?? le?.fromBinId?.message;
                const toMsg = prob.toBin ?? le?.toBinId?.message;
                const availSource = fromWh ? availableInWarehouse(data, l.productId, fromWh) : 0;
                const fromBins = internal
                  ? storageBinsFor(data, fromWh)
                      .map((b) => {
                        const rec = data.stock.find((r) => r.productId === l.productId && r.binId === b.id);
                        return { b, avail: rec ? stockRecordAvailable(rec, b) : 0 };
                      })
                      .filter((x) => x.avail > 0)
                  : [];
                const toBins = internal ? storageBinsFor(data, toWh) : [];
                return (
                  <li
                    key={f.id}
                    className={cn("grid gap-3 px-4 py-3 md:items-start", internal ? "md:grid-cols-[minmax(0,1.2fr)_6.5rem_minmax(0,1fr)_minmax(0,1fr)_2.5rem]" : "md:grid-cols-[minmax(0,1fr)_8rem_2.5rem]")}
                    data-testid="transfer-line"
                  >
                    <div className="flex min-w-0 items-center gap-2.5">
                      {product && <ProductImage product={product} size={36} />}
                      <div className="min-w-0">
                        <p className="truncate text-sm font-medium">{product?.name}</p>
                        <p className="truncate text-xs text-muted-foreground">
                          <span className="font-mono">{product?.sku}</span> · <span data-testid="line-available">{availSource}</span> available at source
                        </p>
                        {le?.productId?.message && <p className="text-xs text-danger" role="alert">{le.productId.message}</p>}
                      </div>
                    </div>
                    <div>
                      <label htmlFor={`tqty-${i}`} className="mb-1 block text-xs text-muted-foreground md:hidden">Quantity *</label>
                      <Input
                        id={`tqty-${i}`}
                        type="number"
                        inputMode="numeric"
                        min={1}
                        step={1}
                        aria-label={`Quantity for ${product?.name ?? "product"}`}
                        aria-invalid={!!qtyMsg}
                        data-testid="line-qty"
                        {...register(`lines.${i}.quantity`, { valueAsNumber: true })}
                      />
                      {qtyMsg && <p className="mt-1 text-xs text-danger" role="alert" data-testid="error-line-qty">{qtyMsg}</p>}
                    </div>
                    {internal && (
                      <>
                        <div>
                          <label htmlFor={`tfrom-${i}`} className="mb-1 block text-xs text-muted-foreground md:hidden">From bin *</label>
                          <NativeSelect
                            id={`tfrom-${i}`}
                            aria-label={`From bin for ${product?.name ?? "product"}`}
                            invalid={!!fromMsg}
                            placeholder={fromBins.length ? "From bin…" : "No stock in any bin"}
                            options={fromBins.map((x) => ({ value: x.b.id, label: `${x.b.code} · ${x.avail} avail.` }))}
                            data-testid="from-bin"
                            {...register(`lines.${i}.fromBinId`)}
                          />
                          {fromMsg && <p className="mt-1 text-xs text-danger" role="alert">{fromMsg}</p>}
                        </div>
                        <div>
                          <label htmlFor={`tto-${i}`} className="mb-1 block text-xs text-muted-foreground md:hidden">To bin *</label>
                          <NativeSelect
                            id={`tto-${i}`}
                            aria-label={`To bin for ${product?.name ?? "product"}`}
                            invalid={!!toMsg}
                            placeholder="To bin…"
                            options={toBins.map((b) => ({ value: b.id, label: `${b.code} · ${binFree(data, b.id)} free`, disabled: b.id === l.fromBinId }))}
                            data-testid="to-bin"
                            {...register(`lines.${i}.toBinId`)}
                          />
                          {toMsg && <p className="mt-1 text-xs text-danger" role="alert">{toMsg}</p>}
                        </div>
                      </>
                    )}
                    <div className="flex justify-end">
                      <Button type="button" variant="ghost" size="icon" aria-label={`Remove ${product?.name ?? "line"}`} onClick={() => remove(i)} data-testid="remove-line">
                        <Trash2 className="text-danger" />
                      </Button>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
          {fields.length > 0 && (
            <div className="flex items-center justify-between border-t bg-muted/30 px-4 py-3 text-sm text-muted-foreground">
              <span>{fields.length} line{fields.length === 1 ? "" : "s"}</span>
              <span>
                <strong className="text-foreground tabular-nums" data-testid="total-units">{lines.reduce((s, l) => s + (Number(l.quantity) || 0), 0)}</strong> units to move
              </span>
            </div>
          )}
        </Section>

        <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <LinkButton href={transferId ? `/transfers/${transferId}` : "/transfers"} variant="outline">Cancel</LinkButton>
          <Button type="submit" variant="secondary" disabled={pending || whOptionsDisabled} data-testid="save-draft" title={whOptionsDisabled ? "Your role cannot create transfers" : undefined}>
            {pending ? <Loader2 className="animate-spin" /> : <Save />} Save draft
          </Button>
          <Button type="button" onClick={onSubmit} disabled={pending || whOptionsDisabled} data-testid="submit-transfer" title={whOptionsDisabled ? "Your role cannot create transfers" : undefined}>
            {pending ? <Loader2 className="animate-spin" /> : <Send />} {internal ? "Submit & move now" : "Submit for approval"}
          </Button>
        </div>
      </form>
    </>
  );
}
