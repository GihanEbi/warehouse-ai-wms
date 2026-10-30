"use client";

import { useRef, useState } from "react";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { cn } from "@/lib/utils";

const SIZES = { sm: "sm:max-w-sm", md: "sm:max-w-lg", lg: "sm:max-w-2xl", xl: "sm:max-w-4xl" } as const;

/**
 * Confirmation for destructive / transactional actions.
 * `onConfirm` may be async; the dialog locks while it runs and closes afterwards
 * (return `false` to keep it open).
 */
export function ConfirmationDialog({
  open,
  onOpenChange,
  title,
  description,
  confirmLabel = "Confirm",
  cancelLabel = "Cancel",
  destructive,
  onConfirm,
  children,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description?: React.ReactNode;
  confirmLabel?: string;
  cancelLabel?: string;
  destructive?: boolean;
  onConfirm: () => void | boolean | Promise<void | boolean>;
  children?: React.ReactNode;
}) {
  const [pending, setPending] = useState(false);
  const lock = useRef(false);

  async function handleConfirm() {
    if (lock.current) return;
    lock.current = true;
    setPending(true);
    try {
      const result = await onConfirm();
      if (result !== false) onOpenChange(false);
    } finally {
      lock.current = false;
      setPending(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={(o) => !pending && onOpenChange(o)}>
      <DialogContent className="sm:max-w-md" data-testid="confirmation-dialog">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          {description && <DialogDescription>{description}</DialogDescription>}
        </DialogHeader>
        {children}
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={pending}>
            {cancelLabel}
          </Button>
          <Button variant={destructive ? "destructive" : "default"} onClick={handleConfirm} disabled={pending} data-testid="confirm-action">
            {pending && <Loader2 className="animate-spin" />}
            {confirmLabel}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/**
 * Dialog hosting a <form>. Pass `onSubmit={handleSubmit(fn)}` from react-hook-form.
 * Submit is disabled while `pending` so a form cannot be submitted twice.
 */
export function FormDialog({
  open,
  onOpenChange,
  title,
  description,
  submitLabel = "Save",
  pending,
  onSubmit,
  size = "md",
  children,
  submitDisabled,
  testId,
  submitTestId,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description?: string;
  submitLabel?: string;
  pending?: boolean;
  onSubmit: (e: React.FormEvent<HTMLFormElement>) => void;
  size?: keyof typeof SIZES;
  children: React.ReactNode;
  submitDisabled?: boolean;
  testId?: string;
  /** test id of the submit button (default `form-submit`) */
  submitTestId?: string;
}) {
  return (
    <Dialog open={open} onOpenChange={(o) => !pending && onOpenChange(o)}>
      <DialogContent className={cn("max-h-[92dvh] gap-0 overflow-hidden p-0", SIZES[size])} data-testid={testId ?? "form-dialog"}>
        <form onSubmit={onSubmit} noValidate className="flex max-h-[92dvh] flex-col">
          <DialogHeader className="border-b p-4 pr-12">
            <DialogTitle className="text-base">{title}</DialogTitle>
            {description && <DialogDescription>{description}</DialogDescription>}
          </DialogHeader>
          <div className="min-h-0 flex-1 space-y-4 overflow-y-auto p-4">{children}</div>
          <DialogFooter className="mx-0 mb-0 rounded-b-xl">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={pending}>
              Cancel
            </Button>
            <Button type="submit" disabled={pending || submitDisabled} data-testid={submitTestId ?? "form-submit"}>
              {pending && <Loader2 className="animate-spin" />}
              {submitLabel}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

/** Right-hand detail panel (bottom-friendly on mobile via full width). */
export function DetailDrawer({
  open,
  onOpenChange,
  title,
  description,
  children,
  footer,
  width = "sm:max-w-md",
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description?: string;
  children: React.ReactNode;
  footer?: React.ReactNode;
  width?: string;
}) {
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className={cn("w-full gap-0 p-0", width)} data-testid="detail-drawer">
        <SheetHeader className="border-b p-4 pr-12">
          <SheetTitle>{title}</SheetTitle>
          {description && <SheetDescription>{description}</SheetDescription>}
        </SheetHeader>
        <div className="min-h-0 flex-1 overflow-y-auto p-4">{children}</div>
        {footer && <SheetFooter className="border-t p-4">{footer}</SheetFooter>}
      </SheetContent>
    </Sheet>
  );
}
