"use client";

import { useEffect } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { addDays } from "date-fns";
import { Wand2 } from "lucide-react";
import type { SalesOrder } from "@/types";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { FormDialog } from "@/components/shared/dialogs";
import { FormField, NativeSelect } from "@/components/shared/form-controls";
import { useData, useIndex, useTx } from "@/hooks/use-wms";
import { useSubmit } from "@/hooks/use-submit";
import { CARRIERS } from "@/lib/constants";
import { generateTrackingNumber } from "@/lib/workflows/shipping";
import { fromDateInput, toDateInput } from "@/features/orders/order-utils";
import { useRouter } from "next/navigation";

const schema = z
  .object({
    carrier: z.string().min(1, "Select a carrier"),
    method: z.string().min(1, "Select a shipping method"),
    trackingNumber: z.string().trim().min(1, "Tracking number is required"),
    dispatchDate: z.string().min(1, "Planned dispatch date is required"),
    estimatedDelivery: z.string().min(1, "Estimated delivery is required"),
  })
  .refine((v) => !v.dispatchDate || !v.estimatedDelivery || v.estimatedDelivery >= v.dispatchDate, {
    path: ["estimatedDelivery"],
    message: "Delivery cannot be before dispatch",
  });
type Values = z.infer<typeof schema>;

export function CreateShipmentDialog({ order, onOpenChange }: { order: SalesOrder | null; onOpenChange: (open: boolean) => void }) {
  const data = useData();
  const idx = useIndex();
  const tx = useTx();
  const router = useRouter();
  const { submit, pending } = useSubmit();
  const form = useForm<Values>({
    resolver: zodResolver(schema),
    defaultValues: { carrier: "", method: "", trackingNumber: "", dispatchDate: "", estimatedDelivery: "" },
  });
  const { errors } = form.formState;
  const carrier = form.watch("carrier");
  const method = form.watch("method");
  const methods = CARRIERS.find((c) => c.name === carrier)?.methods ?? [];

  const orderId = order?.id;
  useEffect(() => {
    if (!orderId) return;
    const c = CARRIERS[0];
    form.reset({
      carrier: c.name,
      method: c.methods[0],
      trackingNumber: generateTrackingNumber(data, c.name),
      dispatchDate: toDateInput(new Date()),
      estimatedDelivery: toDateInput(addDays(new Date(), 2)),
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps -- reset only when the dialog opens for another order
  }, [orderId]);

  const onSubmit = form.handleSubmit(async (v) => {
    if (!order) return;
    const res = await submit(
      () =>
        tx.createShipment({
          orderId: order.id,
          carrier: v.carrier,
          method: v.method,
          trackingNumber: v.trackingNumber,
          dispatchDate: fromDateInput(v.dispatchDate),
          estimatedDelivery: fromDateInput(v.estimatedDelivery),
        }),
      { success: "Shipment created - ready to dispatch" },
    );
    if (res?.ok) {
      onOpenChange(false);
      router.push(`/shipping/${res.value}`);
    }
  });

  const customer = order ? idx.customers.get(order.customerId) : undefined;

  return (
    <FormDialog
      open={!!order}
      onOpenChange={onOpenChange}
      title={order ? `Create shipment for ${order.number}` : "Create shipment"}
      description={customer ? `Deliver to ${customer.name}, ${customer.city}.` : undefined}
      submitLabel="Create shipment"
      submitTestId="confirm-create-shipment"
      testId="shipment-dialog"
      pending={pending}
      onSubmit={onSubmit}
    >
      <div className="grid gap-4 sm:grid-cols-2">
        <FormField id="carrier" label="Carrier" required error={errors.carrier?.message}>
          <NativeSelect
            id="carrier"
            value={carrier}
            onChange={(e) => {
              const c = CARRIERS.find((x) => x.name === e.target.value);
              form.setValue("carrier", e.target.value, { shouldValidate: true });
              form.setValue("method", c?.methods[0] ?? "", { shouldValidate: true });
            }}
            placeholder="Select a carrier…"
            options={CARRIERS.map((c) => ({ value: c.name, label: c.name }))}
            invalid={!!errors.carrier}
          />
        </FormField>
        <FormField id="method" label="Shipping method" required error={errors.method?.message}>
          <NativeSelect
            id="method"
            value={method}
            onChange={(e) => form.setValue("method", e.target.value, { shouldValidate: true })}
            placeholder="Select a method…"
            options={methods.map((m) => ({ value: m, label: m }))}
            invalid={!!errors.method}
            disabled={!carrier}
          />
        </FormField>
      </div>
      <FormField id="trackingNumber" label="Tracking number" required error={errors.trackingNumber?.message}>
        <div className="flex gap-2">
          <Input id="trackingNumber" {...form.register("trackingNumber")} aria-invalid={!!errors.trackingNumber} className="font-mono" />
          <Button
            type="button"
            variant="outline"
            disabled={!carrier}
            onClick={() => form.setValue("trackingNumber", generateTrackingNumber(data, carrier), { shouldValidate: true, shouldDirty: true })}
            data-testid="generate-tracking"
          >
            <Wand2 /> Generate
          </Button>
        </div>
      </FormField>
      <div className="grid gap-4 sm:grid-cols-2">
        <FormField id="dispatchDate" label="Planned dispatch date" required error={errors.dispatchDate?.message}>
          <Input id="dispatchDate" type="date" {...form.register("dispatchDate")} aria-invalid={!!errors.dispatchDate} />
        </FormField>
        <FormField id="estimatedDelivery" label="Estimated delivery" required error={errors.estimatedDelivery?.message}>
          <Input id="estimatedDelivery" type="date" {...form.register("estimatedDelivery")} aria-invalid={!!errors.estimatedDelivery} />
        </FormField>
      </div>
    </FormDialog>
  );
}
