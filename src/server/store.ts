import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { BSON, MongoClient, type Collection, type Db } from 'mongodb';
import {
  INITIAL_CAFE_SETTINGS,
  INITIAL_RECIPES,
  MENU_ITEMS,
} from '../data/cafeSeedData';
import type {
  CafeActivityLogItem,
  CafeOrder,
  CafeSettings,
  CafeTable,
  CustomerProfile,
  InventoryIngredient,
  InventoryBatch,
  LoyaltyRule,
  MenuItem,
  OrderStatus,
  PaymentMode,
  PointLedgerEntry,
  PromoCampaign,
  StaffMember,
  StockCount,
  StockCountLine,
  StockMovement,
  PurchaseOrder,
  PurchaseOrderLine,
} from '../types/cafe';
import {
  calculateCartTotals,
  computeInventoryStatus,
  restockIngredientItem,
  convertRecipeAmountToInventoryUnit,
} from '../utils/cafeLogic';
import {
  InvalidDomainTransitionError,
  assertCanCheckInTable,
  assertCanMoveTableParty,
  transitionCampaignStatus,
  transitionOrderStatus,
  transitionStaffDuty,
} from '../state/cafeStateMachines';
import type { z } from 'zod';
import type {
  addCustomerSchema,
  addIngredientSchema,
  addLoyaltyRuleSchema,
  addMenuItemSchema,
  addStaffSchema,
  addTableSchema,
  cafeSettingsSchema,
  CustomerFeedbackInput,
  createCampaignSchema,
  createOrderSchema,
  reserveTableSchema,
  stockReceiptSchema,
  stockWasteSchema,
  stockTransferSchema,
  stockCountSchema,
  purchaseOrderSchema,
  receivePurchaseOrderSchema,
} from '../shared/schemas';
import {
  type CustomerSessionPayload,
  type StaffSessionPayload,
  hasStaffRole,
} from './auth';

export interface CafeBootstrapState {
  outletId: string;
  orders: CafeOrder[];
  tables: CafeTable[];
  inventory: InventoryIngredient[];
  customers: CustomerProfile[];
  loyaltyRules: LoyaltyRule[];
  pointLedger: PointLedgerEntry[];
  campaigns: PromoCampaign[];
  staffRoster: StaffMember[];
  cafeSettings: CafeSettings;
  menuItems: MenuItem[];
  rewardPoints: number;
  activityLog?: CafeActivityLogItem[];
  stockMovements: StockMovement[];
  inventoryBatches: InventoryBatch[];
  purchaseOrders: PurchaseOrder[];
  stockCounts: StockCount[];
  updatedAt: string;
}

interface PersistedEnvelope extends Omit<CafeBootstrapState, 'payments'> {
  nextOrderSeq: number;
  idempotencyOrderIds: Record<string, string>;
  recipes?: Record<string, Array<{ ingredientId: string; amount: number }>>;
  stockDeductedOrderIds?: string[];
  processedPaymentEvents?: string[];
}

const MONGO_STATE_ID = 'seth-sawariya-main';

interface MongoStateDocument extends PersistedEnvelope {
  _id: string;
}

interface MongoRevisionDocument {
  _id: string;
  revision: string;
  value: unknown;
}

interface MongoMetadataDocument {
  _id: string;
  schemaVersion: 1 | 2;
  activeRevision: string;
}

export interface CafeAuditEvent {
  actorRole: string | null;
  actorName: string | null;
  method: string;
  path: string;
  statusCode: number;
  createdAt: string;
}

interface MongoWriterLease {
  _id: string;
  ownerId: string;
  expiresAt: Date;
}

const MONGO_LEASE_ID = `${MONGO_STATE_ID}:writer-lease`;
const MONGO_LEASE_DURATION_MS = 30_000;

function clone<T>(val: T): T {
  return structuredClone(val);
}

function shortId(prefix: string): string {
  return `${prefix}-${crypto.randomUUID().slice(0, 8)}`;
}

function deriveMaxOrderSeq(orders: CafeOrder[]): number {
  let maxSeq = 420 + orders.length;
  for (const order of orders) {
    const match = /^SSCB(\d+)$/.exec(order.id);
    if (match) {
      const n = Number(match[1]);
      if (Number.isFinite(n) && n >= maxSeq) {
        maxSeq = n;
      }
    }
  }
  return maxSeq;
}

function stripLegacyGatewayFields(order: CafeOrder): CafeOrder {
  const {
    paymentId: _paymentId,
    paymentUtr: _paymentUtr,
    preferredUpiApp: _preferredUpiApp,
    paymentProvider,
    ...currentOrder
  } = order as CafeOrder & {
    paymentProvider?: 'upi-gateway' | 'youpi-pg';
    paymentId?: unknown;
    paymentUtr?: unknown;
    preferredUpiApp?: unknown;
  };
  return paymentProvider === 'upi-gateway'
    ? { ...currentOrder, paymentProvider }
    : currentOrder;
}

export class CafeStore {
  private state: PersistedEnvelope;
  private persistPath: string | null;
  private mongoClient: MongoClient | null = null;
  private mongoDatabase: Db | null = null;
  private mongoStateCollection: Collection<MongoStateDocument> | null = null;
  private mongoMetadataCollection: Collection<MongoMetadataDocument> | null = null;
  private mongoAuditCollection: Collection<CafeAuditEvent> | null = null;
  private mongoRevision: string | null = null;
  private mongoLeaseCollection: Collection<MongoWriterLease> | null = null;
  private mongoLeaseOwner: string | null = null;
  private mongoLeaseTimer: NodeJS.Timeout | null = null;
  private persistenceHealthy = true;

  // O(1) secondary lookup indexes
  private menuById = new Map<string, MenuItem>();
  private ordersById = new Map<string, CafeOrder>();
  private ordersByGatewayClientOrderId = new Map<string, CafeOrder>();
  private stockDeductedOrderIds = new Set<string>();
  private processedPaymentEvents = new Set<string>();
  private tablesById = new Map<string, CafeTable>();
  private customersById = new Map<string, CustomerProfile>();

  // Async coalesced persistence state
  private pendingWriteTimer: NodeJS.Timeout | null = null;
  private writeInFlight: Promise<void> | null = null;
  private writeDirty = false;
  private lastPersistError: unknown = null;

  constructor(persistPath: string | null = path.resolve(process.cwd(), '.data', 'cafe-state.json')) {
    this.persistPath = persistPath;
    this.state = this.loadOrSeed();
    this.rebuildIndexes();
  }

  public async connectMongo(uri: string, databaseName = 'cafeos'): Promise<void> {
    if (!uri.trim()) throw new Error('MONGODB_URI must be configured before starting CafeOS.');
    if (this.mongoClient) throw new Error('CafeStore is already connected to MongoDB.');

    const client = new MongoClient(uri, { serverSelectionTimeoutMS: 5000 });
    try {
      await client.connect();
      const database: Db = client.db(databaseName);
      const stateCollection = database.collection<MongoStateDocument>('cafeos_state');
      const metadataCollection =
        database.collection<MongoMetadataDocument>('cafeos_metadata');
      const auditCollection = database.collection<CafeAuditEvent>('cafe_audit_events');
      const leaseCollection = database.collection<MongoWriterLease>('cafeos_locks');
      await Promise.all(
        this.getRevisionCollections(database).map((collection) =>
          collection.createIndex({ revision: 1 })
        )
      );
      await auditCollection.createIndex({ createdAt: -1 });
      const leaseOwner = crypto.randomUUID();
      const leaseExpiresAt = new Date(Date.now() + MONGO_LEASE_DURATION_MS);
      try {
        await leaseCollection.insertOne({
          _id: MONGO_LEASE_ID,
          ownerId: leaseOwner,
          expiresAt: leaseExpiresAt,
        });
      } catch (error) {
        if (
          !error ||
          typeof error !== 'object' ||
          !('code' in error) ||
          error.code !== 11000
        ) {
          throw error;
        }
        const takeover = await leaseCollection.updateOne(
          { _id: MONGO_LEASE_ID, expiresAt: { $lte: new Date() } },
          { $set: { ownerId: leaseOwner, expiresAt: leaseExpiresAt } }
        );
        if (takeover.modifiedCount !== 1) {
          throw new Error(
            'Another CafeOS server is already using this database. Run only one server per database.'
          );
        }
      }

      this.mongoLeaseCollection = leaseCollection;
      this.mongoLeaseOwner = leaseOwner;
      this.mongoLeaseTimer = setInterval(() => {
        void this.renewMongoLease();
      }, Math.floor(MONGO_LEASE_DURATION_MS / 3));
      this.mongoLeaseTimer.unref();

      const metadata = await metadataCollection.findOne({ _id: MONGO_STATE_ID });
      if (metadata?.schemaVersion === 1) {
        this.state = this.mergePersistedState(
          await this.readLegacyNormalizedState(database, metadata.activeRevision)
        );
        const revision = crypto.randomUUID();
        await this.writeNormalizedSnapshot(database, this.state, revision);
        const migration = await metadataCollection.updateOne(
          {
            _id: MONGO_STATE_ID,
            schemaVersion: 1,
            activeRevision: metadata.activeRevision,
          },
          { $set: { schemaVersion: 2, activeRevision: revision } }
        );
        if (migration.modifiedCount !== 1) {
          throw new Error('MongoDB state changed unexpectedly while migrating CafeOS state.');
        }
        this.mongoRevision = revision;
        console.info(
          `[CafeStore] Migrated cafe state to the current normalized format in "${databaseName}".`
        );
        this.rebuildIndexes();
      } else if (metadata?.schemaVersion === 2) {
        this.state = this.mergePersistedState(
          await this.readNormalizedState(database, metadata.activeRevision)
        );
        this.mongoRevision = metadata.activeRevision;
        this.rebuildIndexes();
        console.info(
          `[CafeStore] Loaded normalized cafe state from MongoDB database "${databaseName}".`
        );
      } else {
        const legacyState = await stateCollection.findOne({ _id: MONGO_STATE_ID });
        if (legacyState) {
          const { _id: _ignoredId, ...persisted } = legacyState;
          this.state = this.mergePersistedState(persisted);
          this.rebuildIndexes();
        }
        const revision = crypto.randomUUID();
        await this.writeNormalizedSnapshot(database, this.state, revision);
        await metadataCollection.insertOne({
          _id: MONGO_STATE_ID,
          schemaVersion: 2,
          activeRevision: revision,
        });
        this.mongoRevision = revision;
        console.info(
          `[CafeStore] Migrated cafe state to normalized collections in "${databaseName}".`
        );
      }

      this.mongoClient = client;
      this.mongoDatabase = database;
      this.mongoStateCollection = stateCollection;
      this.mongoMetadataCollection = metadataCollection;
      this.mongoAuditCollection = auditCollection;
      this.persistPath = null;
    } catch (error) {
      if (this.mongoLeaseTimer) {
        clearInterval(this.mongoLeaseTimer);
        this.mongoLeaseTimer = null;
      }
      if (this.mongoLeaseCollection && this.mongoLeaseOwner) {
        await this.mongoLeaseCollection
          .deleteOne({ _id: MONGO_LEASE_ID, ownerId: this.mongoLeaseOwner })
          .catch(() => undefined);
      }
      this.mongoLeaseCollection = null;
      this.mongoLeaseOwner = null;
      this.mongoDatabase = null;
      this.mongoStateCollection = null;
      this.mongoMetadataCollection = null;
      this.mongoAuditCollection = null;
      this.mongoRevision = null;
      await client.close().catch(() => undefined);
      throw new Error(
        `Could not connect to MongoDB database "${databaseName}": ${
          error instanceof Error ? error.message : String(error)
        }`,
        { cause: error }
      );
    }
  }

  public async closeMongo(): Promise<void> {
    if (!this.mongoClient) return;
    const client = this.mongoClient;
    try {
      await this.flushToPersistence();
    } catch (flushErr) {
      console.warn('[CafeStore] Could not flush to persistence during shutdown:', flushErr instanceof Error ? flushErr.message : flushErr);
    } finally {
      if (this.pendingWriteTimer) {
        clearTimeout(this.pendingWriteTimer);
        this.pendingWriteTimer = null;
      }
      if (this.mongoLeaseTimer) {
        clearInterval(this.mongoLeaseTimer);
        this.mongoLeaseTimer = null;
      }
      try {
        if (this.mongoLeaseCollection && this.mongoLeaseOwner) {
          await this.mongoLeaseCollection.deleteOne({
            _id: MONGO_LEASE_ID,
            ownerId: this.mongoLeaseOwner,
          });
        }
      } finally {
        await client.close();
        this.mongoClient = null;
        this.mongoDatabase = null;
        this.mongoStateCollection = null;
        this.mongoMetadataCollection = null;
        this.mongoAuditCollection = null;
        this.mongoRevision = null;
        this.mongoLeaseCollection = null;
        this.mongoLeaseOwner = null;
      }
    }
  }

  private getLegacyRevisionCollections(database: Db): Collection<MongoRevisionDocument>[] {
    return [
      database.collection<MongoRevisionDocument>('cafe_orders'),
      database.collection<MongoRevisionDocument>('cafe_tables'),
      database.collection<MongoRevisionDocument>('cafe_inventory'),
      database.collection<MongoRevisionDocument>('cafe_customers'),
      database.collection<MongoRevisionDocument>('cafe_loyalty_rules'),
      database.collection<MongoRevisionDocument>('cafe_point_ledger'),
      database.collection<MongoRevisionDocument>('cafe_campaigns'),
      database.collection<MongoRevisionDocument>('cafe_staff'),
      database.collection<MongoRevisionDocument>('cafe_menu_items'),
      database.collection<MongoRevisionDocument>('cafe_youpi_payments'),
      database.collection<MongoRevisionDocument>('cafe_youpi_webhook_deliveries'),
      database.collection<MongoRevisionDocument>('cafe_idempotency_keys'),
      database.collection<MongoRevisionDocument>('cafe_youpi_utr_claims'),
      database.collection<MongoRevisionDocument>('cafe_settings'),
      database.collection<MongoRevisionDocument>('cafe_state_metadata'),
    ];
  }

  private getRevisionCollections(database: Db): Collection<MongoRevisionDocument>[] {
    return [
      database.collection<MongoRevisionDocument>('cafe_orders'),
      database.collection<MongoRevisionDocument>('cafe_tables'),
      database.collection<MongoRevisionDocument>('cafe_inventory'),
      database.collection<MongoRevisionDocument>('cafe_customers'),
      database.collection<MongoRevisionDocument>('cafe_loyalty_rules'),
      database.collection<MongoRevisionDocument>('cafe_point_ledger'),
      database.collection<MongoRevisionDocument>('cafe_campaigns'),
      database.collection<MongoRevisionDocument>('cafe_staff'),
      database.collection<MongoRevisionDocument>('cafe_menu_items'),
      database.collection<MongoRevisionDocument>('cafe_idempotency_keys'),
      database.collection<MongoRevisionDocument>('cafe_settings'),
      database.collection<MongoRevisionDocument>('cafe_state_metadata'),
    ];
  }

  private async writeNormalizedSnapshot(
    database: Db,
    snapshot: PersistedEnvelope,
    revision: string
  ): Promise<void> {
    const records: Array<Array<{ id: string; value: unknown }>> = [
      snapshot.orders.map((value) => ({ id: value.id, value })),
      snapshot.tables.map((value) => ({ id: value.id, value })),
      snapshot.inventory.map((value) => ({ id: value.id, value })),
      snapshot.customers.map((value) => ({ id: value.id, value })),
      snapshot.loyaltyRules.map((value) => ({ id: value.id, value })),
      snapshot.pointLedger.map((value) => ({ id: value.id, value })),
      snapshot.campaigns.map((value) => ({ id: value.id, value })),
      snapshot.staffRoster.map((value) => ({ id: value.id, value })),
      snapshot.menuItems.map((value) => ({ id: value.id, value })),
      Object.entries(snapshot.idempotencyOrderIds).map(([id, orderId]) => ({
        id,
        value: { key: id, orderId },
      })),
      [
        {
          id: 'settings',
          value: snapshot.cafeSettings,
        },
      ],
      [
        {
          id: 'state',
          value: {
            outletId: snapshot.outletId,
            rewardPoints: snapshot.rewardPoints,
            updatedAt: snapshot.updatedAt,
            nextOrderSeq: snapshot.nextOrderSeq,
            recipes: snapshot.recipes || {},
          },
        },
      ],
    ];

    const collections = this.getRevisionCollections(database);
    for (let index = 0; index < records.length; index += 1) {
      const collection = collections[index]!;
      const documents = records[index]!.map(({ id, value }) => ({
        _id: `${revision}:${id}`,
        revision,
        value,
      }));
      for (const document of documents) {
        if (BSON.calculateObjectSize(document) >= 15 * 1024 * 1024) {
          throw new Error(
            `A record in "${collection.collectionName}" is approaching MongoDB's 16 MB document limit.`
          );
        }
      }
      if (documents.length) await collection.insertMany(documents);
    }
  }

  private async readNormalizedState(
    database: Db,
    revision: string
  ): Promise<Partial<PersistedEnvelope>> {
    const collections = this.getRevisionCollections(database);
    const readRecords = async <T>(index: number): Promise<T[]> =>
      (await collections[index]!.find({ revision }).toArray()).map(
        (document) => document.value as T
      );
    const readSingleton = async <T>(index: number): Promise<T> => {
      const record = await collections[index]!.findOne({ revision });
      if (!record) throw new Error(`MongoDB snapshot is missing required record ${index}.`);
      return record.value as T;
    };

    const state = await readSingleton<{
      outletId: string;
      rewardPoints: number;
      updatedAt: string;
      nextOrderSeq: number;
      recipes?: Record<string, Array<{ ingredientId: string; amount: number }>>;
    }>(11);
    const settings = await readSingleton<CafeSettings>(10);

    const idempotencyEntries = await readRecords<{ key: string; orderId: string }>(9);
    return {
      ...state,
      cafeSettings: settings,
      orders: await readRecords<CafeOrder>(0),
      tables: await readRecords<CafeTable>(1),
      inventory: await readRecords<InventoryIngredient>(2),
      customers: await readRecords<CustomerProfile>(3),
      loyaltyRules: await readRecords<LoyaltyRule>(4),
      pointLedger: await readRecords<PointLedgerEntry>(5),
      campaigns: await readRecords<PromoCampaign>(6),
      staffRoster: await readRecords<StaffMember>(7),
      menuItems: await readRecords<MenuItem>(8),
      idempotencyOrderIds: Object.fromEntries(
        idempotencyEntries.map((entry) => [entry.key, entry.orderId])
      ),
    };
  }

  private async readLegacyNormalizedState(
    database: Db,
    revision: string
  ): Promise<Partial<PersistedEnvelope>> {
    const collections = this.getLegacyRevisionCollections(database);
    const readRecords = async <T>(index: number): Promise<T[]> =>
      (await collections[index]!.find({ revision }).toArray()).map(
        (document) => document.value as T
      );
    const readSingleton = async <T>(index: number): Promise<T> => {
      const record = await collections[index]!.findOne({ revision });
      if (!record) throw new Error(`MongoDB snapshot is missing required record ${index}.`);
      return record.value as T;
    };

    const state = await readSingleton<{
      outletId: string;
      rewardPoints: number;
      updatedAt: string;
      nextOrderSeq: number;
    }>(14);
    const settings = await readSingleton<CafeSettings>(13);
    const idempotencyEntries = await readRecords<{ key: string; orderId: string }>(11);
    return {
      ...state,
      cafeSettings: settings,
      orders: await readRecords<CafeOrder>(0),
      tables: await readRecords<CafeTable>(1),
      inventory: await readRecords<InventoryIngredient>(2),
      customers: await readRecords<CustomerProfile>(3),
      loyaltyRules: await readRecords<LoyaltyRule>(4),
      pointLedger: await readRecords<PointLedgerEntry>(5),
      campaigns: await readRecords<PromoCampaign>(6),
      staffRoster: await readRecords<StaffMember>(7),
      menuItems: await readRecords<MenuItem>(8),
      idempotencyOrderIds: Object.fromEntries(
        idempotencyEntries.map((entry) => [entry.key, entry.orderId])
      ),
    };
  }

  private async renewMongoLease(): Promise<void> {
    if (!this.mongoLeaseCollection || !this.mongoLeaseOwner) return;
    try {
      const result = await this.mongoLeaseCollection.updateOne(
        { _id: MONGO_LEASE_ID, ownerId: this.mongoLeaseOwner },
        { $set: { expiresAt: new Date(Date.now() + MONGO_LEASE_DURATION_MS) } }
      );
      if (result.matchedCount !== 1) {
        const reacquire = await this.mongoLeaseCollection.updateOne(
          {
            _id: MONGO_LEASE_ID,
            expiresAt: { $lte: new Date() },
          },
          {
            $set: {
              ownerId: this.mongoLeaseOwner,
              expiresAt: new Date(Date.now() + MONGO_LEASE_DURATION_MS),
            },
          }
        );
        if (reacquire.modifiedCount === 1) {
          this.persistenceHealthy = true;
          return;
        }
        this.persistenceHealthy = false;
        console.error('[CafeStore] MongoDB writer lease was lost; API writes are disabled.');
        return;
      }
      this.persistenceHealthy = true;
    } catch (error) {
      console.warn(
        '[CafeStore] Transient issue renewing MongoDB writer lease (will retry):',
        error instanceof Error ? error.message : error
      );
    }
  }

  public isPersistenceHealthy(): boolean {
    return this.persistenceHealthy && !this.lastPersistError;
  }

  public async recordAuditEvent(event: CafeAuditEvent): Promise<void> {
    if (!this.mongoAuditCollection) return;
    try {
      await this.mongoAuditCollection.insertOne(event);
    } catch (error) {
      console.error('[CafeStore] Failed to record audit event:', error);
    }
  }

  public async listAuditEvents(limit = 100): Promise<CafeAuditEvent[]> {
    if (!this.mongoAuditCollection) return [];
    return this.mongoAuditCollection
      .find({})
      .sort({ createdAt: -1 })
      .limit(Math.min(Math.max(Math.floor(limit), 1), 200))
      .toArray();
  }

  public getPersistenceInfo(): {
    healthy: boolean;
    storageModel: 'normalized-collections';
    primaryDatabase: 'mongodb';
    stateBytes: number;
    maxDocumentBytes: number;
  } {
    const stateBytes = BSON.calculateObjectSize(this.state);
    return {
      healthy: this.isPersistenceHealthy(),
      storageModel: 'normalized-collections',
      primaryDatabase: 'mongodb',
      stateBytes,
      maxDocumentBytes: 16 * 1024 * 1024,
    };
  }

  private createSeedState(): PersistedEnvelope {
    return {
      outletId: 'seth-sawariya-main',
      orders: [],
      tables: [],
      inventory: [],
      stockMovements: [],
      inventoryBatches: [],
      purchaseOrders: [],
      stockCounts: [],
      customers: [],
      loyaltyRules: [],
      pointLedger: [],
      campaigns: [],
      staffRoster: [],
      cafeSettings: clone(INITIAL_CAFE_SETTINGS),
      menuItems: clone(MENU_ITEMS),
      rewardPoints: 0,
      activityLog: [],
      updatedAt: new Date().toISOString(),
      nextOrderSeq: 0,
      idempotencyOrderIds: {},
      recipes: clone(INITIAL_RECIPES),
      stockDeductedOrderIds: [],
      processedPaymentEvents: [],
    };
  }

  private rebuildIndexes(): void {
    this.menuById.clear();
    for (const item of this.state.menuItems) {
      this.menuById.set(item.id, item);
    }

    this.ordersById.clear();
    this.ordersByGatewayClientOrderId.clear();
    for (const order of this.state.orders) {
      this.ordersById.set(order.id, order);
      if (order.gatewayClientOrderId) {
        this.ordersByGatewayClientOrderId.set(order.gatewayClientOrderId, order);
      }
    }

    this.stockDeductedOrderIds = new Set(this.state.stockDeductedOrderIds || []);
    this.processedPaymentEvents = new Set(this.state.processedPaymentEvents || []);

    this.tablesById.clear();
    for (const table of this.state.tables) {
      this.tablesById.set(table.id, table);
    }

    this.customersById.clear();
    for (const customer of this.state.customers) {
      this.customersById.set(customer.id, customer);
    }

  }

  private loadOrSeed(): PersistedEnvelope {
    if (!this.persistPath) {
      return this.createSeedState();
    }
    try {
      if (fs.existsSync(this.persistPath)) {
        const raw = fs.readFileSync(this.persistPath, 'utf8');
        const parsed = JSON.parse(raw) as Partial<PersistedEnvelope>;
        if (Array.isArray(parsed.orders) && Array.isArray(parsed.tables) && parsed.cafeSettings) {
          return this.mergePersistedState(parsed);
        }
      }
    } catch (err) {
      console.warn('[CafeStore] Failed to load persisted state, falling back to seed:', err);
    }
    const seeded = this.createSeedState();
    this.flushToDiskSync(seeded);
    return seeded;
  }

  private mergePersistedState(parsed: Partial<PersistedEnvelope>): PersistedEnvelope {
    const base = this.createSeedState();
    const orders = (Array.isArray(parsed.orders) ? parsed.orders : base.orders).map(
      stripLegacyGatewayFields
    );
    const {
      youpiPayments: _legacyPayments,
      youpiWebhookDeliveries: _legacyDeliveries,
      youpiUtrClaims: _legacyClaims,
      ...persisted
    } = parsed as Partial<PersistedEnvelope> & {
      youpiPayments?: unknown;
      youpiWebhookDeliveries?: unknown;
      youpiUtrClaims?: unknown;
    };
    return {
      ...base,
      ...persisted,
      orders,
      menuItems: base.menuItems,
      activityLog: Array.isArray(parsed.activityLog) ? parsed.activityLog : base.activityLog,
      idempotencyOrderIds: parsed.idempotencyOrderIds ?? {},
      nextOrderSeq:
        typeof parsed.nextOrderSeq === 'number'
          ? Math.max(parsed.nextOrderSeq, deriveMaxOrderSeq(orders))
          : deriveMaxOrderSeq(orders),
    };
  }

  private serializeSnapshot(snapshot: PersistedEnvelope): string {
    return process.env.NODE_ENV === 'production'
      ? JSON.stringify(snapshot)
      : JSON.stringify(snapshot, null, 2);
  }

  public flushToDiskSync(snapshot: PersistedEnvelope = this.state): void {
    if (!this.persistPath) return;
    if (this.pendingWriteTimer) {
      clearTimeout(this.pendingWriteTimer);
      this.pendingWriteTimer = null;
    }
    this.writeDirty = false;
    try {
      fs.mkdirSync(path.dirname(this.persistPath), { recursive: true });
      const tmp = `${this.persistPath}.tmp`;
      fs.writeFileSync(tmp, this.serializeSnapshot(snapshot), 'utf8');
      fs.renameSync(tmp, this.persistPath);
    } catch (err) {
      console.warn('[CafeStore] Sync persistence write failed:', err);
    }
  }

  public async flushToPersistence(): Promise<void> {
    if (!this.mongoDatabase) {
      this.flushToDiskSync();
      return;
    }
    if (this.pendingWriteTimer) {
      clearTimeout(this.pendingWriteTimer);
      this.pendingWriteTimer = null;
    }
    this.writeDirty = true;
    await this.drainAsyncWrite();
    if (this.lastPersistError) {
      throw new Error('Could not flush CafeOS state to MongoDB.', {
        cause: this.lastPersistError,
      });
    }
  }

  private scheduleAsyncFlush(): void {
    if (!this.persistPath && !this.mongoDatabase) return;
    this.writeDirty = true;
    if (this.pendingWriteTimer) return;
    this.pendingWriteTimer = setTimeout(() => {
      this.pendingWriteTimer = null;
      void this.drainAsyncWrite();
    }, 50);
    this.pendingWriteTimer.unref();
  }

  private async drainAsyncWrite(): Promise<void> {
    if (!this.persistPath && !this.mongoDatabase) return;
    if (this.writeInFlight) await this.writeInFlight;
    if (!this.writeDirty) return;
    const persistPath = this.persistPath;
    const mongoDatabase = this.mongoDatabase;
    const mongoMetadataCollection = this.mongoMetadataCollection;
    this.writeDirty = false;
    const snapshot = clone(this.state);
    if (mongoDatabase && !this.persistenceHealthy) {
      this.lastPersistError = new Error(
        'MongoDB persistence is unhealthy; refusing to write cafe state.'
      );
      this.writeDirty = true;
      return;
    }

    const write = (async () => {
      try {
        if (mongoDatabase && mongoMetadataCollection && this.mongoRevision) {
          const nextRevision = crypto.randomUUID();
          await this.writeNormalizedSnapshot(mongoDatabase, snapshot, nextRevision);
          const pointerUpdate = await mongoMetadataCollection.updateOne(
            {
              _id: MONGO_STATE_ID,
              schemaVersion: 2,
              activeRevision: this.mongoRevision,
            },
            { $set: { activeRevision: nextRevision } }
          );
          if (pointerUpdate.modifiedCount !== 1) {
            throw new Error(
              'MongoDB snapshot revision changed unexpectedly. Stop other CafeOS writers and restart.'
            );
          }
          this.mongoRevision = nextRevision;
          const cleanupResults = await Promise.allSettled(
            this.getRevisionCollections(mongoDatabase).map((collection) =>
              collection.deleteMany({ revision: { $ne: nextRevision } })
            )
          );
          const cleanupError = cleanupResults.find((result) => result.status === 'rejected');
          if (cleanupError?.status === 'rejected') {
            console.error('[CafeStore] Old MongoDB snapshot cleanup failed:', cleanupError.reason);
          }
        } else if (persistPath) {
          await fs.promises.mkdir(path.dirname(persistPath), { recursive: true });
          const tmp = `${persistPath}.tmp`;
          await fs.promises.writeFile(tmp, this.serializeSnapshot(snapshot), 'utf8');
          await fs.promises.rename(tmp, persistPath);
        }
        this.lastPersistError = null;
      } catch (err) {
        this.lastPersistError = err;
        this.writeDirty = true;
        console.error('[CafeStore] Async persistence write failed:', err);
      }
    })();
    this.writeInFlight = write;

    await write;
    if (this.writeInFlight === write) this.writeInFlight = null;
    if (!this.writeDirty) return;
    if (this.lastPersistError) {
      if (!this.pendingWriteTimer) {
        this.pendingWriteTimer = setTimeout(() => {
          this.pendingWriteTimer = null;
          void this.drainAsyncWrite();
        }, 1000);
        this.pendingWriteTimer.unref();
      }
      return;
    }
    await this.drainAsyncWrite();
  }

  private touch(): void {
    this.state.updatedAt = new Date().toISOString();
    this.scheduleAsyncFlush();
  }

  public getOrderMeta(orderId: string): { id: string; customerId?: string } | null {
    const order = this.ordersById.get(orderId);
    if (!order) return null;
    return { id: order.id, customerId: order.customerId };
  }

  public getBootstrap(actor?: {
    staffSession: StaffSessionPayload | null;
    customerSession: CustomerSessionPayload | null;
  }): CafeBootstrapState {
    const {
      idempotencyOrderIds: _ignored,
      nextOrderSeq: _ignoredSeq,
      ...publicState
    } = this.state;

    // Internal/default callers without actor receive full operational state.
    if (!actor) {
      return clone({
        ...publicState,
      });
    }

    const staffSession = actor.staffSession;
    const customerSession = actor.customerSession;

    if (staffSession) {
      if (staffSession.role === 'barista' || (staffSession.role as string) === 'kitchen') {
        return clone({
          ...publicState,
          orders: publicState.orders.map((order) => ({
            ...order,
            paymentRef: undefined,
            preferredUpiApp: undefined,
            paymentChannelLabel: undefined,
            cardDetails: undefined,
            customerId: undefined,
            loyaltyPointsAwarded: undefined,
          })),
          tables: publicState.tables.map((table) => ({
            ...table,
            reservedBy: undefined,
            reservedPartySize: undefined,
          })),
          inventory: publicState.inventory,
          customers: [],
          loyaltyRules: [],
          pointLedger: [],
          campaigns: [],
          staffRoster: [],
          cafeSettings: {
            ...publicState.cafeSettings,
            address: '',
            phone: '',
            email: '',
            operatingHours: '',
            gstin: '',
            upiVpa: '',
            upiPayeeName: '',
          },
          menuItems: publicState.menuItems,
          rewardPoints: 0,
        });
      }

      const canSeeCustomers = hasStaffRole(staffSession, ['owner', 'manager', 'cashier']);
      const canSeeStaffPhones = hasStaffRole(staffSession, ['owner', 'manager']);
      return clone({
        ...publicState,
        customers: canSeeCustomers ? publicState.customers : [],
        staffRoster: canSeeStaffPhones
          ? publicState.staffRoster
          : publicState.staffRoster.map((s) => ({ ...s, phone: undefined })),
      });
    }

    // Customer / guest view: strictly scope PII & foreign order data
    const allowedOrderIds = new Set(customerSession?.orderIds ?? []);
    const scopedOrders = publicState.orders.filter((o) => allowedOrderIds.has(o.id));
    const publicMenuItems = publicState.menuItems.map((item) => ({ ...item, unitsSold: 0 }));
    const sanitizedTables = publicState.tables.map((t) => ({
      ...t,
      activeOrderId: undefined,
      reservedBy: undefined,
      reservedPartySize: undefined,
    }));

    return clone({
      ...publicState,
      orders: scopedOrders,
      tables: sanitizedTables,
      menuItems: publicMenuItems,
      inventory: [],
      customers: [],
      loyaltyRules: [],
      campaigns: publicState.campaigns
        .filter((campaign) => campaign.status === 'active')
        .map((campaign) => ({ ...campaign, usedLabel: '', revenueLabel: undefined })),
      staffRoster: [],
      pointLedger: publicState.pointLedger.filter(
        (entry) =>
          (entry.orderId && allowedOrderIds.has(entry.orderId)) ||
          [...allowedOrderIds].some((orderId) => entry.context.includes(orderId))
      ),
      cafeSettings: {
        ...publicState.cafeSettings,
        address: '',
        phone: '',
        email: '',
        operatingHours: '',
        gstin: '',
        serviceChargePct: 0,
        qrOrderingEnabled: true,
        managerPinRequired: false,
        kotPrinterConnected: false,
        posPrinterConnected: false,
        upiVpa: '',
        upiPayeeName: publicState.cafeSettings.cafeName,
      },
      rewardPoints: scopedOrders.reduce(
        (total, order) => total + (order.loyaltyPointsAwarded ?? 0),
        0
      ),
    });
  }

  public getRouteData(
    actor: {
      staffSession: StaffSessionPayload | null;
      customerSession: CustomerSessionPayload | null;
    },
    screen: string,
    kitchenRoute = false
  ): CafeBootstrapState {
    // 1. Staff / Admin: full centralized operational state across all admin & POS routes
    if (actor.staffSession) {
      return this.getBootstrap(actor);
    }

    // 2. Kitchen Terminal: full kitchen operational state (all tickets, tables, stock, menu availability)
    if (
      kitchenRoute ||
      ['kitchen-display-system', 'pos-orders', 'kitchen-tables'].includes(screen)
    ) {
      return this.getBootstrap({
        staffSession: {
          role: 'kitchen',
          staffName: 'Kitchen Terminal',
          issuedAt: Date.now(),
          exp: Date.now() + 86400000,
        },
        customerSession: null,
      });
    }

    // 3. Guest Customer: scoped public state (menu, tables, campaigns, customer's own orders)
    const customerState = this.getBootstrap(actor);
    if (['splash', 'profile'].includes(screen)) {
      return {
        ...customerState,
        orders: [],
        customers: [],
        menuItems: [],
      };
    }

    return customerState;
  }

  public getOrders(): CafeOrder[] {
    return clone(this.state.orders);
  }

  public getInventory(): InventoryIngredient[] {
    return clone(this.state.inventory);
  }

  public getStockMovements(): StockMovement[] {
    return clone(this.state.stockMovements || []);
  }

  public getInventoryBatches(): InventoryBatch[] {
    return clone(this.state.inventoryBatches || []);
  }

  public getPurchaseOrders(): PurchaseOrder[] {
    return clone(this.state.purchaseOrders || []);
  }

  public getStockCounts(): StockCount[] {
    return clone(this.state.stockCounts || []);
  }

  public getOrder(orderId: string): CafeOrder | null {
    const order = this.ordersById.get(orderId);
    return order ? clone(order) : null;
  }

  public getOrderByGatewayClientOrderId(clientOrderId: string): CafeOrder | null {
    const order = this.ordersByGatewayClientOrderId.get(clientOrderId);
    return order ? clone(order) : null;
  }

  public getOrCreateGatewayClientOrderId(orderId: string): string | null {
    const order = this.ordersById.get(orderId);
    if (!order) return null;
    if (order.gatewayClientOrderId) return order.gatewayClientOrderId;

    const clientOrderId = `CAFEOS-${crypto.randomUUID()}`;
    order.gatewayClientOrderId = clientOrderId;
    this.ordersByGatewayClientOrderId.set(clientOrderId, order);
    this.touch();
    return clientOrderId;
  }

  public attachGatewayPayment(
    orderId: string,
    gatewayOrderId: string,
    status: CafeOrder['paymentStatus'],
    utr?: string
  ): CafeOrder | null {
    const order = this.ordersById.get(orderId);
    if (!order) return null;
    if (order.paymentStatus === 'paid' && status !== 'paid') return clone(order);

    order.paymentProvider = 'upi-gateway';
    order.gatewayOrderId = gatewayOrderId;
    order.paymentMode = 'upi';
    order.paymentStatus = status ?? 'pending';
    order.paymentChannelLabel = 'UPI Gateway';
    if (status === 'paid') {
      order.paymentRef = utr ? `UPI UTR ${utr}` : 'Payment confirmed by UPI Gateway';
    } else if (status === 'expired' || status === 'failed' || status === 'manual_review') {
      order.paymentRef =
        status === 'manual_review'
          ? 'Payment requires merchant review in the UPI Gateway'
          : `UPI payment ${status}`;
    }

    this.touch();
    return clone(order);
  }

  public recordActivity(
    item: Omit<CafeActivityLogItem, 'id' | 'timestamp'> & { timestamp?: string }
  ): void {
    if (!this.state.activityLog) {
      this.state.activityLog = [];
    }
    const logItem: CafeActivityLogItem = {
      id: `act-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
      timestamp:
        item.timestamp ||
        new Date().toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' }),
      ...item,
    };
    this.state.activityLog.unshift(logItem);
    if (this.state.activityLog.length > 80) {
      this.state.activityLog = this.state.activityLog.slice(0, 80);
    }
    this.touch();
  }

  public getActivityLog(): CafeActivityLogItem[] {
    return clone(this.state.activityLog || []);
  }

  public recordCustomerFeedback(feedback: CustomerFeedbackInput): void {
    const details = [
      feedback.dishName ? `Item: ${feedback.dishName}` : '',
      feedback.diningMode ? `Service: ${feedback.diningMode}` : '',
      feedback.tags.length > 0 ? `Highlights: ${feedback.tags.join(', ')}` : '',
      `Comment: ${feedback.comment}`,
    ].filter(Boolean);

    this.recordActivity({
      type: 'feedback_received',
      title: `Customer feedback · ${feedback.rating}/5`,
      description: details.join(' · '),
      actorName: feedback.customerName,
      actorRole: 'Customer',
      severity: feedback.rating <= 2 ? 'warning' : 'info',
    });
  }

  public markOrderPaidAtCounter(
    orderId: string,
    staffName?: string,
    paymentMode: PaymentMode = 'cash'
  ): CafeOrder | null {
    const order = this.ordersById.get(orderId);
    if (!order) return null;
    order.paymentStatus = 'paid';
    order.paymentMode = paymentMode;
    const modeLabel = paymentMode === 'cash' ? 'Cash' : paymentMode === 'card' ? 'Card Swipe' : 'UPI';
    order.paymentRef = `Counter Settlement (${modeLabel}) · Received by ${staffName || 'Staff'}`;
    this.recordActivity({
      type: 'order_paid',
      title: `Order #${order.id} Paid`,
      description: `Order ${order.kotNumber} settled at counter via ${modeLabel} (₹${order.total})`,
      actorName: staffName || 'Staff',
      actorRole: 'cashier',
      severity: 'success',
      orderId: order.id,
      amount: order.total,
    });
    this.touch();
    return clone(order);
  }

  public refundOrder(
    orderId: string,
    reason: string,
    staffName?: string,
    staffRole?: string
  ): CafeOrder | null {
    const order = this.ordersById.get(orderId);
    if (!order) return null;
    if (order.paymentStatus === 'refunded') {
      throw new Error(`Order #${orderId} has already been refunded.`);
    }

    order.paymentStatus = 'refunded';
    order.refundAmount = order.total;
    order.refundReason = reason.trim() || 'Customer Cancellation';
    order.refundedAt = new Date().toLocaleTimeString('en-IN', {
      hour: '2-digit',
      minute: '2-digit',
    });
    order.refundedBy = staffName || 'Manager';

    // Restock inventory burned for this order if it was deducted
    if (this.stockDeductedOrderIds.has(order.id)) {
      this.stockDeductedOrderIds.delete(order.id);
      this.state.stockDeductedOrderIds = Array.from(this.stockDeductedOrderIds);
      const recipeCatalog = this.state.recipes || INITIAL_RECIPES;
      order.items.forEach((item) => {
        const burn = recipeCatalog[item.menuItemId];
        if (burn) {
          burn.forEach(({ ingredientId, amount }) => {
            const ingIndex = this.state.inventory.findIndex((i) => i.id === ingredientId);
            if (ingIndex !== -1) {
              const ing = this.state.inventory[ingIndex];
              const newQty = Math.round((ing.quantity + amount * item.quantity) * 100) / 100;
              const status = newQty < ing.minThreshold ? 'Critical' : 'Good';
              this.state.inventory[ingIndex] = {
                ...ing,
                quantity: newQty,
                status: computeInventoryStatus(newQty, ing.minThreshold),
                fillPct: Math.min(100, Math.round((newQty / ing.maxCapacity) * 100)),
              };
              this.recordStockMovement({
                ingredientId: ing.id,
                ingredientName: ing.name,
                type: 'refund',
                quantityDelta: amount * item.quantity,
                beforeQuantity: ing.quantity,
                afterQuantity: newQty,
                unit: ing.unit,
                unitCost: ing.unitCost,
                referenceId: order.id,
                note: `Stock restored for refunded order ${order.id}`,
                actorName: staffName || 'Manager',
              });
            }
          });
        }
      });
    }

    // Free table if this order was the active order
    if (order.serviceMode === 'dine-in' && order.tableNumber) {
      const table = this.tablesById.get(order.tableNumber);
      if (table && table.activeOrderId === order.id) {
        const updatedTable: CafeTable = {
          ...table,
          status: 'available',
          activeOrderId: undefined,
          elapsedLabel: '0m',
        };
        this.tablesById.set(updatedTable.id, updatedTable);
        this.state.tables = this.state.tables.map((t) => (t.id === updatedTable.id ? updatedTable : t));
      }
    }

    this.recordActivity({
      type: 'order_refunded',
      title: `Order #${order.id} Refunded`,
      description: `₹${order.total} refunded · Reason: ${order.refundReason}`,
      actorName: staffName || 'Staff',
      actorRole: staffRole || 'manager',
      severity: 'warning',
      orderId: order.id,
      amount: order.total,
    });

    this.touch();
    return clone(order);
  }

  public hasProcessedPaymentEvent(eventId: string): boolean {
    return this.processedPaymentEvents.has(eventId);
  }

  public markPaymentProcessed(eventId: string): void {
    this.processedPaymentEvents.add(eventId);
    this.state.processedPaymentEvents = Array.from(this.processedPaymentEvents).slice(-1000);
    this.touch();
  }

  public getRecipes(): Record<string, Array<{ ingredientId: string; amount: number }>> {
    return clone(this.state.recipes || INITIAL_RECIPES);
  }

  public setRecipe(
    menuItemId: string,
    recipe: Array<{ ingredientId: string; amount: number }>
  ): void {
    if (!this.state.recipes) {
      this.state.recipes = clone(INITIAL_RECIPES);
    }
    this.state.recipes[menuItemId] = clone(recipe);
    this.touch();
  }

  public async createOrder(input: z.infer<typeof createOrderSchema>): Promise<{
    order: CafeOrder;
    duplicate: boolean;
    rewardPoints: number;
    tableUpdated?: CafeTable;
  }> {
    if (input.idempotencyKey && this.state.idempotencyOrderIds[input.idempotencyKey]) {
      const existingId = this.state.idempotencyOrderIds[input.idempotencyKey];
      const existing = this.ordersById.get(existingId);
      if (existing) {
        return {
          order: clone(existing),
          duplicate: true,
          rewardPoints: this.state.rewardPoints,
        };
      }
    }

    // Enforce server-authoritative catalog pricing, station, name & image, with size multiplier
    const canonicalItems = input.items.map((item) => {
      const catalogItem = this.menuById.get(item.menuItemId);
      if (!catalogItem) {
        throw new InvalidDomainTransitionError({
          domain: 'order_status',
          fromState: 'cart',
          toState: 'placed',
          action: 'create_order',
          message: `Menu item "${item.menuItemId}" does not exist in catalog.`,
          httpStatus: 400,
        });
      }
      if (catalogItem.isAvailable === false) {
        throw new InvalidDomainTransitionError({
          domain: 'order_status',
          fromState: 'cart',
          toState: 'placed',
          action: 'create_order',
          message: `Item "${catalogItem.name}" is currently sold out and unavailable for ordering.`,
          httpStatus: 400,
        });
      }
      const sizeMultiplier = item.size === 'Small' ? 0.85 : item.size === 'Large' ? 1.25 : 1.0;
      const effectivePrice = Math.round(catalogItem.price * sizeMultiplier);
      return {
        ...item,
        name: catalogItem.name,
        price: effectivePrice,
        size: item.size || 'Medium',
        station: catalogItem.station,
        imageUrl: catalogItem.imageUrl,
        checked: false,
      };
    });

    // Verify sufficient recipe ingredients in inventory before creating order
    const recipeCatalog = this.state.recipes || INITIAL_RECIPES;
    const requiredByIngredient: Record<string, number> = {};
    for (const item of canonicalItems) {
      const burn = recipeCatalog[item.menuItemId];
      if (burn) {
        for (const { ingredientId, amount } of burn) {
          requiredByIngredient[ingredientId] =
            (requiredByIngredient[ingredientId] || 0) + amount * item.quantity;
        }
      }
    }
    for (const [ingredientId, requiredQty] of Object.entries(requiredByIngredient)) {
      const ing = this.state.inventory.find((i) => i.id === ingredientId);
      if (ing && ing.quantity < requiredQty) {
        throw new InvalidDomainTransitionError({
          domain: 'order_status',
          fromState: 'cart',
          toState: 'placed',
          action: 'create_order',
          message: `Insufficient inventory for ingredient "${ing.name}" to prepare this order.`,
          httpStatus: 400,
        });
      }
    }

    const totals = calculateCartTotals(
      canonicalItems,
      input.couponCode ?? '',
      input.serviceMode,
      Boolean(input.isPosTerminal),
      this.state.campaigns,
      input.redeemPoints || 0
    );

    if (input.couponCode?.trim() && totals.couponError) {
      throw new InvalidDomainTransitionError({
        domain: 'campaign',
        fromState: 'invalid',
        toState: 'applied',
        action: 'apply_coupon',
        message: totals.couponError,
        httpStatus: 400,
      });
    }

    if (totals.pointsRedeemed && totals.pointsRedeemed > 0) {
      this.state.rewardPoints = Math.max(0, (this.state.rewardPoints || 0) - totals.pointsRedeemed);
      if (input.customerId) {
        const cust = this.state.customers.find((c) => c.id === input.customerId);
        if (cust && cust.loyaltyPoints !== undefined) {
          cust.loyaltyPoints = Math.max(0, cust.loyaltyPoints - totals.pointsRedeemed);
        }
      }
    }

    this.state.nextOrderSeq += 1;
    const nextNum = this.state.nextOrderSeq;
    const paymentMode = input.paymentMode || (input.isPosTerminal ? 'cash' : 'upi');
    const isPayOnCounter = paymentMode === 'cash';

    const newOrder: CafeOrder = {
      id: `SSCB${nextNum}`,
      kotNumber: `#${nextNum}`,
      isPosTerminal: Boolean(input.isPosTerminal),
      serviceMode: input.serviceMode,
      tableNumber: input.serviceMode === 'dine-in' ? input.tableNumber : undefined,
      deliveryPartner:
        input.serviceMode === 'delivery'
          ? input.deliveryPartner || 'Direct Delivery'
          : undefined,
      items: canonicalItems,
      subtotal: totals.subtotal,
      discount: totals.discount,
      pointsDiscount: totals.pointsDiscount,
      pointsRedeemed: totals.pointsRedeemed,
      tax: totals.tax,
      total: totals.total,
      paymentMode,
      paymentStatus: input.isPosTerminal ? 'paid' : (isPayOnCounter ? 'unpaid' : 'pending'),
      paymentChannelLabel: isPayOnCounter ? 'Pay on Counter' : (input.isPosTerminal ? 'POS Terminal' : 'UPI Online'),
      customerId: input.customerId,
      status: 'placed',
      createdAtLabel: 'Just now',
      createdAt: new Date().toISOString(),
      elapsedMinutes: 0,
      isUrgent: true,
      serverName: 'Neha V.',
      cookingNote: input.cookingNote || undefined,
    };

    this.state.orders = [newOrder, ...this.state.orders];
    this.ordersById.set(newOrder.id, newOrder);

    if (input.idempotencyKey) {
      const existingKeys = Object.keys(this.state.idempotencyOrderIds);
      if (existingKeys.length >= 1000) {
        for (let i = 0; i < 200; i++) {
          delete this.state.idempotencyOrderIds[existingKeys[i]];
        }
      }
      this.state.idempotencyOrderIds[input.idempotencyKey] = newOrder.id;
    }

    let updatedTable: CafeTable | undefined;
    if (newOrder.serviceMode === 'dine-in' && newOrder.tableNumber) {
      const table = this.tablesById.get(newOrder.tableNumber);
      if (table) {
        updatedTable = {
          ...table,
          status: 'occupied',
          activeOrderId: newOrder.id,
          elapsedLabel: '1m',
        };
        this.tablesById.set(updatedTable.id, updatedTable);
        this.state.tables = this.state.tables.map((t) =>
          t.id === updatedTable!.id ? updatedTable! : t
        );
      }
    }

    // Deduct ingredient stock according to database-backed recipe burn
    if (input.isPosTerminal || newOrder.status === 'accepted') {
      this.deductStockForOrder(newOrder);
    }

    this.recordActivity({
      type: 'order_created',
      title: `Order #${newOrder.id} Placed`,
      description: `${newOrder.serviceMode.toUpperCase()} · KOT ${newOrder.kotNumber} · ₹${newOrder.total} (${newOrder.items.length} items)`,
      actorName: input.isPosTerminal ? 'POS Cashier' : 'Customer',
      actorRole: input.isPosTerminal ? 'cashier' : 'customer',
      severity: 'info',
      orderId: newOrder.id,
      amount: newOrder.total,
    });

    this.touch();
    // Await durable write so acknowledged order is never lost on crash
    await this.flushToPersistence();

    return {
      order: clone(newOrder),
      duplicate: false,
      rewardPoints: this.state.rewardPoints,
      tableUpdated: updatedTable ? clone(updatedTable) : undefined,
    };
  }

  public deductStockForOrder(order: CafeOrder): InventoryIngredient[] {
    if (this.stockDeductedOrderIds.has(order.id)) {
      return [];
    }
    this.stockDeductedOrderIds.add(order.id);

    const lowStockAlerts: InventoryIngredient[] = [];
    const recipeCatalog = this.state.recipes || INITIAL_RECIPES;

    order.items.forEach((item) => {
      const burn = recipeCatalog[item.menuItemId];
      if (burn) {
        burn.forEach(({ ingredientId, amount }) => {
          const ingIndex = this.state.inventory.findIndex((i) => i.id === ingredientId);
          if (ingIndex !== -1) {
            const ing = this.state.inventory[ingIndex];
            const consumed = amount * item.quantity;
            const newQty = Math.max(0, Math.round((ing.quantity - consumed) * 100) / 100);
            const status = newQty < ing.minThreshold ? 'Critical' : 'Good';
            this.state.inventory[ingIndex] = {
              ...ing,
              quantity: newQty,
              status: computeInventoryStatus(newQty, ing.minThreshold),
              fillPct: Math.min(100, Math.round((newQty / ing.maxCapacity) * 100)),
            };
            this.recordStockMovement({
              ingredientId: ing.id,
              ingredientName: ing.name,
              type: 'sale',
              quantityDelta: -consumed,
              beforeQuantity: ing.quantity,
              afterQuantity: newQty,
              unit: ing.unit,
              unitCost: ing.unitCost,
              referenceId: order.id,
              note: `Recipe consumption for order ${order.id}`,
              actorName: 'CafeOS POS',
            });

            if (newQty < ing.minThreshold) {
              lowStockAlerts.push(this.state.inventory[ingIndex]);
              this.recordActivity({
                type: 'stock_updated',
                title: `Low Stock Alert: ${ing.name}`,
                description: `${ing.name} quantity (${newQty} ${ing.unit}) has dropped below min threshold (${ing.minThreshold} ${ing.unit})`,
                actorName: 'Stock Engine',
                actorRole: 'system',
                severity: 'warning',
              });
            }
          }
        });
      }
    });

    if (lowStockAlerts.length) {
      this.touch();
    }
    return lowStockAlerts;
  }

  public updateOrderStatus(
    orderId: string,
    newStatus: OrderStatus,
    actorName = 'Staff',
    actorRole = 'manager'
  ): { order: CafeOrder; lowStockAlerts: InventoryIngredient[] } | null {
    const target = this.ordersById.get(orderId);
    if (!target) return null;

    target.status = newStatus;
    let lowStockAlerts: InventoryIngredient[] = [];

    // Deduct stock upon acceptance / preparation if not already burned
    if (newStatus === 'accepted' || newStatus === 'preparing') {
      lowStockAlerts = this.deductStockForOrder(target);
    }

    if (newStatus === 'paid') {
      target.paymentStatus = 'paid';
    }

    this.recordActivity({
      type: 'order_advanced',
      title: `Order #${target.id} Status: ${newStatus.toUpperCase()}`,
      description: `KOT ${target.kotNumber} marked as ${newStatus.toUpperCase()}`,
      actorName,
      actorRole,
      severity: newStatus === 'ready' || newStatus === 'paid' ? 'success' : 'info',
      orderId: target.id,
      amount: target.total,
    });

    if (
      (newStatus === 'served' || newStatus === 'paid' || newStatus === 'cancelled') &&
      target.serviceMode === 'dine-in' &&
      target.tableNumber
    ) {
      const stillOpenOnTable = this.state.orders.some(
        (o) =>
          o.id !== target.id &&
          o.serviceMode === 'dine-in' &&
          o.tableNumber === target.tableNumber &&
          o.status !== 'served' &&
          o.status !== 'paid' &&
          o.status !== 'cancelled'
      );
      if (!stillOpenOnTable) {
        const table = this.tablesById.get(target.tableNumber);
        if (table) {
          const updatedTable: CafeTable = {
            ...table,
            status: 'available',
            activeOrderId: undefined,
            elapsedLabel: undefined,
            billReady: false,
          };
          this.tablesById.set(updatedTable.id, updatedTable);
          this.state.tables = this.state.tables.map((t) =>
            t.id === updatedTable.id ? updatedTable : t
          );
        }
      }
    }

    this.touch();
    return { order: clone(target), lowStockAlerts };
  }

  public advanceOrderStatus(orderId: string): CafeOrder | null {
    const target = this.ordersById.get(orderId);
    if (!target) return null;
    const nextStatus = transitionOrderStatus(target.status);
    const result = this.updateOrderStatus(orderId, nextStatus, 'Kitchen Barista', 'barista');
    return result ? result.order : null;
  }

  public toggleKotItem(orderId: string, menuItemId: string): CafeOrder | null {
    const target = this.ordersById.get(orderId);
    if (!target) return null;
    target.items = target.items.map((item) =>
      item.menuItemId === menuItemId ? { ...item, checked: !item.checked } : item
    );
    this.touch();
    return clone(target);
  }

  public addMenuItem(input: z.infer<typeof addMenuItemSchema>): MenuItem {
    const id = `item-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
    const fallbackImage = input.category === 'Beverages'
      ? 'https://images.unsplash.com/photo-1541167760496-1628856ab772?auto=format&fit=crop&w=400&q=80'
      : input.category === 'Pizza' || input.category === 'Burger' || input.category === 'Meals'
      ? 'https://images.unsplash.com/photo-1568901346375-23c9450c58cd?auto=format&fit=crop&w=400&q=80'
      : 'https://images.unsplash.com/photo-1555396273-367ea4eb4db5?auto=format&fit=crop&w=400&q=80';

    const newItem: MenuItem = {
      id,
      name: input.name.trim(),
      description: input.description?.trim() || '',
      price: Math.round(input.price),
      category: input.category,
      rating: 5.0,
      isVeg: input.isVeg,
      isBestSeller: input.isBestSeller ?? false,
      isAvailable: true,
      station: input.station,
      defaultNote: input.defaultNote || '',
      imageUrl: input.imageUrl?.trim() || fallbackImage,
      unitsSold: 0,
    };

    this.state.menuItems.unshift(newItem);
    this.menuById.set(newItem.id, newItem);
    if (input.recipe.length > 0) {
      const validRecipe = input.recipe
        .filter((line) => this.state.inventory.some((ingredient) => ingredient.id === line.ingredientId))
        .map((line) => {
          const ing = this.state.inventory.find((i) => i.id === line.ingredientId)!;
          const normalizedAmount = convertRecipeAmountToInventoryUnit(line.amount, line.amountUnit, ing.unit);
          return {
            ingredientId: line.ingredientId,
            amount: normalizedAmount,
            amountUnit: line.amountUnit,
          };
        });
      if (validRecipe.length > 0) {
        this.state.recipes = {
          ...(this.state.recipes || INITIAL_RECIPES),
          [newItem.id]: validRecipe,
        };
        newItem.recipe = validRecipe;
        this.state.menuItems[0].recipe = validRecipe;
      }
    }
    this.recordActivity({
      type: 'stock_updated',
      title: `Product Added: ${newItem.name}`,
      description: `New menu item added to ${newItem.category} (₹${newItem.price})`,
      actorName: 'Admin',
      actorRole: 'owner',
      severity: 'info',
    });
    this.touch();
    return clone(newItem);
  }

  public toggleMenuItemAvailability(menuItemId: string): MenuItem | null {
    const item = this.menuById.get(menuItemId);
    if (!item) return null;
    item.isAvailable = item.isAvailable === false ? true : false;
    const stateItem = this.state.menuItems.find((m) => m.id === menuItemId);
    if (stateItem) {
      stateItem.isAvailable = item.isAvailable;
    }
    this.recordActivity({
      type: 'stock_updated',
      title: item.isAvailable ? `Restocked: ${item.name}` : `Sold Out (86): ${item.name}`,
      description: item.isAvailable
        ? `${item.name} is now available for ordering`
        : `${item.name} marked out of stock`,
      actorName: 'Staff',
      actorRole: 'manager',
      severity: item.isAvailable ? 'info' : 'warning',
    });
    this.touch();
    return clone(item);
  }

  public recordOrderFeedback(
    orderId: string,
    feedback: { rating: number; tags?: string[]; comment?: string; customerPhone?: string }
  ): { order: CafeOrder; pointsAwarded: number } | null {
    const order = this.ordersById.get(orderId);
    if (!order) return null;

    const alreadyReviewed = order.rating !== undefined;
    order.rating = feedback.rating;
    if (feedback.tags) order.feedbackTags = feedback.tags;
    if (feedback.comment) order.feedbackComment = feedback.comment;

    // Only award loyalty points once per order to prevent point farming
    const pointsAwarded = alreadyReviewed ? 0 : 25;
    if (pointsAwarded > 0) {
      this.state.rewardPoints = (this.state.rewardPoints || 0) + pointsAwarded;

      let customerName = 'Guest Customer';
      if (feedback.customerPhone || order.customerId) {
        const customer = this.state.customers.find(
          (c) =>
            (feedback.customerPhone &&
              c.phone.replace(/\D/g, '') === feedback.customerPhone.replace(/\D/g, '')) ||
            (order.customerId && c.id === order.customerId)
        );
        if (customer) {
          customerName = customer.name;
          customer.loyaltyPoints = (customer.loyaltyPoints || 0) + pointsAwarded;
        }
      }

      const entry: PointLedgerEntry = {
        id: `pt-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
        orderId: order.id,
        initials:
          customerName
            .split(' ')
            .map((w) => w[0])
            .join('')
            .slice(0, 2)
            .toUpperCase() || 'GC',
        customerName,
        context: `Order Feedback · ${order.kotNumber} (${feedback.rating}★)`,
        pointsDelta: pointsAwarded,
        note: feedback.comment ? `"${feedback.comment.slice(0, 40)}"` : 'Verified guest review submitted',
      };
      this.state.pointLedger.unshift(entry);
    }

    this.touch();

    return {
      order: clone(order),
      pointsAwarded,
    };
  }

  public getTable(tableId: string): CafeTable | null {
    const target = this.tablesById.get(tableId);
    return target ? clone(target) : null;
  }

  public checkInTable(tableId: string): CafeTable | null {
    const target = this.tablesById.get(tableId);
    if (!target) return null;
    assertCanCheckInTable(target, this.state.orders);
    const updated: CafeTable = {
      ...target,
      status: 'occupied',
      elapsedLabel: '1m',
      reservedBy: undefined,
      reservedTime: undefined,
      reservedPartySize: undefined,
    };
    this.tablesById.set(tableId, updated);
    this.state.tables = this.state.tables.map((t) => (t.id === tableId ? updated : t));
    this.touch();
    return clone(updated);
  }

  public reserveTable(input: z.infer<typeof reserveTableSchema>): {
    table?: CafeTable;
    notFound?: boolean;
  } {
    let target: CafeTable | undefined;
    if (input.tableId) {
      target = this.tablesById.get(input.tableId.toUpperCase());
      if (!target) return { notFound: true };
      if (target.status !== 'available') {
        throw new InvalidDomainTransitionError({
          domain: 'table',
          fromState: target.status,
          toState: 'reserved',
          action: 'reserve',
          message: `Table ${target.id} is currently ${target.status} and cannot be reserved.`,
        });
      }
    } else {
      const availableTables = this.state.tables.filter((t) => t.status === 'available');
      target =
        availableTables.find((t) => t.seats >= input.partySize) ??
        availableTables.sort((a, b) => b.seats - a.seats)[0];
      if (!target) {
        throw new InvalidDomainTransitionError({
          domain: 'table',
          fromState: 'occupied',
          toState: 'reserved',
          action: 'reserve',
          message: 'All cafe tables are currently occupied or reserved for that slot.',
        });
      }
    }

    const updated: CafeTable = {
      ...target,
      status: 'reserved',
      reservedBy: input.guestName,
      reservedTime: input.timeSlot,
      reservedPartySize: input.partySize,
    };
    this.tablesById.set(updated.id, updated);
    this.state.tables = this.state.tables.map((t) => (t.id === updated.id ? updated : t));
    this.touch();
    return { table: clone(updated) };
  }

  public addTable(input: z.infer<typeof addTableSchema>): {
    table?: CafeTable;
    conflict?: boolean;
  } {
    if (this.state.tables.some((t) => t.id.toLowerCase() === input.id.toLowerCase())) {
      return { conflict: true };
    }
    const created: CafeTable = {
      id: input.id,
      label: `Table ${input.id}`,
      seats: input.seats,
      zone: input.zone,
      floor: input.floor,
      status: 'available',
    };
    this.tablesById.set(created.id, created);
    this.state.tables = [...this.state.tables, created];
    this.touch();
    return { table: clone(created) };
  }

  private moveTableParty(
    mode: 'transfer' | 'merge',
    sourceTableId: string,
    targetTableId: string
  ): boolean {
    const src = this.tablesById.get(sourceTableId);
    const dst = this.tablesById.get(targetTableId);
    const { sourceState } = assertCanMoveTableParty(mode, src, dst, this.state.orders);

    this.state.orders = this.state.orders.map((o) => {
      if (o.serviceMode === 'dine-in' && o.tableNumber === sourceTableId && o.status !== 'served') {
        const updated = { ...o, tableNumber: targetTableId };
        this.ordersById.set(updated.id, updated);
        return updated;
      }
      return o;
    });

    const movedOrder = this.state.orders.find(
      (o) => o.serviceMode === 'dine-in' && o.tableNumber === targetTableId && o.status !== 'served'
    );

    this.state.tables = this.state.tables.map((t) => {
      if (t.id === sourceTableId) {
        const updated: CafeTable = {
          ...t,
          status: 'available',
          activeOrderId: undefined,
          elapsedLabel: undefined,
          billReady: false,
        };
        this.tablesById.set(updated.id, updated);
        return updated;
      }
      if (t.id === targetTableId) {
        const updated: CafeTable = {
          ...t,
          status: 'occupied',
          activeOrderId:
            movedOrder?.id ?? sourceState.activeOrder?.id ?? src!.activeOrderId ?? t.activeOrderId,
          elapsedLabel: t.elapsedLabel || src!.elapsedLabel || '1m',
          reservedBy: undefined,
          reservedTime: undefined,
          reservedPartySize: undefined,
        };
        this.tablesById.set(updated.id, updated);
        return updated;
      }
      return t;
    });
    this.touch();
    return true;
  }

  public transferTable(sourceTableId: string, targetTableId: string): boolean {
    return this.moveTableParty('transfer', sourceTableId, targetTableId);
  }

  public mergeTables(sourceTableId: string, targetTableId: string): boolean {
    return this.moveTableParty('merge', sourceTableId, targetTableId);
  }

  public restockIngredient(id: string, addedQty?: number): InventoryIngredient | null {
    const exists = this.state.inventory.some((i) => i.id === id);
    if (!exists) return null;
    this.state.inventory = restockIngredientItem(this.state.inventory, id, addedQty);
    const updated = this.state.inventory.find((i) => i.id === id) ?? null;
    if (updated) {
      // restockIngredientItem already applied the quantity change; record the stock movement.
      const movementQty =
        addedQty ??
        (updated.unit === 'g' ? 1000 : updated.unit === 'pcs' ? 10 : 2.5);
      this.recordStockMovement({
        ingredientId: updated.id,
        ingredientName: updated.name,
        type: 'receipt',
        quantityDelta: movementQty,
        beforeQuantity: Math.max(0, updated.quantity - movementQty),
        afterQuantity: updated.quantity,
        unit: updated.unit,
        unitCost: updated.unitCost,
        note: 'Manual restock',
        actorName: 'Inventory Manager',
      });
      updated.reorderRequested = false;
      updated.reorderRequestedAt = undefined;
      updated.reorderNote = undefined;
    }
    this.touch();
    return updated ? clone(updated) : null;
  }

  private recordStockMovement(input: Omit<StockMovement, 'id' | 'createdAt'>): StockMovement {
    if (!this.state.stockMovements) this.state.stockMovements = [];
    const movement: StockMovement = {
      ...input,
      id: `stm-${crypto.randomUUID().slice(0, 12)}`,
      createdAt: new Date().toISOString(),
    };
    this.state.stockMovements = [movement, ...this.state.stockMovements].slice(0, 5000);
    return movement;
  }

  private updateIngredientQuantity(
    ingredientId: string,
    quantityDelta: number,
    type: StockMovement['type'],
    referenceId?: string,
    note?: string,
    actorName?: string
  ): InventoryIngredient | null {
    const index = this.state.inventory.findIndex((item) => item.id === ingredientId);
    if (index === -1) return null;
    const ingredient = this.state.inventory[index];
    const afterQuantity = Math.max(
      0,
      Math.round((ingredient.quantity + quantityDelta) * 100) / 100
    );
    const updated: InventoryIngredient = {
      ...ingredient,
      quantity: afterQuantity,
      status: computeInventoryStatus(afterQuantity, ingredient.minThreshold),
      fillPct: Math.min(100, Math.round((afterQuantity / ingredient.maxCapacity) * 100)),
      movementType: quantityDelta >= 0 ? 'in' : 'out',
    };
    this.state.inventory[index] = updated;
    this.recordStockMovement({
      ingredientId,
      ingredientName: ingredient.name,
      type,
      quantityDelta,
      beforeQuantity: ingredient.quantity,
      afterQuantity,
      unit: ingredient.unit,
      unitCost: ingredient.unitCost,
      referenceId,
      note,
      actorName,
    });
    return clone(updated);
  }

  public receiveStock(
    input: z.infer<typeof stockReceiptSchema>,
    actorName = 'Inventory Manager'
  ): InventoryIngredient | null {
    const item = this.updateIngredientQuantity(
      input.ingredientId,
      input.quantity,
      'receipt',
      undefined,
      input.note || `Stock received${input.supplier ? ` from ${input.supplier}` : ''}`,
      actorName
    );
    if (!item) return null;
    if (!this.state.inventoryBatches) this.state.inventoryBatches = [];
    const batch: InventoryBatch = {
      id: `batch-${crypto.randomUUID().slice(0, 10)}`,
      ingredientId: item.id,
      ingredientName: item.name,
      batchNumber: input.batchNumber || `REC-${Date.now()}`,
      quantity: input.quantity,
      unit: item.unit,
      unitCost: input.unitCost,
      receivedAt: new Date().toISOString(),
      expiryDate: input.expiryDate || undefined,
      supplier: input.supplier || item.supplier,
      status: 'active',
    };
    this.state.inventoryBatches = [batch, ...this.state.inventoryBatches];
    item.reorderRequested = false;
    item.reorderRequestedAt = undefined;
    item.reorderNote = undefined;
    this.touch();
    return clone(item);
  }

  public recordWaste(
    input: z.infer<typeof stockWasteSchema>,
    actorName = 'Kitchen Staff'
  ): InventoryIngredient | null {
    const item = this.updateIngredientQuantity(
      input.ingredientId,
      -input.quantity,
      'waste',
      input.batchId,
      input.reason,
      actorName
    );
    if (!item) return null;
    if (input.batchId && this.state.inventoryBatches) {
      this.state.inventoryBatches = this.state.inventoryBatches.map((batch) =>
        batch.id === input.batchId
          ? {
              ...batch,
              quantity: Math.max(0, batch.quantity - input.quantity),
              status:
                batch.quantity <= input.quantity
                  ? 'consumed'
                  : batch.status,
            }
          : batch
      );
    }
    this.touch();
    return clone(item);
  }

  public transferStock(
    input: z.infer<typeof stockTransferSchema>,
    actorName = 'Inventory Manager'
  ): InventoryIngredient | null {
    const item = this.updateIngredientQuantity(
      input.ingredientId,
      -input.quantity,
      'transfer',
      undefined,
      `Transfer from ${input.fromLocation} to ${input.toLocation}${input.note ? ` - ${input.note}` : ''}`,
      actorName
    );
    this.touch();
    return item;
  }

  public createStockCount(
    input: z.infer<typeof stockCountSchema>,
    actorName = 'Inventory Manager'
  ): StockCount {
    const lines: StockCountLine[] = input.physicalCounts.map((entry) => {
      const item = this.state.inventory.find((candidate) => candidate.id === entry.ingredientId);
      if (!item) {
        throw new InvalidDomainTransitionError({
          domain: 'inventory',
          fromState: 'unknown',
          toState: 'counted',
          action: 'create_stock_count',
          message: `Ingredient ${entry.ingredientId} does not exist.`,
          httpStatus: 404,
        });
      }
      return {
        ingredientId: item.id,
        ingredientName: item.name,
        systemQuantity: item.quantity,
        physicalQuantity: entry.physicalQuantity,
        variance: Math.round((entry.physicalQuantity - item.quantity) * 100) / 100,
        unit: item.unit,
        unitCost: item.unitCost,
      };
    });
    const count: StockCount = {
      id: `count-${crypto.randomUUID().slice(0, 10)}`,
      status: 'draft',
      lines,
      createdAt: new Date().toISOString(),
      note: input.note,
    };
    if (!this.state.stockCounts) this.state.stockCounts = [];
    this.state.stockCounts = [count, ...this.state.stockCounts];
    this.touch();
    return clone(count);
  }

  public approveStockCount(countId: string, actorName = 'Inventory Manager'): StockCount | null {
    const count = this.state.stockCounts?.find((entry) => entry.id === countId);
    if (!count || count.status === 'approved') return count ? clone(count) : null;
    for (const line of count.lines) {
      if (line.variance !== 0) {
        this.updateIngredientQuantity(
          line.ingredientId,
          line.variance,
          'stock_count',
          count.id,
          count.note || 'Approved physical stock count',
          actorName
        );
      }
    }
    count.status = 'approved';
    count.approvedAt = new Date().toISOString();
    this.touch();
    return clone(count);
  }

  public createPurchaseOrder(
    input: z.infer<typeof purchaseOrderSchema>,
    actorName = 'Inventory Manager'
  ): PurchaseOrder {
    const lines: PurchaseOrderLine[] = input.lines.map((line) => {
      const item = this.state.inventory.find((candidate) => candidate.id === line.ingredientId);
      if (!item) {
        throw new InvalidDomainTransitionError({
          domain: 'inventory',
          fromState: 'unknown',
          toState: 'ordered',
          action: 'create_purchase_order',
          message: `Ingredient ${line.ingredientId} does not exist.`,
          httpStatus: 404,
        });
      }
      return {
        ingredientId: item.id,
        ingredientName: item.name,
        orderedQuantity: line.quantity,
        receivedQuantity: 0,
        unit: item.unit,
        unitCost: line.unitCost,
      };
    });
    const purchaseOrder: PurchaseOrder = {
      id: `PO-${Date.now().toString(36).toUpperCase()}`,
      supplier: input.supplier,
      status: 'ordered',
      lines,
      createdAt: new Date().toISOString(),
      note: input.note,
    };
    if (!this.state.purchaseOrders) this.state.purchaseOrders = [];
    this.state.purchaseOrders = [purchaseOrder, ...this.state.purchaseOrders];
    this.recordActivity({
      type: 'stock_updated',
      title: `Purchase Order ${purchaseOrder.id} Created`,
      description: `Ordered from ${input.supplier}. ${lines.length} ingredient SKU(s).`,
      actorName,
      severity: 'info',
      amount: lines.reduce((sum, line) => sum + line.orderedQuantity * line.unitCost, 0),
    });
    this.touch();
    return clone(purchaseOrder);
  }

  public receivePurchaseOrder(
    input: z.infer<typeof receivePurchaseOrderSchema>,
    actorName = 'Inventory Manager'
  ): PurchaseOrder | null {
    const purchaseOrder = this.state.purchaseOrders?.find(
      (entry) => entry.id === input.purchaseOrderId
    );
    if (!purchaseOrder) return null;
    let totalReceived = 0;
    for (const receivedLine of input.receivedLines) {
      const line = purchaseOrder.lines.find(
        (candidate) => candidate.ingredientId === receivedLine.ingredientId
      );
      if (!line) continue;
      const remaining = line.orderedQuantity - line.receivedQuantity;
      const receivedQuantity = Math.min(receivedLine.quantity, remaining);
      if (receivedQuantity <= 0) continue;
      line.receivedQuantity += receivedQuantity;
      totalReceived += receivedQuantity;
      this.receiveStock(
        {
          ingredientId: line.ingredientId,
          quantity: receivedQuantity,
          unitCost: line.unitCost,
          supplier: purchaseOrder.supplier,
          batchNumber: receivedLine.batchNumber || `${purchaseOrder.id}-${line.ingredientId}`,
          expiryDate: receivedLine.expiryDate,
          note: `Received against ${purchaseOrder.id}`,
        },
        actorName
      );
    }
    if (totalReceived <= 0) return clone(purchaseOrder);
    const fullyReceived = purchaseOrder.lines.every(
      (line) => line.receivedQuantity >= line.orderedQuantity
    );
    purchaseOrder.status = fullyReceived ? 'received' : 'partially_received';
    if (fullyReceived) purchaseOrder.receivedAt = new Date().toISOString();
    this.recordActivity({
      type: 'stock_updated',
      title: `Purchase Order ${purchaseOrder.id} Received`,
      description: `${purchaseOrder.status === 'received' ? 'Fully' : 'Partially'} received from ${purchaseOrder.supplier}.`,
      actorName,
      severity: 'info',
      amount: totalReceived,
    });
    this.touch();
    return clone(purchaseOrder);
  }

  public requestIngredientReorder(
    id: string,
    note?: string,
    staffName?: string
  ): InventoryIngredient | null {
    const item = this.state.inventory.find((i) => i.id === id);
    if (!item) return null;
    item.reorderRequested = true;
    item.reorderRequestedAt = new Date().toLocaleTimeString('en-IN', {
      hour: '2-digit',
      minute: '2-digit',
    });
    item.reorderNote = note?.trim() || 'Kitchen chef flagged item as running low';
    if (item.status === 'Good') {
      item.status = 'Reorder Soon';
    }
    this.recordActivity({
      type: 'stock_updated',
      title: `Kitchen Stock Alert: ${item.name}`,
      description: `Kitchen requested reorder for ${item.name} (${item.quantity} ${item.unit} in stock). ${item.reorderNote}`,
      actorName: staffName || 'Kitchen Chef',
      actorRole: 'chef',
      severity: 'warning',
    });
    this.touch();
    return clone(item);
  }

  public addIngredient(input: z.infer<typeof addIngredientSchema>): InventoryIngredient {
    const maxCapacity = Math.max(input.quantity * 1.4, input.minThreshold * 2, 10);
    const created: InventoryIngredient = {
      id: shortId('ing'),
      name: input.name,
      quantity: input.quantity,
      unit: input.unit,
      minThreshold: input.minThreshold,
      maxCapacity,
      subtitle: `Min: ${input.minThreshold} ${input.unit} • Supplier: ${input.supplier}`,
      supplier: input.supplier,
      status: computeInventoryStatus(input.quantity, input.minThreshold),
      fillPct: Math.min(100, Math.round((input.quantity / maxCapacity) * 100)),
      icon: 'inventory_2',
      unitCost: input.unitCost ?? 180,
      movementType: 'in',
    };
    this.state.inventory = [created, ...this.state.inventory];
    this.touch();
    return clone(created);
  }

  public addCustomer(input: z.infer<typeof addCustomerSchema>): CustomerProfile {
    const parts = input.name.trim().split(/\s+/);
    const initials = (parts[0][0] + (parts[1]?.[0] || '')).toUpperCase();
    const created: CustomerProfile = {
      id: shortId('cust'),
      initials,
      name: input.name,
      phone: input.phone,
      segment: input.segment,
      visits: 1,
      totalSpent: 240,
      avgTicket: 240,
      favorites: input.favorites,
      lastVisit: 'Just added',
      note: input.note,
    };
    this.customersById.set(created.id, created);
    this.state.customers = [created, ...this.state.customers];
    this.touch();
    return clone(created);
  }

  public exportCustomerPii(id: string): Record<string, unknown> | null {
    const customer = this.customersById.get(id);
    if (!customer) return null;
    return {
      exportedAt: new Date().toISOString(),
      outletId: this.state.outletId,
      dpdpNotice: 'Right to Access / Portability export',
      profile: clone(customer),
    };
  }

  public addLoyaltyRule(input: z.infer<typeof addLoyaltyRuleSchema>): LoyaltyRule {
    const created: LoyaltyRule = {
      id: shortId('rule'),
      title: input.title,
      headline: input.headline,
      badge: input.badge,
      description: input.description,
      icon: 'stars',
      tone: 'primary',
    };
    this.state.loyaltyRules = [...this.state.loyaltyRules, created];
    this.touch();
    return clone(created);
  }

  public createCampaign(input: z.infer<typeof createCampaignSchema>): PromoCampaign {
    const created: PromoCampaign = {
      id: shortId('camp'),
      title: input.title,
      code: input.code,
      status: 'active',
      validityLabel: input.validityLabel,
      description: input.description,
      usedLabel: '0 used',
      revenueLabel: '₹0 revenue',
      icon: 'sell',
      tone: 'primary',
    };
    this.state.campaigns = [created, ...this.state.campaigns];
    this.touch();
    return clone(created);
  }

  public toggleCampaignStatus(
    id: string,
    event: 'toggle' | 'pause' | 'activate' | 'expire' = 'toggle'
  ): PromoCampaign | null {
    const target = this.state.campaigns.find((c) => c.id === id);
    if (!target) return null;
    target.status = transitionCampaignStatus(target.status, event);
    this.touch();
    return clone(target);
  }

  public addStaff(input: z.infer<typeof addStaffSchema>): StaffMember {
    const parts = input.name.trim().split(/\s+/);
    const initials = (parts[0][0] + (parts[1]?.[0] || '')).toUpperCase();
    const created: StaffMember = {
      id: shortId('staff'),
      initials,
      name: input.name,
      role: input.role,
      roleIcon:
        /owner/i.test(input.role) || input.role === 'Store Manager'
          ? 'shield_person'
          : /kitchen/i.test(input.role)
            ? 'skillet'
            : /server/i.test(input.role)
              ? 'table_bar'
              : input.role === 'Cashier'
                ? 'point_of_sale'
                : 'coffee_maker',
      shiftLabel: input.shiftLabel,
      shiftBucket: 'afternoon',
      isOnDuty: true,
      dutyStatus: 'on_duty',
      phone: input.phone,
      statLeft: '4.8 Efficiency',
      statRight: 'Clocked In',
      stationBadge: `${input.role} Station Active`,
      stationIcon: 'verified_user',
    };
    this.state.staffRoster = [created, ...this.state.staffRoster];
    this.touch();
    return clone(created);
  }

  public toggleStaffDuty(id: string): StaffMember | null {
    const idx = this.state.staffRoster.findIndex((s) => s.id === id);
    if (idx < 0) return null;
    const nextMember = transitionStaffDuty(this.state.staffRoster[idx]);
    this.state.staffRoster[idx] = nextMember;
    this.touch();
    return clone(nextMember);
  }

  public saveSettings(input: z.infer<typeof cafeSettingsSchema>): CafeSettings {
    this.state.cafeSettings = clone(input);
    this.touch();
    return clone(this.state.cafeSettings);
  }

  public resetSettings(): CafeSettings {
    this.state.cafeSettings = clone(INITIAL_CAFE_SETTINGS);
    this.touch();
    return clone(this.state.cafeSettings);
  }

}
