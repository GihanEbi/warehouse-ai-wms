"use client";

import { useCallback } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import type { TaskStatus, WarehouseTask } from "@/types";
import { useTx } from "@/hooks/use-wms";
import { useSubmit } from "@/hooks/use-submit";
import { TASK_STATUS_LABELS, taskLinkHref } from "./task-utils";

/**
 * Returns a status-change function. Workflow tasks refuse "completed" - the error is shown
 * with an action that opens the related record.
 */
export function useTaskStatusChange() {
  const tx = useTx();
  const router = useRouter();
  const { submit, pending } = useSubmit();

  const change = useCallback(
    async (task: WarehouseTask, status: TaskStatus) => {
      if (task.status === status) return null;
      const res = await submit(() => tx.setTaskStatus(task.id, status), {
        success: `${task.number} moved to ${TASK_STATUS_LABELS[status]}`,
        delay: 150,
        errorToast: false,
      });
      if (res && !res.ok) {
        const link = task.link;
        toast.error(res.error, {
          duration: 9000,
          action: link ? { label: "Open record", onClick: () => router.push(taskLinkHref(link)) } : undefined,
        });
      }
      return res;
    },
    [router, submit, tx],
  );

  return { change, pending };
}
