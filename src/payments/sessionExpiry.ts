import type { YoupiCheckoutPhase } from '../state/cafeStateMachines';

export type PaymentSessionUrgency = 'normal' | 'warning' | 'critical' | 'expired';

export const DEFAULT_PAYMENT_WINDOW_MS = 5 * 60 * 1000;
export const DEFAULT_PROCESSING_WINDOW_MS = 30 * 1000;

export const PAYMENT_WARNING_THRESHOLD_SEC = 60;
export const PAYMENT_CRITICAL_THRESHOLD_SEC = 20;
export const PROCESSING_WARNING_THRESHOLD_SEC = 15;
export const PROCESSING_CRITICAL_THRESHOLD_SEC = 5;

export interface PaymentExpiryState {
  isActiveWindow: boolean;
  targetTimestampIso?: string;
  remainingMs: number;
  remainingSeconds: number;
  totalWindowMs: number;
  progressPercent: number;
  formattedCountdown: string;
  urgency: PaymentSessionUrgency;
  shouldShowWarning: boolean;
  warningTitle: string;
  warningMessage: string;
}

export function formatSessionCountdown(remainingMs: number): string {
  const safeMs = Math.max(0, remainingMs);
  const totalSeconds = Math.ceil(safeMs / 1000);
  const mins = Math.floor(totalSeconds / 60);
  const secs = totalSeconds % 60;
  return `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
}

export interface DerivePaymentExpiryInput {
  phase: YoupiCheckoutPhase;
  expiresAt?: string;
  processingExpiresAt?: string;
  createdAt?: string;
  nowMs: number;
  orderId?: string;
  appLabel?: string;
  warningThresholdSec?: number;
  criticalThresholdSec?: number;
}

export function derivePaymentExpiryState(
  input: DerivePaymentExpiryInput
): PaymentExpiryState {
  const isActiveWindow =
    input.phase === 'awaiting_payment' || input.phase === 'verifying_observer';

  const targetTimestampIso =
    input.phase === 'verifying_observer'
      ? input.processingExpiresAt ?? input.expiresAt
      : input.expiresAt;

  if (!isActiveWindow || !targetTimestampIso) {
    return {
      isActiveWindow: false,
      targetTimestampIso,
      remainingMs: 0,
      remainingSeconds: 0,
      totalWindowMs: 0,
      progressPercent: 0,
      formattedCountdown: '00:00',
      urgency: input.phase === 'retryable_terminal' ? 'expired' : 'normal',
      shouldShowWarning: false,
      warningTitle: '',
      warningMessage: '',
    };
  }

  const targetMs = Date.parse(targetTimestampIso);
  if (!Number.isFinite(targetMs)) {
    return {
      isActiveWindow: false,
      targetTimestampIso,
      remainingMs: 0,
      remainingSeconds: 0,
      totalWindowMs: 0,
      progressPercent: 0,
      formattedCountdown: '00:00',
      urgency: 'normal',
      shouldShowWarning: false,
      warningTitle: '',
      warningMessage: '',
    };
  }

  const remainingMs = Math.max(0, targetMs - input.nowMs);
  const remainingSeconds = Math.ceil(remainingMs / 1000);
  const formattedCountdown = formatSessionCountdown(remainingMs);

  const defaultWindowMs =
    input.phase === 'verifying_observer'
      ? DEFAULT_PROCESSING_WINDOW_MS
      : DEFAULT_PAYMENT_WINDOW_MS;

  const createdMs = input.createdAt ? Date.parse(input.createdAt) : Number.NaN;
  const inferredWindowMs =
    input.phase === 'awaiting_payment' &&
    Number.isFinite(createdMs) &&
    targetMs - createdMs > 0
      ? targetMs - createdMs
      : defaultWindowMs;

  const totalWindowMs = Math.max(defaultWindowMs, inferredWindowMs);
  const progressPercent = Math.min(
    100,
    Math.max(0, Math.round((remainingMs / totalWindowMs) * 100))
  );

  const warningThreshold =
    input.warningThresholdSec ??
    (input.phase === 'verifying_observer'
      ? PROCESSING_WARNING_THRESHOLD_SEC
      : PAYMENT_WARNING_THRESHOLD_SEC);

  const criticalThreshold =
    input.criticalThresholdSec ??
    (input.phase === 'verifying_observer'
      ? PROCESSING_CRITICAL_THRESHOLD_SEC
      : PAYMENT_CRITICAL_THRESHOLD_SEC);

  let urgency: PaymentSessionUrgency = 'normal';
  if (remainingMs <= 0) {
    urgency = 'expired';
  } else if (remainingSeconds <= criticalThreshold) {
    urgency = 'critical';
  } else if (remainingSeconds <= warningThreshold) {
    urgency = 'warning';
  }

  const orderTag = input.orderId ? `Order #${input.orderId}` : 'this order';
  const appTag = input.appLabel ? ` via ${input.appLabel}` : '';

  let warningTitle = '';
  let warningMessage = '';

  if (urgency === 'expired') {
    warningTitle = 'Payment session timed out';
    warningMessage =
      input.phase === 'verifying_observer'
        ? `Verification window elapsed for ${orderTag}. Refreshing status or retry below.`
        : `The UPI timer for ${orderTag} reached 00:00. Start a fresh UPI attempt to pay.`;
  } else if (urgency === 'critical') {
    warningTitle = `Hurry — only ${remainingSeconds}s left`;
    warningMessage =
      input.phase === 'verifying_observer'
        ? `Observer verification window ending in ${formattedCountdown}. Keep this screen open.`
        : `Complete your payment${appTag} within ${formattedCountdown} before ${orderTag} releases its slot.`;
  } else if (urgency === 'warning') {
    warningTitle = `Session expiring in ${formattedCountdown}`;
    warningMessage =
      input.phase === 'verifying_observer'
        ? `Awaiting bank alert confirmation (${formattedCountdown} remaining).`
        : `Complete your UPI payment${appTag} soon to keep ${orderTag} active.`;
  }

  return {
    isActiveWindow: true,
    targetTimestampIso,
    remainingMs,
    remainingSeconds,
    totalWindowMs,
    progressPercent,
    formattedCountdown,
    urgency,
    shouldShowWarning: urgency !== 'normal',
    warningTitle,
    warningMessage,
  };
}
