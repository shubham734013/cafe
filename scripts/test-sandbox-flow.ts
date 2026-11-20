import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import dotenv from 'dotenv';
dotenv.config();

const BASE_URL = 'http://127.0.0.1:3002';

async function runSandboxTestSuite() {
  console.log('🚀 Starting CafeOS End-to-End Sandbox Test Suite...\n');

  // Step 1: Health & Bootstrap Verification
  console.log('Step 1: Checking Server Health & Catalog...');
  const healthRes = await fetch(`${BASE_URL}/api/health`);
  assert.equal(healthRes.status, 200, 'Health endpoint should return 200');
  const health = await healthRes.json();
  assert.equal(health.ok, true);
  assert.equal(health.persistence.healthy, true, 'Database should be healthy');
  console.log('  ✅ Server is healthy, MongoDB normalized storage is connected.');

  const bootstrapRes = await fetch(`${BASE_URL}/api/bootstrap`);
  assert.equal(bootstrapRes.status, 200);
  const bootstrap = await bootstrapRes.json();
  const testItem = bootstrap.menuItems.find((m: any) => m.id === 'test-chai-1');
  assert.ok(testItem, '₹1 Test Cutting Chai must exist in catalog');
  assert.equal(testItem.price, 1);
  console.log(`  ✅ Catalog verified: Found "${testItem.name}" at ₹${testItem.price}.`);

  // Step 2: Customer Journey - "Pay on Counter"
  console.log('\nStep 2: Testing Customer Journey - "Pay on Counter" (Cash/Counter)...');
  const counterOrderRes = await fetch(`${BASE_URL}/api/orders`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      serviceMode: 'takeaway',
      paymentMode: 'cash',
      items: [
        {
          menuItemId: testItem.id,
          name: testItem.name,
          price: testItem.price,
          quantity: 1,
          station: testItem.station,
          note: 'Pay on counter sandbox test',
          imageUrl: testItem.imageUrl,
        },
      ],
    }),
  });
  assert.ok(counterOrderRes.status === 200 || counterOrderRes.status === 201);
  const counterOrderCookie = counterOrderRes.headers.get('set-cookie') || '';
  const counterOrderData = await counterOrderRes.json();
  const counterOrder = counterOrderData.order;
  assert.equal(counterOrder.paymentMode, 'cash');
  assert.equal(counterOrder.paymentStatus, 'unpaid');
  assert.equal(counterOrder.paymentChannelLabel, 'Pay on Counter');
  console.log(`  ✅ Order #${counterOrder.id} placed with mode: "Pay on Counter" (₹${counterOrder.total}).`);
  console.log(`  ✅ Payment status: "${counterOrder.paymentStatus}" (Awaiting counter settlement).`);

  // Step 3: Customer Journey - "Pay Online via UPI" (Cashfree Sandbox)
  console.log('\nStep 3: Testing Customer Journey - "Pay Online via UPI" (Cashfree Sandbox)...');
  const upiOrderRes = await fetch(`${BASE_URL}/api/orders`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      serviceMode: 'takeaway',
      paymentMode: 'upi',
      items: [
        {
          menuItemId: testItem.id,
          name: testItem.name,
          price: testItem.price,
          quantity: 1,
          station: testItem.station,
          note: 'Online UPI Cashfree test',
          imageUrl: testItem.imageUrl,
        },
      ],
    }),
  });
  assert.ok(upiOrderRes.status === 200 || upiOrderRes.status === 201);
  const upiOrderCookie = upiOrderRes.headers.get('set-cookie') || '';
  const upiOrderData = await upiOrderRes.json();
  const upiOrder = upiOrderData.order;
  assert.equal(upiOrder.paymentMode, 'upi');
  assert.equal(upiOrder.paymentStatus, 'pending');
  assert.equal(upiOrder.paymentChannelLabel, 'UPI Online');
  console.log(`  ✅ Order #${upiOrder.id} created with mode: "UPI Online" (₹${upiOrder.total}).`);
  console.log(`  ✅ Payment status: "pending" (Held from kitchen until payment is verified).`);

  // Step 4: Cashfree Sandbox Session Generation
  console.log('\nStep 4: Requesting Cashfree Sandbox Checkout Session...');
  const sessionRes = await fetch(`${BASE_URL}/api/orders/${upiOrder.id}/payment-session`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Cookie: upiOrderCookie,
    },
    body: JSON.stringify({
      customer: {
        name: 'Test Customer',
        phone: '9876543210',
        email: 'test@sethsawariya.com',
      },
    }),
  });
  assert.equal(sessionRes.status, 200);
  const sessionData = await sessionRes.json();
  assert.ok(sessionData.checkoutUrl, 'Should return checkoutUrl');
  assert.ok(sessionData.paymentId, 'Should return Cashfree payment ID');
  console.log(`  ✅ Cashfree Order Created: ID ${sessionData.paymentId}`);
  console.log(`  ✅ Checkout Launcher URL: ${sessionData.checkoutUrl}`);

  // Step 5: Verify Checkout Launcher Page (loads Cashfree Web SDK)
  console.log('\nStep 5: Verifying Cashfree Checkout Launcher Page...');
  const launcherRes = await fetch(`${BASE_URL}${sessionData.checkoutUrl}`);
  assert.equal(launcherRes.status, 200);
  const launcherHtml = await launcherRes.text();
  assert.ok(launcherHtml.includes('https://sdk.cashfree.com/js/v3/cashfree.js'), 'Must load Cashfree JS SDK v3');
  assert.ok(launcherHtml.includes('Cashfree({ mode: mode })'), 'Must initialize SDK with mode');
  assert.ok(launcherHtml.includes('cashfree.checkout('), 'Must invoke cashfree.checkout()');
  console.log('  ✅ Checkout page verified: Loads official Cashfree JS SDK with mode="sandbox".');

  // Step 6: Simulate Webhook Confirmation (Bank Switch Success)
  console.log('\nStep 6: Simulating Cashfree Webhook Confirmation...');
  const webhookSecret = process.env.CASHFREE_WEBHOOK_SECRET || process.env.CASHFREE_SECRET_KEY || '';
  const webhookPayload = JSON.stringify({
    type: 'PAYMENT_SUCCESS_WEBHOOK',
    data: {
      order: {
        order_id: upiOrder.id,
      },
      payment: {
        payment_status: 'SUCCESS',
        bank_reference: 'CF_SANDBOX_UTR_' + Date.now(),
      },
    },
  });
  const timestamp = Math.floor(Date.now() / 1000).toString();
  const signature = crypto
    .createHmac('sha256', webhookSecret)
    .update(timestamp + webhookPayload)
    .digest('base64');

  const webhookRes = await fetch(`${BASE_URL}/api/webhooks/cashfree`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-webhook-timestamp': timestamp,
      'x-webhook-signature': signature,
    },
    body: webhookPayload,
  });
  assert.equal(webhookRes.status, 200);
  const webhookResult = await webhookRes.json();
  assert.equal(webhookResult.received, true);
  console.log('  ✅ Webhook delivered and cryptographically verified: { received: true }');

  // Check order status after webhook
  const statusRes = await fetch(`${BASE_URL}/api/orders/${upiOrder.id}/payment-status`, {
    headers: { Cookie: upiOrderCookie },
  });
  const statusData = await statusRes.json();
  assert.equal(statusData.paymentStatus, 'paid');
  console.log(`  ✅ Order #${upiOrder.id} is now confirmed as "PAID"!`);

  // Step 7: Staff Login & Counter Settlement
  console.log('\nStep 7: Testing Staff Counter Settlement...');
  const pinLoginRes = await fetch(`${BASE_URL}/api/auth/pin`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ pin: '7777' }), // Admin PIN
  });
  assert.equal(pinLoginRes.status, 200);
  const staffCookie = pinLoginRes.headers.get('set-cookie') || '';
  const pinData = await pinLoginRes.json();
  console.log(`  ✅ Logged in as Staff: ${pinData.session.staffName} (${pinData.session.role})`);

  // Settle Pay on Counter order
  const counterPayRes = await fetch(`${BASE_URL}/api/orders/${counterOrder.id}/pay-counter`, {
    method: 'POST',
    headers: { Cookie: staffCookie },
  });
  assert.equal(counterPayRes.status, 200);
  const counterPayData = await counterPayRes.json();
  assert.equal(counterPayData.order.paymentStatus, 'paid');
  console.log(`  ✅ Counter order #${counterOrder.id} settled as PAID by Admin! Ref: "${counterPayData.order.paymentRef}"`);

  // Step 8: Staff Advance Order Status (Placed -> Preparing -> Ready -> Served)
  console.log('\nStep 8: Advancing KOT Ticket in Kitchen...');
  const advance1 = await fetch(`${BASE_URL}/api/orders/${counterOrder.id}/advance`, {
    method: 'POST',
    headers: { Cookie: staffCookie },
  });
  const a1 = await advance1.json();
  assert.equal(a1.order.status, 'preparing');
  console.log(`  ✅ KOT #${counterOrder.id} advanced: placed ➔ preparing`);

  const advance2 = await fetch(`${BASE_URL}/api/orders/${counterOrder.id}/advance`, {
    method: 'POST',
    headers: { Cookie: staffCookie },
  });
  const a2 = await advance2.json();
  assert.equal(a2.order.status, 'ready');
  console.log(`  ✅ KOT #${counterOrder.id} advanced: preparing ➔ ready (Chime to customer)`);

  const advance3 = await fetch(`${BASE_URL}/api/orders/${counterOrder.id}/advance`, {
    method: 'POST',
    headers: { Cookie: staffCookie },
  });
  const a3 = await advance3.json();
  assert.equal(a3.order.status, 'served');
  console.log(`  ✅ KOT #${counterOrder.id} advanced: ready ➔ served (Dispatched)`);

  // Step 9: Refund Lifecycle & Reason Tracking
  console.log('\nStep 9: Testing Order Refund Flow...');
  const refundRes = await fetch(`${BASE_URL}/api/orders/${counterOrder.id}/refund`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Cookie: staffCookie },
    body: JSON.stringify({ reason: 'Customer requested cancellation & refund' }),
  });
  assert.equal(refundRes.status, 200);
  const refundData = await refundRes.json();
  assert.equal(refundData.order.paymentStatus, 'refunded');
  assert.equal(refundData.order.refundAmount, counterOrder.total);
  assert.equal(refundData.order.refundReason, 'Customer requested cancellation & refund');
  console.log(`  ✅ Order #${counterOrder.id} refunded successfully: ₹${refundData.order.refundAmount} refunded. Reason: "${refundData.order.refundReason}".`);

  // Step 10: Activity Log / Live Audit Trail
  console.log('\nStep 10: Verifying Live Operations Activity Log...');
  const activityRes = await fetch(`${BASE_URL}/api/activity-log`, {
    headers: { Cookie: staffCookie },
  });
  assert.equal(activityRes.status, 200);
  const activityData = await activityRes.json();
  assert.ok(activityData.activities.length > 0);
  const refundEvent = activityData.activities.find((a: any) => a.type === 'order_refunded');
  assert.ok(refundEvent, 'Refund activity event should be recorded in audit log');
  console.log(`  ✅ Audit Trail verified: Found ${activityData.activities.length} activity events, including order refund.`);

  console.log('\n🎉 ALL 10 SANDBOX ENVIRONMENT TESTS PASSED WITH 100% SUCCESS!');
}

runSandboxTestSuite().catch((err) => {
  console.error('\n❌ Sandbox Test Failed:', err);
  process.exit(1);
});
