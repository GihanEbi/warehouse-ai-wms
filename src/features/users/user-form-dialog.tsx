"use client";

import { useEffect, useMemo } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import type { Role, User } from "@/types";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { FormDialog } from "@/components/shared/dialogs";
import { FormField, NativeSelect } from "@/components/shared/form-controls";
import { useData, useTx } from "@/hooks/use-wms";
import { useSubmit } from "@/hooks/use-submit";
import { ROLE_DESCRIPTIONS, ROLE_LABELS } from "@/lib/constants";
import { ROLES } from "./role-bits";

const schema = z.object({
  name: z.string().trim().min(2, "Full name is required").max(80, "Name is too long"),
  email: z.string().trim().min(1, "Email is required").pipe(z.email("Enter a valid email address")),
  phone: z
    .string()
    .trim()
    .refine((v) => v === "" || /^[0-9+()\s-]{7,20}$/.test(v), "Enter a valid phone number"),
  role: z.enum(["admin", "warehouse_manager", "inventory_manager", "operator"]),
  title: z.string().trim().min(1, "Job title is required").max(60, "Title is too long"),
  warehouseIds: z.array(z.string()).min(1, "Assign at least one warehouse"),
});
type Values = z.infer<typeof schema>;

export function UserFormDialog({
  open,
  onOpenChange,
  user,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  user?: User | null;
}) {
  const data = useData();
  const tx = useTx();
  const { submit, pending } = useSubmit();
  const editing = !!user;

  const defaults = useMemo<Values>(
    () =>
      user
        ? { name: user.name, email: user.email, phone: user.phone, role: user.role, title: user.title, warehouseIds: user.warehouseIds }
        : { name: "", email: "", phone: "", role: "operator", title: "", warehouseIds: [] },
    [user],
  );
  const form = useForm<Values>({ resolver: zodResolver(schema), defaultValues: defaults });
  const {
    register,
    handleSubmit,
    reset,
    setValue,
    watch,
    setError,
    formState: { errors },
  } = form;

  useEffect(() => {
    if (open) reset(defaults);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, user?.id, reset]);

  const role = watch("role");
  const selected = watch("warehouseIds");
  const warehouses = data.warehouses.filter((w) => w.status === "active" || selected.includes(w.id));

  const toggleWarehouse = (id: string, on: boolean) =>
    setValue("warehouseIds", on ? [...selected, id] : selected.filter((x) => x !== id), { shouldValidate: true, shouldDirty: true });

  const onSubmit = handleSubmit(async (v) => {
    const email = v.email.trim().toLowerCase();
    if (data.users.some((u) => u.id !== user?.id && u.email.trim().toLowerCase() === email)) {
      setError("email", { message: "A user with that email already exists" });
      return;
    }
    if (user && user.role === "admin" && v.role !== "admin") {
      const otherAdmins = data.users.filter((u) => u.id !== user.id && u.role === "admin" && u.status === "active");
      if (otherAdmins.length === 0) {
        setError("role", { message: "At least one active administrator is required" });
        return;
      }
    }
    const input = { ...v, role: v.role as Role };
    if (user) {
      const res = await submit(() => tx.updateUser(user.id, input), { success: "User updated" });
      if (res?.ok) onOpenChange(false);
      return;
    }
    const res = await submit(() => tx.createUser(input), { success: `${v.name} added` });
    if (res?.ok) onOpenChange(false);
  });

  return (
    <FormDialog
      open={open}
      onOpenChange={onOpenChange}
      title={editing ? `Edit ${user?.name}` : "Add user"}
      description="Roles are simulated for demos and are not real security."
      submitLabel={editing ? "Save changes" : "Add user"}
      pending={pending}
      onSubmit={onSubmit}
      testId="user-form"
    >
      <div className="grid gap-4 sm:grid-cols-2">
        <FormField id="user-name" label="Full name" required error={errors.name?.message}>
          <Input id="user-name" autoComplete="off" aria-invalid={!!errors.name} {...register("name")} />
        </FormField>
        <FormField id="user-title" label="Job title" required error={errors.title?.message}>
          <Input id="user-title" placeholder="e.g. Picker" aria-invalid={!!errors.title} {...register("title")} />
        </FormField>
        <FormField id="user-email" label="Email" required error={errors.email?.message}>
          <Input id="user-email" type="email" autoComplete="off" aria-invalid={!!errors.email} {...register("email")} />
        </FormField>
        <FormField id="user-phone" label="Phone" error={errors.phone?.message}>
          <Input id="user-phone" type="tel" placeholder="+94 77 123 4567" aria-invalid={!!errors.phone} {...register("phone")} />
        </FormField>
      </div>
      <FormField id="user-role" label="Role" required error={errors.role?.message} hint={ROLE_DESCRIPTIONS[role]}>
        <NativeSelect id="user-role" invalid={!!errors.role} options={ROLES.map((r) => ({ value: r, label: ROLE_LABELS[r] }))} {...register("role")} />
      </FormField>
      <fieldset className="space-y-1.5">
        <legend className="text-xs font-medium">
          Assigned warehouses<span className="text-danger" aria-hidden> *</span>
        </legend>
        <div className="grid gap-1 rounded-lg border p-2 sm:grid-cols-2" data-testid="user-warehouses">
          {warehouses.map((w) => (
            <label key={w.id} className="flex min-h-9 cursor-pointer items-center gap-2 rounded-md px-2 text-sm hover:bg-muted/60">
              <Checkbox
                checked={selected.includes(w.id)}
                onCheckedChange={(c) => toggleWarehouse(w.id, c === true)}
                data-testid={`user-wh-${w.code}`}
              />
              <span className="min-w-0 truncate">
                {w.name} <span className="text-xs text-muted-foreground">({w.code})</span>
              </span>
            </label>
          ))}
        </div>
        {errors.warehouseIds && (
          <p className="text-xs text-danger" role="alert" data-testid="error-warehouseIds">
            {errors.warehouseIds.message}
          </p>
        )}
      </fieldset>
    </FormDialog>
  );
}
