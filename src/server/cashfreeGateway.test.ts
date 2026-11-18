import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { CashfreeGateway } from './cashfreeGateway';

const config = {
  appId: 'test_app_id_12345',
  secretKey: 'test_secret_key_67890',
  apiVersion: '2023-08-01',
  environment: 'SANDBOX' as const,
  webhookSecret: 'test_secret_key_67890',
};

test('CashfreeGateway creates order with official Cashfree REST payload', async () => {
  const gateway = new CashfreeGateway(config, async (input, init) => {
    assert.equal(String(input), 'https://sandbox.cashfree.com/pg/orders');
    assert.equal(init?.method, 'POST');
    const headers = new Headers(init?.headers);
    assert.equal(headers.get('x-client-id'), config.appId);
    assert.equal(headers.get('x-client-secret'), config.secretKey);
    assert.equal(headers.get('x-api-version'), '2023-08-01');

    const body = JSON.parse(String(init?.body));
    assert.equal(body.order_id, 'SSCB500');
    assert.equal(body.order_amount, 1);
    assert.equal(body.order_currency, 'INR');

    return Response.json(
      {
        cf_order_id: 'cf_ord_998877',
        order_id: 'SSCB500',
        order_amount: 1,
        order_currency: 'INR',
        payment_session_id: 'session_abcdef123456',
        order_status: 'ACTIVE',
      },
      { status: 200 }
    );
  });

  const order = await gateway.createOrder({
    clientOrderId: 'SSCB500',
    amountPaise: 100,
    note: 'CafeOS SSCB500',
  });

  assert.equal(order.orderId, 'cf_ord_998877');
  assert.equal(order.clientOrderId, 'SSCB500');
  assert.equal(order.amountPaise, 100);
  assert.equal(order.status, 'pending');
  assert.equal(
    order.paymentUrl,
    '/api/orders/SSCB500/cashfree-checkout?session=session_abcdef123456&mode=sandbox'
  );
});

test('CashfreeGateway verifies webhook signature and rejects tampered bodies', () => {
  const gateway = new CashfreeGateway(config);
  const now = Math.floor(Date.now() / 1000).toString();
  const rawBody = Buffer.from(
    JSON.stringify({
      data: {
        order: { order_id: 'SSCB500' },
        payment: { payment_status: 'SUCCESS', bank_reference: '123456789012' },
      },
      type: 'PAYMENT_SUCCESS_WEBHOOK',
    })
  );

  const signature = crypto
    .createHmac('sha256', config.secretKey)
    .update(now + rawBody.toString('utf8'))
    .digest('base64');

  assert.equal(gateway.verifyWebhook(rawBody, signature, now), true);
  assert.equal(gateway.verifyWebhook(Buffer.from('tampered'), signature, now), false);
  assert.equal(gateway.verifyWebhook(rawBody, 'invalid-signature', now), false);
  assert.equal(gateway.verifyWebhook(rawBody, signature, (parseInt(now, 10) - 400).toString()), false);
});


test('CashfreeGateway verifies a specific payment ID using the payment lookup endpoint', async () => {
  const gateway = new CashfreeGateway(config, async (input, init) => {
    assert.equal(
      String(input),
      'https://sandbox.cashfree.com/pg/orders/SSCB500/payments/123456789'
    );
    assert.equal(init?.method, 'GET');
    return Response.json({
      cf_payment_id: '123456789',
      payment_status: 'SUCCESS',
      payment_amount: 12.5,
      payment_currency: 'INR',
      bank_reference: 'UTR123456',
    });
  });

  const payment = await gateway.getPaymentDetails('SSCB500', '123456789');
  assert.deepEqual(payment, {
    paymentId: '123456789',
    status: 'SUCCESS',
    amount: 12.5,
    currency: 'INR',
    bankReference: 'UTR123456',
  });
});

test('CashfreeGateway rejects incomplete individual payment responses', async () => {
  const gateway = new CashfreeGateway(config, async () =>
    Response.json({
      cf_payment_id: '123456789',
      payment_status: 'SUCCESS',
      payment_amount: 12.5,
    })
  );

  assert.equal(await gateway.getPaymentDetails('SSCB500', '123456789'), null);
});
