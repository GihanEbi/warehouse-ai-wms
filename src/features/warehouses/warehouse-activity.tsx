"use client";

import { useMemo } from "react";
import Link from "next/link";
import { ClipboardList, FileText, ShoppingCart, Truck } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import type { Warehouse } from "@/types";
import { Section } from "@/components/shared/page-header";
import { StatusBadge } from "@/components/shared/status-badge";
import { EmptyState } from "@/components/shared/states";
import { useData, useFormat, useIndex } from "@/hooks/use-wms";
import { MovementTable } from "@/features/master-data/movement-table";

interface FeedItem {
  key: string;
  at: string;
  icon: LucideIcon;
  label: string;
  title: string;
  status: string;
  domain?: "po" | "order" | "task" | "transfer";
  href: string;
}

export function WarehouseActivity({ warehouse }: { warehouse: Warehouse }) {
  const data = useData();
  const fmt = useFormat();
  const { warehouses, suppliers, customers } = useIndex();

  const movements = useMemo(
    () => data.movements.filter((m) => m.warehouseId === warehouse.id).sort((a, b) => b.createdAt.localeCompare(a.createdAt)),
    [data.movements, warehouse.id],
  );

  const feed = useMemo<FeedItem[]>(() => {
    const items: FeedItem[] = [];
    for (const t of data.tasks) {
      if (t.warehouseId !== warehouse.id) continue;
      items.push({ key: t.id, at: t.createdAt, icon: ClipboardList, label: "Task", title: `${t.number} · ${t.title}`, status: t.status, domain: "task", href: `/tasks?task=${t.id}` });
    }
    for (const o of data.orders) {
      if (o.warehouseId !== warehouse.id) continue;
      items.push({ key: o.id, at: o.orderDate, icon: FileText, label: "Order", title: `${o.number} · ${customers.get(o.customerId)?.name ?? "Customer"}`, status: o.status, domain: "order", href: `/orders/${o.id}` });
    }
    for (const p of data.purchaseOrders) {
      if (p.warehouseId !== warehouse.id) continue;
      items.push({ key: p.id, at: p.orderDate, icon: ShoppingCart, label: "Purchase order", title: `${p.number} · ${suppliers.get(p.supplierId)?.name ?? "Supplier"}`, status: p.status, domain: "po", href: `/purchase-orders/${p.id}` });
    }
    for (const t of data.transfers) {
      if (t.fromWarehouseId !== warehouse.id && t.toWarehouseId !== warehouse.id) continue;
      const dir = t.fromWarehouseId === warehouse.id ? `to ${warehouses.get(t.toWarehouseId)?.code ?? ""}` : `from ${warehouses.get(t.fromWarehouseId)?.code ?? ""}`;
      items.push({ key: t.id, at: t.createdAt, icon: Truck, label: "Transfer", title: `${t.number} · ${t.type === "internal" ? "internal move" : dir}`, status: t.status, domain: "transfer", href: `/transfers/${t.id}` });
    }
    return items.sort((a, b) => b.at.localeCompare(a.at)).slice(0, 12);
  }, [data.tasks, data.orders, data.purchaseOrders, data.transfers, warehouse.id, customers, suppliers, warehouses]);

  return (
    <div className="grid grid-cols-1 gap-4 xl:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]" data-testid="warehouse-activity">
      <Section title="Latest stock movements" description={`${fmt.number(movements.length)} movements recorded for ${warehouse.code}`} contentClassName="p-0">
        <MovementTable movements={movements} showProduct testId="warehouse-movements" />
      </Section>
      <Section title="Recent tasks and documents" description="Latest items touching this warehouse">
        {feed.length === 0 ? (
          <EmptyState title="No recent activity" description="Orders, purchase orders, transfers and tasks will show up here." />
        ) : (
          <ul className="space-y-3" data-testid="warehouse-feed">
            {feed.map((f) => (
              <li key={`${f.label}-${f.key}`} className="flex items-start gap-3">
                <span className="mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-lg bg-muted text-muted-foreground">
                  <f.icon className="size-4" />
                </span>
                <div className="min-w-0 flex-1">
                  <Link href={f.href} className="block truncate text-sm font-medium hover:underline">
                    {f.title}
                  </Link>
                  <p className="text-xs text-muted-foreground">
                    {f.label} · {fmt.date(f.at)}
                  </p>
                </div>
                <StatusBadge status={f.status} domain={f.domain === "transfer" ? "transfer" : f.domain === "task" ? "task" : undefined} />
              </li>
            ))}
          </ul>
        )}
      </Section>
    </div>
  );
}
