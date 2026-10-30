import type { ID } from "@/types";
import type { ReportKind } from "@/lib/mock-ai/types";
import type { Formatter } from "@/lib/format";
import { titleCase } from "@/lib/format";

export type { ReportKind };

export const REPORT_KINDS: { kind: ReportKind; label: string; description: string }[] = [
  { kind: "inventory-summary", label: "Inventory Summary", description: "Stock position, value and status per product" },
  { kind: "stock-movement", label: "Stock Movement", description: "Every stock in / out movement in the period" },
  { kind: "low-stock", label: "Low Stock", description: "Products at or below their reorder level" },
  { kind: "purchase-orders", label: "Purchase Orders", description: "Supplier orders raised in the period" },
  { kind: "sales-orders", label: "Sales Orders", description: "Customer orders raised in the period" },
  { kind: "warehouse-performance", label: "Warehouse Performance", description: "Throughput, cycle time and utilisation per warehouse" },
];

export const isReportKind = (v: string | null | undefined): v is ReportKind => REPORT_KINDS.some((r) => r.kind === v);

export interface ReportParams {
  report: ReportKind;
  scope: ID | "all";
  from: string;
  to: string;
  /** "all" or a product category */
  category: string;
}

export type CellFormat = "text" | "number" | "money" | "percent" | "date" | "datetime" | "status" | "signed" | "days";

export interface ReportColumn {
  id: string;
  header: string;
  format: CellFormat;
}

export type ReportCell = string | number | null;

export interface ReportKpi {
  id: string;
  label: string;
  value: number;
  format: "number" | "money" | "percent" | "days";
  hint?: string;
  tone?: "primary" | "info" | "success" | "warning" | "danger" | "teal";
}

export type ReportChart =
  | {
      kind: "bars" | "line";
      title: string;
      description?: string;
      xKey: string;
      series: { key: string; name: string; color: string }[];
      data: Record<string, string | number>[];
      valueFormat: "number" | "money";
    }
  | {
      kind: "hbar";
      title: string;
      description?: string;
      seriesName: string;
      data: { name: string; value: number }[];
      valueFormat: "number" | "money" | "percent";
    };

export interface ReportResult {
  kind: ReportKind;
  title: string;
  description: string;
  kpis: ReportKpi[];
  chart: ReportChart;
  columns: ReportColumn[];
  rows: ReportCell[][];
  /** short footnote explaining definitions used */
  notes: string[];
}

export function formatCell(fmt: Formatter, format: CellFormat | ReportKpi["format"], v: ReportCell): string {
  if (v === null || v === undefined || v === "") return "—";
  switch (format) {
    case "number":
      return fmt.number(Number(v));
    case "money":
      return fmt.money(Number(v));
    case "percent":
      return `${Math.round(Number(v))}%`;
    case "date":
      return fmt.date(String(v));
    case "datetime":
      return fmt.dateTime(String(v));
    case "signed": {
      const n = Number(v);
      return n === 0 ? "0" : `${n > 0 ? "+" : "−"}${fmt.number(Math.abs(n))}`;
    }
    case "days":
      return `${Number(v).toFixed(1)} d`;
    case "status":
      return titleCase(String(v));
    default:
      return String(v);
  }
}

/** Raw value for CSV: numbers stay numeric, dates are formatted for humans. */
export function csvCell(fmt: Formatter, format: CellFormat, v: ReportCell): string | number | null {
  if (v === null) return null;
  if (format === "date" || format === "datetime" || format === "status") return formatCell(fmt, format, v);
  return v;
}
