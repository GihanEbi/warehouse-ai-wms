"use client";

import { useMemo } from "react";
import Link from "next/link";
import { ExternalLink, SlidersHorizontal } from "lucide-react";
import type { ID } from "@/types";
import { Button } from "@/components/ui/button";
import { DetailDrawer } from "@/components/shared/dialogs";
import { InfoItem, Section } from "@/components/shared/page-header";
import { ProductImage } from "@/components/shared/product-bits";
import { StatusBadge } from "@/components/shared/status-badge";
import { LinkButton } from "@/components/shared/link-button";
import { useData, useFormat, useIndex, usePermission, useSettings } from "@/hooks/use-wms";
import { getStockStatus, productStock, stockRecordAvailable, type WarehouseScope } from "@/lib/inventory/selectors";
import { MovementTypeBadge, SignedQty } from "./movement-badge";

export function ProductStockDrawer({
  productId,
  scope,
  onClose,
  onAdjust,
}: {
  productId: ID | null;
  scope: WarehouseScope;
  onClose: () => void;
  onAdjust: (productId: ID, warehouseId?: ID, binId?: ID) => void;
}) {
  const data = useData();
  const idx = useIndex();
  const fmt = useFormat();
  const settings = useSettings();
  const { can } = usePermission();
  const product = productId ? idx.products.get(productId) : undefined;

  const summary = useMemo(() => (product ? productStock(data, product.id, scope) : null), [data, product, scope]);
  const records = useMemo(
    () =>
      product
        ? data.stock
            .filter((r) => r.productId === product.id && (scope === "all" || r.warehouseId === scope) && (r.onHand > 0 || r.reserved > 0 || r.blocked > 0))
            .sort((a, b) => a.warehouseId.localeCompare(b.warehouseId) || (idx.bins.get(a.binId)?.code ?? "").localeCompare(idx.bins.get(b.binId)?.code ?? ""))
        : [],
    [data.stock, product, scope, idx.bins],
  );
  const movements = useMemo(
    () =>
      product
        ? data.movements
            .filter((m) => m.productId === product.id && (scope === "all" || m.warehouseId === scope))
            .sort((a, b) => b.createdAt.localeCompare(a.createdAt) || b.reference.localeCompare(a.reference))
            .slice(0, 50)
        : [],
    [data.movements, product, scope],
  );

  const status = summary && product ? getStockStatus(summary, product.reorderLevel, settings.lowStockThresholdFactor) : null;
  const canAdjust = can("inventory.adjust");

  return (
    <DetailDrawer
      open={!!productId && !!product}
      onOpenChange={(o) => !o && onClose()}
      title={product?.name ?? "Product"}
      description={product ? `${product.sku} · ${product.category}` : undefined}
      width="sm:max-w-2xl"
      footer={
        product ? (
          <div className="flex w-full flex-wrap justify-end gap-2">
            <LinkButton href={`/products/${product.id}`} variant="outline">
              <ExternalLink />
              Open product page
            </LinkButton>
            <Button onClick={() => onAdjust(product.id, scope === "all" ? undefined : scope)} disabled={!canAdjust} title={canAdjust ? undefined : "Your role cannot adjust stock"} data-testid="drawer-adjust">
              <SlidersHorizontal />
              Adjust stock
            </Button>
          </div>
        ) : undefined
      }
    >
      {product && summary && (
        <div className="space-y-5" data-testid="product-drawer">
          <div className="flex items-center gap-3">
            <ProductImage product={product} size={56} />
            <div className="min-w-0">
              <p className="truncate font-medium">{product.name}</p>
              <div className="mt-1 flex flex-wrap items-center gap-2">
                {status && <StatusBadge status={status} />}
                <span className="text-xs text-muted-foreground">Reorder level {product.reorderLevel}</span>
              </div>
            </div>
          </div>

          <dl className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            <InfoItem label="On hand (storage)">{fmt.number(summary.onHand)}</InfoItem>
            <InfoItem label="Reserved">{fmt.number(summary.reserved)}</InfoItem>
            <InfoItem label="Blocked">{fmt.number(summary.blocked)}</InfoItem>
            <InfoItem label="Available">{fmt.number(summary.available)}</InfoItem>
            <InfoItem label="Staging / returns">
              {fmt.number(summary.staging)} / {fmt.number(summary.returns)}
            </InfoItem>
            <InfoItem label="Stock value">{fmt.money(summary.physical * product.unitCost)}</InfoItem>
          </dl>

          <Section title="Stock by location" contentClassName="p-0">
            {records.length === 0 ? (
              <p className="p-4 text-sm text-muted-foreground">No stock on hand in the selected scope.</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm" data-testid="drawer-bins">
                  <thead className="border-b bg-muted/40 text-xs text-muted-foreground">
                    <tr>
                      <th className="px-3 py-2 text-left font-medium">Location</th>
                      <th className="px-3 py-2 text-left font-medium">Warehouse</th>
                      <th className="px-3 py-2 text-right font-medium">On hand</th>
                      <th className="px-3 py-2 text-right font-medium">Reserved</th>
                      <th className="px-3 py-2 text-right font-medium">Available</th>
                      <th className="px-3 py-2" />
                    </tr>
                  </thead>
                  <tbody>
                    {records.map((r) => {
                      const bin = idx.bins.get(r.binId);
                      return (
                        <tr key={r.id} className="border-b last:border-0">
                          <td className="px-3 py-2">
                            <span className="font-mono text-xs">{bin?.code}</span>
                            {bin && bin.type !== "storage" && <span className="ml-1.5 text-xs text-muted-foreground">({bin.type})</span>}
                          </td>
                          <td className="px-3 py-2 text-muted-foreground">{idx.warehouses.get(r.warehouseId)?.code}</td>
                          <td className="px-3 py-2 text-right tabular-nums">{r.onHand}</td>
                          <td className="px-3 py-2 text-right tabular-nums">{r.reserved}</td>
                          <td className="px-3 py-2 text-right tabular-nums">{stockRecordAvailable(r, bin)}</td>
                          <td className="px-3 py-2 text-right">
                            {canAdjust && (
                              <Button variant="ghost" size="xs" onClick={() => onAdjust(product.id, r.warehouseId, r.binId)}>
                                Adjust
                              </Button>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </Section>

          <Section title="Stock movement history" description={`Latest ${movements.length} movement${movements.length === 1 ? "" : "s"}`} contentClassName="p-0">
            {movements.length === 0 ? (
              <p className="p-4 text-sm text-muted-foreground">No movements recorded.</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm" data-testid="drawer-movements">
                  <thead className="border-b bg-muted/40 text-xs text-muted-foreground">
                    <tr>
                      <th className="px-3 py-2 text-left font-medium">Reference</th>
                      <th className="px-3 py-2 text-left font-medium">Type</th>
                      <th className="px-3 py-2 text-right font-medium">Qty</th>
                      <th className="px-3 py-2 text-left font-medium">From → To</th>
                      <th className="px-3 py-2 text-left font-medium">Date</th>
                      <th className="px-3 py-2 text-left font-medium">By</th>
                    </tr>
                  </thead>
                  <tbody>
                    {movements.map((m) => (
                      <tr key={m.id} className="border-b align-top last:border-0">
                        <td className="px-3 py-2 whitespace-nowrap">
                          <span className="font-mono text-xs">{m.reference}</span>
                          {m.source && <span className="block text-[11px] text-muted-foreground">{m.source.number}</span>}
                        </td>
                        <td className="px-3 py-2">
                          <MovementTypeBadge type={m.type} />
                        </td>
                        <td className="px-3 py-2 text-right">
                          <SignedQty delta={m.onHandDelta} quantity={m.quantity} />
                        </td>
                        <td className="px-3 py-2 text-xs">
                          {m.fromLabel} → {m.toLabel}
                        </td>
                        <td className="px-3 py-2 text-xs whitespace-nowrap text-muted-foreground">{fmt.dateTime(m.createdAt)}</td>
                        <td className="px-3 py-2 text-xs whitespace-nowrap">{idx.users.get(m.performedBy)?.name ?? "—"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Section>
          <p className="text-xs text-muted-foreground">
            Need the full catalogue record?{" "}
            <Link href={`/products/${product.id}`} className="text-primary hover:underline">
              Open the product page
            </Link>
            .
          </p>
        </div>
      )}
    </DetailDrawer>
  );
}
