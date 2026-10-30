"use client";

import { Package } from "lucide-react";
import type { WarehouseTask } from "@/types";
import { ConfirmationDialog } from "@/components/shared/dialogs";
import { useFormat, useIndex, useTx } from "@/hooks/use-wms";
import { useSubmit } from "@/hooks/use-submit";

/** Confirms completing a putaway task into its suggested bin. */
export function PutawayDialog({
  task,
  open,
  onOpenChange,
}: {
  task: WarehouseTask | null;
  open: boolean;
  onOpenChange: (o: boolean) => void;
}) {
  const idx = useIndex();
  const fmt = useFormat();
  const tx = useTx();
  const { submit } = useSubmit();
  const pw = task?.putaway;
  const product = pw ? idx.products.get(pw.productId) : undefined;
  const from = pw ? idx.bins.get(pw.fromBinId) : undefined;
  const to = pw ? idx.bins.get(pw.suggestedBinId) : undefined;

  return (
    <ConfirmationDialog
      open={open && !!task && !!pw}
      onOpenChange={onOpenChange}
      title="Complete putaway"
      confirmLabel="Complete putaway"
      description={
        pw && task
          ? `Move ${fmt.number(pw.quantity)} × ${product?.name ?? "item"} from ${from?.code ?? "staging"} to the suggested bin ${to?.code ?? "—"} for ${task.number}.`
          : undefined
      }
      onConfirm={async () => {
        if (!task || !pw) return false;
        const res = await submit(() => tx.completePutaway({ taskId: task.id, binId: pw.suggestedBinId }), {
          success: `${task.number} putaway completed`,
        });
        return !!res?.ok;
      }}
    >
      {pw && (
        <div className="flex items-center gap-3 rounded-lg border bg-muted/40 p-3 text-sm">
          <Package className="size-5 shrink-0 text-muted-foreground" aria-hidden />
          <div className="min-w-0">
            <p className="truncate font-medium">{product?.name}</p>
            <p className="text-xs text-muted-foreground">
              {from?.code} → <span className="font-medium text-foreground">{to?.code}</span> · {fmt.number(pw.quantity)} {product?.uom}
            </p>
          </div>
        </div>
      )}
    </ConfirmationDialog>
  );
}
