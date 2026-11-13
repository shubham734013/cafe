import assert from 'node:assert/strict';
import test from 'node:test';
import {
  DEFAULT_PAYMENT_WINDOW_MS,
  DEFAULT_PROCESSING_WINDOW_MS,
  derivePaymentExpiryState,
  formatSessionCountdown,
} from './sessionExpiry';

test('formatSessionCountdown formats millisecond durations cleanly as MM:SS', () => {
  assert.equal(formatSessionCountdown(0), '00:00');
  assert.equal(formatSessionCountdown(-500), '00:00');
  assert.equal(formatSessionCountdown(950), '00:01');
  assert.equal(formatSessionCountdown(59_200), '01:00');
  assert.equal(formatSessionCountdown(58_100), '00:59');
  assert.equal(formatSessionCountdown(DEFAULT_PAYMENT_WINDOW_MS), '05:00');
});

test('derivePaymentExpiryState transitions through normal, warning, critical, and expired for awaiting_payment', () => {
  const createdMs = Date.parse('2026-11-13T08:00:00.000Z');
  const expiresAt = new Date(createdMs + DEFAULT_PAYMENT_WINDOW_MS).toISOString();
  const createdAt = new Date(createdMs).toISOString();

  // 4m left -> normal
  const normal = derivePaymentExpiryState({
    phase: 'awaiting_payment',
    expiresAt,
    createdAt,
    nowMs: createdMs + 60_000,
    orderId: 'SSCB426',
    appLabel: 'Google Pay',
  });
  assert.equal(normal.isActiveWindow, true);
  assert.equal(normal.urgency, 'normal');
  assert.equal(normal.shouldShowWarning, false);
  assert.equal(normal.formattedCountdown, '04:00');
  assert.equal(normal.progressPercent, 80);

  // 55s left -> warning
  const warning = derivePaymentExpiryState({
    phase: 'awaiting_payment',
    expiresAt,
    createdAt,
    nowMs: createdMs + DEFAULT_PAYMENT_WINDOW_MS - 55_000,
    orderId: 'SSCB426',
    appLabel: 'Google Pay',
  });
  assert.equal(warning.urgency, 'warning');
  assert.equal(warning.shouldShowWarning, true);
  assert.equal(warning.formattedCountdown, '00:55');
  assert.equal(warning.warningTitle, 'Session expiring in 00:55');
  assert.equal(warning.warningMessage.includes('Google Pay'), true);
  assert.equal(warning.warningMessage.includes('Order #SSCB426'), true);

  // 15s left -> critical
  const critical = derivePaymentExpiryState({
    phase: 'awaiting_payment',
    expiresAt,
    createdAt,
    nowMs: createdMs + DEFAULT_PAYMENT_WINDOW_MS - 15_000,
    orderId: 'SSCB426',
    appLabel: 'Paytm UPI',
  });
  assert.equal(critical.urgency, 'critical');
  assert.equal(critical.shouldShowWarning, true);
  assert.equal(critical.formattedCountdown, '00:15');
  assert.equal(critical.warningTitle, 'Hurry — only 15s left');

  // 0s left -> expired
  const expired = derivePaymentExpiryState({
    phase: 'awaiting_payment',
    expiresAt,
    createdAt,
    nowMs: createdMs + DEFAULT_PAYMENT_WINDOW_MS + 1000,
    orderId: 'SSCB426',
  });
  assert.equal(expired.urgency, 'expired');
  assert.equal(expired.shouldShowWarning, true);
  assert.equal(expired.formattedCountdown, '00:00');
  assert.equal(expired.progressPercent, 0);
});

test('derivePaymentExpiryState uses 30s verification thresholds for verifying_observer and deactivates on succeeded', () => {
  const nowMs = Date.parse('2026-11-13T08:02:00.000Z');
  const processingExpiresAt = new Date(nowMs + DEFAULT_PROCESSING_WINDOW_MS).toISOString();

  const verifyingWarn = derivePaymentExpiryState({
    phase: 'verifying_observer',
    processingExpiresAt,
    nowMs: nowMs + 18_000, // 12s remaining (<= 15s warning threshold)
    orderId: 'SSCB430',
  });
  assert.equal(verifyingWarn.isActiveWindow, true);
  assert.equal(verifyingWarn.urgency, 'warning');
  assert.equal(verifyingWarn.formattedCountdown, '00:12');

  const verifyingCrit = derivePaymentExpiryState({
    phase: 'verifying_observer',
    processingExpiresAt,
    nowMs: nowMs + 26_000, // 4s remaining (<= 5s critical threshold)
    orderId: 'SSCB430',
  });
  assert.equal(verifyingCrit.urgency, 'critical');
  assert.equal(verifyingCrit.formattedCountdown, '00:04');

  const succeeded = derivePaymentExpiryState({
    phase: 'succeeded',
    processingExpiresAt,
    nowMs,
  });
  assert.equal(succeeded.isActiveWindow, false);
  assert.equal(succeeded.shouldShowWarning, false);
  assert.equal(succeeded.urgency, 'normal');
});
