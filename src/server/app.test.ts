import test from 'node:test';
import assert from 'node:assert/strict';
import type { AddressInfo } from 'node:net';
import { createCafeServer } from './app';
import { CafeStore } from './store';
import { buildTableQrUrl, buildUpiPaymentUri } from '../shared/upi';
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
  return { baseUrl, store, close };
}

test('GET /api/health, /api/openapi.json, and /api/bootstrap return valid CafeOS payloads', async (t) => {
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

  const bootRes = await fetch(`${baseUrl}/api/bootstrap`);
  assert.equal(bootRes.status, 200);
  const boot = (await bootRes.json()) as {
    outletId: string;
    orders: unknown[];
    tables: unknown[];
    menuItems: unknown[];
  };
  assert.equal(boot.outletId, 'seth-sawariya-main');
  assert.ok(boot.orders.length > 0);
  assert.ok(boot.tables.length > 0);
  assert.ok(boot.menuItems.length > 0);
});

test('POST /api/orders supports Zod validation, idempotency, and KOT advance releasing dine-in table', async (t) => {
  const { baseUrl, store, close } = await startTestServer();
  t.after(close);

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
        menuItemId: 'signature-chai',
        name: 'Kulhad Masala Chai',
        price: 60,
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
  const created = (await createRes.json()) as { order: { id: string; status: string }; duplicate: boolean };
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
    const advRes = await fetch(`${baseUrl}/api/orders/${created.order.id}/advance`, { method: 'POST' });
    assert.equal(advRes.status, 200);
    const advBody = (await advRes.json()) as { order: { status: string } };
    assert.equal(advBody.order.status, expectedStatus);
  }

  const t2 = store.getBootstrap().tables.find((tb) => tb.id === 'T2');
  assert.equal(t2?.status, 'available');
});

test('Table creation, duplicate conflict, transfer, and merge work cleanly', async (t) => {
  const { baseUrl, store, close } = await startTestServer();
  t.after(close);

  const addRes = await fetch(`${baseUrl}/api/tables`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
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
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      id: 'T19',
      seats: 4,
      zone: 'Indoor Dining',
      floor: 'Floor 1 (Main Hall)',
    }),
  });
  assert.equal(dupRes.status, 409);

  // Check in T2 and transfer to T19
  await fetch(`${baseUrl}/api/tables/T2/check-in`, { method: 'POST' });
  const transferRes = await fetch(`${baseUrl}/api/tables/transfer`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ sourceTableId: 'T2', targetTableId: 'T19' }),
  });
  assert.equal(transferRes.status, 200);

  const tablesAfterTransfer = store.getBootstrap().tables;
  assert.equal(tablesAfterTransfer.find((tb) => tb.id === 'T2')?.status, 'available');
  assert.equal(tablesAfterTransfer.find((tb) => tb.id === 'T19')?.status, 'occupied');

  // Merge T19 back into T2
  const mergeRes = await fetch(`${baseUrl}/api/tables/merge`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ sourceTableId: 'T19', targetTableId: 'T2' }),
  });
  assert.equal(mergeRes.status, 200);
  const tablesAfterMerge = store.getBootstrap().tables;
  assert.equal(tablesAfterMerge.find((tb) => tb.id === 'T19')?.status, 'available');
  assert.equal(tablesAfterMerge.find((tb) => tb.id === 'T2')?.status, 'occupied');
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

  const firstCustomer = store.getBootstrap().customers[0];
  assert.ok(firstCustomer);
  const exportRes = await fetch(`${baseUrl}/api/customers/${firstCustomer.id}/export`);
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
