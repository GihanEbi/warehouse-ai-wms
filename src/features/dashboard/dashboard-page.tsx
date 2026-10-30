"use client";

import { useCallback, useMemo, useState } from "react";
import Link from "next/link";
import {
  Boxes,
  CalendarClock,
  Gauge,
  PackageSearch,
  RefreshCw,
  ShoppingCart,
  TrendingDown,
  Truck,
  Wallet,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { DateRangePicker } from "@/components/shared/date-range-picker";
import { PageHeader, Section } from "@/components/shared/page-header";
import { StatCard } from "@/components/shared/stat-card";
import { GroupedBarChart, HorizontalBarChart, TrendLineChart } from "@/components/charts/charts";
import { useData, useFormat, useSettings, useWarehouseScope } from "@/hooks/use-wms";
import { useWmsStore } from "@/stores/wms-store";
import {
  categoryBreakdown,
  computeKpis,
  orderTrendSeries,
  stockFlowSeries,
  warehouseUtilizationRows,
} from "./metrics";
import {
  AIWidget,
  LowStockWidget,
  PendingPurchaseOrdersWidget,
  RecentMovementsWidget,
  RecentOrdersWidget,
  UpcomingDeliveriesWidget,
} from "./widgets";

const utilTone = (p: number) => (p >= 90 ? "danger" : p >= 75 ? "warning" : "success");
const utilColor = (p: number) => (p >= 90 ? "var(--danger)" : p >= 75 ? "var(--warning)" : "var(--chart-1)");

export function DashboardPage() {
  const data = useData();
  const settings = useSettings();
  const fmt = useFormat();
  const [scope] = useWarehouseScope();
  const range = useWmsStore((s) => s.dateRange);
  const setRange = useWmsStore((s) => s.setDateRange);
  const [now, setNow] = useState(() => new Date());

  const refresh = useCallback(() => {
    setNow(new Date());
    toast.success("Dashboard refreshed");
  }, []);

  const kpis = useMemo(
    () => computeKpis(data, scope, range, settings.lowStockThresholdFactor, now),
    [data, scope, range, settings.lowStockThresholdFactor, now],
  );
  const flow = useMemo(() => stockFlowSeries(data, { scope, range }), [data, scope, range]);
  const trend = useMemo(() => orderTrendSeries(data, scope, range), [data, scope, range]);
  const categories = useMemo(() => categoryBreakdown(data, scope), [data, scope]);
  const utilRows = useMemo(() => warehouseUtilizationRows(data, scope), [data, scope]);

  const scopeName = scope === "all" ? "all warehouses" : (data.warehouses.find((w) => w.id === scope)?.name ?? "warehouse");
  const unitLabel = flow.unit === "day" ? "day" : "week";
  const dispatchDiff = kpis.dispatchedToday - kpis.dispatchedYesterday;

  return (
    <div className="space-y-6" data-testid="dashboard">
      <PageHeader
        title="Dashboard"
        description={`Live operational overview for ${scopeName}`}
        actions={
          <>
            <span className="text-xs text-muted-foreground" data-testid="updated-at">
              Updated {fmt.time(now)}
            </span>
            <DateRangePicker value={range} onChange={setRange} />
            <Button variant="outline" onClick={refresh} data-testid="refresh-dashboard">
              <RefreshCw />
              Refresh
            </Button>
          </>
        }
      />

      {/* KPI cards */}
      <section aria-label="Key performance indicators" className="grid grid-cols-1 gap-3 min-[480px]:grid-cols-2 xl:grid-cols-4">
        <StatCard
          testId="kpi-products"
          title="Total Products"
          value={fmt.number(kpis.activeProducts)}
          description={scope === "all" ? `${fmt.number(kpis.totalProducts)} in catalogue` : "stocked in this warehouse"}
          icon={PackageSearch}
          tone="primary"
          status={{ label: "Active", tone: "success" }}
          href="/products"
        />
        <StatCard
          testId="kpi-quantity"
          title="Total Inventory Quantity"
          value={fmt.number(kpis.physicalQty)}
          description={`${fmt.number(kpis.stagingQty)} staging · ${fmt.number(kpis.returnsQty)} returns`}
          icon={Boxes}
          tone="info"
          trend={{
            value: `${kpis.netChange >= 0 ? "+" : "−"}${fmt.number(Math.abs(kpis.netChange))}`,
            direction: kpis.netChange === 0 ? "flat" : kpis.netChange > 0 ? "up" : "down",
            good: kpis.netChange >= 0,
          }}
          href="/inventory"
        />
        <StatCard
          testId="kpi-value"
          title="Inventory Value"
          value={fmt.moneyCompact(kpis.value)}
          description={fmt.money(kpis.value)}
          icon={Wallet}
          tone="teal"
          href="/reports?report=inventory-summary"
        />
        <StatCard
          testId="kpi-low-stock"
          title="Low Stock Products"
          value={fmt.number(kpis.lowStock)}
          description={kpis.lowStock ? `${kpis.outOfStock} out of stock` : "All above reorder level"}
          icon={TrendingDown}
          tone={kpis.outOfStock > 0 ? "danger" : kpis.lowStock > 0 ? "warning" : "success"}
          status={
            kpis.outOfStock > 0
              ? { label: "Critical", tone: "danger" }
              : kpis.lowStock > 0
                ? { label: "Needs attention", tone: "warning" }
                : { label: "Healthy", tone: "success" }
          }
          href="/inventory?status=attention"
        />
        <StatCard
          testId="kpi-pending-orders"
          title="Pending Orders"
          value={fmt.number(kpis.pendingOrders)}
          description={kpis.urgentOrders ? `${kpis.urgentOrders} high / urgent priority` : "Draft to packed"}
          icon={ShoppingCart}
          tone="primary"
          status={kpis.urgentOrders ? { label: "Priority", tone: "warning" } : undefined}
          href="/orders"
        />
        <StatCard
          testId="kpi-incoming"
          title="Incoming Deliveries"
          value={fmt.number(kpis.incoming)}
          description={kpis.overdueIncoming ? `${kpis.overdueIncoming} overdue · ${fmt.number(kpis.incomingUnits)} units due` : `${fmt.number(kpis.incomingUnits)} units due`}
          icon={CalendarClock}
          tone="info"
          status={kpis.overdueIncoming ? { label: "Overdue", tone: "danger" } : undefined}
          href="/purchase-orders"
        />
        <StatCard
          testId="kpi-dispatched-today"
          title="Orders Dispatched Today"
          value={fmt.number(kpis.dispatchedToday)}
          description={`${fmt.number(kpis.dispatchedYesterday)} yesterday`}
          icon={Truck}
          tone="success"
          trend={dispatchDiff === 0 ? undefined : { value: `${dispatchDiff > 0 ? "+" : "−"}${Math.abs(dispatchDiff)}`, direction: dispatchDiff > 0 ? "up" : "down", good: dispatchDiff > 0 }}
          href="/shipping"
        />
        <StatCard
          testId="kpi-utilization"
          title="Warehouse Utilization"
          value={`${kpis.utilization}%`}
          description={kpis.utilization >= 90 ? "Near capacity" : kpis.utilization >= 75 ? "Getting full" : "Healthy headroom"}
          icon={Gauge}
          tone={utilTone(kpis.utilization)}
          status={{ label: kpis.utilization >= 90 ? "Critical" : kpis.utilization >= 75 ? "High" : "Normal", tone: utilTone(kpis.utilization) }}
          href="/warehouses"
        />
      </section>

      {/* Charts */}
      <section aria-label="Charts" className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Section
          title="Stock In vs Stock Out"
          description={`Units per ${unitLabel} · ${fmt.number(flow.totalIn)} in, ${fmt.number(flow.totalOut)} out`}
          actions={<ChartLink href="/reports?report=stock-movement" />}
        >
          <GroupedBarChart
            testId="chart-stock-flow"
            label="Stock in versus stock out by period"
            data={flow.points.map((p) => ({ label: p.label, in: p.in, out: p.out }))}
            xKey="label"
            series={[
              { key: "in", name: "Stock in", color: "var(--chart-2)" },
              { key: "out", name: "Stock out", color: "var(--chart-1)" },
            ]}
            valueFormat={(v) => `${fmt.number(v)} units`}
          />
        </Section>
        <Section
          title="Order Fulfillment Trend"
          description={`Orders per ${unitLabel} · ${fmt.number(trend.created)} created, ${fmt.number(trend.dispatched)} dispatched`}
          actions={<ChartLink href="/reports?report=sales-orders" />}
        >
          <TrendLineChart
            testId="chart-order-trend"
            label="Orders created versus dispatched by period"
            data={trend.points.map((p) => ({ label: p.label, created: p.created, dispatched: p.dispatched }))}
            xKey="label"
            series={[
              { key: "created", name: "Orders created", color: "var(--chart-1)" },
              { key: "dispatched", name: "Orders dispatched", color: "var(--chart-2)" },
            ]}
            valueFormat={(v) => `${fmt.number(v)} orders`}
          />
        </Section>
        <Section title="Inventory by Category" description="Stock value at unit cost" actions={<ChartLink href="/reports?report=inventory-summary" />}>
          <HorizontalBarChart
            testId="chart-category"
            label="Inventory value by category"
            seriesName="Value"
            data={categories.map((c) => ({ name: c.category, value: Math.round(c.value) }))}
            valueFormat={(v) => fmt.moneyCompact(v)}
            nameWidth={140}
          />
        </Section>
        <Section title="Warehouse Utilization" description="Storage bins used vs capacity" actions={<ChartLink href="/warehouses" label="Warehouses" />}>
          <HorizontalBarChart
            testId="chart-utilization"
            label="Utilization by warehouse"
            seriesName="Utilization"
            data={utilRows.map((u) => ({ name: u.name, value: u.percent, color: utilColor(u.percent) }))}
            valueFormat={(v) => `${v}%`}
            maxValue={100}
            nameWidth={140}
          />
          <p className="mt-2 text-xs text-muted-foreground">Amber from 75%, red from 90% of capacity.</p>
        </Section>
      </section>

      {/* Widgets */}
      <section aria-label="Widgets" className="grid grid-cols-1 gap-4 lg:grid-cols-2 xl:grid-cols-3">
        <RecentMovementsWidget scope={scope} range={range} />
        <LowStockWidget scope={scope} />
        <PendingPurchaseOrdersWidget scope={scope} />
        <RecentOrdersWidget scope={scope} range={range} />
        <UpcomingDeliveriesWidget scope={scope} now={now} />
        <AIWidget scope={scope} />
      </section>
    </div>
  );
}

function ChartLink({ href, label = "Details" }: { href: string; label?: string }) {
  return (
    <Link href={href} className="text-xs font-medium text-primary hover:underline">
      {label}
    </Link>
  );
}
