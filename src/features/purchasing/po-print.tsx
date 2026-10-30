"use client";

import Link from "next/link";
import { ArrowLeft, Printer } from "lucide-react";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/shared/states";
import { LinkButton } from "@/components/shared/link-button";
import { titleCase } from "@/lib/format";
import { useData, useFormat, useIndex, useSettings } from "@/hooks/use-wms";
import { poTotal } from "@/lib/workflows/purchasing";

/** Clean, white, printable purchase order document. */
export function PurchaseOrderPrint({ poId }: { poId: string }) {
  const data = useData();
  const idx = useIndex();
  const fmt = useFormat();
  const settings = useSettings();
  const po = data.purchaseOrders.find((p) => p.id === poId);

  if (!po) {
    return <EmptyState title="Purchase order not found" action={<LinkButton href="/purchase-orders">Back to purchase orders</LinkButton>} />;
  }
  const supplier = idx.suppliers.get(po.supplierId);
  const wh = idx.warehouses.get(po.warehouseId);
  const buyer = idx.users.get(po.createdBy);
  const total = poTotal(po);

  return (
    <div className="mx-auto max-w-4xl">
      <div className="mb-4 flex items-center justify-between gap-2" data-print-hidden="true">
        <Link href={`/purchase-orders/${po.id}`} className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
          <ArrowLeft className="size-4" /> Back to {po.number}
        </Link>
        <Button onClick={() => window.print()} data-testid="print-now">
          <Printer /> Print
        </Button>
      </div>

      <article className="print-area rounded-lg border bg-white p-8 text-black shadow-card print:p-0 print:shadow-none" data-testid="po-print" style={{ colorScheme: "light" }}>
        <header className="flex flex-wrap items-start justify-between gap-4 border-b border-neutral-300 pb-5">
          <div className="flex items-center gap-3">
            {settings.companyLogo && (
              // eslint-disable-next-line @next/next/no-img-element -- user supplied data URL
              <img src={settings.companyLogo} alt="" className="size-12 rounded object-contain" />
            )}
            <div>
              <p className="text-xl font-bold tracking-tight">{settings.companyName}</p>
              <p className="text-xs text-neutral-600">Warehouse Management · Sri Lanka</p>
            </div>
          </div>
          <div className="text-right">
            <p className="text-2xl font-bold tracking-wide">PURCHASE ORDER</p>
            <p className="font-mono text-lg" data-testid="print-po-number">{po.number}</p>
            <p className="text-xs text-neutral-600">Status: {titleCase(po.status)}</p>
          </div>
        </header>

        <section className="grid gap-6 py-5 sm:grid-cols-3">
          <div>
            <h2 className="mb-1 text-xs font-semibold tracking-wider text-neutral-500 uppercase">Supplier</h2>
            <p className="font-semibold">{supplier?.name}</p>
            <p className="text-sm">{supplier?.contactPerson}</p>
            <p className="text-sm break-words">{supplier?.address}</p>
            <p className="text-sm">{supplier?.phone}</p>
            <p className="text-sm break-all">{supplier?.email}</p>
          </div>
          <div>
            <h2 className="mb-1 text-xs font-semibold tracking-wider text-neutral-500 uppercase">Deliver to</h2>
            <p className="font-semibold">{wh?.name} ({wh?.code})</p>
            <p className="text-sm break-words">{wh?.address}</p>
            <p className="text-sm">{wh?.city}</p>
          </div>
          <dl className="space-y-1 text-sm">
            <div className="flex justify-between gap-2"><dt className="text-neutral-500">Order date</dt><dd className="font-medium">{fmt.date(po.orderDate)}</dd></div>
            <div className="flex justify-between gap-2"><dt className="text-neutral-500">Expected delivery</dt><dd className="font-medium">{fmt.date(po.expectedDate)}</dd></div>
            <div className="flex justify-between gap-2"><dt className="text-neutral-500">Payment terms</dt><dd className="font-medium">{supplier?.paymentTerms ?? "—"}</dd></div>
            <div className="flex justify-between gap-2"><dt className="text-neutral-500">Prepared by</dt><dd className="font-medium">{buyer?.name ?? "—"}</dd></div>
          </dl>
        </section>

        <div className="overflow-x-auto">
          <table className="w-full min-w-[32rem] border-collapse text-sm">
            <thead>
              <tr className="border-y border-neutral-400 bg-neutral-100 text-left text-xs uppercase">
                <th className="px-2 py-2">#</th>
                <th className="px-2 py-2">SKU</th>
                <th className="px-2 py-2">Description</th>
                <th className="px-2 py-2 text-right">Qty</th>
                <th className="px-2 py-2 text-right">Unit cost</th>
                <th className="px-2 py-2 text-right">Amount</th>
              </tr>
            </thead>
            <tbody>
              {po.lines.map((l, i) => {
                const p = idx.products.get(l.productId);
                return (
                  <tr key={l.id} className="border-b border-neutral-200">
                    <td className="px-2 py-2 text-neutral-500">{i + 1}</td>
                    <td className="px-2 py-2 font-mono text-xs">{p?.sku}</td>
                    <td className="px-2 py-2">{p?.name}</td>
                    <td className="px-2 py-2 text-right tabular-nums">{fmt.number(l.quantity)} {p?.uom}</td>
                    <td className="px-2 py-2 text-right tabular-nums">{fmt.money(l.unitCost)}</td>
                    <td className="px-2 py-2 text-right tabular-nums">{fmt.money(l.quantity * l.unitCost)}</td>
                  </tr>
                );
              })}
            </tbody>
            <tfoot>
              <tr>
                <td colSpan={5} className="px-2 pt-3 text-right font-semibold">Total</td>
                <td className="px-2 pt-3 text-right text-base font-bold tabular-nums" data-testid="print-po-total">{fmt.money(total)}</td>
              </tr>
            </tfoot>
          </table>
        </div>

        {po.notes && (
          <section className="mt-5 text-sm">
            <h2 className="mb-1 text-xs font-semibold tracking-wider text-neutral-500 uppercase">Notes</h2>
            <p className="break-words whitespace-pre-wrap">{po.notes}</p>
          </section>
        )}

        <section className="mt-16 grid grid-cols-2 gap-10 text-sm">
          <div>
            <div className="h-px bg-neutral-500" />
            <p className="mt-1 text-xs text-neutral-600">Authorised by (signature &amp; date)</p>
          </div>
          <div>
            <div className="h-px bg-neutral-500" />
            <p className="mt-1 text-xs text-neutral-600">Supplier acknowledgement (signature &amp; date)</p>
          </div>
        </section>
        <p className="mt-8 text-center text-[11px] text-neutral-500">Generated {fmt.dateTime(new Date())} · {settings.companyName}</p>
      </article>
    </div>
  );
}
