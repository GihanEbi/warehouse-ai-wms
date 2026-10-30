"use client";

import { useMemo } from "react";
import { Warehouse as WarehouseIcon } from "lucide-react";
import type { ID } from "@/types";
import { useData } from "@/hooks/use-wms";
import { NativeSelect } from "./form-controls";
import { cn } from "@/lib/utils";

/** Warehouse picker. With `includeAll` it yields "all" for the all-warehouses scope. */
export function WarehouseSelector({
  value,
  onChange,
  includeAll,
  onlyActive = true,
  className,
  id,
  invalid,
  allLabel = "All warehouses",
  placeholder,
  disabled,
  variant = "field",
}: {
  value: ID | "all" | "";
  onChange: (v: string) => void;
  includeAll?: boolean;
  onlyActive?: boolean;
  className?: string;
  id?: string;
  invalid?: boolean;
  allLabel?: string;
  placeholder?: string;
  disabled?: boolean;
  variant?: "field" | "header";
}) {
  const data = useData();
  const options = useMemo(() => {
    const list = data.warehouses
      .filter((w) => !onlyActive || w.status === "active" || w.id === value)
      .map((w) => ({ value: w.id, label: `${w.name} (${w.code})` }));
    return includeAll ? [{ value: "all", label: allLabel }, ...list] : list;
  }, [data.warehouses, includeAll, onlyActive, value, allLabel]);

  if (variant === "header") {
    return (
      <div className={cn("relative", className)}>
        <WarehouseIcon className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
        <NativeSelect
          id={id}
          aria-label="Warehouse"
          data-testid="warehouse-selector"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          options={options}
          className="w-full [&>select]:pl-8"
        />
      </div>
    );
  }
  return (
    <NativeSelect
      id={id}
      aria-label="Warehouse"
      value={value}
      onChange={(e) => onChange(e.target.value)}
      options={options}
      placeholder={placeholder}
      invalid={invalid}
      disabled={disabled}
      className={className}
    />
  );
}
