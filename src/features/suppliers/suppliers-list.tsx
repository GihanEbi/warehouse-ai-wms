"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Eye, Pencil, Plus, Power, Factory } from "lucide-react";
import type { Supplier } from "@/types";
import { Button } from "@/components/ui/button";
import { DataTable, type Column } from "@/components/shared/data-table";
import { ExportButton } from "@/components/shared/export-button";
import { FilterDropdown, SearchInput, Toolbar } from "@/components/shared/form-controls";
import { PageHeader } from "@/components/shared/page-header";
import { StatusBadge } from "@/components/shared/status-badge";
import { useData, usePermission } from "@/hooks/use-wms";
import { RowActions } from "@/features/master-data/row-actions";
import { SupplierFormDialog } from "./supplier-form-dialog";
import { useSupplierStatusToggle } from "./use-supplier-status";

export function SuppliersList() {
  const data = useData();
  const router = useRouter();
  const { can } = usePermission();
  const canWrite = can("suppliers.write");
  const [q, setQ] = useState("");
  const [status, setStatus] = useState("all");
  const [country, setCountry] = useState("all");
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<Supplier | null>(null);
  const toggle = useSupplierStatusToggle();

  const countries = useMemo(() => [...new Set(data.suppliers.map((s) => s.country))].sort(), [data.suppliers]);

  const filtered = useMemo(() => {
    const term = q.trim().toLowerCase();
    return data.suppliers.filter(
      (s) =>
        (status === "all" || s.status === status) &&
        (country === "all" || s.country === country) &&
        (!term || [s.name, s.code, s.contactPerson, s.email, s.phone].some((v) => v.toLowerCase().includes(term))),
    );
  }, [data.suppliers, q, status, country]);

  const openCreate = () => {
    setEditing(null);
    setFormOpen(true);
  };

  const columns = useMemo<Column<Supplier>[]>(
    () => [
      { id: "name", header: "Supplier", sortValue: (s) => s.name, cell: (s) => <span className="block max-w-64 truncate font-medium">{s.name}</span> },
      { id: "code", header: "Code", sortValue: (s) => s.code, cell: (s) => <span className="font-mono text-xs">{s.code}</span> },
      { id: "contact", header: "Contact person", hideOnMobile: true, sortValue: (s) => s.contactPerson, cell: (s) => <span className="whitespace-nowrap">{s.contactPerson}</span> },
      { id: "email", header: "Email", hideOnMobile: true, sortValue: (s) => s.email, cell: (s) => <span className="block max-w-52 truncate">{s.email}</span> },
      { id: "phone", header: "Phone", hideOnMobile: true, cell: (s) => <span className="whitespace-nowrap">{s.phone}</span> },
      { id: "country", header: "Country", sortValue: (s) => s.country, cell: (s) => <span className="whitespace-nowrap">{s.country}</span> },
      { id: "status", header: "Status", sortValue: (s) => s.status, cell: (s) => <StatusBadge status={s.status} /> },
      {
        id: "actions",
        header: "Actions",
        align: "right",
        cell: (s) => (
          <RowActions
            actions={[
              { key: "view", label: "View details", icon: Eye, onClick: () => router.push(`/suppliers/${s.id}`) },
              {
                key: "edit",
                label: "Edit",
                icon: Pencil,
                disabled: !canWrite,
                onClick: () => {
                  setEditing(s);
                  setFormOpen(true);
                },
              },
              { key: "toggle", label: s.status === "active" ? "Deactivate" : "Activate", icon: Power, destructive: s.status === "active", disabled: !canWrite, onClick: () => toggle.request(s) },
            ]}
          />
        ),
      },
    ],
    // eslint-disable-next-line react-hooks/exhaustive-deps -- toggle.request only sets state
    [router, canWrite],
  );

  return (
    <>
      <PageHeader
        title="Suppliers"
        description="Vendors you purchase from, with contact and commercial terms."
        actions={
          <>
            <ExportButton
              filename="suppliers"
              getData={() => ({
                headers: ["Code", "Name", "Contact person", "Email", "Phone", "Country", "Payment terms", "Lead time (days)", "Status"],
                rows: filtered.map((s) => [s.code, s.name, s.contactPerson, s.email, s.phone, s.country, s.paymentTerms, s.leadTimeDays, s.status]),
              })}
            />
            <Button onClick={openCreate} disabled={!canWrite} title={canWrite ? undefined : "Your role cannot add suppliers"} data-testid="add-supplier">
              <Plus />
              Add supplier
            </Button>
          </>
        }
      />
      <div className="rounded-xl border bg-card shadow-card">
        <Toolbar>
          <SearchInput value={q} onChange={setQ} placeholder="Search name, code, contact or email…" />
          <FilterDropdown label="Status" value={status} onChange={setStatus} options={[{ value: "active", label: "Active" }, { value: "inactive", label: "Inactive" }]} className="sm:w-52" />
          <FilterDropdown label="Country" value={country} onChange={setCountry} options={countries.map((c) => ({ value: c, label: c }))} allLabel="All countries" className="sm:w-56" />
        </Toolbar>
        <DataTable
          testId="suppliers-table"
          data={filtered}
          columns={columns}
          getRowId={(s) => s.id}
          rowHref={(s) => `/suppliers/${s.id}`}
          initialSort={{ id: "name" }}
          compact
          empty={{ title: "No suppliers match", description: "Adjust the filters or add a new supplier.", icon: Factory }}
          mobileCard={(s) => (
            <div className="flex items-start gap-3">
              <div className="min-w-0 flex-1 space-y-1">
                <div className="flex items-start justify-between gap-2">
                  <p className="min-w-0 font-medium">{s.name}</p>
                  <StatusBadge status={s.status} />
                </div>
                <p className="text-xs text-muted-foreground">
                  <span className="font-mono">{s.code}</span> · {s.country}
                </p>
                <p className="break-words text-xs text-muted-foreground">
                  {s.contactPerson} · {s.email}
                </p>
              </div>
              <RowActions
                actions={[
                  { key: "view", label: "View details", icon: Eye, onClick: () => router.push(`/suppliers/${s.id}`) },
                  { key: "edit", label: "Edit", icon: Pencil, disabled: !canWrite, onClick: () => { setEditing(s); setFormOpen(true); } },
                  { key: "toggle", label: s.status === "active" ? "Deactivate" : "Activate", icon: Power, disabled: !canWrite, onClick: () => toggle.request(s) },
                ]}
              />
            </div>
          )}
        />
      </div>
      <SupplierFormDialog open={formOpen} onOpenChange={setFormOpen} supplier={editing} />
      {toggle.dialog}
    </>
  );
}
