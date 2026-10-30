"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { ChevronRight, Home } from "lucide-react";
import { useData } from "@/hooks/use-wms";
import { SEGMENT_LABELS } from "@/lib/navigation";

/** Breadcrumbs derived from the URL; record ids are resolved to readable names. */
export function Breadcrumbs() {
  const pathname = usePathname();
  const data = useData();
  const segments = pathname.split("/").filter(Boolean);

  function resolve(root: string, seg: string): string | null {
    switch (root) {
      case "warehouses": return data.warehouses.find((x) => x.id === seg)?.name ?? null;
      case "products": return data.products.find((x) => x.id === seg)?.name ?? null;
      case "suppliers": return data.suppliers.find((x) => x.id === seg)?.name ?? null;
      case "purchase-orders": return data.purchaseOrders.find((x) => x.id === seg)?.number ?? null;
      case "receiving": return data.receipts.find((x) => x.id === seg)?.grn ?? null;
      case "transfers": return data.transfers.find((x) => x.id === seg)?.number ?? null;
      case "orders": return data.orders.find((x) => x.id === seg)?.number ?? null;
      case "picking-packing": return data.orders.find((x) => x.id === seg)?.number ?? null;
      case "shipping": return data.shipments.find((x) => x.id === seg)?.number ?? null;
      case "returns": return data.returns.find((x) => x.id === seg)?.number ?? null;
      case "users": return data.users.find((x) => x.id === seg)?.name ?? null;
      default: return null;
    }
  }

  const crumbs = segments.map((seg, i) => ({
    href: "/" + segments.slice(0, i + 1).join("/"),
    label: SEGMENT_LABELS[seg] ?? resolve(segments[0], seg) ?? seg,
  }));

  return (
    <nav aria-label="Breadcrumb" className="min-w-0" data-testid="breadcrumbs">
      <ol className="flex items-center gap-1 text-sm text-muted-foreground">
        <li className="shrink-0">
          <Link href="/dashboard" aria-label="Home" className="flex items-center rounded p-0.5 hover:text-foreground">
            <Home className="size-4" />
          </Link>
        </li>
        {crumbs.map((c, i) => (
          <li key={c.href} className="flex min-w-0 items-center gap-1">
            <ChevronRight className="size-3.5 shrink-0 opacity-50" aria-hidden />
            {i === crumbs.length - 1 ? (
              <span className="truncate font-medium text-foreground" aria-current="page">{c.label}</span>
            ) : (
              <Link href={c.href} className="truncate hover:text-foreground">{c.label}</Link>
            )}
          </li>
        ))}
      </ol>
    </nav>
  );
}
