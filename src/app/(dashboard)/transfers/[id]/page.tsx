"use client";

import { useParams } from "next/navigation";
import { TransferDetail } from "@/features/transfers/transfer-detail";

export default function TransferDetailPage() {
  const { id } = useParams<{ id: string }>();
  return <TransferDetail transferId={id} />;
}
