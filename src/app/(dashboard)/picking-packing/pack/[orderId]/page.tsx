"use client";

import { useParams } from "next/navigation";
import { PackWorkflow } from "@/features/picking/pack-workflow";

export default function PackOrderPage() {
  const { orderId } = useParams<{ orderId: string }>();
  return <PackWorkflow orderId={orderId} />;
}
