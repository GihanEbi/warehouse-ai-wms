"use client";

import { useEffect, useMemo, useState } from "react";
import { useForm, useWatch } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import type { ID } from "@/types";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { FormDialog } from "@/components/shared/dialogs";
import { FormField, NativeSelect } from "@/components/shared/form-controls";
import { ProductSelector } from "@/components/shared/product-bits";
import { WarehouseSelector } from "@/components/shared/selectors";
import { useData, useIndex, useSettings, useTx } from "@/hooks/use-wms";
import { useSubmit } from "@/hooks/use-submit";
import { ADJUSTMENT_REASONS } from "@/lib/constants";
import { binFree, indexData } from "@/lib/inventory/selectors";
import type { WmsData } from "@/types";
import { ADJUSTMENT_TYPE_LABELS, type AdjustmentType } from "@/lib/workflows/inventory";
import { cn } from "@/lib/utils";

const TYPES = Object.keys(ADJUSTMENT_TYPE_LABELS) as AdjustmentType[];

/** What the chosen bin currently holds for the chosen product. */
interface BinContext {
  onHand: number;
  reserved: number;
  blocked: number;
  pickable: boolean;
  free: number;
  code: string;
}

interface Values {
  productId: string;
  warehouseId: string;
  binId: string;
  type: AdjustmentType;
  quantity: number;
  reason: string;
  note: string;
  confirm: boolean;
}

/** Change in on-hand an adjustment would cause (0 for block / unblock). */
export function adjustmentDelta(type: AdjustmentType, qty: number, onHand: number): number {
  if (!Number.isFinite(qty)) return 0;
  switch (type) {
    case "increase":
      return qty;
    case "decrease":
      return -qty;
    case "set_count":
      return qty - onHand;
    default:
      return 0;
  }
}

function getCtx(data: WmsData, productId: string, binId: string): BinContext | null {
  const bin = indexData(data).bins.get(binId);
  if (!bin || !productId) return null;
  const rec = data.stock.find((r) => r.productId === productId && r.binId === binId);
  return {
    onHand: rec?.onHand ?? 0,
    reserved: rec?.reserved ?? 0,
    blocked: rec?.blocked ?? 0,
    pickable: bin.type === "storage",
    free: binFree(data, binId),
    code: bin.code,
  };
}

function makeSchema(ctx: BinContext | null, threshold: number, reasonRequired: boolean) {
  return z
    .object({
      productId: z.string().min(1, "Select a product"),
      warehouseId: z.string().min(1, "Select a warehouse"),
      binId: z.string().min(1, "Select a storage location"),
      type: z.enum(["increase", "decrease", "set_count", "block", "unblock"]),
      quantity: z.number({ error: "Enter a whole number" }).int("Whole numbers only").min(0, "Quantity cannot be negative"),
      reason: reasonRequired ? z.string().min(1, "Select a reason") : z.string(),
      note: z.string().trim(),
      confirm: z.boolean().refine((v) => v, "Please confirm to apply this adjustment"),
    })
    .superRefine((v, c) => {
      const err = (path: keyof Values, message: string) => c.addIssue({ code: "custom", path: [path], message });
      if (v.type !== "set_count" && v.quantity < 1) err("quantity", "Enter a quantity of at least 1");
      if (!ctx) return;
      const free = ctx.onHand - ctx.reserved - ctx.blocked;
      const unreservedLimit = ctx.pickable ? free : ctx.onHand;
      if (v.type === "decrease") {
        if (v.quantity > ctx.onHand) err("quantity", `Only ${ctx.onHand} on hand at ${ctx.code} — stock cannot go negative`);
        else if (v.quantity > unreservedLimit) err("quantity", `Only ${Math.max(0, free)} unreserved units can be removed (${ctx.reserved} reserved, ${ctx.blocked} blocked)`);
      }
      if (v.type === "set_count" && ctx.pickable && v.quantity < ctx.reserved + ctx.blocked) {
        err("quantity", `Counted quantity cannot be below reserved + blocked (${ctx.reserved + ctx.blocked})`);
      }
      if (v.type === "block") {
        if (!ctx.pickable) err("type", "Only storage locations can have blocked stock");
        else if (v.quantity > free) err("quantity", `Only ${Math.max(0, free)} available units can be blocked`);
      }
      if (v.type === "unblock" && v.quantity > ctx.blocked) err("quantity", `Only ${ctx.blocked} blocked units at ${ctx.code}`);
      const delta = adjustmentDelta(v.type, v.quantity, ctx.onHand);
      if (v.type === "set_count" && delta === 0 && v.quantity >= 0) err("quantity", "Counted quantity matches the system quantity — nothing to adjust");
      if (delta > ctx.free) err("quantity", `${ctx.code} only has room for ${ctx.free} more units`);
      if (Math.abs(delta) > threshold && v.note.length < 10) {
        err("note", `Adjustments larger than ${threshold} units need a note (min. 10 characters)`);
      }
    });
}

export interface AdjustInitial {
  productId?: ID;
  warehouseId?: ID;
  binId?: ID;
  type?: AdjustmentType;
}

export function AdjustStockDialog({
  open,
  onOpenChange,
  initial,
  defaultWarehouseId,
  onSuccess,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  initial?: AdjustInitial;
  defaultWarehouseId?: ID | "all";
  onSuccess?: (productId: ID) => void;
}) {
  const data = useData();
  const idx = useIndex();
  const settings = useSettings();
  const tx = useTx();
  const { submit, pending } = useSubmit();
  const [serverError, setServerError] = useState("");

  const form = useForm<Values>({
    resolver: (values, context, options) =>
      zodResolver(makeSchema(getCtx(data, values.productId, values.binId), settings.largeAdjustmentThreshold, settings.adjustmentReasonRequired))(values, context, options),
    defaultValues: blankValues(initial, defaultWarehouseId),
    mode: "onChange",
  });

  const [productId, warehouseId, binId, type, quantity] = useWatch({
    control: form.control,
    name: ["productId", "warehouseId", "binId", "type", "quantity"],
  });

  // reset whenever the dialog opens
  useEffect(() => {
    if (open) {
      form.reset(blankValues(initial, defaultWarehouseId));
      setServerError("");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- reset only when (re)opened
  }, [open]);

  const bins = useMemo(
    () =>
      data.bins
        .filter((b) => b.warehouseId === warehouseId)
        .sort((a, b) => (a.type === b.type ? a.code.localeCompare(b.code) : a.type === "storage" ? -1 : b.type === "storage" ? 1 : a.type.localeCompare(b.type))),
    [data.bins, warehouseId],
  );

  const binOptions = useMemo(
    () =>
      bins.map((b) => {
        const rec = data.stock.find((r) => r.productId === productId && r.binId === b.id);
        const suffix = b.type === "storage" ? "" : b.type === "staging" ? " · staging" : " · returns";
        return { value: b.id, label: `${b.code}${suffix}${productId ? ` — ${rec?.onHand ?? 0} on hand` : ""}` };
      }),
    [bins, data.stock, productId],
  );

  // pick a sensible bin when product/warehouse change and the current one is invalid
  useEffect(() => {
    if (!open || !warehouseId) return;
    if (bins.some((b) => b.id === binId)) return;
    const withStock = data.stock
      .filter((r) => r.productId === productId && r.warehouseId === warehouseId && bins.some((b) => b.id === r.binId) && idx.bins.get(r.binId)?.type === "storage")
      .sort((a, b) => b.onHand - a.onHand)[0];
    form.setValue("binId", withStock?.binId ?? bins.find((b) => b.type === "storage")?.id ?? "", { shouldValidate: false });
  }, [open, bins, binId, productId, warehouseId, data.stock, idx.bins, form]);

  const ctx = useMemo(() => getCtx(data, productId, binId), [data, productId, binId]);

  // re-validate when the context the rules depend on changes
  useEffect(() => {
    if (open && form.formState.isSubmitted) void form.trigger();
  }, [ctx, type, quantity, open, form]);

  const qty = Number.isFinite(quantity) ? quantity : 0;
  const delta = ctx ? adjustmentDelta(type, qty, ctx.onHand) : 0;
  const newOnHand = ctx ? ctx.onHand + delta : 0;
  const newBlocked = ctx ? ctx.blocked + (type === "block" ? qty : type === "unblock" ? -qty : 0) : 0;
  const negative = newOnHand < 0;
  const errors = form.formState.errors;

  const onSubmit = form.handleSubmit(async (v) => {
    setServerError("");
    const res = await submit(
      () =>
        tx.adjustStock({
          productId: v.productId,
          binId: v.binId,
          type: v.type,
          quantity: v.quantity,
          reason: v.reason,
          note: v.note || undefined,
        }),
      {
        success: `Stock adjusted — ${ADJUSTMENT_TYPE_LABELS[v.type]}: ${idx.products.get(v.productId)?.name ?? "product"}`,
      },
    );
    if (res?.ok) {
      onOpenChange(false);
      onSuccess?.(v.productId);
    }
    else if (res) setServerError(res.error);
  });

  return (
    <FormDialog
      open={open}
      onOpenChange={onOpenChange}
      title="Adjust Stock"
      description="Record a manual stock change. Every adjustment writes a stock movement and cannot take stock below zero."
      submitLabel="Apply adjustment"
      pending={pending}
      onSubmit={onSubmit}
      testId="adjust-stock-dialog"
      size="lg"
    >
      <div className="grid gap-4 sm:grid-cols-2">
        <FormField id="adj-product" label="Product" required error={errors.productId?.message}>
          <ProductSelector
            id="adj-product"
            value={productId}
            onChange={(id) => {
              form.setValue("productId", id, { shouldValidate: true });
              form.setValue("binId", "");
            }}
            stockWarehouseId={warehouseId || undefined}
          />
        </FormField>
        <FormField id="adj-warehouse" label="Warehouse" required error={errors.warehouseId?.message}>
          <WarehouseSelector
            id="adj-warehouse"
            value={warehouseId}
            placeholder="Select a warehouse"
            onChange={(v) => {
              form.setValue("warehouseId", v, { shouldValidate: true });
              form.setValue("binId", "");
            }}
          />
        </FormField>
        <FormField id="adj-bin" label="Storage location" required error={errors.binId?.message} className="sm:col-span-2">
          <NativeSelect id="adj-bin" placeholder="Select a location" options={binOptions} invalid={!!errors.binId} {...form.register("binId")} />
        </FormField>
      </div>

      {ctx && (
        <dl className="grid grid-cols-2 gap-2 rounded-lg border bg-muted/40 p-3 text-xs sm:grid-cols-4" data-testid="adjust-current">
          <Stat label="On hand" value={ctx.onHand} />
          <Stat label="Reserved" value={ctx.reserved} />
          <Stat label="Blocked" value={ctx.blocked} />
          <Stat label="Available" value={ctx.pickable ? Math.max(0, ctx.onHand - ctx.reserved - ctx.blocked) : 0} />
        </dl>
      )}

      <div className="grid gap-4 sm:grid-cols-2">
        <FormField id="adj-type" label="Adjustment type" required error={errors.type?.message}>
          <NativeSelect id="adj-type" options={TYPES.map((t) => ({ value: t, label: ADJUSTMENT_TYPE_LABELS[t] }))} {...form.register("type")} />
        </FormField>
        <FormField
          id="adj-qty"
          label={type === "set_count" ? "Counted quantity" : "Quantity"}
          required
          error={errors.quantity?.message}
          hint={type === "set_count" ? "The physical quantity you counted in this location." : undefined}
        >
          <Input id="adj-qty" type="number" inputMode="numeric" min={0} step={1} aria-invalid={!!errors.quantity} {...form.register("quantity", { valueAsNumber: true })} />
        </FormField>
        <FormField id="adj-reason" label="Reason" required={settings.adjustmentReasonRequired} error={errors.reason?.message}>
          <NativeSelect id="adj-reason" placeholder="Select a reason" options={ADJUSTMENT_REASONS.map((r) => ({ value: r, label: r }))} {...form.register("reason")} />
        </FormField>
        <FormField id="adj-note" label="Note" error={errors.note?.message} hint={`Required (10+ characters) when an adjustment is larger than ${settings.largeAdjustmentThreshold} units.`}>
          <Textarea id="adj-note" rows={2} aria-invalid={!!errors.note} {...form.register("note")} />
        </FormField>
      </div>

      {ctx && (
        <div
          className={cn("rounded-lg border px-3 py-2 text-sm", negative ? "border-danger/40 bg-danger-soft text-danger" : "bg-card")}
          data-testid="adjust-preview"
          aria-live="polite"
        >
          <p>
            New on-hand: <strong className="tabular-nums">{newOnHand}</strong>
            {delta !== 0 && (
              <span className="text-muted-foreground">
                {" "}
                ({delta > 0 ? "+" : "−"}
                {Math.abs(delta)})
              </span>
            )}
            {(type === "block" || type === "unblock") && (
              <span className="text-muted-foreground">
                {" "}
                · blocked {ctx.blocked} → <strong className="tabular-nums text-foreground">{Math.max(0, newBlocked)}</strong>
              </span>
            )}
          </p>
          {negative && <p className="text-xs">This would make stock negative, which is not allowed.</p>}
        </div>
      )}

      {serverError && (
        <p className="rounded-lg border border-danger/40 bg-danger-soft px-3 py-2 text-sm text-danger" role="alert" data-testid="adjust-error">
          {serverError}
        </p>
      )}

      <div className="space-y-1.5">
        <div className="flex items-start gap-2">
          <Checkbox
            id="adj-confirm"
            data-testid="adjust-confirm"
            checked={form.watch("confirm")}
            onCheckedChange={(c) => form.setValue("confirm", c === true, { shouldValidate: true })}
            aria-invalid={!!errors.confirm}
            className="mt-0.5"
          />
          <Label htmlFor="adj-confirm" className="text-sm leading-snug font-normal">
            I confirm this adjustment will change stock records
          </Label>
        </div>
        {errors.confirm && (
          <p className="text-xs text-danger" role="alert" data-testid="error-adj-confirm">
            {errors.confirm.message}
          </p>
        )}
      </div>
    </FormDialog>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div>
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="text-base font-semibold tabular-nums">{value}</dd>
    </div>
  );
}

function blankValues(initial?: AdjustInitial, defaultWarehouseId?: ID | "all"): Values {
  return {
    productId: initial?.productId ?? "",
    warehouseId: initial?.warehouseId ?? (defaultWarehouseId && defaultWarehouseId !== "all" ? defaultWarehouseId : ""),
    binId: initial?.binId ?? "",
    type: initial?.type ?? "increase",
    quantity: 1,
    reason: "",
    note: "",
    confirm: false,
  };
}
