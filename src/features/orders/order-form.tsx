"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { useFieldArray, useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { toast } from "sonner";
import { AlertTriangle, CheckCircle2, Loader2, Plus, Trash2, UserPlus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { PageHeader, Section } from "@/components/shared/page-header";
import { FormField, NativeSelect } from "@/components/shared/form-controls";
import { ProductSelector } from "@/components/shared/product-bits";
import { WarehouseSelector } from "@/components/shared/selectors";
import { EmptyState } from "@/components/shared/states";
import { LinkButton } from "@/components/shared/link-button";
import { useData, useFormat, useIndex, usePermission, useTx, useWarehouseScope } from "@/hooks/use-wms";
import { useSubmit } from "@/hooks/use-submit";
import { checkOrderAvailability, type OrderInput } from "@/lib/workflows/orders";
import { cn } from "@/lib/utils";
import { addDays } from "date-fns";
import { NewCustomerDialog } from "./customer-dialog";
import { PRIORITY_OPTIONS, customerAddress, defaultUnitPrice, fromDateInput, toDateInput } from "./order-utils";

const lineSchema = z.object({
  productId: z.string().min(1, "Select a product"),
  quantity: z.number({ error: "Enter a quantity" }).int("Whole numbers only").min(1, "Must be at least 1"),
  unitPrice: z.number({ error: "Enter a price" }).min(0, "Must be 0 or more"),
});

const schema = z
  .object({
    customerId: z.string().min(1, "Select a customer"),
    warehouseId: z.string().min(1, "Select a fulfilment warehouse"),
    requiredDate: z.string().min(1, "Required date is required"),
    priority: z.enum(["low", "normal", "high", "urgent"]),
    notes: z.string(),
    lines: z.array(lineSchema).min(1, "Add at least one product"),
  })
  .superRefine((v, ctx) => {
    const seen = new Set<string>();
    v.lines.forEach((l, i) => {
      if (!l.productId) return;
      if (seen.has(l.productId)) ctx.addIssue({ code: "custom", path: ["lines", i, "productId"], message: "Product is already on this order" });
      seen.add(l.productId);
    });
  });
type Values = z.infer<typeof schema>;

export function OrderForm({ editId }: { editId?: string }) {
  const router = useRouter();
  const data = useData();
  const idx = useIndex();
  const fmt = useFormat();
  const tx = useTx();
  const { can } = usePermission();
  const [scope] = useWarehouseScope();
  const { submit, pending } = useSubmit();
  const [customerOpen, setCustomerOpen] = useState(false);

  const existing = editId ? data.orders.find((o) => o.id === editId) : undefined;

  const defaults = useMemo<Values>(() => {
    if (existing) {
      return {
        customerId: existing.customerId,
        warehouseId: existing.warehouseId,
        requiredDate: toDateInput(existing.requiredDate),
        priority: existing.priority,
        notes: existing.notes,
        lines: existing.lines.map((l) => ({ productId: l.productId, quantity: l.quantity, unitPrice: l.unitPrice })),
      };
    }
    const firstActive = data.warehouses.find((w) => w.status === "active")?.id ?? "";
    return {
      customerId: "",
      warehouseId: scope !== "all" ? scope : firstActive,
      requiredDate: toDateInput(addDays(new Date(), 3)),
      priority: "normal",
      notes: "",
      lines: [{ productId: "", quantity: 1, unitPrice: 0 }],
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- defaults are captured once per mount / edited order
  }, [existing?.id]);

  const form = useForm<Values>({ resolver: zodResolver(schema), defaultValues: defaults });
  const { fields, append, remove } = useFieldArray({ control: form.control, name: "lines" });
  const { errors } = form.formState;

  const warehouseId = form.watch("warehouseId");
  const customerId = form.watch("customerId");
  const watchedLines = form.watch("lines");

  // not memoised: RHF mutates the watched array in place, so its identity is not a reliable dependency
  const availabilityRows = warehouseId
    ? checkOrderAvailability(
        data,
        warehouseId,
        (watchedLines ?? []).filter((l) => l.productId).map((l) => ({ productId: l.productId, quantity: Number.isFinite(l.quantity) ? l.quantity : 0 })),
      )
    : [];
  const availability = new Map(availabilityRows.map((r) => [r.productId, r]));

  const shortLines = (watchedLines ?? []).filter((l) => l.productId && availability.get(l.productId)?.ok === false).length;
  const grandTotal = (watchedLines ?? []).reduce((s, l) => s + (Number.isFinite(l.quantity) && Number.isFinite(l.unitPrice) ? l.quantity * l.unitPrice : 0), 0);
  const customer = customerId ? idx.customers.get(customerId) : undefined;
  const customers = useMemo(() => [...data.customers].sort((a, b) => a.name.localeCompare(b.name)), [data.customers]);

  if (!can("orders.write")) {
    return (
      <>
        <PageHeader title="New order" />
        <EmptyState title="You do not have permission to manage orders" description="Switch to a role with order permissions from the profile menu." action={<LinkButton href="/orders" variant="outline">Back to orders</LinkButton>} />
      </>
    );
  }
  if (editId && !existing) {
    return <EmptyState title="Order not found" action={<LinkButton href="/orders" variant="outline">Back to orders</LinkButton>} />;
  }
  if (existing && existing.status !== "draft") {
    return (
      <EmptyState
        title={`${existing.number} can no longer be edited`}
        description="Only draft orders can be edited."
        action={<LinkButton href={`/orders/${existing.id}`} variant="outline">View order</LinkButton>}
      />
    );
  }

  const save = (mode: "draft" | "confirm") =>
    form.handleSubmit(async (v) => {
      if (mode === "confirm" && shortLines > 0) {
        toast.error("Some lines exceed available stock. Reduce the quantities or save as a draft.");
        return;
      }
      const input: OrderInput = {
        customerId: v.customerId,
        warehouseId: v.warehouseId,
        requiredDate: fromDateInput(v.requiredDate),
        priority: v.priority,
        notes: v.notes,
        lines: v.lines,
      };
      const res = await submit(() => {
        let id = editId ?? "";
        if (editId) {
          const u = tx.updateOrder(editId, input);
          if (!u.ok) return u;
        } else {
          const c = tx.createOrder(input);
          if (!c.ok) return c;
          id = c.value;
        }
        let confirmError: string | null = null;
        if (mode === "confirm") {
          const c = tx.confirmOrder(id);
          if (!c.ok) confirmError = c.error;
        }
        return { ok: true as const, value: { id, confirmError } };
      });
      if (!res?.ok) return;
      if (res.value.confirmError) {
        toast.error(`Saved as draft - not confirmed: ${res.value.confirmError}`);
      } else {
        toast.success(mode === "confirm" ? "Order confirmed - stock reserved and pick tasks created" : "Draft saved");
      }
      router.push(`/orders/${res.value.id}`);
    })();

  return (
    <>
      <PageHeader
        title={existing ? `Edit ${existing.number}` : "New customer order"}
        description="Choose a customer and fulfilment warehouse, add products and check live stock availability."
      />
      <form id="order-form" noValidate onSubmit={(e) => e.preventDefault()} className="grid gap-4 lg:grid-cols-3" data-testid="order-form">
        <Section title="Order details" className="lg:col-span-1 lg:self-start" contentClassName="space-y-4">
          <FormField id="customerId" label="Customer" required error={errors.customerId?.message}>
            <div className="flex gap-2">
              <NativeSelect
                id="customerId"
                value={customerId}
                onChange={(e) => form.setValue("customerId", e.target.value, { shouldValidate: true, shouldDirty: true })}
                invalid={!!errors.customerId}
                placeholder="Select a customer…"
                options={customers.map((c) => ({ value: c.id, label: c.name }))}
                className="min-w-0 flex-1"
              />
              <Button type="button" variant="outline" size="icon" onClick={() => setCustomerOpen(true)} aria-label="New customer" title="New customer" data-testid="new-customer">
                <UserPlus />
              </Button>
            </div>
            {customer && (
              <p className="text-xs text-muted-foreground" data-testid="customer-info">
                {customer.contactPerson} · {customer.phone}
                <br />
                {customerAddress(customer)}
              </p>
            )}
          </FormField>
          <FormField id="warehouseId" label="Fulfilment warehouse" required error={errors.warehouseId?.message}>
            <WarehouseSelector
              id="warehouseId"
              value={warehouseId}
              onChange={(v) => form.setValue("warehouseId", v, { shouldValidate: true, shouldDirty: true })}
              invalid={!!errors.warehouseId}
              placeholder="Select a warehouse…"
            />
          </FormField>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-1 xl:grid-cols-2">
            <FormField id="requiredDate" label="Required date" required error={errors.requiredDate?.message}>
              <Input id="requiredDate" type="date" {...form.register("requiredDate")} aria-invalid={!!errors.requiredDate} />
            </FormField>
            <FormField id="priority" label="Priority" required error={errors.priority?.message}>
              <NativeSelect id="priority" {...form.register("priority")} options={PRIORITY_OPTIONS.map((p) => ({ value: p.value, label: p.label }))} />
            </FormField>
          </div>
          <FormField id="notes" label="Notes" hint="Delivery instructions or internal remarks.">
            <Textarea id="notes" rows={3} {...form.register("notes")} />
          </FormField>
        </Section>

        <Section
          title="Order lines"
          description="Availability reflects pickable stock in the chosen warehouse (excludes reserved and blocked units)."
          className="min-w-0 lg:col-span-2"
          actions={
            <Button type="button" variant="outline" size="sm" onClick={() => append({ productId: "", quantity: 1, unitPrice: 0 })} data-testid="add-line">
              <Plus /> Add product
            </Button>
          }
        >
          <div className="hidden gap-3 pb-1 text-xs font-medium text-muted-foreground md:grid md:grid-cols-[minmax(0,2fr)_5.5rem_8rem_8rem_2rem]">
            <span>Product</span>
            <span>Quantity</span>
            <span>Unit price</span>
            <span className="text-right">Line total</span>
            <span />
          </div>
          <ul className="space-y-3" data-testid="order-lines">
            {fields.map((field, i) => {
              const line = watchedLines?.[i];
              const pid = line?.productId ?? "";
              const avail = pid ? availability.get(pid) : undefined;
              const lineErr = errors.lines?.[i];
              const total = line && Number.isFinite(line.quantity) && Number.isFinite(line.unitPrice) ? line.quantity * line.unitPrice : 0;
              return (
                <li key={field.id} className="rounded-lg border p-3 md:border-0 md:p-0" data-testid="order-line">
                  <div className="grid gap-3 md:grid-cols-[minmax(0,2fr)_5.5rem_8rem_8rem_2rem] md:items-start">
                    <div className="min-w-0 space-y-1">
                      <span className="text-xs text-muted-foreground md:hidden">Product</span>
                      <ProductSelector
                        id={`lines.${i}.productId`}
                        value={pid}
                        stockWarehouseId={warehouseId || undefined}
                        excludeIds={(watchedLines ?? []).map((l) => l.productId).filter(Boolean)}
                        onChange={(id) => {
                          form.setValue(`lines.${i}.productId`, id, { shouldValidate: true, shouldDirty: true });
                          const p = idx.products.get(id);
                          if (p) form.setValue(`lines.${i}.unitPrice`, defaultUnitPrice(p), { shouldValidate: true });
                        }}
                      />
                      {lineErr?.productId && <p className="text-xs text-danger" role="alert">{lineErr.productId.message}</p>}
                    </div>
                    <div className="space-y-1">
                      <span className="text-xs text-muted-foreground md:hidden">Quantity</span>
                      <Input
                        type="number"
                        min={1}
                        inputMode="numeric"
                        aria-label={`Quantity for line ${i + 1}`}
                        data-testid="line-qty"
                        aria-invalid={!!lineErr?.quantity || avail?.ok === false}
                        {...form.register(`lines.${i}.quantity`, { valueAsNumber: true })}
                      />
                      {lineErr?.quantity && <p className="text-xs text-danger" role="alert">{lineErr.quantity.message}</p>}
                    </div>
                    <div className="space-y-1">
                      <span className="text-xs text-muted-foreground md:hidden">Unit price</span>
                      <Input
                        type="number"
                        min={0}
                        step="any"
                        inputMode="decimal"
                        aria-label={`Unit price for line ${i + 1}`}
                        aria-invalid={!!lineErr?.unitPrice}
                        {...form.register(`lines.${i}.unitPrice`, { valueAsNumber: true })}
                      />
                      {lineErr?.unitPrice && <p className="text-xs text-danger" role="alert">{lineErr.unitPrice.message}</p>}
                    </div>
                    <div className="flex items-center justify-between gap-2 md:justify-end md:pt-1.5">
                      <span className="text-xs text-muted-foreground md:hidden">Line total</span>
                      <span className="text-sm font-medium tabular-nums" data-testid="line-total">{fmt.money(total)}</span>
                    </div>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon-sm"
                      onClick={() => remove(i)}
                      disabled={fields.length === 1}
                      aria-label={`Remove line ${i + 1}`}
                      className="justify-self-end text-muted-foreground hover:text-danger"
                    >
                      <Trash2 />
                    </Button>
                  </div>
                  {pid && warehouseId && avail && (
                    <p
                      className={cn("mt-1.5 flex items-center gap-1.5 text-xs", avail.ok ? "text-success" : "font-medium text-danger")}
                      data-testid="line-availability"
                      data-ok={avail.ok}
                      role={avail.ok ? undefined : "alert"}
                    >
                      {avail.ok ? <CheckCircle2 className="size-3.5" /> : <AlertTriangle className="size-3.5" />}
                      {avail.ok
                        ? `${fmt.number(avail.available)} available`
                        : `Only ${fmt.number(avail.available)} available - ${fmt.number(avail.requested - avail.available)} short`}
                    </p>
                  )}
                </li>
              );
            })}
          </ul>
          {errors.lines?.message && <p className="mt-2 text-xs text-danger" role="alert">{errors.lines.message}</p>}
          {errors.lines?.root?.message && <p className="mt-2 text-xs text-danger" role="alert">{errors.lines.root.message}</p>}

          <div className="mt-4 flex items-center justify-between border-t pt-3">
            <span className="text-sm text-muted-foreground">Order total</span>
            <span className="text-lg font-semibold tabular-nums" data-testid="order-total">{fmt.money(grandTotal)}</span>
          </div>

          {shortLines > 0 && (
            <div className="mt-3 flex items-start gap-2 rounded-lg border border-danger/30 bg-danger-soft p-3 text-sm text-danger" role="alert" data-testid="availability-warning">
              <AlertTriangle className="mt-0.5 size-4 shrink-0" />
              <p>
                {shortLines} line{shortLines === 1 ? " exceeds" : "s exceed"} available stock. You can save this order as a draft, but it cannot be confirmed until stock is available.
              </p>
            </div>
          )}

          <div className="mt-4 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <Link href={existing ? `/orders/${existing.id}` : "/orders"} className="inline-flex h-8 items-center justify-center rounded-lg border px-2.5 text-sm font-medium hover:bg-muted">
              Cancel
            </Link>
            <Button type="button" variant="outline" onClick={() => void save("draft")} disabled={pending} data-testid="save-draft">
              {pending && <Loader2 className="animate-spin" />} Save draft
            </Button>
            <Button
              type="button"
              onClick={() => void save("confirm")}
              disabled={pending || shortLines > 0}
              title={shortLines > 0 ? "Insufficient stock for one or more lines" : "Create the order and reserve stock"}
              data-testid="confirm-order"
            >
              {pending && <Loader2 className="animate-spin" />} Save &amp; confirm
            </Button>
          </div>
        </Section>
      </form>
      <NewCustomerDialog
        open={customerOpen}
        onOpenChange={setCustomerOpen}
        onCreated={(id) => form.setValue("customerId", id, { shouldValidate: true, shouldDirty: true })}
      />
    </>
  );
}
