"use client";

import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";
import type {
  AppSettings,
  ChatMessage,
  ChatSession,
  ID,
  Result,
  TaskStatus,
  WmsData,
} from "@/types";
import { SEED_VERSION, STORAGE_KEY } from "@/lib/constants";
import { DEFAULT_SETTINGS } from "@/lib/settings-defaults";
import { generateSeed } from "@/data/mock/seed";
import type { TxContext } from "@/lib/inventory/core";
import { fail } from "@/lib/inventory/core";
import { reconcileMovements, reconcileReservations } from "@/lib/inventory/selectors";
import * as master from "@/lib/workflows/master";
import * as inventory from "@/lib/workflows/inventory";
import * as purchasing from "@/lib/workflows/purchasing";
import * as transfers from "@/lib/workflows/transfers";
import * as orders from "@/lib/workflows/orders";
import * as shipping from "@/lib/workflows/shipping";
import * as returns from "@/lib/workflows/returns";

/* The workflow modules take a (draft, ctx, ...args) signature. `bind` strips the first two. */
type Tail<F> = F extends (d: WmsData, c: TxContext, ...rest: infer R) => infer O ? (...rest: R) => O : never;

export interface DateRange {
  /** inclusive ISO dates */
  from: string;
  to: string;
  preset: "7d" | "30d" | "90d" | "custom";
}

export interface WmsState {
  /** true once persisted state was loaded (or the seed created) on the client */
  hydrated: boolean;
  data: WmsData;
  settings: AppSettings;
  /** demo user switcher: the "signed-in" user (simulated, not real auth) */
  currentUserId: ID;
  /** global warehouse scope used by the header selector, dashboard, etc. */
  selectedWarehouse: ID | "all";
  dateRange: DateRange;
  sidebarCollapsed: boolean;
  chats: ChatSession[];
  activeChatId: ID | null;
  dismissedRecommendations: string[];

  // --- generic
  /** Runs a transaction against a cloned draft; commits only if it succeeds. */
  run: <T>(fn: (d: WmsData, ctx: TxContext) => Result<T>) => Result<T>;
  markHydrated: () => void;
  resetDemo: () => void;

  // --- ui/session
  setCurrentUser: (id: ID) => void;
  setSelectedWarehouse: (id: ID | "all") => void;
  setDateRange: (r: DateRange) => void;
  setSidebarCollapsed: (v: boolean) => void;
  updateSettings: (patch: Partial<AppSettings>) => void;

  // --- notifications
  markNotificationRead: (id: ID, read?: boolean) => void;
  markAllNotificationsRead: () => void;
  clearNotification: (id: ID) => void;
  clearReadNotifications: () => number;

  // --- ai
  dismissRecommendation: (id: string) => void;
  restoreRecommendations: () => void;
  newChat: () => ID;
  appendChatMessages: (chatId: ID, messages: ChatMessage[], title?: string) => void;
  setActiveChat: (id: ID | null) => void;
  deleteChat: (id: ID) => void;

  /** Business transactions (all go through `run`, so they are atomic and validated). */
  tx: {
    // master data
    createWarehouse: Tail<typeof master.createWarehouse>;
    updateWarehouse: Tail<typeof master.updateWarehouse>;
    setWarehouseStatus: Tail<typeof master.setWarehouseStatus>;
    createZone: Tail<typeof master.createZone>;
    createRack: Tail<typeof master.createRack>;
    createBin: Tail<typeof master.createBin>;
    createProduct: Tail<typeof master.createProduct>;
    updateProduct: Tail<typeof master.updateProduct>;
    setProductStatus: Tail<typeof master.setProductStatus>;
    createSupplier: Tail<typeof master.createSupplier>;
    updateSupplier: Tail<typeof master.updateSupplier>;
    setSupplierStatus: Tail<typeof master.setSupplierStatus>;
    createCustomer: Tail<typeof master.createCustomer>;
    createUser: Tail<typeof master.createUser>;
    updateUser: Tail<typeof master.updateUser>;
    setUserStatus: Tail<typeof master.setUserStatus>;
    createManualTask: Tail<typeof master.createManualTask>;
    updateTask: Tail<typeof master.updateTask>;
    setTaskStatus: Tail<typeof master.setTaskStatus>;
    // inventory
    adjustStock: Tail<typeof inventory.adjustStock>;
    applyStockCount: Tail<typeof inventory.applyStockCount>;
    // purchasing & receiving
    createPurchaseOrder: Tail<typeof purchasing.createPurchaseOrder>;
    updatePurchaseOrder: Tail<typeof purchasing.updatePurchaseOrder>;
    approvePurchaseOrder: Tail<typeof purchasing.approvePurchaseOrder>;
    cancelPurchaseOrder: Tail<typeof purchasing.cancelPurchaseOrder>;
    confirmGoodsReceipt: Tail<typeof purchasing.confirmGoodsReceipt>;
    completePutaway: Tail<typeof purchasing.completePutaway>;
    // transfers
    createTransfer: Tail<typeof transfers.createTransfer>;
    updateTransfer: Tail<typeof transfers.updateTransfer>;
    submitTransfer: Tail<typeof transfers.submitTransfer>;
    approveTransfer: Tail<typeof transfers.approveTransfer>;
    dispatchTransfer: Tail<typeof transfers.dispatchTransfer>;
    receiveTransfer: Tail<typeof transfers.receiveTransfer>;
    cancelTransfer: Tail<typeof transfers.cancelTransfer>;
    // orders
    createOrder: Tail<typeof orders.createOrder>;
    updateOrder: Tail<typeof orders.updateOrder>;
    confirmOrder: Tail<typeof orders.confirmOrder>;
    cancelOrder: Tail<typeof orders.cancelOrder>;
    startPicking: Tail<typeof orders.startPicking>;
    confirmPick: Tail<typeof orders.confirmPick>;
    packOrder: Tail<typeof orders.packOrder>;
    // shipping
    createShipment: Tail<typeof shipping.createShipment>;
    confirmDispatch: Tail<typeof shipping.confirmDispatch>;
    advanceShipment: Tail<typeof shipping.advanceShipment>;
    // returns
    createReturn: Tail<typeof returns.createReturn>;
    receiveReturn: Tail<typeof returns.receiveReturn>;
    inspectReturn: Tail<typeof returns.inspectReturn>;
    approveRestock: Tail<typeof returns.approveRestock>;
    rejectReturn: Tail<typeof returns.rejectReturn>;
  };
}

const noopStorage = {
  getItem: () => null,
  setItem: () => undefined,
  removeItem: () => undefined,
};

function emptyData(): WmsData {
  return {
    seedVersion: 0,
    seededAt: new Date(0).toISOString(),
    users: [],
    warehouses: [],
    zones: [],
    racks: [],
    bins: [],
    products: [],
    stock: [],
    movements: [],
    suppliers: [],
    customers: [],
    purchaseOrders: [],
    receipts: [],
    transfers: [],
    orders: [],
    shipments: [],
    returns: [],
    tasks: [],
    notifications: [],
    counters: { po: 0, grn: 0, so: 0, trf: 0, rma: 0, shp: 0, tsk: 0, mov: 0, ntf: 0, slip: 0, sku: 0, id: 0 },
  };
}

function defaultRange(): DateRange {
  const to = new Date();
  const from = new Date(to.getTime() - 29 * 24 * 3600 * 1000);
  return { from: from.toISOString(), to: to.toISOString(), preset: "30d" };
}

function freshDemoState(): Pick<
  WmsState,
  "data" | "currentUserId" | "selectedWarehouse" | "dateRange" | "chats" | "activeChatId" | "dismissedRecommendations"
> {
  const data = generateSeed(new Date());
  return {
    data,
    currentUserId: data.users[0]?.id ?? "",
    selectedWarehouse: "all",
    dateRange: defaultRange(),
    chats: [],
    activeChatId: null,
    dismissedRecommendations: [],
  };
}

const bindTx = (run: WmsState["run"]) => {
  const b = <A extends unknown[], R>(fn: (d: WmsData, c: TxContext, ...a: A) => Result<R>) =>
    (...args: A) =>
      run((d, c) => fn(d, c, ...args));
  return {
    createWarehouse: b(master.createWarehouse),
    updateWarehouse: b(master.updateWarehouse),
    setWarehouseStatus: b(master.setWarehouseStatus),
    createZone: b(master.createZone),
    createRack: b(master.createRack),
    createBin: b(master.createBin),
    createProduct: b(master.createProduct),
    updateProduct: b(master.updateProduct),
    setProductStatus: b(master.setProductStatus),
    createSupplier: b(master.createSupplier),
    updateSupplier: b(master.updateSupplier),
    setSupplierStatus: b(master.setSupplierStatus),
    createCustomer: b(master.createCustomer),
    createUser: b(master.createUser),
    updateUser: b(master.updateUser),
    setUserStatus: b(master.setUserStatus),
    createManualTask: b(master.createManualTask),
    updateTask: b(master.updateTask),
    setTaskStatus: b(master.setTaskStatus),
    adjustStock: b(inventory.adjustStock),
    applyStockCount: b(inventory.applyStockCount),
    createPurchaseOrder: b(purchasing.createPurchaseOrder),
    updatePurchaseOrder: b(purchasing.updatePurchaseOrder),
    approvePurchaseOrder: b(purchasing.approvePurchaseOrder),
    cancelPurchaseOrder: b(purchasing.cancelPurchaseOrder),
    confirmGoodsReceipt: b(purchasing.confirmGoodsReceipt),
    completePutaway: b(purchasing.completePutaway),
    createTransfer: b(transfers.createTransfer),
    updateTransfer: b(transfers.updateTransfer),
    submitTransfer: b(transfers.submitTransfer),
    approveTransfer: b(transfers.approveTransfer),
    dispatchTransfer: b(transfers.dispatchTransfer),
    receiveTransfer: b(transfers.receiveTransfer),
    cancelTransfer: b(transfers.cancelTransfer),
    createOrder: b(orders.createOrder),
    updateOrder: b(orders.updateOrder),
    confirmOrder: b(orders.confirmOrder),
    cancelOrder: b(orders.cancelOrder),
    startPicking: b(orders.startPicking),
    confirmPick: b(orders.confirmPick),
    packOrder: b(orders.packOrder),
    createShipment: b(shipping.createShipment),
    confirmDispatch: b(shipping.confirmDispatch),
    advanceShipment: b(shipping.advanceShipment),
    createReturn: b(returns.createReturn),
    receiveReturn: b(returns.receiveReturn),
    inspectReturn: b(returns.inspectReturn),
    approveRestock: b(returns.approveRestock),
    rejectReturn: b(returns.rejectReturn),
  } as WmsState["tx"];
};

export const useWmsStore = create<WmsState>()(
  persist(
    (set, get) => {
      const run: WmsState["run"] = (fn) => {
        const { data, settings, currentUserId } = get();
        const actor = data.users.find((u) => u.id === currentUserId);
        if (!actor || actor.status !== "active") return fail("The selected demo user is inactive.");
        const draft = structuredClone(data);
        const ctx: TxContext = {
          userId: currentUserId,
          now: new Date().toISOString(),
          settings: {
            lowStockThresholdFactor: settings.lowStockThresholdFactor,
            notificationPrefs: settings.notificationPrefs,
            adjustmentReasonRequired: settings.adjustmentReasonRequired,
            largeAdjustmentThreshold: settings.largeAdjustmentThreshold,
          },
        };
        let result: Result<never> | ReturnType<typeof fn>;
        try {
          result = fn(draft, ctx);
        } catch (e) {
          console.error(e);
          return fail(e instanceof Error ? e.message : "Unexpected error");
        }
        if (result.ok) set({ data: draft });
        return result as ReturnType<typeof fn>;
      };

      return {
        hydrated: false,
        data: emptyData(),
        settings: DEFAULT_SETTINGS,
        currentUserId: "",
        selectedWarehouse: "all",
        dateRange: defaultRange(),
        sidebarCollapsed: false,
        chats: [],
        activeChatId: null,
        dismissedRecommendations: [],

        run,
        markHydrated: () => {
          const s = get();
          if (s.data.seedVersion !== SEED_VERSION || s.data.products.length === 0) {
            set({ ...freshDemoState(), hydrated: true });
          } else {
            if (!s.data.users.some((u) => u.id === s.currentUserId)) set({ currentUserId: s.data.users[0]?.id ?? "" });
            set({ hydrated: true });
          }
        },
        resetDemo: () => set({ ...freshDemoState(), settings: DEFAULT_SETTINGS, hydrated: true }),

        setCurrentUser: (id) => set({ currentUserId: id }),
        setSelectedWarehouse: (id) => set({ selectedWarehouse: id }),
        setDateRange: (r) => set({ dateRange: r }),
        setSidebarCollapsed: (v) => set({ sidebarCollapsed: v }),
        updateSettings: (patch) => set((s) => ({ settings: { ...s.settings, ...patch } })),

        markNotificationRead: (id, read = true) =>
          set((s) => ({
            data: { ...s.data, notifications: s.data.notifications.map((n) => (n.id === id ? { ...n, read } : n)) },
          })),
        markAllNotificationsRead: () =>
          set((s) => ({ data: { ...s.data, notifications: s.data.notifications.map((n) => ({ ...n, read: true })) } })),
        clearNotification: (id) =>
          set((s) => ({ data: { ...s.data, notifications: s.data.notifications.filter((n) => n.id !== id) } })),
        clearReadNotifications: () => {
          const before = get().data.notifications.length;
          set((s) => ({ data: { ...s.data, notifications: s.data.notifications.filter((n) => !n.read) } }));
          return before - get().data.notifications.length;
        },

        dismissRecommendation: (id) =>
          set((s) => ({ dismissedRecommendations: Array.from(new Set([...s.dismissedRecommendations, id])) })),
        restoreRecommendations: () => set({ dismissedRecommendations: [] }),
        newChat: () => {
          const id = `chat_${Date.now().toString(36)}`;
          set((s) => ({
            chats: [{ id, title: "New conversation", createdAt: new Date().toISOString(), messages: [] }, ...s.chats],
            activeChatId: id,
          }));
          return id;
        },
        appendChatMessages: (chatId, messages, title) =>
          set((s) => ({
            chats: s.chats.map((c) =>
              c.id === chatId
                ? { ...c, title: title && c.title === "New conversation" ? title : c.title, messages: [...c.messages, ...messages] }
                : c,
            ),
          })),
        setActiveChat: (id) => set({ activeChatId: id }),
        deleteChat: (id) =>
          set((s) => ({
            chats: s.chats.filter((c) => c.id !== id),
            activeChatId: s.activeChatId === id ? null : s.activeChatId,
          })),

        // wired here (not via a later setState) so module load never overwrites persisted state
        tx: bindTx(run),
      };
    },
    {
      name: STORAGE_KEY,
      version: SEED_VERSION,
      // Guarded: during SSR (and on Node versions exposing a stub `localStorage`) fall back to a no-op store.
      storage: createJSONStorage(() =>
        typeof window !== "undefined" && typeof window.localStorage?.setItem === "function" ? window.localStorage : noopStorage,
      ),
      skipHydration: true,
      partialize: (s) => ({
        data: s.data,
        settings: s.settings,
        currentUserId: s.currentUserId,
        selectedWarehouse: s.selectedWarehouse,
        dateRange: s.dateRange,
        sidebarCollapsed: s.sidebarCollapsed,
        chats: s.chats,
        activeChatId: s.activeChatId,
        dismissedRecommendations: s.dismissedRecommendations,
      }),
      // A different seed version means the stored shape may be incompatible: start from the new seed.
      migrate: () => ({ ...freshDemoState(), settings: DEFAULT_SETTINGS, sidebarCollapsed: false }) as unknown as WmsState,
      merge: (persisted, current) => {
        const p = (persisted ?? {}) as Partial<WmsState>;
        return {
          ...current,
          ...p,
          settings: { ...DEFAULT_SETTINGS, ...(p.settings ?? {}), notificationPrefs: { ...DEFAULT_SETTINGS.notificationPrefs, ...(p.settings?.notificationPrefs ?? {}) } },
        };
      },
    },
  ),
);

/** Kicks off client-side hydration from localStorage (idempotent). */
export async function hydrateWmsStore() {
  if (useWmsStore.getState().hydrated) return;
  try {
    await useWmsStore.persist.rehydrate();
  } catch (e) {
    console.error("Failed to rehydrate WMS state, falling back to seed data", e);
    useWmsStore.setState({ data: emptyData() });
  }
  // tx is part of the initial state (functions are never persisted); guard anyway.
  if (!useWmsStore.getState().tx) useWmsStore.setState({ tx: bindTx(useWmsStore.getState().run) });
  useWmsStore.getState().markHydrated();
  installDebugHook();
}

/**
 * Read-only debugging/testing hook: `window.__wms.data()` returns the current data snapshot and
 * `window.__wms.integrity()` runs the stock invariants (movement history vs on-hand, reservations
 * vs open orders). Used by the Playwright suite; harmless in production.
 */
function installDebugHook() {
  if (typeof window === "undefined") return;
  (window as unknown as { __wms: unknown }).__wms = {
    data: () => useWmsStore.getState().data,
    integrity: () => {
      const d = useWmsStore.getState().data;
      return { movementMismatches: reconcileMovements(d), reservationMismatches: reconcileReservations(d) };
    },
  };
}

export type { TaskStatus };
