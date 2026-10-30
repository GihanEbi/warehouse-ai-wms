"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { ArrowRight, Ban, CheckCircle2, PackageCheck, Pencil, Send, Truck } from "lucide-react";
import type { ID, StockTransfer, TransferLine } from "@/types";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { PageHeader, Section, InfoItem } from "@/components/shared/page-header";
import { DataTable, type Column } from "@/components/shared/data-table";
import { ConfirmationDialog } from "@/components/shared/dialogs";
import { NativeSelect } from "@/components/shared/form-controls";
import { EmptyState } from "@/components/shared/states";
import { LinkButton } from "@/components/shared/link-button";
import { ProductImage } from "@/components/shared/product-bits";
import { ActivityTimeline, StepProgress } from "@/components/shared/progress";
import { StatusBadge } from "@/components/shared/status-badge";
import { useData, useFormat, useIndex, usePermission, useTx } from "@/hooks/use-wms";
import { useSubmit } from "@/hooks/use-submit";
import { binFree, storageBinsFor } from "@/lib/inventory/selectors";
import { INTER_STEPS, INTERNAL_STEPS, TRANSFER_TYPE_LABEL, transferInTransit, transferStepIndex } from "./helpers";

type Dialog = "submit" | "approve" | "dispatch" | "receive" | "cancel" | null;

export function TransferDetail({ transferId }: { transferId: ID }) {
  const data = useData();
  const idx = useIndex();
  const fmt = useFormat();
  const tx = useTx();
  const { can } = usePermission();
  const { submit } = useSubmit();
  const [dialog, setDialog] = useState<Dialog>(null);
  const [reason, setReason] = useState("");

  const t = data.transfers.find((x) => x.id === transferId);
  const tasks = useMemo(() => data.tasks.filter((k) => k.link?.kind === "transfer" && k.link.id === transferId), [data.tasks, transferId]);

  const columns = useMemo<Column<TransferLine>[]>(
    () => [
      {
        id: "product",
        header: "Product",
        cell: (l) => {
          const p = idx.products.get(l.productId);
          return (
            <div className="flex min-w-[10rem] items-center gap-2">
              {p && <ProductImage product={p} size={32} />}
              <div className="min-w-0">
                <Link href={`/products/${l.productId}`} className="block truncate font-medium hover:underline">{p?.name}</Link>
                <span className="font-mono text-[11px] text-muted-foreground">{p?.sku}</span>
              </div>
            </div>
          );
        },
      },
      { id: "requested", header: "Requested", align: "right", cell: (l) => <span className="tabular-nums">{fmt.number(l.quantity)}</span> },
      { id: "dispatched", header: "Dispatched", align: "right", cell: (l) => <span className="tabular-nums">{fmt.number(l.dispatchedQty)}</span> },
      {
        id: "transit",
        header: "In transit",
        align: "right",
        cell: (l) => {
          const n = t?.status === "in_transit" ? l.dispatchedQty - l.receivedQty : 0;
          return <span className={n > 0 ? "tabular-nums font-medium text-info" : "tabular-nums text-muted-foreground"} data-testid="line-in-transit">{fmt.number(n)}</span>;
        },
      },
      { id: "received", header: "Received", align: "right", cell: (l) => <span className="tabular-nums" data-testid="line-received">{fmt.number(l.receivedQty)}</span> },
      { id: "from", header: "From bin", hideOnMobile: true, cell: (l) => <span className="font-mono text-xs">{l.fromBinId ? (idx.bins.get(l.fromBinId)?.code ?? "—") : "Auto"}</span> },
      { id: "to", header: "To bin", hideOnMobile: true, cell: (l) => <span className="font-mono text-xs">{l.toBinId ? (idx.bins.get(l.toBinId)?.code ?? "—") : "Auto"}</span> },
    ],
    [idx, fmt, t?.status],
  );

  if (!t) {
    return <EmptyState title="Transfer not found" description="It may have been removed." action={<LinkButton href="/transfers">Back to transfers</LinkButton>} />;
  }

  const internal = t.type === "internal";
  const from = idx.warehouses.get(t.fromWarehouseId);
  const to = idx.warehouses.get(t.toWarehouseId);
  const creator = idx.users.get(t.createdBy);
  const cancelled = t.status === "cancelled";
  const requested = t.lines.reduce((s, l) => s + l.quantity, 0);
  const dispatched = t.lines.reduce((s, l) => s + l.dispatchedQty, 0);
  const received = t.lines.reduce((s, l) => s + l.receivedQty, 0);
  const inTransit = transferInTransit(t);
  const canWrite = can("transfers.write");

  const noPerm = (p: boolean, msg: string) => (p ? undefined : msg);

  const actions = (
    <>
      {t.status === "draft" && (
        <>
          {canWrite && (
            <LinkButton href={`/transfers/new?edit=${t.id}`} variant="outline" data-testid="edit-transfer"><Pencil /> Edit</LinkButton>
          )}
          <Button onClick={() => setDialog("submit")} disabled={!canWrite} title={noPerm(canWrite, "Your role cannot submit transfers")} data-testid="submit-transfer">
            <Send /> {internal ? "Submit & move now" : "Submit for approval"}
          </Button>
        </>
      )}
      {t.status === "pending_approval" && (
        <Button onClick={() => setDialog("approve")} disabled={!can("transfers.approve")} title={noPerm(can("transfers.approve"), "Your role cannot approve transfers")} data-testid="approve-transfer">
          <CheckCircle2 /> Approve
        </Button>
      )}
      {t.status === "approved" && (
        <Button onClick={() => setDialog("dispatch")} disabled={!canWrite} title={noPerm(canWrite, "Your role cannot dispatch transfers")} data-testid="dispatch-transfer">
          <Truck /> Dispatch
        </Button>
      )}
      {t.status === "in_transit" && (
        <Button onClick={() => setDialog("receive")} disabled={!canWrite} title={noPerm(canWrite, "Your role cannot receive transfers")} data-testid="receive-transfer">
          <PackageCheck /> Receive
        </Button>
      )}
      {(t.status === "draft" || t.status === "pending_approval" || t.status === "approved") && (
        <Button variant="destructive" onClick={() => setDialog("cancel")} disabled={!canWrite} title={noPerm(canWrite, "Your role cannot cancel transfers")} data-testid="cancel-transfer">
          <Ban /> Cancel
        </Button>
      )}
    </>
  );

  async function run(fn: () => ReturnType<typeof tx.submitTransfer>, success: string) {
    const res = await submit(fn, { success });
    return res?.ok ?? false;
  }

  return (
    <>
      <PageHeader title={t.number} description={internal ? `Bin-to-bin transfer in ${from?.name}` : `${from?.name} → ${to?.name}`} actions={actions} />
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <span data-testid="transfer-status"><StatusBadge status={t.status} domain="transfer" /></span>
        <span className="rounded-full bg-muted px-2 py-0.5 text-xs font-medium text-muted-foreground">{TRANSFER_TYPE_LABEL[t.type]}</span>
        <span className="text-xs text-muted-foreground">Created {fmt.date(t.createdAt)}{creator ? ` by ${creator.name}` : ""}</span>
      </div>

      <Section className="mb-6">
        {cancelled && (
          <div className="mb-4 flex items-center gap-2 rounded-lg bg-danger-soft px-3 py-2 text-sm text-danger" data-testid="transfer-cancelled-banner">
            <Ban className="size-4" /> This transfer was cancelled. No stock was moved.
          </div>
        )}
        <StepProgress steps={internal ? INTERNAL_STEPS : INTER_STEPS} current={transferStepIndex(t)} terminated={cancelled} />
      </Section>

      {!internal && (
        <div className="mb-6 grid grid-cols-2 gap-3 lg:grid-cols-4" data-testid="transfer-quantities">
          <Tile label="Requested" value={fmt.number(requested)} />
          <Tile label="Dispatched" value={fmt.number(dispatched)} hint="left the source" />
          <Tile label="In transit" value={fmt.number(inTransit)} hint="not in any bin" highlight={inTransit > 0} testId="in-transit-qty" />
          <Tile label="Received" value={fmt.number(received)} hint="at destination" testId="received-qty" />
        </div>
      )}

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-2">
          <Section title="Items" contentClassName="p-0">
            <DataTable
              testId="transfer-lines-table"
              data={t.lines}
              columns={columns}
              getRowId={(l) => l.id}
              compact
              pageSize={50}
              mobileCard={(l) => {
                const p = idx.products.get(l.productId);
                const n = t.status === "in_transit" ? l.dispatchedQty - l.receivedQty : 0;
                return (
                  <div className="space-y-0.5">
                    <p className="font-medium">{p?.name}</p>
                    <p className="text-xs text-muted-foreground">
                      Requested {fmt.number(l.quantity)} · Dispatched {fmt.number(l.dispatchedQty)} · In transit {fmt.number(n)} · Received {fmt.number(l.receivedQty)}
                    </p>
                    {(l.fromBinId || l.toBinId) && (
                      <p className="font-mono text-[11px] text-muted-foreground">{idx.bins.get(l.fromBinId ?? "")?.code ?? "Auto"} → {idx.bins.get(l.toBinId ?? "")?.code ?? "Auto"}</p>
                    )}
                  </div>
                );
              }}
            />
          </Section>

          <Section title="Related tasks" contentClassName="p-0">
            {tasks.length === 0 ? (
              <EmptyState title="No tasks yet" description="Tasks are created when an inter-warehouse transfer is approved and dispatched." className="py-8" />
            ) : (
              <ul className="divide-y" data-testid="transfer-tasks">
                {tasks.map((k) => (
                  <li key={k.id}>
                    <Link href={`/tasks?task=${k.id}`} className="flex items-center justify-between gap-3 px-4 py-3 text-sm hover:bg-muted/50">
                      <span className="min-w-0">
                        <span className="block truncate font-medium">{k.title}</span>
                        <span className="text-xs text-muted-foreground">
                          {k.number} · {idx.warehouses.get(k.warehouseId)?.code} · {idx.users.get(k.assigneeId ?? "")?.name ?? "Unassigned"}
                        </span>
                      </span>
                      <StatusBadge status={k.status} domain="task" />
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </Section>
        </div>

        <div className="space-y-6">
          <Section title={internal ? "Warehouse" : "Route"}>
            <div className="space-y-3">
              <WarehouseBlock label="From" id={t.fromWarehouseId} />
              {!internal && (
                <>
                  <ArrowRight className="mx-auto size-4 rotate-90 text-muted-foreground lg:rotate-90" aria-hidden />
                  <WarehouseBlock label="To" id={t.toWarehouseId} />
                </>
              )}
              {t.notes && <InfoItem label="Notes">{t.notes}</InfoItem>}
            </div>
          </Section>
          <Section title="Activity">
            <ActivityTimeline events={t.events} />
          </Section>
        </div>
      </div>

      <ConfirmationDialog
        open={dialog === "submit"}
        onOpenChange={(o) => !o && setDialog(null)}
        title={internal ? `Move stock now?` : `Submit ${t.number} for approval?`}
        description={internal ? "This bin-to-bin transfer completes immediately and stock moves between the selected bins." : "A manager must approve the transfer before it can be dispatched."}
        confirmLabel={internal ? "Submit & move" : "Submit"}
        onConfirm={() => run(() => tx.submitTransfer(t.id), internal ? `${t.number} completed` : `${t.number} submitted for approval`)}
      />
      <ConfirmationDialog
        open={dialog === "approve"}
        onOpenChange={(o) => !o && setDialog(null)}
        title={`Approve ${t.number}?`}
        description={`${fmt.number(requested)} units will be cleared for dispatch from ${from?.name} to ${to?.name}. A dispatch task is created for the source warehouse.`}
        confirmLabel="Approve transfer"
        onConfirm={() => run(() => tx.approveTransfer(t.id), `${t.number} approved`)}
      />
      <ConfirmationDialog
        open={dialog === "dispatch"}
        onOpenChange={(o) => !o && setDialog(null)}
        title={`Dispatch ${t.number}?`}
        description={`${fmt.number(requested)} units leave ${from?.name} now and are tracked as in transit until ${to?.name} receives them.`}
        confirmLabel="Dispatch"
        onConfirm={() => run(() => tx.dispatchTransfer(t.id), `${t.number} dispatched - stock is in transit`)}
      />
      <ReceiveDialog t={t} open={dialog === "receive"} onClose={() => setDialog(null)} />
      <ConfirmationDialog
        open={dialog === "cancel"}
        onOpenChange={(o) => {
          if (!o) {
            setDialog(null);
            setReason("");
          }
        }}
        title={`Cancel ${t.number}?`}
        description="The transfer is cancelled and no stock is moved. This cannot be undone."
        confirmLabel="Cancel transfer"
        destructive
        onConfirm={() => run(() => tx.cancelTransfer(t.id, reason.trim()), `${t.number} cancelled`)}
      >
        <Textarea value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Reason (optional)" aria-label="Cancellation reason" rows={2} />
      </ConfirmationDialog>
    </>
  );
}

function ReceiveDialog({ t, open, onClose }: { t: StockTransfer; open: boolean; onClose: () => void }) {
  const data = useData();
  const idx = useIndex();
  const tx = useTx();
  const { submit } = useSubmit();
  const [choices, setChoices] = useState<Record<ID, ID>>({});

  const bins = storageBinsFor(data, t.toWarehouseId);
  const pendingLines = t.lines.filter((l) => l.dispatchedQty - l.receivedQty > 0);

  return (
    <ConfirmationDialog
      open={open}
      onOpenChange={(o) => {
        if (!o) {
          onClose();
          setChoices({});
        }
      }}
      title={`Receive ${t.number}`}
      description="Check in the stock at the destination. Choose a storage bin for each product, or leave it on automatic."
      confirmLabel="Confirm receipt"
      onConfirm={async () => {
        const picked: Record<ID, ID> = {};
        for (const [lineId, bin] of Object.entries(choices)) if (bin) picked[lineId] = bin;
        const res = await submit(() => tx.receiveTransfer(t.id, picked), { success: `${t.number} received` });
        if (res?.ok) setChoices({});
        return res?.ok ?? false;
      }}
    >
      <div className="max-h-72 space-y-3 overflow-y-auto" data-testid="receive-lines">
        {pendingLines.map((l) => {
          const qty = l.dispatchedQty - l.receivedQty;
          const p = idx.products.get(l.productId);
          return (
            <div key={l.id} className="space-y-1">
              <label htmlFor={`rbin-${l.id}`} className="block text-sm font-medium">
                {p?.name} <span className="font-normal text-muted-foreground">× {qty}</span>
              </label>
              <NativeSelect
                id={`rbin-${l.id}`}
                value={choices[l.id] ?? ""}
                onChange={(e) => setChoices((c) => ({ ...c, [l.id]: e.target.value }))}
                options={[
                  { value: "", label: "Automatic (best available bin)" },
                  ...bins.map((b) => {
                    const free = binFree(data, b.id);
                    return { value: b.id, label: `${b.code} · ${free} free`, disabled: free < qty };
                  }),
                ]}
              />
            </div>
          );
        })}
      </div>
    </ConfirmationDialog>
  );
}

function Tile({ label, value, hint, highlight, testId }: { label: string; value: string; hint?: string; highlight?: boolean; testId?: string }) {
  return (
    <div className={`rounded-xl border p-4 shadow-card ${highlight ? "border-info/40 bg-info-soft" : "bg-card"}`}>
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className={`mt-0.5 text-2xl font-semibold tabular-nums ${highlight ? "text-info" : ""}`} data-testid={testId}>{value}</p>
      {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
    </div>
  );
}

function WarehouseBlock({ label, id }: { label: string; id: ID }) {
  const idx = useIndex();
  const w = idx.warehouses.get(id);
  return (
    <div className="rounded-lg border bg-muted/30 p-3">
      <p className="text-xs text-muted-foreground">{label}</p>
      {w ? (
        <>
          <Link href={`/warehouses/${w.id}`} className="font-medium hover:underline">{w.name} <span className="text-muted-foreground">({w.code})</span></Link>
          <p className="text-xs text-muted-foreground">{w.city}</p>
        </>
      ) : "—"}
    </div>
  );
}
