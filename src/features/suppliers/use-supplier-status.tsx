"use client";

import { useState } from "react";
import type { Supplier } from "@/types";
import { ConfirmationDialog } from "@/components/shared/dialogs";
import { useTx } from "@/hooks/use-wms";
import { useSubmit } from "@/hooks/use-submit";

/** Activate / deactivate a supplier with confirmation (refused by the workflow while POs are open). */
export function useSupplierStatusToggle() {
  const tx = useTx();
  const { submit } = useSubmit();
  const [target, setTarget] = useState<Supplier | null>(null);
  const [open, setOpen] = useState(false);

  const request = (s: Supplier) => {
    setTarget(s);
    setOpen(true);
  };
  const next = target?.status === "active" ? "inactive" : "active";

  const dialog = (
    <ConfirmationDialog
      open={open}
      onOpenChange={setOpen}
      title={`${next === "inactive" ? "Deactivate" : "Activate"} ${target?.name ?? "supplier"}?`}
      description={
        next === "inactive"
          ? "Inactive suppliers cannot be chosen on new purchase orders. This is refused while the supplier has open purchase orders."
          : "The supplier can be chosen on new purchase orders again."
      }
      confirmLabel={next === "inactive" ? "Deactivate" : "Activate"}
      destructive={next === "inactive"}
      onConfirm={async () => {
        if (!target) return;
        await submit(() => tx.setSupplierStatus(target.id, next), { success: `${target.name} ${next === "active" ? "activated" : "deactivated"}` });
      }}
    />
  );
  return { request, dialog };
}
