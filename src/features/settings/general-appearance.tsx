"use client";

import { useEffect, useRef, useState } from "react";
import { format } from "date-fns";
import { ImagePlus, Monitor, Moon, Sun, Trash2, type LucideIcon } from "lucide-react";
import { useTheme } from "next-themes";
import { toast } from "sonner";
import type { AppSettings } from "@/types";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { FormField, NativeSelect } from "@/components/shared/form-controls";
import { Section } from "@/components/shared/page-header";
import { useFormat, useSettings } from "@/hooks/use-wms";
import { useWmsStore } from "@/stores/wms-store";
import { CURRENCIES, TIMEZONES } from "@/lib/constants";
import { createFormatter } from "@/lib/format";
import { cn } from "@/lib/utils";
import { SettingRow, SettingSwitch, useSaveSettings } from "./settings-shared";

const MAX_LOGO_BYTES = 300 * 1024;
const DATE_FORMATS: AppSettings["dateFormat"][] = ["dd MMM yyyy", "MM/dd/yyyy", "dd/MM/yyyy", "yyyy-MM-dd"];

export function GeneralSection({ disabled }: { disabled: boolean }) {
  const settings = useSettings();
  const fmt = useFormat();
  const save = useSaveSettings();
  const fileRef = useRef<HTMLInputElement>(null);
  const [nameError, setNameError] = useState<string | undefined>();
  const [logoError, setLogoError] = useState<string | undefined>();
  const [now] = useState(() => new Date());

  const commitName = (value: string) => {
    const v = value.trim();
    if (!v) {
      setNameError("Company name is required");
      return;
    }
    setNameError(undefined);
    if (v !== settings.companyName) save({ companyName: v });
  };

  const onLogo = (file: File | undefined) => {
    setLogoError(undefined);
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      setLogoError("Choose an image file (PNG, JPG, SVG or WebP)");
      return;
    }
    if (file.size > MAX_LOGO_BYTES) {
      setLogoError(`Logo must be 300 KB or smaller (selected file is ${Math.round(file.size / 1024)} KB)`);
      return;
    }
    const reader = new FileReader();
    reader.onload = () => save({ companyLogo: String(reader.result) });
    reader.onerror = () => setLogoError("Could not read that file");
    reader.readAsDataURL(file);
    if (fileRef.current) fileRef.current.value = "";
  };

  return (
    <Section title="General" description="Company identity and regional formats used across the whole app.">
      <div className="divide-y">
        <SettingRow title="Company name" description="Shown in the sidebar and on printed documents." htmlFor="company-name">
          <FormField id="company-name" label="Company name" required error={nameError} className="[&>label]:sr-only">
            <Input
              id="company-name"
              key={settings.companyName}
              defaultValue={settings.companyName}
              disabled={disabled}
              aria-invalid={!!nameError}
              data-testid="company-name"
              onBlur={(e) => commitName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  commitName(e.currentTarget.value);
                }
              }}
            />
          </FormField>
        </SettingRow>

        <SettingRow title="Company logo" description="PNG, JPG, SVG or WebP up to 300 KB. Stored in this browser only.">
          <div className="space-y-2">
            <div className="flex items-center gap-3">
              <span className="flex size-14 shrink-0 items-center justify-center overflow-hidden rounded-xl border bg-muted text-muted-foreground">
                {settings.companyLogo ? (
                  // eslint-disable-next-line @next/next/no-img-element -- user uploaded data URL
                  <img src={settings.companyLogo} alt="Company logo preview" className="size-full object-cover" data-testid="logo-preview" />
                ) : (
                  <ImagePlus className="size-5" aria-hidden />
                )}
              </span>
              <div className="flex flex-wrap gap-2">
                <input
                  ref={fileRef}
                  type="file"
                  accept="image/*"
                  className="sr-only"
                  id="logo-file"
                  data-testid="logo-input"
                  disabled={disabled}
                  onChange={(e) => onLogo(e.target.files?.[0])}
                />
                <Button type="button" variant="outline" size="sm" disabled={disabled} onClick={() => fileRef.current?.click()}>
                  <ImagePlus /> {settings.companyLogo ? "Replace" : "Upload"}
                </Button>
                {settings.companyLogo && (
                  <Button type="button" variant="ghost" size="sm" disabled={disabled} onClick={() => save({ companyLogo: null })} data-testid="logo-remove">
                    <Trash2 /> Remove
                  </Button>
                )}
              </div>
            </div>
            {logoError && (
              <p className="text-xs text-danger" role="alert" data-testid="logo-error">
                {logoError}
              </p>
            )}
          </div>
        </SettingRow>

        <SettingRow
          title="Default currency"
          htmlFor="currency"
          description={
            <>
              Amounts are stored in LKR and converted for display. Preview:{" "}
              <span className="font-medium text-foreground" data-testid="currency-preview">
                {fmt.money(1250000)}
              </span>
            </>
          }
        >
          <NativeSelect
            id="currency"
            data-testid="currency-select"
            disabled={disabled}
            value={settings.currency}
            onChange={(e) => save({ currency: e.target.value as AppSettings["currency"] })}
            options={(Object.keys(CURRENCIES) as AppSettings["currency"][]).map((c) => ({ value: c, label: CURRENCIES[c].label }))}
          />
        </SettingRow>

        <SettingRow
          title="Date format"
          htmlFor="date-format"
          description={
            <>
              Preview:{" "}
              <span className="font-medium text-foreground" data-testid="date-preview">
                {fmt.date(now)}
              </span>
            </>
          }
        >
          <NativeSelect
            id="date-format"
            data-testid="date-format-select"
            disabled={disabled}
            value={settings.dateFormat}
            onChange={(e) => save({ dateFormat: e.target.value as AppSettings["dateFormat"] })}
            options={DATE_FORMATS.map((f) => ({ value: f, label: `${f}  (${format(now, f)})` }))}
          />
        </SettingRow>

        <SettingRow
          title="Timezone"
          htmlFor="timezone"
          description={
            <>
              Current time there:{" "}
              <span className="font-medium text-foreground" data-testid="timezone-preview">
                {createFormatter({ currency: settings.currency, dateFormat: settings.dateFormat, timezone: settings.timezone }).dateTime(now)}
              </span>
            </>
          }
        >
          <NativeSelect
            id="timezone"
            data-testid="timezone-select"
            disabled={disabled}
            value={settings.timezone}
            onChange={(e) => save({ timezone: e.target.value })}
            options={TIMEZONES.map((t) => ({ value: t, label: t.replace("_", " ") }))}
          />
        </SettingRow>
      </div>
    </Section>
  );
}

type ThemeName = "light" | "dark" | "system";

const THEMES: { name: ThemeName; label: string; icon: LucideIcon; description: string }[] = [
  { name: "light", label: "Light", icon: Sun, description: "Bright, high-contrast workspace" },
  { name: "dark", label: "Dark", icon: Moon, description: "Easier on the eyes in low light" },
  { name: "system", label: "System", icon: Monitor, description: "Follow your device setting" },
];

/** Decorative mini-app preview. Uses a fixed slate palette so it looks right whichever theme is active. */
function ThemePreview({ mode }: { mode: "light" | "dark" }) {
  const dark = mode === "dark";
  return (
    <div className={cn("flex h-20 overflow-hidden rounded-md border", dark ? "border-slate-700 bg-slate-900" : "border-slate-200 bg-slate-50")} aria-hidden>
      <div className={cn("w-1/4 space-y-1 p-1.5", dark ? "bg-slate-800" : "bg-slate-100")}>
        <div className="h-1.5 w-full rounded-full bg-indigo-500" />
        <div className={cn("h-1.5 w-3/4 rounded-full", dark ? "bg-slate-600" : "bg-slate-300")} />
        <div className={cn("h-1.5 w-2/3 rounded-full", dark ? "bg-slate-600" : "bg-slate-300")} />
      </div>
      <div className="flex-1 space-y-1.5 p-2">
        <div className={cn("h-2 w-1/2 rounded-full", dark ? "bg-slate-500" : "bg-slate-400")} />
        <div className="grid grid-cols-2 gap-1.5">
          <div className={cn("h-6 rounded", dark ? "bg-slate-800" : "bg-slate-200")} />
          <div className={cn("h-6 rounded", dark ? "bg-slate-800" : "bg-slate-200")} />
        </div>
      </div>
    </div>
  );
}

export function AppearanceSection({ disabled }: { disabled: boolean }) {
  const { theme, setTheme } = useTheme();
  const settings = useSettings();
  const save = useSaveSettings();
  const setSidebarCollapsed = useWmsStore((s) => s.setSidebarCollapsed);
  const [mounted, setMounted] = useState(false);
  // eslint-disable-next-line react-hooks/set-state-in-effect -- standard next-themes mount guard
  useEffect(() => setMounted(true), []);
  const active = mounted ? (theme ?? "system") : null;

  return (
    <div className="space-y-4">
      <Section title="Theme" description="Choose how the app looks on this device.">
        <div role="radiogroup" aria-label="Theme" className="grid gap-3 sm:grid-cols-3">
          {THEMES.map((t) => {
            const selected = active === t.name;
            return (
              <button
                key={t.name}
                type="button"
                role="radio"
                aria-checked={selected}
                data-testid={`theme-option-${t.name}`}
                onClick={() => {
                  setTheme(t.name);
                  toast.success("Settings saved", { id: "settings-saved", duration: 1800 });
                }}
                className={cn(
                  "space-y-2 rounded-xl border p-3 text-left outline-none transition-colors focus-visible:ring-3 focus-visible:ring-ring/50",
                  selected ? "border-primary bg-primary-soft/40 ring-2 ring-primary/30" : "hover:bg-muted/50",
                )}
              >
                {t.name === "system" ? (
                  <div className="grid grid-cols-2 gap-1">
                    <ThemePreview mode="light" />
                    <ThemePreview mode="dark" />
                  </div>
                ) : (
                  <ThemePreview mode={t.name} />
                )}
                <div className="flex items-center gap-2">
                  <t.icon className="size-4 text-muted-foreground" aria-hidden />
                  <span className="text-sm font-medium">{t.label}</span>
                  {selected && <span className="ml-auto text-xs font-medium text-primary">Active</span>}
                </div>
                <p className="text-xs text-muted-foreground">{t.description}</p>
              </button>
            );
          })}
        </div>
      </Section>

      <Section title="Sidebar" description="Navigation preferences.">
        <SettingSwitch
          id="sidebar-default-collapsed"
          title="Collapse sidebar by default"
          description="Start with the compact icon-only sidebar. Applied immediately and on future sessions."
          checked={settings.sidebarDefaultCollapsed}
          disabled={disabled}
          onChange={(v) => {
            save({ sidebarDefaultCollapsed: v });
            setSidebarCollapsed(v);
          }}
        />
      </Section>
    </div>
  );
}
