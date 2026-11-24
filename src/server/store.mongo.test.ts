import test from 'node:test';
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
    if (!mongoUri || !isLoopbackMongoUri(mongoUri)) {
      throw new Error(
        'CAFE_TEST_MONGODB_URI must target localhost, 127.0.0.1, or ::1 to protect non-test databases.'
      );
    }
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
      const initialUpdatedAt = firstStore.getBootstrap().updatedAt;
      firstStore.resetSettings();
      await firstStore.flushToPersistence();
      assert.notEqual(firstStore.getBootstrap().updatedAt, initialUpdatedAt);
      await firstStore.recordAuditEvent({
        actorRole: 'admin',
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

function isLoopbackMongoUri(uri: string): boolean {
  try {
    const parsed = new URL(uri);
    return (
      parsed.protocol === 'mongodb:' &&
      ['localhost', '127.0.0.1', '[::1]', '::1'].includes(parsed.hostname)
    );
  } catch {
    return false;
  }
}
