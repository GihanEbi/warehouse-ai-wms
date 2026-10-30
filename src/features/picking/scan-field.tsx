"use client";

import { Check, ScanBarcode, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { FormField } from "@/components/shared/form-controls";
import { cn } from "@/lib/utils";

export const sameCode = (a: string, b: string) => a.trim().toLowerCase() === b.trim().toLowerCase();

/**
 * Mock barcode scanner input: type/paste a code (or click "Simulate scan" to fill the
 * expected code) and see immediately whether it matches.
 */
export function ScanField({
  id,
  label,
  expected,
  value,
  onChange,
  error,
  hint,
  required = true,
  testId,
  compact,
}: {
  id: string;
  label: string;
  expected: string;
  value: string;
  onChange: (v: string) => void;
  error?: string;
  hint?: string;
  required?: boolean;
  testId?: string;
  compact?: boolean;
}) {
  const filled = value.trim().length > 0;
  const match = filled && sameCode(value, expected);
  const mismatch = filled && !match;
  const input = (
    <div className="flex gap-2">
      <div className="relative min-w-0 flex-1">
        <Input
          id={id}
          aria-label={label}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder="Scan or type code…"
          autoComplete="off"
          inputMode="numeric"
          aria-invalid={mismatch || !!error}
          data-testid={testId}
          className={cn("pr-8 font-mono", compact ? "h-8" : "h-10 text-base", match && "border-success")}
        />
        {match && <Check className="absolute top-1/2 right-2 size-4 -translate-y-1/2 text-success" aria-label="Scan matches" />}
        {mismatch && <X className="absolute top-1/2 right-2 size-4 -translate-y-1/2 text-danger" aria-label="Scan does not match" />}
      </div>
      <Button
        type="button"
        variant="outline"
        size={compact ? "sm" : "lg"}
        onClick={() => onChange(expected)}
        data-testid={testId ? `${testId}-simulate` : undefined}
        className={compact ? undefined : "h-10"}
      >
        <ScanBarcode /> Simulate scan
      </Button>
    </div>
  );
  if (compact) return input;
  return (
    <FormField id={id} label={label} required={required} error={error ?? (mismatch ? "Scanned code does not match" : undefined)} hint={hint}>
      {input}
      {match && (
        <p className="flex items-center gap-1 text-xs text-success" data-testid={testId ? `${testId}-ok` : undefined}>
          <Check className="size-3.5" /> Verified
        </p>
      )}
    </FormField>
  );
}
