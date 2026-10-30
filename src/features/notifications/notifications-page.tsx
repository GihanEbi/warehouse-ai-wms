"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { BellOff, CheckCheck, ExternalLink, Eye, EyeOff, Info, Trash2, X } from "lucide-react";
import { toast } from "sonner";
import type { AppNotification, NotificationType } from "@/types";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { ConfirmationDialog, DetailDrawer } from "@/components/shared/dialogs";
import { FilterDropdown, SearchInput, Toolbar } from "@/components/shared/form-controls";
import { NOTIFICATION_META } from "@/components/shared/notification-meta";
import { PageHeader, Section } from "@/components/shared/page-header";
import { EmptyState } from "@/components/shared/states";
import { TONE_CLASSES } from "@/components/shared/status-badge";
import { LinkButton } from "@/components/shared/link-button";
import { useData, useFormat } from "@/hooks/use-wms";
import { useWmsStore } from "@/stores/wms-store";
import { NOTIFICATION_LABELS } from "@/lib/constants";
import { cn } from "@/lib/utils";

const PAGE = 15;
const TYPES = Object.keys(NOTIFICATION_LABELS) as NotificationType[];

export function NotificationsPage() {
  const router = useRouter();
  const data = useData();
  const fmt = useFormat();
  const markRead = useWmsStore((s) => s.markNotificationRead);
  const markAll = useWmsStore((s) => s.markAllNotificationsRead);
  const clearOne = useWmsStore((s) => s.clearNotification);
  const clearRead = useWmsStore((s) => s.clearReadNotifications);

  const [search, setSearch] = useState("");
  const [type, setType] = useState("all");
  const [unreadOnly, setUnreadOnly] = useState(false);
  const [visible, setVisible] = useState(PAGE);
  const [detailId, setDetailId] = useState<string | null>(null);
  const [detailOpen, setDetailOpen] = useState(false);
  const [clearOpen, setClearOpen] = useState(false);

  const all = data.notifications;
  const unread = all.filter((n) => !n.read).length;
  const readCount = all.length - unread;

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return all.filter((n) => {
      if (type !== "all" && n.type !== type) return false;
      if (unreadOnly && n.read) return false;
      if (q && !`${n.title} ${n.message}`.toLowerCase().includes(q)) return false;
      return true;
    });
  }, [all, search, type, unreadOnly]);

  const shown = filtered.slice(0, visible);
  const detail = detailId ? (all.find((n) => n.id === detailId) ?? null) : null;
  const filtersActive = search !== "" || type !== "all" || unreadOnly;

  const open = (n: AppNotification) => {
    markRead(n.id, true);
    if (n.href) router.push(n.href);
  };
  const showDetails = (n: AppNotification) => {
    setDetailId(n.id);
    setDetailOpen(true);
  };

  return (
    <div>
      <PageHeader
        title="Notifications"
        description="Everything that needs your attention across receiving, orders, stock and tasks."
        actions={
          <>
            <Button variant="outline" onClick={() => setClearOpen(true)} disabled={readCount === 0} data-testid="clear-read">
              <Trash2 /> Clear read
            </Button>
            <Button
              onClick={() => {
                markAll();
                toast.success("All notifications marked as read");
              }}
              disabled={unread === 0}
              data-testid="mark-all-read"
            >
              <CheckCheck /> Mark all as read
            </Button>
          </>
        }
      />

      <Section contentClassName="p-0">
        <Toolbar>
          <span className="text-sm font-medium" data-testid="unread-count">
            {unread} unread <span className="font-normal text-muted-foreground">· {all.length} total</span>
          </span>
          <SearchInput value={search} onChange={(v) => { setSearch(v); setVisible(PAGE); }} placeholder="Search notifications…" className="sm:ml-auto sm:w-64" />
          <FilterDropdown
            label="Type"
            value={type}
            onChange={(v) => { setType(v); setVisible(PAGE); }}
            options={TYPES.map((t) => ({ value: t, label: NOTIFICATION_LABELS[t] }))}
            allLabel="All types"
          />
          <label className="flex min-h-8 items-center gap-2 text-xs text-muted-foreground">
            <Switch checked={unreadOnly} onCheckedChange={(v) => { setUnreadOnly(v); setVisible(PAGE); }} data-testid="unread-only" aria-label="Show unread only" />
            Unread only
          </label>
          {filtersActive && (
            <Button variant="ghost" size="sm" onClick={() => { setSearch(""); setType("all"); setUnreadOnly(false); }}>
              <X /> Clear
            </Button>
          )}
        </Toolbar>

        {filtered.length === 0 ? (
          <EmptyState
            icon={BellOff}
            title={all.length === 0 ? "You're all caught up" : "No notifications match"}
            description={all.length === 0 ? "New activity will show up here." : "Try a different type or clear the filters."}
          />
        ) : (
          <ul className="divide-y" data-testid="notification-list">
            {shown.map((n) => {
              const meta = NOTIFICATION_META[n.type];
              const Icon = meta.icon;
              return (
                <li
                  key={n.id}
                  data-testid="notification-item"
                  data-read={n.read}
                  className={cn("flex flex-col gap-3 p-3 sm:flex-row sm:items-start sm:p-4", !n.read && "bg-primary-soft/30")}
                >
                  <div className="flex min-w-0 flex-1 items-start gap-3">
                    <span className={cn("mt-0.5 flex size-9 shrink-0 items-center justify-center rounded-lg", TONE_CLASSES[meta.tone])}>
                      <Icon className="size-[18px]" aria-hidden />
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="flex items-center gap-2">
                        <span className={cn("min-w-0 truncate text-sm", !n.read && "font-semibold")}>{n.title}</span>
                        {!n.read && <span className="size-2 shrink-0 rounded-full bg-primary" role="img" aria-label="Unread" />}
                      </p>
                      <p className="mt-0.5 line-clamp-2 text-sm break-words text-muted-foreground">{n.message}</p>
                      <p className="mt-1 text-xs text-muted-foreground">
                        {meta.label} · {fmt.relative(n.createdAt)}
                      </p>
                    </div>
                  </div>
                  <div className="flex shrink-0 flex-wrap items-center gap-1.5 sm:justify-end">
                    {n.href && (
                      <Button size="sm" onClick={() => open(n)} data-testid="notification-open">
                        <ExternalLink /> Open
                      </Button>
                    )}
                    <Button variant="outline" size="sm" onClick={() => showDetails(n)} data-testid="notification-details">
                      <Info /> Details
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => markRead(n.id, !n.read)}
                      data-testid="notification-toggle-read"
                      aria-label={n.read ? "Mark as unread" : "Mark as read"}
                    >
                      {n.read ? <EyeOff /> : <Eye />}
                      <span className="sm:sr-only md:not-sr-only">{n.read ? "Unread" : "Read"}</span>
                    </Button>
                    {n.read && (
                      <Button
                        variant="ghost"
                        size="icon-sm"
                        onClick={() => {
                          clearOne(n.id);
                          toast.success("Notification dismissed");
                        }}
                        aria-label="Dismiss notification"
                        data-testid="notification-dismiss"
                      >
                        <X />
                      </Button>
                    )}
                  </div>
                </li>
              );
            })}
          </ul>
        )}

        {filtered.length > 0 && (
          <div className="flex flex-col items-center gap-2 border-t px-3 py-3 text-xs text-muted-foreground sm:flex-row sm:justify-between">
            <span data-testid="notification-range">
              Showing {shown.length} of {filtered.length}
            </span>
            {shown.length < filtered.length && (
              <Button variant="outline" size="sm" onClick={() => setVisible((v) => v + PAGE)} data-testid="load-more">
                Load more
              </Button>
            )}
          </div>
        )}
      </Section>

      <ConfirmationDialog
        open={clearOpen}
        onOpenChange={setClearOpen}
        title="Clear read notifications?"
        description={`${readCount} read notification${readCount === 1 ? "" : "s"} will be permanently removed. Unread notifications are kept.`}
        confirmLabel="Clear read"
        destructive
        onConfirm={() => {
          const n = clearRead();
          toast.success(`Cleared ${n} read notification${n === 1 ? "" : "s"}`);
        }}
      />

      <DetailDrawer
        open={detailOpen}
        onOpenChange={setDetailOpen}
        title={detail?.title ?? "Notification"}
        description={detail ? NOTIFICATION_META[detail.type].label : undefined}
        footer={
          detail && (
            <div className="flex w-full flex-wrap gap-2">
              {detail.href && (
                <LinkButton href={detail.href} onClick={() => markRead(detail.id, true)} data-testid="detail-open-link">
                  <ExternalLink /> Open related record
                </LinkButton>
              )}
              <Button variant="outline" onClick={() => markRead(detail.id, !detail.read)}>
                {detail.read ? <EyeOff /> : <Eye />} Mark as {detail.read ? "unread" : "read"}
              </Button>
            </div>
          )
        }
      >
        {detail ? (
          <div className="space-y-4 text-sm" data-testid="notification-detail">
            <p className="whitespace-pre-wrap">{detail.message}</p>
            <dl className="grid grid-cols-2 gap-3 rounded-lg border bg-muted/30 p-3">
              <div>
                <dt className="text-xs text-muted-foreground">Type</dt>
                <dd className="font-medium">{NOTIFICATION_LABELS[detail.type]}</dd>
              </div>
              <div>
                <dt className="text-xs text-muted-foreground">Status</dt>
                <dd className="font-medium">{detail.read ? "Read" : "Unread"}</dd>
              </div>
              <div className="col-span-2">
                <dt className="text-xs text-muted-foreground">Received</dt>
                <dd className="font-medium">
                  {fmt.dateTime(detail.createdAt)} ({fmt.relative(detail.createdAt)})
                </dd>
              </div>
            </dl>
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">This notification was removed.</p>
        )}
      </DetailDrawer>
    </div>
  );
}
