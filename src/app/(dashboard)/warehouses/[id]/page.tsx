"use client";

import { useParams } from "next/navigation";
import { WarehouseDetail } from "@/features/warehouses/warehouse-detail";

export default function WarehouseDetailPage() {
  const { id } = useParams<{ id: string }>();
  return <WarehouseDetail id={id} />;
}
