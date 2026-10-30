import type { NotificationType, Role } from "@/types";

export const SEED_VERSION = 1;
export const STORAGE_KEY = "wms-state";
export const SETTINGS_KEY = "wms-settings";

export const PRODUCT_CATEGORIES = [
  "Tea & Beverages",
  "Spices & Condiments",
  "Grains & Staples",
  "Coconut Products",
  "Household & Cleaning",
  "Personal Care",
  "Packaging Materials",
  "Electronics & Accessories",
] as const;

export const UOMS = ["pcs", "kg", "g", "ltr", "box", "carton", "pack", "bag", "roll"] as const;

export const CARRIERS = [
  { name: "Ceylon Express", methods: ["Standard Ground", "Express Next-Day"] },
  { name: "Island Couriers", methods: ["Standard Ground", "Same-Day Metro"] },
  { name: "Lanka Freight", methods: ["Pallet Freight", "Full Truck Load"] },
  { name: "Serendib Logistics", methods: ["Standard Ground", "Economy"] },
] as const;

export const PACKAGING_TYPES = [
  "Small Carton",
  "Medium Carton",
  "Large Carton",
  "Pallet Wrap",
  "Poly Bag",
] as const;

export const RETURN_REASONS = [
  "Damaged in transit",
  "Wrong item delivered",
  "Quality issue",
  "Customer changed mind",
  "Expired / near expiry",
] as const;

export const ADJUSTMENT_REASONS = [
  "Cycle count correction",
  "Damaged goods",
  "Expired goods",
  "Found stock",
  "Theft / loss",
  "Quarantine / quality hold",
  "Data entry correction",
  "Other",
] as const;

/* --------------------------------------------------------------- currency */

export const CURRENCIES = {
  LKR: { symbol: "Rs", rate: 1, locale: "en-LK", label: "Sri Lankan Rupee (LKR)" },
  USD: { symbol: "$", rate: 1 / 300, locale: "en-US", label: "US Dollar (USD)" },
  EUR: { symbol: "€", rate: 1 / 325, locale: "de-DE", label: "Euro (EUR)" },
  GBP: { symbol: "£", rate: 1 / 380, locale: "en-GB", label: "British Pound (GBP)" },
  INR: { symbol: "₹", rate: 1 / 3.6, locale: "en-IN", label: "Indian Rupee (INR)" },
} as const;

export const TIMEZONES = [
  "Asia/Colombo",
  "Asia/Kolkata",
  "Asia/Dubai",
  "Asia/Singapore",
  "Europe/London",
  "America/New_York",
  "UTC",
] as const;

/* ------------------------------------------------------------------- roles */

export const ROLE_LABELS: Record<Role, string> = {
  admin: "Administrator",
  warehouse_manager: "Warehouse Manager",
  inventory_manager: "Inventory Manager",
  operator: "Warehouse Operator",
};

export const ROLE_DESCRIPTIONS: Record<Role, string> = {
  admin: "Full access to every module, user management and settings.",
  warehouse_manager: "Runs warehouse operations: purchasing, orders, transfers, tasks and reports.",
  inventory_manager: "Owns catalog and stock accuracy: products, suppliers, adjustments, purchasing.",
  operator: "Executes floor work: receiving, putaway, picking, packing, shipping and tasks.",
};

/**
 * Simulated permissions (prototype only - NOT real security).
 * Used to hide navigation and disable actions per demo role.
 */
export type Permission =
  | "warehouses.write"
  | "products.write"
  | "suppliers.write"
  | "inventory.adjust"
  | "po.write"
  | "po.approve"
  | "receiving.write"
  | "transfers.write"
  | "transfers.approve"
  | "orders.write"
  | "picking.write"
  | "shipping.write"
  | "returns.write"
  | "tasks.write"
  | "reports.view"
  | "users.manage"
  | "settings.manage";

const ALL: Permission[] = [
  "warehouses.write",
  "products.write",
  "suppliers.write",
  "inventory.adjust",
  "po.write",
  "po.approve",
  "receiving.write",
  "transfers.write",
  "transfers.approve",
  "orders.write",
  "picking.write",
  "shipping.write",
  "returns.write",
  "tasks.write",
  "reports.view",
  "users.manage",
  "settings.manage",
];

export const ROLE_PERMISSIONS: Record<Role, Permission[]> = {
  admin: ALL,
  warehouse_manager: ALL.filter((p) => p !== "users.manage" && p !== "settings.manage"),
  inventory_manager: [
    "products.write",
    "suppliers.write",
    "inventory.adjust",
    "po.write",
    "po.approve",
    "receiving.write",
    "transfers.write",
    "reports.view",
  ],
  operator: ["receiving.write", "picking.write", "shipping.write", "returns.write", "tasks.write", "transfers.write"],
};

/** Routes hidden from each role in the sidebar (everything else is visible). */
export const ROLE_HIDDEN_ROUTES: Record<Role, string[]> = {
  admin: [],
  warehouse_manager: ["/users", "/settings"],
  inventory_manager: ["/users", "/settings", "/picking-packing", "/shipping", "/orders", "/returns"],
  operator: ["/users", "/settings", "/reports", "/suppliers", "/purchase-orders", "/warehouses"],
};

export const NOTIFICATION_LABELS: Record<NotificationType, string> = {
  low_stock: "Low stock warnings",
  po_approved: "Purchase order approved",
  goods_received: "Goods received",
  order_ready_for_picking: "Order ready for picking",
  order_dispatched: "Order dispatched",
  transfer_completed: "Transfer completed",
  return_processed: "Return processed",
  task_assigned: "Task assigned",
  ai_recommendation: "AI recommendations",
};
