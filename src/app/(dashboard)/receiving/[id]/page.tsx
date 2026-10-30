"use client";

import { useParams } from "next/navigation";
import { ReceiptDetail } from "@/features/receiving/receipt-detail";

export default function ReceiptDetailPage() {
  const { id } = useParams<{ id: string }>();
  return <ReceiptDetail receiptId={id} />;
}
