"use client";

import { Check, Minus, ShieldAlert } from "lucide-react";
import type { Role } from "@/types";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { TONE_CLASSES, type Tone } from "@/components/shared/status-badge";
import { NAVIGATION } from "@/lib/navigation";
import { ROLE_DESCRIPTIONS, ROLE_HIDDEN_ROUTES, ROLE_LABELS, ROLE_PERMISSIONS, type Permission } from "@/lib/constants";
import { cn } from "@/lib/utils";

export const ROLES: Role[] = ["admin", "warehouse_manager", "inventory_manager", "operator"];

const ROLE_TONE: Record<Role, Tone> = {
  admin: "primary",
  warehouse_manager: "info",
  inventory_manager: "teal",
  operator: "neutral",
};

export function RoleBadge({ role, className }: { role: Role; className?: string }) {
  return (
    <span
      data-role={role}
      className={cn("inline-flex items-center whitespace-nowrap rounded-full px-2 py-0.5 text-xs font-medium", TONE_CLASSES[ROLE_TONE[role]], className)}
    >
      {ROLE_LABELS[role]}
    </span>
  );
}

export function SimulatedRolesAlert({ className }: { className?: string }) {
  return (
    <Alert className={cn("border-info/30 bg-info-soft text-info", className)} data-testid="simulated-roles-alert">
      <ShieldAlert />
      <AlertTitle>Demo roles only</AlertTitle>
      <AlertDescription className="text-info/90">
        Roles are simulated for demos — they hide navigation and disable actions but are not real authentication or security.
      </AlertDescription>
    </Alert>
  );
}

/** Permission id -> module group + human description. */
export const PERMISSION_META: Record<Permission, { group: string; label: string }> = {
  "warehouses.write": { group: "Warehouses & Catalog", label: "Manage warehouses, zones and bins" },
  "products.write": { group: "Warehouses & Catalog", label: "Create and edit products" },
  "suppliers.write": { group: "Purchasing & Receiving", label: "Manage suppliers" },
  "po.write": { group: "Purchasing & Receiving", label: "Create and edit purchase orders" },
  "po.approve": { group: "Purchasing & Receiving", label: "Approve purchase orders" },
  "receiving.write": { group: "Purchasing & Receiving", label: "Receive goods and run putaway" },
  "inventory.adjust": { group: "Inventory & Transfers", label: "Adjust stock and run stock counts" },
  "transfers.write": { group: "Inventory & Transfers", label: "Create and process transfers" },
  "transfers.approve": { group: "Inventory & Transfers", label: "Approve transfers" },
  "orders.write": { group: "Orders & Fulfilment", label: "Create and manage customer orders" },
  "picking.write": { group: "Orders & Fulfilment", label: "Pick and pack orders" },
  "shipping.write": { group: "Orders & Fulfilment", label: "Create and dispatch shipments" },
  "returns.write": { group: "Orders & Fulfilment", label: "Process customer returns" },
  "tasks.write": { group: "Tasks & Reports", label: "Create and update warehouse tasks" },
  "reports.view": { group: "Tasks & Reports", label: "View reports and analytics" },
  "users.manage": { group: "Administration", label: "Manage users and roles" },
  "settings.manage": { group: "Administration", label: "Change system settings" },
};

export function groupedPermissions(): { group: string; items: Permission[] }[] {
  const groups = new Map<string, Permission[]>();
  (Object.keys(PERMISSION_META) as Permission[]).forEach((p) => {
    const g = PERMISSION_META[p].group;
    groups.set(g, [...(groups.get(g) ?? []), p]);
  });
  return Array.from(groups, ([group, items]) => ({ group, items }));
}

/** Granted / not granted list of every permission, grouped by module. */
export function PermissionMatrix({ role }: { role: Role }) {
  const granted = new Set(ROLE_PERMISSIONS[role]);
  return (
    <div className="grid gap-4 sm:grid-cols-2" data-testid="permission-matrix">
      {groupedPermissions().map(({ group, items }) => (
        <div key={group} className="rounded-lg border p-3">
          <p className="mb-2 text-xs font-semibold tracking-wide text-muted-foreground uppercase">{group}</p>
          <ul className="space-y-1.5">
            {items.map((p) => {
              const ok = granted.has(p);
              return (
                <li key={p} className="flex items-start gap-2 text-sm" data-granted={ok}>
                  <span
                    className={cn(
                      "mt-0.5 flex size-4 shrink-0 items-center justify-center rounded-full",
                      ok ? "bg-success-soft text-success" : "bg-muted text-muted-foreground",
                    )}
                  >
                    {ok ? <Check className="size-3" /> : <Minus className="size-3" />}
                    <span className="sr-only">{ok ? "Granted" : "Not granted"}</span>
                  </span>
                  <span className={cn(!ok && "text-muted-foreground")}>{PERMISSION_META[p].label}</span>
                </li>
              );
            })}
          </ul>
        </div>
      ))}
    </div>
  );
}

/** Four role cards: description and which sidebar areas each role sees. */
export function RoleOverview() {
  const all = NAVIGATION.flatMap((g) => g.items);
  return (
    <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4" data-testid="role-overview">
      {ROLES.map((role) => {
        const hidden = ROLE_HIDDEN_ROUTES[role];
        const visible = all.filter((i) => !hidden.includes(i.href));
        const hiddenItems = all.filter((i) => hidden.includes(i.href));
        return (
          <div key={role} className="flex flex-col gap-3 rounded-xl border bg-card p-4 shadow-card" data-testid={`role-card-${role}`}>
            <div className="flex items-center justify-between gap-2">
              <RoleBadge role={role} />
              <span className="text-xs text-muted-foreground">{ROLE_PERMISSIONS[role].length} permissions</span>
            </div>
            <p className="text-sm text-muted-foreground">{ROLE_DESCRIPTIONS[role]}</p>
            <div className="mt-auto space-y-1.5 text-xs">
              <p>
                <span className="font-medium">Sees {visible.length} areas.</span>{" "}
                {hiddenItems.length === 0 ? (
                  <span className="text-muted-foreground">Full navigation.</span>
                ) : (
                  <span className="text-muted-foreground">Hidden: {hiddenItems.map((i) => i.label).join(", ")}.</span>
                )}
              </p>
            </div>
          </div>
        );
      })}
    </div>
  );
}
