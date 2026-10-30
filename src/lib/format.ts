import { format, formatDistanceToNowStrict, isValid, parseISO } from "date-fns";
import { CURRENCIES } from "@/lib/constants";
import type { AppSettings } from "@/types";

type FormatSettings = Pick<AppSettings, "currency" | "dateFormat" | "timezone">;

/** Shifts a date so its *local* fields show the wall-clock time in `timeZone`. */
function toZoned(date: Date, timeZone: string): Date {
  try {
    const parts = new Intl.DateTimeFormat("en-US", {
      timeZone,
      hourCycle: "h23",
      year: "numeric",
      month: "numeric",
      day: "numeric",
      hour: "numeric",
      minute: "numeric",
      second: "numeric",
    }).formatToParts(date);
    const get = (t: string) => Number(parts.find((p) => p.type === t)?.value ?? 0);
    return new Date(get("year"), get("month") - 1, get("day"), get("hour"), get("minute"), get("second"));
  } catch {
    return date;
  }
}

export function parseDate(value: string | Date | null | undefined): Date | null {
  if (!value) return null;
  const d = value instanceof Date ? value : parseISO(value);
  return isValid(d) ? d : null;
}

export function createFormatter(s: FormatSettings) {
  const cur = CURRENCIES[s.currency];
  const fractionDigits = s.currency === "LKR" ? 0 : 2;
  const nf = new Intl.NumberFormat(cur.locale, { minimumFractionDigits: fractionDigits, maximumFractionDigits: fractionDigits });
  const compact = new Intl.NumberFormat("en-US", { notation: "compact", maximumFractionDigits: 1 });
  const int = new Intl.NumberFormat("en-US");

  return {
    /** Amounts are stored in LKR and converted for display. */
    money: (lkr: number) => `${cur.symbol} ${nf.format(lkr * cur.rate)}`,
    moneyCompact: (lkr: number) => `${cur.symbol} ${compact.format(lkr * cur.rate)}`,
    number: (n: number) => int.format(n),
    compact: (n: number) => compact.format(n),
    percent: (n: number) => `${Math.round(n)}%`,
    date: (v: string | Date | null | undefined) => {
      const d = parseDate(v);
      return d ? format(toZoned(d, s.timezone), s.dateFormat) : "—";
    },
    dateTime: (v: string | Date | null | undefined) => {
      const d = parseDate(v);
      return d ? `${format(toZoned(d, s.timezone), s.dateFormat)}, ${format(toZoned(d, s.timezone), "HH:mm")}` : "—";
    },
    time: (v: string | Date | null | undefined) => {
      const d = parseDate(v);
      return d ? format(toZoned(d, s.timezone), "HH:mm") : "—";
    },
    relative: (v: string | Date | null | undefined) => {
      const d = parseDate(v);
      return d ? `${formatDistanceToNowStrict(d)} ago` : "—";
    },
  };
}

export type Formatter = ReturnType<typeof createFormatter>;

export const titleCase = (s: string) =>
  s
    .split("_")
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");

export function initials(name: string) {
  return name
    .split(/\s+/)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase() ?? "")
    .join("");
}
