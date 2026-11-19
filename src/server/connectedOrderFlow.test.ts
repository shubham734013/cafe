import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { createCafeServer } from './app';
import { CafeStore } from './store';

async function startServer() {
  const store = new CafeStore(null);
  const { app, httpServer } = createCafeServer(store);

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

  return { baseUrl, store, close };
}

test('End-to-End Connected Order Lifecycle: Customer QR -> Accept (Stock Deduct) -> Kitchen Prep -> Serve -> Pay Counter', async (t) => {
  const { baseUrl, store, close } = await startServer();
  t.after(close);
  const milk = store.addIngredient({
    name: 'Milk',
    quantity: 12,
    unit: 'L',
    minThreshold: 2,
    supplier: 'Test supplier',
    unitCost: 1,
  });
  store.setRecipe('cappuccino', [{ ingredientId: milk.id, amount: 0.2 }]);

  // 1. Staff logs in with PIN to obtain auth cookie
  const loginRes = await fetch(`${baseUrl}/api/auth/pin`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ pin: '1234' }), // manager PIN in development
  });
  assert.equal(loginRes.status, 200);
  const staffCookie = loginRes.headers.get('set-cookie')?.split(';')[0] || '';
  assert.ok(staffCookie.includes('cafeos_staff_session'));

  // 2. Customer places order from Table T1 via Customer QR
  const orderPayload = {
    serviceMode: 'dine-in',
    tableNumber: 'T1',
    items: [
      {
        menuItemId: 'cappuccino',
        name: 'Client Price Attack', // Client-supplied name/price will be ignored
        price: 1,                    // Canonical price should be authoritative
        quantity: 2,
        station: 'Barista',
      },
    ],
    idempotencyKey: `cust-qr-order-${Date.now()}-${Math.random()}`,
  };

  const createRes = await fetch(`${baseUrl}/api/orders`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(orderPayload),
  });
  assert.equal(createRes.status, 201);
  const customerCookie = createRes.headers.get('set-cookie')?.split(';')[0] || '';
  assert.ok(customerCookie.includes('cafeos_customer_session'));
  const createdBody = (await createRes.json()) as { order: { id: string; status: string; total: number } };
  const orderId = createdBody.order.id;
  assert.equal(createdBody.order.status, 'placed');
  assert.ok(createdBody.order.total > 1, 'Server recalculated price from canonical catalog');

  // Check initial milk stock before acceptance
  const initialInventory = store.getInventory();
  const milkBefore = initialInventory.find((i) => i.id === milk.id)!;
  const milkQtyBefore = milkBefore.quantity;

  // 3. Staff accepts order: status -> 'accepted'
  // Recipe-based stock deduction should deduct: 2 x 0.2L milk = 0.4L milk
  const acceptRes = await fetch(`${baseUrl}/api/orders/${orderId}/status`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Cookie: staffCookie,
    },
    body: JSON.stringify({ status: 'accepted' }),
  });
  assert.equal(acceptRes.status, 200);
  const acceptedBody = (await acceptRes.json()) as { ok: boolean; order: { status: string } };
  assert.equal(acceptedBody.order.status, 'accepted');

  const milkAfter = store.getInventory().find((i) => i.id === milk.id)!;
  assert.equal(
    Math.round((milkQtyBefore - milkAfter.quantity) * 100) / 100,
    0.4,
    'Stock deduction accurately burned recipe quantities on acceptance'
  );

  // 4. Kitchen moves order to 'preparing' then 'ready'
  const prepRes = await fetch(`${baseUrl}/api/orders/${orderId}/status`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Cookie: staffCookie,
    },
    body: JSON.stringify({ status: 'preparing' }),
  });
  assert.equal(prepRes.status, 200);
  assert.equal(((await prepRes.json()) as any).order.status, 'preparing');

  const readyRes = await fetch(`${baseUrl}/api/orders/${orderId}/status`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Cookie: staffCookie,
    },
    body: JSON.stringify({ status: 'ready' }),
  });
  assert.equal(readyRes.status, 200);
  assert.equal(((await readyRes.json()) as any).order.status, 'ready');

  // 5. Waiter marks order 'served'
  const servedRes = await fetch(`${baseUrl}/api/orders/${orderId}/status`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Cookie: staffCookie,
    },
    body: JSON.stringify({ status: 'served' }),
  });
  assert.equal(servedRes.status, 200);
  assert.equal(((await servedRes.json()) as any).order.status, 'served');

  const customerBootstrapRes = await fetch(`${baseUrl}/api/bootstrap`, {
    headers: { Cookie: customerCookie },
  });
  assert.equal(customerBootstrapRes.status, 200);
  const customerBootstrap = (await customerBootstrapRes.json()) as {
    orders: Array<{ id: string; status: string }>;
  };
  assert.equal(
    customerBootstrap.orders.find((order) => order.id === orderId)?.status,
    'served'
  );

  // 6. Payment settled at counter via cash
  const payRes = await fetch(`${baseUrl}/api/orders/${orderId}/pay-counter`, {
    method: 'POST',
    headers: { Cookie: staffCookie },
  });
  assert.equal(payRes.status, 200);
  const payBody = (await payRes.json()) as { ok: boolean; order: { paymentStatus: string } };
  assert.equal(payBody.order.paymentStatus, 'paid');

  // 7. Verify order details can be fetched by ID
  const getOrderRes = await fetch(`${baseUrl}/api/orders/${orderId}`, {
    headers: { Cookie: staffCookie },
  });
  assert.equal(getOrderRes.status, 200);
  const retrieved = ((await getOrderRes.json()) as any).order;
  assert.equal(retrieved.id, orderId);
  assert.equal(retrieved.paymentStatus, 'paid');
});

test('Customer Table Order Rate Limiting protects tables from spam', async (t) => {
  const { baseUrl, close } = await startServer();
  t.after(close);

  const payload = {
    serviceMode: 'dine-in',
    tableNumber: 'T99',
    items: [
      {
        menuItemId: 'cappuccino',
        price: 129,
        quantity: 1,
        station: 'Barista',
      },
    ],
  };

  // Submit up to rate limit threshold
  let hitRateLimit = false;
  for (let i = 0; i < 15; i++) {
    const res = await fetch(`${baseUrl}/api/orders`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...payload, idempotencyKey: `spam-${i}` }),
    });

    if (res.status === 429) {
      hitRateLimit = true;
      assert.ok(res.headers.get('retry-after'), 'Includes Retry-After header');
      break;
    }
  }

  assert.ok(hitRateLimit, 'Rate limiter correctly guarded table after request burst');
});

test('Product Add Form Recipe in Grams per 1 pc accurately deducts stock based on order quantity', async (t) => {
  const { baseUrl, store, close } = await startServer();
  t.after(close);

  // 1. Setup inventory: 5.0 kg of Dark Roast Coffee Beans
  const beans = store.addIngredient({
    name: 'Dark Roast Coffee Beans',
    quantity: 5.0,
    unit: 'kg',
    minThreshold: 1.0,
    supplier: 'Karnataka Estates',
    unitCost: 800,
  });

  // 2. Staff logs in with PIN to obtain manager auth cookie
  const loginRes = await fetch(`${baseUrl}/api/auth/pin`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ pin: '1234' }),
  });
  assert.equal(loginRes.status, 200);
  const staffCookie = loginRes.headers.get('set-cookie')?.split(';')[0] || '';

  // 3. Admin adds new product with 20 grams per 1 pc
  const addProductRes = await fetch(`${baseUrl}/api/menu/items`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Cookie: staffCookie,
    },
    body: JSON.stringify({
      name: 'Artisan Double Espresso',
      category: 'Beverages',
      price: 180,
      isVeg: true,
      station: 'Barista',
      description: 'Handcrafted single origin double shot',
      recipe: [
        {
          ingredientId: beans.id,
          amount: 20, // 20 grams for 1 pc
          amountUnit: 'g',
        },
      ],
    }),
  });
  assert.equal(addProductRes.status, 201);
  const newProduct = ((await addProductRes.json()) as any).item;
  assert.ok(newProduct.id);

  // 4. Customer orders 3 pcs of Artisan Double Espresso
  // 3 pcs * 20 grams = 60 grams = 0.06 kg deducted
  const orderRes = await fetch(`${baseUrl}/api/orders`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      serviceMode: 'dine-in',
      tableNumber: 'T2',
      items: [
        {
          menuItemId: newProduct.id,
          name: newProduct.name,
          price: newProduct.price,
          quantity: 3,
          station: 'Barista',
        },
      ],
      idempotencyKey: `artisan-order-${Date.now()}`,
    }),
  });
  assert.equal(orderRes.status, 201);
  const orderId = ((await orderRes.json()) as any).order.id;

  // 5. Staff accepts the order -> triggers recipe stock deduction
  const acceptRes = await fetch(`${baseUrl}/api/orders/${orderId}/status`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Cookie: staffCookie,
    },
    body: JSON.stringify({ status: 'accepted' }),
  });
  assert.equal(acceptRes.status, 200);

  // 6. Verify inventory decreased by exactly 0.06 kg (60 grams for 3 pcs)
  const beansAfterFirst = store.getInventory().find((i) => i.id === beans.id)!;
  assert.equal(beansAfterFirst.quantity, 4.94); // 5.0 - (3 * 0.02) = 4.94 kg

  // 7. Place second order of 5 pcs -> 5 * 20g = 100g = 0.10 kg deducted
  const order2Res = await fetch(`${baseUrl}/api/orders`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      serviceMode: 'takeaway',
      items: [
        {
          menuItemId: newProduct.id,
          name: newProduct.name,
          price: newProduct.price,
          quantity: 5,
          station: 'Barista',
        },
      ],
      idempotencyKey: `artisan-order-2-${Date.now()}`,
    }),
  });
  assert.equal(order2Res.status, 201);
  const order2Id = ((await order2Res.json()) as any).order.id;

  await fetch(`${baseUrl}/api/orders/${order2Id}/status`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Cookie: staffCookie,
    },
    body: JSON.stringify({ status: 'accepted' }),
  });

  const beansAfterSecond = store.getInventory().find((i) => i.id === beans.id)!;
  assert.equal(beansAfterSecond.quantity, 4.84); // 4.94 - 0.10 = 4.84 kg
});
