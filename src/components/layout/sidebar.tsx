"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { ChevronsLeft, ChevronsRight, PackageCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { NAVIGATION } from "@/lib/navigation";
import { ROLE_HIDDEN_ROUTES } from "@/lib/constants";
import { useCurrentUser, useData, useSettings } from "@/hooks/use-wms";
import { cn } from "@/lib/utils";

export function BrandMark({ collapsed }: { collapsed?: boolean }) {
  const settings = useSettings();
  return (
    <Link href="/dashboard" className="flex min-w-0 items-center gap-2.5 outline-none">
      {settings.companyLogo ? (
        // eslint-disable-next-line @next/next/no-img-element -- user uploaded data URL
        <img src={settings.companyLogo} alt="" className="size-8 shrink-0 rounded-lg object-cover" />
      ) : (
        <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-primary text-primary-foreground">
          <PackageCheck className="size-[18px]" />
        </span>
      )}
      {!collapsed && (
        <span className="min-w-0 leading-tight">
          <span className="block truncate text-sm font-semibold">Warehouse AI</span>
          <span className="block truncate text-[11px] text-muted-foreground">{settings.companyName}</span>
        </span>
      )}
    </Link>
  );
}

export function SidebarNav({ collapsed, onNavigate }: { collapsed?: boolean; onNavigate?: () => void }) {
  const pathname = usePathname();
  const user = useCurrentUser();
  const data = useData();
  const hidden = ROLE_HIDDEN_ROUTES[user?.role ?? "operator"];
  const unread = data.notifications.filter((n) => !n.read).length;

  return (
    <nav aria-label="Main navigation" className="flex-1 space-y-4 overflow-y-auto px-2 py-3 scrollbar-thin">
      {NAVIGATION.map((group) => {
        const items = group.items.filter((i) => !hidden.includes(i.href));
        if (items.length === 0) return null;
        return (
          <div key={group.label}>
            {!collapsed && <p className="mb-1 px-2 text-[11px] font-semibold tracking-wider text-muted-foreground uppercase">{group.label}</p>}
            {collapsed && <div className="mx-2 mb-1 border-t first:hidden" />}
            <ul className="space-y-0.5">
              {items.map((item) => {
                const active = pathname === item.href || pathname.startsWith(item.href + "/");
                const Icon = item.icon;
                const link = (
                  <Link
                    href={item.href}
                    onClick={onNavigate}
                    aria-current={active ? "page" : undefined}
                    data-testid={`nav-${item.href.slice(1)}`}
                    className={cn(
                      "relative flex h-9 items-center gap-2.5 rounded-lg px-2.5 text-sm font-medium outline-none transition-colors focus-visible:ring-3 focus-visible:ring-ring/50",
                      collapsed && "justify-center px-0",
                      active
                        ? "bg-sidebar-accent text-sidebar-accent-foreground"
                        : "text-sidebar-foreground/80 hover:bg-muted hover:text-foreground",
                    )}
                  >
                    <Icon className="size-[18px] shrink-0" aria-hidden />
                    {!collapsed && <span className="truncate">{item.label}</span>}
                    {item.href === "/notifications" && unread > 0 && (
                      <span
                        className={cn(
                          "ml-auto rounded-full bg-primary px-1.5 text-[10px] font-semibold text-primary-foreground tabular-nums",
                          collapsed && "absolute top-0.5 right-1 ml-0 px-1",
                        )}
                      >
                        {unread}
                      </span>
                    )}
                  </Link>
                );
                return (
                  <li key={item.href}>
                    {collapsed ? (
                      <Tooltip>
                        <TooltipTrigger render={link} />
                        <TooltipContent side="right">{item.label}</TooltipContent>
                      </Tooltip>
                    ) : (
                      link
                    )}
                  </li>
                );
              })}
            </ul>
          </div>
        );
      })}
    </nav>
  );
}

export function ApplicationSidebar({ collapsed, onToggle }: { collapsed: boolean; onToggle: () => void }) {
  return (
    <aside
      data-print-hidden="true"
      data-testid="sidebar"
      data-collapsed={collapsed}
      className={cn(
        "sticky top-0 hidden h-dvh shrink-0 flex-col border-r bg-sidebar text-sidebar-foreground transition-[width] duration-200 lg:flex",
        collapsed ? "w-[68px]" : "w-64",
      )}
    >
      <div className={cn("flex h-14 items-center border-b px-3", collapsed && "justify-center")}>
        <BrandMark collapsed={collapsed} />
      </div>
      <SidebarNav collapsed={collapsed} />
      <div className={cn("border-t p-2", collapsed && "flex justify-center")}>
        <Button variant="ghost" size={collapsed ? "icon" : "sm"} onClick={onToggle} aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"} data-testid="sidebar-toggle" className={cn(!collapsed && "w-full justify-start")}>
          {collapsed ? <ChevronsRight /> : <><ChevronsLeft /> Collapse</>}
        </Button>
      </div>
    </aside>
  );
}
