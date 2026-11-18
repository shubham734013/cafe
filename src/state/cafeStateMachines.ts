import type {
  CafeOrder,
  CafeTable,
  OrderStatus,
  PromoCampaign,
  ScreenId,
  StaffMember,
  WorkspaceMode,
} from '../types/cafe';

export type DomainMachineName =
  | 'order_status'
  | 'table'
  | 'campaign'
  | 'staff_duty'
  | 'navigation'
  | 'checkout';

export class InvalidDomainTransitionError extends Error {
  public readonly domain: DomainMachineName;
  public readonly fromState: string;
  public readonly toState: string;
  public readonly action: string;
  public readonly httpStatus: number;

  constructor(opts: {
    domain: DomainMachineName;
    fromState: string;
    toState: string;
    action: string;
    message?: string;
    httpStatus?: number;
  }) {
    super(
      opts.message ||
        `Invalid ${opts.domain} transition on "${opts.action}": ${opts.fromState} -> ${opts.toState}`
    );
    this.name = 'InvalidDomainTransitionError';
    this.domain = opts.domain;
    this.fromState = opts.fromState;
    this.toState = opts.toState;
    this.action = opts.action;
    this.httpStatus = opts.httpStatus ?? 409;
  }
}

// ---------------------------------------------------------------------------
// 1. Order / KOT Kitchen Lifecycle State Machine
// ---------------------------------------------------------------------------

export const ALLOWED_ORDER_STATUS_TRANSITIONS: Record<
  OrderStatus,
  ReadonlySet<OrderStatus>
> = {
  placed: new Set(['accepted', 'preparing', 'cancelled']),
  accepted: new Set(['preparing', 'cancelled']),
  preparing: new Set(['ready', 'cancelled']),
  ready: new Set(['served', 'cancelled']),
  served: new Set(['paid']),
  paid: new Set([]),
  cancelled: new Set([]),
};

export interface OrderStepMeta {
  status: OrderStatus;
  stepIndex: number;
  label: string;
  kotBadgeLabel: string;
  kdsActionLabel: string | null;
  kdsActionIcon: string;
  orderMgmtActionLabel: string | null;
  progressPercent: number;
  trackingMessage: string;
}

export const ORDER_STATUS_META: Record<OrderStatus, OrderStepMeta> = {
  placed: {
    status: 'placed',
    stepIndex: 0,
    label: 'Placed',
    kotBadgeLabel: 'New KOT',
    kdsActionLabel: 'Accept & Prepare',
    kdsActionIcon: 'skillet',
    orderMgmtActionLabel: 'Accept Order',
    progressPercent: 12,
    trackingMessage: 'Order received at counter',
  },
  accepted: {
    status: 'accepted',
    stepIndex: 1,
    label: 'Accepted',
    kotBadgeLabel: 'Accepted',
    kdsActionLabel: 'Prepare Order',
    kdsActionIcon: 'skillet',
    orderMgmtActionLabel: 'Start Preparing',
    progressPercent: 25,
    trackingMessage: 'Order confirmed by staff and sent to kitchen',
  },
  preparing: {
    status: 'preparing',
    stepIndex: 2,
    label: 'Preparing',
    kotBadgeLabel: 'Preparing',
    kdsActionLabel: 'Mark as Ready',
    kdsActionIcon: 'check_circle',
    orderMgmtActionLabel: 'Mark Ready',
    progressPercent: 50,
    trackingMessage: 'Your order is being prepared',
  },
  ready: {
    status: 'ready',
    stepIndex: 3,
    label: 'Ready',
    kotBadgeLabel: 'Ready for Pickup',
    kdsActionLabel: 'Dispatch / Served',
    kdsActionIcon: 'done_all',
    orderMgmtActionLabel: 'Mark Handover',
    progressPercent: 75,
    trackingMessage: 'Your order is ready for pickup / serving!',
  },
  served: {
    status: 'served',
    stepIndex: 4,
    label: 'Served',
    kotBadgeLabel: 'Served',
    kdsActionLabel: null,
    kdsActionIcon: 'check_circle',
    orderMgmtActionLabel: null,
    progressPercent: 90,
    trackingMessage: 'Served — Enjoy your Seth Sawariya brew!',
  },
  paid: {
    status: 'paid',
    stepIndex: 5,
    label: 'Paid',
    kotBadgeLabel: 'Completed',
    kdsActionLabel: null,
    kdsActionIcon: 'verified',
    orderMgmtActionLabel: null,
    progressPercent: 100,
    trackingMessage: 'Payment settled. Thank you for visiting Seth Sawariya!',
  },
  cancelled: {
    status: 'cancelled',
    stepIndex: -1,
    label: 'Cancelled',
    kotBadgeLabel: 'Cancelled',
    kdsActionLabel: null,
    kdsActionIcon: 'cancel',
    orderMgmtActionLabel: null,
    progressPercent: 0,
    trackingMessage: 'This order was cancelled.',
  },
};

export function canTransitionOrderStatus(from: OrderStatus, to: OrderStatus): boolean {
  return ALLOWED_ORDER_STATUS_TRANSITIONS[from]?.has(to) ?? false;
}

export function transitionOrderStatus(current: OrderStatus, target?: OrderStatus): OrderStatus {
  if (target) {
    if (!canTransitionOrderStatus(current, target)) {
      throw new InvalidDomainTransitionError({
        domain: 'order_status',
        fromState: current,
        toState: target,
        action: 'transition',
        message: `Cannot transition order status from "${current}" to "${target}".`,
      });
    }
    return target;
  }

  switch (current) {
    case 'placed':
      return 'preparing';
    case 'accepted':
      return 'preparing';
    case 'preparing':
      return 'ready';
    case 'ready':
      return 'served';
    case 'served':
      throw new InvalidDomainTransitionError({
        domain: 'order_status',
        fromState: 'served',
        toState: 'served',
        action: 'advance',
        message: 'Order has already been served and reached terminal KOT state.',
      });
    case 'paid':
    case 'cancelled':
      throw new InvalidDomainTransitionError({
        domain: 'order_status',
        fromState: current,
        toState: current,
        action: 'advance',
        message: `Order is already ${current}.`,
      });
  }
}

// ---------------------------------------------------------------------------
// 2. Table Availability & Dine-In Lifecycle State Machine
// ---------------------------------------------------------------------------

export type EffectiveTableStatus = 'available' | 'occupied' | 'reserved';

export interface EffectiveTableState {
  status: EffectiveTableStatus;
  hasActiveKitchenTicket: boolean;
  isBillReady: boolean;
  activeOrder?: CafeOrder;
}

export function resolveEffectiveTableState(
  table: CafeTable,
  orders: CafeOrder[]
): EffectiveTableState {
  const liveOrder = orders.find(
    (o) =>
      o.serviceMode === 'dine-in' &&
      o.tableNumber === table.id &&
      o.status !== 'served'
  );
  const seedOrder = table.activeOrderId
    ? orders.find((o) => o.id === table.activeOrderId)
    : undefined;

  const isOccupied =
    Boolean(liveOrder) || table.status === 'occupied' || table.status === 'preparing';

  if (isOccupied) {
    return {
      status: 'occupied',
      hasActiveKitchenTicket: table.status === 'preparing' || Boolean(liveOrder),
      isBillReady: Boolean(table.billReady),
      activeOrder: liveOrder ?? seedOrder,
    };
  }

  if (table.status === 'reserved') {
    return {
      status: 'reserved',
      hasActiveKitchenTicket: false,
      isBillReady: false,
      activeOrder: undefined,
    };
  }

  return {
    status: 'available',
    hasActiveKitchenTicket: false,
    isBillReady: false,
    activeOrder: undefined,
  };
}

export function assertCanCheckInTable(table: CafeTable, orders: CafeOrder[]): void {
  const effective = resolveEffectiveTableState(table, orders);
  if (effective.status === 'occupied') {
    throw new InvalidDomainTransitionError({
      domain: 'table',
      fromState: table.status,
      toState: 'occupied',
      action: 'check_in',
      message: `Table ${table.id} is already occupied.`,
    });
  }
}

export function assertCanMoveTableParty(
  mode: 'transfer' | 'merge',
  source: CafeTable | undefined,
  target: CafeTable | undefined,
  orders: CafeOrder[]
): { src: CafeTable; dst: CafeTable; sourceState: EffectiveTableState } {
  if (!source || !target || source.id === target.id) {
    throw new InvalidDomainTransitionError({
      domain: 'table',
      fromState: source?.status ?? 'missing',
      toState: target?.status ?? 'missing',
      action: mode,
      message: 'Select two different valid tables.',
      httpStatus: 400,
    });
  }

  const sourceState = resolveEffectiveTableState(source, orders);
  if (sourceState.status !== 'occupied') {
    throw new InvalidDomainTransitionError({
      domain: 'table',
      fromState: sourceState.status,
      toState: 'available',
      action: mode,
      message: `Table ${source.id} has no occupied party to ${mode}.`,
    });
  }

  const targetState = resolveEffectiveTableState(target, orders);
  if (mode === 'transfer' && targetState.status === 'occupied') {
    throw new InvalidDomainTransitionError({
      domain: 'table',
      fromState: 'occupied',
      toState: targetState.status,
      action: 'transfer',
      message: `Target table ${target.id} is already occupied. Use Merge Tables instead.`,
    });
  }

  return { src: source, dst: target, sourceState };
}

// ---------------------------------------------------------------------------
// 4. Promo Campaign Lifecycle State Machine
// ---------------------------------------------------------------------------

export type CampaignStatus = PromoCampaign['status'];
export type CampaignEvent = 'toggle' | 'pause' | 'activate' | 'expire';

export const ALLOWED_CAMPAIGN_TRANSITIONS: Record<
  CampaignStatus,
  ReadonlySet<CampaignStatus>
> = {
  active: new Set(['paused', 'expired']),
  paused: new Set(['active', 'expired']),
  scheduled: new Set(['active', 'paused', 'expired']),
  expired: new Set(['active']),
};

export function transitionCampaignStatus(
  current: CampaignStatus,
  event: CampaignEvent = 'toggle'
): CampaignStatus {
  const next: CampaignStatus =
    event === 'toggle'
      ? current === 'active'
        ? 'paused'
        : 'active'
      : event === 'pause'
        ? 'paused'
        : event === 'activate'
          ? 'active'
          : 'expired';

  if (!ALLOWED_CAMPAIGN_TRANSITIONS[current]?.has(next)) {
    throw new InvalidDomainTransitionError({
      domain: 'campaign',
      fromState: current,
      toState: next,
      action: event,
      message: `Cannot transition promo campaign from "${current}" to "${next}".`,
    });
  }
  return next;
}

// ---------------------------------------------------------------------------
// 5. Staff Duty & PIN Session State Machines
// ---------------------------------------------------------------------------

export type StaffDutyStatus = 'on_duty' | 'off_duty';

export function getStaffDutyStatus(member: Pick<StaffMember, 'isOnDuty' | 'dutyStatus'>): StaffDutyStatus {
  if (member.dutyStatus) return member.dutyStatus;
  return member.isOnDuty ? 'on_duty' : 'off_duty';
}

export function transitionStaffDuty(
  member: StaffMember,
  target?: StaffDutyStatus
): StaffMember {
  const current = getStaffDutyStatus(member);
  const next: StaffDutyStatus = target ?? (current === 'on_duty' ? 'off_duty' : 'on_duty');
  const isOnDuty = next === 'on_duty';
  return {
    ...member,
    dutyStatus: next,
    isOnDuty,
    statRight: isOnDuty ? 'Clocked In' : 'Off Duty',
  };
}

export type PinAuthPhase = 'checking' | 'locked' | 'submitting' | 'unlocked' | 'error';

export type PinAuthState =
  | { phase: 'checking' }
  | { phase: 'locked' }
  | { phase: 'submitting' }
  | { phase: 'unlocked'; staffName: string }
  | { phase: 'error'; message: string };

// ---------------------------------------------------------------------------
// 6. Navigation Workspace Mode Derivation
// ---------------------------------------------------------------------------

const CUSTOMER_SCREENS = new Set<ScreenId>(['home', 'menu', 'cart', 'tracking', 'rewards', 'profile']);

export function deriveWorkspaceMode(
  screen: ScreenId,
  currentMode: WorkspaceMode,
  explicitMode?: WorkspaceMode
): WorkspaceMode {
  if (screen === 'splash') {
    return explicitMode ?? currentMode;
  }
  if (CUSTOMER_SCREENS.has(screen)) {
    return 'customer';
  }
  return 'staff';
}
