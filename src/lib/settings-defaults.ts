import type { AppSettings, NotificationType } from "@/types";

const allOn: Record<NotificationType, boolean> = {
  low_stock: true,
  po_approved: true,
  goods_received: true,
  order_ready_for_picking: true,
  order_dispatched: true,
  transfer_completed: true,
  return_processed: true,
  task_assigned: true,
  ai_recommendation: true,
};

export const DEFAULT_SETTINGS: AppSettings = {
  companyName: "Lanka Fresh Logistics (Pvt) Ltd",
  companyLogo: null,
  currency: "LKR",
  dateFormat: "dd MMM yyyy",
  timezone: "Asia/Colombo",
  sidebarDefaultCollapsed: false,
  defaultWarehouseId: "all",
  lowStockThresholdFactor: 1,
  adjustmentReasonRequired: true,
  largeAdjustmentThreshold: 500,
  notificationPrefs: allOn,
  aiEnabled: true,
  aiRecommendationsEnabled: true,
  aiResponseStyle: "detailed",
};
