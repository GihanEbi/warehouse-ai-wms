"use client";

import { useMemo } from "react";
import Link from "next/link";
import { ArrowRight, ShoppingCart } from "lucide-react";
import type { ID } from "@/types";
import { Section } from "@/components/shared/page-header";
import { EmptyState } from "@/components/shared/states";
import { StatusBadge, PriorityBadge } from "@/components/shared/status-badge";
import { LinkButton } from "@/components/shared/link-button";
import { ProductImage } from "@/components/shared/product-bits";
import { AIRecommendationsWidget } from "@/components/ai/ai-recommendations-widget";
import { useData, useFormat, useIndex, usePermission, useSettings } from "@/hooks/use-wms";
import { lowStockProducts, productStock, type WarehouseScope } from "@/lib/inventory/selectors";
import { poTotal } from "@/lib/workflows/purchasing";
import { orderTotal } from "@/lib/workflows/orders";
import { cn } from "@/lib/utils";
import { MovementTypeBadge, SignedQty } from "@/features/inventory/movement-badge";
import {
  activityMovements,
  incomingPurchaseOrders,
  inRange,
  inScope,
  isOverdue,
  pendingPurchaseOrders,
  type RangeLike,
} from "./metrics";
import { Badge } from "@/components/ui/badge";

const ViewAll = ({ href, label = "View all" }: { href: string; label?: string }) => (
  <Link href={href} className="inline-flex items-center gap-1 text-xs font-medium text-primary hover:underline" data-testid={`view-all-${href.split("?")[0].replace(/\W+/g, "-").replace(/^-|-$/g, "")}`}>
    {label}
    <ArrowRight className="size-3" aria-hidden />
  </Link>
);

function Row({ children, href, className }: { children: React.ReactNode; href?: string; className?: string }) {
  const cls = cn("flex items-center gap-3 px-4 py-2.5", href && "transition-colors hover:bg-muted/50", className);
  return href ? (
    <li>
      <Link href={href} className={cls}>
        {children}
      </Link>
    </li>
  ) : (
    <li className={cls}>{children}</li>
  );
}

const WidgetList = ({ children, label }: { children: React.ReactNode; label: string }) => (
  <ul className="-mx-4 -my-4 divide-y" aria-label={label}>
    {children}
  </ul>
);

/** Warehouse where a reorder should be raised for a product (scope warehouse, else the one with least available). */
export function reorderWarehouse(
  warehouses: { id: ID }[],
  stockOf: (warehouseId: ID) => number,
  scope: WarehouseScope,
): ID | undefined {
  if (scope !== "all") return scope;
  let best: ID | undefined;
  let low = Infinity;
  for (const w of warehouses) {
    const a = stockOf(w.id);
    if (a < low) {
      low = a;
      best = w.id;
    }
  }
  return best;
}

/* -------------------------------------------------------- recent movements */

export function RecentMovementsWidget({ scope, range }: { scope: WarehouseScope; range: RangeLike }) {
  const data = useData();
  const idx = useIndex();
  const fmt = useFormat();
  const rows = useMemo(
    () => activityMovements(data, { scope, range }).sort((a, b) => b.createdAt.localeCompare(a.createdAt)).slice(0, 6),
    [data, scope, range],
  );
  return (
    <Section title="Recent Stock Movements" actions={<ViewAll href="/inventory?tab=movements" />} contentClassName="p-4" className="h-full overflow-hidden" >
      {rows.length === 0 ? (
        <EmptyState title="No movements in this period" description="Try a longer date range or another warehouse." className="py-8" />
      ) : (
        <WidgetList label="Recent stock movements">
          {rows.map((m) => {
            const p = idx.products.get(m.productId);
            return (
              <Row key={m.id} href={p ? `/inventory?product=${p.id}${scope !== "all" ? `&warehouse=${scope}` : ""}` : undefined}>
                {p && <ProductImage product={p} size={32} />}
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium">{p?.name ?? "Unknown product"}</p>
                  <p className="truncate text-xs text-muted-foreground">
                    {m.reference} · {fmt.relative(m.createdAt)}
                  </p>
                </div>
                <div className="flex shrink-0 flex-col items-end gap-1">
                  <SignedQty delta={m.onHandDelta} quantity={m.quantity} />
                  <MovementTypeBadge type={m.type} />
                </div>
              </Row>
            );
          })}
        </WidgetList>
      )}
    </Section>
  );
}

/* --------------------------------------------------------------- low stock */

export function LowStockWidget({ scope }: { scope: WarehouseScope }) {
  const data = useData();
  const settings = useSettings();
  const { can } = usePermission();
  const rows = useMemo(() => lowStockProducts(data, scope, settings.lowStockThresholdFactor), [data, scope, settings.lowStockThresholdFactor]);
  const activeWarehouses = useMemo(() => data.warehouses.filter((w) => w.status === "active"), [data.warehouses]);
  return (
    <Section
      title="Low Stock Products"
      description={rows.length ? `${rows.length} product${rows.length === 1 ? "" : "s"} at or below reorder level` : undefined}
      actions={<ViewAll href="/inventory?status=attention" />}
      className="h-full overflow-hidden"
    >
      {rows.length === 0 ? (
        <EmptyState title="All stocked up" description="No product is at or below its reorder level." className="py-8" />
      ) : (
        <WidgetList label="Low stock products">
          {rows.slice(0, 6).map(({ product, summary, status }) => {
            const wid = reorderWarehouse(activeWarehouses, (w) => productStock(data, product.id, w).available, scope);
            const qs = new URLSearchParams({ product: product.id });
            if (product.preferredSupplierId) qs.set("supplier", product.preferredSupplierId);
            if (wid) qs.set("warehouse", wid);
            return (
              <Row key={product.id}>
                <ProductImage product={product} size={32} />
                <div className="min-w-0 flex-1">
                  <Link href={`/inventory?product=${product.id}`} className="block truncate text-sm font-medium hover:underline">
                    {product.name}
                  </Link>
                  <p className="truncate text-xs text-muted-foreground">
                    <span className={status === "out_of_stock" ? "font-medium text-danger" : "font-medium text-warning"}>{summary.available} available</span> · reorder at {product.reorderLevel}
                    <span className="sr-only"> ({status === "out_of_stock" ? "out of stock" : "low stock"})</span>
                  </p>
                </div>
                {can("po.write") ? (
                  <LinkButton href={`/purchase-orders/new?${qs.toString()}`} variant="outline" size="sm" data-testid="reorder-link">
                    <ShoppingCart />
                    Reorder
                  </LinkButton>
                ) : (
                  <span className="text-xs text-muted-foreground" title="Your role cannot create purchase orders">
                    —
                  </span>
                )}
              </Row>
            );
          })}
        </WidgetList>
      )}
    </Section>
  );
}

/* ----------------------------------------------------------- pending POs */

export function PendingPurchaseOrdersWidget({ scope }: { scope: WarehouseScope }) {
  const data = useData();
  const idx = useIndex();
  const fmt = useFormat();
  const rows = useMemo(
    () => pendingPurchaseOrders(data, scope).sort((a, b) => b.orderDate.localeCompare(a.orderDate)),
    [data, scope],
  );
  return (
    <Section title="Pending Purchase Orders" description={rows.length ? `${rows.length} open` : undefined} actions={<ViewAll href="/purchase-orders" />} className="h-full overflow-hidden">
      {rows.length === 0 ? (
        <EmptyState title="No pending purchase orders" className="py-8" />
      ) : (
        <WidgetList label="Pending purchase orders">
          {rows.slice(0, 5).map((po) => (
            <Row key={po.id} href={`/purchase-orders/${po.id}`}>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium">{po.number}</p>
                <p className="truncate text-xs text-muted-foreground">{idx.suppliers.get(po.supplierId)?.name ?? "—"}</p>
              </div>
              <div className="flex shrink-0 flex-col items-end gap-1">
                <span className="text-sm font-medium tabular-nums">{fmt.moneyCompact(poTotal(po))}</span>
                <StatusBadge status={po.status} />
              </div>
            </Row>
          ))}
        </WidgetList>
      )}
    </Section>
  );
}

/* --------------------------------------------------------- recent orders */

export function RecentOrdersWidget({ scope, range }: { scope: WarehouseScope; range: RangeLike }) {
  const data = useData();
  const idx = useIndex();
  const fmt = useFormat();
  const rows = useMemo(
    () =>
      data.orders
        .filter((o) => inScope(o.warehouseId, scope) && inRange(o.orderDate, range))
        .sort((a, b) => b.orderDate.localeCompare(a.orderDate)),
    [data.orders, scope, range],
  );
  return (
    <Section title="Recent Customer Orders" description={rows.length ? `${rows.length} in selected period` : undefined} actions={<ViewAll href="/orders" />} className="h-full overflow-hidden">
      {rows.length === 0 ? (
        <EmptyState title="No orders in this period" description="Try a longer date range." className="py-8" />
      ) : (
        <WidgetList label="Recent customer orders">
          {rows.slice(0, 5).map((o) => (
            <Row key={o.id} href={`/orders/${o.id}`}>
              <div className="min-w-0 flex-1">
                <p className="flex items-center gap-2 truncate text-sm font-medium">
                  {o.number}
                  {(o.priority === "urgent" || o.priority === "high") && <PriorityBadge priority={o.priority} />}
                </p>
                <p className="truncate text-xs text-muted-foreground">
                  {idx.customers.get(o.customerId)?.name ?? "—"} · {fmt.date(o.orderDate)}
                </p>
              </div>
              <div className="flex shrink-0 flex-col items-end gap-1">
                <span className="text-sm font-medium tabular-nums">{fmt.moneyCompact(orderTotal(o))}</span>
                <StatusBadge status={o.status} />
              </div>
            </Row>
          ))}
        </WidgetList>
      )}
    </Section>
  );
}

/* ---------------------------------------------------- upcoming deliveries */

export function UpcomingDeliveriesWidget({ scope, now }: { scope: WarehouseScope; now: Date }) {
  const data = useData();
  const idx = useIndex();
  const fmt = useFormat();
  const rows = useMemo(() => incomingPurchaseOrders(data, scope), [data, scope]);
  return (
    <Section title="Upcoming Deliveries" description={rows.length ? "Approved purchase orders by expected date" : undefined} actions={<ViewAll href="/receiving" />} className="h-full overflow-hidden">
      {rows.length === 0 ? (
        <EmptyState title="No incoming deliveries" className="py-8" />
      ) : (
        <WidgetList label="Upcoming deliveries">
          {rows.slice(0, 5).map((po) => {
            const overdue = isOverdue(po, now);
            return (
              <Row key={po.id} href={`/purchase-orders/${po.id}`}>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium">{po.number}</p>
                  <p className="truncate text-xs text-muted-foreground">{idx.suppliers.get(po.supplierId)?.name ?? "—"}</p>
                </div>
                <div className="flex shrink-0 flex-col items-end gap-1">
                  <span className={cn("text-sm tabular-nums", overdue ? "font-medium text-danger" : "text-foreground")}>{fmt.date(po.expectedDate)}</span>
                  {overdue ? (
                    <Badge variant="outline" className="border-danger/40 bg-danger-soft text-danger">
                      Overdue
                    </Badge>
                  ) : (
                    <StatusBadge status={po.status} />
                  )}
                </div>
              </Row>
            );
          })}
        </WidgetList>
      )}
    </Section>
  );
}

/* ----------------------------------------------------------------- AI */

export function AIWidget({ scope }: { scope: WarehouseScope }) {
  return (
    <Section title="AI Recommendations" description="Suggestions generated from current data" actions={<ViewAll href="/ai-assistant" label="Open assistant" />} className="h-full overflow-hidden" contentClassName="p-4">
      <AIRecommendationsWidget scope={scope} />
    </Section>
  );
}
