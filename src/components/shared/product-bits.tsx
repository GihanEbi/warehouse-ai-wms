"use client";

import { useMemo, useState } from "react";
import { Check, ChevronsUpDown } from "lucide-react";
import type { ID, Product } from "@/types";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { useData } from "@/hooks/use-wms";
import { availableInWarehouse } from "@/lib/inventory/selectors";
import { cn } from "@/lib/utils";

const CATEGORY_TINT: Record<string, string> = {
  "Tea & Beverages": "bg-teal-soft",
  "Spices & Condiments": "bg-warning-soft",
  "Grains & Staples": "bg-primary-soft",
  "Coconut Products": "bg-success-soft",
  "Household & Cleaning": "bg-info-soft",
  "Personal Care": "bg-danger-soft",
  "Packaging Materials": "bg-neutral-soft",
  "Electronics & Accessories": "bg-primary-soft",
};

/** Product image: uploaded image if present, otherwise a tinted emoji placeholder. */
export function ProductImage({ product, size = 40, className }: { product: Pick<Product, "emoji" | "imageUrl" | "name" | "category">; size?: number; className?: string }) {
  if (product.imageUrl) {
    // eslint-disable-next-line @next/next/no-img-element -- user supplied data URLs / remote URLs, next/image cannot optimise these
    return <img src={product.imageUrl} alt={product.name} width={size} height={size} className={cn("shrink-0 rounded-lg border object-cover", className)} style={{ width: size, height: size }} />;
  }
  return (
    <span
      className={cn("flex shrink-0 items-center justify-center rounded-lg border", CATEGORY_TINT[product.category] ?? "bg-muted", className)}
      style={{ width: size, height: size, fontSize: size * 0.5 }}
      role="img"
      aria-label={product.name}
    >
      {product.emoji}
    </span>
  );
}

/** Code-128 style visual barcode (decorative, derived deterministically from the digits). */
export function BarcodeDisplay({ value, className }: { value: string; className?: string }) {
  const bars = useMemo(() => {
    const out: { x: number; w: number }[] = [];
    let x = 0;
    out.push({ x, w: 1 }, { x: (x += 2), w: 1 });
    x += 2;
    for (const ch of value) {
      const n = Number(ch) || 0;
      out.push({ x, w: (n % 3) + 1 });
      x += (n % 3) + 1 + 1;
      out.push({ x, w: ((n + 1) % 2) + 1 });
      x += ((n + 1) % 2) + 1 + 1;
    }
    out.push({ x, w: 1 }, { x: x + 2, w: 1 });
    return { bars: out, width: x + 3 };
  }, [value]);
  return (
    <figure className={cn("inline-flex flex-col items-center gap-1 rounded-lg border bg-white p-3 text-black", className)} data-testid="barcode">
      <svg viewBox={`0 0 ${bars.width} 40`} className="h-12 w-44" role="img" aria-label={`Barcode ${value}`} preserveAspectRatio="none">
        {bars.bars.map((b, i) => (
          <rect key={i} x={b.x} y={0} width={b.w} height={40} fill="#000" />
        ))}
      </svg>
      <figcaption className="font-mono text-xs tracking-[0.2em]">{value}</figcaption>
    </figure>
  );
}

/** Searchable product picker; optionally shows available stock for a warehouse. */
export function ProductSelector({
  value,
  onChange,
  excludeIds = [],
  stockWarehouseId,
  placeholder = "Select a product…",
  disabled,
  includeInactive,
  products: override,
  id,
  className,
}: {
  value: ID | "";
  onChange: (id: ID) => void;
  excludeIds?: ID[];
  stockWarehouseId?: ID;
  placeholder?: string;
  disabled?: boolean;
  includeInactive?: boolean;
  /** restrict to a subset (e.g. products on an order) */
  products?: Product[];
  id?: string;
  className?: string;
}) {
  const data = useData();
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const list = useMemo(() => {
    const base = override ?? data.products.filter((p) => includeInactive || p.status === "active");
    const term = q.trim().toLowerCase();
    return base
      .filter((p) => !excludeIds.includes(p.id) || p.id === value)
      .filter((p) => !term || p.name.toLowerCase().includes(term) || p.sku.toLowerCase().includes(term))
      .slice(0, 60);
  }, [data.products, override, includeInactive, excludeIds, value, q]);
  const selected = data.products.find((p) => p.id === value);

  return (
    <Popover open={open} onOpenChange={(o) => { setOpen(o); if (!o) setQ(""); }}>
      <PopoverTrigger
        id={id}
        disabled={disabled}
        data-testid="product-selector"
        className={cn(
          "flex h-8 w-full min-w-0 items-center justify-between gap-2 rounded-lg border border-input bg-transparent px-2.5 text-left text-sm outline-none transition-colors focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 disabled:cursor-not-allowed disabled:opacity-50 dark:bg-input/30",
          className,
        )}
      >
        {selected ? (
          <span className="flex min-w-0 items-center gap-2">
            <span aria-hidden>{selected.emoji}</span>
            <span className="truncate">{selected.name}</span>
          </span>
        ) : (
          <span className="truncate text-muted-foreground">{placeholder}</span>
        )}
        <ChevronsUpDown className="size-4 shrink-0 text-muted-foreground" aria-hidden />
      </PopoverTrigger>
      <PopoverContent align="start" className="w-[min(24rem,calc(100vw-2rem))] gap-0 p-0">
        <div className="border-b p-2">
          <input
            autoFocus
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search by name or SKU…"
            aria-label="Search products"
            className="h-8 w-full rounded-md border border-input bg-transparent px-2.5 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
          />
        </div>
        <ul className="max-h-64 overflow-y-auto p-1" role="listbox">
          {list.length === 0 && <li className="px-3 py-6 text-center text-sm text-muted-foreground">No products found</li>}
          {list.map((p) => {
            const avail = stockWarehouseId ? availableInWarehouse(data, p.id, stockWarehouseId) : null;
            return (
              <li key={p.id} role="option" aria-selected={p.id === value}>
                <button
                  type="button"
                  data-testid="product-option"
                  onClick={() => { onChange(p.id); setOpen(false); setQ(""); }}
                  className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm hover:bg-accent focus-visible:bg-accent focus-visible:outline-none"
                >
                  <span aria-hidden className="text-base">{p.emoji}</span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-medium">{p.name}</span>
                    <span className="block truncate font-mono text-[11px] text-muted-foreground">{p.sku}</span>
                  </span>
                  {avail !== null && (
                    <span className={cn("shrink-0 text-xs tabular-nums", avail === 0 ? "text-danger" : "text-muted-foreground")}>{avail} avail.</span>
                  )}
                  {p.id === value && <Check className="size-4 text-primary" />}
                </button>
              </li>
            );
          })}
        </ul>
      </PopoverContent>
    </Popover>
  );
}
