"use client";

import { useMemo } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useFieldArray, useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Info, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { PageHeader, Section } from "@/components/shared/page-header";
import { FormField, NativeSelect } from "@/components/shared/form-controls";
import { EmptyState } from "@/components/shared/states";
import { LinkButton } from "@/components/shared/link-button";
import { ProductImage } from "@/components/shared/product-bits";
import { useData, useFormat, useIndex, usePermission, useTx } from "@/hooks/use-wms";
import { useSubmit } from "@/hooks/use-submit";
import { RETURN_REASONS } from "@/lib/constants";
import { returnableQty } from "@/lib/workflows/returns";

const lineSchema = z.object({
  productId: z.string(),
  max: z.number(),
  quantity: z.number({ error: "Enter a quantity" }).int("Whole numbers only").min(0, "Cannot be negative"),
  reason: z.string(),
});
const schema = z
  .object({
    orderId: z.string().min(1, "Select the original order"),
    reason: z.string().min(1, "Select a return reason"),
    comment: z.string(),
    lines: z.array(lineSchema),
  })
  .superRefine((v, ctx) => {
    let any = false;
    v.lines.forEach((l, i) => {
      if (l.quantity > l.max) ctx.addIssue({ code: "custom", path: ["lines", i, "quantity"], message: `At most ${l.max} unit(s) can still be returned` });
      if (l.quantity > 0) any = true;
    });
    if (v.orderId && !any) ctx.addIssue({ code: "custom", path: ["lines"], message: "Enter a return quantity for at least one product" });
  });
type Values = z.infer<typeof schema>;

export function ReturnForm() {
  const data = useData();
  const idx = useIndex();
  const fmt = useFormat();
  const tx = useTx();
  const router = useRouter();
  const params = useSearchParams();
  const { can } = usePermission();
  const { submit, pending } = useSubmit();

  const eligible = useMemo(
    () =>
      data.orders
        .filter((o) => o.status === "dispatched")
        .filter((o) => [...returnableQty(data, o.id).values()].some((q) => q > 0))
        .sort((a, b) => b.orderDate.localeCompare(a.orderDate)),
    [data],
  );

  const buildLines = (orderId: string): Values["lines"] => {
    const order = data.orders.find((o) => o.id === orderId);
    if (!order) return [];
    const allowed = returnableQty(data, orderId);
    const seen = new Set<string>();
    const out: Values["lines"] = [];
    for (const l of order.lines) {
      if (seen.has(l.productId)) continue;
      seen.add(l.productId);
      out.push({ productId: l.productId, max: allowed.get(l.productId) ?? 0, quantity: 0, reason: RETURN_REASONS[0] });
    }
    return out;
  };

  const preselect = params.get("order") ?? "";
  const initialOrder = eligible.some((o) => o.id === preselect) ? preselect : "";
  const form = useForm<Values>({
    resolver: zodResolver(schema),
    defaultValues: { orderId: initialOrder, reason: "", comment: "", lines: initialOrder ? buildLines(initialOrder) : [] },
  });
  const { fields, replace } = useFieldArray({ control: form.control, name: "lines" });
  const { errors } = form.formState;
  const orderId = form.watch("orderId");
  const order = data.orders.find((o) => o.id === orderId);
  const watchedLines = form.watch("lines");

  if (!can("returns.write")) {
    return (
      <>
        <PageHeader title="New return" />
        <EmptyState title="You do not have permission to register returns" action={<LinkButton href="/returns" variant="outline">Back to returns</LinkButton>} />
      </>
    );
  }

  const onSubmit = form.handleSubmit(async (v) => {
    const reason = v.comment.trim() ? `${v.reason}: ${v.comment.trim()}` : v.reason;
    const res = await submit(
      () => tx.createReturn({ orderId: v.orderId, reason, lines: v.lines.filter((l) => l.quantity > 0).map((l) => ({ productId: l.productId, quantity: l.quantity, reason: l.reason })) }),
      { success: "Return registered" },
    );
    if (res?.ok) router.push(`/returns/${res.value}`);
  });

  return (
    <>
      <PageHeader title="Register return" description="Create an RMA against a dispatched customer order." />
      <form onSubmit={onSubmit} noValidate className="grid gap-4 lg:grid-cols-3" data-testid="return-form">
        <Section title="Original order" className="lg:self-start" contentClassName="space-y-4">
          <FormField id="orderId" label="Dispatched order" required error={errors.orderId?.message}>
            <NativeSelect
              id="orderId"
              value={orderId}
              onChange={(e) => {
                form.setValue("orderId", e.target.value, { shouldValidate: form.formState.isSubmitted });
                replace(e.target.value ? buildLines(e.target.value) : []);
              }}
              placeholder="Select a dispatched order…"
              options={eligible.map((o) => ({ value: o.id, label: `${o.number} - ${idx.customers.get(o.customerId)?.name ?? ""}` }))}
              invalid={!!errors.orderId}
            />
          </FormField>
          {order && (
            <p className="text-xs text-muted-foreground" data-testid="return-order-info">
              {idx.customers.get(order.customerId)?.name} · {idx.warehouses.get(order.warehouseId)?.name} · ordered {fmt.date(order.orderDate)}
            </p>
          )}
          <FormField id="reason" label="Return reason" required error={errors.reason?.message}>
            <NativeSelect id="reason" {...form.register("reason")} placeholder="Select a reason…" options={RETURN_REASONS.map((r) => ({ value: r, label: r }))} invalid={!!errors.reason} />
          </FormField>
          <FormField id="comment" label="Comments" hint="Optional details for the inspection team.">
            <Textarea id="comment" rows={3} {...form.register("comment")} />
          </FormField>
          <p className="flex items-start gap-2 rounded-lg bg-info-soft p-2.5 text-xs text-info">
            <Info className="mt-0.5 size-3.5 shrink-0" />
            Registering a return does not change stock. Units enter the Returns &amp; Inspection area only when they are received, and become sellable only after approval.
          </p>
        </Section>

        <Section title="Products to return" description="Return quantities cannot exceed the returnable quantity." className="lg:col-span-2">
          {!order ? (
            <p className="py-6 text-center text-sm text-muted-foreground">Select an order to see its products.</p>
          ) : (
            <ul className="space-y-3" data-testid="return-lines">
              {fields.map((f, i) => {
                const p = idx.products.get(f.productId);
                const max = watchedLines?.[i]?.max ?? 0;
                const lineErr = errors.lines?.[i];
                const ordered = order.lines.filter((l) => l.productId === f.productId).reduce((s, l) => s + l.quantity, 0);
                return (
                  <li key={f.id} className="rounded-lg border p-3" data-testid="return-line">
                    <div className="flex items-center gap-3">
                      {p && <ProductImage product={p} size={40} />}
                      <div className="min-w-0 flex-1">
                        <p className="truncate font-medium">{p?.name}</p>
                        <p className="font-mono text-[11px] text-muted-foreground">{p?.sku}</p>
                      </div>
                      <div className="text-right text-xs text-muted-foreground">
                        <p>Ordered {ordered}</p>
                        <p className="font-medium text-foreground" data-testid="returnable-qty">Returnable {max}</p>
                      </div>
                    </div>
                    <div className="mt-3 grid gap-3 sm:grid-cols-[7rem_minmax(0,1fr)]">
                      <div className="space-y-1">
                        <label htmlFor={`qty-${i}`} className="text-xs font-medium">Return qty</label>
                        <Input
                          id={`qty-${i}`}
                          type="number"
                          min={0}
                          max={max}
                          inputMode="numeric"
                          disabled={max === 0}
                          aria-invalid={!!lineErr?.quantity}
                          data-testid="return-qty"
                          {...form.register(`lines.${i}.quantity`, { valueAsNumber: true })}
                        />
                        {lineErr?.quantity && <p className="text-xs text-danger" role="alert">{lineErr.quantity.message}</p>}
                      </div>
                      <div className="space-y-1">
                        <label htmlFor={`lr-${i}`} className="text-xs font-medium">Reason for this product</label>
                        <NativeSelect id={`lr-${i}`} {...form.register(`lines.${i}.reason`)} options={RETURN_REASONS.map((r) => ({ value: r, label: r }))} />
                      </div>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
          {errors.lines?.message && <p className="mt-2 text-xs text-danger" role="alert">{errors.lines.message}</p>}
          {errors.lines?.root?.message && <p className="mt-2 text-xs text-danger" role="alert">{errors.lines.root.message}</p>}
          <div className="mt-4 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <LinkButton href="/returns" variant="outline">Cancel</LinkButton>
            <Button type="submit" disabled={pending || !order} data-testid="submit-return">
              {pending && <Loader2 className="animate-spin" />} Register return
            </Button>
          </div>
        </Section>
      </form>
    </>
  );
}
