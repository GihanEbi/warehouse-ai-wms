"use client";

import { useParams } from "next/navigation";
import { OrderForm } from "@/features/orders/order-form";

export default function EditOrderPage() {
  const { id } = useParams<{ id: string }>();
  return <OrderForm key={id} editId={id} />;
}
