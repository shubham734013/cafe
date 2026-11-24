import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
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
  isKitchenActiveOrder,
  isIngredientBelowThreshold,
  restockIngredientItem,
  convertRecipeAmountToInventoryUnit,
  calculateOrderStockDeduction,
} from './cafeLogic';
import { getCafeAssistantReply } from './cafeAssistant';
import { CafeImage } from '../components/CafeImage';
import { CustomerReviewsSection } from '../components/CustomerReviewsSection';
import { getMenuProductPhoto, MENU_PRODUCT_PHOTOS } from '../data/menuProductPhotos';
import { getItemVariants, isRegularOnlyMenuItem } from './menuVariants';

test('every menu product maps to a distinct local Pexels photo', () => {
  const productIds = MENU_ITEMS.map((item) => item.id);
  assert.equal(Object.keys(MENU_PRODUCT_PHOTOS).length, MENU_ITEMS.length);

  const photoIds = productIds.map((productId) => {
    const photoId = MENU_PRODUCT_PHOTOS[productId];
    assert.ok(photoId, `Missing photo assignment for ${productId}`);

    const photoPath = getMenuProductPhoto(productId);
    assert.ok(photoPath);
    assert.ok(existsSync(resolve(process.cwd(), 'public', photoPath.slice(1))), `Missing ${photoPath}`);
    return photoId;
  });

  assert.equal(new Set(photoIds).size, MENU_ITEMS.length);

  const item = MENU_ITEMS[0];
  const markup = renderToStaticMarkup(
    createElement(CafeImage, {
      src: item.imageUrl,
      alt: item.name,
      productId: item.id,
    })
  );
  assert.match(markup, /src="\/images\/products\/aloo-tikki-burger\.jpg"/);
});

test('coffee and chai menu variants have the requested sizes and prices', () => {
  const expectedVariants = {
    'cold-coffee': [
      { size: 'Normal', price: 30 },
      { size: 'Medium', price: 50 },
      { size: 'Large', price: 60 },
    ],
    'cold-coffee-with-ice-cream': [
      { size: 'Normal', price: 40 },
      { size: 'Medium', price: 60 },
      { size: 'Large', price: 80 },
    ],
    chai: [
      { size: 'Small', price: 10 },
      { size: 'Large', price: 20 },
    ],
    'kulhad-chai': [
      { size: 'Small', price: 20 },
      { size: 'Large', price: 30 },
    ],
    'hot-coffee': [
      { size: 'Small', price: 20 },
      { size: 'Large', price: 30 },
    ],
  } as const;

  for (const [id, variants] of Object.entries(expectedVariants)) {
    const item = MENU_ITEMS.find((menuItem) => menuItem.id === id);
    assert.ok(item, `Expected menu item ${id} to exist`);
    assert.deepEqual(item.variants, variants, `Unexpected variants for ${id}`);
  }
});

test('pizzas, Maggi, burgers, sandwiches, shakes, and black coffee only offer Regular', () => {
  const regularOnlyCategories = new Set([
    'Burger',
    'Burgers',
    'Maggi',
    'Pizza',
    'Sandwiches',
    'Shakes',
    'Special Bread Pizza',
  ]);
  const expectedItems = MENU_ITEMS.filter(
    (item) => regularOnlyCategories.has(item.category) || item.id === 'black-coffee'
  );
  const regularOnlyItems = MENU_ITEMS.filter(isRegularOnlyMenuItem);
  assert.deepEqual(
    regularOnlyItems.map((item) => item.id).sort(),
    expectedItems.map((item) => item.id).sort()
  );

  for (const item of regularOnlyItems) {
    assert.deepEqual(getItemVariants(item), [
      { size: 'Regular', price: item.price, label: 'Regular' },
    ]);
  }
});

test('Google review action opens the provided review page and keeps private feedback available', () => {
  const markup = renderToStaticMarkup(
    createElement(CustomerReviewsSection, {
      menuItems: [],
      onSubmitFeedback: async () => undefined,
      onNotify: () => undefined,
    })
  ).replaceAll('&amp;', '&');

  assert.match(
    markup,
    /href="https:\/\/search\.google\.com\/local\/writereview\?placeid=ChIJKdSBIaazbTkRbOW0-Yl-R00&source=g\.page\.m\.ia\._&utm_source=gbp&laa=nmx-review-solicitation-ia2"/
  );
  assert.match(markup, /target="_blank"/);
  assert.match(markup, /rel="noopener noreferrer"/);
  assert.match(markup, /Give Feedback/);
  assert.match(markup, /No reviews yet/);
});

test('customer review cards use submitted reviews and display their actual average rating', () => {
  const markup = renderToStaticMarkup(
    createElement(CustomerReviewsSection, {
      customerReviews: [
        {
          id: 'review-1',
          customerName: 'Asha Patel',
          initials: 'AP',
          rating: 5,
          comment: 'Loved the cold coffee.',
          dateLabel: 'Today',
        },
        {
          id: 'review-2',
          customerName: 'Ravi Kumar',
          rating: 3,
          comment: 'Friendly staff.',
          dateLabel: 'Yesterday',
        },
      ],
      menuItems: [],
      onSubmitFeedback: async () => undefined,
      onNotify: () => undefined,
    })
  );

  assert.match(markup, /Asha Patel/);
  assert.match(markup, /Loved the cold coffee\./);
  assert.match(markup, /Ravi Kumar/);
  assert.match(markup, /Friendly staff\./);
  assert.match(markup, /★ 4\.0/);
  assert.match(markup, /animate-scroll-horizontal/);
  assert.doesNotMatch(markup, /animate-marquee-vertical|review-marquee/);
  assert.doesNotMatch(markup, /Sarah K\.|Michael B\.|Productivity Blogger|Efferd|Elon Musk/);
});

test('cafe assistant answers custom order, menu, and follow-up questions locally', () => {
  const order = {
    ...INITIAL_ORDERS[0],
    kotNumber: 'KOT-42',
    status: 'preparing' as const,
    paymentStatus: 'paid' as const,
    total: 420,
  };
  const coldCoffee = MENU_ITEMS.find((item) => item.id === 'cold-coffee');
  assert.ok(coldCoffee);
  const context = {
    activeOrder: order,
    menuItems: MENU_ITEMS,
    availableBeans: 75,
    lastMentionedMenuItem: coldCoffee,
  };

  assert.match(getCafeAssistantReply('What is happening with my order?', context), /preparing/i);
  assert.match(getCafeAssistantReply('How much does it cost?', context), /Cold Coffee.*₹/);
  assert.match(getCafeAssistantReply('Does it contain any allergens?', context), /confirm with a steward/i);
  assert.match(getCafeAssistantReply('What is my payment status?', context), /payment is marked paid/i);
  assert.match(getCafeAssistantReply('How many reward beans do I have?', context), /75 reward Beans/);
  const vegetarianOption = MENU_ITEMS.find((item) => item.isAvailable !== false && item.isVeg);
  assert.ok(vegetarianOption);
  assert.ok(getCafeAssistantReply('Show vegetarian options', context).includes(vegetarianOption.name));
});

test('cafe assistant does not invent menu or order details', () => {
  const context = {
    menuItems: MENU_ITEMS,
    availableBeans: 0,
  };

  assert.match(getCafeAssistantReply('What is my order status?', context), /active order selected/i);
  assert.match(getCafeAssistantReply('Can I eat peanuts safely?', context), /confirm with a steward/i);
});

test('calculateCartTotals applies only configured active campaign codes', () => {
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

  const activeCampaign = {
    ...INITIAL_CAMPAIGNS[0]!,
    title: 'Cafe Special',
    code: 'CAFE10',
    offerType: 'percentage' as const,
    discountPercentage: 10,
    minimumOrderAmount: 0,
  };
  const totals = calculateCartTotals(items, activeCampaign.code, 'dine-in', false, [activeCampaign]);
  assert.equal(totals.itemCount, 3);
  assert.equal(totals.subtotal, 377);
  assert.equal(totals.discount, 38);
  assert.equal(totals.couponApplied, true);
  assert.equal(totals.couponError, null);

  const customDiscount = calculateCartTotals(
    items,
    activeCampaign.code,
    'dine-in',
    false,
    [{ ...activeCampaign, discountPercentage: 20 }]
  );
  assert.equal(customDiscount.discount, 75);
  assert.equal(customDiscount.discountLabel, `${activeCampaign.title} (20% off)`);
});

test('campaign coupons enforce offer requirements and do not invent discounts', () => {
  const campaign = INITIAL_CAMPAIGNS.find((entry) => entry.code === 'BUY5GET1');
  assert.ok(campaign);
  const mediumCoffee = {
    menuItemId: 'cold-coffee',
    name: 'Cold Coffee',
    price: 50,
    quantity: 4,
    size: 'Medium',
    note: 'Medium',
    imageUrl: '',
    station: 'Barista' as const,
  };

  const fourCoffeeTotals = calculateCartTotals(
    [mediumCoffee],
    campaign.code,
    'takeaway',
    false,
    [{ ...campaign, offerType: undefined }]
  );
  assert.equal(fourCoffeeTotals.couponApplied, false);
  assert.equal(fourCoffeeTotals.discount, 0);
  assert.match(fourCoffeeTotals.couponError ?? '', /Add 1 more Medium Cold Coffees/);

  const fiveCoffeeTotals = calculateCartTotals(
    [{ ...mediumCoffee, quantity: 5 }],
    campaign.code,
    'takeaway',
    false,
    [campaign]
  );
  assert.equal(fiveCoffeeTotals.couponApplied, true);
  assert.equal(fiveCoffeeTotals.discount, 30);

  const wrongVariantTotals = calculateCartTotals(
    [{ ...mediumCoffee, size: 'Normal', quantity: 5 }],
    campaign.code,
    'takeaway',
    false,
    [campaign]
  );
  assert.equal(wrongVariantTotals.couponApplied, false);
  assert.match(wrongVariantTotals.couponError ?? '', /Add 5 more Medium Cold Coffees/);

  const manualCampaign = INITIAL_CAMPAIGNS.find((entry) => entry.code === 'BDAY800');
  assert.ok(manualCampaign);
  const manualTotals = calculateCartTotals(
    [{ ...mediumCoffee, price: 900, quantity: 1 }],
    manualCampaign.code,
    'dine-in',
    false,
    [manualCampaign]
  );
  assert.equal(manualTotals.couponApplied, false);
  assert.equal(manualTotals.discount, 0);
  assert.match(manualTotals.couponError ?? '', /Book this birthday offer with cafe staff/);
});

test('first-order and minimum-order campaign rules are enforced', () => {
  const firstBite = INITIAL_CAMPAIGNS.find((entry) => entry.code === 'FIRSTBITE');
  assert.ok(firstBite);
  const studentOffer = INITIAL_CAMPAIGNS.find((entry) => entry.code === 'CAMPUS15');
  assert.ok(studentOffer);
  const item = {
    menuItemId: 'cold-coffee',
    name: 'Cold Coffee',
    price: 250,
    quantity: 1,
    size: 'Medium',
    note: 'Medium',
    imageUrl: '',
    station: 'Barista' as const,
  };

  const eligible = calculateCartTotals([item], firstBite.code, 'takeaway', false, [firstBite], 0, true);
  assert.equal(eligible.couponApplied, true);
  assert.equal(eligible.discount, 50);
  const ineligible = calculateCartTotals([item], firstBite.code, 'takeaway', false, [firstBite]);
  assert.equal(ineligible.couponApplied, false);
  assert.match(ineligible.couponError ?? '', /first order/);

  const underMinimum = calculateCartTotals(
    [{ ...item, price: 150 }],
    studentOffer.code,
    'takeaway',
    false,
    [{ ...studentOffer, offerType: 'percentage', status: 'active' }]
  );
  assert.equal(underMinimum.couponApplied, false);
  assert.match(underMinimum.couponError ?? '', /minimum order of ₹199/);

  const overMinimum = calculateCartTotals(
    [item],
    studentOffer.code,
    'takeaway',
    false,
    [{ ...studentOffer, offerType: 'percentage', status: 'active' }]
  );
  assert.equal(overMinimum.couponApplied, true);
  assert.equal(overMinimum.discount, 38);
});

test('calculateCartTotals automatically applies the first-order offer when eligible', () => {
  const items = [
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

  const eligibleTotals = calculateCartTotals(items, '', 'takeaway', false, undefined, 0, true);
  assert.equal(eligibleTotals.discount, 18);
  assert.equal(eligibleTotals.discountLabel, 'First Order Offer (20%)');

  const ineligibleTotals = calculateCartTotals(items, '', 'takeaway');
  assert.equal(ineligibleTotals.discount, 0);
});

test('calculateCartTotals rejects inactive campaigns and handles POS dine-in discount', () => {
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
  const inactiveCampaign = INITIAL_CAMPAIGNS.find((campaign) => campaign.status !== 'active')!;
  const invalidTotals = calculateCartTotals(
    smallOrder,
    inactiveCampaign.code,
    'takeaway',
    false,
    [inactiveCampaign]
  );
  assert.equal(invalidTotals.couponApplied, false);
  assert.match(invalidTotals.couponError ?? '', /inactive/);

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
  const burgers = filterMenuItems(MENU_ITEMS, 'Burgers', '');
  assert.ok(burgers.length >= 6);
  assert.ok(burgers.every((item) => item.category === 'Burgers'));

  const coffeeSearch = filterMenuItems(MENU_ITEMS, 'All', 'black coffee');
  assert.equal(coffeeSearch.length, 1);
  assert.equal(coffeeSearch[0].id, 'black-coffee');

  const burgerSearch = filterMenuItems(MENU_ITEMS, 'All', 'burger');
  assert.ok(burgerSearch.length > 0);
  assert.ok(
    burgerSearch.every(
      (item) =>
        item.name.toLowerCase().includes('burger') ||
        item.description.toLowerCase().includes('burger') ||
        item.category.toLowerCase().includes('burger')
    )
  );
});

test('filterOrders filters by service channel and query text', () => {
  const takeaway = filterOrders(INITIAL_ORDERS, 'takeaway', '');
  assert.equal(takeaway.length, 1);
  assert.equal(takeaway[0].id, 'SSCB422');

  const tableThree = filterOrders(INITIAL_ORDERS, 'all', 'T3');
  assert.equal(tableThree.length, 1);
  assert.equal(tableThree[0].id, 'SSCB421');
});

test('computeDashboardMetrics derives totals only from timestamped orders', () => {
  const order = {
    ...INITIAL_ORDERS[0],
    createdAt: new Date().toISOString(),
    total: 345,
    paymentStatus: 'paid' as const,
  };
  const metrics = computeDashboardMetrics([order], 'Last 7 Days');
  assert.equal(metrics.totalOrders, 1);
  assert.equal(metrics.totalRevenue, 345);
  assert.equal(metrics.avgOrderValue, 345);
  assert.equal(metrics.customers, order.customerId ? 1 : 0);
  assert.equal(formatINR(metrics.totalRevenue), '₹345');
  assert.equal(computeDashboardMetrics([INITIAL_ORDERS[0]], 'Last 7 Days').totalOrders, 0);
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
  assert.equal(onDuty.length, 3);
  const morning = filterStaffRoster(INITIAL_STAFF_ROSTER, 'morning');
  assert.equal(morning.length, 2);
});

test('buildPast7DaysRevenueTrend returns 7 days and incorporates live order totals', () => {
  const referenceDate = new Date();
  const todayOrder = {
    ...INITIAL_ORDERS[0],
    createdAt: referenceDate.toISOString(),
  };
  const trend = buildPast7DaysRevenueTrend([todayOrder], referenceDate);
  assert.equal(trend.length, 7);
  const sum = trend.reduce((acc, d) => acc + d.revenue, 0);
  assert.equal(sum, todayOrder.total);

  const extraOrder = {
    ...todayOrder,
    id: 'SSCB499',
    total: 500,
  };
  const updated = buildPast7DaysRevenueTrend([extraOrder, todayOrder], referenceDate);
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
  const datedOrder = {
    ...INITIAL_ORDERS[0],
    createdAt: new Date(2026, 10, 13, 12).toISOString(),
  };
  const baseTrend = buildPast30DaysOrderVolumeTrend([datedOrder], ref);
  assert.equal(baseTrend.length, 30);
  assert.equal(baseTrend[29].shortLabel, '13 Nov');
  assert.match(baseTrend[29].day, /\(Today\)$/);
  assert.equal(baseTrend.slice(0, -1).every((p) => p.ordersCount === 0 && p.revenue === 0), true);

  const peaks = baseTrend.filter((p) => p.isPeak);
  assert.ok(peaks.length >= 1);
  const maxOrders = Math.max(...baseTrend.map((p) => p.ordersCount));
  assert.equal(peaks[0].ordersCount, maxOrders);

  const extraOrder = { ...datedOrder, id: 'SSCB901', total: 420 };
  const updatedTrend = buildPast30DaysOrderVolumeTrend([extraOrder, datedOrder], ref);
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

test('isKitchenActiveOrder holds unpaid online UPI orders and allows paid or counter orders', () => {
  const baseOrder = INITIAL_ORDERS[0];

  // 1. Online UPI order that is unpaid/pending must NOT be sent to kitchen
  const pendingUpiOrder = {
    ...baseOrder,
    status: 'placed' as const,
    paymentMode: 'upi' as const,
    paymentStatus: 'pending' as const,
  };
  assert.equal(isKitchenActiveOrder(pendingUpiOrder), false);

  // 2. Online UPI order once paid IS sent to kitchen
  const paidUpiOrder = {
    ...baseOrder,
    status: 'placed' as const,
    paymentMode: 'upi' as const,
    paymentStatus: 'paid' as const,
  };
  assert.equal(isKitchenActiveOrder(paidUpiOrder), true);

  // 3. Pay on Counter (cash) orders are sent to kitchen immediately
  const counterOrder = {
    ...baseOrder,
    status: 'placed' as const,
    paymentMode: 'cash' as const,
    paymentStatus: 'unpaid' as const,
  };
  assert.equal(isKitchenActiveOrder(counterOrder), true);

  // 4. Served orders are no longer active in kitchen
  const servedOrder = {
    ...baseOrder,
    status: 'served' as const,
    paymentMode: 'cash' as const,
    paymentStatus: 'paid' as const,
  };
  assert.equal(isKitchenActiveOrder(servedOrder), false);

  // 5. Refunded or cancelled orders must NEVER show in kitchen
  const refundedOrder = {
    ...baseOrder,
    status: 'placed' as const,
    paymentMode: 'upi' as const,
    paymentStatus: 'refunded' as const,
  };
  assert.equal(isKitchenActiveOrder(refundedOrder), false);

  const cancelledOrder = {
    ...baseOrder,
    status: 'placed' as const,
    paymentMode: 'cash' as const,
    paymentStatus: 'cancelled' as const,
  };
  assert.equal(isKitchenActiveOrder(cancelledOrder), false);
});

test('calculateCartTotals supports loyalty points redemption and accurate GST breakdown', () => {
  const items = [
    {
      menuItemId: 'cold-coffee',
      name: 'Cold Coffee',
      price: 129,
      quantity: 2,
      note: '',
      imageUrl: '',
      station: 'Barista' as const,
    },
  ];
  // Subtotal = 258. Redeem 100 points (= ₹50 discount at 2 pts = ₹1)
  const totals = calculateCartTotals(items, '', 'dine-in', false, undefined, 100);
  assert.equal(totals.subtotal, 258);
  assert.equal(totals.pointsDiscount, 50);
  assert.equal(totals.pointsRedeemed, 100);
  assert.equal(totals.discount, 50);
  assert.equal(totals.total, 208);
  // 5% GST included in taxable (208 * 5 / 105) = 9.90
  assert.equal(totals.tax, 9.9);
});

test('computeDashboardMetrics correctly accounts for refunded orders and live revenue', () => {
  const refundedOrder = {
    ...INITIAL_ORDERS[0],
    id: 'REF-ORDER-001',
    createdAt: new Date().toISOString(),
    total: 350,
    paymentStatus: 'refunded' as const,
    refundAmount: 350,
  };
  const metrics = computeDashboardMetrics([refundedOrder], 'Today');
  assert.equal(metrics.refundedCount, 1);
  assert.equal(metrics.refundedAmount, 350);
});

test('convertRecipeAmountToInventoryUnit correctly calculates grams per pc into inventory kg and calculates order deduction', () => {
  // 1. 20 grams of coffee beans per 1 pc -> 0.02 kg
  const beansPerPc = convertRecipeAmountToInventoryUnit(20, 'g', 'kg');
  assert.equal(beansPerPc, 0.02);

  // 2. 200 ml of milk per 1 pc -> 0.2 L
  const milkPerPc = convertRecipeAmountToInventoryUnit(200, 'ml', 'L');
  assert.equal(milkPerPc, 0.2);

  // 3. 2 pcs of buns per 1 pc -> 2 pcs
  const bunsPerPc = convertRecipeAmountToInventoryUnit(2, 'pcs', 'pcs');
  assert.equal(bunsPerPc, 2);

  // 4. Order quantity calculation: 5 pcs of coffee with 20g/pc
  const orderDeduction = calculateOrderStockDeduction(20, 'g', 'kg', 5);
  assert.equal(orderDeduction.unitDeduction, 0.02);
  assert.equal(orderDeduction.totalDeduction, 0.1); // 0.1 kg = 100 grams
  assert.equal(orderDeduction.formattedDeduction, '0.1 kg');

  // 5. Order quantity calculation: 3 pcs with 200 ml/pc
  const milkOrder = calculateOrderStockDeduction(200, 'ml', 'L', 3);
  assert.equal(milkOrder.totalDeduction, 0.6); // 0.6 L = 600 ml
});
