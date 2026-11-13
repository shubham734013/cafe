import test from 'node:test';
import assert from 'node:assert/strict';
import {
  INITIAL_CAMPAIGNS,
  INITIAL_CUSTOMERS,
  INITIAL_INVENTORY,
  INITIAL_ORDERS,
  INITIAL_STAFF_ROSTER,
  MENU_ITEMS,
} from '../data/cafeSeedData';
import {
  buildPast30DaysOrderVolumeTrend,
  buildPast7DaysRevenueTrend,
  calculateCartTotals,
  computeDashboardMetrics,
  deriveKotCardPhase,
  filterCampaigns,
  filterCustomers,
  filterInventoryItems,
  filterMenuItems,
  filterOrders,
  filterStaffRoster,
  formatINR,
  formatOrderCsv,
  getIngredientThresholdDeficit,
  getLowInventoryItems,
  getNextKotStatus,
  isIngredientBelowThreshold,
  restockIngredientItem,
} from './cafeLogic';

test('calculateCartTotals computes customer cart with CAFE50 coupon accurately', () => {
  const items = [
    {
      menuItemId: 'protein-shake',
      name: 'Protein Shake',
      price: 149,
      quantity: 1,
      note: '',
      imageUrl: '',
      station: 'Cold Bar' as const,
    },
    {
      menuItemId: 'veg-sandwich',
      name: 'Veg Sandwich',
      price: 99,
      quantity: 1,
      note: '',
      imageUrl: '',
      station: 'Grill' as const,
    },
    {
      menuItemId: 'cold-coffee',
      name: 'Cold Coffee',
      price: 129,
      quantity: 1,
      note: '',
      imageUrl: '',
      station: 'Barista' as const,
    },
  ];

  const totals = calculateCartTotals(items, 'CAFE50', 'dine-in', false);
  assert.equal(totals.itemCount, 3);
  assert.equal(totals.subtotal, 377);
  assert.equal(totals.discount, 50);
  assert.equal(totals.total, 327);
  assert.equal(totals.couponApplied, true);
  assert.equal(totals.couponError, null);
});

test('calculateCartTotals validates minimum order for CAFE50 and handles POS dine-in discount', () => {
  const smallOrder = [
    {
      menuItemId: 'french-fries',
      name: 'French Fries',
      price: 89,
      quantity: 1,
      note: '',
      imageUrl: '',
      station: 'Fryer' as const,
    },
  ];
  const invalidTotals = calculateCartTotals(smallOrder, 'CAFE50', 'takeaway', false);
  assert.equal(invalidTotals.couponApplied, false);
  assert.match(invalidTotals.couponError ?? '', /111/);

  const posOrder = [
    {
      menuItemId: 'protein-shake',
      name: 'Protein Shake',
      price: 149,
      quantity: 1,
      note: '',
      imageUrl: '',
      station: 'Cold Bar' as const,
    },
    {
      menuItemId: 'veg-sandwich',
      name: 'Veg Sandwich',
      price: 99,
      quantity: 1,
      note: '',
      imageUrl: '',
      station: 'Grill' as const,
    },
  ];
  const posTotals = calculateCartTotals(posOrder, '', 'dine-in', true);
  assert.equal(posTotals.subtotal, 248);
  assert.equal(posTotals.discount, 20);
  assert.equal(posTotals.total, 228);
});

test('getNextKotStatus advances tickets sequentially through lifecycle', () => {
  assert.equal(getNextKotStatus('placed'), 'preparing');
  assert.equal(getNextKotStatus('preparing'), 'ready');
  assert.equal(getNextKotStatus('ready'), 'served');
  assert.equal(getNextKotStatus('served'), 'served');
});

test('filterMenuItems filters by category and search query', () => {
  const beverages = filterMenuItems(MENU_ITEMS, 'Beverages', '');
  assert.ok(beverages.length >= 5);
  assert.ok(beverages.every((item) => item.category === 'Beverages'));

  const latteSearch = filterMenuItems(MENU_ITEMS, 'All', 'latte');
  assert.equal(latteSearch.length, 1);
  assert.equal(latteSearch[0].id, 'iced-latte');
});

test('filterOrders filters by service channel and query text', () => {
  const takeaway = filterOrders(INITIAL_ORDERS, 'takeaway', '');
  assert.equal(takeaway.length, 1);
  assert.equal(takeaway[0].id, 'SSCB422');

  const tableThree = filterOrders(INITIAL_ORDERS, 'all', 'T3');
  assert.equal(tableThree.length, 1);
  assert.equal(tableThree[0].id, 'SSCB421');
});

test('computeDashboardMetrics aggregates baseline and live orders', () => {
  const metrics = computeDashboardMetrics(INITIAL_ORDERS, 'Last 7 Days');
  assert.equal(metrics.totalOrders, 1248);
  assert.equal(metrics.totalRevenue, 156340);
  assert.equal(metrics.avgOrderValue, 125);
  assert.equal(metrics.customers, 892);
  assert.equal(formatINR(metrics.totalRevenue), '₹1,56,340');
});

test('formatOrderCsv produces valid CSV lines for all orders', () => {
  const csv = formatOrderCsv(INITIAL_ORDERS);
  const lines = csv.split('\n');
  assert.equal(lines.length, INITIAL_ORDERS.length + 1);
  assert.match(lines[0], /^Order ID,KOT,Mode/);
  assert.match(lines[1], /^SSCB421,#421,dine-in/);
});

test('restockIngredientItem updates quantity and clears Critical status', () => {
  const proteinBefore = INITIAL_INVENTORY.find((i) => i.id === 'ing-protein')!;
  assert.equal(proteinBefore.status, 'Critical');
  const updated = restockIngredientItem(INITIAL_INVENTORY, 'ing-protein', 1000);
  const proteinAfter = updated.find((i) => i.id === 'ing-protein')!;
  assert.equal(proteinAfter.quantity, 1400);
  assert.equal(proteinAfter.status, 'Good');
  assert.equal(proteinAfter.movementType, 'in');
});

test('filterInventoryItems filters by movement tab and search query', () => {
  const stockOut = filterInventoryItems(INITIAL_INVENTORY, 'Stock Out', '');
  assert.equal(stockOut.length, 3);
  const milkMatch = filterInventoryItems(INITIAL_INVENTORY, 'Inventory', 'saras');
  assert.equal(milkMatch.length, 2);
});

test('filterCustomers filters by segment tier and name or phone', () => {
  const vipOnly = filterCustomers(INITIAL_CUSTOMERS, 'vip', '');
  assert.equal(vipOnly.length, 2);
  const phoneSearch = filterCustomers(INITIAL_CUSTOMERS, 'all', '9876543210');
  assert.equal(phoneSearch.length, 1);
  assert.equal(phoneSearch[0].name, 'Aman Sharma');
});

test('filterCampaigns and filterStaffRoster filter correctly', () => {
  const scheduled = filterCampaigns(INITIAL_CAMPAIGNS, 'scheduled');
  assert.equal(scheduled.length, 1);
  assert.equal(scheduled[0].code, 'CAMPUS15');

  const onDuty = filterStaffRoster(INITIAL_STAFF_ROSTER, 'active');
  assert.equal(onDuty.length, 4);
  const morning = filterStaffRoster(INITIAL_STAFF_ROSTER, 'morning');
  assert.equal(morning.length, 2);
});

test('buildPast7DaysRevenueTrend returns 7 days and incorporates live order totals', () => {
  const trend = buildPast7DaysRevenueTrend(INITIAL_ORDERS);
  assert.equal(trend.length, 7);
  const sum = trend.reduce((acc, d) => acc + d.revenue, 0);
  assert.equal(sum, computeDashboardMetrics(INITIAL_ORDERS, 'Last 7 Days').totalRevenue);

  const extraOrder = { ...INITIAL_ORDERS[0], id: 'SSCB499', total: 500 };
  const updated = buildPast7DaysRevenueTrend([extraOrder, ...INITIAL_ORDERS]);
  assert.equal(updated[6].revenue, trend[6].revenue + 500);
  assert.equal(updated[6].ordersCount, trend[6].ordersCount + 1);
});

test('getLowInventoryItems returns items below minThreshold sorted by severity and clears on restock', () => {
  const lowItems = getLowInventoryItems(INITIAL_INVENTORY);
  assert.equal(lowItems.length, 2);
  assert.equal(lowItems[0].id, 'ing-protein');
  assert.equal(lowItems[1].id, 'ing-beans');

  const afterRestock = restockIngredientItem(INITIAL_INVENTORY, 'ing-protein', 1000);
  const lowAfter = getLowInventoryItems(afterRestock);
  assert.equal(lowAfter.length, 1);
  assert.equal(lowAfter[0].id, 'ing-beans');
});

test('isIngredientBelowThreshold and Low Stock tab filter strictly below minThreshold', () => {
  assert.equal(isIngredientBelowThreshold({ quantity: 10, minThreshold: 10 }), false);
  assert.equal(isIngredientBelowThreshold({ quantity: 9.9, minThreshold: 10 }), true);
  assert.equal(getIngredientThresholdDeficit({ quantity: 1.2, minThreshold: 1.5 }), 0.3);

  const lowStockTab = filterInventoryItems(INITIAL_INVENTORY, 'Low Stock', '');
  assert.deepEqual(
    lowStockTab.map((i) => i.id),
    ['ing-beans', 'ing-protein']
  );

  const lowStockSearch = filterInventoryItems(INITIAL_INVENTORY, 'Low Stock', 'arabica');
  assert.deepEqual(
    lowStockSearch.map((i) => i.id),
    ['ing-beans']
  );

  const restocked = restockIngredientItem(INITIAL_INVENTORY, 'ing-beans', 2);
  const afterRestock = filterInventoryItems(restocked, 'Low Stock', '');
  assert.deepEqual(
    afterRestock.map((i) => i.id),
    ['ing-protein']
  );
});

test('buildPast30DaysOrderVolumeTrend returns 30 days, marks peak, and tracks live orders', () => {
  const ref = new Date(2026, 10, 13); // 13 Nov 2026
  const baseTrend = buildPast30DaysOrderVolumeTrend(INITIAL_ORDERS, ref);
  assert.equal(baseTrend.length, 30);
  assert.equal(baseTrend[29].shortLabel, '13 Nov');
  assert.match(baseTrend[29].day, /\(Today\)$/);
  assert.ok(baseTrend.every((p) => p.ordersCount > 0 && p.revenue > 0));

  const peaks = baseTrend.filter((p) => p.isPeak);
  assert.ok(peaks.length >= 1);
  const maxOrders = Math.max(...baseTrend.map((p) => p.ordersCount));
  assert.equal(peaks[0].ordersCount, maxOrders);

  const extraOrder = { ...INITIAL_ORDERS[0], id: 'SSCB901', total: 420 };
  const updatedTrend = buildPast30DaysOrderVolumeTrend([extraOrder, ...INITIAL_ORDERS], ref);
  assert.equal(updatedTrend[29].ordersCount, baseTrend[29].ordersCount + 1);
  assert.equal(updatedTrend[29].revenue, baseTrend[29].revenue + 420);
});

test('deriveKotCardPhase distinguishes pending and prepared order states with item progress', () => {
  const placedOrder = { ...INITIAL_ORDERS[0], status: 'placed' as const };
  const placedPhase = deriveKotCardPhase(placedOrder);
  assert.equal(placedPhase.phase, 'pending');
  assert.equal(placedPhase.allItemsChecked, false);
  assert.equal(placedPhase.completionPct, 14);

  const partialChecked = {
    status: 'preparing' as const,
    items: placedOrder.items.map((item, idx) => ({ ...item, checked: idx < 2 })),
  };
  const partialPhase = deriveKotCardPhase(partialChecked);
  assert.equal(partialPhase.phase, 'pending');
  assert.equal(partialPhase.checkedCount, 2);
  assert.equal(partialPhase.totalCount, 3);
  assert.equal(partialPhase.completionPct, 67);

  const readyPhase = deriveKotCardPhase({ ...placedOrder, status: 'ready' });
  assert.equal(readyPhase.phase, 'prepared');
  assert.equal(readyPhase.completionPct, 100);
});
