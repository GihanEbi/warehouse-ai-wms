"use client";

import { toast } from "sonner";
import type { AppSettings } from "@/types";
import { Switch } from "@/components/ui/switch";
import { useWmsStore } from "@/stores/wms-store";
import { cn } from "@/lib/utils";

/** Applies a settings patch immediately and shows one (de-duplicated) confirmation toast. */
export function useSaveSettings() {
  const update = useWmsStore((s) => s.updateSettings);
  return (patch: Partial<AppSettings>) => {
    update(patch);
    toast.success("Settings saved", { id: "settings-saved", duration: 1800 });
  };
}

/** A label + description + control row used by every settings section. */
export function SettingRow({
  title,
  description,
  htmlFor,
  children,
  className,
}: {
  title: string;
  description?: React.ReactNode;
  htmlFor?: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("flex flex-col gap-2 py-4 first:pt-0 last:pb-0 sm:flex-row sm:items-center sm:justify-between sm:gap-6", className)}>
      <div className="min-w-0 sm:max-w-md">
        <label htmlFor={htmlFor} className="text-sm font-medium">
          {title}
        </label>
        {description && <p className="mt-0.5 text-xs text-muted-foreground">{description}</p>}
      </div>
      <div className="min-w-0 sm:w-72 sm:shrink-0">{children}</div>
    </div>
  );
}

export function SettingSwitch({
  id,
  title,
  description,
  checked,
  onChange,
  disabled,
}: {
  id: string;
  title: string;
  description?: React.ReactNode;
  checked: boolean;
  onChange: (v: boolean) => void;
  disabled?: boolean;
}) {
  return (
    <div className="flex items-center justify-between gap-4 py-4 first:pt-0 last:pb-0">
      <div className="min-w-0">
        <label htmlFor={id} className="text-sm font-medium">
          {title}
        </label>
        {description && <p className="mt-0.5 text-xs text-muted-foreground">{description}</p>}
      </div>
      <Switch id={id} data-testid={id} checked={checked} onCheckedChange={onChange} disabled={disabled} aria-label={title} />
    </div>
  );
}
