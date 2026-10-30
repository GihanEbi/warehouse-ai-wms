import {
  ArrowLeftRight,
  BarChart3,
  Bell,
  Boxes,
  ClipboardCheck,
  ClipboardList,
  Factory,
  LayoutDashboard,
  PackageCheck,
  PackageOpen,
  PackageSearch,
  RotateCcw,
  Settings,
  ShoppingCart,
  Sparkles,
  Truck,
  Users,
  Warehouse,
  ScrollText,
  type LucideIcon,
} from "lucide-react";

export interface NavItem {
  href: string;
  label: string;
  icon: LucideIcon;
}
export interface NavGroup {
  label: string;
  items: NavItem[];
}

export const NAVIGATION: NavGroup[] = [
  {
    label: "Overview",
    items: [
      { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
      { href: "/ai-assistant", label: "AI Assistant", icon: Sparkles },
      { href: "/notifications", label: "Notifications", icon: Bell },
    ],
  },
  {
    label: "Warehouse Operations",
    items: [
      { href: "/warehouses", label: "Warehouses", icon: Warehouse },
      { href: "/products", label: "Products", icon: PackageSearch },
      { href: "/inventory", label: "Inventory", icon: Boxes },
      { href: "/suppliers", label: "Suppliers", icon: Factory },
      { href: "/purchase-orders", label: "Purchase Orders", icon: ScrollText },
      { href: "/receiving", label: "Goods Receiving", icon: PackageOpen },
      { href: "/transfers", label: "Stock Transfers", icon: ArrowLeftRight },
      { href: "/orders", label: "Orders", icon: ShoppingCart },
      { href: "/picking-packing", label: "Picking & Packing", icon: ClipboardCheck },
      { href: "/shipping", label: "Shipping", icon: Truck },
      { href: "/returns", label: "Returns", icon: RotateCcw },
    ],
  },
  {
    label: "Management",
    items: [
      { href: "/tasks", label: "Warehouse Tasks", icon: ClipboardList },
      { href: "/reports", label: "Reports & Analytics", icon: BarChart3 },
    ],
  },
  {
    label: "Administration",
    items: [
      { href: "/users", label: "Users & Roles", icon: Users },
      { href: "/settings", label: "Settings", icon: Settings },
    ],
  },
];

export const ALL_NAV_ITEMS = NAVIGATION.flatMap((g) => g.items);

/** Human labels for breadcrumb segments. */
export const SEGMENT_LABELS: Record<string, string> = Object.fromEntries([
  ...ALL_NAV_ITEMS.map((i) => [i.href.slice(1), i.label]),
  ["new", "New"],
  ["edit", "Edit"],
  ["print", "Print view"],
  ["pack", "Packing"],
  ["profile", "My profile"],
]);

export { PackageCheck };
