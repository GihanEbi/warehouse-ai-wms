"use client";

import { Download } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { downloadCsv, type CsvValue } from "@/lib/csv";

/**
 * Generates a CSV download from the *current* records.
 * `getData` is called on click so the export always reflects the latest filtered state.
 */
export function ExportButton({
  filename,
  getData,
  label = "Export CSV",
  variant = "outline",
  size = "default",
}: {
  filename: string;
  getData: () => { headers: string[]; rows: CsvValue[][] };
  label?: string;
  variant?: "outline" | "secondary" | "ghost" | "default";
  size?: "default" | "sm";
}) {
  return (
    <Button
      variant={variant}
      size={size}
      onClick={() => {
        const { headers, rows } = getData();
        if (rows.length === 0) {
          toast.warning("Nothing to export for the current filters.");
          return;
        }
        downloadCsv(filename, headers, rows);
        toast.success(`Exported ${rows.length} row${rows.length === 1 ? "" : "s"} to ${filename}.csv`);
      }}
      data-testid="export-csv"
    >
      <Download />
      {label}
    </Button>
  );
}
