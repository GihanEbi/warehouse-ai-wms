"use client";

import { useParams } from "next/navigation";
import { ShipmentDetail } from "@/features/shipping/shipment-detail";

export default function ShipmentDetailPage() {
  const { id } = useParams<{ id: string }>();
  return <ShipmentDetail id={id} />;
}
