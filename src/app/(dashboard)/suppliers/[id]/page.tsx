"use client";

import { useParams } from "next/navigation";
import { SupplierDetail } from "@/features/suppliers/supplier-detail";

export default function SupplierDetailPage() {
  const { id } = useParams<{ id: string }>();
  return <SupplierDetail id={id} />;
}
