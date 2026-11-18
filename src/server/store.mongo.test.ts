import test from 'node:test';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { MongoClient } from 'mongodb';
import { INITIAL_CAFE_SETTINGS, INITIAL_ORDERS, INITIAL_TABLES } from '../data/cafeSeedData';
import { CafeStore } from './store';

const mongoUri = process.env.CAFE_TEST_MONGODB_URI;

test(
  'MongoDB persists normalized snapshots, serializes writers, and reopens state',
  { skip: !mongoUri },
  async () => {
    const databaseName = `cafeos_test_${crypto.randomUUID().replaceAll('-', '')}`;
    const firstStore = new CafeStore(null);
    const secondStore = new CafeStore(null);
    let firstConnected = false;
    const client = new MongoClient(mongoUri!);
    try {
      await client.connect();
      await client
        .db(databaseName)
        .collection<{ _id: string; [key: string]: unknown }>('cafeos_state')
        .insertOne({
          _id: 'seth-sawariya-main',
          orders: INITIAL_ORDERS,
          tables: INITIAL_TABLES,
          cafeSettings: INITIAL_CAFE_SETTINGS,
          rewardPoints: 340,
          updatedAt: new Date().toISOString(),
        });
      await firstStore.connectMongo(mongoUri!, databaseName);
      firstConnected = true;
      await assert.rejects(
        secondStore.connectMongo(mongoUri!, databaseName),
        /Another CafeOS server is already using this database/
      );

      const initialOrders = firstStore.getOrders();
      assert.ok(initialOrders.length > 0);
      const persistenceTestOrder = initialOrders[0]!;
      const persistenceTestIngredient = firstStore.getBootstrap().inventory[0]!;
      const persistenceTestRecipe = [
        { ingredientId: persistenceTestIngredient.id, amount: 0.01 },
      ];
      firstStore.setRecipe(persistenceTestOrder.items[0]!.menuItemId, persistenceTestRecipe);
      firstStore.markPaymentProcessed('cashfree-mongo-restart-test');
      firstStore.deductStockForOrder(persistenceTestOrder);

      const initialUpdatedAt = firstStore.getBootstrap().updatedAt;
      firstStore.resetSettings();
      await firstStore.flushToPersistence();
      assert.notEqual(firstStore.getBootstrap().updatedAt, initialUpdatedAt);
      await firstStore.recordAuditEvent({
        actorRole: 'manager',
        actorName: 'Test Manager',
        method: 'PUT',
        path: '/api/settings',
        statusCode: 200,
        createdAt: new Date().toISOString(),
      });

      const database = client.db(databaseName);
      assert.equal(await database.collection('cafe_orders').countDocuments(), initialOrders.length);
      assert.equal(await database.collection('cafe_audit_events').countDocuments(), 1);
      assert.equal(await database.collection('cafeos_state').countDocuments(), 1);
      assert.equal(
        (
          await database
            .collection<{ _id: string; schemaVersion: number }>('cafeos_metadata')
            .findOne({ _id: 'seth-sawariya-main' })
        )?.schemaVersion,
        2
      );

      await firstStore.closeMongo();
      firstConnected = false;
      await secondStore.connectMongo(mongoUri!, databaseName);
      assert.deepEqual(secondStore.getOrders(), initialOrders);
      assert.deepEqual(
        secondStore.getRecipes()[persistenceTestOrder.items[0]!.menuItemId],
        persistenceTestRecipe
      );
      assert.equal(secondStore.hasProcessedPaymentEvent('cashfree-mongo-restart-test'), true);
      assert.deepEqual(secondStore.deductStockForOrder(persistenceTestOrder), []);
      assert.ok(secondStore.isPersistenceHealthy());
    } finally {
      if (firstConnected) await firstStore.closeMongo();
      await secondStore.closeMongo();
      try {
        await client.db(databaseName).dropDatabase();
      } finally {
        await client.close();
      }
    }
  }
);


test('local snapshots preserve recipes and payment/inventory idempotency markers across restart', () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'cafeos-store-'));
  const persistPath = path.join(directory, 'cafe-state.json');
  try {
    const firstStore = new CafeStore(persistPath);
    const order = firstStore.getOrders()[0];
    const ingredient = firstStore.getBootstrap().inventory[0];
    assert.ok(order);
    assert.ok(ingredient);

    const recipe = [{ ingredientId: ingredient.id, amount: 0.01 }];
    firstStore.setRecipe(order.items[0]!.menuItemId, recipe);
    firstStore.markPaymentProcessed('cashfree-payment-test-1');
    firstStore.deductStockForOrder(order);
    firstStore.flushToDiskSync();

    const reopenedStore = new CafeStore(persistPath);
    assert.deepEqual(reopenedStore.getRecipes()[order.items[0]!.menuItemId], recipe);
    assert.equal(reopenedStore.hasProcessedPaymentEvent('cashfree-payment-test-1'), true);
    assert.deepEqual(reopenedStore.deductStockForOrder(order), []);
  } finally {
    fs.rmSync(directory, { recursive: true, force: true });
  }
});


test('inventory deduction rejects insufficient stock without partially mutating inventory', () => {
  const store = new CafeStore(null);
  const order = store.getOrders()[0];
  const ingredient = store.getBootstrap().inventory[0];
  assert.ok(order);
  assert.ok(ingredient);

  const before = store.getBootstrap().inventory.find((item) => item.id === ingredient.id)?.quantity;
  store.setRecipe(order.items[0]!.menuItemId, [{ ingredientId: ingredient.id, amount: ingredient.quantity + 1 }]);

  assert.throws(() => store.deductStockForOrder(order), /Insufficient stock/);
  const after = store.getBootstrap().inventory.find((item) => item.id === ingredient.id)?.quantity;
  assert.equal(after, before);
});


test('order creation and acceptance fail atomically when recipe stock is insufficient', async () => {
  const store = new CafeStore(null);
  const menuItem = store.getBootstrap().menuItems.find((item) => item.id === 'cold-coffee');
  const ingredient = store.getBootstrap().inventory[0];
  assert.ok(menuItem);
  assert.ok(ingredient);

  const initialOrderCount = store.getOrders().length;
  store.setRecipe(menuItem.id, [
    { ingredientId: ingredient.id, amount: ingredient.quantity + 1 },
  ]);

  await assert.rejects(
    store.createOrder({
      outletId: 'seth-sawariya-main',
      serviceMode: 'takeaway',
      items: [{ menuItemId: menuItem.id, name: menuItem.name, price: menuItem.price, quantity: 1, station: menuItem.station }],
      couponCode: '',
      cookingNote: '',
      isPosTerminal: true,
      paymentMode: 'cash',
    }),
    /Insufficient stock/
  );
  assert.equal(store.getOrders().length, initialOrderCount);

  store.setRecipe(menuItem.id, [{ ingredientId: ingredient.id, amount: 0.01 }]);
  const placed = await store.createOrder({
    outletId: 'seth-sawariya-main',
    serviceMode: 'takeaway',
    items: [{ menuItemId: menuItem.id, name: menuItem.name, price: menuItem.price, quantity: 1, station: menuItem.station }],
    couponCode: '',
    cookingNote: '',
    isPosTerminal: false,
    paymentMode: 'upi',
  });
  store.setRecipe(menuItem.id, [
    { ingredientId: ingredient.id, amount: store.getBootstrap().inventory.find((item) => item.id === ingredient.id)!.quantity + 1 },
  ]);

  assert.throws(() => store.updateOrderStatus(placed.order.id, 'accepted'), /Insufficient stock/);
  assert.equal(store.getOrder(placed.order.id)?.status, 'placed');
});
