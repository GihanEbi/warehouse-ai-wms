"use client";

import { useRef, useState } from "react";
import { useForm, useWatch } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { ImagePlus, Sparkles, Trash2 } from "lucide-react";
import type { Product } from "@/types";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { FormDialog } from "@/components/shared/dialogs";
import { FormField, NativeSelect } from "@/components/shared/form-controls";
import { ProductImage } from "@/components/shared/product-bits";
import { useData, useTx } from "@/hooks/use-wms";
import { useSubmit } from "@/hooks/use-submit";
import { PRODUCT_CATEGORIES, UOMS } from "@/lib/constants";
import { generateSku } from "@/lib/workflows/master";
import { cn } from "@/lib/utils";

const MAX_IMAGE_BYTES = 400 * 1024;
const EMOJIS = ["📦", "🍵", "☕", "🌶️", "🧂", "🌾", "🍚", "🥥", "🧴", "🧼", "🧽", "🧹", "🧻", "🪥", "💊", "🔋", "🔌", "💡", "🎧", "📱", "🛍️", "🧃", "🍯", "🥫"];

const schema = z.object({
  name: z.string().trim().min(2, "Product name is required"),
  sku: z
    .string()
    .trim()
    .min(3, "SKU is required")
    .regex(/^[A-Za-z0-9._-]+$/, "Use letters, numbers, dot, dash or underscore"),
  description: z.string().trim().max(500, "Keep the description under 500 characters"),
  category: z.string().min(1, "Choose a category"),
  uom: z.string().min(1, "Choose a unit of measure"),
  unitCost: z.number({ error: "Enter the unit cost" }).min(0, "Cost cannot be negative"),
  sellingPrice: z
    .string()
    .trim()
    .refine((v) => v === "" || (Number.isFinite(Number(v)) && Number(v) >= 0), "Enter a valid price (0 or more)"),
  reorderLevel: z.number({ error: "Enter the reorder level" }).int("Whole numbers only").min(0, "Cannot be negative"),
  preferredSupplierId: z.string(),
  status: z.enum(["active", "inactive", "archived"]),
});
type Values = z.infer<typeof schema>;

const EMPTY: Values = {
  name: "",
  sku: "",
  description: "",
  category: PRODUCT_CATEGORIES[0],
  uom: UOMS[0],
  unitCost: 0,
  sellingPrice: "",
  reorderLevel: 0,
  preferredSupplierId: "",
  status: "active",
};

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  product?: Product | null;
  onSaved?: (id: string) => void;
}

/** Remounts the form every time it opens so state always starts from the record being edited. */
export function ProductFormDialog(props: Props) {
  return <ProductFormInner key={`${props.open ? "open" : "closed"}-${props.product?.id ?? "new"}`} {...props} />;
}

function valuesFor(product?: Product | null): Values {
  return product
    ? {
        name: product.name,
        sku: product.sku,
        description: product.description,
        category: product.category,
        uom: product.uom,
        unitCost: product.unitCost,
        sellingPrice: product.sellingPrice === null ? "" : String(product.sellingPrice),
        reorderLevel: product.reorderLevel,
        preferredSupplierId: product.preferredSupplierId ?? "",
        status: product.status,
      }
    : EMPTY;
}

function ProductFormInner({ open, onOpenChange, product, onSaved }: Props) {
  const data = useData();
  const tx = useTx();
  const { submit, pending } = useSubmit();
  const form = useForm<Values>({ resolver: zodResolver(schema), defaultValues: valuesFor(product) });
  const errors = form.formState.errors;
  const editing = !!product;
  const fileRef = useRef<HTMLInputElement>(null);
  const [imageUrl, setImageUrl] = useState<string | null>(product?.imageUrl ?? null);
  const [emoji, setEmoji] = useState(product?.emoji ?? "📦");
  const [imageError, setImageError] = useState("");

  const watched = useWatch({ control: form.control, name: ["name", "category"] });

  const onPickFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      setImageError("Choose an image file (PNG, JPG, WebP).");
      return;
    }
    if (file.size > MAX_IMAGE_BYTES) {
      setImageError(`Image is ${Math.round(file.size / 1024)} KB - the limit is ${Math.round(MAX_IMAGE_BYTES / 1024)} KB.`);
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      setImageUrl(typeof reader.result === "string" ? reader.result : null);
      setImageError("");
    };
    reader.onerror = () => setImageError("Could not read that file.");
    reader.readAsDataURL(file);
  };

  const onGenerate = () => {
    const [name, category] = watched;
    form.setValue("sku", generateSku(data, category || PRODUCT_CATEGORIES[0], name || "Item"), { shouldValidate: true, shouldDirty: true });
  };

  const onSubmit = form.handleSubmit(async (v) => {
    const sku = v.sku.trim().toUpperCase();
    if (data.products.some((p) => p.id !== product?.id && p.sku.toLowerCase() === sku.toLowerCase())) {
      form.setError("sku", { message: `SKU ${sku} already exists` });
      return;
    }
    const input = {
      sku,
      name: v.name,
      description: v.description,
      category: v.category,
      uom: v.uom,
      unitCost: v.unitCost,
      sellingPrice: v.sellingPrice === "" ? null : Number(v.sellingPrice),
      reorderLevel: v.reorderLevel,
      preferredSupplierId: v.preferredSupplierId || null,
      emoji,
      imageUrl,
      status: v.status,
    };
    const res = product
      ? await submit(() => tx.updateProduct(product.id, input), { success: "Product updated" })
      : await submit(() => tx.createProduct(input), { success: `Product ${sku} created` });
    if (res?.ok) {
      onOpenChange(false);
      onSaved?.(product ? product.id : (res.value as string));
    }
  });

  const supplierOptions = data.suppliers
    .filter((s) => s.status === "active" || s.id === product?.preferredSupplierId)
    .map((s) => ({ value: s.id, label: s.name }));

  return (
    <FormDialog
      open={open}
      onOpenChange={onOpenChange}
      title={editing ? `Edit ${product.name}` : "Add product"}
      description={editing ? "Changes apply everywhere immediately." : "New products are immediately available for purchase orders, orders and inventory."}
      submitLabel={editing ? "Save changes" : "Create product"}
      pending={pending}
      onSubmit={onSubmit}
      size="lg"
      testId="product-form"
    >
      <div className="grid gap-4 sm:grid-cols-2">
        <FormField id="p-name" label="Product name" required error={errors.name?.message}>
          <Input id="p-name" autoComplete="off" aria-invalid={!!errors.name} {...form.register("name")} />
        </FormField>
        <FormField id="p-sku" label="SKU" required error={errors.sku?.message}>
          <div className="flex gap-2">
            <Input id="p-sku" autoComplete="off" className="min-w-0 flex-1 uppercase" aria-invalid={!!errors.sku} {...form.register("sku")} />
            <Button type="button" variant="outline" onClick={onGenerate} data-testid="generate-sku">
              <Sparkles />
              Generate
            </Button>
          </div>
        </FormField>
      </div>

      <FormField id="p-description" label="Description" error={errors.description?.message}>
        <Textarea id="p-description" rows={2} aria-invalid={!!errors.description} {...form.register("description")} />
      </FormField>

      <div className="grid gap-4 sm:grid-cols-3">
        <FormField id="p-category" label="Category" required error={errors.category?.message}>
          <NativeSelect id="p-category" options={PRODUCT_CATEGORIES.map((c) => ({ value: c, label: c }))} {...form.register("category")} />
        </FormField>
        <FormField id="p-uom" label="Unit of measure" required error={errors.uom?.message}>
          <NativeSelect id="p-uom" options={UOMS.map((u) => ({ value: u, label: u }))} {...form.register("uom")} />
        </FormField>
        <FormField id="p-status" label="Status" required error={errors.status?.message}>
          <NativeSelect
            id="p-status"
            options={[
              { value: "active", label: "Active" },
              { value: "inactive", label: "Inactive" },
              { value: "archived", label: "Archived" },
            ]}
            {...form.register("status")}
          />
        </FormField>
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        <FormField id="p-cost" label="Unit cost (LKR)" required error={errors.unitCost?.message}>
          <Input id="p-cost" type="number" step="0.01" min={0} inputMode="decimal" aria-invalid={!!errors.unitCost} {...form.register("unitCost", { valueAsNumber: true })} />
        </FormField>
        <FormField id="p-price" label="Selling price (LKR)" error={errors.sellingPrice?.message} hint="Optional">
          <Input id="p-price" type="number" step="0.01" min={0} inputMode="decimal" aria-invalid={!!errors.sellingPrice} {...form.register("sellingPrice")} />
        </FormField>
        <FormField id="p-reorder" label="Reorder level" required error={errors.reorderLevel?.message}>
          <Input id="p-reorder" type="number" min={0} inputMode="numeric" aria-invalid={!!errors.reorderLevel} {...form.register("reorderLevel", { valueAsNumber: true })} />
        </FormField>
      </div>

      <FormField id="p-supplier" label="Preferred supplier" error={errors.preferredSupplierId?.message}>
        <NativeSelect id="p-supplier" options={supplierOptions} placeholder="No preferred supplier" {...form.register("preferredSupplierId")} />
      </FormField>

      <div className="space-y-2 rounded-lg border p-3">
        <p className="text-xs font-medium">Product image</p>
        <div className="flex flex-wrap items-center gap-3">
          <ProductImage product={{ emoji, imageUrl, name: watched[0] || "Preview", category: watched[1] || "" }} size={64} />
          <div className="flex flex-wrap gap-2">
            <input ref={fileRef} type="file" accept="image/*" className="sr-only" onChange={onPickFile} data-testid="product-image-input" aria-label="Upload product image" />
            <Button type="button" variant="outline" onClick={() => fileRef.current?.click()}>
              <ImagePlus />
              {imageUrl ? "Replace image" : "Upload image"}
            </Button>
            {imageUrl && (
              <Button type="button" variant="ghost" onClick={() => setImageUrl(null)} data-testid="remove-image">
                <Trash2 />
                Remove
              </Button>
            )}
          </div>
        </div>
        {imageError && (
          <p className="text-xs text-danger" role="alert" data-testid="error-image">
            {imageError}
          </p>
        )}
        <p className="text-xs text-muted-foreground">PNG, JPG or WebP up to {Math.round(MAX_IMAGE_BYTES / 1024)} KB.{!imageUrl && " Without an image, the emoji below is shown."}</p>
        {!imageUrl && (
          <div className="flex flex-wrap gap-1" role="radiogroup" aria-label="Product emoji">
            {EMOJIS.map((e) => (
              <button
                key={e}
                type="button"
                role="radio"
                aria-checked={emoji === e}
                aria-label={`Emoji ${e}`}
                onClick={() => setEmoji(e)}
                className={cn("flex size-8 items-center justify-center rounded-md border text-base transition-colors hover:bg-muted", emoji === e && "border-primary bg-primary-soft")}
              >
                {e}
              </button>
            ))}
          </div>
        )}
      </div>
    </FormDialog>
  );
}
