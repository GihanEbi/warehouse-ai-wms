"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Bell, CheckCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { useData, useFormat } from "@/hooks/use-wms";
import { useWmsStore } from "@/stores/wms-store";
import { NOTIFICATION_META } from "@/components/shared/notification-meta";
import { TONE_CLASSES } from "@/components/shared/status-badge";
import { cn } from "@/lib/utils";

export function NotificationDropdown() {
  const router = useRouter();
  const fmt = useFormat();
  const data = useData();
  const markRead = useWmsStore((s) => s.markNotificationRead);
  const markAll = useWmsStore((s) => s.markAllNotificationsRead);
  const [open, setOpen] = useState(false);
  const unread = data.notifications.filter((n) => !n.read).length;
  const recent = data.notifications.slice(0, 7);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger
        aria-label={`Notifications${unread ? `, ${unread} unread` : ""}`}
        data-testid="notification-bell"
        className="relative inline-flex size-8 items-center justify-center rounded-lg text-muted-foreground outline-none transition-colors hover:bg-muted hover:text-foreground focus-visible:ring-3 focus-visible:ring-ring/50"
      >
        <Bell className="size-[18px]" />
        {unread > 0 && (
          <span
            data-testid="notification-count"
            className="absolute -top-0.5 -right-0.5 flex min-w-4 items-center justify-center rounded-full bg-danger px-1 text-[10px] font-semibold text-white tabular-nums"
            style={{ height: 16 }}
          >
            {unread > 99 ? "99+" : unread}
          </span>
        )}
      </PopoverTrigger>
      <PopoverContent align="end" className="w-[min(24rem,calc(100vw-1.5rem))] gap-0 p-0" data-testid="notification-dropdown">
        <div className="flex items-center justify-between border-b px-3 py-2.5">
          <p className="text-sm font-semibold">Notifications</p>
          <Button variant="ghost" size="xs" onClick={() => markAll()} disabled={unread === 0}>
            <CheckCheck /> Mark all read
          </Button>
        </div>
        <ul className="max-h-[22rem] divide-y overflow-y-auto">
          {recent.length === 0 && <li className="px-4 py-8 text-center text-sm text-muted-foreground">You&apos;re all caught up.</li>}
          {recent.map((n) => {
            const meta = NOTIFICATION_META[n.type];
            const Icon = meta.icon;
            return (
              <li key={n.id}>
                <button
                  type="button"
                  onClick={() => {
                    markRead(n.id);
                    setOpen(false);
                    router.push(n.href ?? "/notifications");
                  }}
                  className="flex w-full items-start gap-3 px-3 py-2.5 text-left transition-colors hover:bg-muted/60"
                >
                  <span className={cn("mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-lg", TONE_CLASSES[meta.tone])}>
                    <Icon className="size-4" />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className={cn("block truncate text-sm", !n.read && "font-semibold")}>{n.title}</span>
                    <span className="line-clamp-2 text-xs text-muted-foreground">{n.message}</span>
                    <span className="mt-0.5 block text-[11px] text-muted-foreground">{fmt.relative(n.createdAt)}</span>
                  </span>
                  {!n.read && <span className="mt-2 size-2 shrink-0 rounded-full bg-primary" aria-label="Unread" />}
                </button>
              </li>
            );
          })}
        </ul>
        <div className="border-t p-2">
          <Link href="/notifications" onClick={() => setOpen(false)} className="block rounded-md px-2 py-1.5 text-center text-sm font-medium text-primary hover:bg-primary-soft">
            View all notifications
          </Link>
        </div>
      </PopoverContent>
    </Popover>
  );
}
