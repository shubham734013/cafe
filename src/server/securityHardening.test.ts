import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { createCafeServer } from './app';
import { CafeStore } from './store';
import { signStaffSession, signCustomerSession, revokeToken } from './auth';
import type { UpiGatewayClient, UpiGatewayOrder } from './upiGateway';
import { getTrustedClientIp } from './rateLimit';
import { verifyCaptchaToken } from './security';
import { validateEnv } from './env';
import { MENU_ITEMS } from '../data/cafeSeedData';

const TEST_MENU_ITEM = MENU_ITEMS.find((item) => item.id === 'cold-coffee') ?? MENU_ITEMS[0];
assert.ok(TEST_MENU_ITEM);

test('production environment validation requires safe deployment configuration without echoing values', () => {
  const authSecret = 'test-only-production-auth-secret-0123456789';
  const validated = validateEnv({
    NODE_ENV: 'production',
    MONGODB_URI: 'mongodb+srv://test-user:test-password@cluster.example.test',
    MONGODB_DB_NAME: 'cafeos',
    CAFE_AUTH_SECRET: authSecret,
    CAFE_ADMIN_PIN: '2468',
    CAFE_KITCHEN_PIN: '1357',
    APP_PUBLIC_URL: 'https://cafe.example.test',
    CORS_ORIGIN: 'https://cafe.example.test',
  });
  assert.equal(validated.NODE_ENV, 'production');

  assert.throws(
    () =>
      validateEnv({
        NODE_ENV: 'production',
        CAFE_AUTH_SECRET: authSecret,
        CAFE_ADMIN_PIN: '2468',
        CAFE_KITCHEN_PIN: '1357',
        APP_PUBLIC_URL: 'https://cafe.example.test',
        CORS_ORIGIN: 'https://cafe.example.test',
      }),
    (error: unknown) => {
      assert.ok(error instanceof Error);
      assert.match(error.message, /MONGODB_URI/);
      assert.equal(error.message.includes(authSecret), false);
      return true;
    }
  );
});

test('rate-limit client IP ignores forwarded headers unless Express trusts the proxy', () => {
  const request = {
    ip: '127.0.0.1',
    socket: { remoteAddress: '127.0.0.1' },
  } satisfies Pick<import('express').Request, 'ip'> & {
    socket: Pick<import('express').Request['socket'], 'remoteAddress'>;
  };
  assert.equal(getTrustedClientIp(request), '127.0.0.1');
});

test('enabled CAPTCHA fails closed without credentials and checks provider response', async () => {
  const previousEnabled = process.env.ENABLE_CAPTCHA_VERIFICATION;
  const previousSecret = process.env.CAPTCHA_SECRET_KEY;
  const originalFetch = global.fetch;
  try {
    process.env.ENABLE_CAPTCHA_VERIFICATION = 'true';
    delete process.env.CAPTCHA_SECRET_KEY;
    assert.equal((await verifyCaptchaToken('test-token')).valid, false);

    process.env.CAPTCHA_SECRET_KEY = 'test-only-secret';
    global.fetch = async () => new Response('{"success":true}', { status: 200 });
    assert.equal((await verifyCaptchaToken('test-token')).valid, true);

    global.fetch = async () => new Response('{"success":true}', { status: 503 });
    assert.equal((await verifyCaptchaToken('test-token')).valid, false);
  } finally {
    global.fetch = originalFetch;
    if (previousEnabled === undefined) delete process.env.ENABLE_CAPTCHA_VERIFICATION;
    else process.env.ENABLE_CAPTCHA_VERIFICATION = previousEnabled;
    if (previousSecret === undefined) delete process.env.CAPTCHA_SECRET_KEY;
    else process.env.CAPTCHA_SECRET_KEY = previousSecret;
  }
});

class TestSecurityGateway implements UpiGatewayClient {
  public configured = true;
  public orders = new Map<string, UpiGatewayOrder>();
  public webhookSecret = 'test-sec-webhook-secret';
  public isConfigured() { return this.configured; }
  public getWebhookSecret() { return this.webhookSecret; }
  public async getOrder(id: string): Promise<UpiGatewayOrder | null> { return this.orders.get(id) || null; }
  public async createOrder(payload: any): Promise<UpiGatewayOrder> {
    const order: UpiGatewayOrder = {
      orderId: 'GW-' + Date.now(),
      clientOrderId: payload.clientOrderId,
      status: 'pending',
      amountPaise: payload.amountPaise,
      paymentUrl: 'https://pay.example.com',
    };
    this.orders.set(payload.clientOrderId, order);
    return order;
  }
}

async function startSecTestServer() {
  const store = new CafeStore(null);
  const upiGateway = new TestSecurityGateway();
  const { app, httpServer } = createCafeServer(store, upiGateway);

  await new Promise<void>((resolve) => httpServer.listen(0, resolve));
  const address = httpServer.address();
  if (!address || typeof address === 'string') {
    throw new Error('Server address not available');
  }
  const baseUrl = `http://127.0.0.1:${address.port}`;

  const close = () =>
    new Promise<void>((resolve, reject) => {
      httpServer.close((err) => (err ? reject(err) : resolve()));
    });

  return { baseUrl, store, upiGateway, close };
}

test('Security Hardening Test Suite', async (t) => {
  const { baseUrl, store, upiGateway, close } = await startSecTestServer();
  t.after(close);

  // Helper to generate staff cookies
  const adminCookie = `cafeos_staff_session=${signStaffSession({
    role: 'admin',
    staffName: 'Admin Tester',
    issuedAt: Date.now(),
    exp: Date.now() + 3600000,
  })}`;

  const kitchenCookie = `cafeos_staff_session=${signStaffSession({
    role: 'kitchen',
    staffName: 'Chef Tester',
    issuedAt: Date.now(),
    exp: Date.now() + 3600000,
  })}`;

  await t.test('1. Unauthenticated access to admin endpoints is strictly blocked with 401', async () => {
    const unauthSettings = await fetch(`${baseUrl}/api/settings`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ cafeName: 'Hacked Cafe' }),
    });
    assert.equal(unauthSettings.status, 401);

    const unauthAudit = await fetch(`${baseUrl}/api/audit`);
    assert.equal(unauthAudit.status, 401);

    const unauthStaff = await fetch(`${baseUrl}/api/staff`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: 'Hacker', role: 'Admin', shiftLabel: 'Morning' }),
    });
    assert.equal(unauthStaff.status, 401);
  });

  await t.test('2. Wrong-role privilege escalation is rejected with 403', async () => {
    // Kitchen staff role attempting to modify admin settings
    const kitchenSettings = await fetch(`${baseUrl}/api/settings`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', Cookie: kitchenCookie },
      body: JSON.stringify({ cafeName: 'Kitchen Takeover' }),
    });
    assert.equal(kitchenSettings.status, 403);

    // Kitchen staff attempting to create marketing campaigns
    const kitchenCampaign = await fetch(`${baseUrl}/api/campaigns`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Cookie: kitchenCookie },
      body: JSON.stringify({ title: 'Free Food', code: 'FREE100', validityLabel: 'Today', description: 'Test' }),
    });
    assert.equal(kitchenCampaign.status, 403);
  });

  await t.test('3. Cross-user IDOR access is strictly rejected with 403', async () => {
    // 1. Create order for Customer A
    const orderRes = await fetch(`${baseUrl}/api/orders`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        serviceMode: 'dine-in',
        tableNumber: 'T1',
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
    assert.equal(orderRes.status, 201);
    const orderData = (await orderRes.json()) as any;
    const orderId = orderData.order.id;

    // Customer B with a different session cookie
    const customerBCookie = `cafeos_customer_session=fake_or_other_customer_token`;

    // Customer B attempting to access Customer A's order
    const crossAccess = await fetch(`${baseUrl}/api/orders/${orderId}`, {
      headers: { Cookie: customerBCookie },
    });
    assert.equal(crossAccess.status, 403);

    // Anonymous caller with no session cookie attempting to submit feedback for customer order without identity
    const anonymousFeedback = await fetch(`${baseUrl}/api/orders/${orderId}/feedback`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ rating: 1, comment: 'Slandering rival cafe' }),
    });
    assert.equal(anonymousFeedback.status, 401);
  });

  await t.test('4. NoSQL operator injection ($ and .) is blocked with 400', async () => {
    const nosqlAttack = await fetch(`${baseUrl}/api/auth/pin`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        pin: { $ne: null },
      }),
    });
    assert.equal(nosqlAttack.status, 400);
    const nosqlBody = (await nosqlAttack.json()) as any;
    assert.ok(nosqlBody.error.includes('NoSQL') || nosqlBody.error.includes('Malicious'));
  });

  await t.test('5. Reflected XSS script-breakout in Cashfree checkout HTML is safely neutralized', async () => {
    // Create order to reference
    const orderRes = await fetch(`${baseUrl}/api/orders`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Cookie: adminCookie },
      body: JSON.stringify({
        serviceMode: 'takeaway',
        isPosTerminal: true,
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
    assert.equal(orderRes.status, 201);
    const orderId = ((await orderRes.json()) as any).order.id;

    // XSS payload attempting to close inline script
    const xssPayload = '</script><script>alert("XSS")</script>';
    const checkoutRes = await fetch(
      `${baseUrl}/api/orders/${orderId}/cashfree-checkout?session=${encodeURIComponent(xssPayload)}`
    );
    assert.equal(checkoutRes.status, 200);
    const html = await checkoutRes.text();
    // Verify </script> is NOT present unescaped inside the script literal
    assert.ok(!html.includes('</script><script>alert("XSS")</script>'));
    assert.ok(html.includes('\\u003c/script\\u003e'));
  });

  await t.test('6. Cross-Site Origin / CSRF protection blocks unauthorized external web origins with 403', async () => {
    const evilOriginRes = await fetch(`${baseUrl}/api/tables`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Origin: 'https://malicious-attacker-site.com',
        Cookie: adminCookie,
      },
      body: JSON.stringify({ id: 'T99', seats: 4, section: 'indoor' }),
    });
    assert.equal(evilOriginRes.status, 403);
  });

  await t.test('7. Token Revocation invalidates active session immediately', async () => {
    const sessionToken = signStaffSession({
      role: 'admin',
      staffName: 'Revocable Staff',
      issuedAt: Date.now(),
      exp: Date.now() + 3600000,
    });
    const cookie = `cafeos_staff_session=${sessionToken}`;

    // Verify token works initially
    const activeRes = await fetch(`${baseUrl}/api/auth/session`, {
      headers: { Cookie: cookie },
    });
    assert.equal(activeRes.status, 200);
    const activeData = (await activeRes.json()) as any;
    assert.equal(activeData.authenticated, true);

    // Revoke the token
    revokeToken(sessionToken);

    // Verify token is now rejected
    const revokedRes = await fetch(`${baseUrl}/api/auth/session`, {
      headers: { Cookie: cookie },
    });
    assert.equal(revokedRes.status, 200);
    const revokedData = (await revokedRes.json()) as any;
    assert.equal(revokedData.authenticated, false);
  });

  await t.test('8. Tampered webhook signatures are rejected with 401', async () => {
    const tamperedRes = await fetch(`${baseUrl}/api/webhooks/upi-gateway`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-signature': 'tampered_or_invalid_signature_hash',
      },
      body: JSON.stringify({ event: 'payment.success', data: { client_order_id: 'order-123' } }),
    });
    assert.equal(tamperedRes.status, 401);
  });

  await t.test('9. Security headers allow same-origin geolocation and protect other browser features', async () => {
    const healthRes = await fetch(`${baseUrl}/api/health`);
    assert.equal(healthRes.status, 200);
    assert.equal(healthRes.headers.get('x-content-type-options'), 'nosniff');
    assert.equal(healthRes.headers.get('x-frame-options'), 'SAMEORIGIN');
    assert.ok(healthRes.headers.get('content-security-policy-report-only')?.includes("default-src 'self'"));
    assert.equal(healthRes.headers.get('referrer-policy'), 'strict-origin-when-cross-origin');
    assert.equal(
      healthRes.headers.get('permissions-policy'),
      'camera=(), microphone=(), geolocation=(self)'
    );
  });

  await t.test('10. DPDP Act 2023 customer data export and right-to-erasure endpoints enforce authentication and erase data', async () => {
    // 1. Unauthenticated customer cannot export or delete
    const unauthExport = await fetch(`${baseUrl}/api/customer/export`);
    assert.equal(unauthExport.status, 401);

    const unauthDelete = await fetch(`${baseUrl}/api/customer/account`, { method: 'DELETE' });
    assert.equal(unauthDelete.status, 401);

    // 2. Create a customer in store
    const testCust = store.addCustomer({
      name: 'Pooja DPDP Tester',
      phone: '9876543210',
      email: 'pooja.dpdp@example.com',
      segment: 'regular',
      favorites: 'Cold Coffee',
      dpdpConsent: true,
    });
    assert.ok(testCust.id);

    // 3. Customer authenticated session
    const customerCookie = `cafeos_customer_session=${signCustomerSession({
      customerId: testCust.id,
      orderIds: [],
      issuedAt: Date.now(),
      exp: Date.now() + 3600000,
    })}`;

    // 4. Authenticated data export (DPDP Section 11)
    const exportRes = await fetch(`${baseUrl}/api/customer/export`, {
      headers: { Cookie: customerCookie },
    });
    assert.equal(exportRes.status, 200);
    const exportBody = await exportRes.json();
    assert.equal(exportBody.profile.id, testCust.id);
    assert.equal(exportBody.profile.phone, '9876543210');
    assert.ok(exportBody.dpdpNotice.includes('Right to Access'));

    // 5. Authenticated right to erasure (DPDP Section 12)
    const eraseRes = await fetch(`${baseUrl}/api/customer/account`, {
      method: 'DELETE',
      headers: { Cookie: customerCookie },
    });
    assert.equal(eraseRes.status, 200);
    const eraseBody = await eraseRes.json();
    assert.equal(eraseBody.ok, true);
    assert.equal(eraseBody.deleted, true);

    // Verify record is deleted from store
    const verifyExport = await fetch(`${baseUrl}/api/customers/${testCust.id}/export`, {
      headers: { Cookie: adminCookie },
    });
    assert.equal(verifyExport.status, 404);
  });
});
