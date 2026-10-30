"use client";

import { useParams } from "next/navigation";
import { ProductDetail } from "@/features/products/product-detail";

export default function ProductDetailPage() {
  const { id } = useParams<{ id: string }>();
  return <ProductDetail id={id} />;
}
