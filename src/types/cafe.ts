export type WorkspaceMode = 'customer' | 'staff';

export type StaffRole =
  | 'super-admin'
  | 'owner'
  | 'manager'
  | 'cashier'
  | 'barista'
  | 'server'
  | 'kitchen'
  | 'waiter';

export interface AuthSessionState {
  authenticated: boolean;
  session: {
    role: StaffRole;
    staffName: string;
    issuedAt: number;
    exp: number;
  } | null;
}
export type CustomerScreenId = 'home' | 'menu' | 'cart' | 'tracking' | 'rewards' | 'profile' | 'login';
export type StaffScreenId =
  | 'staff-home'
  | 'pos-terminal'
  | 'pos-orders'
  | 'kitchen-display-system'
  | 'kitchen-tables'
  | 'admin-dashboard'
  | 'order-management'
  | 'reports-analytics'
  | 'table-layout'
  | 'inventory-stock'
  | 'crm-customers'
  | 'loyalty-rewards'
  | 'offers-campaigns'
  | 'staff-roles'
  | 'settings-cafe-profile';

export type ScreenId = 'splash' | CustomerScreenId | StaffScreenId;

export type ServiceMode = 'dine-in' | 'takeaway' | 'delivery';
export type PaymentMode = 'upi' | 'cash' | 'card';
export type CardNetwork = 'Visa' | 'Mastercard' | 'RuPay' | 'Amex';
export type CardMethodType = 'edc_table' | 'online_card';
export type OrderStatus =
  | 'placed'
  | 'accepted'
  | 'preparing'
  | 'ready'
  | 'served'
  | 'paid'
  | 'cancelled';
export type MenuCategory =
  | 'All'
  | 'Best Sellers'
  | 'Beverages'
  | 'Snacks'
  | 'Meals'
  | 'Combos'
  | 'Desserts'
  | 'Pizza'
  | 'Burger'
  | 'Pasta'
  | 'Salad'
  | 'Drink'
  | 'Dessert';
export type DateRangeKey = 'Today' | 'Last 7 Days' | 'Last 30 Days' | 'This Month' | 'Quarter to Date';
export type ReportCategory = 'Sales Report' | 'Item Report' | 'Inventory Report' | 'Customer Report' | 'Staff Roster';

export type InventoryTab =
  | 'Inventory'
  | 'Low Stock'
  | 'Ingredients'
  | 'Stock In'
  | 'Stock Out'
  | 'Suppliers'
  | 'Movements'
  | 'Purchase Orders'
  | 'Batches'
  | 'Waste'
  | 'Stock Counts';
export type InventoryStatus = 'Good' | 'Reorder Soon' | 'Critical';

export type TableFloor = 'Floor 1 (Main Hall)' | 'Floor 2 (Rooftop)' | 'Outdoor Patio';
export type TableStatus = 'available' | 'occupied' | 'preparing' | 'reserved';

export type CustomerSegment = 'all' | 'vip' | 'loyal' | 'regular' | 'new' | 'risk';
export type CampaignFilter = 'all' | 'active' | 'scheduled' | 'paused' | 'expired';
export type StaffShiftFilter = 'all' | 'active' | 'morning' | 'fullday';

export interface RecipeBurnItem {
  ingredientId: string;
  amount: number;
  amountUnit?: 'g' | 'kg' | 'ml' | 'L' | 'pcs';
}

export interface MenuItem {
  id: string;
  name: string;
  description: string;
  price: number;
  category: Exclude<MenuCategory, 'All' | 'Best Sellers'>;
  rating: number;
  isVeg: boolean;
  isBestSeller?: boolean;
  isAvailable?: boolean;
  station: 'Barista' | 'Grill' | 'Fryer' | 'Cold Bar' | 'Kitchen';
  defaultNote: string;
  imageUrl: string;
  unitsSold: number;
  reviewsCount?: number;
  recipe?: RecipeBurnItem[];
}

export interface CartItem {
  menuItemId: string;
  name: string;
  price: number;
  quantity: number;
  size?: 'Small' | 'Medium' | 'Large';
  note: string;
  imageUrl: string;
  station: MenuItem['station'];
  checked?: boolean;
}

export interface CardPaymentMetadata {
  method: CardMethodType;
  network?: CardNetwork;
  last4?: string;
  holderName?: string;
  authCode?: string;
  status: 'pending' | 'settled' | 'failed' | 'refunded';
}

export interface CafeOrder {
  id: string;
  kotNumber: string;
  isPosTerminal?: boolean;
  serviceMode: ServiceMode;
  tableNumber?: string;
  deliveryPartner?: string;
  riderNote?: string;
  items: CartItem[];
  subtotal: number;
  discount: number;
  tax: number;
  total: number;
  paymentMode?: PaymentMode;
  paymentStatus?: 'unpaid' | 'pending' | 'observed' | 'paid' | 'manual_review' | 'failed' | 'expired' | 'cancelled' | 'refunded';
  paymentProvider?: 'upi-gateway';
  gatewayOrderId?: string;
  gatewayClientOrderId?: string;
  customerId?: string;
  paymentRef?: string;
  paymentChannelLabel?: string;
  cardDetails?: CardPaymentMetadata;
  loyaltyPointsAwarded?: number;
  pointsDiscount?: number;
  pointsRedeemed?: number;
  status: OrderStatus;
  createdAtLabel: string;
  createdAt?: string;
  elapsedMinutes: number;
  isUrgent?: boolean;
  serverName?: string;
  cookingNote?: string;
  rating?: number;
  feedbackTags?: string[];
  feedbackComment?: string;
  refundAmount?: number;
  refundReason?: string;
  refundedAt?: string;
  refundedBy?: string;
}

export interface CafeActivityLogItem {
  id: string;
  type:
    | 'order_created'
    | 'order_paid'
    | 'order_advanced'
    | 'order_refunded'
    | 'stock_updated'
    | 'table_updated'
    | 'feedback_received'
    | 'campaign_toggled';
  title: string;
  description: string;
  actorName: string;
  actorRole?: string;
  timestamp: string;
  severity: 'info' | 'success' | 'warning' | 'error';
  orderId?: string;
  amount?: number;
}

export interface CafeTable {
  id: string;
  label: string;
  seats: number;
  zone: string;
  floor: TableFloor;
  status: TableStatus;
  activeOrderId?: string;
  elapsedLabel?: string;
  billReady?: boolean;
  reservedBy?: string;
  reservedTime?: string;
  reservedPartySize?: number;
}

export interface InventoryIngredient {
  id: string;
  name: string;
  quantity: number;
  unit: string;
  minThreshold: number;
  maxCapacity: number;
  subtitle: string;
  supplier: string;
  status: InventoryStatus;
  fillPct: number;
  icon: string;
  unitCost: number;
  movementType: 'in' | 'out';
  reorderRequested?: boolean;
  reorderRequestedAt?: string;
  reorderNote?: string;
}

export type StockMovementType =
  | 'receipt'
  | 'issue'
  | 'sale'
  | 'waste'
  | 'transfer'
  | 'stock_count'
  | 'refund'
  | 'adjustment';

export interface StockMovement {
  id: string;
  ingredientId: string;
  ingredientName: string;
  type: StockMovementType;
  quantityDelta: number;
  beforeQuantity: number;
  afterQuantity: number;
  unit: string;
  unitCost: number;
  referenceId?: string;
  note?: string;
  actorName?: string;
  createdAt: string;
}

export interface InventoryBatch {
  id: string;
  ingredientId: string;
  ingredientName: string;
  batchNumber: string;
  quantity: number;
  unit: string;
  unitCost: number;
  receivedAt: string;
  expiryDate?: string;
  supplier?: string;
  status: 'active' | 'consumed' | 'expired';
}

export interface PurchaseOrderLine {
  ingredientId: string;
  ingredientName: string;
  orderedQuantity: number;
  receivedQuantity: number;
  unit: string;
  unitCost: number;
}

export interface PurchaseOrder {
  id: string;
  supplier: string;
  status: 'draft' | 'ordered' | 'partially_received' | 'received' | 'cancelled';
  lines: PurchaseOrderLine[];
  createdAt: string;
  receivedAt?: string;
  note?: string;
}

export interface StockCountLine {
  ingredientId: string;
  ingredientName: string;
  systemQuantity: number;
  physicalQuantity: number;
  variance: number;
  unit: string;
  unitCost: number;
}

export interface StockCount {
  id: string;
  status: 'draft' | 'approved';
  lines: StockCountLine[];
  createdAt: string;
  approvedAt?: string;
  note?: string;
}

export interface CustomerProfile {
  id: string;
  initials: string;
  name: string;
  phone: string;
  segment: Exclude<CustomerSegment, 'all'>;
  visits: number;
  totalSpent: number;
  avgTicket: number;
  favorites: string;
  lastVisit: string;
  note?: string;
  loyaltyPoints?: number;
}

export interface LoyaltyRule {
  id: string;
  title: string;
  badge: string;
  headline: string;
  description: string;
  icon: string;
  tone: 'primary' | 'tertiary' | 'secondary' | 'amber';
}

export interface PointLedgerEntry {
  id: string;
  orderId?: string;
  initials: string;
  customerName: string;
  context: string;
  pointsDelta: number;
  note: string;
}

export interface PromoCampaign {
  id: string;
  title: string;
  code: string;
  status: Exclude<CampaignFilter, 'all'>;
  validityLabel: string;
  description: string;
  usedLabel: string;
  revenueLabel?: string;
  icon: string;
  tone: 'primary' | 'secondary' | 'tertiary';
  targetSegment?: CustomerSegment;
}

export interface StaffMember {
  id: string;
  initials: string;
  name: string;
  role: string;
  roleIcon: string;
  shiftLabel: string;
  shiftBucket: Exclude<StaffShiftFilter, 'all' | 'active'> | 'afternoon' | 'evening';
  isOnDuty: boolean;
  dutyStatus?: 'on_duty' | 'off_duty';
  phone?: string;
  statLeft: string;
  statRight: string;
  stationBadge: string;
  stationIcon: string;
}

export interface CafeSettings {
  cafeName: string;
  subCategory: string;
  address: string;
  phone: string;
  email: string;
  operatingHours: string;
  gstin: string;
  serviceChargePct: number;
  qrOrderingEnabled: boolean;
  managerPinRequired: boolean;
  kotPrinterConnected: boolean;
  posPrinterConnected: boolean;
  upiVpa?: string;
  upiPayeeName?: string;
}

export interface DailyRevenuePoint {
  day: string;
  shortLabel: string;
  revenue: number;
  ordersCount: number;
  isPeak?: boolean;
}

export interface DailyOrderVolumePoint {
  day: string;
  shortLabel: string;
  ordersCount: number;
  revenue: number;
  isPeak?: boolean;
}

export interface CustomerReview {
  id: string;
  customerName: string;
  avatarUrl?: string;
  initials?: string;
  rating: number; // 1 to 5
  comment: string;
  tags?: string[];
  dishName?: string;
  dishImage?: string;
  diningMode?: string;
  isVerified?: boolean;
  dateLabel: string;
  likesCount?: number;
}
