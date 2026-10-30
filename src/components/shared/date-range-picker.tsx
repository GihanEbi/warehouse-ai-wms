"use client";

import { useState } from "react";
import { CalendarDays } from "lucide-react";
import { endOfDay, format, startOfDay, subDays } from "date-fns";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { useFormat } from "@/hooks/use-wms";
import type { DateRange } from "@/stores/wms-store";
import { cn } from "@/lib/utils";

const PRESETS: { key: DateRange["preset"]; label: string; days: number }[] = [
  { key: "7d", label: "Last 7 days", days: 7 },
  { key: "30d", label: "Last 30 days", days: 30 },
  { key: "90d", label: "Last 90 days", days: 90 },
];

export function presetRange(preset: "7d" | "30d" | "90d"): DateRange {
  const days = PRESETS.find((p) => p.key === preset)!.days;
  const now = new Date();
  return { from: startOfDay(subDays(now, days - 1)).toISOString(), to: endOfDay(now).toISOString(), preset };
}

/** Preset + custom date range picker. Values are inclusive ISO timestamps. */
export function DateRangePicker({ value, onChange, className }: { value: DateRange; onChange: (r: DateRange) => void; className?: string }) {
  const fmt = useFormat();
  const [open, setOpen] = useState(false);
  const [from, setFrom] = useState(format(new Date(value.from), "yyyy-MM-dd"));
  const [to, setTo] = useState(format(new Date(value.to), "yyyy-MM-dd"));
  const invalid = !from || !to || from > to;
  const label = value.preset === "custom" ? `${fmt.date(value.from)} – ${fmt.date(value.to)}` : PRESETS.find((p) => p.key === value.preset)?.label;

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger
        data-testid="date-range-picker"
        className={cn(
          "inline-flex h-8 items-center gap-2 rounded-lg border border-input bg-transparent px-2.5 text-sm outline-none transition-colors hover:bg-muted focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 dark:bg-input/30",
          className,
        )}
      >
        <CalendarDays className="size-4 text-muted-foreground" aria-hidden />
        <span className="truncate">{label}</span>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-72 gap-3">
        <div className="grid gap-1">
          {PRESETS.map((p) => (
            <button
              key={p.key}
              type="button"
              onClick={() => {
                onChange(presetRange(p.key as "7d" | "30d" | "90d"));
                setFrom(format(subDays(new Date(), p.days - 1), "yyyy-MM-dd"));
                setTo(format(new Date(), "yyyy-MM-dd"));
                setOpen(false);
              }}
              className={cn("rounded-md px-2 py-1.5 text-left text-sm hover:bg-accent", value.preset === p.key && "bg-accent font-medium")}
            >
              {p.label}
            </button>
          ))}
        </div>
        <div className="space-y-2 border-t pt-3">
          <p className="text-xs font-medium text-muted-foreground">Custom range</p>
          <div className="grid grid-cols-2 gap-2">
            <input type="date" aria-label="From date" value={from} max={to || undefined} onChange={(e) => setFrom(e.target.value)} className="h-8 rounded-md border border-input bg-transparent px-2 text-sm dark:bg-input/30" />
            <input type="date" aria-label="To date" value={to} min={from || undefined} onChange={(e) => setTo(e.target.value)} className="h-8 rounded-md border border-input bg-transparent px-2 text-sm dark:bg-input/30" />
          </div>
          <Button
            size="sm"
            className="w-full"
            disabled={invalid}
            onClick={() => {
              onChange({ from: startOfDay(new Date(`${from}T00:00:00`)).toISOString(), to: endOfDay(new Date(`${to}T00:00:00`)).toISOString(), preset: "custom" });
              setOpen(false);
            }}
          >
            Apply range
          </Button>
        </div>
      </PopoverContent>
    </Popover>
  );
}
