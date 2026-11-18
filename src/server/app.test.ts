import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import type { AddressInfo } from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createCafeServer } from './app';
import { CafeStore } from './store';
import { buildTableQrUrl } from '../shared/upi';
import type { UpiGatewayClient, UpiGatewayOrder } from './upiGateway';

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

test('health and public bootstrap remain available and retired YouPI routes stay removed', async (t) => {
  const { baseUrl, close } = await startTestServer();
  t.after(close);

  const healthResponse = await fetch(`${baseUrl}/api/health`);
  assert.equal(healthResponse.status, 200);
  const health = (await healthResponse.json()) as { ok: boolean; service: string };
  assert.equal(health.ok, true);
  assert.equal(health.service, 'seth-sawariya-cafeos');

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

test('order creation enforces catalog prices, idempotency, and customer scoping', async (t) => {
  const { baseUrl, close } = await startTestServer();
  t.after(close);

  const payload = {
    serviceMode: 'takeaway',
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
      items: Array<{ name: string; price: number }>;
    };
    duplicate: boolean;
  };
  assert.equal(created.duplicate, false);
  assert.equal(created.order.total, 258);
  assert.equal(created.order.items[0]?.price, 129);
  assert.equal(created.order.items[0]?.name, 'Cold Coffee');
  assert.match(created.order.customerId, /^guest_/);
  assert.equal('paymentProvider' in created.order, false);

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

  const customerBootstrapResponse = await fetch(`${baseUrl}/api/bootstrap`, {
    headers: { Cookie: customerCookie },
  });
  const customerBootstrap = (await customerBootstrapResponse.json()) as {
    orders: Array<{ id: string }>;
    customers: unknown[];
  };
  assert.deepEqual(customerBootstrap.orders.map((order) => order.id), [created.order.id]);
  assert.deepEqual(customerBootstrap.customers, []);
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
          menuItemId: 'cappuccino',
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

  gateway.markPaid(order.id);
  const paymentStatusResponse = await fetch(
    `${baseUrl}/api/orders/${order.id}/payment-status`,
    { headers: { Cookie: customerCookie } }
  );
  assert.equal(paymentStatusResponse.status, 200);
  assert.deepEqual(await paymentStatusResponse.json(), { paymentStatus: 'paid' });
  assert.equal(store.getOrder(order.id)?.paymentStatus, 'paid');

  const timestamp = String(Math.floor(Date.now() / 1000));
  const body = JSON.stringify({
    event_id: 'gateway-event-1',
    event: 'order.paid',
    data: {
      order_id: 'GW1',
      client_order_id: order.id,
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

test('staff authentication and role-restricted routes still work', async (t) => {
  const { baseUrl, close } = await startTestServer();
  t.after(close);

  const invalidPinResponse = await fetch(`${baseUrl}/api/auth/pin`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ pin: '0000' }),
  });
  assert.equal(invalidPinResponse.status, 401);

  const cashierCookie = await loginWithPin(baseUrl, '2345');
  const sessionResponse = await fetch(`${baseUrl}/api/auth/session`, {
    headers: { Cookie: cashierCookie },
  });
  assert.equal(sessionResponse.status, 200);
  const { session } = (await sessionResponse.json()) as { session: { role: string } };
  assert.equal(session.role, 'cashier');

  const settingsResponse = await fetch(`${baseUrl}/api/settings/reset`, {
    method: 'POST',
    headers: { Cookie: cashierCookie },
  });
  assert.equal(settingsResponse.status, 403);

  const managerCookie = await loginWithPin(baseUrl, '1234');
  const managerSettingsResponse = await fetch(`${baseUrl}/api/settings/reset`, {
    method: 'POST',
    headers: { Cookie: managerCookie },
  });
  assert.equal(managerSettingsResponse.status, 200);
});

test('table QR links remain independent of payment processing', () => {
  assert.equal(
    buildTableQrUrl('https://cafe.local/', 'T4'),
    'https://cafe.local/?autostart=1&screen=menu&table=T4'
  );
});

test('legacy persisted gateway fields are dropped during cafe-state loading', () => {
  const seed = new CafeStore(null);
  const firstOrder = seed.getOrders()[0];
  assert.ok(firstOrder);
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

  const orders = store.getOrders();
  const targetOrder = orders[0];
  assert.ok(targetOrder);

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
  assert.deepEqual(await feedbackRes.json(), { ok: true });
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

test('order refund requires staff auth, updates paymentStatus to refunded, and records activity log', async (t) => {
  const gateway = new TestUpiGateway();
  const { baseUrl, store, close } = await startTestServer(gateway);
  t.after(close);

  const orders = store.getOrders();
  const targetOrder = orders[0];
  assert.ok(targetOrder);

  // 1. Unauthenticated request should fail
  const unauthRes = await fetch(`${baseUrl}/api/orders/${targetOrder.id}/refund`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ reason: 'Customer requested cancellation before prep' }),
  });
  assert.equal(unauthRes.status, 401);

  // 2. Authenticate as manager
  const cookie = await loginWithPin(baseUrl, '1234');

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

test('kitchen staff can raise stock alert and request reorder for low ingredients', async (t) => {
  const gateway = new TestUpiGateway();
  const { baseUrl, close } = await startTestServer(gateway);
  t.after(close);

  // Authenticate as barista (PIN: 3456)
  const baristaCookie = await loginWithPin(baseUrl, '3456');

  // Request reorder for milk
  const reorderRes = await fetch(`${baseUrl}/api/inventory/request-reorder`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Cookie: baristaCookie },
    body: JSON.stringify({
      id: 'ing-milk',
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

  // Verify manager can see it in activity log
  const managerCookie = await loginWithPin(baseUrl, '1234');
  const actRes = await fetch(`${baseUrl}/api/activity-log`, {
    headers: { Cookie: managerCookie },
  });
  assert.equal(actRes.status, 200);
  const actData = (await actRes.json()) as { activities: Array<{ title: string; type: string }> };
  const alertEvent = actData.activities.find((a) => a.title.includes('Kitchen Stock Alert: Milk'));
  assert.ok(alertEvent);

  // When manager restocks, reorderRequested is cleared
  const restockRes = await fetch(`${baseUrl}/api/inventory/ing-milk/restock`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Cookie: managerCookie },
    body: JSON.stringify({ addedQty: 10 }),
  });
  assert.equal(restockRes.status, 200);
  const restockBody = (await restockRes.json()) as { item: { reorderRequested?: boolean } };
  assert.equal(restockBody.item.reorderRequested, false);
});
