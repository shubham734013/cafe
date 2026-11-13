import type { UpiAppId } from '../payments/upiUri';
import type { PaymentOrderSyncStatus, YoupiPaymentRecord } from '../payments/types';
import { getUpiAppLabel } from '../payments/upiUri';
import type {
  CafeOrder,
  CafeTable,
  CardMethodType,
  CardNetwork,
  CardPaymentMetadata,
  OrderStatus,
  PaymentMode,
  PromoCampaign,
  ScreenId,
  StaffMember,
  WorkspaceMode,
} from '../types/cafe';

export type DomainMachineName =
  | 'order_status'
  | 'order_payment'
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
  placed: new Set(['preparing']),
  preparing: new Set(['ready']),
  ready: new Set(['served']),
  served: new Set(),
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
    kdsActionLabel: 'Prepare Order',
    kdsActionIcon: 'skillet',
    orderMgmtActionLabel: 'Mark Ready',
    progressPercent: 12,
    trackingMessage: 'Order received at counter',
  },
  preparing: {
    status: 'preparing',
    stepIndex: 1,
    label: 'Preparing',
    kotBadgeLabel: 'Preparing',
    kdsActionLabel: 'Mark as Ready',
    kdsActionIcon: 'check_circle',
    orderMgmtActionLabel: 'Mark Ready',
    progressPercent: 38,
    trackingMessage: 'Your order is being prepared',
  },
  ready: {
    status: 'ready',
    stepIndex: 2,
    label: 'Ready',
    kotBadgeLabel: 'Ready for Pickup',
    kdsActionLabel: 'Dispatch / Served',
    kdsActionIcon: 'done_all',
    orderMgmtActionLabel: 'Mark Handover',
    progressPercent: 72,
    trackingMessage: 'Your order is ready for pickup / serving!',
  },
  served: {
    status: 'served',
    stepIndex: 3,
    label: 'Served',
    kotBadgeLabel: 'Completed',
    kdsActionLabel: null,
    kdsActionIcon: 'check_circle',
    orderMgmtActionLabel: null,
    progressPercent: 100,
    trackingMessage: 'Served — Enjoy your Seth Sawariya brew!',
  },
};

export function canTransitionOrderStatus(from: OrderStatus, to: OrderStatus): boolean {
  return ALLOWED_ORDER_STATUS_TRANSITIONS[from]?.has(to) ?? false;
}

export function transitionOrderStatus(current: OrderStatus): OrderStatus {
  switch (current) {
    case 'placed':
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
  }
}

// ---------------------------------------------------------------------------
// 2. Order Payment & Card Metadata State Machine
// ---------------------------------------------------------------------------

export const ALLOWED_ORDER_PAYMENT_TRANSITIONS: Record<
  PaymentOrderSyncStatus,
  ReadonlySet<PaymentOrderSyncStatus>
> = {
  unpaid: new Set(['pending', 'observed', 'paid', 'manual_review', 'failed', 'expired', 'cancelled']),
  pending: new Set(['pending', 'observed', 'paid', 'manual_review', 'failed', 'expired', 'cancelled']),
  observed: new Set(['observed', 'paid', 'manual_review', 'failed']),
  manual_review: new Set(['manual_review', 'paid', 'failed']),
  paid: new Set(['refunded']),
  failed: new Set(['pending', 'paid']),
  expired: new Set(['pending', 'paid']),
  cancelled: new Set(['pending', 'paid']),
  refunded: new Set(),
};

export type OrderPaymentAction = 'settle' | 'fail' | 'refund';

export function normalizeOrderPaymentStatus(
  status?: PaymentOrderSyncStatus
): PaymentOrderSyncStatus {
  return status ?? 'paid';
}

export function canTransitionOrderPaymentStatus(
  from: PaymentOrderSyncStatus,
  to: PaymentOrderSyncStatus
): boolean {
  return ALLOWED_ORDER_PAYMENT_TRANSITIONS[from]?.has(to) ?? false;
}

export function mapOrderPaymentToCardStatus(
  paymentStatus: PaymentOrderSyncStatus
): CardPaymentMetadata['status'] {
  switch (paymentStatus) {
    case 'paid':
      return 'settled';
    case 'refunded':
      return 'refunded';
    case 'failed':
    case 'expired':
    case 'cancelled':
      return 'failed';
    case 'unpaid':
    case 'pending':
    case 'observed':
    case 'manual_review':
      return 'pending';
  }
}

export function deriveInitialOrderPayment(input: {
  orderNumberSeq: number;
  paymentMode: PaymentMode;
  isPosTerminal: boolean;
  preferredUpiApp?: UpiAppId;
  cardDetails?: {
    method?: CardMethodType;
    network?: CardNetwork;
    last4?: string;
    holderName?: string;
    authCode?: string;
  };
}): {
  paymentStatus: PaymentOrderSyncStatus;
  paymentRef: string;
  paymentChannelLabel: string;
  preferredUpiApp?: UpiAppId;
  cardDetails?: CardPaymentMetadata;
} {
  if (input.paymentMode === 'upi') {
    const preferredUpiApp = input.preferredUpiApp ?? 'any';
    const paymentChannelLabel = getUpiAppLabel(preferredUpiApp);
    return {
      paymentStatus: 'pending',
      paymentChannelLabel,
      paymentRef: `Awaiting ${paymentChannelLabel} via YouPI-PG`,
      preferredUpiApp,
    };
  }

  if (input.paymentMode === 'card') {
    const method: CardMethodType = input.cardDetails?.method ?? 'edc_table';
    const network = input.cardDetails?.network;
    const last4 = input.cardDetails?.last4?.trim() || undefined;
    const holderName = input.cardDetails?.holderName?.trim() || undefined;
    const rawAuthCode = input.cardDetails?.authCode?.trim() || undefined;
    const maskedLabel = [network || 'Card', last4 ? `•• ${last4}` : null]
      .filter(Boolean)
      .join(' ');

    const isOnlineCardInstant = !input.isPosTerminal && method === 'online_card';
    const isPosCardSettled = Boolean(input.isPosTerminal && rawAuthCode);
    const paymentStatus: PaymentOrderSyncStatus =
      isOnlineCardInstant || isPosCardSettled ? 'paid' : 'pending';
    const authCode = isOnlineCardInstant
      ? `TOK${1000 + input.orderNumberSeq}`
      : rawAuthCode;

    const paymentChannelLabel = isOnlineCardInstant
      ? `${maskedLabel} (Online)`
      : `${maskedLabel} (EDC)`;
    const paymentRef =
      paymentStatus === 'paid'
        ? `${maskedLabel.toUpperCase()} · AUTH ${authCode}`
        : `${maskedLabel} · Awaiting EDC Tap/Swipe`;

    return {
      paymentStatus,
      paymentChannelLabel,
      paymentRef,
      cardDetails: {
        method,
        network,
        last4,
        holderName,
        authCode,
        status: mapOrderPaymentToCardStatus(paymentStatus),
      },
    };
  }

  // Cash: immediate at POS drawer, pending counter collection for customer self-orders
  const paymentStatus: PaymentOrderSyncStatus = input.isPosTerminal ? 'paid' : 'pending';
  return {
    paymentStatus,
    paymentChannelLabel: input.isPosTerminal ? 'Cash Drawer' : 'Cash at Counter',
    paymentRef: input.isPosTerminal
      ? `CASH-${1000 + input.orderNumberSeq}`
      : 'Pay Cash at Counter',
  };
}

export function transitionOrderPayment(
  order: CafeOrder,
  input: {
    action: OrderPaymentAction;
    network?: CardNetwork;
    last4?: string;
    authCode?: string;
    note?: string;
  }
): {
  nextPaymentStatus: PaymentOrderSyncStatus;
  nextPaymentChannelLabel?: string;
  nextPaymentRef: string;
  nextCardDetails?: CardPaymentMetadata;
  shouldAwardPoints: boolean;
} {
  const currentStatus = normalizeOrderPaymentStatus(order.paymentStatus);
  const targetStatus: PaymentOrderSyncStatus =
    input.action === 'settle' ? 'paid' : input.action === 'fail' ? 'failed' : 'refunded';

  if (!canTransitionOrderPaymentStatus(currentStatus, targetStatus)) {
    const actionLabel =
      input.action === 'refund'
        ? 'refund'
        : input.action === 'fail'
          ? 'mark failed'
          : 'settle';
    throw new InvalidDomainTransitionError({
      domain: 'order_payment',
      fromState: currentStatus,
      toState: targetStatus,
      action: input.action,
      message: `Cannot ${actionLabel} order #${order.id} while payment is "${currentStatus}".`,
    });
  }

  const nextNetwork = input.network ?? order.cardDetails?.network;
  const nextLast4 = input.last4?.trim() || order.cardDetails?.last4;
  const nextAuthCode = input.authCode?.trim() || order.cardDetails?.authCode;

  if (targetStatus === 'paid') {
    if (order.paymentMode === 'card') {
      const label = [nextNetwork || 'Card', nextLast4 ? `•• ${nextLast4}` : null]
        .filter(Boolean)
        .join(' ');
      const authDisplay = nextAuthCode || `EDC${Date.now().toString().slice(-6)}`;
      return {
        nextPaymentStatus: 'paid',
        nextPaymentChannelLabel: `${label} (Settled)`,
        nextPaymentRef: `${label.toUpperCase()} · AUTH ${authDisplay}`,
        nextCardDetails: {
          method: order.cardDetails?.method ?? 'edc_table',
          network: nextNetwork,
          last4: nextLast4,
          holderName: order.cardDetails?.holderName,
          authCode: authDisplay,
          status: 'settled',
        },
        shouldAwardPoints: true,
      };
    }

    if (order.paymentMode === 'cash') {
      return {
        nextPaymentStatus: 'paid',
        nextPaymentChannelLabel: 'Cash Collected',
        nextPaymentRef: input.note?.trim() || `CASH-REC-${order.kotNumber.replace('#', '')}`,
        nextCardDetails: order.cardDetails,
        shouldAwardPoints: true,
      };
    }

    return {
      nextPaymentStatus: 'paid',
      nextPaymentChannelLabel: order.paymentChannelLabel,
      nextPaymentRef: input.note?.trim() || order.paymentRef || 'Settled by Staff',
      nextCardDetails: order.cardDetails,
      shouldAwardPoints: true,
    };
  }

  if (targetStatus === 'failed') {
    return {
      nextPaymentStatus: 'failed',
      nextPaymentChannelLabel: order.paymentChannelLabel,
      nextPaymentRef: input.note?.trim() || 'Payment Declined / Cancelled',
      nextCardDetails: order.cardDetails
        ? { ...order.cardDetails, status: 'failed' }
        : undefined,
      shouldAwardPoints: false,
    };
  }

  return {
    nextPaymentStatus: 'refunded',
    nextPaymentChannelLabel: order.paymentChannelLabel,
    nextPaymentRef: input.note?.trim() || `Refunded ₹${order.total}`,
    nextCardDetails: order.cardDetails
      ? { ...order.cardDetails, status: 'refunded' }
      : undefined,
    shouldAwardPoints: false,
  };
}

// ---------------------------------------------------------------------------
// 3. Table Availability & Dine-In Lifecycle State Machine
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
// 6. YouPI Checkout Modal Phase Machine
// ---------------------------------------------------------------------------

export type YoupiCheckoutPhase =
  | 'awaiting_payment'
  | 'verifying_observer'
  | 'observed_pending_bank'
  | 'succeeded'
  | 'refunded'
  | 'manual_review'
  | 'retryable_terminal';

export function deriveYoupiCheckoutPhase(
  payment: Pick<YoupiPaymentRecord, 'status'> | { status: string }
): YoupiCheckoutPhase {
  switch (payment.status) {
    case 'initiated':
    case 'active':
    case 'queued':
      return 'awaiting_payment';
    case 'processing':
      return 'verifying_observer';
    case 'observed':
      return 'observed_pending_bank';
    case 'reconciled':
    case 'succeeded':
      return 'succeeded';
    case 'refunded':
      return 'refunded';
    case 'manual_review':
      return 'manual_review';
    case 'failed':
    case 'expired':
    case 'cancelled':
      return 'retryable_terminal';
    default:
      return 'awaiting_payment';
  }
}

// ---------------------------------------------------------------------------
// 7. Navigation Workspace Mode Derivation
// ---------------------------------------------------------------------------

const CUSTOMER_SCREENS = new Set<ScreenId>(['home', 'menu', 'cart', 'tracking', 'rewards']);

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
