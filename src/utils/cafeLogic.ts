import { DAILY_SALES_BY_RANGE } from '../data/cafeSeedData';
import {
  CafeOrder,
  CampaignFilter,
  CartItem,
  CustomerProfile,
  CustomerSegment,
  DailyOrderVolumePoint,
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
  pointsDiscount?: number;
  pointsRedeemed?: number;
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
  isPosTerminal = false,
  campaigns?: PromoCampaign[],
  redeemPoints = 0
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
    const matchingCampaign = campaigns?.find(
      (c) => c.code.trim().toUpperCase() === normalizedCoupon
    );
    if (matchingCampaign && matchingCampaign.status !== 'active') {
      couponError = `Promo code ${normalizedCoupon} is currently ${matchingCampaign.status} and cannot be applied.`;
    } else if (normalizedCoupon === 'CAFE50') {
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
    } else if (matchingCampaign && matchingCampaign.status === 'active') {
      discount = Math.round(subtotal * 0.1);
      discountLabel = `${matchingCampaign.title} (${normalizedCoupon})`;
      couponApplied = true;
    } else {
      couponError = 'Invalid code. Try CAFE50, SAW10, or BOGO2025';
    }
  }

  // Loyalty Points Redemption (2 pts = ₹1 discount, capped at 50% subtotal)
  let pointsDiscount = 0;
  let pointsRedeemed = 0;
  if (redeemPoints > 0) {
    const maxRedemption = Math.floor((subtotal - discount) * 0.5);
    const potentialDiscount = Math.floor(redeemPoints * 0.5);
    pointsDiscount = Math.max(0, Math.min(maxRedemption, potentialDiscount));
    pointsRedeemed = pointsDiscount * 2;
    discount += pointsDiscount;
  }

  const taxable = Math.max(0, subtotal - discount);
  // Menu prices are GST-inclusive (5% GST composition: 2.5% CGST + 2.5% SGST)
  // Included tax = (taxable * 5) / 105
  const tax = Number(((taxable * 5) / 105).toFixed(2));
  const roundedTotal = Math.max(0, Math.round(taxable));
  const roundOff = Number((roundedTotal - taxable).toFixed(2));
  const total = Math.max(0, roundedTotal);

  return {
    itemCount,
    subtotal,
    discount,
    discountLabel,
    pointsDiscount: pointsDiscount > 0 ? pointsDiscount : undefined,
    pointsRedeemed: pointsRedeemed > 0 ? pointsRedeemed : undefined,
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
    case 'accepted':
      return 'preparing';
    case 'preparing':
      return 'ready';
    case 'ready':
      return 'served';
    case 'served':
      return 'served';
    case 'paid':
      return 'paid';
    case 'cancelled':
      return 'cancelled';
    default:
      return 'served';
  }
}

/**
 * Determines whether an order should be actively displayed and prepared in the kitchen.
 * If an order was placed for online UPI payment, it is held in pending
 * and NOT sent to the kitchen until payment is verified ('paid').
 * Pay on Counter (cash) and POS terminal orders are active immediately.
 */
export function isKitchenActiveOrder(order: CafeOrder): boolean {
  if (order.status === 'served') return false;
  // If order is refunded or cancelled, do not display in kitchen
  if (order.paymentStatus === 'refunded' || order.paymentStatus === 'cancelled') {
    return false;
  }
  if (order.paymentMode === 'upi' && order.paymentStatus !== 'paid') {
    return false;
  }
  return true;
}

export interface KotCardPhaseInfo {
  phase: 'pending' | 'prepared';
  checkedCount: number;
  totalCount: number;
  completionPct: number;
  allItemsChecked: boolean;
}

export function deriveKotCardPhase(
  order: Pick<CafeOrder, 'status' | 'items'>
): KotCardPhaseInfo {
  const totalCount = order.items.length;
  const checkedCount = order.items.filter((i) => Boolean(i.checked)).length;
  const allItemsChecked = totalCount > 0 && checkedCount === totalCount;
  const isPrepared = order.status === 'ready' || order.status === 'served';

  const baseStatusPct =
    order.status === 'placed' ? 14 : order.status === 'preparing' ? 45 : 100;
  const itemPct = totalCount > 0 ? Math.round((checkedCount / totalCount) * 100) : 0;
  const completionPct = isPrepared
    ? 100
    : Math.min(95, Math.max(baseStatusPct, itemPct));

  return {
    phase: isPrepared ? 'prepared' : 'pending',
    checkedCount,
    totalCount,
    completionPct,
    allItemsChecked,
  };
}

export function filterMenuItems(
  items: MenuItem[],
  category: MenuCategory,
  searchQuery: string
): MenuItem[] {
  const q = searchQuery.trim().toLowerCase();
  return items.filter((item) => {
    let matchesCategory = false;
    if (category === 'All') {
      matchesCategory = true;
    } else if (category === 'Best Sellers') {
      matchesCategory = Boolean(item.isBestSeller);
    } else if (category === 'Drink') {
      matchesCategory = item.category === 'Drink' || item.category === 'Beverages';
    } else if (category === 'Dessert') {
      matchesCategory = item.category === 'Dessert' || item.category === 'Desserts';
    } else {
      matchesCategory = item.category === category;
    }

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
  const activeOrders = orders.filter((o) => o.paymentStatus !== 'cancelled');
  const refundedOrders = orders.filter((o) => o.paymentStatus === 'refunded');
  const refundedAmount = refundedOrders.reduce(
    (acc, o) => acc + (o.refundAmount || o.total),
    0
  );
  const liveOrdersCount = activeOrders.filter((o) => o.paymentStatus !== 'refunded').length;
  const liveRevenue = activeOrders
    .filter((o) => o.paymentStatus !== 'refunded')
    .reduce((acc, o) => acc + o.total, 0);

  const totalOrders = baseline.baseOrders + liveOrdersCount;
  const totalRevenue = Math.max(0, baseline.baseRevenue + liveRevenue);
  const avgOrderValue = totalOrders > 0 ? Math.round(totalRevenue / totalOrders) : 0;
  const customers = baseline.baseCustomers + liveOrdersCount;

  return {
    totalOrders,
    totalRevenue,
    avgOrderValue,
    customers,
    refundedCount: refundedOrders.length,
    refundedAmount,
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
  const header = ['Order ID', 'KOT', 'Mode', 'Table/Partner', 'Items', 'Status', 'Total (INR)', 'Time'];
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

export function isIngredientBelowThreshold(
  item: Pick<InventoryIngredient, 'quantity' | 'minThreshold'>
): boolean {
  return item.quantity < item.minThreshold;
}

export function getIngredientThresholdDeficit(
  item: Pick<InventoryIngredient, 'quantity' | 'minThreshold'>
): number {
  return Math.max(0, Number((item.minThreshold - item.quantity).toFixed(1)));
}

export function filterInventoryItems(
  items: InventoryIngredient[],
  tab: InventoryTab,
  query: string
): InventoryIngredient[] {
  const q = query.trim().toLowerCase();
  return items.filter((item) => {
    if (tab === 'Low Stock' && !isIngredientBelowThreshold(item)) return false;
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

const PAST_30_DAY_ORDER_COUNTS = [
  132, 148, 165, 194, 248, 212, 141, 138, 156, 174,
  208, 256, 224, 152, 144, 162, 188, 218, 264, 231,
  158, 149, 172, 196, 229, 272, 238, 164, 178, 168,
];

const SHORT_MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const SHORT_WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

export function buildPast30DaysOrderVolumeTrend(
  orders: CafeOrder[],
  referenceDate: Date = new Date()
): DailyOrderVolumePoint[] {
  const liveRevenue = orders.reduce((acc, o) => acc + o.total, 0);
  const initialSeedLiveRevenue = 1762;
  const avgSeedTicket = 128;

  const anchor = new Date(referenceDate.getFullYear(), referenceDate.getMonth(), referenceDate.getDate());
  const rawPoints = PAST_30_DAY_ORDER_COUNTS.map((baseCount, idx) => {
    const offsetDays = PAST_30_DAY_ORDER_COUNTS.length - 1 - idx;
    const d = new Date(anchor);
    d.setDate(anchor.getDate() - offsetDays);

    const shortLabel = `${d.getDate()} ${SHORT_MONTHS[d.getMonth()]}`;
    const isLatestDay = idx === PAST_30_DAY_ORDER_COUNTS.length - 1;
    const dayLabel = isLatestDay
      ? `${SHORT_WEEKDAYS[d.getDay()]}, ${shortLabel} (Today)`
      : `${SHORT_WEEKDAYS[d.getDay()]}, ${shortLabel}`;

    const ordersCount = isLatestDay ? baseCount + orders.length : baseCount;
    const revenue = isLatestDay
      ? Math.max(0, baseCount * avgSeedTicket - initialSeedLiveRevenue) + liveRevenue
      : baseCount * avgSeedTicket;

    return {
      day: dayLabel,
      shortLabel,
      ordersCount,
      revenue,
    };
  });

  const maxOrders = Math.max(...rawPoints.map((p) => p.ordersCount), 0);
  return rawPoints.map((p) => ({
    ...p,
    isPeak: maxOrders > 0 && p.ordersCount === maxOrders,
  }));
}

export function getLowInventoryItems(items: InventoryIngredient[]): InventoryIngredient[] {
  const rank = (status: InventoryStatus) =>
    status === 'Critical' ? 0 : status === 'Reorder Soon' ? 1 : 2;
  return items
    .filter((item) => isIngredientBelowThreshold(item))
    .sort((a, b) => {
      const rankDiff = rank(a.status) - rank(b.status);
      if (rankDiff !== 0) return rankDiff;
      const ratioA = a.minThreshold > 0 ? a.quantity / a.minThreshold : 1;
      const ratioB = b.minThreshold > 0 ? b.quantity / b.minThreshold : 1;
      return ratioA - ratioB;
    });
}
