import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import test from 'node:test';
import { ZomatoDirectClient, SwiggyDirectClient } from './directAggregators';
import { createCafeServer } from './app';
import { CafeStore } from './store';

test('ZomatoDirectClient verifies HMAC signature correctly', () => {
  const secret = 'zomato_test_secret_12345';
  const client = new ZomatoDirectClient({ webhookSecret: secret });

  const rawBody = Buffer.from(JSON.stringify({ event: 'order.placed', order_id: 'ZOM-101' }));
  const validSig = crypto.createHmac('sha256', secret).update(rawBody).digest('hex');

  assert.equal(client.verifyWebhookSignature(rawBody, validSig), true);
  assert.equal(client.verifyWebhookSignature(rawBody, 'invalid-signature-hex'), false);
  assert.equal(client.verifyWebhookSignature(rawBody, undefined), false);
});

test('SwiggyDirectClient verifies HMAC signature correctly', () => {
  const secret = 'swiggy_test_secret_67890';
  const client = new SwiggyDirectClient({ webhookSecret: secret });

  const rawBody = Buffer.from(JSON.stringify({ event: 'ORDER_PLACED', order_id: 'SWG-202' }));
  const validSig = crypto.createHmac('sha256', secret).update(rawBody).digest('hex');

  assert.equal(client.verifyWebhookSignature(rawBody, validSig), true);
  assert.equal(client.verifyWebhookSignature(rawBody, 'wrong-hex'), false);
  assert.equal(client.verifyWebhookSignature(rawBody, undefined), false);
});

test('Direct Zomato and Swiggy Webhook Ingestion & Outbound Lifecycle Flow', async (t) => {
  const store = new CafeStore();
  const zomatoSecret = 'test_zomato_secret_xyz';
  const swiggySecret = 'test_swiggy_secret_abc';

  const zomatoClient = new ZomatoDirectClient({
    webhookSecret: zomatoSecret,
    apiKey: 'zomato_key_test',
  });
  const swiggyClient = new SwiggyDirectClient({
    webhookSecret: swiggySecret,
    apiKey: 'swiggy_key_test',
  });

  const { app, httpServer } = createCafeServer(store, undefined, zomatoClient, swiggyClient);
  await new Promise<void>((resolve) => httpServer.listen(0, resolve));
  const port = (httpServer.address() as any).port;
  const baseUrl = `http://localhost:${port}`;

  t.after(async () => {
    await new Promise<void>((resolve) => httpServer.close(() => resolve()));
  });

  // Fetch catalog item from store
  const items = store.getBootstrap().menuItems;
  assert.ok(items.length > 0, 'Catalog has items');
  const catalogItem = items[0];

  // 1. Ingest Zomato Order
  const zomatoOrderPayload = {
    res_id: '18942123',
    order_id: 'ZOM-99881',
    order_items: [
      {
        item_id: catalogItem.id,
        name: catalogItem.name,
        quantity: 2,
        unit_cost: catalogItem.price,
        station: catalogItem.station,
      },
    ],
    delivery_details: {
      delivery_type: 'DELIVERY',
      rider_name: 'Rahul Sharma',
      rider_phone: '+919876543210',
      expected_pickup_time: '15 mins',
    },
    special_instructions: 'Pack separately please',
  };

  const zomatoRaw = Buffer.from(JSON.stringify(zomatoOrderPayload));
  const zomatoSig = crypto.createHmac('sha256', zomatoSecret).update(zomatoRaw).digest('hex');

  // Test tampered signature rejection
  const tamperedRes = await fetch(`${baseUrl}/api/webhooks/zomato/order`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-zomato-signature': 'tampered_signature',
    },
    body: zomatoRaw,
  });
  assert.equal(tamperedRes.status, 401, 'Tampered Zomato signature rejected with 401');

  // Test valid signature acceptance
  const validZomatoRes = await fetch(`${baseUrl}/api/webhooks/zomato/order`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-zomato-signature': zomatoSig,
    },
    body: zomatoRaw,
  });
  assert.equal(validZomatoRes.status, 200, 'Zomato order webhook returns 200 ACK');
  const zomatoAck = (await validZomatoRes.json()) as any;
  assert.equal(zomatoAck.status, 'acknowledged');
  assert.equal(zomatoAck.order_id, 'ZOM-99881');
  assert.ok(zomatoAck.cafeos_order_id, 'Returns internal CafeOS order ID');
  assert.equal(zomatoAck.prep_time_minutes, 15);

  // Verify created order in store
  const cafeOrder = store.getOrder(zomatoAck.cafeos_order_id);
  assert.ok(cafeOrder);
  assert.equal(cafeOrder.serviceMode, 'delivery');
  assert.equal(cafeOrder.deliveryPartner, 'Zomato');
  assert.equal(cafeOrder.deliveryOrderId, 'ZOM-99881');
  assert.equal(cafeOrder.paymentStatus, 'paid');
  assert.match(cafeOrder.riderNote || '', /Rahul Sharma/);

  // 2. Ingest Swiggy Order
  const swiggyOrderPayload = {
    restaurant_id: 'SWG-87612',
    order_id: 'SWG-44552',
    cart: {
      items: [
        {
          item_id: catalogItem.id,
          name: catalogItem.name,
          quantity: 1,
          price: catalogItem.price,
          station: catalogItem.station,
        },
      ],
    },
    customer: { name: 'Pooja', contact: '+919123456780' },
    delivery_info: {
      delivery_executive: { name: 'Amit Verma', phone: '+919811223344' },
      otp: '7721',
    },
    special_instructions: 'Ring bell twice',
  };

  const swiggyRaw = Buffer.from(JSON.stringify(swiggyOrderPayload));
  const swiggySig = crypto.createHmac('sha256', swiggySecret).update(swiggyRaw).digest('hex');

  const validSwiggyRes = await fetch(`${baseUrl}/api/webhooks/swiggy/order`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-swiggy-signature': swiggySig,
    },
    body: swiggyRaw,
  });
  assert.equal(validSwiggyRes.status, 200, 'Swiggy order webhook returns 200 ACK');
  const swiggyAck = (await validSwiggyRes.json()) as any;
  assert.equal(swiggyAck.status, 'SUCCESS');
  assert.equal(swiggyAck.order_id, 'SWG-44552');
  assert.ok(swiggyAck.cafeos_order_id);

  const swiggyCafeOrder = store.getOrder(swiggyAck.cafeos_order_id);
  assert.ok(swiggyCafeOrder);
  assert.equal(swiggyCafeOrder.serviceMode, 'delivery');
  assert.equal(swiggyCafeOrder.deliveryPartner, 'Swiggy');
  assert.equal(swiggyCafeOrder.deliveryOrderId, 'SWG-44552');
  assert.match(swiggyCafeOrder.riderNote || '', /Amit Verma/);
  assert.match(swiggyCafeOrder.riderNote || '', /OTP: 7721/);

  // 3. Test Order Cancellation Webhooks
  const cancelPayload = Buffer.from(JSON.stringify({ order_id: 'ZOM-99881', reason: 'Customer requested' }));
  const cancelSig = crypto.createHmac('sha256', zomatoSecret).update(cancelPayload).digest('hex');

  const cancelRes = await fetch(`${baseUrl}/api/webhooks/zomato/order/cancel`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-zomato-signature': cancelSig,
    },
    body: cancelPayload,
  });
  assert.equal(cancelRes.status, 200);
  assert.equal(store.getOrder(zomatoAck.cafeos_order_id)?.status, 'cancelled');

  // 4. Test Outbound Food Ready Callback
  const zomatoNotify = await zomatoClient.notifyFoodReady('ZOM-99881');
  assert.equal(zomatoNotify.success, true);

  const swiggyNotify = await swiggyClient.notifyFoodReady('SWG-44552');
  assert.equal(swiggyNotify.success, true);

  // 5. Test 86-ing / Menu Out-of-Stock Sync
  const zomatoStockSync = await zomatoClient.updateItemAvailability(catalogItem.id, false);
  assert.equal(zomatoStockSync.success, true);

  const swiggyStockSync = await swiggyClient.updateItemAvailability(catalogItem.id, false);
  assert.equal(swiggyStockSync.success, true);
});
