"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { AlertTriangle, Database, Download, RotateCcw, Sparkles } from "lucide-react";
import { toast } from "sonner";
import type { AppSettings, NotificationType } from "@/types";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { ConfirmationDialog } from "@/components/shared/dialogs";
import { NativeSelect } from "@/components/shared/form-controls";
import { NOTIFICATION_META } from "@/components/shared/notification-meta";
import { InfoItem, Section } from "@/components/shared/page-header";
import { TONE_CLASSES } from "@/components/shared/status-badge";
import { useData, useFormat, useSettings } from "@/hooks/use-wms";
import { useWmsStore } from "@/stores/wms-store";
import { lowStockProducts } from "@/lib/inventory/selectors";
import { NOTIFICATION_LABELS, STORAGE_KEY } from "@/lib/constants";
import { cn } from "@/lib/utils";
import { SettingRow, SettingSwitch, useSaveSettings } from "./settings-shared";

/* -------------------------------------------------------- warehouse prefs */

export function WarehouseSection({ disabled }: { disabled: boolean }) {
  const settings = useSettings();
  const data = useData();
  const save = useSaveSettings();
  const setSelectedWarehouse = useWmsStore((s) => s.setSelectedWarehouse);
  const [thresholdError, setThresholdError] = useState<string | undefined>();

  const flagged = useMemo(() => lowStockProducts(data, "all", settings.lowStockThresholdFactor).length, [data, settings.lowStockThresholdFactor]);
  const activeProducts = data.products.filter((p) => p.status === "active").length;

  return (
    <div className="space-y-4">
      <Section title="Warehouse preferences" description="Defaults that shape stock alerts and the global warehouse scope.">
        <div className="divide-y">
          <SettingRow title="Default warehouse" htmlFor="default-warehouse" description="Applied now and used as the starting scope in the header selector.">
            <NativeSelect
              id="default-warehouse"
              data-testid="default-warehouse"
              disabled={disabled}
              value={settings.defaultWarehouseId}
              onChange={(e) => {
                save({ defaultWarehouseId: e.target.value });
                setSelectedWarehouse(e.target.value);
              }}
              options={[
                { value: "all", label: "All warehouses" },
                ...data.warehouses.filter((w) => w.status === "active").map((w) => ({ value: w.id, label: `${w.name} (${w.code})` })),
              ]}
            />
          </SettingRow>

          <SettingRow
            title="Low-stock threshold factor"
            htmlFor="low-stock-factor"
            description="A product is low on stock when available ≤ reorder level × factor. 1.0 uses the exact reorder level."
          >
            <div className="space-y-2">
              <div className="flex items-center gap-3">
                <input
                  id="low-stock-factor"
                  type="range"
                  min={0.5}
                  max={2}
                  step={0.1}
                  disabled={disabled}
                  value={settings.lowStockThresholdFactor}
                  onChange={(e) => save({ lowStockThresholdFactor: Math.round(Number(e.target.value) * 10) / 10 })}
                  aria-label="Low-stock threshold factor"
                  data-testid="low-stock-factor"
                  className="h-2 min-w-0 flex-1 accent-primary"
                />
                <span className="w-12 text-right text-sm font-semibold tabular-nums" data-testid="low-stock-factor-value">
                  ×{settings.lowStockThresholdFactor.toFixed(1)}
                </span>
              </div>
              <p className="rounded-lg bg-warning-soft px-3 py-2 text-xs text-warning" data-testid="low-stock-count">
                <AlertTriangle className="mr-1.5 inline size-3.5 align-text-bottom" aria-hidden />
                <strong>{flagged}</strong> of {activeProducts} active products would be flagged low or out of stock.
              </p>
            </div>
          </SettingRow>
        </div>
      </Section>

      <Section title="Stock adjustment rules" description="Guards applied when users adjust stock manually.">
        <div className="divide-y">
          <SettingSwitch
            id="adjustment-reason-required"
            title="Require a reason for every adjustment"
            description="Users must pick a reason before an adjustment can be saved."
            checked={settings.adjustmentReasonRequired}
            disabled={disabled}
            onChange={(v) => save({ adjustmentReasonRequired: v })}
          />
          <SettingRow
            title="Large adjustment note threshold"
            htmlFor="large-adjustment"
            description="Adjustments of this many units or more require an explanatory note."
          >
            <div className="space-y-1">
              <Input
                id="large-adjustment"
                key={settings.largeAdjustmentThreshold}
                type="number"
                min={1}
                step={1}
                defaultValue={settings.largeAdjustmentThreshold}
                disabled={disabled}
                aria-invalid={!!thresholdError}
                data-testid="large-adjustment"
                onBlur={(e) => {
                  const n = Number(e.target.value);
                  if (!Number.isInteger(n) || n < 1) {
                    setThresholdError("Enter a whole number of at least 1");
                    return;
                  }
                  setThresholdError(undefined);
                  if (n !== settings.largeAdjustmentThreshold) save({ largeAdjustmentThreshold: n });
                }}
              />
              {thresholdError && (
                <p className="text-xs text-danger" role="alert">
                  {thresholdError}
                </p>
              )}
            </div>
          </SettingRow>
        </div>
      </Section>
    </div>
  );
}

/* ---------------------------------------------------------- notifications */

export function NotificationsSection({ disabled }: { disabled: boolean }) {
  const settings = useSettings();
  const save = useSaveSettings();
  const types = Object.keys(NOTIFICATION_LABELS) as NotificationType[];
  const enabledCount = types.filter((t) => settings.notificationPrefs[t] !== false).length;

  return (
    <Section
      title="Notification types"
      description="Disabled types are no longer generated — existing notifications stay in your inbox until cleared."
      actions={
        <span className="text-xs text-muted-foreground">
          {enabledCount} of {types.length} enabled
        </span>
      }
    >
      <ul className="divide-y">
        {types.map((t) => {
          const meta = NOTIFICATION_META[t];
          const Icon = meta.icon;
          const on = settings.notificationPrefs[t] !== false;
          return (
            <li key={t} className="flex items-center gap-3 py-3 first:pt-0 last:pb-0">
              <span className={cn("flex size-8 shrink-0 items-center justify-center rounded-lg", TONE_CLASSES[meta.tone])}>
                <Icon className="size-4" aria-hidden />
              </span>
              <label htmlFor={`notif-${t}`} className="min-w-0 flex-1 text-sm font-medium">
                {NOTIFICATION_LABELS[t]}
              </label>
              <Switch
                id={`notif-${t}`}
                data-testid={`notif-${t}`}
                checked={on}
                disabled={disabled}
                aria-label={NOTIFICATION_LABELS[t]}
                onCheckedChange={(v) => save({ notificationPrefs: { ...settings.notificationPrefs, [t]: v } as AppSettings["notificationPrefs"] })}
              />
            </li>
          );
        })}
      </ul>
    </Section>
  );
}


/* ------------------------------------------------------------------- AI */

export function AiSection({ disabled }: { disabled: boolean }) {
  const settings = useSettings();
  const save = useSaveSettings();
  const dismissed = useWmsStore((s) => s.dismissedRecommendations.length);
  const restore = useWmsStore((s) => s.restoreRecommendations);

  return (
    <Section title="AI assistant" description="Control the assistant and the recommendations it surfaces.">
      <div className="divide-y">
        <SettingSwitch
          id="ai-enabled"
          title="Enable AI assistant"
          description="Shows the assistant button in the header and the AI Assistant page."
          checked={settings.aiEnabled}
          disabled={disabled}
          onChange={(v) => save({ aiEnabled: v })}
        />
        <SettingSwitch
          id="ai-recommendations"
          title="Enable AI recommendations"
          description="Show suggested actions (reorders, transfers, risks) on the dashboard and in the assistant."
          checked={settings.aiRecommendationsEnabled}
          disabled={disabled || !settings.aiEnabled}
          onChange={(v) => save({ aiRecommendationsEnabled: v })}
        />
        <SettingRow title="Response style" htmlFor="ai-style" description="Concise gives short answers; detailed adds reasoning and context.">
          <NativeSelect
            id="ai-style"
            data-testid="ai-style"
            disabled={disabled || !settings.aiEnabled}
            value={settings.aiResponseStyle}
            onChange={(e) => save({ aiResponseStyle: e.target.value as AppSettings["aiResponseStyle"] })}
            options={[
              { value: "concise", label: "Concise" },
              { value: "detailed", label: "Detailed" },
            ]}
          />
        </SettingRow>
        <SettingRow
          title="Dismissed recommendations"
          description={`${dismissed} dismissed recommendation${dismissed === 1 ? "" : "s"} hidden from view.`}
        >
          <Button
            variant="outline"
            disabled={disabled || dismissed === 0}
            onClick={() => {
              restore();
              toast.success("Dismissed recommendations restored");
            }}
            data-testid="restore-recommendations"
          >
            <Sparkles /> Restore dismissed recommendations
          </Button>
        </SettingRow>
      </div>
    </Section>
  );
}

/* ------------------------------------------------------------------ data */

function formatBytes(n: number) {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / 1024 / 1024).toFixed(2)} MB`;
}

export function DataSection({ disabled }: { disabled: boolean }) {
  const router = useRouter();
  const data = useData();
  const settings = useSettings();
  const fmt = useFormat();
  const resetDemo = useWmsStore((s) => s.resetDemo);
  const [confirm, setConfirm] = useState(false);

  // storage estimate: the persisted JSON (UTF-16 in localStorage => 2 bytes / char)
  const size = useMemo(() => {
    if (typeof window === "undefined") return 0;
    try {
      const raw = window.localStorage.getItem(STORAGE_KEY) ?? JSON.stringify({ data, settings });
      return raw.length * 2;
    } catch {
      return 0;
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data, settings]);

  const records = data.products.length + data.orders.length + data.purchaseOrders.length + data.movements.length + data.tasks.length;

  const exportAll = () => {
    const payload = { exportedAt: new Date().toISOString(), app: "Warehouse AI WMS (demo)", settings, data };
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `wms-export-${new Date().toISOString().slice(0, 10)}.json`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
    toast.success("Export downloaded");
  };

  return (
    <div className="space-y-4">
      <Section title="Demo data" description="Everything lives in your browser's local storage — nothing is sent to a server.">
        <dl className="grid grid-cols-2 gap-4 lg:grid-cols-4" data-testid="data-info">
          <InfoItem label="Seed version">v{data.seedVersion}</InfoItem>
          <InfoItem label="Data seeded">{fmt.dateTime(data.seededAt)}</InfoItem>
          <InfoItem label="Storage used (estimate)">
            <span data-testid="storage-size">{formatBytes(size)}</span>
          </InfoItem>
          <InfoItem label="Records">{fmt.number(records)}</InfoItem>
        </dl>
        <div className="mt-4 flex flex-wrap gap-2">
          <Button variant="outline" onClick={exportAll} data-testid="export-data">
            <Download /> Export all data as JSON
          </Button>
        </div>
      </Section>

      <Section title="Reset demo data" className="border-danger/30">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <p className="flex items-start gap-2 text-sm text-muted-foreground">
            <Database className="mt-0.5 size-4 shrink-0" aria-hidden />
            Restores the original sample warehouses, stock, orders and tasks, and resets all settings to their defaults. Anything you created will be lost.
          </p>
          <Button variant="destructive" disabled={disabled} onClick={() => setConfirm(true)} data-testid="reset-demo" className="shrink-0">
            <RotateCcw /> Reset Demo Data
          </Button>
        </div>
      </Section>

      <ConfirmationDialog
        open={confirm}
        onOpenChange={setConfirm}
        title="Reset all demo data?"
        description="This permanently replaces every record and setting with a fresh copy of the sample data. This cannot be undone."
        confirmLabel="Reset demo data"
        destructive
        onConfirm={() => {
          resetDemo();
          toast.success("Demo data restored to the original seed");
          router.push("/dashboard");
          router.refresh();
        }}
      />
    </div>
  );
}
