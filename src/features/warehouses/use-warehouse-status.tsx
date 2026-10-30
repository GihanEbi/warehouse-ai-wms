"use client";

import { useState } from "react";
import type { Warehouse } from "@/types";
import { ConfirmationDialog } from "@/components/shared/dialogs";
import { useTx } from "@/hooks/use-wms";
import { useSubmit } from "@/hooks/use-submit";

/** Activate / deactivate with confirmation. The workflow may refuse (open orders) -> error toast. */
export function useWarehouseStatusToggle() {
  const tx = useTx();
  const { submit } = useSubmit();
  const [target, setTarget] = useState<Warehouse | null>(null);
  const [open, setOpen] = useState(false);

  const request = (wh: Warehouse) => {
    setTarget(wh);
    setOpen(true);
  };

  const next = target?.status === "active" ? "inactive" : "active";

  const dialog = (
    <ConfirmationDialog
      open={open}
      onOpenChange={setOpen}
      title={next === "inactive" ? `Deactivate ${target?.name ?? "warehouse"}?` : `Activate ${target?.name ?? "warehouse"}?`}
      description={
        next === "inactive"
          ? "An inactive warehouse can no longer be selected for new purchase orders, transfers or orders. Existing stock and history are kept. This is blocked while customer orders are still open."
          : "The warehouse becomes available again for new purchase orders, transfers and orders."
      }
      confirmLabel={next === "inactive" ? "Deactivate" : "Activate"}
      destructive={next === "inactive"}
      onConfirm={async () => {
        if (!target) return;
        await submit(() => tx.setWarehouseStatus(target.id, next), {
          success: `${target.name} ${next === "active" ? "activated" : "deactivated"}`,
        });
      }}
    />
  );

  return { request, dialog };
}
