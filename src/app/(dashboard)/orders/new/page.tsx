"use client";

import { useSearchParams } from "next/navigation";
import { OrderForm } from "@/features/orders/order-form";

export default function NewOrderPage() {
  const edit = useSearchParams().get("edit") ?? undefined;
  return <OrderForm key={edit ?? "new"} editId={edit} />;
}
