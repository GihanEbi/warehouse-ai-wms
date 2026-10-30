"use client";

import { useState } from "react";
import type { User } from "@/types";
import { ConfirmationDialog } from "@/components/shared/dialogs";
import { useTx } from "@/hooks/use-wms";
import { useSubmit } from "@/hooks/use-submit";

/**
 * Activate / deactivate flow. Deactivation asks for confirmation; the workflow protects the
 * last administrator and the currently signed-in user (its error is surfaced as a toast).
 */
export function useUserStatus() {
  const tx = useTx();
  const { submit } = useSubmit();
  const [target, setTarget] = useState<User | null>(null);

  const toggle = async (u: User) => {
    if (u.status === "active") {
      setTarget(u);
      return;
    }
    await submit(() => tx.setUserStatus(u.id, "active"), { success: `${u.name} activated`, delay: 200 });
  };

  const dialog = (
    <ConfirmationDialog
      open={!!target}
      onOpenChange={(o) => !o && setTarget(null)}
      title={`Deactivate ${target?.name ?? "user"}?`}
      description="They will no longer appear in assignee lists or the demo user switcher. You can reactivate them at any time."
      confirmLabel="Deactivate"
      destructive
      onConfirm={async () => {
        if (!target) return false;
        const res = await submit(() => tx.setUserStatus(target.id, "inactive"), { success: `${target.name} deactivated` });
        return !!res?.ok;
      }}
    />
  );

  return { toggle, dialog };
}
