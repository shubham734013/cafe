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

const BUILT_IN_CAMPAIGN_RULES: Record<string, Partial<PromoCampaign>> = {
  BDAY800: {
    offerType: 'manual',
    minimumOrderAmount: 800,
    manualRedemptionMessage: 'Book this birthday offer with cafe staff; it is not an automatic cart discount.',
  },
  BUY5GET1: {
    offerType: 'buy_x_get_y',
    qualifyingMenuItemId: 'cold-coffee',
    qualifyingSize: 'Medium',
    buyQuantity: 5,
    freeQuantity: 1,
    freeItemPrice: 30,
  },
  FREEICECREAM: {
    offerType: 'manual',
    manualRedemptionMessage: 'Follow and review proof must be checked by cafe staff before redeeming this offer.',
  },
  FREEDEL249: {
    offerType: 'manual',
    minimumOrderAmount: 249,
    manualRedemptionMessage: 'Delivery distance must be verified by cafe staff before free delivery can be applied.',
  },
  'CUSTOM-COMBO': {
    offerType: 'manual',
    manualRedemptionMessage: 'Contact cafe staff to arrange this custom combo.',
  },
  FIRSTBITE: { offerType: 'first_order_percentage', discountPercentage: 20 },
  CAMPUS15: {
    offerType: 'manual',
    discountPercentage: 15,
    minimumOrderAmount: 199,
    manualRedemptionMessage: 'Show a valid college ID to cafe staff to redeem this student offer.',
  },
};

function getCampaignOfferType(campaign: PromoCampaign): NonNullable<PromoCampaign['offerType']> {
  const code = campaign.code.trim().toUpperCase();
  return (
    campaign.offerType ??
    BUILT_IN_CAMPAIGN_RULES[code]?.offerType ??
    (campaign.discountPercentage ? 'percentage' : 'manual')
  );
}

export function isCampaignAutomaticallyRedeemable(campaign: PromoCampaign): boolean {
  return getCampaignOfferType(campaign) !== 'manual';
}

export function calculateCartTotals(
  items: CartItem[],
  couponCode: string,
  serviceMode: ServiceMode,
  isPosTerminal = false,
  campaigns?: PromoCampaign[],
  redeemPoints = 0,
  firstOrderEligible = false
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
    if (matchingCampaign?.status === 'active') {
      const legacyRule = BUILT_IN_CAMPAIGN_RULES[normalizedCoupon];
      const offerType = getCampaignOfferType(matchingCampaign);
      const minimumOrderAmount =
        matchingCampaign.minimumOrderAmount ?? legacyRule?.minimumOrderAmount ?? 0;
      const discountPercentage =
        matchingCampaign.discountPercentage ?? legacyRule?.discountPercentage ?? 0;

      if (subtotal < minimumOrderAmount) {
        couponError = `This offer requires a minimum order of ₹${minimumOrderAmount}.`;
      } else if (offerType === 'percentage' || offerType === 'first_order_percentage') {
        if (offerType === 'first_order_percentage' && !firstOrderEligible) {
          couponError = 'This promo code is only valid on your first order.';
        } else if (
          !Number.isFinite(discountPercentage) ||
          discountPercentage <= 0 ||
          discountPercentage > 100
        ) {
          couponError = 'This promo code does not have a valid bill discount configured.';
        } else {
          discount = Math.round((subtotal * discountPercentage) / 100);
          discountLabel = `${matchingCampaign.title} (${discountPercentage}% off)`;
          couponApplied = true;
        }
      } else if (offerType === 'buy_x_get_y') {
        const qualifyingMenuItemId =
          matchingCampaign.qualifyingMenuItemId ?? legacyRule?.qualifyingMenuItemId;
        const qualifyingSize = matchingCampaign.qualifyingSize ?? legacyRule?.qualifyingSize;
        const buyQuantity = matchingCampaign.buyQuantity ?? legacyRule?.buyQuantity ?? 0;
        const freeQuantity = matchingCampaign.freeQuantity ?? legacyRule?.freeQuantity ?? 0;
        const freeItemPrice = matchingCampaign.freeItemPrice ?? legacyRule?.freeItemPrice ?? 0;
        const qualifyingQuantity = items.reduce(
          (quantity, item) =>
            item.menuItemId === qualifyingMenuItemId &&
            item.size?.trim().toLowerCase() === qualifyingSize?.trim().toLowerCase()
              ? quantity + item.quantity
              : quantity,
          0
        );

        if (
          !qualifyingMenuItemId ||
          !qualifyingSize ||
          buyQuantity <= 0 ||
          freeQuantity <= 0 ||
          freeItemPrice <= 0
        ) {
          couponError = 'This offer is not configured correctly. Please ask cafe staff for help.';
        } else if (qualifyingQuantity < buyQuantity) {
          couponError = `Add ${buyQuantity - qualifyingQuantity} more ${qualifyingSize} Cold Coffees to use this offer.`;
        } else {
          discount = Math.min(
            subtotal,
            Math.floor(qualifyingQuantity / buyQuantity) * freeQuantity * freeItemPrice
          );
          discountLabel = `${matchingCampaign.title} (free Cold Coffee)`;
          couponApplied = true;
        }
      } else {
        couponError =
          matchingCampaign.manualRedemptionMessage ??
          legacyRule?.manualRedemptionMessage ??
          'This offer requires staff verification and cannot be applied automatically.';
      }
    } else {
      couponError = 'This promo code is invalid or inactive.';
    }
  } else if (firstOrderEligible) {
    discount = Math.round(subtotal * 0.2);
    discountLabel = 'First Order Offer (20%)';
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
  const activeItems = order.items.filter((i) => i.status !== 'cancelled');
  const totalCount = activeItems.length > 0 ? activeItems.length : order.items.length;
  const checkedCount = activeItems.length > 0
    ? activeItems.filter((i) => Boolean(i.checked)).length
    : order.items.filter((i) => Boolean(i.checked)).length;
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
    } else if (item.category === category) {
      matchesCategory = true;
    } else if (category === 'Burger' || category === 'Burgers') {
      matchesCategory = item.category === 'Burger' || item.category === 'Burgers';
    } else if (category === 'Drink' || category === 'Beverages') {
      matchesCategory =
        item.category === 'Drink' ||
        item.category === 'Beverages' ||
        item.category === 'Cold Coffee' ||
        item.category === 'Hot Beverages' ||
        item.category === 'Shakes';
    } else if (category === 'Snacks') {
      matchesCategory =
        item.category === 'Snacks' ||
        item.category === 'Fries & Momos' ||
        item.category === 'Maggi' ||
        item.category === 'Sandwiches' ||
        item.category === 'Special Bread Pizza';
    } else if (category === 'Dessert' || category === 'Desserts') {
      matchesCategory = item.category === 'Dessert' || item.category === 'Desserts' || item.category === 'Shakes';
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
  const activeOrders = orders.filter(
    (order) => order.paymentStatus !== 'cancelled' && isOrderWithinRange(order, range)
  );
  const refundedOrders = activeOrders.filter((order) => order.paymentStatus === 'refunded');
  const refundedAmount = refundedOrders.reduce(
    (acc, o) => acc + (o.refundAmount || o.total),
    0
  );
  const liveOrdersCount = activeOrders.filter((o) => o.paymentStatus !== 'refunded').length;
  const liveRevenue = activeOrders
    .filter((o) => o.paymentStatus !== 'refunded')
    .reduce((acc, o) => acc + o.total, 0);
  const totalOrders = liveOrdersCount;
  const totalRevenue = liveRevenue;
  const avgOrderValue = totalOrders > 0 ? Math.round(totalRevenue / totalOrders) : 0;
  const customers = new Set(
    activeOrders
      .filter((order) => order.paymentStatus !== 'refunded')
      .map((order) => order.customerId)
      .filter((customerId): customerId is string => Boolean(customerId))
  ).size;
  const bars = buildPast7DaysRevenueTrend(orders);
  const peak = bars.reduce(
    (highest, bar) => (bar.revenue > highest.revenue ? bar : highest),
    bars[0]
  );

  const grossSales = liveRevenue + refundedAmount;

  return {
    totalOrders,
    totalRevenue,
    grossSales,
    avgOrderValue,
    customers,
    refundedCount: refundedOrders.length,
    refundedAmount,
    peakLabel: peak.revenue > 0 ? `${formatINR(peak.revenue)} Peak` : 'No sales yet',
    bars,
  };
}

function isOrderWithinRange(order: CafeOrder, range: DateRangeKey, now = new Date()): boolean {
  if (!order.createdAt) return false;
  const createdAt = new Date(order.createdAt);
  if (Number.isNaN(createdAt.getTime())) return false;

  const rangeStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  if (range === 'Last 7 Days') {
    rangeStart.setDate(rangeStart.getDate() - 6);
  } else if (range === 'Last 30 Days') {
    rangeStart.setDate(rangeStart.getDate() - 29);
  } else if (range === 'This Month') {
    rangeStart.setDate(1);
  } else if (range === 'Quarter to Date') {
    rangeStart.setMonth(Math.floor(now.getMonth() / 3) * 3, 1);
  }
  return createdAt >= rangeStart && createdAt <= now;
}

export function formatINR(amount: number): string {
  return `₹${amount.toLocaleString('en-IN')}`;
}

function sanitizeCsvCell(val: string): string {
  const trimmed = val.trim();
  const needsFormulaEscape = /^[=+\-@\t\r]/.test(trimmed);
  const safe = needsFormulaEscape ? `'${trimmed}` : trimmed;
  if (needsFormulaEscape || safe.includes(',') || safe.includes('"') || safe.includes('\n')) {
    return `"${safe.replace(/"/g, '""')}"`;
  }
  return safe;
}

export function formatOrderCsv(orders: CafeOrder[]): string {
  const header = ['Order ID', 'KOT', 'Mode', 'Table/Partner', 'Items', 'Status', 'Total (INR)', 'Time'];
  const rows = orders.map((order) => {
    const location =
      order.serviceMode === 'dine-in'
        ? order.tableNumber
          ? `Table ${order.tableNumber}`
          : 'Dine-In'
        : order.deliveryPartner || 'Takeaway';
    const itemsSummary = order.items.map((i) => `${i.quantity}x ${i.name}`).join('; ');
    return [
      sanitizeCsvCell(order.id),
      sanitizeCsvCell(order.kotNumber),
      sanitizeCsvCell(order.serviceMode),
      sanitizeCsvCell(location),
      sanitizeCsvCell(itemsSummary),
      sanitizeCsvCell(order.status),
      String(order.total),
      sanitizeCsvCell(order.createdAtLabel),
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

const SHORT_MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const SHORT_WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

function dateKey(date: Date): string {
  return `${date.getFullYear()}-${date.getMonth()}-${date.getDate()}`;
}

function getOrdersForDay(orders: CafeOrder[], day: Date): CafeOrder[] {
  const key = dateKey(day);
  return orders.filter((order) => {
    if (!order.createdAt) return false;
    const createdAt = new Date(order.createdAt);
    return !Number.isNaN(createdAt.getTime()) && dateKey(createdAt) === key;
  });
}

export function buildPast7DaysRevenueTrend(
  orders: CafeOrder[],
  referenceDate: Date = new Date()
): DailyRevenuePoint[] {
  const start = new Date(
    referenceDate.getFullYear(),
    referenceDate.getMonth(),
    referenceDate.getDate() - 6
  );
  const points = Array.from({ length: 7 }, (_, index) => {
    const day = new Date(start);
    day.setDate(start.getDate() + index);
    const dayOrders = getOrdersForDay(orders, day);
    return {
      day: day.toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric', month: 'short' }),
      shortLabel: day.toLocaleDateString('en-IN', { weekday: 'short' }),
      revenue: dayOrders
        .filter((order) => order.paymentStatus !== 'refunded' && order.paymentStatus !== 'cancelled')
        .reduce((total, order) => total + order.total, 0),
      ordersCount: dayOrders.filter((order) => order.paymentStatus !== 'cancelled').length,
    };
  });
  const peakRevenue = Math.max(...points.map((point) => point.revenue));
  return points.map((point) => ({
    ...point,
    isPeak: peakRevenue > 0 && point.revenue === peakRevenue,
  }));
}

export function buildPast30DaysOrderVolumeTrend(
  orders: CafeOrder[],
  referenceDate: Date = new Date()
): DailyOrderVolumePoint[] {
  const start = new Date(
    referenceDate.getFullYear(),
    referenceDate.getMonth(),
    referenceDate.getDate() - 29
  );
  const points = Array.from({ length: 30 }, (_, index) => {
    const day = new Date(start);
    day.setDate(start.getDate() + index);
    const dayOrders = getOrdersForDay(orders, day);
    const shortLabel = `${day.getDate()} ${SHORT_MONTHS[day.getMonth()]}`;
    const isToday = dateKey(day) === dateKey(referenceDate);
    return {
      day: `${SHORT_WEEKDAYS[day.getDay()]}, ${shortLabel}${isToday ? ' (Today)' : ''}`,
      shortLabel,
      ordersCount: dayOrders.filter((order) => order.paymentStatus !== 'cancelled').length,
      revenue: dayOrders
        .filter((order) => order.paymentStatus !== 'refunded' && order.paymentStatus !== 'cancelled')
        .reduce((total, order) => total + order.total, 0),
    };
  });
  const maxOrders = Math.max(...points.map((point) => point.ordersCount), 0);
  return points.map((point) => ({
    ...point,
    isPeak: maxOrders > 0 && point.ordersCount === maxOrders,
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

/**
 * Converts recipe ingredient quantity for 1 pc (e.g. 20 grams, 200 ml, 2 pcs)
 * into the ingredient's native inventory unit (kg, L, g, ml, pcs).
 */
export function convertRecipeAmountToInventoryUnit(
  amount: number,
  recipeUnit: string | undefined,
  inventoryUnit: string
): number {
  if (!amount || amount <= 0) return 0;
  const rUnit = (recipeUnit || '').toLowerCase().trim();
  const iUnit = (inventoryUnit || '').toLowerCase().trim();

  // Inventory is in kg
  if (iUnit === 'kg') {
    if (rUnit === 'g' || rUnit === 'gms' || rUnit === 'gram' || rUnit === 'grams') {
      return Math.round((amount / 1000) * 100000) / 100000;
    }
    if (rUnit === 'kg') {
      return amount;
    }
    return amount >= 1 ? Math.round((amount / 1000) * 100000) / 100000 : amount;
  }

  // Inventory is in L (liters)
  if (iUnit === 'l' || iUnit === 'liter' || iUnit === 'liters') {
    if (rUnit === 'ml' || rUnit === 'g' || rUnit === 'gms') {
      return Math.round((amount / 1000) * 100000) / 100000;
    }
    if (rUnit === 'l') {
      return amount;
    }
    return amount >= 1 ? Math.round((amount / 1000) * 100000) / 100000 : amount;
  }

  // Inventory is in g (grams)
  if (iUnit === 'g' || iUnit === 'gms') {
    if (rUnit === 'kg') {
      return amount * 1000;
    }
    return amount;
  }

  // Inventory is in ml
  if (iUnit === 'ml') {
    if (rUnit === 'l') {
      return amount * 1000;
    }
    return amount;
  }

  // Inventory is in pcs
  return amount;
}

/**
 * Calculates total stock deducted for an order of quantity Q
 */
export function calculateOrderStockDeduction(
  recipeAmountFor1Pc: number,
  recipeUnit: string | undefined,
  inventoryUnit: string,
  orderQuantity: number
): {
  unitDeduction: number;
  totalDeduction: number;
  formattedDeduction: string;
} {
  const perPc = convertRecipeAmountToInventoryUnit(recipeAmountFor1Pc, recipeUnit, inventoryUnit);
  const total = Math.round(perPc * orderQuantity * 100000) / 100000;
  return {
    unitDeduction: perPc,
    totalDeduction: total,
    formattedDeduction: `${total} ${inventoryUnit}`,
  };
}
