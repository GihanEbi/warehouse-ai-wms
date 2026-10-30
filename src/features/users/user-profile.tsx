"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { Mail, Pencil, Phone, Power, PowerOff, Repeat, UserX } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { InfoItem, PageHeader, Section } from "@/components/shared/page-header";
import { EmptyState } from "@/components/shared/states";
import { LinkButton } from "@/components/shared/link-button";
import { PriorityBadge, StatusBadge } from "@/components/shared/status-badge";
import { useCurrentUser, useData, useFormat, useIndex, usePermission } from "@/hooks/use-wms";
import { useWmsStore } from "@/stores/wms-store";
import { ROLE_DESCRIPTIONS, ROLE_LABELS } from "@/lib/constants";
import { titleCase } from "@/lib/format";
import { PermissionMatrix, RoleBadge, SimulatedRolesAlert } from "./role-bits";
import { UserAvatar } from "./user-avatar";
import { UserFormDialog } from "./user-form-dialog";
import { useUserStatus } from "./use-user-status";

interface ActivityItem {
  id: string;
  at: string;
  title: string;
  detail: string;
}

export function UserProfile() {
  const { id } = useParams<{ id: string }>();
  const data = useData();
  const idx = useIndex();
  const fmt = useFormat();
  const me = useCurrentUser();
  const { can } = usePermission();
  const setCurrentUser = useWmsStore((s) => s.setCurrentUser);
  const { toggle, dialog } = useUserStatus();
  const [editOpen, setEditOpen] = useState(false);

  const user = data.users.find((u) => u.id === id) ?? null;
  const manage = can("users.manage");

  const openTasks = useMemo(
    () =>
      data.tasks
        .filter((t) => t.assigneeId === id && t.status !== "completed")
        .sort((a, b) => a.dueDate.localeCompare(b.dueDate)),
    [data.tasks, id],
  );

  const activity = useMemo<ActivityItem[]>(() => {
    const items: ActivityItem[] = [];
    for (const m of data.movements) {
      if (m.performedBy !== id) continue;
      items.push({
        id: m.id,
        at: m.createdAt,
        title: `${titleCase(m.type)} · ${m.quantity} × ${idx.products.get(m.productId)?.name ?? "item"}`,
        detail: `${m.reference}${m.source ? ` · ${m.source.number}` : ""}`,
      });
    }
    for (const o of data.orders) if (o.createdBy === id) items.push({ id: o.id, at: o.orderDate, title: `Created order ${o.number}`, detail: titleCase(o.status) });
    for (const p of data.purchaseOrders) if (p.createdBy === id) items.push({ id: p.id, at: p.orderDate, title: `Created purchase order ${p.number}`, detail: titleCase(p.status) });
    for (const t of data.tasks) if (t.assigneeId === id && t.completedAt) items.push({ id: `t${t.id}`, at: t.completedAt, title: `Completed ${t.number}`, detail: t.title });
    return items.sort((a, b) => b.at.localeCompare(a.at)).slice(0, 8);
  }, [data.movements, data.orders, data.purchaseOrders, data.tasks, id, idx.products]);

  if (!user) {
    return (
      <EmptyState
        icon={UserX}
        title="User not found"
        description="This user does not exist or was removed."
        action={<LinkButton href="/users" variant="outline">Back to users</LinkButton>}
      />
    );
  }

  const isMe = me?.id === user.id;
  const canSwitch = user.status === "active" && !isMe;

  return (
    <div className="space-y-4">
      <PageHeader
        className="mb-2"
        title={user.name}
        description={`${user.title} · ${ROLE_LABELS[user.role]}`}
        actions={
          <>
            <Button
              variant="outline"
              disabled={!canSwitch}
              title={isMe ? "You are already viewing as this user" : user.status !== "active" ? "Inactive users cannot be switched to" : undefined}
              onClick={() => {
                setCurrentUser(user.id);
                toast.info(`Now viewing as ${user.name} (${ROLE_LABELS[user.role]})`);
              }}
              data-testid="switch-to-user"
            >
              <Repeat /> Switch to this user (demo)
            </Button>
            <Button variant="outline" disabled={!manage} title={manage ? undefined : "You need the Users & Roles permission"} onClick={() => setEditOpen(true)} data-testid="edit-user">
              <Pencil /> Edit
            </Button>
            <Button
              variant={user.status === "active" ? "destructive" : "default"}
              disabled={!manage}
              onClick={() => void toggle(user)}
              data-testid="toggle-user-status"
            >
              {user.status === "active" ? <PowerOff /> : <Power />}
              {user.status === "active" ? "Deactivate" : "Activate"}
            </Button>
          </>
        }
      />
      <SimulatedRolesAlert />

      <Section>
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center">
          <UserAvatar name={user.name} size="lg" className="size-16" />
          <div className="min-w-0 flex-1 space-y-2">
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="text-lg font-semibold">{user.name}</h2>
              <RoleBadge role={user.role} />
              <StatusBadge status={user.status} />
              {isMe && <span className="rounded bg-muted px-1.5 py-0.5 text-xs font-medium text-muted-foreground">Current demo user</span>}
            </div>
            <p className="text-sm text-muted-foreground">{ROLE_DESCRIPTIONS[user.role]}</p>
          </div>
        </div>
      </Section>

      <div className="grid gap-4 lg:grid-cols-2">
        <Section title="Contact information">
          <dl className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <InfoItem label="Email">
              <span className="inline-flex items-center gap-1.5">
                <Mail className="size-3.5 text-muted-foreground" aria-hidden /> {user.email}
              </span>
            </InfoItem>
            <InfoItem label="Phone">
              <span className="inline-flex items-center gap-1.5">
                <Phone className="size-3.5 text-muted-foreground" aria-hidden /> {user.phone || "—"}
              </span>
            </InfoItem>
            <InfoItem label="Job title">{user.title}</InfoItem>
            <InfoItem label="Member since">{fmt.date(user.createdAt)}</InfoItem>
          </dl>
        </Section>

        <Section title="Assigned warehouses" description={`${user.warehouseIds.length} warehouse${user.warehouseIds.length === 1 ? "" : "s"}`}>
          <ul className="space-y-2">
            {user.warehouseIds.map((wid) => {
              const w = idx.warehouses.get(wid);
              if (!w) return null;
              return (
                <li key={wid}>
                  <Link href={`/warehouses/${w.id}`} className="flex items-center justify-between gap-2 rounded-lg border px-3 py-2 text-sm hover:bg-muted/50">
                    <span className="min-w-0 truncate font-medium">{w.name}</span>
                    <span className="shrink-0 text-xs text-muted-foreground">
                      {w.code} · {w.city}
                    </span>
                  </Link>
                </li>
              );
            })}
            {user.warehouseIds.length === 0 && <li className="text-sm text-muted-foreground">No warehouses assigned.</li>}
          </ul>
        </Section>
      </div>

      <Section title="Role & permissions" description={`${ROLE_LABELS[user.role]} — simulated access for demos`}>
        <PermissionMatrix role={user.role} />
      </Section>

      <div className="grid gap-4 lg:grid-cols-2">
        <Section
          title="Open tasks"
          description={`${openTasks.length} assigned`}
          actions={
            <LinkButton href="/tasks" variant="ghost" size="sm">
              All tasks
            </LinkButton>
          }
        >
          {openTasks.length === 0 ? (
            <p className="text-sm text-muted-foreground">No open tasks assigned.</p>
          ) : (
            <ul className="divide-y" data-testid="profile-tasks">
              {openTasks.slice(0, 6).map((t) => (
                <li key={t.id}>
                  <Link href={`/tasks?task=${t.id}`} className="flex items-center justify-between gap-3 py-2 hover:bg-muted/40">
                    <span className="min-w-0">
                      <span className="block truncate text-sm font-medium">{t.title}</span>
                      <span className="text-xs text-muted-foreground">
                        {t.number} · due {fmt.date(t.dueDate)}
                      </span>
                    </span>
                    <span className="flex shrink-0 flex-col items-end gap-1">
                      <StatusBadge status={t.status} domain="task" />
                      <PriorityBadge priority={t.priority} />
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
          {openTasks.length > 6 && <p className="mt-2 text-xs text-muted-foreground">+ {openTasks.length - 6} more open tasks</p>}
        </Section>

        <Section title="Recent activity" description="Latest actions recorded for this user">
          {activity.length === 0 ? (
            <p className="text-sm text-muted-foreground">No recorded activity yet.</p>
          ) : (
            <ol className="relative space-y-3 border-l pl-5" data-testid="profile-activity">
              {activity.map((a) => (
                <li key={a.id} className="relative">
                  <span className="absolute top-1.5 -left-[25px] size-2.5 rounded-full border-2 border-card bg-primary ring-2 ring-primary/20" aria-hidden />
                  <p className="text-sm font-medium break-words">{a.title}</p>
                  <p className="text-xs text-muted-foreground">
                    {a.detail} · {fmt.dateTime(a.at)}
                  </p>
                </li>
              ))}
            </ol>
          )}
        </Section>
      </div>

      <UserFormDialog open={editOpen} onOpenChange={setEditOpen} user={user} />
      {dialog}
    </div>
  );
}
