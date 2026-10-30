"use client";

import { Suspense, useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import { ShieldAlert } from "lucide-react";
import { Sheet, SheetContent, SheetDescription, SheetTitle } from "@/components/ui/sheet";
import { PageSkeleton } from "@/components/shared/states";
import { LinkButton } from "@/components/shared/link-button";
import { AIAssistantDrawer } from "@/components/ai/ai-assistant-drawer";
import { hydrateWmsStore, useWmsStore } from "@/stores/wms-store";
import { useCurrentUser, useHydrated, useSettings } from "@/hooks/use-wms";
import { ROLE_HIDDEN_ROUTES, ROLE_LABELS } from "@/lib/constants";
import { ApplicationHeader } from "./header";
import { ApplicationSidebar, BrandMark, SidebarNav } from "./sidebar";

export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const hydrated = useHydrated();
  const user = useCurrentUser();
  const settings = useSettings();
  const collapsed = useWmsStore((s) => s.sidebarCollapsed);
  const setCollapsed = useWmsStore((s) => s.setSidebarCollapsed);
  const [menuOpen, setMenuOpen] = useState(false);
  const [aiOpen, setAiOpen] = useState(false);

  useEffect(() => {
    void hydrateWmsStore();
  }, []);

  // close the mobile drawer whenever the route changes
  // eslint-disable-next-line react-hooks/set-state-in-effect -- closing a transient overlay on navigation
  useEffect(() => setMenuOpen(false), [pathname]);

  const blocked = user && ROLE_HIDDEN_ROUTES[user.role].some((r) => pathname === r || pathname.startsWith(r + "/"));

  return (
    <div className="flex min-h-dvh w-full">
      <ApplicationSidebar collapsed={collapsed} onToggle={() => setCollapsed(!collapsed)} />
      <Sheet open={menuOpen} onOpenChange={setMenuOpen}>
        <SheetContent side="left" className="w-72 gap-0 p-0" showCloseButton={false} data-testid="mobile-nav">
          <SheetTitle className="sr-only">Navigation</SheetTitle>
          <SheetDescription className="sr-only">Main application navigation</SheetDescription>
          <div className="flex h-14 items-center border-b px-3">
            <BrandMark />
          </div>
          <SidebarNav onNavigate={() => setMenuOpen(false)} />
        </SheetContent>
      </Sheet>
      <div className="flex min-w-0 flex-1 flex-col">
        <ApplicationHeader onOpenMenu={() => setMenuOpen(true)} onOpenAI={() => setAiOpen(true)} />
        <main className="mx-auto w-full min-w-0 max-w-[1600px] flex-1 p-4 sm:p-6" data-testid="main-content">
          {!hydrated ? (
            <PageSkeleton />
          ) : blocked && user ? (
            <div className="mx-auto mt-16 max-w-md rounded-xl border bg-card p-8 text-center shadow-card" data-testid="role-blocked">
              <span className="mx-auto flex size-11 items-center justify-center rounded-full bg-warning-soft text-warning">
                <ShieldAlert className="size-5" />
              </span>
              <h1 className="mt-3 text-lg font-semibold">Not available for this role</h1>
              <p className="mt-1 text-sm text-muted-foreground">
                {ROLE_LABELS[user.role]} users cannot open this area in the demo. This is simulated role behaviour, not real security. Switch demo user from the profile menu to continue.
              </p>
              <LinkButton href="/dashboard" className="mt-4">Back to dashboard</LinkButton>
            </div>
          ) : (
            <Suspense fallback={<PageSkeleton />}>{children}</Suspense>
          )}
        </main>
      </div>
      {settings.aiEnabled && <AIAssistantDrawer open={aiOpen} onOpenChange={setAiOpen} />}
    </div>
  );
}
