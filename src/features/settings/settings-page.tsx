"use client";

import { useState } from "react";
import { Bell, Database, Palette, Settings2, Sparkles, Warehouse } from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { PageHeader } from "@/components/shared/page-header";
import { usePermission } from "@/hooks/use-wms";
import { AppearanceSection, GeneralSection } from "./general-appearance";
import { AiSection, DataSection, NotificationsSection, WarehouseSection } from "./other-sections";

const TABS = [
  { value: "general", label: "General", icon: Settings2 },
  { value: "appearance", label: "Appearance", icon: Palette },
  { value: "warehouse", label: "Warehouse", icon: Warehouse },
  { value: "notifications", label: "Notifications", icon: Bell },
  { value: "ai", label: "AI Assistant", icon: Sparkles },
  { value: "data", label: "Data", icon: Database },
] as const;

export function SettingsPage() {
  const { can } = usePermission();
  const manage = can("settings.manage");
  const [tab, setTab] = useState<string>("general");

  return (
    <div>
      <PageHeader title="Settings" description="Changes are applied immediately and saved in this browser." />
      {!manage && (
        <Alert className="mb-4" data-testid="settings-readonly">
          <AlertTitle>Read-only</AlertTitle>
          <AlertDescription>Your role cannot change settings. Switch to an administrator to edit them.</AlertDescription>
        </Alert>
      )}
      <Tabs value={tab} onValueChange={(v) => setTab(String(v))} className="gap-4">
        <div className="-mx-4 overflow-x-auto px-4 sm:mx-0 sm:px-0">
          <TabsList className="h-auto w-max min-w-0 flex-nowrap p-1" aria-label="Settings sections">
            {TABS.map((t) => (
              <TabsTrigger key={t.value} value={t.value} data-testid={`settings-tab-${t.value}`} className="h-8 flex-none px-3">
                <t.icon /> {t.label}
              </TabsTrigger>
            ))}
          </TabsList>
        </div>
        <div className="max-w-4xl" data-testid={`settings-panel-${tab}`}>
          {tab === "general" && <GeneralSection disabled={!manage} />}
          {tab === "appearance" && <AppearanceSection disabled={!manage} />}
          {tab === "warehouse" && <WarehouseSection disabled={!manage} />}
          {tab === "notifications" && <NotificationsSection disabled={!manage} />}
          {tab === "ai" && <AiSection disabled={!manage} />}
          {tab === "data" && <DataSection disabled={!manage} />}
        </div>
      </Tabs>
    </div>
  );
}
