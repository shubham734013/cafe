import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import type { AddressInfo } from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createCafeServer } from './app';
import { CashfreeGateway } from './cashfreeGateway';
import { CafeStore } from './store';
import { buildTableQrUrl } from '../shared/upi';
import { addStaffSchema, cafeSettingsSchema, createCampaignSchema } from '../shared/schemas';
import { signStaffSession, STAFF_SESSION_COOKIE } from './auth';
import type { UpiGatewayClient, UpiGatewayOrder } from './upiGateway';
import type { CafeOrder } from '../types/cafe';
import { INITIAL_CAMPAIGNS, INITIAL_CAFE_SETTINGS, MENU_ITEMS } from '../data/cafeSeedData';

const TEST_MENU_ITEM = MENU_ITEMS.find((item) => item.id === 'cold-coffee') ?? MENU_ITEMS[0];
assert.ok(TEST_MENU_ITEM);

test('staff mobile numbers, campaign discounts, and cafe logos are validated', () => {
  const staff = addStaffSchema.parse({
    name: 'Test Staff',
    role: 'Kitchen',
    shiftLabel: '10 AM – 6 PM',
    phone: '+91 98765 43210',
  });
  assert.equal(staff.phone, '9876543210');
  assert.equal(
    addStaffSchema.safeParse({
      name: 'Test Staff',
      role: 'Kitchen',
      shiftLabel: '10 AM – 6 PM',
      phone: '12345',
    }).success,
    false
  );

  const campaign = createCampaignSchema.parse({
    title: 'Test Offer',
    code: 'test20',
    validityLabel: 'This week',
    description: 'A discount campaign',
    discountPercentage: 20,
    minimumOrderAmount: 500,
  });
  assert.equal(campaign.discountPercentage, 20);
  assert.equal(campaign.minimumOrderAmount, 500);
  assert.equal(
    createCampaignSchema.safeParse({
      title: 'Test Offer',
      code: 'test101',
      validityLabel: 'This week',
      description: 'A discount campaign',
      discountPercentage: 101,
    }).success,
    false
  );

  assert.equal(cafeSettingsSchema.parse(INITIAL_CAFE_SETTINGS).logoUrl, '/images/tsc-logo.jpg');
  assert.equal(
    cafeSettingsSchema.safeParse({
      ...INITIAL_CAFE_SETTINGS,
      logoUrl: 'javascript:alert(1)',
    }).success,
    false
  );
});

class TestUpiGateway implements UpiGatewayClient {
  private readonly orders = new Map<string, UpiGatewayOrder>();
  private sequence = 0;

  public isConfigured(): boolean {
    return true;
  }

  public getWebhookSecret(): string {
    return 'test-webhook-secret';
  }

  public async createOrder(input: {
    clientOrderId: string;
    amountPaise: number;
  }): Promise<UpiGatewayOrder> {
    const order: UpiGatewayOrder = {
      orderId: `GW${++this.sequence}`,
      clientOrderId: input.clientOrderId,
      amountPaise: input.amountPaise,
      status: 'pending',
      paymentUrl: `https://gateway.test/pay/GW${this.sequence}`,
    };
    this.orders.set(input.clientOrderId, order);
    return { ...order };
  }

  public async getOrder(clientOrderId: string): Promise<UpiGatewayOrder | null> {
    const order = this.orders.get(clientOrderId);
    return order ? { ...order } : null;
  }

  public seedOrder(order: UpiGatewayOrder): void {
    this.orders.set(order.clientOrderId, order);
  }

  public markPaid(clientOrderId: string): void {
    const order = this.orders.get(clientOrderId);
    assert.ok(order);
    this.orders.set(clientOrderId, { ...order, status: 'paid', utr: '123456789012' });
  }
}

async function startTestServer(gateway?: UpiGatewayClient) {
  const store = new CafeStore(null);
  const bundle = createCafeServer(store, gateway);
  await new Promise<void>((resolve) => {
    bundle.httpServer.listen(0, '127.0.0.1', () => resolve());
  });
  const address = bundle.httpServer.address() as AddressInfo;
  const baseUrl = `http://127.0.0.1:${address.port}`;
  const close = async () => {
    await new Promise<void>((resolve, reject) => {
      bundle.io.close();
      bundle.httpServer.close((error) => (error ? reject(error) : resolve()));
    });
  };
  return { baseUrl, store, close };
}

test('persisted staff roles migrate to Admin and Kitchen', () => {
  const directory = mkdtempSync(join(tmpdir(), 'cafe-staff-role-migration-'));
  const snapshotPath = join(directory, 'state.json');
  const seed = new CafeStore(null).getBootstrap();
  const staffMember = (id: string, role: string) => ({
    id,
    initials: 'TS',
    name: 'Test Staff',
    role,
    roleIcon: 'badge',
    shiftLabel: '10 AM – 6 PM',
    shiftBucket: 'morning',
    isOnDuty: true,
    statLeft: 'Test',
    statRight: 'On duty',
    stationBadge: 'Test Station',
    stationIcon: 'verified_user',
  });
  try {
    writeFileSync(
      snapshotPath,
      JSON.stringify({
        ...seed,
        staffRoster: [
          staffMember('old-admin', 'Owner & Store Lead'),
          staffMember('old-kitchen', 'Head Barista'),
          staffMember('old-server', 'Server / Steward'),
        ],
        cafeSettings: {
          ...seed.cafeSettings,
          adminPinRequired: undefined,
          managerPinRequired: false,
        },
      })
    );
    const migrated = new CafeStore(snapshotPath).getBootstrap();
    assert.deepEqual(
      migrated.staffRoster.map((member) => member.role),
      ['Admin', 'Kitchen', 'Kitchen']
    );
    assert.equal(migrated.cafeSettings.adminPinRequired, false);
    assert.equal('managerPinRequired' in migrated.cafeSettings, false);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

async function createTestOrder(store: CafeStore) {
  const { order } = await store.createOrder({
    outletId: 'seth-sawariya-main',
    serviceMode: 'takeaway',
    paymentMode: 'cash',
    couponCode: '',
    cookingNote: '',
    isPosTerminal: false,
    items: [
      {
        menuItemId: TEST_MENU_ITEM.id,
        name: TEST_MENU_ITEM.name,
        price: TEST_MENU_ITEM.price,
        quantity: 1,
        note: '',
        imageUrl: '',
        station: 'Barista',
      },
    ],
  });
  return order;
}

test('POS order price is canonicalized from the selected catalog variant', async () => {
  const store = new CafeStore(null);
  const item = MENU_ITEMS.find((menuItem) => menuItem.id === 'cold-coffee');
  assert.ok(item?.variants);
  const variant = item.variants.find((candidate) => candidate.size === 'Medium');
  assert.ok(variant);

  const { order } = await store.createOrder({
    outletId: 'seth-sawariya-main',
    serviceMode: 'takeaway',
    paymentMode: 'cash',
    couponCode: '',
    cookingNote: '',
    isPosTerminal: true,
    items: [
      {
        menuItemId: item.id,
        name: item.name,
        price: 1,
        quantity: 1,
        size: variant.size,
        note: '',
        imageUrl: '',
        station: item.station,
      },
    ],
  });

  assert.equal(order.items[0].price, variant.price);
  assert.equal(order.items[0].size, variant.size);
});

function getCookieHeader(response: Response): string {
  const headers = response.headers as Headers & { getSetCookie?: () => string[] };
  const cookies = headers.getSetCookie?.() ?? [];
  if (cookies.length > 0) return cookies.map((cookie) => cookie.split(';')[0]).join('; ');
  return (response.headers.get('set-cookie') ?? '').split(';')[0] ?? '';
}

async function loginWithPin(baseUrl: string, pin: string): Promise<string> {
  const response = await fetch(`${baseUrl}/api/auth/pin`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ pin }),
  });
  assert.equal(response.status, 200);
  return getCookieHeader(response);
}

test('UPI gateway client order references persist and resolve to the CafeOS order', async (t) => {
  const directory = mkdtempSync(join(tmpdir(), 'cafe-gateway-reference-'));
  t.after(() => rmSync(directory, { recursive: true, force: true }));
  const snapshotPath = join(directory, 'state.json');
  const store = new CafeStore(snapshotPath);
  const order = await createTestOrder(store);

  const clientOrderId = store.getOrCreateGatewayClientOrderId(order.id);
  assert.ok(clientOrderId);
  await store.flushToPersistence();

  const restoredStore = new CafeStore(snapshotPath);
  assert.equal(restoredStore.getOrCreateGatewayClientOrderId(order.id), clientOrderId);
  assert.equal(restoredStore.getOrderByGatewayClientOrderId(clientOrderId)?.id, order.id);
});

test('health and public bootstrap remain available and retired YouPI routes stay removed', async (t) => {
  const { baseUrl, close } = await startTestServer();
  t.after(close);

  const healthResponse = await fetch(`${baseUrl}/api/health`);
  assert.equal(healthResponse.status, 200);
  const health = (await healthResponse.json()) as { ok: boolean; service: string };
  assert.equal(health.ok, true);
  assert.equal(health.service, 'seth-sawariya-cafeos');

  const liveness = await fetch(`${baseUrl}/health/live`);
  assert.equal(liveness.status, 200);
  const liveJson = (await liveness.json()) as { status: string; uptime: number };
  assert.equal(liveJson.status, 'ok');

  const readiness = await fetch(`${baseUrl}/health/ready`);
  assert.equal(readiness.status, 200);
  const readyJson = (await readiness.json()) as { status: string };
  assert.equal(readyJson.status, 'ready');

  const identityWithoutAuth = await fetch(`${baseUrl}/api/customer/identity`, {
    method: 'POST',
  });
  assert.equal(identityWithoutAuth.status, 401);
  const clearIdentityResponse = await fetch(`${baseUrl}/api/customer/identity`, {
    method: 'DELETE',
  });
  assert.equal(clearIdentityResponse.status, 204);

  const bootstrapResponse = await fetch(
    `${baseUrl}/api/bootstrap?screen=splash&scope=main`
  );
  assert.equal(bootstrapResponse.status, 200);
  const bootstrap = (await bootstrapResponse.json()) as {
    orders: unknown[];
    menuItems: unknown[];
    customers: unknown[];
  };
  assert.deepEqual(bootstrap.orders, []);
  assert.deepEqual(bootstrap.menuItems, []);
  assert.deepEqual(bootstrap.customers, []);

  const profileBootstrapResponse = await fetch(
    `${baseUrl}/api/bootstrap?screen=profile&scope=main`
  );
  assert.equal(profileBootstrapResponse.status, 200);
  const profileBootstrap = (await profileBootstrapResponse.json()) as {
    orders: unknown[];
    menuItems: unknown[];
    customers: unknown[];
  };
  assert.deepEqual(profileBootstrap.orders, []);
  assert.deepEqual(profileBootstrap.menuItems, []);
  assert.deepEqual(profileBootstrap.customers, []);

  const retiredRoutes = [
    { path: '/api/payments/config', method: 'GET' },
    { path: '/api/webhooks/youpi', method: 'POST' },
  ] as const;
  for (const route of retiredRoutes) {
    const response = await fetch(`${baseUrl}${route.path}`, { method: route.method });
    assert.equal(response.status, 404, `${route.method} ${route.path} must be removed`);
  }

  const missingOrderResponse = await fetch(
    `${baseUrl}/api/orders/SSCB999/payment-session`,
    { method: 'POST' }
  );
  assert.equal(missingOrderResponse.status, 404);
});

test('order creation enforces catalog prices and deduplicates QR stock deduction on acceptance', async (t) => {
  const { baseUrl, store, close } = await startTestServer();
  t.after(close);

  const milk = store.addIngredient({
    name: 'Milk',
    quantity: 12,
    unit: 'L',
    minThreshold: 2,
    supplier: 'Test supplier',
    unitCost: 1,
  });
  const beans = store.addIngredient({
    name: 'Coffee Beans',
    quantity: 5,
    unit: 'kg',
    minThreshold: 1,
    supplier: 'Test supplier',
    unitCost: 1,
  });
  store.setRecipe('cold-coffee', [
    { ingredientId: milk.id, amount: 0.2 },
    { ingredientId: beans.id, amount: 0.02 },
  ]);
  const inventoryBefore = store.getInventory();
  const milkBefore = inventoryBefore.find((item) => item.id === milk.id)?.quantity;
  const beansBefore = inventoryBefore.find((item) => item.id === beans.id)?.quantity;

  const payload = {
    serviceMode: 'delivery',
    deliveryAddress: 'Flat 2A, Sanganer, Jaipur, Rajasthan',
    items: [
      {
        menuItemId: 'cold-coffee',
        name: 'Tampered name',
        price: 1,
        quantity: 2,
        station: 'Barista',
      },
    ],
    idempotencyKey: 'test-order-key-001',
  };
  const createResponse = await fetch(`${baseUrl}/api/orders`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });

  assert.equal(createResponse.status, 201);
  const customerCookie = getCookieHeader(createResponse);
  const created = (await createResponse.json()) as {
    order: {
      id: string;
      total: number;
      customerId: string;
      deliveryAddress?: string;
      items: Array<{ name: string; price: number }>;
    };
    duplicate: boolean;
  };
  assert.equal(created.duplicate, false);
  assert.equal(created.order.total, TEST_MENU_ITEM.price * 2);
  assert.equal(created.order.items[0]?.price, TEST_MENU_ITEM.price);
  assert.equal(created.order.items[0]?.name, TEST_MENU_ITEM.name);
  assert.equal(created.order.deliveryAddress, payload.deliveryAddress);
  assert.match(created.order.customerId, /^guest_/);
  assert.equal('paymentProvider' in created.order, false);

  const inventoryAfterCreate = store.getInventory();
  assert.equal(
    inventoryAfterCreate.find((item) => item.id === milk.id)?.quantity,
    milkBefore
  );
  assert.equal(
    inventoryAfterCreate.find((item) => item.id === beans.id)?.quantity,
    beansBefore
  );

  const staffCookie = await loginWithPin(baseUrl, '7777');
  const acceptResponse = await fetch(`${baseUrl}/api/orders/${created.order.id}/status`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Cookie: staffCookie },
    body: JSON.stringify({ status: 'accepted' }),
  });
  assert.equal(acceptResponse.status, 200);
  const inventoryAfterAcceptance = store.getInventory();
  assert.equal(
    inventoryAfterAcceptance.find((item) => item.id === milk.id)?.quantity,
    Math.round(((milkBefore ?? 0) - 0.4) * 100) / 100
  );
  assert.equal(
    inventoryAfterAcceptance.find((item) => item.id === beans.id)?.quantity,
    Math.round(((beansBefore ?? 0) - 0.04) * 100) / 100
  );

  const duplicateResponse = await fetch(`${baseUrl}/api/orders`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Cookie: customerCookie },
    body: JSON.stringify(payload),
  });
  assert.equal(duplicateResponse.status, 200);
  const duplicate = (await duplicateResponse.json()) as {
    order: { id: string };
    duplicate: boolean;
  };
  assert.equal(duplicate.duplicate, true);
  assert.equal(duplicate.order.id, created.order.id);
  // Replaying the idempotent request must not burn ingredients a second time.
  assert.deepEqual(store.getInventory(), inventoryAfterAcceptance);

  const customerBootstrapResponse = await fetch(`${baseUrl}/api/bootstrap`, {
    headers: { Cookie: customerCookie },
  });
  const customerBootstrap = (await customerBootstrapResponse.json()) as {
    orders: Array<{ id: string }>;
    customers: unknown[];
  };
  assert.deepEqual(customerBootstrap.orders.map((order) => order.id), [created.order.id]);
  assert.deepEqual(customerBootstrap.customers, []);

  // Verify empty string tableNumber / deliveryPartner / customerId do not fail schema validation
  const emptyStringPayload = {
    serviceMode: 'takeaway',
    tableNumber: '',
    deliveryPartner: '',
    customerId: '',
    items: [
      {
        menuItemId: 'cold-coffee',
        name: 'Cold Coffee',
        price: 129,
        quantity: 1,
        station: 'Barista',
      },
    ],
    idempotencyKey: 'test-empty-strings-001',
  };
  const emptyStringRes = await fetch(`${baseUrl}/api/orders`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(emptyStringPayload),
  });
  assert.equal(emptyStringRes.status, 201, 'Empty string fields must not fail validation with too_small');
});

test('UPI gateway checkout is idempotent and only authenticated gateway status settles the order', async (t) => {
  const gateway = new TestUpiGateway();
  const { baseUrl, store, close } = await startTestServer(gateway);
  t.after(close);

  const createOrderResponse = await fetch(`${baseUrl}/api/orders`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      serviceMode: 'takeaway',
      items: [
        {
          menuItemId: 'cold-coffee',
          name: 'Cold Coffee',
          price: 129,
          quantity: 1,
          station: 'Barista',
        },
      ],
      idempotencyKey: 'upi-integration-order',
    }),
  });
  assert.equal(createOrderResponse.status, 201);
  const customerCookie = getCookieHeader(createOrderResponse);
  const { order } = (await createOrderResponse.json()) as {
    order: { id: string; total: number };
  };
  gateway.seedOrder({
    orderId: 'GW-LEGACY',
    clientOrderId: order.id,
    amountPaise: Math.round(order.total * 100) + 100,
    status: 'pending',
    paymentUrl: 'https://gateway.test/pay/GW-LEGACY',
  });

  const startResponse = await fetch(`${baseUrl}/api/orders/${order.id}/payment-session`, {
    method: 'POST',
    headers: { Cookie: customerCookie },
  });
  assert.equal(startResponse.status, 200);
  const checkout = (await startResponse.json()) as {
    checkoutUrl: string;
    paymentId: string;
    paymentStatus: string;
  };
  assert.equal(checkout.checkoutUrl, 'https://gateway.test/pay/GW1');
  assert.equal(checkout.paymentId, 'GW1');
  assert.equal(checkout.paymentStatus, 'pending');
  const gatewayClientOrderId = store.getOrder(order.id)?.gatewayClientOrderId;
  assert.ok(gatewayClientOrderId);
  assert.notEqual(gatewayClientOrderId, order.id);
  assert.equal(store.getOrder(order.id)?.paymentStatus, 'pending');

  const reopened = await fetch(`${baseUrl}/api/orders/${order.id}/payment-session`, {
    method: 'POST',
    headers: { Cookie: customerCookie },
  });
  assert.equal(reopened.status, 200);
  const reusedCheckout = (await reopened.json()) as { paymentId: string };
  assert.equal(reusedCheckout.paymentId, 'GW1');

  const otherOrderResponse = await fetch(`${baseUrl}/api/orders`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      serviceMode: 'takeaway',
      items: [
        {
          menuItemId: TEST_MENU_ITEM.id,
          name: 'Cappuccino',
          price: 149,
          quantity: 1,
          station: 'Barista',
        },
      ],
    }),
  });
  assert.equal(otherOrderResponse.status, 201);
  const otherCookie = getCookieHeader(otherOrderResponse);
  const { order: otherOrder } = (await otherOrderResponse.json()) as {
    order: { id: string };
  };
  const forbidden = await fetch(`${baseUrl}/api/orders/${otherOrder.id}/payment-session`, {
    method: 'POST',
    headers: { Cookie: customerCookie },
  });
  assert.equal(forbidden.status, 403);
  assert.ok(otherCookie);

  gateway.markPaid(gatewayClientOrderId);
  const paymentStatusResponse = await fetch(
    `${baseUrl}/api/orders/${order.id}/payment-status`,
    { headers: { Cookie: customerCookie } }
  );
  assert.equal(paymentStatusResponse.status, 200);
  assert.deepEqual(await paymentStatusResponse.json(), { paymentStatus: 'paid' });
  assert.equal(store.getOrder(order.id)?.paymentStatus, 'paid');

  const kitchenBootstrapResponse = await fetch(
    `${baseUrl}/api/bootstrap?screen=kitchen-display-system&scope=kitchen`
  );
  assert.equal(kitchenBootstrapResponse.status, 200);
  const kitchenBootstrap = (await kitchenBootstrapResponse.json()) as {
    orders: Array<Record<string, unknown> & { id: string; paymentStatus?: string }>;
  };
  const kitchenOrder = kitchenBootstrap.orders.find((candidate) => candidate.id === order.id);
  assert.equal(kitchenOrder?.paymentStatus, 'paid');
  assert.equal('paymentRef' in (kitchenOrder ?? {}), false);
  assert.equal('customerId' in (kitchenOrder ?? {}), false);

  const timestamp = String(Math.floor(Date.now() / 1000));
  const body = JSON.stringify({
    event_id: 'gateway-event-1',
    event: 'order.paid',
    data: {
      order_id: 'GW1',
      client_order_id: gatewayClientOrderId,
      amount: order.total.toFixed(2),
      currency: 'INR',
      status: 'paid',
      environment: 'live',
      test: false,
    },
  });
  const signature = crypto
    .createHmac('sha256', gateway.getWebhookSecret())
    .update(`${timestamp}.${body}`)
    .digest('hex');
  const webhookResponse = await fetch(`${baseUrl}/api/webhooks/upi-gateway`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Signature': `t=${timestamp},v1=${signature}`,
    },
    body,
  });
  assert.equal(webhookResponse.status, 200);
  assert.equal(store.getOrder(order.id)?.paymentStatus, 'paid');
  assert.equal(store.getOrder(order.id)?.paymentRef, 'UPI UTR 123456789012');

  const staleWebhook = await fetch(`${baseUrl}/api/webhooks/upi-gateway`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-Signature': `t=1,v1=${signature}` },
    body,
  });
  assert.equal(staleWebhook.status, 401);
});

test('Cashfree checkout uses persistent unique references and resolves them back to CafeOS orders', async (t) => {
  const gateway = new CashfreeGateway({
    appId: 'CF_SANDBOX_TEST',
    secretKey: 'test-secret',
    environment: 'SANDBOX',
    webhookSecret: 'test-webhook-secret',
  });
  const { baseUrl, store, close } = await startTestServer(gateway);
  t.after(close);

  const createOrderResponse = await fetch(`${baseUrl}/api/orders`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      serviceMode: 'takeaway',
      items: [
        {
          menuItemId: 'cold-coffee',
          name: 'Cold Coffee',
          price: 129,
          quantity: 1,
          station: 'Barista',
        },
      ],
      idempotencyKey: 'cashfree-reference-order',
    }),
  });
  assert.equal(createOrderResponse.status, 201);
  const customerCookie = getCookieHeader(createOrderResponse);
  const { order } = (await createOrderResponse.json()) as {
    order: { id: string; total: number };
  };

  await gateway.createOrder({
    clientOrderId: order.id,
    amountPaise: Math.round(order.total * 100) + 100,
    note: `stale ${order.id}`,
  });

  const startResponse = await fetch(`${baseUrl}/api/orders/${order.id}/payment-session`, {
    method: 'POST',
    headers: { Cookie: customerCookie },
  });
  assert.equal(startResponse.status, 200);
  const checkout = (await startResponse.json()) as {
    checkoutUrl: string;
    paymentId: string;
    paymentStatus: string;
  };
  const gatewayReference = store.getOrder(order.id)?.gatewayClientOrderId;
  assert.ok(gatewayReference);
  assert.notEqual(gatewayReference, order.id);
  assert.ok(gatewayReference.length <= 45);
  assert.equal(checkout.paymentStatus, 'pending');
  assert.ok(checkout.paymentId);

  const checkoutUrl = new URL(checkout.checkoutUrl);
  const hostedCheckoutResponse = await fetch(
    `${baseUrl}${checkoutUrl.pathname}${checkoutUrl.search}`
  );
  assert.equal(hostedCheckoutResponse.status, 200);
  const hostedCheckoutHtml = await hostedCheckoutResponse.text();
  assert.ok(hostedCheckoutHtml.includes(order.id));
  assert.ok(hostedCheckoutHtml.includes(`name="orderId" value="${gatewayReference}"`));

  const mockPaymentResponse = await fetch(`${baseUrl}/api/cashfree-mock/pay`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ orderId: gatewayReference, session: 'test-session' }),
    redirect: 'manual',
  });
  assert.equal(mockPaymentResponse.status, 302);
  const returnLocation = mockPaymentResponse.headers.get('location');
  assert.equal(
    returnLocation,
    `/api/orders/${encodeURIComponent(gatewayReference)}/cashfree-return`
  );

  const returnResponse = await fetch(`${baseUrl}${returnLocation}`, { redirect: 'manual' });
  assert.equal(returnResponse.status, 302);
  assert.equal(
    returnResponse.headers.get('location'),
    `/customer/tracking?orderId=${encodeURIComponent(order.id)}`
  );
  assert.equal(store.getOrder(order.id)?.paymentStatus, 'paid');

  const webhookTimestamp = String(Math.floor(Date.now() / 1000));
  const webhookBody = JSON.stringify({
    type: 'PAYMENT_SUCCESS_WEBHOOK',
    data: {
      order: {
        order_id: gatewayReference,
        order_amount: order.total,
        order_currency: 'INR',
      },
      payment: {
        cf_payment_id: 'cashfree-payment-1',
        payment_status: 'SUCCESS',
        payment_amount: order.total,
        payment_currency: 'INR',
        bank_reference: '123456789012',
      },
    },
  });
  const webhookSignature = crypto
    .createHmac('sha256', 'test-webhook-secret')
    .update(webhookTimestamp + webhookBody)
    .digest('base64');
  const webhookResponse = await fetch(`${baseUrl}/api/webhooks/cashfree`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-webhook-signature': webhookSignature,
      'x-webhook-timestamp': webhookTimestamp,
    },
    body: webhookBody,
  });
  assert.equal(webhookResponse.status, 200);
  assert.equal(store.getOrder(order.id)?.paymentStatus, 'paid');
});

test('staff authentication and role-restricted routes still work', async (t) => {
  const { baseUrl, close } = await startTestServer();
  t.after(close);

  const invalidPinResponse = await fetch(`${baseUrl}/api/auth/pin`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ pin: '0000' }),
  });
  assert.equal(invalidPinResponse.status, 401);

  const removedRolePinResponse = await fetch(`${baseUrl}/api/auth/pin`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ pin: '2345' }),
  });
  assert.equal(removedRolePinResponse.status, 401);

  const kitchenCookie = await loginWithPin(baseUrl, '3456');
  const sessionResponse = await fetch(`${baseUrl}/api/auth/session`, {
    headers: { Cookie: kitchenCookie },
  });
  assert.equal(sessionResponse.status, 200);
  const { session } = (await sessionResponse.json()) as { session: { role: string } };
  assert.equal(session.role, 'kitchen');

  const settingsResponse = await fetch(`${baseUrl}/api/settings/reset`, {
    method: 'POST',
    headers: { Cookie: kitchenCookie },
  });
  assert.equal(settingsResponse.status, 403);

  const adminCookie = await loginWithPin(baseUrl, '7777');
  const adminSettingsResponse = await fetch(`${baseUrl}/api/settings/reset`, {
    method: 'POST',
    headers: { Cookie: adminCookie },
  });
  assert.equal(adminSettingsResponse.status, 200);
});

test('table QR links remain independent of payment processing', () => {
  assert.equal(
    buildTableQrUrl('https://cafe.local/', 'T4'),
    'https://cafe.local/?autostart=1&screen=menu&table=T4'
  );
});

test('customers can reserve an available table with the selected guest and time details', async (t) => {
  const { baseUrl, store, close } = await startTestServer();
  t.after(close);

  store.addTable({
    id: 'T01',
    seats: 4,
    zone: 'Main Hall',
    floor: 'Floor 1 (Main Hall)',
  });
  const timeSlot = `${new Date().toISOString()} 7:00 PM`;
  const response = await fetch(`${baseUrl}/api/tables/reserve`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      guestName: 'Test Guest',
      guestPhone: '9876543210',
      partySize: 2,
      timeSlot,
    }),
  });

  assert.equal(response.status, 201);
  const result = (await response.json()) as {
    table: { id: string; status: string; reservedBy: string; reservedTime: string };
  };
  assert.equal(result.table.status, 'reserved');
  assert.equal(result.table.reservedBy, 'Test Guest');
  assert.equal(result.table.reservedTime, timeSlot);
});

test('legacy persisted gateway fields are dropped during cafe-state loading', async () => {
  const seed = new CafeStore(null);
  const firstOrder = await createTestOrder(seed);
  const directory = mkdtempSync(join(tmpdir(), 'cafe-store-migration-'));
  const snapshotPath = join(directory, 'state.json');
  try {
    writeFileSync(
      snapshotPath,
      JSON.stringify({
        ...seed.getBootstrap(),
        orders: [
          {
            ...firstOrder,
            rating: 5,
            paymentProvider: 'youpi-pg',
            paymentId: 'legacy-payment-id',
            paymentUtr: '123456789012',
            preferredUpiApp: 'paytm',
          },
        ],
        idempotencyOrderIds: {},
        youpiPayments: [{ id: 'legacy-payment-id' }],
        youpiWebhookDeliveries: [{ deliveryId: 'legacy-delivery-id' }],
        youpiUtrClaims: { '123456789012': { orderId: firstOrder.id, paymentId: 'legacy-payment-id' } },
      })
    );

    const migratedStore = new CafeStore(snapshotPath);
    const migratedOrder = migratedStore.getOrders()[0];
    assert.ok(migratedOrder);
    assert.equal('paymentProvider' in migratedOrder, false);
    assert.equal('paymentId' in migratedOrder, false);
    assert.equal('paymentUtr' in migratedOrder, false);
    assert.equal('preferredUpiApp' in migratedOrder, false);
    assert.equal(migratedOrder.loyaltyPointsAwarded, 25);

    migratedStore.flushToDiskSync();
    const persisted = JSON.parse(readFileSync(snapshotPath, 'utf8')) as Record<string, unknown>;
    assert.equal('youpiPayments' in persisted, false);
    assert.equal('youpiWebhookDeliveries' in persisted, false);
    assert.equal('youpiUtrClaims' in persisted, false);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test('menu item 86-ing stock toggle blocks ordering and re-enables properly', async (t) => {
  const gateway = new TestUpiGateway();
  const { baseUrl, store, close } = await startTestServer(gateway);
  t.after(close);

  // Mark item out of stock
  const toggled = store.toggleMenuItemAvailability('cold-coffee');
  assert.equal(toggled?.isAvailable, false);

  // Attempting to order sold out item must fail with HTTP 400
  const orderRes = await fetch(`${baseUrl}/api/orders`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      outletId: 'seth-sawariya-main',
      serviceMode: 'dine-in',
      tableNumber: 'T3',
      paymentMode: 'cash',
      items: [
        {
          menuItemId: 'cold-coffee',
          name: 'Cold Coffee',
          price: 129,
          quantity: 1,
          station: 'Barista',
          note: '',
          imageUrl: '',
        },
      ],
    }),
  });
  assert.equal(orderRes.status, 400);
  const errorBody = (await orderRes.json()) as { error: string };
  assert.match(errorBody.error, /sold out/i);

  // Toggle back to available
  const reenabled = store.toggleMenuItemAvailability('cold-coffee');
  assert.equal(reenabled?.isAvailable, true);

  // Now ordering succeeds
  const successRes = await fetch(`${baseUrl}/api/orders`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      outletId: 'seth-sawariya-main',
      serviceMode: 'dine-in',
      tableNumber: 'T3',
      paymentMode: 'cash',
      items: [
        {
          menuItemId: 'cold-coffee',
          name: 'Cold Coffee',
          price: 129,
          quantity: 1,
          station: 'Barista',
          note: '',
          imageUrl: '',
        },
      ],
    }),
  });
  assert.equal(successRes.status, 201);
});

test('customer order feedback records review and awards loyalty points', async (t) => {
  const gateway = new TestUpiGateway();
  const { baseUrl, store, close } = await startTestServer(gateway);
  t.after(close);

  const targetOrder = await createTestOrder(store);

  const initialPoints = store.getBootstrap().rewardPoints;

  const feedbackRes = await fetch(`${baseUrl}/api/orders/${targetOrder.id}/feedback`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      rating: 5,
      tags: ['☕ Great Coffee', '⚡ Fast Service'],
      comment: 'Best cappuccino and hazelnut brew in town!',
      customerPhone: '9876543210',
    }),
  });
  assert.equal(feedbackRes.status, 200);
  const body = (await feedbackRes.json()) as {
    ok: boolean;
    order: { rating: number; feedbackTags: string[]; feedbackComment: string };
    pointsAwarded: number;
  };
  assert.equal(body.ok, true);
  assert.equal(body.order.rating, 5);
  assert.equal(body.pointsAwarded, 25);
  assert.deepEqual(body.order.feedbackTags, ['☕ Great Coffee', '⚡ Fast Service']);

  // Verify reward points increased by 25
  const bootstrap = store.getBootstrap();
  assert.equal(bootstrap.rewardPoints, initialPoints + 25);

  // Verify point ledger has entry
  const latestEntry = bootstrap.pointLedger[0];
  assert.ok(latestEntry);
  assert.equal(latestEntry.pointsDelta, 25);
  assert.equal(latestEntry.orderId, targetOrder.id);
});

test('first-order discount is available once to an authenticated customer account', async () => {
  const store = new CafeStore(null);
  const priorCustomer = store.addCustomer({
    name: 'Existing Customer',
    phone: '9876543210',
    segment: 'regular',
    favorites: '',
    dpdpConsent: true,
  });
  await store.createOrder({
    outletId: 'seth-sawariya-main',
    serviceMode: 'takeaway',
    paymentMode: 'cash',
    couponCode: '',
    cookingNote: '',
    isPosTerminal: true,
    customerId: priorCustomer.id,
    items: [
      {
        menuItemId: TEST_MENU_ITEM.id,
        name: 'Cappuccino',
        price: 0,
        quantity: 1,
        note: '',
        imageUrl: '',
        station: 'Barista',
      },
    ],
  });
  const customerId = 'first-order-customer-test';
  const customerSession = {
    customerId,
    orderIds: [] as string[],
    issuedAt: Date.now(),
    exp: Date.now() + 60_000,
  };
  const customerActor = { staffSession: null, customerSession };
  assert.equal(store.getBootstrap(customerActor).firstOrderEligible, true);
  assert.equal(
    store.getBootstrap({
      staffSession: null,
      customerSession: { ...customerSession, customerId: 'guest_test' },
    }).firstOrderEligible,
    false
  );
  assert.equal(
    store.getBootstrap({
      staffSession: null,
      customerSession: {
        ...customerSession,
        customerId: 'new-account',
        crmCustomerId: priorCustomer.id,
      },
    }).firstOrderEligible,
    false
  );

  const orderInput = {
    outletId: 'seth-sawariya-main',
    serviceMode: 'takeaway' as const,
    paymentMode: 'cash' as const,
    couponCode: '',
    cookingNote: '',
    isPosTerminal: false,
    customerId,
    items: [
      {
        menuItemId: TEST_MENU_ITEM.id,
        name: 'Cappuccino',
        price: 0,
        quantity: 1,
        note: '',
        imageUrl: '',
        station: 'Barista' as const,
      },
    ],
  };
  const firstOrder = await store.createOrder(orderInput);
  assert.equal(firstOrder.order.discount, Math.round(firstOrder.order.subtotal * 0.2));

  const afterFirstOrder = {
    ...customerSession,
    orderIds: [firstOrder.order.id],
  };
  assert.equal(
    store.getBootstrap({ staffSession: null, customerSession: afterFirstOrder })
      .firstOrderEligible,
    false
  );
  const secondOrder = await store.createOrder(
    { ...orderInput, idempotencyKey: 'second-order-attempt' },
    undefined,
    undefined,
    afterFirstOrder.orderIds
  );
  assert.equal(secondOrder.order.discount, 0);
});

test('customers earn Beans once per order and redeem them on a later order', async (t) => {
  const gateway = new TestUpiGateway();
  const { baseUrl, store, close } = await startTestServer(gateway);
  t.after(close);

  const createCustomerOrder = (redeemPoints = 0) =>
    fetch(`${baseUrl}/api/orders`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        outletId: 'seth-sawariya-main',
        serviceMode: 'takeaway',
        paymentMode: 'cash',
        isPosTerminal: false,
        redeemPoints,
        items: [
          {
            menuItemId: TEST_MENU_ITEM.id,
            name: 'Cappuccino',
            price: 0,
            quantity: 1,
            note: '',
            imageUrl: '',
            station: 'Barista',
          },
        ],
      }),
    });

  const firstOrderResponse = await createCustomerOrder();
  assert.equal(firstOrderResponse.status, 201);
  const firstCookie = getCookieHeader(firstOrderResponse);
  const firstOrderBody = (await firstOrderResponse.json()) as {
    order: { id: string; discount: number };
  };
  assert.equal(firstOrderBody.order.discount, 0);
  store.updateOrderStatus(firstOrderBody.order.id, 'served');

  const feedbackResponse = await fetch(
    `${baseUrl}/api/orders/${firstOrderBody.order.id}/feedback`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Cookie: firstCookie },
      body: JSON.stringify({ rating: 5, comment: 'Great coffee!' }),
    }
  );
  assert.equal(feedbackResponse.status, 200);
  assert.equal(
    ((await feedbackResponse.json()) as { pointsAwarded: number }).pointsAwarded,
    25
  );
  const earnedBootstrapResponse = await fetch(`${baseUrl}/api/bootstrap?screen=tracking`, {
    headers: { Cookie: firstCookie },
  });
  const earnedBootstrap = (await earnedBootstrapResponse.json()) as { rewardPoints: number };
  assert.equal(earnedBootstrap.rewardPoints, 25);

  const duplicateFeedbackResponse = await fetch(
    `${baseUrl}/api/orders/${firstOrderBody.order.id}/feedback`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Cookie: firstCookie },
      body: JSON.stringify({ rating: 4, comment: 'Updated rating' }),
    }
  );
  assert.equal(duplicateFeedbackResponse.status, 200);
  assert.equal(
    ((await duplicateFeedbackResponse.json()) as { pointsAwarded: number }).pointsAwarded,
    0
  );

  const nextOrderResponse = await fetch(`${baseUrl}/api/orders`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Cookie: firstCookie },
    body: JSON.stringify({
      outletId: 'seth-sawariya-main',
      serviceMode: 'takeaway',
      paymentMode: 'cash',
      isPosTerminal: false,
      redeemPoints: 20,
      items: [
        {
          menuItemId: TEST_MENU_ITEM.id,
          name: 'Cappuccino',
          price: 0,
          quantity: 1,
          note: '',
          imageUrl: '',
          station: 'Barista',
        },
      ],
    }),
  });
  assert.equal(nextOrderResponse.status, 201);
  const nextOrderBody = (await nextOrderResponse.json()) as {
    order: { pointsRedeemed: number };
  };
  assert.equal(nextOrderBody.order.pointsRedeemed, 20);

  const bootstrapResponse = await fetch(`${baseUrl}/api/bootstrap?screen=cart`, {
    headers: { Cookie: getCookieHeader(nextOrderResponse) },
  });
  const bootstrap = (await bootstrapResponse.json()) as { rewardPoints: number };
  assert.equal(bootstrap.rewardPoints, 5);

  const overBalanceResponse = await fetch(`${baseUrl}/api/orders`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Cookie: getCookieHeader(nextOrderResponse) },
    body: JSON.stringify({
      outletId: 'seth-sawariya-main',
      serviceMode: 'takeaway',
      paymentMode: 'cash',
      isPosTerminal: false,
      redeemPoints: 10,
      items: [
        {
          menuItemId: TEST_MENU_ITEM.id,
          name: 'Cappuccino',
          price: 0,
          quantity: 1,
          note: '',
          imageUrl: '',
          station: 'Barista',
        },
      ],
    }),
  });
  assert.equal(overBalanceResponse.status, 400);
});

test('customer feedback is validated and recorded for the cafe team', async (t) => {
  const gateway = new TestUpiGateway();
  const { baseUrl, store, close } = await startTestServer(gateway);
  t.after(close);

  const feedbackRes = await fetch(`${baseUrl}/api/customer-feedback`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      customerName: 'Asha Patel',
      rating: 2,
      tags: ['⚡ Fast Service'],
      comment: 'The service was quick, but my meal was too cold.',
      dishName: 'Margherita Pizza',
      diningMode: 'dine-in',
    }),
  });

  assert.equal(feedbackRes.status, 201);
  const feedbackBody = (await feedbackRes.json()) as {
    ok: boolean;
    review: { customerName: string; rating: number; comment: string; dishName: string };
  };
  assert.equal(feedbackBody.ok, true);
  assert.equal(feedbackBody.review.customerName, 'Asha Patel');
  assert.equal(feedbackBody.review.rating, 2);
  assert.equal(feedbackBody.review.dishName, 'Margherita Pizza');
  assert.equal(store.getBootstrap().customerReviews[0]?.comment, 'The service was quick, but my meal was too cold.');
  const customerBootstrapRes = await fetch(`${baseUrl}/api/bootstrap?screen=home`);
  assert.equal(customerBootstrapRes.status, 200);
  const customerBootstrap = (await customerBootstrapRes.json()) as {
    customerReviews: Array<{ customerName: string; comment: string }>;
  };
  assert.equal(customerBootstrap.customerReviews[0]?.customerName, 'Asha Patel');

  const activity = store.getActivityLog()[0];
  assert.ok(activity);
  assert.equal(activity.type, 'feedback_received');
  assert.equal(activity.actorName, 'Asha Patel');
  assert.equal(activity.severity, 'warning');
  assert.match(activity.description, /Margherita Pizza/);
  assert.match(activity.description, /too cold/);

  const invalidRes = await fetch(`${baseUrl}/api/customer-feedback`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ customerName: 'Asha', rating: 6, comment: 'No' }),
  });
  assert.equal(invalidRes.status, 400);
});

test('segment offers are shown and redeemable only for matching CRM customers', async () => {
  const store = new CafeStore(null);
  const vipCustomer = store.addCustomer({
    name: 'Sam Lee',
    phone: '9876543210',
    segment: 'vip',
    favorites: 'Cold Coffee',
    dpdpConsent: true,
  });
  const generalCampaign = store.createCampaign({
    title: 'Cafe Special',
    code: 'CAFEALL',
    discountPercentage: 0,
    minimumOrderAmount: 0,
    validityLabel: 'This week',
    description: 'Current offer for all customers',
    targetSegment: 'all',
  });
  const vipCampaign = store.createCampaign({
    title: 'VIP Special',
    code: 'VIPONLY',
    discountPercentage: 20,
    minimumOrderAmount: 0,
    validityLabel: 'This week',
    description: 'Offer for VIP customers',
    targetSegment: 'vip',
  });
  const regularCampaign = store.createCampaign({
    title: 'Regular Special',
    code: 'REGONLY',
    discountPercentage: 0,
    minimumOrderAmount: 0,
    validityLabel: 'This week',
    description: 'Offer for regular customers',
    targetSegment: 'regular',
  });

  assert.equal(store.findCustomerIdByPhone('+91 98765 43210'), vipCustomer.id);
  const bootstrap = store.getBootstrap({
    staffSession: null,
    customerSession: {
      customerId: 'browser-customer',
      crmCustomerId: vipCustomer.id,
      orderIds: [],
      issuedAt: Date.now(),
      exp: Date.now() + 60_000,
    },
  });
  assert.deepEqual(
    bootstrap.campaigns.map((campaign) => campaign.id),
    [vipCampaign.id, generalCampaign.id]
  );
  assert.equal(
    bootstrap.campaigns.find((campaign) => campaign.id === vipCampaign.id)?.discountPercentage,
    20
  );

  await assert.rejects(
    store.createOrder(
      {
        outletId: 'seth-sawariya-main',
        serviceMode: 'takeaway',
        paymentMode: 'cash',
        couponCode: 'VIPONLY',
        cookingNote: '',
        isPosTerminal: false,
        items: [
          {
            menuItemId: TEST_MENU_ITEM.id,
            name: 'Cappuccino',
            price: 0,
            quantity: 1,
            note: '',
            imageUrl: '',
            station: 'Barista',
          },
        ],
      },
      'regular'
    ),
    /not available for your customer account/
  );
  assert.equal(
    store.getBootstrap().campaigns.some((campaign) => campaign.id === regularCampaign.id),
    true
  );
});

test('checkout rejects an unqualified Buy 5 Get 1 coupon and prices five medium coffees correctly', async () => {
  const directory = mkdtempSync(join(tmpdir(), 'cafe-campaign-checkout-'));
  try {
    const statePath = join(directory, 'state.json');
    writeFileSync(
      statePath,
      JSON.stringify({
        orders: [],
        tables: [],
        cafeSettings: INITIAL_CAFE_SETTINGS,
        campaigns: INITIAL_CAMPAIGNS,
      })
    );
    const store = new CafeStore(statePath);
    const createCoffeeOrder = (quantity: number) =>
      store.createOrder({
        outletId: 'seth-sawariya-main',
        serviceMode: 'takeaway',
        paymentMode: 'cash',
        couponCode: 'BUY5GET1',
        cookingNote: '',
        isPosTerminal: false,
        items: [
          {
            menuItemId: 'cold-coffee',
            name: 'Cold Coffee',
            price: 1,
            quantity,
            size: 'Medium',
            note: '',
            imageUrl: '',
            station: 'Barista',
          },
        ],
      });

    await assert.rejects(createCoffeeOrder(4), /Add 1 more Medium Cold Coffees/);

    const { order } = await createCoffeeOrder(5);
    assert.equal(order.items[0]?.price, 50);
    assert.equal(order.items[0]?.size, 'Medium');
    assert.equal(order.discount, 30);
    await store.flushToPersistence();
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test('order refund requires staff auth, updates paymentStatus to refunded, and records activity log', async (t) => {
  const gateway = new TestUpiGateway();
  const { baseUrl, store, close } = await startTestServer(gateway);
  t.after(close);

  const targetOrder = await createTestOrder(store);

  // 1. Unauthenticated request should fail
  const unauthRes = await fetch(`${baseUrl}/api/orders/${targetOrder.id}/refund`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ reason: 'Customer requested cancellation before prep' }),
  });
  assert.equal(unauthRes.status, 401);

  // 2. Authenticate as manager
  const cookie = await loginWithPin(baseUrl, '7777');

  // 3. Authenticated refund request
  const refundRes = await fetch(`${baseUrl}/api/orders/${targetOrder.id}/refund`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Cookie: cookie },
    body: JSON.stringify({ reason: 'Customer requested cancellation before prep' }),
  });
  assert.equal(refundRes.status, 200);
  const refundBody = (await refundRes.json()) as {
    ok: boolean;
    order: { paymentStatus: string; refundReason: string; refundAmount: number };
  };
  assert.equal(refundBody.ok, true);
  assert.equal(refundBody.order.paymentStatus, 'refunded');
  assert.equal(refundBody.order.refundReason, 'Customer requested cancellation before prep');
  assert.equal(refundBody.order.refundAmount, targetOrder.total);

  // 4. Verify activity log records this refund
  const actRes = await fetch(`${baseUrl}/api/activity-log`, {
    headers: { Cookie: cookie },
  });
  assert.equal(actRes.status, 200);
  const actBody = (await actRes.json()) as {
    ok: boolean;
    activities: Array<{ type: string; orderId?: string }>;
  };
  assert.equal(actBody.ok, true);
  const refundAct = actBody.activities.find((a) => a.type === 'order_refunded');
  assert.ok(refundAct);
  assert.equal(refundAct.orderId, targetOrder.id);
});

test('professional inventory operations record receipts, waste, counts, and purchase orders', () => {
  const store = new CafeStore(null);
  const milk = store.addIngredient({
    name: 'Test Milk',
    quantity: 10,
    unit: 'L',
    minThreshold: 2,
    supplier: 'Test Supplier',
    unitCost: 60,
  });

  store.receiveStock({
    ingredientId: milk.id,
    quantity: 5,
    unitCost: 58,
    supplier: 'Test Supplier',
    batchNumber: 'MILK-001',
    expiryDate: '2027-01-31',
    note: '',
  });
  assert.equal(store.getInventory().find((item) => item.id === milk.id)?.quantity, 15);

  store.recordWaste({
    ingredientId: milk.id,
    quantity: 2,
    reason: 'Spoilage',
  });
  assert.equal(store.getInventory().find((item) => item.id === milk.id)?.quantity, 13);

  const count = store.createStockCount({
    physicalCounts: [{ ingredientId: milk.id, physicalQuantity: 12 }],
    note: '',
  });
  assert.equal(count.lines[0].variance, -1);
  store.approveStockCount(count.id);
  assert.equal(store.getInventory().find((item) => item.id === milk.id)?.quantity, 12);

  const purchaseOrder = store.createPurchaseOrder({
    supplier: 'Test Supplier',
    note: '',
    lines: [{ ingredientId: milk.id, quantity: 20, unitCost: 58 }],
  });
  assert.equal(purchaseOrder.status, 'ordered');
  const received = store.receivePurchaseOrder({
    purchaseOrderId: purchaseOrder.id,
    receivedLines: [{ ingredientId: milk.id, quantity: 20, batchNumber: 'MILK-002' }],
  });
  assert.equal(received?.status, 'received');
  assert.equal(store.getInventory().find((item) => item.id === milk.id)?.quantity, 32);
  assert.ok(store.getStockMovements().some((movement) => movement.type === 'stock_count'));
  assert.ok(store.getInventoryBatches().some((batch) => batch.batchNumber === 'MILK-002'));

  const restocked = store.restockIngredient(milk.id, 3, 44, 'Test Admin');
  assert.equal(restocked?.quantity, 35);
  assert.equal(restocked?.unitCost, 44);
  const restockMovement = store
    .getStockMovements()
    .find((movement) => movement.ingredientId === milk.id && movement.note === 'Manual restock');
  assert.equal(restockMovement?.quantityDelta, 3);
  assert.equal(restockMovement?.unitCost, 44);
  assert.ok(
    store
      .getInventoryBatches()
      .some((batch) => batch.ingredientId === milk.id && batch.unitCost === 44)
  );
});

test('kitchen staff can raise stock alert and request reorder for low ingredients', async (t) => {
  const gateway = new TestUpiGateway();
  const { baseUrl, store, close } = await startTestServer(gateway);
  t.after(close);
  const milk = store.addIngredient({
    name: 'Milk',
    quantity: 1,
    unit: 'L',
    minThreshold: 2,
    supplier: 'Test supplier',
    unitCost: 1,
  });

  // Authenticate as kitchen (PIN: 3456)
  const kitchenCookie = await loginWithPin(baseUrl, '3456');

  // Request reorder for milk
  const reorderRes = await fetch(`${baseUrl}/api/inventory/request-reorder`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Cookie: kitchenCookie },
    body: JSON.stringify({
      id: milk.id,
      note: 'Only 1 carton remaining in hot station fridge',
    }),
  });
  assert.equal(reorderRes.status, 200);
  const reorderBody = (await reorderRes.json()) as {
    ok: boolean;
    item: { id: string; reorderRequested: boolean; reorderNote: string; status: string };
  };
  assert.equal(reorderBody.ok, true);
  assert.equal(reorderBody.item.reorderRequested, true);
  assert.equal(reorderBody.item.reorderNote, 'Only 1 carton remaining in hot station fridge');

  // Verify admin can see it in the activity log
  const adminCookie = await loginWithPin(baseUrl, '7777');
  const actRes = await fetch(`${baseUrl}/api/activity-log`, {
    headers: { Cookie: adminCookie },
  });
  assert.equal(actRes.status, 200);
  const actData = (await actRes.json()) as { activities: Array<{ title: string; type: string }> };
  const alertEvent = actData.activities.find((a) => a.title.includes('Kitchen Stock Alert: Milk'));
  assert.ok(alertEvent);

  // When admin restocks, reorderRequested is cleared
  const restockRes = await fetch(`${baseUrl}/api/inventory/${milk.id}/restock`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Cookie: adminCookie },
    body: JSON.stringify({ addedQty: 10, unitCost: 58 }),
  });
  assert.equal(restockRes.status, 200);
  const restockBody = (await restockRes.json()) as {
    item: { reorderRequested?: boolean; unitCost: number };
  };
  assert.equal(restockBody.item.reorderRequested, false);
  assert.equal(restockBody.item.unitCost, 58);
  const restockMovement = store
    .getStockMovements()
    .find((movement) => movement.ingredientId === milk.id && movement.note === 'Manual restock');
  assert.equal(restockMovement?.quantityDelta, 10);
  assert.equal(restockMovement?.unitCost, 58);
});

test('brevo confirmation endpoint never returns OTPs and reports missing provider credentials', async (t) => {
  const { baseUrl, close } = await startTestServer();
  t.after(close);

  const res = await fetch(`${baseUrl}/api/auth/brevo-confirmation`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      name: 'Aarav Patel',
      email: 'aarav@example.com',
      phone: '+91 98765 43210',
    }),
  });

  assert.equal(res.status, 503);
  const body = (await res.json()) as { error?: string; code?: string };
  assert.equal('code' in body, false);
  assert.match(body.error || '', /not configured/i);
});

test('admin brevo broadcast email endpoint validates admin auth and dispatches broadcast', async (t) => {
  const { baseUrl, close } = await startTestServer();
  t.after(close);

  // 1. Unauthenticated request must be blocked
  const unauthRes = await fetch(`${baseUrl}/api/admin/broadcast-email`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      subject: 'Weekend Special',
      heading: 'Roast Fest',
      message: 'Join us for a fresh artisanal roast experience.',
      targetSegment: 'all',
    }),
  });
  assert.equal(unauthRes.status, 401);

  // 2. Admin authenticated request succeeds
  const adminToken = signStaffSession({
    role: 'admin',
    staffName: 'Lead Admin',
    issuedAt: Date.now(),
    exp: Date.now() + 15 * 60 * 1000,
  });
  const authRes = await fetch(`${baseUrl}/api/admin/broadcast-email`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Cookie: `${STAFF_SESSION_COOKIE}=${adminToken}`,
    },
    body: JSON.stringify({
      subject: 'Weekend Special: 20% Off',
      heading: 'Artisanal Roasts Just For You',
      message: 'Enjoy handcrafted brews and gourmet bites this weekend.',
      targetSegment: 'all',
      promoCode: 'WEEKEND20',
      testEmail: 'preview@example.com',
    }),
  });

  assert.equal(authRes.status, 503);
  const authBody = (await authRes.json()) as { ok: boolean; error?: string };
  assert.equal(authBody.ok, false);
  assert.match(authBody.error || '', /not configured/i);
});

test('bill email endpoint requires staff authentication and reports disabled email provider', async (t) => {
  const { baseUrl, store, close } = await startTestServer();
  t.after(close);

  const order = await createTestOrder(store);
  const adminCookie = await loginWithPin(baseUrl, '7777');

  // 1. Invalid email returns 400
  const badEmailRes = await fetch(`${baseUrl}/api/orders/${order.id}/send-bill-email`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Cookie: adminCookie },
    body: JSON.stringify({ email: 'not-an-email' }),
  });
  assert.equal(badEmailRes.status, 400);

  // 2. Non-existent order returns 404
  const notFoundRes = await fetch(`${baseUrl}/api/orders/NON_EXISTENT_999/send-bill-email`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Cookie: adminCookie },
    body: JSON.stringify({ email: 'guest@example.com' }),
  });
  assert.equal(notFoundRes.status, 404);

  // 3. Valid order sends bill via Brevo
  const validRes = await fetch(`${baseUrl}/api/orders/${order.id}/send-bill-email`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Cookie: adminCookie },
    body: JSON.stringify({ email: 'guest@example.com', name: 'Rohan Sharma' }),
  });
  assert.equal(validRes.status, 503);
  const body = (await validRes.json()) as { error: string };
  assert.match(body.error, /not configured/i);
  assert.equal(store.getOrder(order.id)?.paidEmailSentAt, undefined);
});

test('payment status verified automatically dispatches order paid email', async (t) => {
  const gateway = new TestUpiGateway();
  const { baseUrl, store, close } = await startTestServer(gateway);
  t.after(close);

  // 1. Create order with customer email
  const createRes = await fetch(`${baseUrl}/api/orders`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      outletId: 'seth-sawariya-main',
      serviceMode: 'dine-in',
      tableNumber: 'T2',
      customerName: 'Aarav Patel',
      customerEmail: 'aarav.patel@example.com',
      paymentMode: 'upi',
      items: [
        {
          menuItemId: TEST_MENU_ITEM.id,
          name: 'Cappuccino',
          price: 150,
          quantity: 1,
          station: 'Barista',
        },
      ],
    }),
  });
  assert.equal(createRes.status, 201);
  const customerCookie = createRes.headers.get('set-cookie')?.split(';')[0] || '';
  const created = (await createRes.json()) as any;
  const orderId = created.order.id;
  assert.equal(created.order.paymentStatus, 'pending');
  assert.equal(created.order.paidEmailSentAt, undefined);

  // 2. Open payment session with UPI gateway
  const sessionRes = await fetch(`${baseUrl}/api/orders/${orderId}/payment-session`, {
    method: 'POST',
    headers: { Cookie: customerCookie },
  });
  assert.equal(sessionRes.status, 200);

  // 3. Mark payment as paid in the gateway (simulating user paying via UPI app)
  const clientOrderId = store.getOrCreateGatewayClientOrderId(orderId);
  assert.ok(clientOrderId);
  gateway.markPaid(clientOrderId);

  // 4. Poll / refresh payment status (verifying payment)
  const verifyRes = await fetch(`${baseUrl}/api/orders/${orderId}/payment-status`, {
    headers: { Cookie: customerCookie },
  });
  assert.equal(verifyRes.status, 200);
  const verifyBody = (await verifyRes.json()) as any;
  assert.equal(verifyBody.paymentStatus, 'paid');

  // 5. Wait a tick for async triggerOrderPaidEmailIfEligible to complete
  await new Promise((r) => setTimeout(r, 100));

  // 6. Email delivery is disabled without provider credentials.
  const updatedOrder = store.getOrder(orderId);
  assert.ok(updatedOrder);
  assert.equal(updatedOrder.paymentStatus, 'paid');
  assert.equal(updatedOrder.paidEmailSentAt, undefined);
});

test('customer signing in via Google automatically updates CRM and profile syncs to CRM', async () => {
  const { baseUrl, store, close } = await startTestServer();
  try {
    // 1. Google sign-in creates customer in CRM directory
    const googleRes = await fetch(`${baseUrl}/api/customer/google/session`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        demo: true,
        name: 'Ajay Vaishnav',
        email: 'ajayvaishnav8182@gmail.com',
      }),
    });
    assert.equal(googleRes.status, 200);
    const googleBody = (await googleRes.json()) as any;
    assert.ok(googleBody.session);
    assert.equal(googleBody.session.name, 'Ajay Vaishnav');
    assert.equal(googleBody.session.email, 'ajayvaishnav8182@gmail.com');

    // Verify customer exists in store's customer directory
    const crmCustomer = store.getCustomers().find((c) => c.email === 'ajayvaishnav8182@gmail.com');
    assert.ok(crmCustomer, 'Customer should exist in CRM store');
    assert.equal(crmCustomer.name, 'Ajay Vaishnav');
    assert.equal(crmCustomer.provider, 'google');
    assert.equal(crmCustomer.emailVerified, true);

    // 2. Customer updates profile (adds phone and address/note)
    const unauthorizedProfileRes = await fetch(`${baseUrl}/api/customer/profile`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        customerId: googleBody.session.id,
        phone: '1111111111',
      }),
    });
    assert.equal(unauthorizedProfileRes.status, 401);

    const customerCookie = googleRes.headers.get('set-cookie')?.split(';')[0] || '';
    const profileRes = await fetch(`${baseUrl}/api/customer/profile`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Cookie: customerCookie },
      body: JSON.stringify({
        customerId: googleBody.session.id,
        name: 'Ajay V.',
        phone: '9876543210',
        email: 'ajayvaishnav8182@gmail.com',
        note: 'Table 4 Regular',
      }),
    });
    assert.equal(profileRes.status, 200);
    const profileBody = (await profileRes.json()) as any;
    assert.equal(profileBody.customer.name, 'Ajay V.');
    assert.equal(profileBody.customer.phone, '9876543210');

    // Verify CRM record updated
    const updatedCustomer = store.getCustomers().find((c) => c.email === 'ajayvaishnav8182@gmail.com');
    assert.ok(updatedCustomer);
    assert.equal(updatedCustomer.name, 'Ajay V.');
    assert.equal(updatedCustomer.phone, '9876543210');
    assert.equal(updatedCustomer.note, 'Table 4 Regular');
  } finally {
    await close();
  }
});

test('google session extracts phone number from Google People API if permission granted', async () => {
  const origClientId = process.env.VITE_GOOGLE_CLIENT_ID;
  process.env.VITE_GOOGLE_CLIENT_ID = 'test-client-id.apps.googleusercontent.com';
  const { baseUrl, store, close } = await startTestServer();
  const originalFetch = global.fetch;

  // Mock Google Userinfo and People API responses
  global.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
    const urlStr = typeof input === 'string' ? input : input.toString();
    if (urlStr.includes('/oauth2/v3/userinfo')) {
      return new Response(
        JSON.stringify({
          sub: 'google-sub-999',
          email: 'rajesh.sharma@gmail.com',
          name: 'Rajesh Sharma',
          picture: 'https://lh3.googleusercontent.com/a/rajesh',
          email_verified: true,
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } }
      );
    }
    if (urlStr.includes('people.googleapis.com/v1/people/me')) {
      return new Response(
        JSON.stringify({
          phoneNumbers: [
            {
              value: '+91 99887 76655',
              type: 'mobile',
            },
          ],
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } }
      );
    }
    return originalFetch(input, init);
  };

  try {
    const res = await originalFetch(`${baseUrl}/api/customer/google/session`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ accessToken: 'fake-google-access-token' }),
    });
    assert.equal(res.status, 200);
    const body = (await res.json()) as any;
    assert.equal(body.session.phone, '9988776655');

    const customer = store.getCustomers().find((c) => c.email === 'rajesh.sharma@gmail.com');
    assert.ok(customer);
    assert.equal(customer.phone, '9988776655');
    assert.equal(customer.phoneVerified, true);
  } finally {
    global.fetch = originalFetch;
    process.env.VITE_GOOGLE_CLIENT_ID = origClientId;
    await close();
  }
});

test('UPI payment gateway automatically captures customer phone number and syncs to CRM profile', async () => {
  const gateway = new CashfreeGateway({
    appId: 'CF_SANDBOX_TEST',
    secretKey: 'test-secret',
    webhookSecret: 'test-webhook-secret',
    environment: 'SANDBOX',
  });
  const { baseUrl, store, close } = await startTestServer(gateway);

  try {
    // 1. Customer signs in with Google (has name & email, but NO phone yet)
    const customer = store.upsertGoogleCustomer({
      id: 'google:sub_12345',
      name: 'Pooja Verma',
      email: 'pooja.verma@example.com',
      phone: '',
      createdAt: new Date().toISOString(),
    });
    assert.equal(customer.phone, '');

    // 2. Customer places an order
    const orderRes = await fetch(`${baseUrl}/api/orders`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        serviceMode: 'takeaway',
        customerName: customer.name,
        customerEmail: customer.email,
        customerId: customer.id,
        items: [
          {
            menuItemId: 'cold-coffee',
            name: 'Cold Coffee',
            price: 129,
            quantity: 1,
            station: 'Barista',
          },
        ],
        idempotencyKey: 'test-auto-phone-capture',
      }),
    });
    assert.equal(orderRes.status, 201);
    const customerCookie = getCookieHeader(orderRes);
    const { order } = (await orderRes.json()) as { order: CafeOrder };
    assert.ok(order?.id);

    // 3. Customer initiates UPI Payment Session
    const sessionRes = await fetch(`${baseUrl}/api/orders/${order.id}/payment-session`, {
      method: 'POST',
      headers: { Cookie: customerCookie },
    });
    assert.equal(sessionRes.status, 200);

    const clientOrderId = store.getOrCreateGatewayClientOrderId(order.id);
    assert.ok(clientOrderId);

    // 4. Customer pays via Google Pay / PhonePe (Simulated Gateway Success with verified mobile)
    const mockPaymentResponse = await fetch(`${baseUrl}/api/cashfree-mock/pay`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        orderId: clientOrderId,
        session: 'test-session',
        payerPhone: '9876543210',
      }),
      redirect: 'manual',
    });
    assert.equal(mockPaymentResponse.status, 302);

    const returnLocation = mockPaymentResponse.headers.get('location') || '';
    await fetch(`${baseUrl}${returnLocation}`, { redirect: 'manual' });

    // 5. Verify order is paid AND customer's phone is automatically synced in CRM!
    const updatedOrder = store.getOrder(order.id);
    assert.equal(updatedOrder?.paymentStatus, 'paid');
    assert.equal(updatedOrder?.customerPhone, '9876543210');

    const updatedCustomer = store.getCustomers().find((c) => c.id === customer.id);
    assert.ok(updatedCustomer);
    assert.equal(updatedCustomer.phone, '9876543210');
    assert.equal(updatedCustomer.phoneVerified, false);
  } finally {
    await close();
  }
});
