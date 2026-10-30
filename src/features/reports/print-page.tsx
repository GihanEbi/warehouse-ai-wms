"use client";

import { useMemo } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { ArrowLeft, Printer, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useData, useFormat, useSettings } from "@/hooks/use-wms";
import { summarizeReport } from "@/lib/mock-ai/api";
import { useWmsStore } from "@/stores/wms-store";
import { buildReport } from "./build";
import { formatCell, isReportKind, type ReportParams } from "./types";

/** Clean, white, print-first report view. Opened from /reports ("Print"). */
export function ReportPrintPage() {
  const data = useData();
  const settings = useSettings();
  const fmt = useFormat();
  const search = useSearchParams();
  const defaultRange = useWmsStore((s) => s.dateRange);

  const params = useMemo<ReportParams>(() => {
    const kind = search.get("report");
    const wh = search.get("warehouse") ?? "all";
    return {
      report: isReportKind(kind) ? kind : "inventory-summary",
      scope: wh !== "all" && data.warehouses.some((w) => w.id === wh) ? wh : "all",
      from: search.get("from") || defaultRange.from,
      to: search.get("to") || defaultRange.to,
      category: search.get("category") || "all",
    };
  }, [search, data.warehouses, defaultRange.from, defaultRange.to]);

  const result = useMemo(() => buildReport(data, params, settings), [data, params, settings]);
  const bullets = useMemo(
    () => summarizeReport(data, { report: params.report, scope: params.scope, from: params.from, to: params.to, category: params.category === "all" ? undefined : params.category }),
    [data, params],
  );
  const warehouse = params.scope === "all" ? "All warehouses" : (data.warehouses.find((w) => w.id === params.scope)?.name ?? "—");
  const rightAlign = (f: string) => ["number", "money", "percent", "signed", "days"].includes(f);

  return (
    <div data-testid="print-view">
      <div className="mb-4 flex items-center justify-between gap-2 print:hidden" data-print-hidden="true">
        <Link href={`/reports?report=${params.report}`} className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground">
          <ArrowLeft className="size-4" />
          Back to reports
        </Link>
        <Button onClick={() => window.print()} data-testid="print-now">
          <Printer />
          Print
        </Button>
      </div>

      <article className="print-area mx-auto max-w-5xl rounded-xl border border-neutral-200 bg-white p-6 text-black shadow-card print:max-w-none print:rounded-none print:border-0 print:p-0 print:shadow-none sm:p-10">
        <header className="flex flex-col gap-1 border-b-2 border-neutral-900 pb-4 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="text-xs font-semibold tracking-widest text-neutral-500 uppercase">{settings.companyName}</p>
            <h1 className="text-2xl font-bold" data-testid="print-title">
              {result.title} Report
            </h1>
          </div>
          <dl className="text-xs text-neutral-600 sm:text-right">
            <div>
              <dt className="inline font-medium">Period: </dt>
              <dd className="inline">
                {params.report === "inventory-summary" || params.report === "low-stock" ? `As at ${fmt.dateTime(new Date())}` : `${fmt.date(params.from)} – ${fmt.date(params.to)}`}
              </dd>
            </div>
            <div>
              <dt className="inline font-medium">Warehouse: </dt>
              <dd className="inline">{warehouse}</dd>
            </div>
            <div>
              <dt className="inline font-medium">Category: </dt>
              <dd className="inline">{params.category === "all" ? "All categories" : params.category}</dd>
            </div>
            <div>
              <dt className="inline font-medium">Generated: </dt>
              <dd className="inline">{fmt.dateTime(new Date())}</dd>
            </div>
          </dl>
        </header>

        <section className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-4" aria-label="Key figures">
          {result.kpis.map((k) => (
            <div key={k.id} className="rounded-md border border-neutral-300 p-3">
              <p className="text-[11px] text-neutral-500">{k.label}</p>
              <p className="mt-0.5 text-lg font-semibold tabular-nums">{formatCell(fmt, k.format, k.value)}</p>
            </div>
          ))}
        </section>

        <section className="mt-5 rounded-md border border-neutral-300 bg-neutral-50 p-3 text-sm" aria-label="AI summary">
          <h2 className="flex items-center gap-1.5 text-xs font-semibold tracking-wide uppercase">
            <Sparkles className="size-3.5" aria-hidden /> AI summary
          </h2>
          <ul className="mt-1.5 list-disc space-y-0.5 pl-5">
            {bullets.map((b, i) => (
              <li key={i}>{b}</li>
            ))}
          </ul>
          <p className="mt-2 text-[11px] text-neutral-500">Generated automatically from current data; verify before acting.</p>
        </section>

        <section className="mt-5" aria-label="Report table">
          <h2 className="mb-2 text-sm font-semibold">
            Details <span className="font-normal text-neutral-500">({result.rows.length} rows)</span>
          </h2>
          <div className="overflow-x-auto">
            <table className="w-full border-collapse text-xs" data-testid="print-table">
              <thead>
                <tr className="bg-neutral-100">
                  {result.columns.map((c) => (
                    <th key={c.id} scope="col" className={`border border-neutral-300 px-2 py-1.5 font-semibold ${rightAlign(c.format) ? "text-right" : "text-left"}`}>
                      {c.header}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {result.rows.map((r, i) => (
                  <tr key={i} className="break-inside-avoid">
                    {r.map((cell, j) => (
                      <td key={j} className={`border border-neutral-300 px-2 py-1 ${rightAlign(result.columns[j].format) ? "text-right whitespace-nowrap tabular-nums" : ""}`}>
                        {formatCell(fmt, result.columns[j].format, cell)}
                      </td>
                    ))}
                  </tr>
                ))}
                {result.rows.length === 0 && (
                  <tr>
                    <td colSpan={result.columns.length} className="border border-neutral-300 px-2 py-6 text-center text-neutral-500">
                      No data for the selected filters.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </section>

        <footer className="mt-5 border-t border-neutral-300 pt-3 text-[11px] text-neutral-500">
          <ul className="space-y-0.5">
            {result.notes.map((n) => (
              <li key={n}>• {n}</li>
            ))}
          </ul>
          <p className="mt-2">{settings.companyName} · Warehouse AI WMS prototype report</p>
        </footer>
      </article>
    </div>
  );
}
