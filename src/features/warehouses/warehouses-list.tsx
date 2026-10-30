"use client";

import { useMemo, useState } from "react";
import { Boxes, Eye, Gauge, Pencil, Plus, Power, Warehouse as WarehouseIcon } from "lucide-react";
import type { Warehouse } from "@/types";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { DataTable, type Column } from "@/components/shared/data-table";
import { FilterDropdown, SearchInput, Toolbar } from "@/components/shared/form-controls";
import { PageHeader } from "@/components/shared/page-header";
import { StatCard } from "@/components/shared/stat-card";
import { StatusBadge } from "@/components/shared/status-badge";
import { ExportButton } from "@/components/shared/export-button";
import { useData, useFormat, useIndex, usePermission } from "@/hooks/use-wms";
import { warehouseCapacity } from "@/lib/inventory/selectors";
import { UtilBar } from "@/features/master-data/util-bar";
import { RowActions } from "@/features/master-data/row-actions";
import { WarehouseFormDialog } from "./warehouse-form-dialog";
import { useWarehouseStatusToggle } from "./use-warehouse-status";

interface Row {
  wh: Warehouse;
  managerName: string;
  binCount: number;
  capacity: number;
  used: number;
  utilization: number;
}

export function WarehousesList() {
  const data = useData();
  const { users } = useIndex();
  const fmt = useFormat();
  const router = useRouter();
  const { can } = usePermission();
  const canWrite = can("warehouses.write");
  const [q, setQ] = useState("");
  const [status, setStatus] = useState("all");
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<Warehouse | null>(null);
  const toggle = useWarehouseStatusToggle();

  const rows = useMemo<Row[]>(
    () =>
      data.warehouses.map((wh) => {
        const cap = warehouseCapacity(data, wh.id);
        return {
          wh,
          managerName: (wh.managerId && users.get(wh.managerId)?.name) || "Unassigned",
          binCount: data.bins.filter((b) => b.warehouseId === wh.id).length,
          capacity: cap.capacity,
          used: cap.used,
          utilization: cap.utilization,
        };
      }),
    [data, users],
  );

  const filtered = useMemo(() => {
    const term = q.trim().toLowerCase();
    return rows.filter(
      (r) =>
        (status === "all" || r.wh.status === status) &&
        (!term || [r.wh.name, r.wh.code, r.wh.city, r.managerName].some((s) => s.toLowerCase().includes(term))),
    );
  }, [rows, q, status]);

  const summary = useMemo(() => {
    const active = rows.filter((r) => r.wh.status === "active");
    const capacity = rows.reduce((s, r) => s + r.capacity, 0);
    const avg = rows.length ? Math.round(rows.reduce((s, r) => s + r.utilization, 0) / rows.length) : 0;
    return { total: rows.length, active: active.length, capacity, avg };
  }, [rows]);

  const openCreate = () => {
    setEditing(null);
    setFormOpen(true);
  };
  const openEdit = (wh: Warehouse) => {
    setEditing(wh);
    setFormOpen(true);
  };

  const columns = useMemo<Column<Row>[]>(
    () => [
      {
        id: "name",
        header: "Warehouse",
        sortValue: (r) => r.wh.name,
        cell: (r) => (
          <div className="min-w-0">
            <p className="font-medium">{r.wh.name}</p>
            <p className="text-xs text-muted-foreground lg:hidden">{r.wh.code}</p>
          </div>
        ),
      },
      { id: "code", header: "Code", sortValue: (r) => r.wh.code, cell: (r) => <span className="font-mono text-xs">{r.wh.code}</span> },
      { id: "city", header: "Location", sortValue: (r) => r.wh.city, cell: (r) => r.wh.city },
      { id: "manager", header: "Manager", sortValue: (r) => r.managerName, hideOnMobile: true, cell: (r) => <span className="whitespace-nowrap">{r.managerName}</span> },
      { id: "bins", header: "Storage locations", align: "right", sortValue: (r) => r.binCount, cell: (r) => <span className="tabular-nums">{fmt.number(r.binCount)} bins</span> },
      {
        id: "util",
        header: "Utilization",
        sortValue: (r) => r.utilization,
        className: "min-w-40",
        cell: (r) => (
          <div>
            <UtilBar pct={r.utilization} label={`${r.wh.name} utilization`} />
            <p className="mt-0.5 text-[11px] text-muted-foreground tabular-nums">
              {fmt.number(r.used)} / {fmt.number(r.capacity)} units
            </p>
          </div>
        ),
      },
      { id: "status", header: "Status", sortValue: (r) => r.wh.status, cell: (r) => <StatusBadge status={r.wh.status} /> },
      {
        id: "actions",
        header: "Actions",
        align: "right",
        cell: (r) => (
          <RowActions
            actions={[
              { key: "view", label: "View details", icon: Eye, onClick: () => router.push(`/warehouses/${r.wh.id}`) },
              { key: "edit", label: "Edit", icon: Pencil, onClick: () => openEdit(r.wh), disabled: !canWrite },
              {
                key: "toggle",
                label: r.wh.status === "active" ? "Deactivate" : "Activate",
                icon: Power,
                onClick: () => toggle.request(r.wh),
                disabled: !canWrite,
                destructive: r.wh.status === "active",
              },
            ]}
          />
        ),
      },
    ],
    // eslint-disable-next-line react-hooks/exhaustive-deps -- toggle.request is stable enough for a row action closure
    [fmt, router, canWrite],
  );

  return (
    <>
      <PageHeader
        title="Warehouses"
        description="Sites, storage structure and utilization across the network."
        actions={
          <>
            <ExportButton
              filename="warehouses"
              getData={() => ({
                headers: ["Code", "Name", "City", "Manager", "Bins", "Capacity", "Used", "Utilization %", "Status"],
                rows: filtered.map((r) => [r.wh.code, r.wh.name, r.wh.city, r.managerName, r.binCount, r.capacity, r.used, r.utilization, r.wh.status]),
              })}
            />
            <Button onClick={openCreate} disabled={!canWrite} title={canWrite ? undefined : "Your role cannot add warehouses"} data-testid="add-warehouse">
              <Plus />
              Add warehouse
            </Button>
          </>
        }
      />

      <div className="mb-6 grid gap-4 sm:grid-cols-3">
        <StatCard testId="stat-warehouses" title="Warehouses" value={summary.total} description={`${summary.active} active`} icon={WarehouseIcon} tone="primary" />
        <StatCard testId="stat-capacity" title="Total capacity" value={`${fmt.number(summary.capacity)} units`} description="Storage bins only" icon={Boxes} tone="teal" />
        <StatCard testId="stat-utilization" title="Avg. utilization" value={`${summary.avg}%`} description="Mean across warehouses" icon={Gauge} tone={summary.avg >= 90 ? "danger" : summary.avg >= 75 ? "warning" : "success"} />
      </div>

      <div className="rounded-xl border bg-card shadow-card">
        <Toolbar>
          <SearchInput value={q} onChange={setQ} placeholder="Search name, code, city or manager…" />
          <FilterDropdown
            label="Status"
            value={status}
            onChange={setStatus}
            options={[
              { value: "active", label: "Active" },
              { value: "inactive", label: "Inactive" },
            ]}
            className="sm:w-52"
          />
        </Toolbar>
        <DataTable
          testId="warehouses-table"
          data={filtered}
          columns={columns}
          getRowId={(r) => r.wh.id}
          rowHref={(r) => `/warehouses/${r.wh.id}`}
          initialSort={{ id: "name" }}
          compact
          empty={{
            title: "No warehouses match",
            description: "Adjust the search or status filter, or add a new warehouse.",
            icon: WarehouseIcon,
          }}
          mobileCard={(r) => (
            <div className="space-y-2">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="font-medium">{r.wh.name}</p>
                  <p className="text-xs text-muted-foreground">
                    <span className="font-mono">{r.wh.code}</span> · {r.wh.city}
                  </p>
                </div>
                <StatusBadge status={r.wh.status} />
              </div>
              <UtilBar pct={r.utilization} label={`${r.wh.name} utilization`} />
              <p className="text-xs text-muted-foreground">
                {r.managerName} · {fmt.number(r.binCount)} bins · {fmt.number(r.used)} / {fmt.number(r.capacity)} units
              </p>
            </div>
          )}
        />
      </div>

      <WarehouseFormDialog open={formOpen} onOpenChange={setFormOpen} warehouse={editing} />
      {toggle.dialog}
    </>
  );
}
