/**
 * CafeOS Dev UPI Gateway — a local mock of the mynkdev-21/upi-gateway server.
 *
 * Run:   npx tsx scripts/dev-gateway.ts
 * Or:    npm run dev:gateway
 *
 * This gives CafeOS a fully working payment flow without deploying the real
 * Laravel gateway. It exposes the same REST API contract that upiGateway.ts
 * expects and serves a checkout page where you click "Pay Now" to simulate
 * a successful UPI payment + signed webhook back to CafeOS.
 */

import 'dotenv/config';
import crypto from 'node:crypto';
import express from 'express';

// ── Config (matches values written to .env) ─────────────────────────────────

const GATEWAY_PORT = Number(process.env.DEV_GATEWAY_PORT || 3003);
const API_KEY = 'dev_cafeos_gateway_key';
const API_SECRET = 'dev_cafeos_gateway_secret';
const WEBHOOK_SECRET = 'dev_cafeos_gateway_webhook_secret';
const CAFEOS_PORT = Number(process.env.PORT || 3002);
const CAFEOS_WEBHOOK_URL = `http://localhost:${CAFEOS_PORT}/api/webhooks/upi-gateway`;

// ── In-memory order store ───────────────────────────────────────────────────

interface GatewayOrder {
  order_id: string;
  client_order_id: string;
  amount: string;
  currency: 'INR';
  status: 'pending' | 'paid' | 'expired' | 'failed';
  environment: 'live';
  test: false;
  payment_url: string;
  utr?: string;
  note?: string;
}

const ordersByClientId = new Map<string, GatewayOrder>();
const ordersByGatewayId = new Map<string, GatewayOrder>();
let orderSeq = 0;

// ── Express app ─────────────────────────────────────────────────────────────

const app = express();

// API auth middleware
const authenticateApi = (
  req: express.Request,
  res: express.Response,
  next: express.NextFunction
) => {
  if (req.header('X-Api-Key') !== API_KEY || req.header('X-Api-Secret') !== API_SECRET) {
    res.status(401).json({ success: false, message: 'Invalid API credentials.' });
    return;
  }
  next();
};

// ── API: Create Order ───────────────────────────────────────────────────────

app.post('/api/v1/orders', authenticateApi, express.json(), (req, res) => {
  const { amount, client_order_id, note } = req.body as {
    amount: string;
    client_order_id: string;
    note?: string;
  };

  if (ordersByClientId.has(client_order_id)) {
    res
      .status(422)
      .json({ success: false, message: 'An order with this client_order_id already exists.' });
    return;
  }

  const orderId = `GW-DEV-${String(++orderSeq).padStart(4, '0')}`;
  const order: GatewayOrder = {
    order_id: orderId,
    client_order_id,
    amount: String(amount),
    currency: 'INR',
    status: 'pending',
    environment: 'live',
    test: false,
    payment_url: `http://localhost:${GATEWAY_PORT}/checkout/${orderId}`,
    note,
  };

  ordersByClientId.set(client_order_id, order);
  ordersByGatewayId.set(orderId, order);

  console.log(`✅ Order created: ${orderId}  ₹${amount}  (${client_order_id})`);
  res.status(201).json({ success: true, data: order });
});

// ── API: Get Order ──────────────────────────────────────────────────────────

app.get('/api/v1/orders/:clientOrderId', authenticateApi, (req, res) => {
  const order = ordersByClientId.get(req.params.clientOrderId);
  if (!order) {
    res.status(404).json({ success: false, message: 'Order not found.' });
    return;
  }
  res.json({ success: true, data: order });
});

// ── Checkout Page (what the customer sees) ──────────────────────────────────

app.get('/checkout/:orderId', (req, res) => {
  const order = ordersByGatewayId.get(req.params.orderId);
  if (!order) {
    res.status(404).send('Order not found');
    return;
  }
  res.setHeader('Content-Type', 'text/html');
  res.send(buildCheckoutPage(order));
});

// ── Simulate Payment (called by the checkout page button) ───────────────────

app.post('/checkout/:orderId/pay', express.json(), async (req, res) => {
  const order = ordersByGatewayId.get(req.params.orderId);
  if (!order) {
    res.status(404).json({ error: 'Order not found.' });
    return;
  }
  if (order.status === 'paid') {
    res.json({ status: 'already_paid' });
    return;
  }

  // Mark paid
  order.status = 'paid';
  order.utr = `UTR${Date.now()}`;
  console.log(`💰 Payment received: ${order.order_id}  UTR ${order.utr}`);

  // Fire webhook to CafeOS
  try {
    await sendWebhookToCafeOS(order);
    console.log(`📨 Webhook delivered to CafeOS`);
  } catch (err) {
    console.error(`⚠️  Webhook delivery failed (is CafeOS running on port ${CAFEOS_PORT}?):`, (err as Error).message);
  }

  res.json({ status: 'paid', utr: order.utr });
});

// ── Webhook sender ──────────────────────────────────────────────────────────

async function sendWebhookToCafeOS(order: GatewayOrder) {
  const timestamp = String(Math.floor(Date.now() / 1000));
  const body = JSON.stringify({
    event_id: `evt_${crypto.randomUUID()}`,
    event: 'order.paid',
    data: {
      order_id: order.order_id,
      client_order_id: order.client_order_id,
      amount: order.amount,
      currency: order.currency,
      status: order.status,
      environment: order.environment,
      test: order.test,
      utr: order.utr,
    },
  });

  const signature = crypto
    .createHmac('sha256', WEBHOOK_SECRET)
    .update(`${timestamp}.${body}`)
    .digest('hex');

  const response = await fetch(CAFEOS_WEBHOOK_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Signature': `t=${timestamp},v1=${signature}`,
    },
    body,
    signal: AbortSignal.timeout(5000),
  });

  if (!response.ok) {
    const text = await response.text().catch(() => '');
    throw new Error(`CafeOS responded ${response.status}: ${text}`);
  }
}

// ── Checkout HTML ───────────────────────────────────────────────────────────

function buildCheckoutPage(order: GatewayOrder): string {
  const isPaid = order.status === 'paid';
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>UPI Checkout — ₹${order.amount}</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
      background: #f5f0eb; min-height: 100vh;
      display: flex; align-items: center; justify-content: center;
      padding: 24px;
    }
    .card {
      background: #fff; border-radius: 20px; box-shadow: 0 8px 40px rgba(0,0,0,.08);
      max-width: 400px; width: 100%; overflow: hidden;
    }
    .header {
      background: linear-gradient(135deg, #6c3d1f 0%, #a0522d 100%);
      padding: 28px 24px; text-align: center; color: #fff;
    }
    .header h1 { font-size: 18px; font-weight: 700; margin-bottom: 4px; }
    .header .amount { font-size: 42px; font-weight: 800; letter-spacing: -1px; }
    .header .subtitle { font-size: 13px; opacity: .8; margin-top: 4px; }
    .body { padding: 28px 24px; }
    .row { display: flex; justify-content: space-between; padding: 10px 0;
           border-bottom: 1px solid #f0ebe6; font-size: 14px; }
    .row:last-child { border-bottom: none; }
    .row .label { color: #8b7355; }
    .row .value { font-weight: 600; color: #3c2415; }
    .qr-box {
      margin: 20px auto; width: 160px; height: 160px; border-radius: 16px;
      background: #f9f5f0; display: flex; align-items: center; justify-content: center;
      border: 2px dashed #d4c4b0;
    }
    .qr-box span { font-size: 48px; }
    .qr-label { text-align: center; font-size: 12px; color: #8b7355; margin-bottom: 20px; }
    .pay-btn {
      display: block; width: 100%; padding: 16px; border: none; border-radius: 14px;
      font-size: 16px; font-weight: 700; cursor: pointer; transition: all .2s;
      background: linear-gradient(135deg, #16a34a 0%, #15803d 100%);
      color: #fff; letter-spacing: .3px;
    }
    .pay-btn:hover { transform: translateY(-1px); box-shadow: 0 4px 16px rgba(22,163,74,.3); }
    .pay-btn:disabled { opacity: .5; cursor: not-allowed; transform: none; box-shadow: none; }
    .pay-btn.paid {
      background: linear-gradient(135deg, #059669 0%, #047857 100%);
      cursor: default;
    }
    .status-msg {
      text-align: center; margin-top: 14px; font-size: 13px; color: #8b7355;
      min-height: 20px;
    }
    .status-msg.success { color: #16a34a; font-weight: 600; }
    .status-msg.error { color: #dc2626; }
    .footer {
      text-align: center; padding: 16px 24px 20px; font-size: 11px; color: #bba98d;
    }
  </style>
</head>
<body>
  <div class="card">
    <div class="header">
      <h1>Seth Sawariya CafeOS</h1>
      <div class="amount">₹${order.amount}</div>
      <div class="subtitle">UPI Payment</div>
    </div>
    <div class="body">
      <div class="row">
        <span class="label">Order</span>
        <span class="value">${order.client_order_id}</span>
      </div>
      <div class="row">
        <span class="label">Gateway Ref</span>
        <span class="value">${order.order_id}</span>
      </div>
      ${order.note ? `<div class="row"><span class="label">Note</span><span class="value">${order.note}</span></div>` : ''}
      <div class="row">
        <span class="label">Status</span>
        <span class="value" id="statusBadge" style="color: ${isPaid ? '#16a34a' : '#a0522d'}">${isPaid ? '✅ PAID' : '⏳ PENDING'}</span>
      </div>

      <div class="qr-box"><span>${isPaid ? '✅' : '📱'}</span></div>
      <p class="qr-label">${isPaid ? 'Payment confirmed' : 'Scan with any UPI app — or click below to simulate'}</p>

      <button
        class="pay-btn ${isPaid ? 'paid' : ''}"
        id="payBtn"
        ${isPaid ? 'disabled' : ''}
        onclick="simulatePayment()"
      >
        ${isPaid ? '✅ Payment Confirmed' : '💳 Pay ₹' + order.amount + ' Now'}
      </button>
      <p class="status-msg" id="statusMsg"></p>
    </div>
    <div class="footer">
      Dev UPI Gateway · localhost:${GATEWAY_PORT} · Not a real payment
    </div>
  </div>

  <script>
    async function simulatePayment() {
      const btn = document.getElementById('payBtn');
      const msg = document.getElementById('statusMsg');
      const badge = document.getElementById('statusBadge');
      btn.disabled = true;
      btn.textContent = 'Processing...';
      msg.textContent = 'Verifying UPI payment...';
      msg.className = 'status-msg';

      try {
        const res = await fetch('/checkout/${order.order_id}/pay', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
        });
        const data = await res.json();
        if (data.status === 'paid' || data.status === 'already_paid') {
          btn.textContent = '✅ Payment Confirmed';
          btn.className = 'pay-btn paid';
          badge.textContent = '✅ PAID';
          badge.style.color = '#16a34a';
          msg.textContent = 'Payment successful! Return to CafeOS to track your order.';
          msg.className = 'status-msg success';
          document.querySelector('.qr-box span').textContent = '✅';
          document.querySelector('.qr-label').textContent = 'Payment confirmed';
        } else {
          throw new Error('Unexpected status');
        }
      } catch (err) {
        btn.disabled = false;
        btn.textContent = '💳 Pay ₹${order.amount} Now';
        msg.textContent = 'Payment failed — try again. ' + err.message;
        msg.className = 'status-msg error';
      }
    }
  </script>
</body>
</html>`;
}

// ── Start ───────────────────────────────────────────────────────────────────

app.listen(GATEWAY_PORT, '0.0.0.0', () => {
  console.log('');
  console.log('╔══════════════════════════════════════════════════════════════╗');
  console.log('║              🏦  Dev UPI Gateway Running                    ║');
  console.log('╠══════════════════════════════════════════════════════════════╣');
  console.log(`║  Gateway URL:     http://localhost:${GATEWAY_PORT}                    ║`);
  console.log(`║  CafeOS Webhook:  http://localhost:${CAFEOS_PORT}/api/webhooks/...   ║`);
  console.log('║                                                              ║');
  console.log('║  How it works:                                               ║');
  console.log('║  1. Place an order in CafeOS                                 ║');
  console.log('║  2. Click "Pay securely using UPI" on the tracking page      ║');
  console.log('║  3. A checkout page opens in your browser                    ║');
  console.log('║  4. Click "Pay Now" to simulate the UPI payment              ║');
  console.log('║  5. CafeOS receives a signed webhook → order is PAID ✅      ║');
  console.log('╚══════════════════════════════════════════════════════════════╝');
  console.log('');
});
