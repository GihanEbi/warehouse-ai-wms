"use client";

import type { SalesOrder } from "@/types";
import { useFormat, useIndex, useSettings } from "@/hooks/use-wms";
import { customerAddress } from "@/features/orders/order-utils";

/**
 * Printable packing slip. Rendered as "paper" (white / black) on screen and in print;
 * everything around it should carry `print-hidden`.
 */
export function PackingSlip({ order }: { order: SalesOrder }) {
  const idx = useIndex();
  const fmt = useFormat();
  const settings = useSettings();
  const customer = idx.customers.get(order.customerId);
  const warehouse = idx.warehouses.get(order.warehouseId);
  const packing = order.packing;
  if (!packing) return null;
  const units = order.lines.reduce((s, l) => s + l.quantity, 0);

  return (
    <article className="print-area mx-auto w-full max-w-3xl rounded-lg border bg-white p-6 text-black shadow-card sm:p-8" data-testid="packing-slip">
      <header className="flex flex-col gap-3 border-b border-neutral-300 pb-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <p className="text-lg font-bold">{settings.companyName}</p>
          <p className="text-sm text-neutral-600">{warehouse?.name} ({warehouse?.code})</p>
          <p className="text-sm text-neutral-600">{warehouse?.address}</p>
        </div>
        <div className="sm:text-right">
          <p className="text-xl font-bold tracking-wide">PACKING SLIP</p>
          <p className="font-mono text-sm" data-testid="slip-number">{packing.slipNumber}</p>
          <p className="text-sm text-neutral-600">Packed {fmt.dateTime(packing.packedAt)}</p>
        </div>
      </header>

      <section className="grid gap-4 py-4 text-sm sm:grid-cols-2">
        <div>
          <p className="text-xs font-semibold tracking-wide text-neutral-500 uppercase">Ship to</p>
          <p className="font-semibold">{customer?.name}</p>
          <p>{customer?.contactPerson}</p>
          <p>{customerAddress(customer)}</p>
          <p>{customer?.phone}</p>
        </div>
        <div className="space-y-0.5">
          <p className="text-xs font-semibold tracking-wide text-neutral-500 uppercase">Order</p>
          <p><span className="text-neutral-500">Order no.</span> <span className="font-semibold">{order.number}</span></p>
          <p><span className="text-neutral-500">Order date</span> {fmt.date(order.orderDate)}</p>
          <p><span className="text-neutral-500">Required</span> {fmt.date(order.requiredDate)}</p>
          <p><span className="text-neutral-500">Priority</span> <span className="capitalize">{order.priority}</span></p>
        </div>
      </section>

      <table className="w-full text-sm">
        <thead>
          <tr className="border-y border-neutral-300 text-left text-xs text-neutral-500 uppercase">
            <th className="py-2 pr-2 font-semibold">Item</th>
            <th className="py-2 pr-2 font-semibold">SKU</th>
            <th className="py-2 text-right font-semibold">Qty</th>
          </tr>
        </thead>
        <tbody>
          {order.lines.map((l) => {
            const p = idx.products.get(l.productId);
            return (
              <tr key={l.id} className="border-b border-neutral-200">
                <td className="py-2 pr-2">{p?.name}</td>
                <td className="py-2 pr-2 font-mono text-xs">{p?.sku}</td>
                <td className="py-2 text-right tabular-nums">{l.quantity}</td>
              </tr>
            );
          })}
        </tbody>
        <tfoot>
          <tr>
            <td colSpan={2} className="pt-2 text-right text-xs font-semibold text-neutral-500 uppercase">Total units</td>
            <td className="pt-2 text-right font-semibold tabular-nums">{units}</td>
          </tr>
        </tfoot>
      </table>

      <section className="mt-5 grid grid-cols-3 gap-3 rounded-md border border-neutral-300 p-3 text-sm">
        <div>
          <p className="text-xs text-neutral-500">Packaging</p>
          <p className="font-medium">{packing.packagingType}</p>
        </div>
        <div>
          <p className="text-xs text-neutral-500">Packages</p>
          <p className="font-medium" data-testid="slip-packages">{packing.packageCount}</p>
        </div>
        <div>
          <p className="text-xs text-neutral-500">Total weight</p>
          <p className="font-medium" data-testid="slip-weight">{packing.weightKg} kg</p>
        </div>
      </section>
      {packing.notes && <p className="mt-3 text-sm"><span className="text-neutral-500">Notes:</span> {packing.notes}</p>}

      <footer className="mt-8 grid grid-cols-2 gap-8 text-xs text-neutral-500">
        <div className="border-t border-neutral-400 pt-1">Packed by</div>
        <div className="border-t border-neutral-400 pt-1">Received by (signature)</div>
      </footer>
    </article>
  );
}
