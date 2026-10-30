"use client";

import { useParams } from "next/navigation";
import { PurchaseOrderForm } from "@/features/purchasing/po-form";

export default function EditPurchaseOrderPage() {
  const { id } = useParams<{ id: string }>();
  return <PurchaseOrderForm poId={id} />;
}
