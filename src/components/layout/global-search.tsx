"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Search } from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { useData } from "@/hooks/use-wms";
import { cn } from "@/lib/utils";

interface Hit {
  group: string;
  label: string;
  sub: string;
  href: string;
}

/** Global search across the shared data set (opens with Ctrl/⌘+K). */
export function GlobalSearch() {
  const router = useRouter();
  const data = useData();
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const [active, setActive] = useState(0);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setOpen((o) => !o);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const hits = useMemo<Hit[]>(() => {
    const term = q.trim().toLowerCase();
    if (term.length < 2) return [];
    const m = (...s: (string | undefined)[]) => s.some((x) => x?.toLowerCase().includes(term));
    const cust = new Map(data.customers.map((c) => [c.id, c.name]));
    const sup = new Map(data.suppliers.map((c) => [c.id, c.name]));
    const out: Hit[] = [];
    data.products.filter((p) => m(p.name, p.sku, p.barcode)).slice(0, 5).forEach((p) => out.push({ group: "Products", label: p.name, sub: p.sku, href: `/products/${p.id}` }));
    data.orders.filter((o) => m(o.number, cust.get(o.customerId))).slice(0, 4).forEach((o) => out.push({ group: "Orders", label: o.number, sub: cust.get(o.customerId) ?? "", href: `/orders/${o.id}` }));
    data.purchaseOrders.filter((o) => m(o.number, sup.get(o.supplierId))).slice(0, 4).forEach((o) => out.push({ group: "Purchase orders", label: o.number, sub: sup.get(o.supplierId) ?? "", href: `/purchase-orders/${o.id}` }));
    data.transfers.filter((t) => m(t.number)).slice(0, 3).forEach((t) => out.push({ group: "Transfers", label: t.number, sub: t.type === "internal" ? "Bin to bin" : "Inter-warehouse", href: `/transfers/${t.id}` }));
    data.warehouses.filter((w) => m(w.name, w.code, w.city)).slice(0, 3).forEach((w) => out.push({ group: "Warehouses", label: w.name, sub: w.code, href: `/warehouses/${w.id}` }));
    data.suppliers.filter((s) => m(s.name, s.code)).slice(0, 3).forEach((s) => out.push({ group: "Suppliers", label: s.name, sub: s.code, href: `/suppliers/${s.id}` }));
    return out;
  }, [q, data]);

  function go(h: Hit) {
    setOpen(false);
    setQ("");
    router.push(h.href);
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        data-testid="global-search"
        aria-label="Search"
        className="inline-flex h-8 items-center gap-2 rounded-lg border border-input bg-transparent px-2.5 text-sm text-muted-foreground outline-none transition-colors hover:bg-muted focus-visible:ring-3 focus-visible:ring-ring/50 sm:w-56 dark:bg-input/30"
      >
        <Search className="size-4" />
        <span className="hidden flex-1 text-left sm:block">Search…</span>
        <kbd className="hidden rounded border bg-muted px-1 text-[10px] sm:block">Ctrl K</kbd>
      </button>
      <Dialog open={open} onOpenChange={(o) => { setOpen(o); if (!o) setQ(""); }}>
        <DialogContent className="top-[20%] translate-y-0 gap-0 p-0 sm:max-w-xl" showCloseButton={false}>
          <DialogTitle className="sr-only">Search</DialogTitle>
          <DialogDescription className="sr-only">Search products, orders, purchase orders, transfers, warehouses and suppliers</DialogDescription>
          <div className="flex items-center gap-2 border-b px-3">
            <Search className="size-4 text-muted-foreground" />
            <input
              autoFocus
              value={q}
              onChange={(e) => { setQ(e.target.value); setActive(0); }}
              onKeyDown={(e) => {
                if (e.key === "ArrowDown") { e.preventDefault(); setActive((a) => Math.min(a + 1, hits.length - 1)); }
                if (e.key === "ArrowUp") { e.preventDefault(); setActive((a) => Math.max(a - 1, 0)); }
                if (e.key === "Enter" && hits[active]) go(hits[active]);
              }}
              placeholder="Search products, orders, POs, warehouses…"
              aria-label="Global search"
              data-testid="global-search-input"
              className="h-11 flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground"
            />
          </div>
          <ul className="max-h-80 overflow-y-auto p-1" data-testid="global-search-results">
            {q.trim().length < 2 && <li className="px-3 py-8 text-center text-sm text-muted-foreground">Type at least 2 characters to search.</li>}
            {q.trim().length >= 2 && hits.length === 0 && <li className="px-3 py-8 text-center text-sm text-muted-foreground">No results for “{q}”.</li>}
            {hits.map((h, i) => (
              <li key={h.href}>
                <button
                  type="button"
                  onClick={() => go(h)}
                  onMouseEnter={() => setActive(i)}
                  className={cn("flex w-full items-center gap-3 rounded-md px-3 py-2 text-left text-sm", i === active && "bg-accent")}
                >
                  <span className="w-28 shrink-0 text-xs text-muted-foreground">{h.group}</span>
                  <span className="min-w-0 flex-1 truncate font-medium">{h.label}</span>
                  <span className="truncate font-mono text-xs text-muted-foreground">{h.sub}</span>
                </button>
              </li>
            ))}
          </ul>
        </DialogContent>
      </Dialog>
    </>
  );
}
