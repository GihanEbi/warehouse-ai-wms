"use client";

import { useEffect } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import type { Rack, Warehouse, Zone } from "@/types";
import { Input } from "@/components/ui/input";
import { FormDialog } from "@/components/shared/dialogs";
import { FormField } from "@/components/shared/form-controls";
import { useData, useTx } from "@/hooks/use-wms";
import { useSubmit } from "@/hooks/use-submit";

/* ------------------------------------------------------------------- zone */

const zoneSchema = z.object({
  code: z
    .string()
    .trim()
    .min(1, "Zone code is required")
    .max(6, "Use at most 6 characters")
    .regex(/^[A-Za-z0-9]+$/, "Letters and numbers only"),
  name: z.string().trim().min(2, "Zone name is required"),
});
type ZoneValues = z.infer<typeof zoneSchema>;

export function AddZoneDialog({ open, onOpenChange, warehouse }: { open: boolean; onOpenChange: (o: boolean) => void; warehouse: Warehouse }) {
  const data = useData();
  const tx = useTx();
  const { submit, pending } = useSubmit();
  const form = useForm<ZoneValues>({ resolver: zodResolver(zoneSchema), defaultValues: { code: "", name: "" } });
  const errors = form.formState.errors;

  useEffect(() => {
    if (open) form.reset({ code: "", name: "" });
  }, [open, form]);

  const onSubmit = form.handleSubmit(async (v) => {
    const code = v.code.trim().toUpperCase();
    if (data.zones.some((z) => z.warehouseId === warehouse.id && z.code === code)) {
      form.setError("code", { message: `Zone ${code} already exists in ${warehouse.code}` });
      return;
    }
    const res = await submit(() => tx.createZone({ warehouseId: warehouse.id, code, name: v.name }), { success: `Zone ${code} added` });
    if (res?.ok) onOpenChange(false);
  });

  return (
    <FormDialog
      open={open}
      onOpenChange={onOpenChange}
      title="Add zone"
      description={`New storage zone in ${warehouse.name}. Add racks and bins to it afterwards.`}
      submitLabel="Add zone"
      pending={pending}
      onSubmit={onSubmit}
      testId="add-zone-dialog"
    >
      <FormField id="zone-code" label="Zone code" required error={errors.code?.message} hint="Short unique code, e.g. D">
        <Input
          id="zone-code"
          autoComplete="off"
          className="uppercase"
          aria-invalid={!!errors.code}
          {...form.register("code", { onChange: (e) => form.setValue("code", String(e.target.value).toUpperCase()) })}
        />
      </FormField>
      <FormField id="zone-name" label="Zone name" required error={errors.name?.message}>
        <Input id="zone-name" autoComplete="off" aria-invalid={!!errors.name} {...form.register("name")} />
      </FormField>
    </FormDialog>
  );
}

/* ------------------------------------------------------------------- rack */

export function AddRackDialog({ open, onOpenChange, zone }: { open: boolean; onOpenChange: (o: boolean) => void; zone: Zone | null }) {
  const data = useData();
  const tx = useTx();
  const { submit, pending } = useSubmit();
  const nextCode = zone ? `${zone.code}-R${data.racks.filter((r) => r.zoneId === zone.id).length + 1}` : "";

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!zone) return;
    const res = await submit(() => tx.createRack({ zoneId: zone.id }), { success: `Rack ${nextCode} added to zone ${zone.code}` });
    if (res?.ok) onOpenChange(false);
  };

  return (
    <FormDialog
      open={open}
      onOpenChange={onOpenChange}
      title="Add rack"
      description={zone ? `A new rack ${nextCode} will be created in zone ${zone.code} (${zone.name}). Rack codes are numbered automatically.` : undefined}
      submitLabel="Add rack"
      pending={pending}
      onSubmit={onSubmit}
      size="sm"
      testId="add-rack-dialog"
    >
      <p className="text-sm text-muted-foreground">After adding the rack, use “Add bin” on it to create bins with a unit capacity.</p>
    </FormDialog>
  );
}

/* -------------------------------------------------------------------- bin */

const binSchema = z.object({
  capacity: z
    .number({ error: "Enter the bin capacity" })
    .int("Whole numbers only")
    .min(1, "Capacity must be at least 1")
    .max(100000, "Capacity looks too large"),
});
type BinValues = z.infer<typeof binSchema>;

export function AddBinDialog({
  open,
  onOpenChange,
  rack,
  warehouse,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  rack: Rack | null;
  warehouse: Warehouse;
}) {
  const data = useData();
  const tx = useTx();
  const { submit, pending } = useSubmit();
  const form = useForm<BinValues>({ resolver: zodResolver(binSchema), defaultValues: { capacity: 500 } });
  const errors = form.formState.errors;
  const nextCode = rack ? `${warehouse.code}-${rack.code}-B${String(data.bins.filter((b) => b.rackId === rack.id).length + 1).padStart(2, "0")}` : "";

  useEffect(() => {
    if (open) form.reset({ capacity: 500 });
  }, [open, form]);

  const onSubmit = form.handleSubmit(async (v) => {
    if (!rack) return;
    const res = await submit(() => tx.createBin({ rackId: rack.id, capacity: v.capacity }), { success: `Bin ${nextCode} added` });
    if (res?.ok) onOpenChange(false);
  });

  return (
    <FormDialog
      open={open}
      onOpenChange={onOpenChange}
      title="Add bin"
      description={rack ? `New storage bin ${nextCode} on rack ${rack.code}.` : undefined}
      submitLabel="Add bin"
      pending={pending}
      onSubmit={onSubmit}
      size="sm"
      testId="add-bin-dialog"
    >
      <FormField id="bin-capacity" label="Capacity (units)" required error={errors.capacity?.message} hint="Maximum number of units the bin can hold">
        <Input id="bin-capacity" type="number" inputMode="numeric" min={1} aria-invalid={!!errors.capacity} {...form.register("capacity", { valueAsNumber: true })} />
      </FormField>
    </FormDialog>
  );
}
