/**
 * Domain model for the WMS prototype.
 *
 * All dates are ISO-8601 strings. All quantities are integers.
 *
 * Stock definitions (see src/lib/inventory/selectors.ts):
 *  - onHand   : physical quantity in a bin (any bin type)
 *  - reserved : allocated to confirmed orders (storage bins only)
 *  - blocked  : quarantined / unavailable (storage bins only)
 *  - available: storage bins only -> max(0, onHand - reserved - blocked)
 *  - staging  : onHand sitting in a bin of type "staging" (awaiting putaway) - never pickable
 *  - returns  : onHand sitting in a bin of type "returns" (awaiting inspection) - never pickable
 *  - inTransit: dispatched on an inter-warehouse transfer, not yet received (held on the transfer lines)
 */

export type ID = string;

// ---------------------------------------------------------------- Roles/users
export type Role = "admin" | "warehouse_manager" | "inventory_manager" | "operator";

export interface User {
  id: ID;
  name: string;
  email: string;
  phone: string;
  role: Role;
  title: string;
  warehouseIds: ID[];
  status: "active" | "inactive";
  createdAt: string;
}

// ----------------------------------------------------------------- Warehouses
export interface Warehouse {
  id: ID;
  code: string; // unique, e.g. "CMB-01"
  name: string;
  city: string;
  address: string;
  managerId: ID | null;
  status: "active" | "inactive";
  createdAt: string;
}

export interface Zone {
  id: ID;
  warehouseId: ID;
  code: string; // unique within warehouse e.g. "A"
  name: string;
  kind: "storage" | "receiving" | "returns";
}

export interface Rack {
  id: ID;
  warehouseId: ID;
  zoneId: ID;
  code: string; // e.g. "A-R1"
}

export type BinType = "storage" | "staging" | "returns";

export interface Bin {
  id: ID;
  warehouseId: ID;
  zoneId: ID;
  rackId: ID;
  code: string; // unique, e.g. "CMB-A-R1-B01"
  type: BinType;
  capacity: number; // max units
}

// ------------------------------------------------------------------- Products
export type ProductStatus = "active" | "inactive" | "archived";

export interface Product {
  id: ID;
  sku: string; // unique
  name: string;
  description: string;
  category: string;
  uom: string; // "pcs", "kg", "box" ...
  unitCost: number; // base currency (LKR)
  sellingPrice: number | null;
  reorderLevel: number;
  preferredSupplierId: ID | null;
  /** emoji used by the placeholder image tile */
  emoji: string;
  /** optional uploaded image (data URL) or remote URL */
  imageUrl: string | null;
  barcode: string;
  status: ProductStatus;
  createdAt: string;
}

// ------------------------------------------------------------------ Inventory
export interface StockRecord {
  id: ID;
  productId: ID;
  warehouseId: ID;
  binId: ID;
  onHand: number;
  reserved: number;
  blocked: number;
}

export type MovementType =
  | "receipt" // supplier goods into staging (+)
  | "putaway" // staging -> storage bin (0)
  | "adjustment_in" // manual increase (+)
  | "adjustment_out" // manual decrease (-)
  | "block" // quarantine units (0 on-hand, reduces available)
  | "unblock" // release quarantined units (0)
  | "transfer_out" // leaves source warehouse into in-transit (-)
  | "transfer_in" // arrives at destination (+)
  | "bin_transfer" // bin -> bin inside warehouse (0)
  | "dispatch" // customer shipment (-)
  | "return_receipt" // customer return into returns bin (+)
  | "return_restock" // returns bin -> storage bin (0)
  | "return_writeoff"; // damaged / rejected return removed (-)

export interface StockMovement {
  id: ID;
  reference: string; // e.g. "MV-000123"
  productId: ID;
  warehouseId: ID;
  type: MovementType;
  quantity: number; // always positive
  /** effect on the warehouse's physical on-hand: +quantity, -quantity or 0 */
  onHandDelta: number;
  fromLabel: string; // "Supplier: Ceylon Tea Traders" | bin code | "In transit"
  toLabel: string;
  fromBinId: ID | null;
  toBinId: ID | null;
  /** originating document, e.g. { kind: "order", id, number } */
  source: { kind: string; id: ID | null; number: string } | null;
  note: string;
  performedBy: ID;
  createdAt: string;
}

// ---------------------------------------------------------- Suppliers/customers
export interface Supplier {
  id: ID;
  code: string;
  name: string;
  contactPerson: string;
  email: string;
  phone: string;
  country: string;
  address: string;
  paymentTerms: string;
  leadTimeDays: number;
  status: "active" | "inactive";
  createdAt: string;
}

export interface Customer {
  id: ID;
  code: string;
  name: string;
  contactPerson: string;
  email: string;
  phone: string;
  address: string;
  city: string;
}

// ------------------------------------------------------------- Shared helpers
export interface ActivityEvent {
  id: ID;
  at: string;
  by: ID | null;
  title: string;
  detail?: string;
}

export type Priority = "low" | "normal" | "high" | "urgent";

// ------------------------------------------------------------ Purchase orders
export type PurchaseOrderStatus =
  | "draft"
  | "approved"
  | "partially_received"
  | "received"
  | "cancelled";

export interface PurchaseOrderLine {
  id: ID;
  productId: ID;
  quantity: number;
  unitCost: number;
  /** accepted (good) quantity received so far */
  receivedQty: number;
  /** damaged / rejected quantity recorded so far (not added to stock) */
  rejectedQty: number;
}

export interface PurchaseOrder {
  id: ID;
  number: string; // PO-2026-0001
  supplierId: ID;
  warehouseId: ID;
  orderDate: string;
  expectedDate: string;
  status: PurchaseOrderStatus;
  lines: PurchaseOrderLine[];
  notes: string;
  createdBy: ID;
  events: ActivityEvent[];
}

// ----------------------------------------------------------- Goods receiving
export interface GoodsReceiptLine {
  id: ID;
  productId: ID;
  poLineId: ID;
  expectedQty: number; // outstanding when receiving was started
  receivedQty: number; // accepted
  damagedQty: number; // rejected
  stagingBinId: ID;
}

export interface GoodsReceipt {
  id: ID;
  grn: string; // GRN-000001
  purchaseOrderId: ID;
  supplierId: ID;
  warehouseId: ID;
  receivedAt: string;
  receivedBy: ID;
  /** "awaiting_putaway" until every putaway task for it is done */
  status: "awaiting_putaway" | "completed";
  lines: GoodsReceiptLine[];
  notes: string;
}

// ---------------------------------------------------------------- Transfers
export type TransferStatus =
  | "draft"
  | "pending_approval"
  | "approved"
  | "in_transit"
  | "completed"
  | "cancelled";

export interface TransferLine {
  id: ID;
  productId: ID;
  quantity: number;
  /** source bin (required for internal transfers; optional for inter-warehouse = auto-allocate) */
  fromBinId: ID | null;
  /** destination bin (required for internal; chosen/auto at receipt for inter-warehouse) */
  toBinId: ID | null;
  /** quantity that left the source warehouse (set at dispatch) */
  dispatchedQty: number;
  /** quantity received at destination */
  receivedQty: number;
}

export interface StockTransfer {
  id: ID;
  number: string; // TRF-0001
  type: "internal" | "inter_warehouse";
  fromWarehouseId: ID;
  toWarehouseId: ID; // same as from for internal
  status: TransferStatus;
  lines: TransferLine[];
  notes: string;
  createdAt: string;
  createdBy: ID;
  events: ActivityEvent[];
}

// ---------------------------------------------------------------------- Orders
export type OrderStatus =
  | "draft"
  | "confirmed"
  | "picking"
  | "picked"
  | "packed"
  | "dispatched"
  | "cancelled";

export interface OrderAllocation {
  binId: ID;
  quantity: number;
  /** quantity already confirmed as picked from this bin */
  pickedQty: number;
}

export interface OrderLine {
  id: ID;
  productId: ID;
  quantity: number;
  unitPrice: number;
  /** filled when the order is confirmed (stock reserved) */
  allocations: OrderAllocation[];
}

export interface PackingDetails {
  packagingType: string;
  packageCount: number;
  weightKg: number;
  slipNumber: string; // PS-000001
  packedAt: string;
  packedBy: ID;
  notes: string;
}

export interface SalesOrder {
  id: ID;
  number: string; // SO-2026-0001
  customerId: ID;
  warehouseId: ID;
  orderDate: string;
  requiredDate: string;
  priority: Priority;
  status: OrderStatus;
  lines: OrderLine[];
  notes: string;
  packing: PackingDetails | null;
  shipmentId: ID | null;
  createdBy: ID;
  events: ActivityEvent[];
}

// ------------------------------------------------------------------- Shipping
export type ShipmentStatus = "ready_to_ship" | "dispatched" | "in_transit" | "delivered";

export interface Shipment {
  id: ID;
  number: string; // SHP-0001
  orderId: ID;
  warehouseId: ID;
  carrier: string;
  method: string;
  trackingNumber: string;
  status: ShipmentStatus;
  dispatchDate: string | null;
  estimatedDelivery: string | null;
  deliveredAt: string | null;
  createdAt: string;
  createdBy: ID;
  events: ActivityEvent[];
}

// -------------------------------------------------------------------- Returns
export type ReturnStatus = "requested" | "received" | "inspected" | "restocked" | "rejected";

export interface ReturnLine {
  id: ID;
  productId: ID;
  quantity: number;
  reason: string;
  /** set during inspection: units fit for resale */
  goodQty: number;
  /** set during inspection: damaged / rejected units */
  damagedQty: number;
}

export interface ReturnRecord {
  id: ID;
  number: string; // RMA-0001
  orderId: ID;
  customerId: ID;
  warehouseId: ID;
  status: ReturnStatus;
  lines: ReturnLine[];
  reason: string;
  createdAt: string;
  createdBy: ID;
  events: ActivityEvent[];
}

// ---------------------------------------------------------------------- Tasks
export type TaskType =
  | "receiving"
  | "putaway"
  | "picking"
  | "packing"
  | "transfer"
  | "stock_count"
  | "general";

export type TaskStatus = "pending" | "in_progress" | "completed" | "blocked";

export interface TaskLink {
  kind: "order" | "receipt" | "transfer" | "return" | "purchase_order" | "product";
  id: ID;
  label: string;
}

export interface PickDetail {
  orderId: ID;
  lineId: ID;
  productId: ID;
  binId: ID;
  requiredQty: number;
  pickedQty: number;
}

export interface PutawayDetail {
  receiptId: ID;
  lineId: ID;
  productId: ID;
  quantity: number;
  fromBinId: ID;
  suggestedBinId: ID;
}

export interface WarehouseTask {
  id: ID;
  number: string; // TSK-0001
  title: string;
  description: string;
  type: TaskType;
  priority: Priority;
  status: TaskStatus;
  assigneeId: ID | null;
  warehouseId: ID;
  dueDate: string;
  createdAt: string;
  createdBy: ID;
  completedAt: string | null;
  link: TaskLink | null;
  pick?: PickDetail;
  putaway?: PutawayDetail;
}

// -------------------------------------------------------------- Notifications
export type NotificationType =
  | "low_stock"
  | "po_approved"
  | "goods_received"
  | "order_ready_for_picking"
  | "order_dispatched"
  | "transfer_completed"
  | "return_processed"
  | "task_assigned"
  | "ai_recommendation";

export interface AppNotification {
  id: ID;
  type: NotificationType;
  title: string;
  message: string;
  createdAt: string;
  read: boolean;
  /** in-app route to the related record */
  href: string | null;
}

// ------------------------------------------------------------------- Settings
export interface AppSettings {
  companyName: string;
  companyLogo: string | null; // data URL
  currency: "LKR" | "USD" | "EUR" | "GBP" | "INR";
  dateFormat: "dd MMM yyyy" | "MM/dd/yyyy" | "dd/MM/yyyy" | "yyyy-MM-dd";
  timezone: string;
  sidebarDefaultCollapsed: boolean;
  defaultWarehouseId: ID | "all";
  /** multiplier applied to each product's reorder level when deciding "low stock" (1 = exact) */
  lowStockThresholdFactor: number;
  /** if false, adjustments can never reduce stock below zero (always enforced) / large adjustment guard */
  adjustmentReasonRequired: boolean;
  largeAdjustmentThreshold: number;
  notificationPrefs: Record<NotificationType, boolean>;
  aiEnabled: boolean;
  aiRecommendationsEnabled: boolean;
  aiResponseStyle: "concise" | "detailed";
}

// --------------------------------------------------------------------- Whole
export interface AiDismissals {
  recommendationIds: string[];
}

export interface ChatMessage {
  id: ID;
  role: "user" | "assistant";
  at: string;
  text: string;
  /** structured payload for assistant messages - see src/lib/mock-ai */
  blocks?: unknown;
}

export interface ChatSession {
  id: ID;
  title: string;
  createdAt: string;
  messages: ChatMessage[];
}

export type CounterKey =
  | "po"
  | "grn"
  | "so"
  | "trf"
  | "rma"
  | "shp"
  | "tsk"
  | "mov"
  | "ntf"
  | "slip"
  | "sku"
  | "id";

/** The complete shared data set - the single source of truth. */
export interface WmsData {
  seedVersion: number;
  seededAt: string; // anchor "now" used for seed generation
  users: User[];
  warehouses: Warehouse[];
  zones: Zone[];
  racks: Rack[];
  bins: Bin[];
  products: Product[];
  stock: StockRecord[];
  movements: StockMovement[];
  suppliers: Supplier[];
  customers: Customer[];
  purchaseOrders: PurchaseOrder[];
  receipts: GoodsReceipt[];
  transfers: StockTransfer[];
  orders: SalesOrder[];
  shipments: Shipment[];
  returns: ReturnRecord[];
  tasks: WarehouseTask[];
  notifications: AppNotification[];
  counters: Record<CounterKey, number>;
}

/** Outcome of a transaction function. `value` carries e.g. the created record id. */
export type Result<T = void> = { ok: true; value: T } | { ok: false; error: string };
