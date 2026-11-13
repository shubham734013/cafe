import { DAILY_SALES_BY_RANGE } from '../data/cafeSeedData';
import {
  CafeOrder,
  CampaignFilter,
  CartItem,
  CustomerProfile,
  CustomerSegment,
  DailyRevenuePoint,
  DateRangeKey,
  InventoryIngredient,
  InventoryStatus,
  InventoryTab,
  MenuCategory,
  MenuItem,
  OrderStatus,
  PromoCampaign,
  ServiceMode,
  StaffMember,
  StaffShiftFilter,
} from '../types/cafe';

export interface CartTotals {
  itemCount: number;
  subtotal: number;
  discount: number;
  discountLabel: string | null;
  tax: number;
  roundOff: number;
  total: number;
  couponApplied: boolean;
  couponError: string | null;
}

export function calculateCartTotals(
  items: CartItem[],
  couponCode: string,
  serviceMode: ServiceMode,
  isPosTerminal = false
): CartTotals {
  const itemCount = items.reduce((sum, item) => sum + item.quantity, 0);
  const subtotal = items.reduce((sum, item) => sum + item.price * item.quantity, 0);

  if (subtotal === 0) {
    return {
      itemCount: 0,
      subtotal: 0,
      discount: 0,
      discountLabel: null,
      tax: 0,
      roundOff: 0,
      total: 0,
      couponApplied: false,
      couponError: null,
    };
  }

  let discount = 0;
  let discountLabel: string | null = null;
  let couponApplied = false;
  let couponError: string | null = null;

  const normalizedCoupon = couponCode.trim().toUpperCase();

  if (isPosTerminal) {
    if (serviceMode === 'dine-in' && subtotal >= 200) {
      discount = 20;
      discountLabel = 'Dine-In Discount';
    }
  } else if (normalizedCoupon.length > 0) {
    if (normalizedCoupon === 'CAFE50') {
      if (subtotal >= 200) {
        discount = 50;
        discountLabel = 'Special Discount (CAFE50)';
        couponApplied = true;
      } else {
        couponError = 'Add ₹' + (200 - subtotal) + ' more to apply CAFE50';
      }
    } else if (normalizedCoupon === 'SAW10') {
      discount = Math.round(subtotal * 0.1);
      discountLabel = 'Member 10% Off (SAW10)';
      couponApplied = true;
    } else if (normalizedCoupon === 'CAMPUS15') {
      if (subtotal >= 199) {
        discount = Math.round(subtotal * 0.15);
        discountLabel = 'Student Discount (CAMPUS15)';
        couponApplied = true;
      } else {
        couponError = 'Add ₹' + (199 - subtotal) + ' more to apply CAMPUS15';
      }
    } else if (normalizedCoupon === 'BOGO2025') {
      discount = Math.round(subtotal * 0.2);
      discountLabel = 'Evening Brew Promo (BOGO2025)';
      couponApplied = true;
    } else {
      couponError = 'Invalid code. Try CAFE50, SAW10, or CAMPUS15';
    }
  }

  const taxable = Math.max(0, subtotal - discount);
  const tax = isPosTerminal ? 0 : Number((taxable * 0.05).toFixed(2));
  const roundOff = isPosTerminal ? 0 : tax; // Matches the Round Off Relief design in Cart Checkout
  const total = Math.max(0, Math.round(taxable + tax - roundOff));

  return {
    itemCount,
    subtotal,
    discount,
    discountLabel,
    tax,
    roundOff,
    total,
    couponApplied,
    couponError,
  };
}

export function getNextKotStatus(status: OrderStatus): OrderStatus {
  switch (status) {
    case 'placed':
      return 'preparing';
    case 'preparing':
      return 'ready';
    case 'ready':
      return 'served';
    case 'served':
      return 'served';
  }
}

export function filterMenuItems(
  items: MenuItem[],
  category: MenuCategory,
  searchQuery: string
): MenuItem[] {
  const q = searchQuery.trim().toLowerCase();
  return items.filter((item) => {
    const matchesCategory =
      category === 'All' ||
      (category === 'Best Sellers' ? Boolean(item.isBestSeller) : item.category === category);
    if (!matchesCategory) return false;
    if (!q) return true;
    return (
      item.name.toLowerCase().includes(q) ||
      item.description.toLowerCase().includes(q) ||
      item.category.toLowerCase().includes(q)
    );
  });
}

export function filterOrders(
  orders: CafeOrder[],
  channelFilter: 'all' | ServiceMode,
  searchQuery: string
): CafeOrder[] {
  const q = searchQuery.trim().toLowerCase();
  return orders.filter((order) => {
    const matchesChannel = channelFilter === 'all' || order.serviceMode === channelFilter;
    if (!matchesChannel) return false;
    if (!q) return true;
    const itemText = order.items.map((i) => i.name.toLowerCase()).join(' ');
    return (
      order.id.toLowerCase().includes(q) ||
      (order.tableNumber ?? '').toLowerCase().includes(q) ||
      (order.deliveryPartner ?? '').toLowerCase().includes(q) ||
      itemText.includes(q)
    );
  });
}

export function computeDashboardMetrics(orders: CafeOrder[], range: DateRangeKey) {
  const baseline = DAILY_SALES_BY_RANGE[range];
  const liveOrdersCount = orders.length;
  const liveRevenue = orders.reduce((acc, o) => acc + o.total, 0);

  const totalOrders = baseline.baseOrders + liveOrdersCount;
  const totalRevenue = baseline.baseRevenue + liveRevenue;
  const avgOrderValue = totalOrders > 0 ? Math.round(totalRevenue / totalOrders) : 0;
  const customers = baseline.baseCustomers + liveOrdersCount;

  return {
    totalOrders,
    totalRevenue,
    avgOrderValue,
    customers,
    ordersDelta: baseline.ordersDelta,
    revDelta: baseline.revDelta,
    aovDelta: baseline.aovDelta,
    custDelta: baseline.custDelta,
    peakLabel: baseline.peakLabel,
    bars: baseline.bars,
  };
}

export function formatINR(amount: number): string {
  return `₹${amount.toLocaleString('en-IN')}`;
}

export function formatOrderCsv(orders: CafeOrder[]): string {
  const header = ['Order ID', 'KOT', 'Mode', 'Table/Partner', 'Items', 'Status', 'Payment', 'Total (INR)', 'Time'];
  const rows = orders.map((order) => {
    const location =
      order.serviceMode === 'dine-in'
        ? `Table ${order.tableNumber || 'T1'}`
        : order.deliveryPartner || 'Takeaway';
    const itemsSummary = order.items.map((i) => `${i.quantity}x ${i.name}`).join('; ');
    return [
      order.id,
      order.kotNumber,
      order.serviceMode,
      location,
      `"${itemsSummary.replace(/"/g, '""')}"`,
      order.status,
      order.paymentMode.toUpperCase(),
      String(order.total),
      order.createdAtLabel,
    ].join(',');
  });
  return [header.join(','), ...rows].join('\n');
}

export function computeInventoryStatus(quantity: number, minThreshold: number): InventoryStatus {
  if (quantity <= minThreshold * 0.8) return 'Critical';
  if (quantity <= minThreshold) return 'Reorder Soon';
  return 'Good';
}

export function restockIngredientItem(
  items: InventoryIngredient[],
  id: string,
  addedQty?: number
): InventoryIngredient[] {
  return items.map((item) => {
    if (item.id !== id) return item;
    const defaultRestock = item.unit === 'g' ? 1000 : item.unit === 'pcs' ? 10 : 2.5;
    const nextQty = Number((item.quantity + (addedQty ?? defaultRestock)).toFixed(1));
    const nextMax = Math.max(item.maxCapacity, nextQty);
    const fillPct = Math.min(100, Math.round((nextQty / nextMax) * 100));
    const status = computeInventoryStatus(nextQty, item.minThreshold);
    return {
      ...item,
      quantity: nextQty,
      maxCapacity: nextMax,
      fillPct,
      status,
      movementType: 'in',
    };
  });
}

export function filterInventoryItems(
  items: InventoryIngredient[],
  tab: InventoryTab,
  query: string
): InventoryIngredient[] {
  const q = query.trim().toLowerCase();
  return items.filter((item) => {
    if (tab === 'Stock In' && item.movementType !== 'in') return false;
    if (tab === 'Stock Out' && item.movementType !== 'out') return false;
    if (!q) return true;
    return (
      item.name.toLowerCase().includes(q) ||
      item.subtitle.toLowerCase().includes(q) ||
      item.supplier.toLowerCase().includes(q)
    );
  });
}

export function filterCustomers(
  customers: CustomerProfile[],
  segment: CustomerSegment,
  query: string
): CustomerProfile[] {
  const q = query.trim().toLowerCase();
  return customers.filter((c) => {
    if (segment !== 'all' && c.segment !== segment) return false;
    if (!q) return true;
    return (
      c.name.toLowerCase().includes(q) ||
      c.phone.toLowerCase().includes(q) ||
      c.favorites.toLowerCase().includes(q)
    );
  });
}

export function filterCampaigns(
  campaigns: PromoCampaign[],
  filter: CampaignFilter
): PromoCampaign[] {
  if (filter === 'all') return campaigns;
  return campaigns.filter((c) => c.status === filter);
}

export function filterStaffRoster(
  staff: StaffMember[],
  filter: StaffShiftFilter
): StaffMember[] {
  switch (filter) {
    case 'all':
      return staff;
    case 'active':
      return staff.filter((s) => s.isOnDuty);
    case 'morning':
      return staff.filter((s) => s.shiftBucket === 'morning');
    case 'fullday':
      return staff.filter((s) => s.shiftBucket === 'fullday');
  }
}

const PAST_7_DAY_ORDER_COUNTS = [104, 146, 189, 212, 152, 268, 172];

export function buildPast7DaysRevenueTrend(orders: CafeOrder[]): DailyRevenuePoint[] {
  const sevenDayBars = DAILY_SALES_BY_RANGE['Last 7 Days'].bars;
  const liveRevenue = orders.reduce((acc, o) => acc + o.total, 0);
  const initialSeedLiveRevenue = 1762;

  return sevenDayBars.map((bar, idx) => {
    const isLatestDay = idx === sevenDayBars.length - 1;
    const baseRevenue = isLatestDay
      ? Math.max(0, bar.amount - initialSeedLiveRevenue)
      : bar.amount;
    const revenue = isLatestDay ? baseRevenue + liveRevenue : baseRevenue;
    const ordersCount = isLatestDay
      ? PAST_7_DAY_ORDER_COUNTS[idx] + orders.length
      : PAST_7_DAY_ORDER_COUNTS[idx];

    return {
      day: bar.day,
      shortLabel: bar.shortLabel,
      revenue,
      ordersCount,
      isPeak: bar.isPeak,
    };
  });
}

export function getLowInventoryItems(items: InventoryIngredient[]): InventoryIngredient[] {
  const rank = (status: InventoryStatus) =>
    status === 'Critical' ? 0 : status === 'Reorder Soon' ? 1 : 2;
  return items
    .filter((item) => item.quantity < item.minThreshold)
    .sort((a, b) => {
      const rankDiff = rank(a.status) - rank(b.status);
      if (rankDiff !== 0) return rankDiff;
      const ratioA = a.minThreshold > 0 ? a.quantity / a.minThreshold : 1;
      const ratioB = b.minThreshold > 0 ? b.quantity / b.minThreshold : 1;
      return ratioA - ratioB;
    });
}
