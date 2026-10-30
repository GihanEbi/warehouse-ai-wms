"use client";

import { Menu, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useSettings, useWarehouseScope } from "@/hooks/use-wms";
import { WarehouseSelector } from "@/components/shared/selectors";
import { Breadcrumbs } from "./breadcrumbs";
import { GlobalSearch } from "./global-search";
import { NotificationDropdown } from "./notification-dropdown";
import { ThemeToggle } from "./theme-toggle";
import { UserMenu } from "./user-menu";

export function ApplicationHeader({ onOpenMenu, onOpenAI }: { onOpenMenu: () => void; onOpenAI: () => void }) {
  const settings = useSettings();
  const [scope, setScope] = useWarehouseScope();
  return (
    <header
      data-print-hidden="true"
      data-testid="app-header"
      className="sticky top-0 z-30 flex h-14 shrink-0 items-center gap-2 border-b bg-background/85 px-3 backdrop-blur supports-[backdrop-filter]:bg-background/70 sm:gap-3 sm:px-6"
    >
      <Button variant="ghost" size="icon" className="lg:hidden" onClick={onOpenMenu} aria-label="Open navigation menu" data-testid="mobile-menu-button">
        <Menu className="size-5" />
      </Button>
      <div className="hidden min-w-0 flex-1 md:block">
        <Breadcrumbs />
      </div>
      <div className="flex-1 md:hidden" />
      <GlobalSearch />
      <WarehouseSelector variant="header" value={scope} onChange={(v) => setScope(v)} includeAll className="hidden w-52 sm:block" />
      {settings.aiEnabled && (
        <Button variant="ghost" size="icon" onClick={onOpenAI} aria-label="Open AI assistant" data-testid="open-ai-drawer">
          <Sparkles className="size-[18px] text-primary" />
        </Button>
      )}
      <NotificationDropdown />
      <ThemeToggle />
      <UserMenu />
    </header>
  );
}
