"use client";

import { useParams } from "next/navigation";
import { PurchaseOrderPrint } from "@/features/purchasing/po-print";

export default function PurchaseOrderPrintPage() {
  const { id } = useParams<{ id: string }>();
  return <PurchaseOrderPrint poId={id} />;
}
