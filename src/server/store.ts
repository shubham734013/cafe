import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import {
  INITIAL_CAFE_SETTINGS,
  INITIAL_CAMPAIGNS,
  INITIAL_CUSTOMERS,
  INITIAL_INVENTORY,
  INITIAL_LOYALTY_RULES,
  INITIAL_ORDERS,
  INITIAL_POINT_LEDGER,
  INITIAL_STAFF_ROSTER,
  INITIAL_TABLES,
  MENU_ITEMS,
} from '../data/cafeSeedData';
import type {
  CafeOrder,
  CafeSettings,
  CafeTable,
  CustomerProfile,
  InventoryIngredient,
  LoyaltyRule,
  MenuItem,
  PointLedgerEntry,
  PromoCampaign,
  StaffMember,
} from '../types/cafe';
import {
  calculateCartTotals,
  computeInventoryStatus,
  restockIngredientItem,
} from '../utils/cafeLogic';
import {
  InvalidDomainTransitionError,
  assertCanCheckInTable,
  assertCanMoveTableParty,
  deriveInitialOrderPayment,
  transitionCampaignStatus,
  transitionOrderPayment,
  transitionOrderStatus,
  transitionStaffDuty,
} from '../state/cafeStateMachines';
import type {
  YoupiPaymentRecord,
  YoupiPersistenceAdapter,
  YoupiWebhookDeliveryRecord,
} from '../payments/types';
import type { z } from 'zod';
import type {
  addCustomerSchema,
  addIngredientSchema,
  addLoyaltyRuleSchema,
  addStaffSchema,
  addTableSchema,
  cafeSettingsSchema,
  createCampaignSchema,
  createOrderSchema,
  reserveTableSchema,
  settleOrderPaymentSchema,
} from '../shared/schemas';
import {
  type CustomerSessionPayload,
  type StaffSessionPayload,
  hasStaffRole,
} from './auth';

export interface CafeBootstrapState {
  outletId: string;
  orders: CafeOrder[];
  payments: YoupiPaymentRecord[];
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
  updatedAt: string;
}

interface PersistedEnvelope extends Omit<CafeBootstrapState, 'payments'> {
  nextOrderSeq: number;
  idempotencyOrderIds: Record<string, string>;
  youpiPayments: YoupiPaymentRecord[];
  youpiWebhookDeliveries: YoupiWebhookDeliveryRecord[];
  youpiUtrClaims: Record<string, { orderId: string; paymentId: string }>;
}

const MAX_WEBHOOK_DELIVERIES = 5000;

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

export class CafeStore {
  private state: PersistedEnvelope;
  private persistPath: string | null;

  // O(1) secondary lookup indexes
  private menuById = new Map<string, MenuItem>();
  private ordersById = new Map<string, CafeOrder>();
  private tablesById = new Map<string, CafeTable>();
  private customersById = new Map<string, CustomerProfile>();
  private paymentsById = new Map<string, YoupiPaymentRecord>();
  private paymentsByGatewayId = new Map<string, YoupiPaymentRecord>();
  private paymentsByIdempotencyKey = new Map<string, YoupiPaymentRecord>();
  private webhookDeliveryIds = new Set<string>();

  // Async coalesced persistence state
  private pendingWriteTimer: NodeJS.Timeout | null = null;
  private writeInFlight: Promise<void> | null = null;
  private writeDirty = false;

  constructor(persistPath: string | null = path.resolve(process.cwd(), '.data', 'cafe-state.json')) {
    this.persistPath = persistPath;
    this.state = this.loadOrSeed();
    this.rebuildIndexes();
  }

  private createSeedState(): PersistedEnvelope {
    const orders = clone(INITIAL_ORDERS);
    return {
      outletId: 'seth-sawariya-main',
      orders,
      tables: clone(INITIAL_TABLES),
      inventory: clone(INITIAL_INVENTORY),
      customers: clone(INITIAL_CUSTOMERS),
      loyaltyRules: clone(INITIAL_LOYALTY_RULES),
      pointLedger: clone(INITIAL_POINT_LEDGER),
      campaigns: clone(INITIAL_CAMPAIGNS),
      staffRoster: clone(INITIAL_STAFF_ROSTER),
      cafeSettings: clone(INITIAL_CAFE_SETTINGS),
      menuItems: clone(MENU_ITEMS),
      rewardPoints: 340,
      updatedAt: new Date().toISOString(),
      nextOrderSeq: deriveMaxOrderSeq(orders),
      idempotencyOrderIds: {},
      youpiPayments: [],
      youpiWebhookDeliveries: [],
      youpiUtrClaims: {},
    };
  }

  private rebuildIndexes(): void {
    this.menuById.clear();
    for (const item of this.state.menuItems) {
      this.menuById.set(item.id, item);
    }

    this.ordersById.clear();
    for (const order of this.state.orders) {
      this.ordersById.set(order.id, order);
    }

    this.tablesById.clear();
    for (const table of this.state.tables) {
      this.tablesById.set(table.id, table);
    }

    this.customersById.clear();
    for (const customer of this.state.customers) {
      this.customersById.set(customer.id, customer);
    }

    this.paymentsById.clear();
    this.paymentsByGatewayId.clear();
    this.paymentsByIdempotencyKey.clear();
    for (const payment of this.state.youpiPayments) {
      this.paymentsById.set(payment.id, payment);
      this.paymentsByGatewayId.set(payment.gatewayPaymentId, payment);
      this.paymentsByIdempotencyKey.set(payment.idempotencyKey, payment);
    }

    this.webhookDeliveryIds.clear();
    for (const delivery of this.state.youpiWebhookDeliveries) {
      this.webhookDeliveryIds.add(delivery.deliveryId);
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
          const base = this.createSeedState();
          const merged: PersistedEnvelope = {
            ...base,
            ...parsed,
            menuItems: base.menuItems,
            idempotencyOrderIds: parsed.idempotencyOrderIds ?? {},
            youpiPayments: Array.isArray(parsed.youpiPayments) ? parsed.youpiPayments : [],
            youpiWebhookDeliveries: Array.isArray(parsed.youpiWebhookDeliveries)
              ? parsed.youpiWebhookDeliveries
              : [],
            youpiUtrClaims: parsed.youpiUtrClaims ?? {},
            nextOrderSeq:
              typeof parsed.nextOrderSeq === 'number'
                ? Math.max(parsed.nextOrderSeq, deriveMaxOrderSeq(parsed.orders))
                : deriveMaxOrderSeq(parsed.orders),
          };
          return merged;
        }
      }
    } catch (err) {
      console.warn('[CafeStore] Failed to load persisted state, falling back to seed:', err);
    }
    const seeded = this.createSeedState();
    this.flushToDiskSync(seeded);
    return seeded;
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

  private scheduleAsyncFlush(): void {
    if (!this.persistPath) return;
    this.writeDirty = true;
    if (this.pendingWriteTimer) return;
    this.pendingWriteTimer = setTimeout(() => {
      this.pendingWriteTimer = null;
      void this.drainAsyncWrite();
    }, 50);
    this.pendingWriteTimer.unref();
  }

  private async drainAsyncWrite(): Promise<void> {
    if (!this.persistPath || !this.writeDirty || this.writeInFlight) return;
    const persistPath = this.persistPath;
    this.writeDirty = false;
    const snapshot = clone(this.state);

    this.writeInFlight = (async () => {
      try {
        await fs.promises.mkdir(path.dirname(persistPath), { recursive: true });
        const tmp = `${persistPath}.tmp`;
        await fs.promises.writeFile(tmp, this.serializeSnapshot(snapshot), 'utf8');
        await fs.promises.rename(tmp, persistPath);
      } catch (err) {
        console.warn('[CafeStore] Async persistence write failed:', err);
      } finally {
        this.writeInFlight = null;
        if (this.writeDirty) {
          void this.drainAsyncWrite();
        }
      }
    })();

    await this.writeInFlight;
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
      youpiPayments,
      youpiWebhookDeliveries: _ignoredDeliveries,
      youpiUtrClaims: _ignoredClaims,
      nextOrderSeq: _ignoredSeq,
      ...publicState
    } = this.state;

    // Internal/default callers without actor receive full state
    if (!actor) {
      return clone({
        ...publicState,
        payments: youpiPayments,
      });
    }

    const staffSession = actor.staffSession;
    const customerSession = actor.customerSession;

    if (staffSession) {
      const canSeeCustomers = hasStaffRole(staffSession, ['owner', 'manager', 'cashier']);
      const canSeeStaffPhones = hasStaffRole(staffSession, ['owner', 'manager']);
      return clone({
        ...publicState,
        payments: youpiPayments,
        customers: canSeeCustomers ? publicState.customers : [],
        staffRoster: canSeeStaffPhones
          ? publicState.staffRoster
          : publicState.staffRoster.map((s) => ({ ...s, phone: undefined })),
      });
    }

    // Customer / guest view: strictly scope PII & foreign order data
    const allowedOrderIds = new Set(customerSession?.orderIds ?? []);
    const scopedOrders = publicState.orders.filter((o) => allowedOrderIds.has(o.id));
    const scopedPayments = youpiPayments.filter((p) => allowedOrderIds.has(p.orderId));
    const sanitizedTables = publicState.tables.map((t) => ({
      ...t,
      activeOrderId: undefined,
      reservedBy: undefined,
      reservedPartySize: undefined,
    }));

    return clone({
      ...publicState,
      orders: scopedOrders,
      payments: scopedPayments,
      tables: sanitizedTables,
      customers: [],
      staffRoster: [],
      pointLedger: [],
      rewardPoints: customerSession ? publicState.rewardPoints : 0,
    });
  }

  public getOrders(): CafeOrder[] {
    return clone(this.state.orders);
  }

  private awardOrderPoints(order: CafeOrder, context: string, note: string): void {
    if ((order.loyaltyPointsAwarded ?? 0) > 0) return;
    const earned = Math.max(10, Math.floor(order.total / 10));
    order.loyaltyPointsAwarded = earned;
    this.state.rewardPoints += earned;
    this.state.pointLedger = [
      {
        id: shortId('pts'),
        initials: 'SS',
        customerName: 'Seth Sawariya Guest',
        context,
        pointsDelta: earned,
        note,
      },
      ...this.state.pointLedger,
    ];
  }

  private clawbackOrderPoints(order: CafeOrder, reason: string): void {
    const awarded = order.loyaltyPointsAwarded ?? 0;
    if (awarded <= 0) return;
    this.state.rewardPoints = Math.max(0, this.state.rewardPoints - awarded);
    order.loyaltyPointsAwarded = 0;
    this.state.pointLedger = [
      {
        id: shortId('pts'),
        initials: 'SS',
        customerName: 'Seth Sawariya Guest',
        context: `Refund Clawback • Order #${order.id}`,
        pointsDelta: -awarded,
        note: reason,
      },
      ...this.state.pointLedger,
    ];
  }

  public createOrder(input: z.infer<typeof createOrderSchema>): {
    order: CafeOrder;
    duplicate: boolean;
    rewardPoints: number;
  } {
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

    // Enforce server-authoritative catalog pricing, station, name & image
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
      return {
        ...item,
        name: catalogItem.name,
        price: catalogItem.price,
        station: catalogItem.station,
        imageUrl: catalogItem.imageUrl,
        checked: false,
      };
    });

    const totals = calculateCartTotals(
      canonicalItems,
      input.couponCode ?? '',
      input.serviceMode,
      Boolean(input.isPosTerminal),
      this.state.campaigns
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

    this.state.nextOrderSeq += 1;
    const nextNum = this.state.nextOrderSeq;
    const preferredUpiApp = input.paymentMode === 'upi' ? input.preferredUpiApp ?? 'any' : undefined;
    const initialPayment = deriveInitialOrderPayment({
      orderNumberSeq: nextNum,
      paymentMode: input.paymentMode,
      isPosTerminal: Boolean(input.isPosTerminal),
      preferredUpiApp,
      cardDetails: input.cardDetails,
    });

    const newOrder: CafeOrder = {
      id: `SSCB${nextNum}`,
      kotNumber: `#${nextNum}`,
      serviceMode: input.serviceMode,
      tableNumber: input.serviceMode === 'dine-in' ? input.tableNumber || 'T3' : undefined,
      deliveryPartner:
        input.serviceMode === 'delivery'
          ? input.deliveryPartner || 'Direct Delivery'
          : undefined,
      items: canonicalItems,
      subtotal: totals.subtotal,
      discount: totals.discount,
      tax: totals.tax,
      total: totals.total,
      paymentMode: input.paymentMode,
      paymentStatus: initialPayment.paymentStatus,
      customerId: input.customerId || (!input.isPosTerminal ? 'cust-1' : undefined),
      paymentRef: initialPayment.paymentRef,
      preferredUpiApp: initialPayment.preferredUpiApp,
      paymentChannelLabel: initialPayment.paymentChannelLabel,
      cardDetails: initialPayment.cardDetails,
      status: 'placed',
      createdAtLabel: 'Just now',
      elapsedMinutes: 0,
      isUrgent: true,
      serverName: 'Neha V.',
      cookingNote: input.cookingNote || undefined,
    };

    if (!input.isPosTerminal && initialPayment.paymentStatus === 'paid') {
      this.awardOrderPoints(
        newOrder,
        `${newOrder.paymentMode.toUpperCase()} Order #${newOrder.id}`,
        newOrder.paymentRef || 'Online Checkout'
      );
    }

    this.state.orders = [newOrder, ...this.state.orders];
    this.ordersById.set(newOrder.id, newOrder);

    if (input.idempotencyKey) {
      this.state.idempotencyOrderIds[input.idempotencyKey] = newOrder.id;
    }

    if (newOrder.serviceMode === 'dine-in' && newOrder.tableNumber) {
      const table = this.tablesById.get(newOrder.tableNumber);
      if (table) {
        const updatedTable: CafeTable = {
          ...table,
          status: 'occupied',
          activeOrderId: newOrder.id,
          elapsedLabel: '1m',
        };
        this.tablesById.set(updatedTable.id, updatedTable);
        this.state.tables = this.state.tables.map((t) =>
          t.id === updatedTable.id ? updatedTable : t
        );
      }
    }

    this.touch();
    return {
      order: clone(newOrder),
      duplicate: false,
      rewardPoints: this.state.rewardPoints,
    };
  }

  public settleOrderPayment(
    orderId: string,
    input: z.infer<typeof settleOrderPaymentSchema>
  ): CafeOrder | null {
    const order = this.ordersById.get(orderId);
    if (!order) return null;

    const wasPaid = order.paymentStatus === 'paid';
    const outcome = transitionOrderPayment(order, input);

    order.paymentStatus = outcome.nextPaymentStatus;
    if (outcome.nextPaymentChannelLabel) {
      order.paymentChannelLabel = outcome.nextPaymentChannelLabel;
    }
    order.paymentRef = outcome.nextPaymentRef;
    order.cardDetails = outcome.nextCardDetails;

    if (outcome.shouldAwardPoints && !wasPaid) {
      this.awardOrderPoints(
        order,
        `${order.paymentMode.toUpperCase()} Settled • Order #${order.id}`,
        order.paymentRef || 'Counter Settlement'
      );
    }

    if (input.action === 'refund') {
      this.clawbackOrderPoints(order, input.note?.trim() || 'Refunded via Order Management');
      const refundedAt = new Date().toISOString();
      this.state.youpiPayments = this.state.youpiPayments.map((p) => {
        if ((p.orderId === order.id || p.id === order.paymentId) && p.status === 'reconciled') {
          const updated: YoupiPaymentRecord = {
            ...p,
            status: 'refunded',
            gatewayStatus: 'REFUNDED',
            refundReason: input.note?.trim() || 'Refunded via order management',
            refundedAt,
            updatedAt: refundedAt,
          };
          this.paymentsById.set(updated.id, updated);
          this.paymentsByGatewayId.set(updated.gatewayPaymentId, updated);
          this.paymentsByIdempotencyKey.set(updated.idempotencyKey, updated);
          return updated;
        }
        return p;
      });
    }

    this.touch();
    return clone(order);
  }

  public advanceOrderStatus(orderId: string): CafeOrder | null {
    const target = this.ordersById.get(orderId);
    if (!target) return null;
    const nextStatus = transitionOrderStatus(target.status);
    target.status = nextStatus;

    if (nextStatus === 'served' && target.serviceMode === 'dine-in' && target.tableNumber) {
      const stillOpenOnTable = this.state.orders.some(
        (o) =>
          o.id !== target.id &&
          o.serviceMode === 'dine-in' &&
          o.tableNumber === target.tableNumber &&
          o.status !== 'served'
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
    return clone(target);
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
    this.touch();
    const updated = this.state.inventory.find((i) => i.id === id) ?? null;
    return updated ? clone(updated) : null;
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
        input.role === 'Cashier'
          ? 'point_of_sale'
          : input.role === 'Store Manager'
            ? 'shield_person'
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

  public createYoupiPersistenceAdapter(): YoupiPersistenceAdapter {
    return {
      getOrderById: (orderId) => {
        const order = this.ordersById.get(orderId);
        if (!order) return null;
        return {
          id: order.id,
          total: order.total,
          customerId: order.customerId,
          paymentStatus: order.paymentStatus,
        };
      },
      getPaymentById: (id) => {
        const found = this.paymentsById.get(id);
        return found ? clone(found) : null;
      },
      getPaymentByGatewayId: (gatewayPaymentId) => {
        const found = this.paymentsByGatewayId.get(gatewayPaymentId);
        return found ? clone(found) : null;
      },
      getPaymentByIdempotencyKey: (key) => {
        const found = this.paymentsByIdempotencyKey.get(key);
        return found ? clone(found) : null;
      },
      listPaymentsByOrderId: (orderId) => {
        return clone(this.state.youpiPayments.filter((p) => p.orderId === orderId));
      },
      listPaymentsByCustomerId: (customerId) => {
        const matchingOrders = new Set(
          this.state.orders.filter((o) => o.customerId === customerId).map((o) => o.id)
        );
        return clone(
          this.state.youpiPayments.filter(
            (p) => p.customerId === customerId || matchingOrders.has(p.orderId)
          )
        );
      },
      listAllPayments: () => clone(this.state.youpiPayments),
      savePayment: (payment) => {
        const copy = clone(payment);
        const idx = this.state.youpiPayments.findIndex((p) => p.id === payment.id);
        if (idx >= 0) {
          this.state.youpiPayments[idx] = copy;
        } else {
          this.state.youpiPayments = [copy, ...this.state.youpiPayments];
        }
        this.paymentsById.set(copy.id, copy);
        this.paymentsByGatewayId.set(copy.gatewayPaymentId, copy);
        this.paymentsByIdempotencyKey.set(copy.idempotencyKey, copy);
        this.touch();
      },
      isUtrUsedByOtherOrder: (utr, orderId) => {
        const claim = this.state.youpiUtrClaims[utr];
        return Boolean(claim && claim.orderId !== orderId);
      },
      recordUtrClaim: (utr, orderId, paymentId) => {
        this.state.youpiUtrClaims[utr] = { orderId, paymentId };
        this.touch();
      },
      hasWebhookDelivery: (deliveryId) => {
        return this.webhookDeliveryIds.has(deliveryId);
      },
      saveWebhookDelivery: (record) => {
        const copy = clone(record);
        this.webhookDeliveryIds.add(copy.deliveryId);
        const trimmed = this.state.youpiWebhookDeliveries.slice(0, MAX_WEBHOOK_DELIVERIES - 1);
        this.state.youpiWebhookDeliveries = [copy, ...trimmed];
        if (this.webhookDeliveryIds.size > MAX_WEBHOOK_DELIVERIES) {
          this.webhookDeliveryIds.clear();
          for (const d of this.state.youpiWebhookDeliveries) {
            this.webhookDeliveryIds.add(d.deliveryId);
          }
        }
        this.touch();
      },
      updateOrderPaymentState: (orderId, patch) => {
        const order = this.ordersById.get(orderId);
        if (!order) return;
        const wasPaid = order.paymentStatus === 'paid';
        order.paymentId = patch.paymentId;
        order.paymentStatus = patch.paymentStatus;
        if (patch.paymentRef) {
          order.paymentRef = patch.paymentRef;
        }
        if (patch.awardCustomerPoints && !wasPaid) {
          this.awardOrderPoints(
            order,
            `UPI Settled • Order #${order.id}`,
            patch.paymentRef || 'YouPI-PG Settlement'
          );
        } else if (patch.paymentStatus === 'refunded') {
          this.clawbackOrderPoints(order, patch.paymentRef || 'YouPI-PG Refund');
        }
        this.touch();
      },
    };
  }
}
