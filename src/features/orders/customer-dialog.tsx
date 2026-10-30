"use client";

import { useEffect } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Input } from "@/components/ui/input";
import { FormDialog } from "@/components/shared/dialogs";
import { FormField } from "@/components/shared/form-controls";
import { useTx } from "@/hooks/use-wms";
import { useSubmit } from "@/hooks/use-submit";

const schema = z.object({
  name: z.string().trim().min(1, "Customer name is required"),
  contactPerson: z.string().trim().min(1, "Contact person is required"),
  email: z.string().trim().min(1, "Email is required").email("Enter a valid email address"),
  phone: z.string().trim().min(7, "Enter a valid phone number"),
  address: z.string().trim().min(1, "Address is required"),
  city: z.string().trim().min(1, "City is required"),
});
type Values = z.infer<typeof schema>;

const EMPTY: Values = { name: "", contactPerson: "", email: "", phone: "", address: "", city: "" };

/** Inline "new customer" dialog. Render it OUTSIDE any parent <form> (portal events bubble through React trees). */
export function NewCustomerDialog({
  open,
  onOpenChange,
  onCreated,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCreated: (customerId: string) => void;
}) {
  const tx = useTx();
  const { submit, pending } = useSubmit();
  const form = useForm<Values>({ resolver: zodResolver(schema), defaultValues: EMPTY });
  const { errors } = form.formState;

  useEffect(() => {
    if (open) form.reset(EMPTY);
  }, [open, form]);

  const onSubmit = form.handleSubmit(async (v) => {
    const res = await submit(() => tx.createCustomer(v), { success: "Customer created" });
    if (res?.ok) {
      onCreated(res.value);
      onOpenChange(false);
    }
  });

  return (
    <FormDialog
      open={open}
      onOpenChange={onOpenChange}
      title="New customer"
      description="Add a customer without leaving the order."
      submitLabel="Create customer"
      submitTestId="save-customer"
      pending={pending}
      onSubmit={onSubmit}
    >
      <FormField id="cus-name" label="Customer name" required error={errors.name?.message}>
        <Input id="cus-name" {...form.register("name")} aria-invalid={!!errors.name} />
      </FormField>
      <div className="grid gap-4 sm:grid-cols-2">
        <FormField id="cus-contact" label="Contact person" required error={errors.contactPerson?.message}>
          <Input id="cus-contact" {...form.register("contactPerson")} aria-invalid={!!errors.contactPerson} />
        </FormField>
        <FormField id="cus-phone" label="Phone" required error={errors.phone?.message}>
          <Input id="cus-phone" {...form.register("phone")} aria-invalid={!!errors.phone} />
        </FormField>
      </div>
      <FormField id="cus-email" label="Email" required error={errors.email?.message}>
        <Input id="cus-email" type="email" {...form.register("email")} aria-invalid={!!errors.email} />
      </FormField>
      <div className="grid gap-4 sm:grid-cols-2">
        <FormField id="cus-address" label="Address" required error={errors.address?.message}>
          <Input id="cus-address" {...form.register("address")} aria-invalid={!!errors.address} />
        </FormField>
        <FormField id="cus-city" label="City" required error={errors.city?.message}>
          <Input id="cus-city" {...form.register("city")} aria-invalid={!!errors.city} />
        </FormField>
      </div>
    </FormDialog>
  );
}
