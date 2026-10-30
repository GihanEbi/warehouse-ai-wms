"use client";

import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { DateRangePicker } from "@/components/shared/date-range-picker";
import { FilterDropdown } from "@/components/shared/form-controls";
import { PageHeader } from "@/components/shared/page-header";
import { WarehouseSelector } from "@/components/shared/selectors";
import { EmptyState } from "@/components/shared/states";
import { useData, usePermission, useSettings, useWarehouseScope } from "@/hooks/use-wms";
import { useWmsStore } from "@/stores/wms-store";
import { PRODUCT_CATEGORIES } from "@/lib/constants";
import { Lock } from "lucide-react";
import { buildReport } from "./build";
import { PrintButton, ReportBody } from "./report-view";
import { REPORT_KINDS, isReportKind, type ReportKind, type ReportParams } from "./types";

export function ReportsPage() {
  const data = useData();
  const settings = useSettings();
  const { can } = usePermission();
  const search = useSearchParams();
  const [scope, setScope] = useWarehouseScope();
  const range = useWmsStore((s) => s.dateRange);
  const setRange = useWmsStore((s) => s.setDateRange);
  const [report, setReport] = useState<ReportKind>("inventory-summary");
  const [category, setCategory] = useState("all");

  const param = search.get("report");
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- sync tab with the ?report= deep link
    if (isReportKind(param)) setReport(param);
  }, [param]);

  const params = useMemo<ReportParams>(() => ({ report, scope, from: range.from, to: range.to, category }), [report, scope, range.from, range.to, category]);
  const result = useMemo(() => buildReport(data, params, settings), [data, params, settings]);
  const current = REPORT_KINDS.find((r) => r.kind === report)!;

  if (!can("reports.view")) {
    return (
      <>
        <PageHeader title="Reports & Analytics" />
        <EmptyState icon={Lock} title="Reports are not available for your role" description="Switch to a manager or administrator role to view reports." />
      </>
    );
  }

  return (
    <div className="space-y-5">
      <PageHeader
        title="Reports & Analytics"
        description={current.description}
        actions={<PrintButton params={params} />}
      />

      <Tabs value={report} onValueChange={(v) => setReport(v as ReportKind)}>
        <div className="-mx-4 overflow-x-auto px-4 sm:mx-0 sm:px-0">
          <TabsList className="w-max" aria-label="Report type">
            {REPORT_KINDS.map((r) => (
              <TabsTrigger key={r.kind} value={r.kind} data-testid={`report-tab-${r.kind}`} className="flex-none px-3">
                {r.label}
              </TabsTrigger>
            ))}
          </TabsList>
        </div>
      </Tabs>

      <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center" data-testid="report-filters">
        <DateRangePicker value={range} onChange={setRange} />
        <label className="flex items-center gap-2 text-xs text-muted-foreground">
          <span className="shrink-0">Warehouse</span>
          <WarehouseSelector value={scope} onChange={setScope} includeAll className="min-w-[11rem] flex-1 text-foreground" />
        </label>
        <FilterDropdown
          label="Category"
          value={category}
          onChange={setCategory}
          options={PRODUCT_CATEGORIES.map((c) => ({ value: c, label: c }))}
          allLabel="All categories"
        />
      </div>

      <ReportBody result={result} params={params} data={data} />
    </div>
  );
}
