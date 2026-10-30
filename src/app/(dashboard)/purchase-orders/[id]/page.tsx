"use client";

import { useParams } from "next/navigation";
import { PurchaseOrderDetail } from "@/features/purchasing/po-detail";

export default function PurchaseOrderDetailPage() {
  const { id } = useParams<{ id: string }>();
  return <PurchaseOrderDetail poId={id} />;
}
