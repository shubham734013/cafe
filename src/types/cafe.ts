import type { PaymentOrderSyncStatus } from '../payments/types';
import type { UpiAppId } from '../payments/upiUri';

export type WorkspaceMode = 'customer' | 'staff';

export type StaffRole = 'owner' | 'manager' | 'cashier' | 'barista' | 'server';

export interface AuthSessionState {
  authenticated: boolean;
  session: {
    role: StaffRole;
    staffName: string;
    issuedAt: number;
    exp: number;
  } | null;
}

export type CustomerScreenId = 'home' | 'menu' | 'cart' | 'tracking' | 'rewards';
export type StaffScreenId =
  | 'pos-terminal'
  | 'kitchen-display-system'
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
export type OrderStatus = 'placed' | 'preparing' | 'ready' | 'served';
export type MenuCategory = 'All' | 'Best Sellers' | 'Beverages' | 'Snacks' | 'Meals' | 'Combos' | 'Desserts';
export type DateRangeKey = 'Today' | 'Last 7 Days' | 'This Month' | 'Quarter to Date';
export type ReportCategory = 'Sales Report' | 'Item Report' | 'Inventory Report' | 'Customer Report' | 'Staff Performance';

export type InventoryTab = 'Inventory' | 'Low Stock' | 'Ingredients' | 'Stock In' | 'Stock Out' | 'Suppliers';
export type InventoryStatus = 'Good' | 'Reorder Soon' | 'Critical';

export type TableFloor = 'Floor 1 (Main Hall)' | 'Floor 2 (Rooftop)' | 'Outdoor Patio';
export type TableStatus = 'available' | 'occupied' | 'preparing' | 'reserved';

export type CustomerSegment = 'all' | 'vip' | 'loyal' | 'regular' | 'new' | 'risk';
export type CampaignFilter = 'all' | 'active' | 'scheduled' | 'paused' | 'expired';
export type StaffShiftFilter = 'all' | 'active' | 'morning' | 'fullday';

export interface MenuItem {
  id: string;
  name: string;
  description: string;
  price: number;
  category: Exclude<MenuCategory, 'All' | 'Best Sellers'>;
  rating: number;
  isVeg: boolean;
  isBestSeller?: boolean;
  station: 'Barista' | 'Grill' | 'Fryer' | 'Cold Bar' | 'Kitchen';
  defaultNote: string;
  imageUrl: string;
  unitsSold: number;
}

export interface CartItem {
  menuItemId: string;
  name: string;
  price: number;
  quantity: number;
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
  serviceMode: ServiceMode;
  tableNumber?: string;
  deliveryPartner?: string;
  riderNote?: string;
  items: CartItem[];
  subtotal: number;
  discount: number;
  tax: number;
  total: number;
  paymentMode: PaymentMode;
  paymentStatus?: PaymentOrderSyncStatus;
  paymentId?: string;
  customerId?: string;
  paymentRef?: string;
  preferredUpiApp?: UpiAppId;
  paymentChannelLabel?: string;
  cardDetails?: CardPaymentMetadata;
  loyaltyPointsAwarded?: number;
  status: OrderStatus;
  createdAtLabel: string;
  elapsedMinutes: number;
  isUrgent?: boolean;
  serverName?: string;
  cookingNote?: string;
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
