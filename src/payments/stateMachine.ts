import type {
  PaymentOrderSyncStatus,
  YoupiGatewayRawStatus,
  YoupiInternalStatus,
  YoupiSettlementState,
} from './types';

export const ALLOWED_YOUPI_TRANSITIONS: Record<
  YoupiInternalStatus,
  ReadonlySet<YoupiInternalStatus>
> = {
  initiated: new Set([
    'initiated',
    'active',
    'queued',
    'processing',
    'observed',
    'reconciled',
    'manual_review',
    'failed',
    'expired',
    'cancelled',
  ]),
  active: new Set([
    'active',
    'queued',
    'processing',
    'observed',
    'reconciled',
    'manual_review',
    'failed',
    'expired',
    'cancelled',
  ]),
  queued: new Set([
    'queued',
    'active',
    'processing',
    'observed',
    'reconciled',
    'manual_review',
    'failed',
    'expired',
    'cancelled',
  ]),
  processing: new Set([
    'processing',
    'observed',
    'reconciled',
    'manual_review',
    'failed',
    'expired',
    'cancelled',
  ]),
  observed: new Set(['observed', 'reconciled', 'manual_review']),
  manual_review: new Set(['manual_review', 'reconciled', 'failed']),
  reconciled: new Set(['reconciled', 'refunded']),
  refunded: new Set(['refunded']),
  failed: new Set(['failed']),
  expired: new Set(['expired']),
  cancelled: new Set(['cancelled']),
};

export class InvalidStateTransitionError extends Error {
  public readonly fromStatus: YoupiInternalStatus;
  public readonly toStatus: YoupiInternalStatus;

  constructor(fromStatus: YoupiInternalStatus, toStatus: YoupiInternalStatus) {
    super(`Invalid YouPI-PG state transition: ${fromStatus} -> ${toStatus}`);
    this.name = 'InvalidStateTransitionError';
    this.fromStatus = fromStatus;
    this.toStatus = toStatus;
  }
}

export function canTransitionYoupiStatus(
  fromStatus: YoupiInternalStatus,
  toStatus: YoupiInternalStatus
): boolean {
  return ALLOWED_YOUPI_TRANSITIONS[fromStatus]?.has(toStatus) ?? false;
}

export function assertValidYoupiTransition(
  fromStatus: YoupiInternalStatus,
  toStatus: YoupiInternalStatus
): void {
  if (!canTransitionYoupiStatus(fromStatus, toStatus)) {
    throw new InvalidStateTransitionError(fromStatus, toStatus);
  }
}

export function isTerminalInternalStatus(status: YoupiInternalStatus): boolean {
  return (
    status === 'reconciled' ||
    status === 'refunded' ||
    status === 'failed' ||
    status === 'expired' ||
    status === 'cancelled'
  );
}

export function mapYoupiStatusToInternalStatus(
  gatewayStatus: YoupiGatewayRawStatus | string,
  options?: {
    settlementState?: YoupiSettlementState;
    confirmOnObserver?: boolean;
  }
): YoupiInternalStatus {
  const normalized = String(gatewayStatus || '').trim().toUpperCase();
  const settlementState = options?.settlementState;
  const confirmOnObserver = Boolean(options?.confirmOnObserver);

  switch (normalized) {
    case 'INITIATED':
      return 'initiated';
    case 'ACTIVE':
      return 'active';
    case 'QUEUED':
      return 'queued';
    case 'PROCESSING':
      return 'processing';
    case 'RECONCILED':
      return 'reconciled';
    case 'REFUNDED':
      return 'refunded';
    case 'OBSERVED_SUCCESS':
      if (settlementState === 'RECONCILED' || confirmOnObserver) {
        return 'reconciled';
      }
      return 'observed';
    case 'SUCCESS':
      if (settlementState === 'RECONCILED' || confirmOnObserver) {
        return 'reconciled';
      }
      // Per YouPI-PG MERCHANT_INTEGRATION.md, UPI SUCCESS without statement reconciliation
      // is observer evidence and should not auto-fulfill unless explicitly configured.
      return 'observed';
    case 'MANUAL_REVIEW':
      return 'manual_review';
    case 'FAILED':
      return 'failed';
    case 'EXPIRED':
      return 'expired';
    case 'CANCELLED':
      return 'cancelled';
    default:
      return 'active';
  }
}

export function mapInternalStatusToOrderPaymentStatus(
  status: YoupiInternalStatus
): PaymentOrderSyncStatus {
  switch (status) {
    case 'initiated':
    case 'active':
    case 'queued':
    case 'processing':
      return 'pending';
    case 'observed':
      return 'observed';
    case 'reconciled':
      return 'paid';
    case 'refunded':
      return 'refunded';
    case 'manual_review':
      return 'manual_review';
    case 'failed':
      return 'failed';
    case 'expired':
      return 'expired';
    case 'cancelled':
      return 'cancelled';
  }
}

export function isValidTwelveDigitUtr(utr?: string): boolean {
  if (!utr) return false;
  return /^\d{12}$/.test(utr.trim());
}
