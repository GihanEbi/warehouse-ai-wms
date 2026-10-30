"use client";

import { useMemo } from "react";
import { FileBarChart, Info, Printer, Sparkles } from "lucide-react";
import { GroupedBarChart, HorizontalBarChart, TrendLineChart } from "@/components/charts/charts";
import { DataTable, type Column } from "@/components/shared/data-table";
import { ExportButton } from "@/components/shared/export-button";
import { Section } from "@/components/shared/page-header";
import { StatCard } from "@/components/shared/stat-card";
import { StatusBadge } from "@/components/shared/status-badge";
import { useFormat } from "@/hooks/use-wms";
import type { Formatter } from "@/lib/format";
import { summarizeReport } from "@/lib/mock-ai/api";
import type { WmsData } from "@/types";
import { LinkButton } from "@/components/shared/link-button";
import { cn } from "@/lib/utils";
import {
  csvCell,
  formatCell,
  type ReportCell,
  type ReportChart,
  type ReportColumn,
  type ReportParams,
  type ReportResult,
} from "./types";

export function printHref(p: ReportParams) {
  const qs = new URLSearchParams({ report: p.report, warehouse: p.scope, from: p.from, to: p.to, category: p.category });
  return `/reports/print?${qs.toString()}`;
}

export function reportCsv(fmt: Formatter, result: ReportResult) {
  return {
    headers: result.columns.map((c) => c.header),
    rows: result.rows.map((r) => r.map((cell, i) => csvCell(fmt, result.columns[i].format, cell))),
  };
}

/* ------------------------------------------------------------------ AI summary */

export function AiSummaryCard({ data, params }: { data: WmsData; params: ReportParams }) {
  const bullets = useMemo(
    () => summarizeReport(data, { report: params.report, scope: params.scope, from: params.from, to: params.to, category: params.category === "all" ? undefined : params.category }),
    [data, params],
  );
  return (
    <section className="rounded-xl border border-primary/25 bg-primary-soft/60 p-4 shadow-card" data-testid="ai-summary" aria-label="AI summary">
      <h3 className="flex items-center gap-2 text-sm font-semibold text-primary">
        <Sparkles className="size-4" aria-hidden />
        AI Summary
      </h3>
      <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-foreground/90">
        {bullets.map((b, i) => (
          <li key={i}>{b}</li>
        ))}
      </ul>
      <p className="mt-3 flex items-start gap-1.5 text-xs text-muted-foreground">
        <Info className="mt-0.5 size-3.5 shrink-0" aria-hidden />
        Generated automatically from the current data in this prototype. Verify figures in the table before acting on them.
      </p>
    </section>
  );
}

/* ----------------------------------------------------------------------- chart */

export function ReportChartView({ chart }: { chart: ReportChart }) {
  const fmt = useFormat();
  const vf = (kind: "number" | "money" | "percent") => (v: number) => (kind === "money" ? fmt.moneyCompact(v) : kind === "percent" ? `${Math.round(v)}%` : fmt.number(v));
  if (chart.kind === "hbar") {
    return <HorizontalBarChart testId="report-chart" label={chart.title} data={chart.data} seriesName={chart.seriesName} valueFormat={vf(chart.valueFormat)} nameWidth={150} />;
  }
  if (chart.kind === "line") {
    return <TrendLineChart testId="report-chart" label={chart.title} data={chart.data} xKey={chart.xKey} series={chart.series} valueFormat={vf(chart.valueFormat)} />;
  }
  return <GroupedBarChart testId="report-chart" label={chart.title} data={chart.data} xKey={chart.xKey} series={chart.series} valueFormat={vf(chart.valueFormat)} />;
}

/* ----------------------------------------------------------------------- body */

interface TableRow {
  id: string;
  cells: ReportCell[];
}

export function ReportBody({ result, params, data }: { result: ReportResult; params: ReportParams; data: WmsData }) {
  const fmt = useFormat();
  const tableRows = useMemo(() => result.rows.map((cells, i) => ({ id: String(i), cells })), [result.rows]);
  const columns = useMemo<Column<TableRow>[]>(
    () =>
      result.columns.map((c: ReportColumn, i) => ({
        id: c.id,
        header: c.header,
        align: ["number", "money", "percent", "signed", "days"].includes(c.format) ? "right" : "left",
        sortValue: (row) => row.cells[i],
        cell: (row) =>
          c.format === "status" && typeof row.cells[i] === "string" ? (
            <StatusBadge status={String(row.cells[i])} />
          ) : (
            <span className={cn("whitespace-nowrap", c.format === "signed" && Number(row.cells[i]) > 0 && "text-success", c.format === "signed" && Number(row.cells[i]) < 0 && "text-danger", c.format !== "text" && c.format !== "date" && c.format !== "datetime" && "tabular-nums")}>
              {formatCell(fmt, c.format, row.cells[i])}
            </span>
          ),
      })),
    [result.columns, fmt],
  );

  return (
    <div className="space-y-4" data-testid={`report-${result.kind}`}>
      <section aria-label="Report KPIs" className="grid grid-cols-2 gap-3 xl:grid-cols-4">
        {result.kpis.map((k) => (
          <StatCard key={k.id} testId={`report-kpi-${k.id}`} title={k.label} value={formatCell(fmt, k.format, k.value)} description={k.hint} icon={FileBarChart} tone={k.tone ?? "primary"} />
        ))}
      </section>

      <div className="grid gap-4 xl:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
        <Section title={result.chart.title} description={result.chart.description}>
          <ReportChartView chart={result.chart} />
        </Section>
        <AiSummaryCard data={data} params={params} />
      </div>

      <Section
        title="Details"
        description={`${fmt.number(result.rows.length)} row${result.rows.length === 1 ? "" : "s"}`}
        contentClassName="p-0"
        actions={<ExportButton filename={`${result.kind}-report`} size="sm" getData={() => reportCsv(fmt, result)} />}
      >
        <DataTable
          testId="report-table"
          data={tableRows}
          columns={columns}
          getRowId={(r) => r.id}
          pageSize={10}
          empty={{ title: "No data for this report", description: "Try a wider date range, another warehouse or category." }}
        />
      </Section>

      {result.notes.length > 0 && (
        <ul className="space-y-0.5 text-xs text-muted-foreground" aria-label="Report definitions">
          {result.notes.map((n) => (
            <li key={n}>• {n}</li>
          ))}
        </ul>
      )}
    </div>
  );
}

export function PrintButton({ params }: { params: ReportParams }) {
  return (
    <LinkButton href={printHref(params)} target="_blank" rel="noopener" variant="outline" data-testid="print-report">
      <Printer />
      Print
    </LinkButton>
  );
}
