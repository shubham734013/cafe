import test from 'node:test';
import assert from 'node:assert/strict';
import {
  InvalidStateTransitionError,
  assertValidYoupiTransition,
  canTransitionYoupiStatus,
  isValidTwelveDigitUtr,
  mapInternalStatusToOrderPaymentStatus,
  mapYoupiStatusToInternalStatus,
} from './stateMachine';

test('YouPI-PG state machine allows valid transitions and rejects invalid ones', () => {
  assert.equal(canTransitionYoupiStatus('initiated', 'active'), true);
  assert.equal(canTransitionYoupiStatus('active', 'processing'), true);
  assert.equal(canTransitionYoupiStatus('processing', 'observed'), true);
  assert.equal(canTransitionYoupiStatus('observed', 'reconciled'), true);
  assert.equal(canTransitionYoupiStatus('manual_review', 'reconciled'), true);
  assert.equal(canTransitionYoupiStatus('manual_review', 'failed'), true);

  // Terminal states cannot regress or cross-transition
  assert.equal(canTransitionYoupiStatus('reconciled', 'failed'), false);
  assert.equal(canTransitionYoupiStatus('failed', 'reconciled'), false);
  assert.equal(canTransitionYoupiStatus('expired', 'active'), false);
  assert.equal(canTransitionYoupiStatus('cancelled', 'observed'), false);
  assert.equal(canTransitionYoupiStatus('observed', 'active'), false);

  assert.throws(
    () => assertValidYoupiTransition('reconciled', 'expired'),
    InvalidStateTransitionError
  );
});

test('OBSERVED_SUCCESS stays observed unless settlementState is RECONCILED or confirmOnObserver is true', () => {
  assert.equal(
    mapYoupiStatusToInternalStatus('OBSERVED_SUCCESS', {
      settlementState: 'NOT_RECONCILED',
      confirmOnObserver: false,
    }),
    'observed'
  );

  assert.equal(
    mapYoupiStatusToInternalStatus('OBSERVED_SUCCESS', {
      settlementState: 'RECONCILED',
      confirmOnObserver: false,
    }),
    'reconciled'
  );

  assert.equal(
    mapYoupiStatusToInternalStatus('OBSERVED_SUCCESS', {
      settlementState: 'NOT_RECONCILED',
      confirmOnObserver: true,
    }),
    'reconciled'
  );

  assert.equal(mapInternalStatusToOrderPaymentStatus('observed'), 'observed');
  assert.equal(mapInternalStatusToOrderPaymentStatus('reconciled'), 'paid');
  assert.equal(mapInternalStatusToOrderPaymentStatus('manual_review'), 'manual_review');
});

test('isValidTwelveDigitUtr strictly enforces 12 numeric digits', () => {
  assert.equal(isValidTwelveDigitUtr('429812345678'), true);
  assert.equal(isValidTwelveDigitUtr(' 429812345678 '), true);
  assert.equal(isValidTwelveDigitUtr('12345'), false);
  assert.equal(isValidTwelveDigitUtr('42981234567A'), false);
  assert.equal(isValidTwelveDigitUtr(''), false);
});

test('LocalYoupiSandboxAdapter guards terminal states against overwrite or duplicate cancel', async () => {
  const { GatewayRequestError, LocalYoupiSandboxAdapter } = await import('./youpiClient');
  const adapter = new LocalYoupiSandboxAdapter({ payeeVpa: '7340131002@pthdfc' });

  const session = await adapter.createPayment({
    orderId: 'ORD-TERM-1',
    amountInr: '150.00',
    amountPaise: 15000,
    currency: 'INR',
    payeeVpa: '7340131002@pthdfc',
    payeeName: 'Seth Sawariya Cafe',
    idempotencyKey: 'idem-sandbox-guard-1',
  });
  assert.equal(session.status, 'ACTIVE');

  const rec = adapter.simulateOutcome(session.gatewayPaymentId, 'RECONCILED', {
    utr: '429812345678',
  });
  assert.equal(rec?.event, 'RECONCILED');
  const polled = await adapter.getPayment(session.gatewayPaymentId);
  assert.equal(polled.status, 'RECONCILED');

  // Cannot cancel after RECONCILED
  const afterCancel = await adapter.cancelPayment(session.gatewayPaymentId);
  assert.equal(afterCancel.status, 'RECONCILED');

  // Can refund a RECONCILED payment cleanly, and second refund rejects with 409
  const refundRes = await adapter.refundPayment(session.gatewayPaymentId, {
    refundRef: 'RF-SANDBOX-1',
  });
  assert.equal(refundRes.status, 'REFUNDED');

  await assert.rejects(
    () => adapter.refundPayment(session.gatewayPaymentId),
    (err: unknown) => err instanceof GatewayRequestError && err.httpStatus === 409
  );

  // Cannot force-overwrite terminal RECONCILED / REFUNDED with FAILED
  assert.throws(
    () => adapter.simulateOutcome(session.gatewayPaymentId, 'FAILED'),
    (err: unknown) => err instanceof GatewayRequestError && err.httpStatus === 409
  );
});

test('Refund state machine & production live-key validator enforce strict safety', async () => {
  const { validateLiveKeyConfiguration } = await import('./youpiClient');

  assert.equal(canTransitionYoupiStatus('reconciled', 'refunded'), true);
  assert.equal(canTransitionYoupiStatus('refunded', 'reconciled'), false);
  assert.equal(canTransitionYoupiStatus('refunded', 'failed'), false);
  assert.equal(mapYoupiStatusToInternalStatus('REFUNDED'), 'refunded');
  assert.equal(mapInternalStatusToOrderPaymentStatus('refunded'), 'refunded');

  // Production fails on missing or placeholder keys / webhook secret
  assert.throws(
    () =>
      validateLiveKeyConfiguration({
        nodeEnv: 'production',
        apiUrl: 'https://pg.youpi.example.com',
        merchantId: 'merch_live_1',
        apiKey: 'live_key_999',
        webhookSecret: 'dev-youpi-webhook-secret-change-me',
      }),
    /YOUPI_WEBHOOK_SECRET/
  );

  assert.throws(
    () =>
      validateLiveKeyConfiguration({
        nodeEnv: 'production',
        apiUrl: 'https://pg.youpi.example.com',
        merchantId: 'merch_live_1',
        apiKey: 'test_sandbox_key_123',
        webhookSecret: 'prod_whsec_super_strong_987654',
      }),
    /test\/sandbox\/placeholder/
  );

  assert.doesNotThrow(() =>
    validateLiveKeyConfiguration({
      nodeEnv: 'production',
      apiUrl: 'https://pg.youpi.example.com',
      merchantId: 'merch_live_1',
      apiKey: 'youpi_live_999888777',
      webhookSecret: 'whsec_live_super_strong_987654',
    })
  );
});
