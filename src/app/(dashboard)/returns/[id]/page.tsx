"use client";

import { useParams } from "next/navigation";
import { ReturnDetail } from "@/features/returns/return-detail";

export default function ReturnDetailPage() {
  const { id } = useParams<{ id: string }>();
  return <ReturnDetail id={id} />;
}
