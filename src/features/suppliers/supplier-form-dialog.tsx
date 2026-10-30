"use client";

import { useEffect, useMemo } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import type { Supplier } from "@/types";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { FormDialog } from "@/components/shared/dialogs";
import { FormField, NativeSelect } from "@/components/shared/form-controls";
import { useData, useTx } from "@/hooks/use-wms";
import { useSubmit } from "@/hooks/use-submit";

const PAYMENT_TERMS = ["Cash on delivery", "Advance payment", "Net 7", "Net 14", "Net 21", "Net 30", "Net 45", "Net 60"];
const COMMON_COUNTRIES = ["Sri Lanka", "India", "Singapore", "China", "Malaysia", "Thailand", "United Arab Emirates", "United Kingdom"];

const schema = z.object({
  name: z.string().trim().min(2, "Supplier name is required"),
  contactPerson: z.string().trim().min(2, "Contact person is required"),
  email: z.string().trim().min(1, "Email is required").email("Enter a valid email address"),
  phone: z
    .string()
    .trim()
    .min(1, "Phone is required")
    .regex(/^\+?[0-9][0-9\s().-]{6,20}$/, "Enter a valid phone number, e.g. +94 11 234 5678"),
  country: z.string().trim().min(2, "Country is required"),
  address: z.string().trim().min(5, "Enter the address"),
  paymentTerms: z.string().min(1, "Choose payment terms"),
  leadTimeDays: z.number({ error: "Enter the lead time in days" }).int("Whole days only").min(1, "At least 1 day").max(365, "At most 365 days"),
});
type Values = z.infer<typeof schema>;

const EMPTY: Values = { name: "", contactPerson: "", email: "", phone: "", country: "Sri Lanka", address: "", paymentTerms: "Net 30", leadTimeDays: 7 };

export function SupplierFormDialog({
  open,
  onOpenChange,
  supplier,
  onSaved,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  supplier?: Supplier | null;
  onSaved?: (id: string) => void;
}) {
  const data = useData();
  const tx = useTx();
  const { submit, pending } = useSubmit();
  const form = useForm<Values>({ resolver: zodResolver(schema), defaultValues: EMPTY });
  const errors = form.formState.errors;
  const editing = !!supplier;

  useEffect(() => {
    if (!open) return;
    form.reset(
      supplier
        ? {
            name: supplier.name,
            contactPerson: supplier.contactPerson,
            email: supplier.email,
            phone: supplier.phone,
            country: supplier.country,
            address: supplier.address,
            paymentTerms: supplier.paymentTerms,
            leadTimeDays: supplier.leadTimeDays,
          }
        : EMPTY,
    );
  }, [open, supplier, form]);

  const termOptions = useMemo(() => {
    const set = new Set(PAYMENT_TERMS);
    if (supplier?.paymentTerms) set.add(supplier.paymentTerms);
    return [...set].map((t) => ({ value: t, label: t }));
  }, [supplier]);

  const countries = useMemo(() => [...new Set([...COMMON_COUNTRIES, ...data.suppliers.map((s) => s.country)])], [data.suppliers]);

  const onSubmit = form.handleSubmit(async (v) => {
    if (data.suppliers.some((s) => s.id !== supplier?.id && s.name.trim().toLowerCase() === v.name.trim().toLowerCase())) {
      form.setError("name", { message: "A supplier with that name already exists" });
      return;
    }
    const input = { ...v, name: v.name.trim() };
    const res = supplier
      ? await submit(() => tx.updateSupplier(supplier.id, input), { success: "Supplier updated" })
      : await submit(() => tx.createSupplier(input), { success: `Supplier ${input.name} created` });
    if (res?.ok) {
      onOpenChange(false);
      onSaved?.(supplier ? supplier.id : (res.value as string));
    }
  });

  return (
    <FormDialog
      open={open}
      onOpenChange={onOpenChange}
      title={editing ? `Edit ${supplier.name}` : "Add supplier"}
      description={editing ? "Update contact and commercial details." : "A supplier code is assigned automatically."}
      submitLabel={editing ? "Save changes" : "Create supplier"}
      pending={pending}
      onSubmit={onSubmit}
      size="lg"
      testId="supplier-form"
    >
      <div className="grid gap-4 sm:grid-cols-2">
        <FormField id="s-name" label="Supplier name" required error={errors.name?.message}>
          <Input id="s-name" autoComplete="off" aria-invalid={!!errors.name} {...form.register("name")} />
        </FormField>
        <FormField id="s-contact" label="Contact person" required error={errors.contactPerson?.message}>
          <Input id="s-contact" autoComplete="off" aria-invalid={!!errors.contactPerson} {...form.register("contactPerson")} />
        </FormField>
        <FormField id="s-email" label="Email" required error={errors.email?.message}>
          <Input id="s-email" type="email" autoComplete="off" aria-invalid={!!errors.email} {...form.register("email")} />
        </FormField>
        <FormField id="s-phone" label="Phone" required error={errors.phone?.message}>
          <Input id="s-phone" type="tel" autoComplete="off" aria-invalid={!!errors.phone} {...form.register("phone")} />
        </FormField>
        <FormField id="s-country" label="Country" required error={errors.country?.message}>
          <Input id="s-country" list="supplier-countries" autoComplete="off" aria-invalid={!!errors.country} {...form.register("country")} />
          <datalist id="supplier-countries">
            {countries.map((c) => (
              <option key={c} value={c} />
            ))}
          </datalist>
        </FormField>
        <FormField id="s-terms" label="Payment terms" required error={errors.paymentTerms?.message}>
          <NativeSelect id="s-terms" options={termOptions} {...form.register("paymentTerms")} />
        </FormField>
        <FormField id="s-lead" label="Lead time (days)" required error={errors.leadTimeDays?.message}>
          <Input id="s-lead" type="number" min={1} inputMode="numeric" aria-invalid={!!errors.leadTimeDays} {...form.register("leadTimeDays", { valueAsNumber: true })} />
        </FormField>
      </div>
      <FormField id="s-address" label="Address" required error={errors.address?.message}>
        <Textarea id="s-address" rows={2} aria-invalid={!!errors.address} {...form.register("address")} />
      </FormField>
    </FormDialog>
  );
}
