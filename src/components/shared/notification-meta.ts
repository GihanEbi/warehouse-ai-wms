import {
  AlertTriangle,
  ArrowLeftRight,
  ClipboardList,
  PackageCheck,
  PackageOpen,
  RotateCcw,
  ScrollText,
  ShoppingCart,
  Sparkles,
  Truck,
  type LucideIcon,
} from "lucide-react";
import type { NotificationType } from "@/types";
import type { Tone } from "./status-badge";

export const NOTIFICATION_META: Record<NotificationType, { icon: LucideIcon; tone: Tone; label: string }> = {
  low_stock: { icon: AlertTriangle, tone: "warning", label: "Low stock" },
  po_approved: { icon: ScrollText, tone: "info", label: "Purchase order" },
  goods_received: { icon: PackageOpen, tone: "success", label: "Goods received" },
  order_ready_for_picking: { icon: ShoppingCart, tone: "primary", label: "Ready for picking" },
  order_dispatched: { icon: Truck, tone: "success", label: "Order dispatched" },
  transfer_completed: { icon: ArrowLeftRight, tone: "teal", label: "Transfer" },
  return_processed: { icon: RotateCcw, tone: "info", label: "Return" },
  task_assigned: { icon: ClipboardList, tone: "neutral", label: "Task" },
  ai_recommendation: { icon: Sparkles, tone: "primary", label: "AI recommendation" },
};

export { PackageCheck };
