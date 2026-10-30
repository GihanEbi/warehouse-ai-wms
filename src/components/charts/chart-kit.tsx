"use client";

/**
 * Shared chart building blocks (Recharts). Rules (dataviz skill):
 *  - colours only via CSS variables, so charts follow light/dark
 *  - thin marks, recessive hairline grid, legend for >= 2 series, tooltip with values leading
 *  - every chart ships an sr-only data table so values are reachable without hover
 */
import { cn } from "@/lib/utils";

export const SERIES_COLORS = ["var(--chart-1)", "var(--chart-2)", "var(--chart-3)", "var(--chart-4)", "var(--chart-5)"] as const;

export interface SeriesDef {
  key: string;
  name: string;
  color?: string;
}

export const colorFor = (i: number) => SERIES_COLORS[i % SERIES_COLORS.length];

export const AXIS_TICK = { fill: "var(--muted-foreground)", fontSize: 11 } as const;
export const AXIS_LINE = { stroke: "var(--border)" } as const;
export const GRID_PROPS = { stroke: "var(--border)", strokeOpacity: 0.7, vertical: false } as const;

/** Rendered by Recharts through `content={<ChartTooltip />}`; props are injected by Recharts. */
export interface TooltipItem {
  name?: string | number;
  value?: number | string | ReadonlyArray<number | string>;
  color?: string;
  dataKey?: string | number;
  payload?: Record<string, unknown>;
}

export function ChartTooltip({
  active,
  payload,
  label,
  format,
  labelKey,
}: {
  active?: boolean;
  payload?: ReadonlyArray<TooltipItem>;
  label?: string | number;
  format?: (v: number, item: TooltipItem) => string;
  /** read the heading from payload[0].payload[labelKey] instead of `label` */
  labelKey?: string;
}) {
  if (!active || !payload || payload.length === 0) return null;
  const heading = labelKey ? String(payload[0]?.payload?.[labelKey] ?? "") : label !== undefined ? String(label) : "";
  return (
    <div className="min-w-32 rounded-lg border bg-popover px-3 py-2 text-xs text-popover-foreground shadow-md" role="tooltip">
      {heading && <p className="mb-1.5 font-medium text-muted-foreground">{heading}</p>}
      <ul className="space-y-1">
        {payload.map((item, i) => {
          const raw = Array.isArray(item.value) ? Number(item.value[item.value.length - 1]) : Number(item.value);
          const fill = item.color ?? (typeof item.payload?.fill === "string" ? item.payload.fill : undefined) ?? "var(--chart-1)";
          return (
            <li key={`${item.dataKey ?? i}`} className="flex items-center gap-2">
              <span aria-hidden className="h-0.5 w-3 shrink-0 rounded-full" style={{ background: fill }} />
              <span className="font-semibold tabular-nums text-foreground">{format ? format(raw, item) : raw.toLocaleString()}</span>
              {item.name !== undefined && <span className="text-muted-foreground">{String(item.name)}</span>}
            </li>
          );
        })}
      </ul>
    </div>
  );
}

/** HTML legend (rect keys, mirrors the marks). Only rendered for >= 2 series. */
export function ChartLegend({ series, className }: { series: SeriesDef[]; className?: string }) {
  if (series.length < 2) return null;
  return (
    <ul className={cn("flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground", className)} aria-label="Legend">
      {series.map((s, i) => (
        <li key={s.key} className="flex items-center gap-1.5">
          <span aria-hidden className="size-2.5 rounded-[3px]" style={{ background: s.color ?? colorFor(i) }} />
          {s.name}
        </li>
      ))}
    </ul>
  );
}

/** Visually hidden table equivalent of a chart (keyboard / screen-reader access to every value). */
export function ChartDataTable({
  caption,
  columns,
  rows,
}: {
  caption: string;
  columns: string[];
  rows: (string | number)[][];
}) {
  return (
    <table className="sr-only">
      <caption>{caption}</caption>
      <thead>
        <tr>
          {columns.map((c) => (
            <th key={c} scope="col">
              {c}
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {rows.map((r, i) => (
          <tr key={i}>
            {r.map((c, j) => (
              <td key={j}>{c}</td>
            ))}
          </tr>
        ))}
      </tbody>
    </table>
  );
}

export function ChartEmpty({ children = "No data for the selected filters" }: { children?: React.ReactNode }) {
  return (
    <div className="flex h-full min-h-40 items-center justify-center rounded-lg bg-muted/40 px-4 text-center text-sm text-muted-foreground" data-testid="chart-empty">
      {children}
    </div>
  );
}

/** Wraps a chart with a figure role + accessible label. */
export function ChartFrame({
  label,
  height,
  children,
  className,
}: {
  label: string;
  height: number;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <figure role="group" aria-label={label} className={cn("m-0 w-full min-w-0", className)} style={{ height }}>
      {children}
    </figure>
  );
}
