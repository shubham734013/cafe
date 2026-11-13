import test from 'node:test';
import assert from 'node:assert/strict';
import type { AddressInfo } from 'node:net';
import { createCafeServer } from './app';
import { CafeStore } from './store';
import { INITIAL_CAFE_SETTINGS } from '../data/cafeSeedData';
import {
  buildTableQrUrl,
  buildTableSeatOrderPath,
  buildTableSeatOrderUrl,
  buildUpiPaymentUri,
} from '../shared/upi';
import { buildOrdersExcelBuffer } from '../utils/exporters';

async function startTestServer() {
  const store = new CafeStore(null);
  const bundle = createCafeServer(store);
  await new Promise<void>((resolve) => {
    bundle.httpServer.listen(0, '127.0.0.1', () => resolve());
  });
  const addr = bundle.httpServer.address() as AddressInfo;
  const baseUrl = `http://127.0.0.1:${addr.port}`;
  const close = async () => {
    await new Promise<void>((resolve, reject) => {
      bundle.io.close();
      bundle.httpServer.close((err) => (err ? reject(err) : resolve()));
    });
  };
  return { baseUrl, store, paymentService: bundle.paymentService, close };
}

function getCookieHeader(res: Response): string {
  const getSetCookie = (res.headers as unknown as { getSetCookie?: () => string[] }).getSetCookie;
  if (typeof getSetCookie === 'function') {
    const cookies = getSetCookie.call(res.headers);
    if (cookies.length > 0) {
      return cookies.map((c) => c.split(';')[0]).join('; ');
    }
  }
  const raw = res.headers.get('set-cookie') ?? '';
  return raw ? raw.split(';')[0] ?? '' : '';
}

async function loginWithPin(baseUrl: string, pin: string): Promise<string> {
  const res = await fetch(`${baseUrl}/api/auth/pin`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ pin }),
  });
  assert.equal(res.status, 200);
  return getCookieHeader(res);
}

test('GET /api/health, /api/openapi.json, and /api/bootstrap scrub unauthenticated PII and return full data for staff', async (t) => {
  const { baseUrl, close } = await startTestServer();
  t.after(close);

  const healthRes = await fetch(`${baseUrl}/api/health`);
  assert.equal(healthRes.status, 200);
  const health = (await healthRes.json()) as { ok: boolean; service: string };
  assert.equal(health.ok, true);
  assert.equal(health.service, 'seth-sawariya-cafeos');

  const specRes = await fetch(`${baseUrl}/api/openapi.json`);
  assert.equal(specRes.status, 200);
  const spec = (await specRes.json()) as { openapi: string; paths: Record<string, unknown> };
  assert.equal(spec.openapi, '3.0.3');
  assert.ok('/orders' in spec.paths);

  // Unauthenticated bootstrap returns public menu & scrubbed tables with zero PII
  const unauthBootRes = await fetch(`${baseUrl}/api/bootstrap`);
  assert.equal(unauthBootRes.status, 200);
  const unauthBoot = (await unauthBootRes.json()) as {
    outletId: string;
    orders: unknown[];
    customers: unknown[];
    staffRoster: unknown[];
    tables: Array<{ reservedBy?: string }>;
    menuItems: unknown[];
  };
  assert.equal(unauthBoot.outletId, 'seth-sawariya-main');
  assert.equal(unauthBoot.orders.length, 0);
  assert.equal(unauthBoot.customers.length, 0);
  assert.equal(unauthBoot.staffRoster.length, 0);
  assert.ok(unauthBoot.tables.length > 0);
  assert.ok(unauthBoot.tables.every((tb) => tb.reservedBy === undefined));
  assert.ok(unauthBoot.menuItems.length > 0);

  // Unknown /api/* route returns explicit JSON 404
  const notFoundRes = await fetch(`${baseUrl}/api/non-existent-endpoint`);
  assert.equal(notFoundRes.status, 404);
  const notFoundJson = (await notFoundRes.json()) as { error: string };
  assert.match(notFoundJson.error, /not found/i);

  // Authenticated staff bootstrap includes orders, customers, and roster
  const staffCookie = await loginWithPin(baseUrl, '1234');
  const authBootRes = await fetch(`${baseUrl}/api/bootstrap`, {
    headers: { Cookie: staffCookie },
  });
  assert.equal(authBootRes.status, 200);
  const authBoot = (await authBootRes.json()) as {
    orders: unknown[];
    customers: unknown[];
    staffRoster: unknown[];
  };
  assert.ok(authBoot.orders.length > 0);
  assert.ok(authBoot.customers.length > 0);
  assert.ok(authBoot.staffRoster.length > 0);
});

test('POST /api/orders supports Zod validation, idempotency, and KOT advance releasing dine-in table', async (t) => {
  const { baseUrl, store, close } = await startTestServer();
  t.after(close);

  const staffCookie = await loginWithPin(baseUrl, '1234');

  // Invalid empty payload -> 400 Zod error
  const badRes = await fetch(`${baseUrl}/api/orders`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ serviceMode: 'dine-in', items: [], paymentMode: 'upi' }),
  });
  assert.equal(badRes.status, 400);
  const badBody = (await badRes.json()) as { error: string };
  assert.match(badBody.error, /at least one item/i);

  const payload = {
    serviceMode: 'dine-in',
    tableNumber: 'T2',
    items: [
      {
        menuItemId: 'cold-coffee',
        name: 'Cold Coffee',
        price: 129,
        quantity: 2,
        station: 'Barista',
      },
    ],
    paymentMode: 'upi',
    idempotencyKey: 'test-order-key-001',
  };

  const createRes = await fetch(`${baseUrl}/api/orders`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  assert.equal(createRes.status, 201);
  const created = (await createRes.json()) as {
    order: { id: string; status: string };
    duplicate: boolean;
  };
  assert.equal(created.duplicate, false);
  assert.equal(created.order.status, 'placed');

  // Duplicate idempotency retry -> 200 with same order ID
  const dupRes = await fetch(`${baseUrl}/api/orders`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  assert.equal(dupRes.status, 200);
  const dupBody = (await dupRes.json()) as { order: { id: string }; duplicate: boolean };
  assert.equal(dupBody.duplicate, true);
  assert.equal(dupBody.order.id, created.order.id);

  // Advance placed -> preparing -> ready -> served and ensure table frees up
  for (const expectedStatus of ['preparing', 'ready', 'served']) {
    const advRes = await fetch(`${baseUrl}/api/orders/${created.order.id}/advance`, {
      method: 'POST',
      headers: { Cookie: staffCookie },
    });
    assert.equal(advRes.status, 200);
    const advBody = (await advRes.json()) as { order: { status: string } };
    assert.equal(advBody.order.status, expectedStatus);
  }

  const t2 = store.getBootstrap().tables.find((tb) => tb.id === 'T2');
  assert.equal(t2?.status, 'available');
});

test('Table creation, duplicate conflict, transfer, merge, and customer reservation work cleanly', async (t) => {
  const { baseUrl, store, close } = await startTestServer();
  t.after(close);

  const managerCookie = await loginWithPin(baseUrl, '1234');

  const addRes = await fetch(`${baseUrl}/api/tables`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Cookie: managerCookie },
    body: JSON.stringify({
      id: 'T19',
      seats: 4,
      zone: 'Indoor Dining',
      floor: 'Floor 1 (Main Hall)',
    }),
  });
  assert.equal(addRes.status, 201);

  const dupRes = await fetch(`${baseUrl}/api/tables`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Cookie: managerCookie },
    body: JSON.stringify({
      id: 'T19',
      seats: 4,
      zone: 'Indoor Dining',
      floor: 'Floor 1 (Main Hall)',
    }),
  });
  assert.equal(dupRes.status, 409);

  // Guest booth reservation works publicly and reserves T19 or available table
  const reserveRes = await fetch(`${baseUrl}/api/tables/reserve`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      guestName: 'Meera Nair',
      guestPhone: '9876543210',
      partySize: 4,
      timeSlot: '8:00 PM',
      tableId: 'T19',
    }),
  });
  assert.equal(reserveRes.status, 201);
  const reservedJson = (await reserveRes.json()) as { table: { id: string; status: string; reservedBy?: string } };
  assert.equal(reservedJson.table.id, 'T19');
  assert.equal(reservedJson.table.status, 'reserved');
  assert.equal(reservedJson.table.reservedBy, 'Meera Nair');

  // Check in T19 and transfer to T2 (after resetting or checking T19 -> T1 etc.)
  const checkInT19 = await fetch(`${baseUrl}/api/tables/T19/check-in`, {
    method: 'POST',
    headers: { Cookie: managerCookie },
  });
  assert.equal(checkInT19.status, 200);

  const transferRes = await fetch(`${baseUrl}/api/tables/transfer`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Cookie: managerCookie },
    body: JSON.stringify({ sourceTableId: 'T19', targetTableId: 'T1' }),
  });
  assert.equal(transferRes.status, 200);

  const tablesAfterTransfer = store.getBootstrap().tables;
  assert.equal(tablesAfterTransfer.find((tb) => tb.id === 'T19')?.status, 'available');
  assert.equal(tablesAfterTransfer.find((tb) => tb.id === 'T1')?.status, 'occupied');

  // Merge T1 back into T19
  const mergeRes = await fetch(`${baseUrl}/api/tables/merge`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Cookie: managerCookie },
    body: JSON.stringify({ sourceTableId: 'T1', targetTableId: 'T19' }),
  });
  assert.equal(mergeRes.status, 200);
  const tablesAfterMerge = store.getBootstrap().tables;
  assert.equal(tablesAfterMerge.find((tb) => tb.id === 'T1')?.status, 'available');
  assert.equal(tablesAfterMerge.find((tb) => tb.id === 'T19')?.status, 'occupied');
});

test('POST /api/auth/pin sets HTTP-only cookie for 1234 and rejects invalid PIN; DPDP export works', async (t) => {
  const { baseUrl, store, close } = await startTestServer();
  t.after(close);

  const badPinRes = await fetch(`${baseUrl}/api/auth/pin`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ pin: '9999' }),
  });
  assert.equal(badPinRes.status, 401);

  const goodPinRes = await fetch(`${baseUrl}/api/auth/pin`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ pin: '1234' }),
  });
  assert.equal(goodPinRes.status, 200);
  const setCookie = goodPinRes.headers.get('set-cookie') ?? '';
  assert.match(setCookie, /cafeos_staff_session=/);
  assert.match(setCookie.toLowerCase(), /httponly/);
  const staffCookie = getCookieHeader(goodPinRes);

  const firstCustomer = store.getBootstrap().customers[0];
  assert.ok(firstCustomer);
  const exportRes = await fetch(`${baseUrl}/api/customers/${firstCustomer.id}/export`, {
    headers: { Cookie: staffCookie },
  });
  assert.equal(exportRes.status, 200);
  const exportJson = (await exportRes.json()) as {
    outletId: string;
    dpdpNotice: string;
    profile: { id: string };
  };
  assert.equal(exportJson.outletId, 'seth-sawariya-main');
  assert.equal(exportJson.profile.id, firstCustomer.id);
  assert.match(exportJson.dpdpNotice, /Right to Access/i);
});

test('UPI URI builder, table QR URL builder, and ExcelJS export produce valid outputs', async () => {
  const upiUri = buildUpiPaymentUri({
    payeeName: 'Seth Sawariya Cafe',
    amountInr: 420.5,
    transactionRef: 'SSCB421',
  });
  assert.ok(upiUri.startsWith('upi://pay?'));
  assert.match(upiUri, /am=420\.50/);
  assert.match(upiUri, /cu=INR/);

  const qrUrl = buildTableQrUrl('https://cafe.local/', 'T4');
  assert.equal(qrUrl, 'https://cafe.local/?autostart=1&screen=menu&table=T4');

  const store = new CafeStore(null);
  const xlsxBytes = await buildOrdersExcelBuffer(store.getOrders());
  assert.ok(xlsxBytes instanceof Uint8Array);
  assert.ok(xlsxBytes.byteLength > 100);
  // .xlsx is a ZIP archive starting with 'PK' (0x50, 0x4b)
  assert.equal(xlsxBytes[0], 0x50);
  assert.equal(xlsxBytes[1], 0x4b);
});

test('YouPI-PG full flow: create UPI session, idempotency, signed OBSERVED_SUCCESS -> RECONCILED webhook, and customer history', async (t) => {
  const { computeYoupiHmacSha256, computeYoupiV2HmacSha256 } = await import(
    '../payments/webhookHandler'
  );
  const store = new CafeStore(null);
  const webhookSecret = 'integration-test-secret';
  const bundle = createCafeServer(store, { webhookSecret, enableReconciliationJob: false });
  await new Promise<void>((resolve) => {
    bundle.httpServer.listen(0, '127.0.0.1', () => resolve());
  });
  const addr = bundle.httpServer.address() as AddressInfo;
  const baseUrl = `http://127.0.0.1:${addr.port}`;
  t.after(async () => {
    await new Promise<void>((resolve, reject) => {
      bundle.io.close();
      bundle.httpServer.close((err) => (err ? reject(err) : resolve()));
    });
  });

  // 1. Create customer UPI order (points deferred until YouPI settlement)
  const initialPoints = store.getBootstrap().rewardPoints;
  const orderRes = await fetch(`${baseUrl}/api/orders`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      serviceMode: 'takeaway',
      customerId: 'cust-1',
      items: [
        {
          menuItemId: 'cold-coffee',
          name: 'Cold Coffee',
          price: 129,
          quantity: 2,
          station: 'Barista',
        },
      ],
      paymentMode: 'upi',
      idempotencyKey: 'youpi-order-1',
    }),
  });
  assert.equal(orderRes.status, 201);
  const customerCookie = getCookieHeader(orderRes);
  assert.ok(customerCookie.includes('cafeos_customer_session='));
  const { order } = (await orderRes.json()) as {
    order: { id: string; total: number; paymentStatus: string };
  };
  assert.equal(order.paymentStatus, 'pending');
  assert.equal(store.getBootstrap().rewardPoints, initialPoints);

  // 2. Create YouPI-PG session with Idempotency-Key (amount calculated on server)
  const payRes = await fetch(`${baseUrl}/api/payments`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Idempotency-Key': 'yp-idem-001',
      Cookie: customerCookie,
    },
    body: JSON.stringify({ orderId: order.id, customerId: 'cust-1' }),
  });
  assert.equal(payRes.status, 201);
  const { payment } = (await payRes.json()) as {
    payment: { id: string; gatewayPaymentId: string; amountPaise: number; status: string };
  };
  assert.equal(payment.amountPaise, Math.round(order.total * 100));
  assert.equal(payment.status, 'active');

  // Repeat with same Idempotency-Key -> 200 duplicate
  const dupPayRes = await fetch(`${baseUrl}/api/payments`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Idempotency-Key': 'yp-idem-001',
      Cookie: customerCookie,
    },
    body: JSON.stringify({ orderId: order.id, customerId: 'cust-1' }),
  });
  assert.equal(dupPayRes.status, 200);
  const dupPayJson = (await dupPayRes.json()) as { duplicate: boolean; payment: { id: string } };
  assert.equal(dupPayJson.duplicate, true);
  assert.equal(dupPayJson.payment.id, payment.id);

  // 3. Unsigned or invalid webhook -> 401
  const badWebhookRes = await fetch(`${baseUrl}/api/webhooks/youpi`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-Gateway-Signature': 'sha256=deadbeef' },
    body: JSON.stringify({ event: 'RECONCILED', paymentId: payment.gatewayPaymentId, orderId: order.id, amountPaise: payment.amountPaise }),
  });
  assert.equal(badWebhookRes.status, 401);

  // 4. Signed OBSERVED_SUCCESS webhook -> moves to 'observed' (NOT 'paid') and records UTR
  const nowTs = String(Date.now());
  const observedBody = JSON.stringify({
    event: 'OBSERVED_SUCCESS',
    paymentId: payment.gatewayPaymentId,
    orderId: order.id,
    amount: (payment.amountPaise / 100).toFixed(2),
    amountPaise: payment.amountPaise,
    currency: 'INR',
    settlementState: 'NOT_RECONCILED',
    utr: '429812345601',
    deliveryId: 'dlv_obs_001',
    verificationLevel: 2,
    verificationSources: ['ANDROID_SMS', 'GMAIL_ALERT'],
    timestamp: Number(nowTs),
  });
  const obsRes = await fetch(`${baseUrl}/api/webhooks/youpi`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Gateway-Signature': computeYoupiHmacSha256(observedBody, webhookSecret),
      'X-Gateway-Signature-V2': computeYoupiV2HmacSha256(observedBody, nowTs, webhookSecret),
      'X-Gateway-Timestamp': nowTs,
      'X-Gateway-Delivery-Id': 'dlv_obs_001',
    },
    body: observedBody,
  });
  assert.equal(obsRes.status, 200);
  const obsOrder = store.getOrders().find((o) => o.id === order.id);
  assert.equal(obsOrder?.paymentStatus, 'observed');
  assert.equal(store.getBootstrap().rewardPoints, initialPoints);

  // Duplicate deliveryId -> ignored idempotently
  const dupObsRes = await fetch(`${baseUrl}/api/webhooks/youpi`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Gateway-Signature': computeYoupiHmacSha256(observedBody, webhookSecret),
      'X-Gateway-Signature-V2': computeYoupiV2HmacSha256(observedBody, nowTs, webhookSecret),
      'X-Gateway-Timestamp': nowTs,
      'X-Gateway-Delivery-Id': 'dlv_obs_001',
    },
    body: observedBody,
  });
  assert.equal(dupObsRes.status, 200);
  const dupObsBody = (await dupObsRes.json()) as { duplicate?: boolean };
  assert.equal(dupObsBody.duplicate, true);

  // 5. Signed RECONCILED webhook -> marks order 'paid' and awards loyalty points once
  const recBody = JSON.stringify({
    event: 'RECONCILED',
    paymentId: payment.gatewayPaymentId,
    orderId: order.id,
    amount: (payment.amountPaise / 100).toFixed(2),
    amountPaise: payment.amountPaise,
    currency: 'INR',
    settlementState: 'RECONCILED',
    utr: '429812345601',
    deliveryId: 'dlv_rec_001',
    timestamp: Number(nowTs),
  });
  const recRes = await fetch(`${baseUrl}/api/webhooks/youpi`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Gateway-Signature': computeYoupiHmacSha256(recBody, webhookSecret),
      'X-Gateway-Signature-V2': computeYoupiV2HmacSha256(recBody, nowTs, webhookSecret),
      'X-Gateway-Timestamp': nowTs,
      'X-Gateway-Delivery-Id': 'dlv_rec_001',
    },
    body: recBody,
  });
  assert.equal(recRes.status, 200);
  const paidOrder = store.getOrders().find((o) => o.id === order.id);
  assert.equal(paidOrder?.paymentStatus, 'paid');
  assert.ok(store.getBootstrap().rewardPoints > initialPoints);

  // 6. Customer payment history returns linked session with customer session cookie
  const histRes = await fetch(`${baseUrl}/api/customers/cust-1/payments`, {
    headers: { Cookie: customerCookie },
  });
  assert.equal(histRes.status, 200);
  const histJson = (await histRes.json()) as { payments: Array<{ id: string; status: string }> };
  assert.equal(histJson.payments.length, 1);
  assert.equal(histJson.payments[0]?.status, 'reconciled');
});

test('YouPI-PG catches amount tampering & duplicate UTRs as manual_review, enforces Manager PIN on verify-bank, and supports cancel', async (t) => {
  const { computeYoupiHmacSha256, computeYoupiV2HmacSha256 } = await import(
    '../payments/webhookHandler'
  );
  const store = new CafeStore(null);
  const webhookSecret = 'fraud-test-secret';
  const bundle = createCafeServer(store, { webhookSecret, enableReconciliationJob: false });
  await new Promise<void>((resolve) => {
    bundle.httpServer.listen(0, '127.0.0.1', () => resolve());
  });
  const addr = bundle.httpServer.address() as AddressInfo;
  const baseUrl = `http://127.0.0.1:${addr.port}`;
  t.after(async () => {
    await new Promise<void>((resolve, reject) => {
      bundle.io.close();
      bundle.httpServer.close((err) => (err ? reject(err) : resolve()));
    });
  });

  // Order A: verify-bank with Manager PIN
  const ordARes = await fetch(`${baseUrl}/api/orders`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      serviceMode: 'takeaway',
      items: [{ menuItemId: 'cappuccino', name: 'Cappuccino', price: 149, quantity: 1, station: 'Barista' }],
      paymentMode: 'upi',
    }),
  });
  const custCookieA = getCookieHeader(ordARes);
  const { order: orderA } = (await ordARes.json()) as { order: { id: string; total: number } };
  const payARes = await fetch(`${baseUrl}/api/payments`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Cookie: custCookieA },
    body: JSON.stringify({ orderId: orderA.id, idempotencyKey: 'idem-fraud-a' }),
  });
  const { payment: payA } = (await payARes.json()) as {
    payment: { id: string; gatewayPaymentId: string; amountPaise: number };
  };

  // Send amount-mismatched webhook (paise = 100 instead of actual amountPaise)
  const ts = String(Date.now());
  const badAmtBody = JSON.stringify({
    event: 'OBSERVED_SUCCESS',
    paymentId: payA.gatewayPaymentId,
    orderId: orderA.id,
    amountPaise: 100,
    utr: '555566667777',
    deliveryId: 'dlv_mismatch_1',
    timestamp: Number(ts),
  });
  await fetch(`${baseUrl}/api/webhooks/youpi`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Gateway-Signature': computeYoupiHmacSha256(badAmtBody, webhookSecret),
      'X-Gateway-Signature-V2': computeYoupiV2HmacSha256(badAmtBody, ts, webhookSecret),
      'X-Gateway-Timestamp': ts,
    },
    body: badAmtBody,
  });
  assert.equal(store.getOrders().find((o) => o.id === orderA.id)?.paymentStatus, 'manual_review');

  // Unauthenticated verify-bank -> 401
  const unauthVerify = await fetch(`${baseUrl}/api/payments/${payA.id}/verify-bank`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ decision: 'approve', utr: '555566667777' }),
  });
  assert.equal(unauthVerify.status, 401);

  // Login with PIN 1234 and capture cookie
  const pinRes = await fetch(`${baseUrl}/api/auth/pin`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ pin: '1234' }),
  });
  const cookie = (pinRes.headers.get('set-cookie') ?? '').split(';')[0] ?? '';

  const authVerify = await fetch(`${baseUrl}/api/payments/${payA.id}/verify-bank`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Cookie: cookie },
    body: JSON.stringify({ decision: 'approve', utr: '555566667777' }),
  });
  assert.equal(authVerify.status, 200);
  assert.equal(store.getOrders().find((o) => o.id === orderA.id)?.paymentStatus, 'paid');

  // Order B: reusing UTR 555566667777 flags manual_review, and cancel releases queue slot
  const ordBRes = await fetch(`${baseUrl}/api/orders`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      serviceMode: 'takeaway',
      items: [{ menuItemId: 'cappuccino', name: 'Cappuccino', price: 149, quantity: 1, station: 'Barista' }],
      paymentMode: 'upi',
    }),
  });
  const custCookieB = getCookieHeader(ordBRes);
  const { order: orderB } = (await ordBRes.json()) as { order: { id: string } };
  const payBRes = await fetch(`${baseUrl}/api/payments`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Cookie: custCookieB },
    body: JSON.stringify({ orderId: orderB.id, idempotencyKey: 'idem-fraud-b' }),
  });
  const { payment: payB } = (await payBRes.json()) as {
    payment: { id: string; gatewayPaymentId: string; amountPaise: number };
  };

  const dupUtrBody = JSON.stringify({
    event: 'RECONCILED',
    paymentId: payB.gatewayPaymentId,
    orderId: orderB.id,
    amountPaise: payB.amountPaise,
    utr: '555566667777',
    deliveryId: 'dlv_dup_utr_1',
    timestamp: Number(ts),
  });
  await fetch(`${baseUrl}/api/webhooks/youpi`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Gateway-Signature': computeYoupiHmacSha256(dupUtrBody, webhookSecret),
      'X-Gateway-Signature-V2': computeYoupiV2HmacSha256(dupUtrBody, ts, webhookSecret),
      'X-Gateway-Timestamp': ts,
    },
    body: dupUtrBody,
  });
  assert.equal(store.getOrders().find((o) => o.id === orderB.id)?.paymentStatus, 'manual_review');

  // Cancel test on Order C
  const ordCRes = await fetch(`${baseUrl}/api/orders`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      serviceMode: 'takeaway',
      items: [{ menuItemId: 'veg-sandwich', name: 'Veg Sandwich', price: 99, quantity: 1, station: 'Grill' }],
      paymentMode: 'upi',
    }),
  });
  const custCookieC = getCookieHeader(ordCRes);
  const { order: orderC } = (await ordCRes.json()) as { order: { id: string } };
  const payCRes = await fetch(`${baseUrl}/api/payments`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Cookie: custCookieC },
    body: JSON.stringify({ orderId: orderC.id, idempotencyKey: 'idem-cancel-c' }),
  });
  const { payment: payC } = (await payCRes.json()) as { payment: { id: string } };

  const cancelRes = await fetch(`${baseUrl}/api/payments/${payC.id}/cancel`, {
    method: 'POST',
    headers: { Cookie: custCookieC },
  });
  assert.equal(cancelRes.status, 200);
  const cancelJson = (await cancelRes.json()) as { payment: { status: string } };
  assert.equal(cancelJson.payment.status, 'cancelled');
  assert.equal(store.getOrders().find((o) => o.id === orderC.id)?.paymentStatus, 'cancelled');

  // Reconciliation job expires stale pending sessions past expiresAt
  const reconciled = await bundle.paymentService.reconcileStuckPendingPayments({
    nowMs: Date.now() + 10 * 60 * 1000,
  });
  assert.ok(reconciled.checked >= 0);
});

test('PUT /api/settings validates UPI VPA and dynamically updates generated payment QR URIs', async (t) => {
  const { baseUrl, store, close } = await startTestServer();
  t.after(close);

  const managerCookie = await loginWithPin(baseUrl, '1234');
  const currentSettings = store.getBootstrap().cafeSettings;

  // Invalid VPA must return 400 with clear validation message
  const badRes = await fetch(`${baseUrl}/api/settings`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json', Cookie: managerCookie },
    body: JSON.stringify({ ...currentSettings, upiVpa: 'not-a-valid-upi-id' }),
  });
  assert.equal(badRes.status, 400);
  const badJson = (await badRes.json()) as { error: string };
  assert.match(badJson.error, /valid UPI ID/i);

  // Valid VPA updates /api/payments/config and subsequent UPI sessions
  const okRes = await fetch(`${baseUrl}/api/settings`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json', Cookie: managerCookie },
    body: JSON.stringify({
      ...currentSettings,
      upiVpa: 'realmerchant@okaxis',
      upiPayeeName: 'Real Cafe Store',
    }),
  });
  assert.equal(okRes.status, 200);

  const cfgRes = await fetch(`${baseUrl}/api/payments/config`);
  const cfgJson = (await cfgRes.json()) as { payeeVpa: string; isDemoVpa: boolean };
  assert.equal(cfgJson.payeeVpa, 'realmerchant@okaxis');
  assert.equal(cfgJson.isDemoVpa, false);

  const ordRes = await fetch(`${baseUrl}/api/orders`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      serviceMode: 'takeaway',
      items: [{ menuItemId: 'cold-coffee', name: 'Cold Coffee', price: 129, quantity: 1, station: 'Barista' }],
      paymentMode: 'upi',
    }),
  });
  const custCookie = getCookieHeader(ordRes);
  const { order } = (await ordRes.json()) as { order: { id: string } };

  const payRes = await fetch(`${baseUrl}/api/payments`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Cookie: custCookie },
    body: JSON.stringify({ orderId: order.id, idempotencyKey: 'idem-custom-vpa-1' }),
  });
  assert.equal(payRes.status, 201);
  const { payment } = (await payRes.json()) as {
    payment: { payeeVpa: string; upiUri: string };
  };
  assert.equal(payment.payeeVpa, 'realmerchant@okaxis');
  assert.ok(payment.upiUri.includes('pa=realmerchant@okaxis'));
  assert.equal(payment.upiUri.includes('%40'), false);
  assert.equal(payment.upiUri.includes('+'), false);
});

test('DevLoopbackFallbackGateway falls back to sandbox with configured VPA when localhost YouPI-PG is offline', async () => {
  const { DevLoopbackFallbackGateway, LocalYoupiSandboxAdapter, YoupiHttpClient } = await import(
    '../payments/youpiClient'
  );
  const live = new YoupiHttpClient({
    apiUrl: 'http://127.0.0.1:59999',
    merchantId: 'm_test',
    apiKey: 'k_test',
    payeeVpa: '7340131002@pthdfc',
    timeoutMs: 500,
  });
  const sandbox = new LocalYoupiSandboxAdapter({ payeeVpa: '7340131002@pthdfc' });
  const gw = new DevLoopbackFallbackGateway(live, sandbox);

  const session = await gw.createPayment({
    orderId: 'SSCB999',
    amountInr: '129.00',
    amountPaise: 12900,
    currency: 'INR',
    payeeVpa: '7340131002@pthdfc',
    payeeName: 'Seth Sawariya Cafe',
    idempotencyKey: 'idem-loopback-fallback-1',
  });

  assert.equal(gw.mode, 'youpi-sandbox-fallback');
  assert.equal(session.payeeVpa, '7340131002@pthdfc');
  assert.ok(session.upiUri?.includes('pa=7340131002@pthdfc'));
  assert.equal(session.upiUri?.includes('%40'), false);
});

test('Preferred UPI app (Paytm), PCI-safe Card EDC & Online checkout, and Manager-PIN settlement/refund work end-to-end', async (t) => {
  const { baseUrl, store, close } = await startTestServer();
  t.after(close);

  // 1. Order with preferred Paytm UPI app persists preferredApp on YouPI session
  const upiOrdRes = await fetch(`${baseUrl}/api/orders`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      serviceMode: 'takeaway',
      items: [{ menuItemId: 'cold-coffee', name: 'Cold Coffee', price: 129, quantity: 1, station: 'Barista' }],
      paymentMode: 'upi',
      preferredUpiApp: 'paytm',
    }),
  });
  assert.equal(upiOrdRes.status, 201);
  const upiCustCookie = getCookieHeader(upiOrdRes);
  const { order: upiOrder } = (await upiOrdRes.json()) as {
    order: { id: string; preferredUpiApp?: string; paymentChannelLabel?: string };
  };
  assert.equal(upiOrder.preferredUpiApp, 'paytm');
  assert.equal(upiOrder.paymentChannelLabel, 'Paytm UPI');

  const payRes = await fetch(`${baseUrl}/api/payments`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Cookie: upiCustCookie },
    body: JSON.stringify({
      orderId: upiOrder.id,
      preferredApp: 'paytm',
      idempotencyKey: 'idem-paytm-app-1',
    }),
  });
  assert.equal(payRes.status, 201);
  const { payment } = (await payRes.json()) as { payment: { preferredApp?: string } };
  assert.equal(payment.preferredApp, 'paytm');

  // 2. PCI-safe Online Card order settles cleanly with masked last4 only
  const onlineCardRes = await fetch(`${baseUrl}/api/orders`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      serviceMode: 'dine-in',
      tableNumber: 'T3',
      items: [{ menuItemId: 'cold-coffee', name: 'Cold Coffee', price: 220, quantity: 1, station: 'Barista' }],
      paymentMode: 'card',
      cardDetails: { method: 'online_card', network: 'Visa', last4: '4242', holderName: 'Aarav' },
    }),
  });
  assert.equal(onlineCardRes.status, 201);
  const { order: onlineCardOrder } = (await onlineCardRes.json()) as {
    order: { id: string; paymentStatus?: string; paymentRef?: string; cardDetails?: { last4?: string } };
  };
  assert.equal(onlineCardOrder.paymentStatus, 'paid');
  assert.equal(onlineCardOrder.cardDetails?.last4, '4242');
  assert.match(onlineCardOrder.paymentRef ?? '', /VISA •• 4242/);

  // 3. Table EDC Card order starts as pending and requires Manager PIN to settle & refund
  const edcCardRes = await fetch(`${baseUrl}/api/orders`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      serviceMode: 'dine-in',
      tableNumber: 'T4',
      items: [{ menuItemId: 'cold-coffee', name: 'Cold Coffee', price: 180, quantity: 1, station: 'Barista' }],
      paymentMode: 'card',
      cardDetails: { method: 'edc_table', network: 'Mastercard' },
    }),
  });
  assert.equal(edcCardRes.status, 201);
  const { order: edcOrder } = (await edcCardRes.json()) as {
    order: { id: string; paymentStatus?: string };
  };
  assert.equal(edcOrder.paymentStatus, 'pending');

  const unauthSettle = await fetch(`${baseUrl}/api/orders/${edcOrder.id}/settle-payment`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ action: 'settle', network: 'Mastercard', last4: '8812', authCode: 'EDC9912' }),
  });
  assert.equal(unauthSettle.status, 401);

  const pinRes = await fetch(`${baseUrl}/api/auth/pin`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ pin: '1234' }),
  });
  const cookie = (pinRes.headers.get('set-cookie') ?? '').split(';')[0] ?? '';

  const settleRes = await fetch(`${baseUrl}/api/orders/${edcOrder.id}/settle-payment`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Cookie: cookie },
    body: JSON.stringify({
      action: 'settle',
      network: 'Mastercard',
      last4: '8812',
      authCode: 'EDC9912',
    }),
  });
  assert.equal(settleRes.status, 200);
  const settledBody = (await settleRes.json()) as {
    order: { paymentStatus?: string; paymentRef?: string };
  };
  assert.equal(settledBody.order.paymentStatus, 'paid');
  assert.match(settledBody.order.paymentRef ?? '', /MASTERCARD •• 8812 · AUTH EDC9912/);

  const refundRes = await fetch(`${baseUrl}/api/orders/${edcOrder.id}/settle-payment`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Cookie: cookie },
    body: JSON.stringify({ action: 'refund', note: 'Customer cancelled item' }),
  });
  assert.equal(refundRes.status, 200);
  const refundedOrder = store.getOrders().find((o) => o.id === edcOrder.id);
  assert.equal(refundedOrder?.paymentStatus, 'refunded');

  // Re-settling a refunded order must return 409 Conflict
  const reSettleRes = await fetch(`${baseUrl}/api/orders/${edcOrder.id}/settle-payment`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Cookie: cookie },
    body: JSON.stringify({ action: 'settle', authCode: 'BADRETRY' }),
  });
  assert.equal(reSettleRes.status, 409);
});

test('Explicit state machines return 409 on illegal order/table transitions, pause campaigns properly, and ignore late webhooks cleanly', async (t) => {
  const { computeYoupiHmacSha256, computeYoupiV2HmacSha256 } = await import(
    '../payments/webhookHandler'
  );
  const store = new CafeStore(null);
  const webhookSecret = 'sm-test-secret';
  const bundle = createCafeServer(store, { webhookSecret, enableReconciliationJob: false });
  await new Promise<void>((resolve) => {
    bundle.httpServer.listen(0, '127.0.0.1', () => resolve());
  });
  const addr = bundle.httpServer.address() as AddressInfo;
  const baseUrl = `http://127.0.0.1:${addr.port}`;
  t.after(async () => {
    await new Promise<void>((resolve, reject) => {
      bundle.io.close();
      bundle.httpServer.close((err) => (err ? reject(err) : resolve()));
    });
  });

  const managerCookie = await loginWithPin(baseUrl, '1234');

  // 1. Advancing an already-served order returns 409
  const servedOrder = store.getOrders().find((o) => o.status === 'served');
  assert.ok(servedOrder);
  const advServedRes = await fetch(`${baseUrl}/api/orders/${servedOrder.id}/advance`, {
    method: 'POST',
    headers: { Cookie: managerCookie },
  });
  assert.equal(advServedRes.status, 409);

  // 2. Table check-in rejects already-occupied T2 (409), allows reserved T4 (200), rejects transfer onto occupied T3 (409)
  const checkInT2Res = await fetch(`${baseUrl}/api/tables/T2/check-in`, {
    method: 'POST',
    headers: { Cookie: managerCookie },
  });
  assert.equal(checkInT2Res.status, 409);

  const checkInT4Res = await fetch(`${baseUrl}/api/tables/T4/check-in`, {
    method: 'POST',
    headers: { Cookie: managerCookie },
  });
  assert.equal(checkInT4Res.status, 200);

  const badTransferRes = await fetch(`${baseUrl}/api/tables/transfer`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Cookie: managerCookie },
    body: JSON.stringify({ sourceTableId: 'T2', targetTableId: 'T3' }),
  });
  assert.equal(badTransferRes.status, 409);

  // 3. Campaign toggle transitions active -> paused -> active (and rejects double-pause)
  const activeCamp = store.getBootstrap().campaigns.find((c) => c.status === 'active');
  assert.ok(activeCamp);
  const pauseRes = await fetch(`${baseUrl}/api/campaigns/${activeCamp.id}/toggle`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Cookie: managerCookie },
    body: JSON.stringify({ event: 'pause' }),
  });
  assert.equal(pauseRes.status, 200);
  const pausedBody = (await pauseRes.json()) as { campaign: { status: string } };
  assert.equal(pausedBody.campaign.status, 'paused');

  const doublePauseRes = await fetch(`${baseUrl}/api/campaigns/${activeCamp.id}/toggle`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Cookie: managerCookie },
    body: JSON.stringify({ event: 'pause' }),
  });
  assert.equal(doublePauseRes.status, 409);

  const resumeRes = await fetch(`${baseUrl}/api/campaigns/${activeCamp.id}/toggle`, {
    method: 'POST',
    headers: { Cookie: managerCookie },
  });
  assert.equal(resumeRes.status, 200);
  const resumedBody = (await resumeRes.json()) as { campaign: { status: string } };
  assert.equal(resumedBody.campaign.status, 'active');

  // 4. Late webhook arriving after payment is cancelled returns 200 ignored (not 500)
  const ordRes = await fetch(`${baseUrl}/api/orders`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      serviceMode: 'takeaway',
      items: [{ menuItemId: 'veg-sandwich', name: 'Veg Sandwich', price: 99, quantity: 1, station: 'Grill' }],
      paymentMode: 'upi',
    }),
  });
  const custCookie = getCookieHeader(ordRes);
  const { order } = (await ordRes.json()) as { order: { id: string } };
  const payRes = await fetch(`${baseUrl}/api/payments`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Cookie: custCookie },
    body: JSON.stringify({ orderId: order.id, idempotencyKey: 'idem-late-wh-1' }),
  });
  const { payment } = (await payRes.json()) as {
    payment: { id: string; gatewayPaymentId: string; amountPaise: number };
  };

  await fetch(`${baseUrl}/api/payments/${payment.id}/cancel`, {
    method: 'POST',
    headers: { Cookie: custCookie },
  });

  const ts = String(Date.now());
  const lateBody = JSON.stringify({
    event: 'OBSERVED_SUCCESS',
    paymentId: payment.gatewayPaymentId,
    orderId: order.id,
    amountPaise: payment.amountPaise,
    utr: '429812345699',
    deliveryId: 'dlv_late_001',
    timestamp: Number(ts),
  });
  const lateRes = await fetch(`${baseUrl}/api/webhooks/youpi`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Gateway-Signature': computeYoupiHmacSha256(lateBody, webhookSecret),
      'X-Gateway-Signature-V2': computeYoupiV2HmacSha256(lateBody, ts, webhookSecret),
      'X-Gateway-Timestamp': ts,
    },
    body: lateBody,
  });
  assert.equal(lateRes.status, 200);
  const lateJson = (await lateRes.json()) as { received: boolean; ignored?: boolean; alreadyTerminal?: boolean };
  assert.equal(lateJson.received, true);
  assert.equal(lateJson.ignored, true);
  assert.equal(lateJson.alreadyTerminal, true);
});

test('Payment audit fixes: duplicate session prevention, processing timeout recovery, UPI refund + ledger sync, and prod secret check', async (t) => {
  const { baseUrl, store, paymentService, close } = await startTestServer();
  t.after(close);

  // 1. Create a UPI order & trigger duplicate POST /api/payments with DIFFERENT idempotency keys
  const ordRes = await fetch(`${baseUrl}/api/orders`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      serviceMode: 'takeaway',
      items: [{ menuItemId: 'veg-sandwich', name: 'Veg Sandwich', price: 99, quantity: 2, station: 'Grill' }],
      paymentMode: 'upi',
      idempotencyKey: 'order-audit-double-click-1',
    }),
  });
  assert.equal(ordRes.status, 201);
  const custCookie = getCookieHeader(ordRes);
  const { order } = (await ordRes.json()) as { order: { id: string } };

  const pay1Res = await fetch(`${baseUrl}/api/payments`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Cookie: custCookie },
    body: JSON.stringify({ orderId: order.id, idempotencyKey: 'pay-attempt-a' }),
  });
  assert.equal(pay1Res.status, 201);
  const pay1 = (await pay1Res.json()) as { payment: { id: string; status: string }; duplicate: boolean };
  assert.equal(pay1.duplicate, false);

  // Second rapid click for same order with a fresh idempotency key reuses active session cleanly
  const pay2Res = await fetch(`${baseUrl}/api/payments`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Cookie: custCookie },
    body: JSON.stringify({ orderId: order.id, idempotencyKey: 'pay-attempt-b' }),
  });
  assert.equal(pay2Res.status, 200);
  const pay2 = (await pay2Res.json()) as { payment: { id: string }; duplicate: boolean };
  assert.equal(pay2.duplicate, true);
  assert.equal(pay2.payment.id, pay1.payment.id);

  // 2. Stuck `processing` payment past processingExpiresAt transitions cleanly to `failed` on reconciliation
  const subRes = await fetch(`${baseUrl}/api/payments/${pay1.payment.id}/submitted`, {
    method: 'POST',
    headers: { Cookie: custCookie },
  });
  assert.equal(subRes.status, 200);
  const subBody = (await subRes.json()) as { payment: { id: string; status: string } };
  assert.equal(subBody.payment.status, 'processing');

  const futureMs = Date.now() + 60_000; // Past 30s processingExpiresAt
  const recJob = await paymentService.reconcileStuckPendingPayments({ nowMs: futureMs });
  assert.equal(recJob.updated, 1);

  const failedCheckRes = await fetch(`${baseUrl}/api/payments/${pay1.payment.id}?sync=false`, {
    headers: { Cookie: custCookie },
  });
  const failedCheck = (await failedCheckRes.json()) as { payment: { status: string; failureCode?: string } };
  assert.equal(failedCheck.payment.status, 'failed');
  assert.equal(failedCheck.payment.failureCode, 'OBSERVER_WINDOW_EXPIRED');

  // 3. After failure, a fresh retry session CAN be created (201) -> settle RECONCILED -> test PIN-guarded UPI refund
  const retryRes = await fetch(`${baseUrl}/api/payments`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Cookie: custCookie },
    body: JSON.stringify({ orderId: order.id, idempotencyKey: 'pay-attempt-retry-1' }),
  });
  assert.equal(retryRes.status, 201);
  const { payment: retryPay } = (await retryRes.json()) as { payment: { id: string } };

  const simRecRes = await fetch(`${baseUrl}/api/payments/${retryPay.id}/simulate-webhook`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Cookie: custCookie },
    body: JSON.stringify({ outcome: 'RECONCILED' }),
  });
  assert.equal(simRecRes.status, 200);

  // Refund requires Manager PIN (401 without cookie)
  const unauthRefundRes = await fetch(`${baseUrl}/api/payments/${retryPay.id}/refund`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ reason: 'Test unauth refund' }),
  });
  assert.equal(unauthRefundRes.status, 401);

  // Authenticate Manager PIN (default '1234') and grab cookie
  const pinRes = await fetch(`${baseUrl}/api/auth/pin`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ pin: '1234' }),
  });
  assert.equal(pinRes.status, 200);
  const rawSetCookie = pinRes.headers.get('set-cookie') || '';
  const pinCookie = rawSetCookie.split(';')[0];
  assert.ok(pinCookie.includes('cafeos_staff_session='));

  const refundRes = await fetch(`${baseUrl}/api/payments/${retryPay.id}/refund`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Cookie: pinCookie,
    },
    body: JSON.stringify({ refundRef: 'RF-TEST-9001', reason: 'Guest cancelled order' }),
  });
  assert.equal(refundRes.status, 200);
  const refundJson = (await refundRes.json()) as {
    payment: { status: string; refundRef: string; orderId: string };
  };
  assert.equal(refundJson.payment.status, 'refunded');
  assert.equal(refundJson.payment.refundRef, 'RF-TEST-9001');

  // Verify order and daily reconciliation summary reflect refund cleanly
  const updatedOrder = store.getOrders().find((o) => o.id === order.id);
  assert.equal(updatedOrder?.paymentStatus, 'refunded');
  assert.equal(updatedOrder?.paymentRef, 'Refund RF-TEST-9001');

  const summary = paymentService.getDailyReconciliationSummary();
  assert.equal(summary.refundedCount, 1);
  assert.equal(summary.reconciledCount, 0);

  // Duplicate refund returns 409
  const dupRefundRes = await fetch(`${baseUrl}/api/payments/${retryPay.id}/refund`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Cookie: pinCookie,
    },
    body: JSON.stringify({}),
  });
  assert.equal(dupRefundRes.status, 409);

  // 4. YoupiPaymentService constructor fails fast in production when webhookSecret is empty
  const prevEnv = process.env.NODE_ENV;
  const prevSecret = process.env.YOUPI_WEBHOOK_SECRET;
  try {
    process.env.NODE_ENV = 'production';
    delete process.env.YOUPI_WEBHOOK_SECRET;
    const { YoupiPaymentService } = await import('../payments/paymentService');
    const { LocalYoupiSandboxAdapter } = await import('../payments/youpiClient');
    assert.throws(
      () =>
        new YoupiPaymentService({
          gateway: new LocalYoupiSandboxAdapter(),
          persistence: store.createYoupiPersistenceAdapter(),
        }),
      /YOUPI_WEBHOOK_SECRET/
    );
  } finally {
    process.env.NODE_ENV = prevEnv;
    if (prevSecret !== undefined) process.env.YOUPI_WEBHOOK_SECRET = prevSecret;
  }
});

test('Multi-role RBAC matrix, cross-customer IDOR protection, server price authority, paused promo rejection, and refund loyalty clawback', async (t) => {
  const { baseUrl, store, close } = await startTestServer();
  t.after(close);

  const ownerCookie = await loginWithPin(baseUrl, '7777');
  const managerCookie = await loginWithPin(baseUrl, '1234');
  const cashierCookie = await loginWithPin(baseUrl, '2345');
  const baristaCookie = await loginWithPin(baseUrl, '3456');
  const serverCookie = await loginWithPin(baseUrl, '4567');

  // 1. Unauthenticated POS terminal flag -> 401
  const unauthPosRes = await fetch(`${baseUrl}/api/orders`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      serviceMode: 'dine-in',
      tableNumber: 'T1',
      items: [{ menuItemId: 'cold-coffee', name: 'Cold Coffee', price: 129, quantity: 1, station: 'Barista' }],
      paymentMode: 'cash',
      isPosTerminal: true,
    }),
  });
  assert.equal(unauthPosRes.status, 401);

  // 2. Client price tampering is overridden by catalog authority, unknown SKU returns 400
  const unknownItemRes = await fetch(`${baseUrl}/api/orders`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      serviceMode: 'takeaway',
      items: [{ menuItemId: 'hacked-item', name: 'Free Item', price: 1, quantity: 1, station: 'Barista' }],
      paymentMode: 'upi',
    }),
  });
  assert.equal(unknownItemRes.status, 400);

  const tamperedOrderRes = await fetch(`${baseUrl}/api/orders`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      serviceMode: 'takeaway',
      customerId: 'cust-1',
      items: [{ menuItemId: 'cold-coffee', name: 'Tampered', price: 1, quantity: 2, station: 'Barista' }],
      paymentMode: 'upi',
      idempotencyKey: 'tamper-test-1',
    }),
  });
  assert.equal(tamperedOrderRes.status, 201);
  const cust1Cookie = getCookieHeader(tamperedOrderRes);
  const { order: cust1Order } = (await tamperedOrderRes.json()) as {
    order: { id: string; total: number; items: Array<{ price: number; name: string }> };
  };
  assert.equal(cust1Order.items[0]?.price, 129);
  assert.equal(cust1Order.total, 258);

  // 3. Paused promo code cannot be applied (400)
  const camp = store.getBootstrap().campaigns.find((c) => c.status === 'active');
  assert.ok(camp);
  await fetch(`${baseUrl}/api/campaigns/${camp.id}/toggle`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Cookie: managerCookie },
    body: JSON.stringify({ event: 'pause' }),
  });
  const pausedPromoOrderRes = await fetch(`${baseUrl}/api/orders`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      serviceMode: 'takeaway',
      items: [{ menuItemId: 'cold-coffee', name: 'Cold Coffee', price: 129, quantity: 2, station: 'Barista' }],
      couponCode: camp.code,
      paymentMode: 'upi',
    }),
  });
  assert.equal(pausedPromoOrderRes.status, 400);

  // 4. Cross-customer IDOR protection: cust-1 session cannot view cust-2 payments or DPDP export
  const idorExportRes = await fetch(`${baseUrl}/api/customers/cust-2/export`, {
    headers: { Cookie: cust1Cookie },
  });
  assert.equal(idorExportRes.status, 403);

  const idorPaymentsRes = await fetch(`${baseUrl}/api/customers/cust-2/payments`, {
    headers: { Cookie: cust1Cookie },
  });
  assert.equal(idorPaymentsRes.status, 403);

  // Customer B order cannot be used to create a payment by Customer A's cookie
  const cust2OrderRes = await fetch(`${baseUrl}/api/orders`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      serviceMode: 'takeaway',
      customerId: 'cust-2',
      items: [{ menuItemId: 'cappuccino', name: 'Cappuccino', price: 149, quantity: 1, station: 'Barista' }],
      paymentMode: 'upi',
    }),
  });
  const { order: cust2Order } = (await cust2OrderRes.json()) as { order: { id: string } };
  const idorPayCreate = await fetch(`${baseUrl}/api/payments`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Cookie: cust1Cookie },
    body: JSON.stringify({ orderId: cust2Order.id, idempotencyKey: 'idor-pay-1' }),
  });
  assert.equal(idorPayCreate.status, 403);

  // 5. Role-based access matrix checks
  // Server cannot advance KOT (403), Barista can (200)
  const serverAdvance = await fetch(`${baseUrl}/api/orders/${cust1Order.id}/advance`, {
    method: 'POST',
    headers: { Cookie: serverCookie },
  });
  assert.equal(serverAdvance.status, 403);

  const baristaAdvance = await fetch(`${baseUrl}/api/orders/${cust1Order.id}/advance`, {
    method: 'POST',
    headers: { Cookie: baristaCookie },
  });
  assert.equal(baristaAdvance.status, 200);

  // Barista cannot check-in table (403) or settle order payment (403)
  const baristaCheckIn = await fetch(`${baseUrl}/api/tables/T4/check-in`, {
    method: 'POST',
    headers: { Cookie: baristaCookie },
  });
  assert.equal(baristaCheckIn.status, 403);

  // Cashier can create payment/verify-bank, but gets 403 on settings & refunds
  const cashierSettings = await fetch(`${baseUrl}/api/settings`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json', Cookie: cashierCookie },
    body: JSON.stringify(store.getBootstrap().cafeSettings),
  });
  assert.equal(cashierSettings.status, 403);

  const payCust1Res = await fetch(`${baseUrl}/api/payments`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Cookie: cust1Cookie },
    body: JSON.stringify({ orderId: cust1Order.id, idempotencyKey: 'loyalty-clawback-pay-1' }),
  });
  const { payment: cust1Pay } = (await payCust1Res.json()) as { payment: { id: string } };

  const pointsBeforePay = store.getBootstrap().rewardPoints;
  await fetch(`${baseUrl}/api/payments/${cust1Pay.id}/simulate-webhook`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Cookie: cust1Cookie },
    body: JSON.stringify({ outcome: 'RECONCILED' }),
  });
  const pointsAfterPay = store.getBootstrap().rewardPoints;
  assert.ok(pointsAfterPay > pointsBeforePay);

  const cashierRefund = await fetch(`${baseUrl}/api/payments/${cust1Pay.id}/refund`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Cookie: cashierCookie },
    body: JSON.stringify({ reason: 'Cashier should not refund' }),
  });
  assert.equal(cashierRefund.status, 403);

  // Owner can refund (200) and loyalty points earned by that order are clawed back
  const ownerRefund = await fetch(`${baseUrl}/api/payments/${cust1Pay.id}/refund`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Cookie: ownerCookie },
    body: JSON.stringify({ reason: 'Owner approved refund' }),
  });
  assert.equal(ownerRefund.status, 200);
  const pointsAfterRefund = store.getBootstrap().rewardPoints;
  assert.equal(pointsAfterRefund, pointsBeforePay);
});

test('Table QR seat link helpers and generateTableQrPdfBlob produce a valid PDF containing table URL', async () => {
  const orderPath = buildTableSeatOrderPath('t1');
  assert.equal(orderPath, '/?table=T1');

  const orderUrl = buildTableSeatOrderUrl('https://cafe.example.com/', 't1');
  assert.equal(orderUrl, 'https://cafe.example.com/?table=T1');

  const { generateTableQrPdfBlob } = await import('../components/CafePdfDocuments');
  const store = new CafeStore(null);
  const tableT1 = store.getBootstrap().tables.find((t) => t.id === 'T1');
  assert.ok(tableT1);

  const blob = await generateTableQrPdfBlob({
    table: tableT1,
    orderPath,
    orderUrl,
    settings: INITIAL_CAFE_SETTINGS,
  });
  assert.ok(blob.size > 1000);
  const bytes = new Uint8Array(await blob.arrayBuffer());
  const header = new TextDecoder().decode(bytes.slice(0, 5));
  assert.equal(header, '%PDF-');
});




