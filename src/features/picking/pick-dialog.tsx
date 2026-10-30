"use client";

import { useMemo } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Loader2, MapPin } from "lucide-react";
import type { Bin, Product, SalesOrder, WarehouseTask } from "@/types";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { FormField } from "@/components/shared/form-controls";
import { ProductImage } from "@/components/shared/product-bits";
import { useFormat, useTx } from "@/hooks/use-wms";
import { useSubmit } from "@/hooks/use-submit";
import { ScanField, sameCode } from "./scan-field";

export interface PickRow {
  task: WarehouseTask;
  order: SalesOrder;
  customerName: string;
  product: Product;
  bin: Bin | undefined;
  zoneCode: string;
  assigneeName: string;
  required: number;
  picked: number;
}

type Values = { productScan: string; binScan: string; pickedQty: number };

export function PickDialog({ row, onOpenChange }: { row: PickRow | null; onOpenChange: (open: boolean) => void }) {
  return (
    <Dialog open={!!row} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[92dvh] overflow-y-auto sm:max-w-lg" data-testid="pick-dialog">
        {row && <PickForm key={row.task.id} row={row} onClose={() => onOpenChange(false)} />}
      </DialogContent>
    </Dialog>
  );
}

function PickForm({ row, onClose }: { row: PickRow; onClose: () => void }) {
  const tx = useTx();
  const fmt = useFormat();
  const { submit, pending } = useSubmit();
  const { product, bin, required } = row;

  const schema = useMemo(
    () =>
      z
        .object({
          productScan: z
            .string()
            .trim()
            .min(1, "Scan the product barcode")
            .refine((v) => sameCode(v, product.barcode), "Scanned barcode does not match this product"),
          binScan: z
            .string()
            .trim()
            .min(1, "Scan the bin location")
            .refine((v) => !bin || sameCode(v, bin.code), "Scanned location does not match the pick bin"),
          pickedQty: z.number({ error: "Enter the picked quantity" }).int("Whole numbers only").min(0, "Cannot be negative"),
        })
        .superRefine((v, ctx) => {
          if (v.pickedQty > required) ctx.addIssue({ code: "custom", path: ["pickedQty"], message: `Over-pick: this task requires exactly ${required}.` });
          else if (v.pickedQty < required) ctx.addIssue({ code: "custom", path: ["pickedQty"], message: `Short pick: ${required - v.pickedQty} more unit(s) are required. Report a shortage instead.` });
        }),
    [product.barcode, bin, required],
  );

  const form = useForm<Values>({ resolver: zodResolver(schema), defaultValues: { productScan: "", binScan: "", pickedQty: required } });
  const { errors } = form.formState;
  const productScan = form.watch("productScan");
  const binScan = form.watch("binScan");
  const qty = form.watch("pickedQty");

  const onSubmit = form.handleSubmit(async (v) => {
    const res = await submit(() => tx.confirmPick({ taskId: row.task.id, pickedQty: v.pickedQty }), {
      success: (all) => (all ? `Pick confirmed - ${row.order.number} is fully picked and ready for packing` : "Pick confirmed"),
    });
    if (res?.ok) onClose();
  });

  return (
    <form onSubmit={onSubmit} noValidate className="space-y-4">
      <DialogHeader>
        <DialogTitle>Pick {product.name}</DialogTitle>
        <DialogDescription>
          {row.order.number} · {row.customerName}
        </DialogDescription>
      </DialogHeader>

      <div className="flex items-center gap-3 rounded-lg border bg-muted/30 p-3">
        <ProductImage product={product} size={48} />
        <div className="min-w-0 flex-1">
          <p className="truncate font-medium">{product.name}</p>
          <p className="font-mono text-xs text-muted-foreground">{product.sku}</p>
          <p className="mt-1 flex items-center gap-1 text-sm">
            <MapPin className="size-3.5 text-primary" />
            <span className="font-mono font-medium" data-testid="pick-bin">{bin?.code ?? "—"}</span>
            <span className="text-muted-foreground">· Zone {row.zoneCode}</span>
          </p>
        </div>
        <div className="text-right">
          <p className="text-xs text-muted-foreground">Required</p>
          <p className="text-2xl font-semibold tabular-nums" data-testid="pick-required">{fmt.number(required)}</p>
        </div>
      </div>

      <ScanField
        id="productScan"
        label="Scan product barcode"
        expected={product.barcode}
        value={productScan}
        onChange={(v) => form.setValue("productScan", v, { shouldValidate: form.formState.isSubmitted })}
        error={errors.productScan?.message}
        hint={`Barcode ${product.barcode}`}
        testId="scan-product"
      />
      <ScanField
        id="binScan"
        label="Scan bin location"
        expected={bin?.code ?? ""}
        value={binScan}
        onChange={(v) => form.setValue("binScan", v, { shouldValidate: form.formState.isSubmitted })}
        error={errors.binScan?.message}
        hint={bin ? `Bin ${bin.code}` : undefined}
        testId="scan-bin"
      />
      <FormField id="pickedQty" label="Picked quantity" required error={errors.pickedQty?.message} hint={`Must equal ${required} (no over- or short picks).`}>
        <Input
          id="pickedQty"
          type="number"
          min={0}
          inputMode="numeric"
          className="h-10 text-base"
          aria-invalid={!!errors.pickedQty}
          data-testid="picked-qty"
          {...form.register("pickedQty", { valueAsNumber: true })}
        />
      </FormField>
      {Number.isFinite(qty) && qty !== required && !errors.pickedQty && (
        <p className="text-xs text-warning">Quantity differs from the required {required}.</p>
      )}

      <DialogFooter>
        <Button type="button" variant="outline" onClick={onClose} disabled={pending} className="h-10">
          Cancel
        </Button>
        <Button type="submit" disabled={pending} className="h-10" data-testid="confirm-pick">
          {pending && <Loader2 className="animate-spin" />} Confirm pick
        </Button>
      </DialogFooter>
    </form>
  );
}
