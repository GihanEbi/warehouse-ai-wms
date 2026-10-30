"use client";

import { useEffect, useMemo } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import type { Warehouse } from "@/types";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { FormDialog } from "@/components/shared/dialogs";
import { FormField, NativeSelect } from "@/components/shared/form-controls";
import { useData, useTx } from "@/hooks/use-wms";
import { useSubmit } from "@/hooks/use-submit";
import { ROLE_LABELS } from "@/lib/constants";

const schema = z.object({
  code: z
    .string()
    .trim()
    .min(2, "Code is required (at least 2 characters)")
    .max(12, "Code must be 12 characters or fewer")
    .regex(/^[A-Za-z0-9-]+$/, "Use letters, numbers and hyphens only"),
  name: z.string().trim().min(2, "Warehouse name is required"),
  city: z.string().trim().min(1, "City is required"),
  address: z.string().trim().min(5, "Enter the street address"),
  managerId: z.string(),
});
type Values = z.infer<typeof schema>;

const EMPTY: Values = { code: "", name: "", city: "", address: "", managerId: "" };

export function WarehouseFormDialog({
  open,
  onOpenChange,
  warehouse,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** when set the dialog edits this warehouse, otherwise it creates one */
  warehouse?: Warehouse | null;
}) {
  const data = useData();
  const tx = useTx();
  const { submit, pending } = useSubmit();
  const form = useForm<Values>({ resolver: zodResolver(schema), defaultValues: EMPTY });
  const errors = form.formState.errors;
  const editing = !!warehouse;

  useEffect(() => {
    if (!open) return;
    form.reset(
      warehouse
        ? { code: warehouse.code, name: warehouse.name, city: warehouse.city, address: warehouse.address, managerId: warehouse.managerId ?? "" }
        : EMPTY,
    );
  }, [open, warehouse, form]);

  const managerOptions = useMemo(() => {
    return data.users
      .filter((u) => u.status === "active" || u.id === warehouse?.managerId)
      .sort((a, b) => {
        const am = a.role === "warehouse_manager" ? 0 : 1;
        const bm = b.role === "warehouse_manager" ? 0 : 1;
        return am - bm || a.name.localeCompare(b.name);
      })
      .map((u) => ({ value: u.id, label: `${u.name} - ${ROLE_LABELS[u.role]}` }));
  }, [data.users, warehouse?.managerId]);

  const onSubmit = form.handleSubmit(async (v) => {
    const code = v.code.trim().toUpperCase();
    if (data.warehouses.some((w) => w.id !== warehouse?.id && w.code === code)) {
      form.setError("code", { message: `Code ${code} is already used by another warehouse` });
      return;
    }
    const input = { code, name: v.name, city: v.city, address: v.address, managerId: v.managerId || null };
    const res = warehouse
      ? await submit(() => tx.updateWarehouse(warehouse.id, input), { success: "Warehouse updated" })
      : await submit(() => tx.createWarehouse(input), { success: `Warehouse ${code} created` });
    if (res?.ok) onOpenChange(false);
  });

  return (
    <FormDialog
      open={open}
      onOpenChange={onOpenChange}
      title={editing ? `Edit ${warehouse.name}` : "Add warehouse"}
      description={editing ? "Update the warehouse details." : "A receiving, returns and starter storage zone are created automatically."}
      submitLabel={editing ? "Save changes" : "Create warehouse"}
      pending={pending}
      onSubmit={onSubmit}
      testId="warehouse-form"
    >
      <div className="grid gap-4 sm:grid-cols-2">
        <FormField id="wh-code" label="Warehouse code" required error={errors.code?.message} hint="Unique, uppercase e.g. NEG-01">
          <Input
            id="wh-code"
            autoComplete="off"
            className="uppercase"
            aria-invalid={!!errors.code}
            {...form.register("code", { onChange: (e) => form.setValue("code", String(e.target.value).toUpperCase()) })}
          />
        </FormField>
        <FormField id="wh-name" label="Name" required error={errors.name?.message}>
          <Input id="wh-name" autoComplete="off" aria-invalid={!!errors.name} {...form.register("name")} />
        </FormField>
        <FormField id="wh-city" label="City" required error={errors.city?.message}>
          <Input id="wh-city" autoComplete="off" aria-invalid={!!errors.city} {...form.register("city")} />
        </FormField>
        <FormField id="wh-manager" label="Manager" error={errors.managerId?.message}>
          <NativeSelect id="wh-manager" options={managerOptions} placeholder="Unassigned" {...form.register("managerId")} />
        </FormField>
      </div>
      <FormField id="wh-address" label="Address" required error={errors.address?.message}>
        <Textarea id="wh-address" rows={2} aria-invalid={!!errors.address} {...form.register("address")} />
      </FormField>
    </FormDialog>
  );
}
