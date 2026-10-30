"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useMemo, useRef, useState } from "react";
import { Controller, useFieldArray, useForm, useWatch } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Loader2, Plus, Save, ShieldCheck, Trash2 } from "lucide-react";
import type { ID, Result } from "@/types";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { PageHeader, Section } from "@/components/shared/page-header";
import { FormField, NativeSelect } from "@/components/shared/form-controls";
import { ProductImage, ProductSelector } from "@/components/shared/product-bits";
import { LinkButton } from "@/components/shared/link-button";
import { EmptyState } from "@/components/shared/states";
import { useData, useFormat, useIndex, usePermission, useTx, useWarehouseScope } from "@/hooks/use-wms";
import { useSubmit } from "@/hooks/use-submit";
import { availableInWarehouse } from "@/lib/inventory/selectors";
import { cn } from "@/lib/utils";
import { fromDateInput, todayPlusDays, toDateInput } from "./helpers";

const lineSchema = z.object({
  productId: z.string().min(1, "Select a product"),
  quantity: z
    .number({ error: "Enter a quantity" })
    .int("Whole numbers only")
    .min(1, "Must be at least 1"),
  unitCost: z.number({ error: "Enter a unit cost" }).min(0, "Cannot be negative"),
});

const schema = z
  .object({
    supplierId: z.string().min(1, "Select a supplier"),
    warehouseId: z.string().min(1, "Select a destination warehouse"),
    expectedDate: z.string().min(1, "Expected delivery date is required"),
    notes: z.string(),
    lines: z.array(lineSchema).min(1, "Add at least one product"),
  })
  .superRefine((v, ctx) => {
    const seen = new Set<string>();
    v.lines.forEach((l, i) => {
      if (l.productId && seen.has(l.productId)) {
        ctx.addIssue({ code: "custom", path: ["lines", i, "productId"], message: "This product is already on the order" });
      }
      seen.add(l.productId);
    });
  });

type Values = z.infer<typeof schema>;

export function PurchaseOrderForm({ poId }: { poId?: ID }) {
  const router = useRouter();
  const params = useSearchParams();
  const data = useData();
  const idx = useIndex();
  const fmt = useFormat();
  const tx = useTx();
  const { can } = usePermission();
  const [scope] = useWarehouseScope();
  const { submit, pending } = useSubmit();
  // once a draft exists (even if approving it failed) later submits update it instead of duplicating
  const savedId = useRef<ID | undefined>(poId);

  const existing = poId ? data.purchaseOrders.find((p) => p.id === poId) : undefined;
  // the status when the page was opened - approving from this form must not flash the "not editable" state
  const [wasDraft] = useState(existing?.status === "draft");

  const defaults = useMemo<Values>(() => {
    if (existing) {
      return {
        supplierId: existing.supplierId,
        warehouseId: existing.warehouseId,
        expectedDate: toDateInput(existing.expectedDate),
        notes: existing.notes,
        lines: existing.lines.map((l) => ({ productId: l.productId, quantity: l.quantity, unitCost: l.unitCost })),
      };
    }
    const qProduct = params.get("product");
    const product = qProduct ? idx.products.get(qProduct) : undefined;
    const qSupplier = params.get("supplier");
    const supplier =
      (qSupplier && idx.suppliers.get(qSupplier)?.status === "active" ? qSupplier : "") ||
      (product?.preferredSupplierId && idx.suppliers.get(product.preferredSupplierId)?.status === "active" ? product.preferredSupplierId : "");
    const qWarehouse = params.get("warehouse");
    const activeWh = data.warehouses.filter((w) => w.status === "active");
    const warehouseId =
      (qWarehouse && activeWh.some((w) => w.id === qWarehouse) ? qWarehouse : "") ||
      (scope !== "all" && activeWh.some((w) => w.id === scope) ? scope : "") ||
      (activeWh[0]?.id ?? "");
    const lead = supplier ? (idx.suppliers.get(supplier)?.leadTimeDays ?? 7) : 7;
    const lines: Values["lines"] = [];
    if (product) {
      const qtyParam = Number(params.get("qty"));
      const suggested = Math.max(1, product.reorderLevel * 2 - availableInWarehouse(data, product.id, warehouseId));
      lines.push({
        productId: product.id,
        quantity: Number.isInteger(qtyParam) && qtyParam > 0 ? qtyParam : suggested,
        unitCost: product.unitCost,
      });
    }
    return { supplierId: supplier, warehouseId, expectedDate: todayPlusDays(lead), notes: "", lines };
    // defaults are computed once per mount
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const form = useForm<Values>({ resolver: zodResolver(schema), defaultValues: defaults });
  const { control, register, formState } = form;
  const { errors } = formState;
  const { fields, append, remove } = useFieldArray({ control, name: "lines" });
  const lines = useWatch({ control, name: "lines" }) ?? [];
  const total = lines.reduce((s, l) => s + (Number(l.quantity) || 0) * (Number(l.unitCost) || 0), 0);

  if (poId && !existing) {
    return <EmptyState title="Purchase order not found" description="It may have been removed." action={<LinkButton href="/purchase-orders">Back to purchase orders</LinkButton>} />;
  }
  if (existing && !wasDraft) {
    return (
      <EmptyState
        title="Only draft purchase orders can be edited"
        description={`${existing.number} is already ${existing.status.replace("_", " ")}.`}
        action={<LinkButton href={`/purchase-orders/${existing.id}`}>View purchase order</LinkButton>}
      />
    );
  }

  const activeSuppliers = data.suppliers.filter((s) => s.status === "active");
  const activeWarehouses = data.warehouses.filter((w) => w.status === "active");

  async function save(values: Values, approve: boolean) {
    const input = {
      supplierId: values.supplierId,
      warehouseId: values.warehouseId,
      expectedDate: fromDateInput(values.expectedDate),
      notes: values.notes,
      lines: values.lines,
    };
    const res = await submit(
      (): Result<ID> => {
        let id = savedId.current;
        if (id) {
          const u = tx.updatePurchaseOrder(id, input);
          if (!u.ok) return u;
        } else {
          const c = tx.createPurchaseOrder(input);
          if (!c.ok) return c;
          id = c.value;
          savedId.current = id;
        }
        if (approve) {
          const a = tx.approvePurchaseOrder(id);
          if (!a.ok) return a;
        }
        return { ok: true, value: id };
      },
      { success: approve ? "Purchase order saved and approved" : "Draft saved" },
    );
    if (res?.ok) router.push(`/purchase-orders/${res.value}`);
  }

  // `save` only touches savedId.current inside the async submit handler, never while rendering
  /* eslint-disable react-hooks/refs */
  const onDraft = form.handleSubmit((v) => save(v, false));
  const onApprove = form.handleSubmit((v) => save(v, true));
  /* eslint-enable react-hooks/refs */
  const lineErrors = errors.lines;

  return (
    <>
      <PageHeader
        title={poId ? `Edit ${existing?.number}` : "New purchase order"}
        description={poId ? "Update the draft, then save or approve it." : "Nothing is created until you save. Approving makes the order ready to receive."}
      />
      <form onSubmit={onDraft} noValidate className="space-y-6" data-testid="po-form">
        <Section title="Order details">
          <div className="grid gap-4 md:grid-cols-3">
            <FormField id="supplierId" label="Supplier" required error={errors.supplierId?.message}>
              <Controller
                control={control}
                name="supplierId"
                render={({ field }) => (
                  <NativeSelect
                    id="supplierId"
                    value={field.value}
                    invalid={!!errors.supplierId}
                    placeholder="Select supplier…"
                    options={activeSuppliers.map((s) => ({ value: s.id, label: s.name }))}
                    onChange={(e) => {
                      field.onChange(e.target.value);
                      const s = idx.suppliers.get(e.target.value);
                      if (s && !formState.dirtyFields.expectedDate) {
                        form.setValue("expectedDate", todayPlusDays(s.leadTimeDays));
                      }
                    }}
                  />
                )}
              />
            </FormField>
            <FormField id="warehouseId" label="Destination warehouse" required error={errors.warehouseId?.message}>
              <NativeSelect
                id="warehouseId"
                invalid={!!errors.warehouseId}
                placeholder="Select warehouse…"
                options={activeWarehouses.map((w) => ({ value: w.id, label: `${w.name} (${w.code})` }))}
                {...register("warehouseId")}
              />
            </FormField>
            <FormField id="expectedDate" label="Expected delivery date" required error={errors.expectedDate?.message}>
              <Input id="expectedDate" type="date" aria-invalid={!!errors.expectedDate} {...register("expectedDate")} />
            </FormField>
            <FormField id="notes" label="Notes" className="md:col-span-3">
              <Textarea id="notes" rows={2} placeholder="Delivery instructions, payment terms, references…" {...register("notes")} />
            </FormField>
          </div>
        </Section>

        <Section
          title="Products"
          description="Unit cost defaults to the standard cost."
          actions={
            <div className="w-56 sm:w-72">
              <ProductSelector
                id="add-product"
                value=""
                placeholder="Add a product…"
                excludeIds={lines.map((l) => l.productId)}
                onChange={(pid) => {
                  const p = idx.products.get(pid);
                  if (p) append({ productId: p.id, quantity: Math.max(1, p.reorderLevel), unitCost: p.unitCost });
                }}
              />
            </div>
          }
          contentClassName="p-0"
        >
          {fields.length === 0 ? (
            <div className="p-4">
              <EmptyState icon={Plus} title="No products yet" description="Use “Add a product…” above to build the order." className="py-8" />
              {typeof lineErrors?.message === "string" && (
                <p className="text-center text-xs text-danger" role="alert" data-testid="error-lines">
                  {lineErrors.message}
                </p>
              )}
              {lineErrors?.root?.message && (
                <p className="text-center text-xs text-danger" role="alert" data-testid="error-lines">
                  {lineErrors.root.message}
                </p>
              )}
            </div>
          ) : (
            <div data-testid="po-lines">
              <div className="hidden grid-cols-[minmax(0,1fr)_7rem_9rem_9rem_2.5rem] gap-3 border-b bg-muted/40 px-4 py-2 text-xs font-medium text-muted-foreground md:grid">
                <span>Product</span>
                <span>Quantity *</span>
                <span>Unit cost *</span>
                <span className="text-right">Line total</span>
                <span />
              </div>
              <ul className="divide-y">
                {fields.map((f, i) => {
                  const product = idx.products.get(lines[i]?.productId ?? f.productId);
                  const lt = (Number(lines[i]?.quantity) || 0) * (Number(lines[i]?.unitCost) || 0);
                  const le = Array.isArray(lineErrors) ? lineErrors[i] : undefined;
                  return (
                    <li key={f.id} className="grid gap-3 px-4 py-3 md:grid-cols-[minmax(0,1fr)_7rem_9rem_9rem_2.5rem] md:items-start" data-testid="po-line">
                      <div className="flex min-w-0 items-center gap-2.5">
                        {product && <ProductImage product={product} size={36} />}
                        <div className="min-w-0">
                          <p className="truncate text-sm font-medium">{product?.name ?? "Unknown product"}</p>
                          <p className="truncate font-mono text-[11px] text-muted-foreground">{product?.sku} · {product?.uom}</p>
                          {le?.productId?.message && <p className="text-xs text-danger" role="alert">{le.productId.message}</p>}
                        </div>
                      </div>
                      <div>
                        <label htmlFor={`qty-${i}`} className="mb-1 block text-xs text-muted-foreground md:hidden">Quantity *</label>
                        <Input
                          id={`qty-${i}`}
                          type="number"
                          inputMode="numeric"
                          min={1}
                          step={1}
                          aria-label={`Quantity for ${product?.name ?? "product"}`}
                          aria-invalid={!!le?.quantity}
                          data-testid="line-qty"
                          {...register(`lines.${i}.quantity`, { valueAsNumber: true })}
                        />
                        {le?.quantity?.message && <p className="mt-1 text-xs text-danger" role="alert" data-testid="error-line-qty">{le.quantity.message}</p>}
                      </div>
                      <div>
                        <label htmlFor={`cost-${i}`} className="mb-1 block text-xs text-muted-foreground md:hidden">Unit cost *</label>
                        <Input
                          id={`cost-${i}`}
                          type="number"
                          inputMode="decimal"
                          min={0}
                          step="0.01"
                          aria-label={`Unit cost for ${product?.name ?? "product"}`}
                          aria-invalid={!!le?.unitCost}
                          data-testid="line-cost"
                          {...register(`lines.${i}.unitCost`, { valueAsNumber: true })}
                        />
                        {le?.unitCost?.message && <p className="mt-1 text-xs text-danger" role="alert">{le.unitCost.message}</p>}
                      </div>
                      <div className="flex items-center justify-between gap-2 md:justify-end md:pt-1.5">
                        <span className="text-xs text-muted-foreground md:hidden">Line total</span>
                        <span className="text-sm font-semibold tabular-nums" data-testid="line-total">{fmt.money(lt)}</span>
                      </div>
                      <div className="flex justify-end">
                        <Button type="button" variant="ghost" size="icon" aria-label={`Remove ${product?.name ?? "line"}`} onClick={() => remove(i)} data-testid="remove-line">
                          <Trash2 className="text-danger" />
                        </Button>
                      </div>
                    </li>
                  );
                })}
              </ul>
            </div>
          )}
          <div className={cn("flex items-center justify-between gap-3 border-t bg-muted/30 px-4 py-3 text-sm", fields.length === 0 && "hidden")}>
            <span className="text-muted-foreground">{fields.length} line{fields.length === 1 ? "" : "s"} · {lines.reduce((s, l) => s + (Number(l.quantity) || 0), 0)} units</span>
            <span className="text-base font-semibold tabular-nums">
              Grand total: <span data-testid="grand-total">{fmt.money(total)}</span>
            </span>
          </div>
        </Section>

        <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <LinkButton href={poId ? `/purchase-orders/${poId}` : "/purchase-orders"} variant="outline">Cancel</LinkButton>
          <Button type="submit" variant="secondary" disabled={pending || !can("po.write")} data-testid="save-draft">
            {pending ? <Loader2 className="animate-spin" /> : <Save />} Save draft
          </Button>
          <Button
            type="button"
            onClick={onApprove}
            disabled={pending || !can("po.write") || !can("po.approve")}
            title={!can("po.approve") ? "Your role cannot approve purchase orders" : undefined}
            data-testid="save-approve"
          >
            {pending ? <Loader2 className="animate-spin" /> : <ShieldCheck />} Save &amp; approve
          </Button>
        </div>
        {!can("po.write") && (
          <p className="text-right text-xs text-muted-foreground">
            Your role cannot create purchase orders. <Link href="/purchase-orders" className="underline">Back to list</Link>
          </p>
        )}
      </form>
    </>
  );
}
