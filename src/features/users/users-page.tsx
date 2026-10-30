"use client";

import { useMemo, useState } from "react";
import { Pencil, Plus, Power, PowerOff, Users as UsersIcon } from "lucide-react";
import type { User } from "@/types";
import { Button } from "@/components/ui/button";
import { DataTable, type Column } from "@/components/shared/data-table";
import { FilterDropdown, SearchInput, Toolbar } from "@/components/shared/form-controls";
import { PageHeader, Section } from "@/components/shared/page-header";
import { StatusBadge } from "@/components/shared/status-badge";
import { useCurrentUser, useData, useIndex, usePermission } from "@/hooks/use-wms";
import { ROLE_LABELS } from "@/lib/constants";
import { RoleBadge, RoleOverview, ROLES, SimulatedRolesAlert } from "./role-bits";
import { UserAvatar } from "./user-avatar";
import { UserFormDialog } from "./user-form-dialog";
import { useUserStatus } from "./use-user-status";

const stop = (e: React.SyntheticEvent) => e.stopPropagation();

export function UsersPage() {
  const data = useData();
  const idx = useIndex();
  const me = useCurrentUser();
  const { can } = usePermission();
  const manage = can("users.manage");
  const { toggle, dialog } = useUserStatus();

  const [search, setSearch] = useState("");
  const [role, setRole] = useState("all");
  const [status, setStatus] = useState("all");
  const [warehouse, setWarehouse] = useState("all");
  const [formOpen, setFormOpen] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return data.users.filter((u) => {
      if (role !== "all" && u.role !== role) return false;
      if (status !== "all" && u.status !== status) return false;
      if (warehouse !== "all" && !u.warehouseIds.includes(warehouse)) return false;
      if (q && !`${u.name} ${u.email} ${u.title} ${u.phone}`.toLowerCase().includes(q)) return false;
      return true;
    });
  }, [data.users, search, role, status, warehouse]);

  const editUser = editId ? (data.users.find((u) => u.id === editId) ?? null) : null;
  const whCodes = (u: User) => u.warehouseIds.map((id) => idx.warehouses.get(id)?.code).filter(Boolean).join(", ");
  const reason = manage ? undefined : "You need the Users & Roles permission";

  const actions = (u: User) => (
    <div className="flex items-center justify-end gap-1.5" onClick={stop}>
      <Button variant="outline" size="sm" disabled={!manage} title={reason ?? "Edit user"} onClick={() => setEditId(u.id)} data-testid={`edit-user-${u.id}`}>
        <Pencil /> Edit
      </Button>
      <Button
        variant="ghost"
        size="sm"
        disabled={!manage}
        title={reason ?? (u.status === "active" ? "Deactivate user" : "Activate user")}
        onClick={() => void toggle(u)}
        data-testid={`toggle-user-${u.id}`}
      >
        {u.status === "active" ? <PowerOff /> : <Power />}
        {u.status === "active" ? "Deactivate" : "Activate"}
      </Button>
    </div>
  );

  const columns: Column<User>[] = [
    {
      id: "name",
      header: "User",
      sortValue: (u) => u.name,
      cell: (u) => (
        <div className="flex min-w-0 items-center gap-2.5">
          <UserAvatar name={u.name} size="default" />
          <div className="min-w-0">
            <p className="truncate font-medium">
              {u.name}
              {u.id === me?.id && <span className="ml-1.5 rounded bg-muted px-1 text-[10px] font-medium text-muted-foreground">You</span>}
            </p>
            <p className="truncate text-xs text-muted-foreground">{u.email}</p>
          </div>
        </div>
      ),
    },
    { id: "role", header: "Role", sortValue: (u) => ROLE_LABELS[u.role], cell: (u) => <RoleBadge role={u.role} /> },
    { id: "title", header: "Title", hideOnMobile: true, sortValue: (u) => u.title, cell: (u) => <span className="text-sm">{u.title}</span> },
    { id: "warehouses", header: "Warehouses", cell: (u) => <span className="text-xs">{whCodes(u) || "—"}</span> },
    { id: "status", header: "Status", sortValue: (u) => u.status, cell: (u) => <StatusBadge status={u.status} /> },
    { id: "actions", header: "Actions", align: "right", cell: actions },
  ];

  return (
    <div className="space-y-4">
      <PageHeader
        title="Users & Roles"
        description="Manage your team, their roles and assigned warehouses."
        className="mb-2"
        actions={
          <Button onClick={() => setFormOpen(true)} disabled={!manage} title={reason} data-testid="add-user">
            <Plus /> Add user
          </Button>
        }
      />
      <SimulatedRolesAlert />
      {!manage && (
        <p className="text-sm text-muted-foreground" data-testid="users-readonly">
          You have read-only access to this page.
        </p>
      )}

      <Section title="Role overview" description="What each role can do and which sidebar areas it sees.">
        <RoleOverview />
      </Section>

      <Section contentClassName="p-0">
        <Toolbar>
          <SearchInput value={search} onChange={setSearch} placeholder="Search name, email, title…" />
          <FilterDropdown label="Role" value={role} onChange={setRole} options={ROLES.map((r) => ({ value: r, label: ROLE_LABELS[r] }))} allLabel="All roles" />
          <FilterDropdown
            label="Status"
            value={status}
            onChange={setStatus}
            options={[
              { value: "active", label: "Active" },
              { value: "inactive", label: "Inactive" },
            ]}
          />
          <FilterDropdown label="Warehouse" value={warehouse} onChange={setWarehouse} options={data.warehouses.map((w) => ({ value: w.id, label: w.code }))} allLabel="All warehouses" />
        </Toolbar>
        <DataTable
          data={filtered}
          columns={columns}
          getRowId={(u) => u.id}
          rowHref={(u) => `/users/${u.id}`}
          testId="users-table"
          compact
          mobileCard={(u) => (
            <div className="space-y-2">
              <div className="flex items-start justify-between gap-2">
                <div className="flex min-w-0 items-center gap-2.5">
                  <UserAvatar name={u.name} size="default" />
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium">{u.name}</p>
                    <p className="truncate text-xs text-muted-foreground">{u.email}</p>
                  </div>
                </div>
                <StatusBadge status={u.status} />
              </div>
              <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                <RoleBadge role={u.role} />
                <span>{u.title}</span>
                <span>· {whCodes(u)}</span>
              </div>
              {actions(u)}
            </div>
          )}
          empty={{ title: "No users found", description: "Try adjusting your search or filters.", icon: UsersIcon }}
        />
      </Section>

      <UserFormDialog open={formOpen} onOpenChange={setFormOpen} />
      <UserFormDialog open={!!editUser} onOpenChange={(o) => !o && setEditId(null)} user={editUser} />
      {dialog}
    </div>
  );
}
