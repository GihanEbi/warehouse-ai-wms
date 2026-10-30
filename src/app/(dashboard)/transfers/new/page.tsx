"use client";

import { useSearchParams } from "next/navigation";
import { TransferForm } from "@/features/transfers/transfer-form";

export default function NewTransferPage() {
  // `?edit=<id>` edits a draft transfer
  const edit = useSearchParams().get("edit") ?? undefined;
  return <TransferForm key={edit ?? "new"} transferId={edit} />;
}
