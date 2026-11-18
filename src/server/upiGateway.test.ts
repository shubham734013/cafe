import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import {
  UpiGateway,
  UpiGatewayRequestError,
  verifyUpiGatewayWebhook,
} from './upiGateway';

const config = {
  baseUrl: 'https://payments.example.com',
  apiKey: 'test-api-key',
  apiSecret: 'test-api-secret',
  webhookSecret: 'test-webhook-secret',
  isProduction: true,
};

function apiOrder(overrides: Record<string, unknown> = {}) {
  return {
    order_id: 'GW-100',
    client_order_id: 'CAFE-100',
    amount: '12.99',
    currency: 'INR',
    status: 'pending',
    environment: 'live',
    test: false,
    payment_url: 'https://payments.example.com/checkout/GW-100',
    ...overrides,
  };
}

test('UPI Gateway creates authenticated live orders with the supported request shape', async () => {
  const gateway = new UpiGateway(config, async (input, init) => {
    assert.equal(String(input), 'https://payments.example.com/api/v1/orders');
    assert.equal(init?.method, 'POST');
    const headers = new Headers(init?.headers);
    assert.equal(headers.get('X-Api-Key'), config.apiKey);
    assert.equal(headers.get('X-Api-Secret'), config.apiSecret);
    assert.deepEqual(JSON.parse(String(init?.body)), {
      amount: '12.99',
      client_order_id: 'CAFE-100',
      note: 'CafeOS CAFE-100',
    });
    return Response.json({ success: true, data: apiOrder() }, { status: 201 });
  });

  const order = await gateway.createOrder({
    clientOrderId: 'CAFE-100',
    amountPaise: 1299,
    note: 'CafeOS CAFE-100',
  });
  assert.equal(order.orderId, 'GW-100');
  assert.equal(order.clientOrderId, 'CAFE-100');
  assert.equal(order.amountPaise, 1299);
  assert.equal(order.paymentUrl, 'https://payments.example.com/checkout/GW-100');
});

test('UPI Gateway rejects non-live or unsafe checkout responses', async () => {
  const nonLiveGateway = new UpiGateway(config, async () =>
    Response.json({
      success: true,
      data: apiOrder({ environment: 'sandbox', test: true }),
    })
  );
  await assert.rejects(
    nonLiveGateway.createOrder({
      clientOrderId: 'CAFE-100',
      amountPaise: 1299,
      note: 'CafeOS CAFE-100',
    }),
    UpiGatewayRequestError
  );

  const unsafeUrlGateway = new UpiGateway(config, async () =>
    Response.json({
      success: true,
      data: apiOrder({ payment_url: 'http://attacker.example/checkout' }),
    })
  );
  await assert.rejects(
    unsafeUrlGateway.createOrder({
      clientOrderId: 'CAFE-100',
      amountPaise: 1299,
      note: 'CafeOS CAFE-100',
    }),
    /insecure checkout URL/
  );
});

test('webhook verification checks the raw body, timestamp window, and signature format', () => {
  const now = 1_700_000_000;
  const rawBody = Buffer.from('{"event":"order.paid"}');
  const signature = crypto
    .createHmac('sha256', config.webhookSecret)
    .update(`${now}.${rawBody.toString('utf8')}`)
    .digest('hex') as string;
  const header = `t=${now},v1=${signature}`;

  assert.equal(verifyUpiGatewayWebhook(rawBody, header, config.webhookSecret, now), true);
  assert.equal(verifyUpiGatewayWebhook(Buffer.from('{}'), header, config.webhookSecret, now), false);
  assert.equal(verifyUpiGatewayWebhook(rawBody, header, config.webhookSecret, now + 301), false);
  assert.equal(verifyUpiGatewayWebhook(rawBody, `t=${now},v1=invalid`, config.webhookSecret, now), false);
});
