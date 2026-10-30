"use client";

import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  LabelList,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import {
  AXIS_LINE,
  AXIS_TICK,
  ChartDataTable,
  ChartEmpty,
  ChartFrame,
  ChartLegend,
  ChartTooltip,
  GRID_PROPS,
  colorFor,
  type SeriesDef,
} from "./chart-kit";

type Row = Record<string, string | number>;

const compactTick = (v: number) => (Math.abs(v) >= 10_000 ? `${Math.round(v / 1000)}K` : String(v));

/* ------------------------------------------------------------ grouped bars */

export function GroupedBarChart({
  data,
  xKey,
  series,
  height = 260,
  label,
  valueFormat,
  yTick = compactTick,
  testId,
}: {
  data: Row[];
  xKey: string;
  series: SeriesDef[];
  height?: number;
  label: string;
  valueFormat?: (v: number) => string;
  yTick?: (v: number) => string;
  testId?: string;
}) {
  const empty = data.length === 0 || data.every((d) => series.every((s) => Number(d[s.key] ?? 0) === 0));
  return (
    <div className="space-y-2" data-testid={testId}>
      <ChartLegend series={series} />
      {empty ? (
        <div style={{ height }}>
          <ChartEmpty />
        </div>
      ) : (
        <ChartFrame label={label} height={height}>
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={data} margin={{ top: 8, right: 4, bottom: 0, left: -12 }} barGap={2} barCategoryGap="22%">
              <CartesianGrid {...GRID_PROPS} />
              <XAxis dataKey={xKey} tick={AXIS_TICK} axisLine={AXIS_LINE} tickLine={false} minTickGap={12} />
              <YAxis tick={AXIS_TICK} axisLine={false} tickLine={false} tickFormatter={yTick} allowDecimals={false} width={44} />
              <Tooltip cursor={{ fill: "var(--muted)", fillOpacity: 0.5 }} content={<ChartTooltip format={valueFormat} />} />
              {series.map((s, i) => (
                <Bar key={s.key} dataKey={s.key} name={s.name} fill={s.color ?? colorFor(i)} maxBarSize={24} radius={[4, 4, 0, 0]} />
              ))}
            </BarChart>
          </ResponsiveContainer>
        </ChartFrame>
      )}
      <ChartDataTable
        caption={label}
        columns={[xKey, ...series.map((s) => s.name)]}
        rows={data.map((d) => [String(d[xKey]), ...series.map((s) => Number(d[s.key] ?? 0))])}
      />
    </div>
  );
}

/* ------------------------------------------------------------------- lines */

export function TrendLineChart({
  data,
  xKey,
  series,
  height = 260,
  label,
  valueFormat,
  testId,
}: {
  data: Row[];
  xKey: string;
  series: SeriesDef[];
  height?: number;
  label: string;
  valueFormat?: (v: number) => string;
  testId?: string;
}) {
  const empty = data.length === 0 || data.every((d) => series.every((s) => Number(d[s.key] ?? 0) === 0));
  return (
    <div className="space-y-2" data-testid={testId}>
      <ChartLegend series={series} />
      {empty ? (
        <div style={{ height }}>
          <ChartEmpty />
        </div>
      ) : (
        <ChartFrame label={label} height={height}>
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: -12 }}>
              <CartesianGrid {...GRID_PROPS} />
              <XAxis dataKey={xKey} tick={AXIS_TICK} axisLine={AXIS_LINE} tickLine={false} minTickGap={12} />
              <YAxis tick={AXIS_TICK} axisLine={false} tickLine={false} tickFormatter={compactTick} allowDecimals={false} width={44} />
              <Tooltip cursor={{ stroke: "var(--muted-foreground)", strokeOpacity: 0.4, strokeWidth: 1 }} content={<ChartTooltip format={valueFormat} />} />
              {series.map((s, i) => {
                const c = s.color ?? colorFor(i);
                return (
                  <Line
                    key={s.key}
                    type="linear"
                    dataKey={s.key}
                    name={s.name}
                    stroke={c}
                    strokeWidth={2}
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    dot={false}
                    activeDot={{ r: 4, fill: c, stroke: "var(--card)", strokeWidth: 2 }}
                  />
                );
              })}
            </LineChart>
          </ResponsiveContainer>
        </ChartFrame>
      )}
      <ChartDataTable
        caption={label}
        columns={[xKey, ...series.map((s) => s.name)]}
        rows={data.map((d) => [String(d[xKey]), ...series.map((s) => Number(d[s.key] ?? 0))])}
      />
    </div>
  );
}

/* ---------------------------------------------------------- horizontal bars */

export interface HBarDatum {
  name: string;
  value: number;
  /** override the colour of this bar (e.g. status colours); defaults to the series colour */
  color?: string;
}

export function HorizontalBarChart({
  data,
  height,
  label,
  seriesName = "Value",
  valueFormat = (v) => v.toLocaleString(),
  color = "var(--chart-1)",
  nameWidth = 128,
  maxValue,
  testId,
}: {
  data: HBarDatum[];
  height?: number;
  label: string;
  seriesName?: string;
  valueFormat?: (v: number) => string;
  color?: string;
  nameWidth?: number;
  maxValue?: number;
  testId?: string;
}) {
  const h = height ?? Math.max(120, data.length * 34 + 16);
  return (
    <div data-testid={testId}>
      {data.length === 0 ? (
        <div style={{ height: 160 }}>
          <ChartEmpty />
        </div>
      ) : (
        <ChartFrame label={label} height={h}>
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={data} layout="vertical" margin={{ top: 0, right: 64, bottom: 0, left: 0 }} barCategoryGap="28%">
              <CartesianGrid stroke="var(--border)" strokeOpacity={0.7} horizontal={false} />
              <XAxis type="number" hide domain={[0, maxValue ?? "auto"]} />
              <YAxis
                type="category"
                dataKey="name"
                width={nameWidth}
                tick={{ ...AXIS_TICK, fill: "var(--foreground)" }}
                axisLine={false}
                tickLine={false}
                interval={0}
                tickFormatter={(v: string) => (v.length > 20 ? `${v.slice(0, 19)}…` : v)}
              />
              <Tooltip cursor={{ fill: "var(--muted)", fillOpacity: 0.5 }} content={<ChartTooltip format={valueFormat} labelKey="name" />} />
              <Bar dataKey="value" name={seriesName} maxBarSize={20} radius={[0, 4, 4, 0]} fill={color}>
                {data.map((d, i) => (
                  <Cell key={`${d.name}-${i}`} fill={d.color ?? color} />
                ))}
                <LabelList dataKey="value" position="right" formatter={(v: unknown) => valueFormat(Number(v))} fill="var(--foreground)" fontSize={11} />
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </ChartFrame>
      )}
      <ChartDataTable caption={label} columns={["Name", seriesName]} rows={data.map((d) => [d.name, valueFormat(d.value)])} />
    </div>
  );
}
