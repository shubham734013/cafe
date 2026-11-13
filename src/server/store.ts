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
  getNextKotStatus,
  restockIngredientItem,
} from '../utils/cafeLogic';
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
} from '../shared/schemas';

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
  updatedAt: string;
}

interface PersistedEnvelope extends CafeBootstrapState {
  idempotencyOrderIds: Record<string, string>;
}

function clone<T>(val: T): T {
  return JSON.parse(JSON.stringify(val)) as T;
}

export class CafeStore {
  private state: PersistedEnvelope;
  private persistPath: string | null;

  constructor(persistPath: string | null = path.resolve(process.cwd(), '.data', 'cafe-state.json')) {
    this.persistPath = persistPath;
    this.state = this.loadOrSeed();
  }

  private createSeedState(): PersistedEnvelope {
    return {
      outletId: 'seth-sawariya-main',
      orders: clone(INITIAL_ORDERS),
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
      idempotencyOrderIds: {},
    };
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
          return {
            ...this.createSeedState(),
            ...parsed,
            idempotencyOrderIds: parsed.idempotencyOrderIds ?? {},
          };
        }
      }
    } catch {
      // Fallback cleanly to seed state if local file is corrupted
    }
    const seeded = this.createSeedState();
    this.saveToDisk(seeded);
    return seeded;
  }

  private saveToDisk(snapshot: PersistedEnvelope = this.state): void {
    if (!this.persistPath) return;
    try {
      fs.mkdirSync(path.dirname(this.persistPath), { recursive: true });
      const tmp = `${this.persistPath}.tmp`;
      fs.writeFileSync(tmp, JSON.stringify(snapshot, null, 2), 'utf8');
      fs.renameSync(tmp, this.persistPath);
    } catch {
      // Non-fatal in ephemeral read-only environments
    }
  }

  private touch(): void {
    this.state.updatedAt = new Date().toISOString();
    this.saveToDisk();
  }

  public getBootstrap(): CafeBootstrapState {
    const { idempotencyOrderIds: _ignored, ...publicState } = this.state;
    return clone(publicState);
  }

  public getOrders(): CafeOrder[] {
    return clone(this.state.orders);
  }

  public createOrder(input: z.infer<typeof createOrderSchema>): {
    order: CafeOrder;
    duplicate: boolean;
    rewardPoints: number;
  } {
    if (input.idempotencyKey && this.state.idempotencyOrderIds[input.idempotencyKey]) {
      const existingId = this.state.idempotencyOrderIds[input.idempotencyKey];
      const existing = this.state.orders.find((o) => o.id === existingId);
      if (existing) {
        return {
          order: clone(existing),
          duplicate: true,
          rewardPoints: this.state.rewardPoints,
        };
      }
    }

    const totals = calculateCartTotals(
      input.items,
      input.couponCode ?? '',
      input.serviceMode,
      Boolean(input.isPosTerminal)
    );

    const nextNum = 421 + this.state.orders.length;
    const newOrder: CafeOrder = {
      id: `SSCB${nextNum}`,
      kotNumber: `#${nextNum}`,
      serviceMode: input.serviceMode,
      tableNumber: input.serviceMode === 'dine-in' ? input.tableNumber || 'T3' : undefined,
      deliveryPartner:
        input.serviceMode === 'delivery'
          ? input.deliveryPartner || 'Direct Delivery'
          : undefined,
      items: input.items.map((item) => ({ ...item, checked: false })),
      subtotal: totals.subtotal,
      discount: totals.discount,
      tax: totals.tax,
      total: totals.total,
      paymentMode: input.paymentMode,
      paymentRef: `${input.paymentMode.toUpperCase()}-${1000 + nextNum}`,
      status: 'placed',
      createdAtLabel: 'Just now',
      elapsedMinutes: 0,
      isUrgent: true,
      serverName: 'Neha V.',
      cookingNote: input.cookingNote || undefined,
    };

    this.state.orders = [newOrder, ...this.state.orders];
    if (input.idempotencyKey) {
      this.state.idempotencyOrderIds[input.idempotencyKey] = newOrder.id;
    }

    if (!input.isPosTerminal) {
      const earned = Math.max(10, Math.floor(totals.total / 10));
      this.state.rewardPoints += earned;
    }

    if (newOrder.serviceMode === 'dine-in' && newOrder.tableNumber) {
      this.state.tables = this.state.tables.map((t) =>
        t.id === newOrder.tableNumber
          ? { ...t, status: 'occupied', activeOrderId: newOrder.id, elapsedLabel: '1m' }
          : t
      );
    }

    this.touch();
    return {
      order: clone(newOrder),
      duplicate: false,
      rewardPoints: this.state.rewardPoints,
    };
  }

  public advanceOrderStatus(orderId: string): CafeOrder | null {
    const target = this.state.orders.find((o) => o.id === orderId);
    if (!target) return null;
    const nextStatus = getNextKotStatus(target.status);
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
        this.state.tables = this.state.tables.map((t) =>
          t.id === target.tableNumber
            ? { ...t, status: 'available', activeOrderId: undefined, elapsedLabel: undefined }
            : t
        );
      }
    }

    this.touch();
    return clone(target);
  }

  public toggleKotItem(orderId: string, menuItemId: string): CafeOrder | null {
    const target = this.state.orders.find((o) => o.id === orderId);
    if (!target) return null;
    target.items = target.items.map((item) =>
      item.menuItemId === menuItemId ? { ...item, checked: !item.checked } : item
    );
    this.touch();
    return clone(target);
  }

  public checkInTable(tableId: string): CafeTable | null {
    const target = this.state.tables.find((t) => t.id === tableId);
    if (!target) return null;
    const updated: CafeTable = {
      ...target,
      status: 'occupied',
      elapsedLabel: '1m',
      reservedBy: undefined,
      reservedTime: undefined,
      reservedPartySize: undefined,
    };
    this.state.tables = this.state.tables.map((t) => (t.id === tableId ? updated : t));
    this.touch();
    return clone(updated);
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
    this.state.tables = [...this.state.tables, created];
    this.touch();
    return { table: clone(created) };
  }

  public transferTable(sourceTableId: string, targetTableId: string): boolean {
    if (sourceTableId === targetTableId) return false;
    const src = this.state.tables.find((t) => t.id === sourceTableId);
    const dst = this.state.tables.find((t) => t.id === targetTableId);
    if (!src || !dst) return false;

    this.state.orders = this.state.orders.map((o) =>
      o.serviceMode === 'dine-in' && o.tableNumber === sourceTableId && o.status !== 'served'
        ? { ...o, tableNumber: targetTableId }
        : o
    );

    const movedOrder = this.state.orders.find(
      (o) => o.serviceMode === 'dine-in' && o.tableNumber === targetTableId && o.status !== 'served'
    );

    this.state.tables = this.state.tables.map((t) => {
      if (t.id === sourceTableId) {
        return { ...t, status: 'available', activeOrderId: undefined, elapsedLabel: undefined, billReady: false };
      }
      if (t.id === targetTableId) {
        return {
          ...t,
          status: movedOrder ? 'occupied' : src.status,
          activeOrderId: movedOrder?.id ?? src.activeOrderId,
          elapsedLabel: src.elapsedLabel || '1m',
        };
      }
      return t;
    });
    this.touch();
    return true;
  }

  public mergeTables(sourceTableId: string, targetTableId: string): boolean {
    return this.transferTable(sourceTableId, targetTableId);
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
      id: `ing-${Date.now()}`,
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
      id: `cust-${Date.now()}`,
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
    this.state.customers = [created, ...this.state.customers];
    this.touch();
    return clone(created);
  }

  public exportCustomerPii(id: string): Record<string, unknown> | null {
    const customer = this.state.customers.find((c) => c.id === id);
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
      id: `rule-${Date.now()}`,
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
      id: `camp-${Date.now()}`,
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

  public toggleCampaignStatus(id: string): PromoCampaign | null {
    const target = this.state.campaigns.find((c) => c.id === id);
    if (!target) return null;
    target.status = target.status === 'active' ? 'scheduled' : 'active';
    this.touch();
    return clone(target);
  }

  public addStaff(input: z.infer<typeof addStaffSchema>): StaffMember {
    const parts = input.name.trim().split(/\s+/);
    const initials = (parts[0][0] + (parts[1]?.[0] || '')).toUpperCase();
    const created: StaffMember = {
      id: `staff-${Date.now()}`,
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
    const target = this.state.staffRoster.find((s) => s.id === id);
    if (!target) return null;
    target.isOnDuty = !target.isOnDuty;
    target.statRight = target.isOnDuty ? 'Clocked In' : 'Off Duty';
    this.touch();
    return clone(target);
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
