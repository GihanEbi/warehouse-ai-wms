"use client";

import { useCallback, useMemo } from "react";
import { useWmsStore } from "@/stores/wms-store";
import { indexData } from "@/lib/inventory/selectors";
import { createFormatter } from "@/lib/format";
import { ROLE_PERMISSIONS, type Permission } from "@/lib/constants";

/** Whole shared data set (single source of truth). Re-renders on any data change. */
export const useData = () => useWmsStore((s) => s.data);
export const useSettings = () => useWmsStore((s) => s.settings);
export const useHydrated = () => useWmsStore((s) => s.hydrated);
/** Business transactions (validated, atomic). The only way UI code mutates shared data. */
export const useTx = () => useWmsStore((s) => s.tx);

export function useIndex() {
  const data = useData();
  return useMemo(() => indexData(data), [data]);
}

export function useFormat() {
  const currency = useWmsStore((s) => s.settings.currency);
  const dateFormat = useWmsStore((s) => s.settings.dateFormat);
  const timezone = useWmsStore((s) => s.settings.timezone);
  return useMemo(() => createFormatter({ currency, dateFormat, timezone }), [currency, dateFormat, timezone]);
}

export function useCurrentUser() {
  const id = useWmsStore((s) => s.currentUserId);
  const users = useWmsStore((s) => s.data.users);
  return useMemo(() => users.find((u) => u.id === id) ?? null, [users, id]);
}

/** Simulated role-based permissions (prototype only - NOT real security). */
export function usePermission() {
  const user = useCurrentUser();
  const role = user?.role ?? "operator";
  const granted = useMemo(() => new Set<Permission>(ROLE_PERMISSIONS[role]), [role]);
  const can = useCallback((p: Permission) => granted.has(p), [granted]);
  return { can, role, user };
}

/** The warehouse scope chosen in the header (or "all"). */
export function useWarehouseScope() {
  const scope = useWmsStore((s) => s.selectedWarehouse);
  const set = useWmsStore((s) => s.setSelectedWarehouse);
  return [scope, set] as const;
}
