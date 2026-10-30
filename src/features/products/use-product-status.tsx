"use client";

import { useState } from "react";
import type { Product, ProductStatus } from "@/types";
import { ConfirmationDialog } from "@/components/shared/dialogs";
import { useTx } from "@/hooks/use-wms";
import { useSubmit } from "@/hooks/use-submit";

const COPY: Record<ProductStatus, { title: string; verb: string; done: string; description: string; destructive: boolean }> = {
  inactive: {
    title: "Deactivate",
    verb: "Deactivate",
    done: "deactivated",
    description: "The product stays in the catalog and keeps its stock, but it can no longer be picked for new purchase orders or customer orders.",
    destructive: false,
  },
  archived: {
    title: "Archive",
    verb: "Archive",
    done: "archived",
    description: "Archived products are hidden from the default product list and from selectors. Stock and history are kept. This is refused while the product is on open customer orders.",
    destructive: true,
  },
  active: {
    title: "Reactivate",
    verb: "Reactivate",
    done: "reactivated",
    description: "The product becomes available again for purchase orders, orders and inventory work.",
    destructive: false,
  },
};

/** Status change (deactivate / archive / reactivate) with confirmation; the workflow may refuse. */
export function useProductStatusChange() {
  const tx = useTx();
  const { submit } = useSubmit();
  const [target, setTarget] = useState<{ product: Product; status: ProductStatus } | null>(null);
  const [open, setOpen] = useState(false);

  const request = (product: Product, status: ProductStatus) => {
    setTarget({ product, status });
    setOpen(true);
  };

  const copy = COPY[target?.status ?? "inactive"];

  const dialog = (
    <ConfirmationDialog
      open={open}
      onOpenChange={setOpen}
      title={`${copy.title} ${target?.product.name ?? "product"}?`}
      description={copy.description}
      confirmLabel={copy.verb}
      destructive={copy.destructive}
      onConfirm={async () => {
        if (!target) return;
        await submit(() => tx.setProductStatus(target.product.id, target.status), {
          success: `${target.product.name} ${copy.done}`,
        });
      }}
    />
  );

  return { request, dialog };
}
