"use client";

import { useParams } from "next/navigation";
import { OrderDetail } from "@/features/orders/order-detail";

export default function OrderDetailPage() {
  const { id } = useParams<{ id: string }>();
  return <OrderDetail id={id} />;
}
