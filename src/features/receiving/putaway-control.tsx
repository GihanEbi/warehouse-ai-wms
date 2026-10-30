"use client";

import { useMemo, useState } from "react";
import { CheckCircle2, Loader2 } from "lucide-react";
import type { ID, WarehouseTask } from "@/types";
import { Button } from "@/components/ui/button";
import { NativeSelect } from "@/components/shared/form-controls";
import { useData, usePermission, useTx } from "@/hooks/use-wms";
import { useSubmit } from "@/hooks/use-submit";
import { binFree, storageBinsFor } from "@/lib/inventory/selectors";

/** Pending putaway tasks (tasks of type putaway that are not completed). */
export const isPendingPutaway = (t: WarehouseTask) => t.type === "putaway" && !!t.putaway && t.status !== "completed";

/** Bin select + "Complete putaway" button for one putaway task. */
export function PutawayControl({ task, compact }: { task: WarehouseTask; compact?: boolean }) {
  const data = useData();
  const tx = useTx();
  const { can } = usePermission();
  const { submit, pending } = useSubmit();
  const pw = task.putaway;
  const [chosen, setChosen] = useState<ID | null>(null);

  const options = useMemo(() => {
    if (!pw) return [];
    return storageBinsFor(data, task.warehouseId).map((b) => {
      const free = binFree(data, b.id);
      const fits = free >= pw.quantity;
      return {
        value: b.id,
        label: `${b.id === pw.suggestedBinId ? "★ " : ""}${b.code} · ${free} free`,
        disabled: !fits,
        free,
      };
    });
  }, [data, pw, task.warehouseId]);

  if (!pw) return null;
  const suggestionFits = options.some((o) => o.value === pw.suggestedBinId && !o.disabled);
  const fallback = options.find((o) => !o.disabled)?.value ?? "";
  const value = chosen && options.some((o) => o.value === chosen && !o.disabled) ? chosen : suggestionFits ? pw.suggestedBinId : fallback;

  return (
    <div className="flex flex-col gap-2 sm:flex-row sm:items-center" onClick={(e) => e.stopPropagation()}>
      <NativeSelect
        aria-label="Putaway bin"
        data-testid="putaway-bin"
        value={value}
        onChange={(e) => setChosen(e.target.value)}
        options={options.map(({ value: v, label, disabled }) => ({ value: v, label, disabled }))}
        placeholder={options.length ? undefined : "No storage bins"}
        className={compact ? "min-w-[11rem]" : "min-w-[13rem]"}
      />
      <Button
        size="sm"
        disabled={pending || !value || !can("receiving.write")}
        title={!can("receiving.write") ? "Your role cannot complete putaway" : undefined}
        data-testid="complete-putaway"
        onClick={() =>
          submit(() => tx.completePutaway({ taskId: task.id, binId: value }), {
            success: "Putaway complete - stock is now available",
          })
        }
      >
        {pending ? <Loader2 className="animate-spin" /> : <CheckCircle2 />} Complete putaway
      </Button>
    </div>
  );
}
