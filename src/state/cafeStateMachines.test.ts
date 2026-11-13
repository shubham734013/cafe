import test from 'node:test';
import assert from 'node:assert/strict';
import {
  INITIAL_CAMPAIGNS,
  INITIAL_ORDERS,
  INITIAL_STAFF_ROSTER,
  INITIAL_TABLES,
} from '../data/cafeSeedData';
import {
  InvalidDomainTransitionError,
  assertCanCheckInTable,
  assertCanMoveTableParty,
  canTransitionOrderPaymentStatus,
  canTransitionOrderStatus,
  deriveInitialOrderPayment,
  deriveWorkspaceMode,
  deriveYoupiCheckoutPhase,
  getStaffDutyStatus,
  resolveEffectiveTableState,
  transitionCampaignStatus,
  transitionOrderPayment,
  transitionOrderStatus,
  transitionStaffDuty,
} from './cafeStateMachines';

test('Order KOT status state machine enforces placed -> preparing -> ready -> served and rejects served advance', () => {
  assert.equal(canTransitionOrderStatus('placed', 'preparing'), true);
  assert.equal(canTransitionOrderStatus('preparing', 'ready'), true);
  assert.equal(canTransitionOrderStatus('ready', 'served'), true);
  assert.equal(canTransitionOrderStatus('placed', 'served'), false);
  assert.equal(canTransitionOrderStatus('served', 'placed'), false);

  assert.equal(transitionOrderStatus('placed'), 'preparing');
  assert.equal(transitionOrderStatus('preparing'), 'ready');
  assert.equal(transitionOrderStatus('ready'), 'served');

  assert.throws(() => transitionOrderStatus('served'), (err) => {
    assert.ok(err instanceof InvalidDomainTransitionError);
    assert.equal(err.domain, 'order_status');
    assert.equal(err.httpStatus, 409);
    return true;
  });
});

test('Order payment & card metadata state machine enforces valid transitions and syncs cardDetails.status', () => {
  assert.equal(canTransitionOrderPaymentStatus('pending', 'paid'), true);
  assert.equal(canTransitionOrderPaymentStatus('paid', 'refunded'), true);
  assert.equal(canTransitionOrderPaymentStatus('failed', 'paid'), true);
  assert.equal(canTransitionOrderPaymentStatus('paid', 'paid'), false);
  assert.equal(canTransitionOrderPaymentStatus('pending', 'refunded'), false);
  assert.equal(canTransitionOrderPaymentStatus('refunded', 'paid'), false);

  // Initial online card order starts settled
  const onlineCard = deriveInitialOrderPayment({
    orderNumberSeq: 1,
    paymentMode: 'card',
    isPosTerminal: false,
    cardDetails: { method: 'online_card', network: 'Visa', last4: '4242' },
  });
  assert.equal(onlineCard.paymentStatus, 'paid');
  assert.equal(onlineCard.cardDetails?.status, 'settled');

  // Initial table EDC card order starts pending
  const edcCard = deriveInitialOrderPayment({
    orderNumberSeq: 2,
    paymentMode: 'card',
    isPosTerminal: false,
    cardDetails: { method: 'edc_table', network: 'Mastercard', last4: '8812' },
  });
  assert.equal(edcCard.paymentStatus, 'pending');
  assert.equal(edcCard.cardDetails?.status, 'pending');

  const baseOrder = { ...INITIAL_ORDERS[0], paymentMode: 'card' as const, paymentStatus: 'pending' as const, cardDetails: edcCard.cardDetails };
  const settled = transitionOrderPayment(baseOrder, {
    action: 'settle',
    network: 'Mastercard',
    last4: '8812',
    authCode: 'EDC555',
  });
  assert.equal(settled.nextPaymentStatus, 'paid');
  assert.equal(settled.nextCardDetails?.status, 'settled');
  assert.equal(settled.shouldAwardPoints, true);

  // Refund from pending -> 409
  assert.throws(
    () => transitionOrderPayment(baseOrder, { action: 'refund' }),
    (err) => err instanceof InvalidDomainTransitionError && err.httpStatus === 409
  );

  // Settle from already-paid -> 409
  const paidOrder = { ...baseOrder, paymentStatus: 'paid' as const, cardDetails: settled.nextCardDetails };
  assert.throws(
    () => transitionOrderPayment(paidOrder, { action: 'settle' }),
    (err) => err instanceof InvalidDomainTransitionError && err.httpStatus === 409
  );

  // Refund from paid -> refunded
  const refunded = transitionOrderPayment(paidOrder, { action: 'refund', note: 'Customer cancelled' });
  assert.equal(refunded.nextPaymentStatus, 'refunded');
  assert.equal(refunded.nextCardDetails?.status, 'refunded');

  // Any transition from refunded -> 409
  const refundedOrder = { ...paidOrder, paymentStatus: 'refunded' as const };
  assert.throws(
    () => transitionOrderPayment(refundedOrder, { action: 'settle' }),
    (err) => err instanceof InvalidDomainTransitionError && err.httpStatus === 409
  );
});

test('Table availability state machine resolves preparing & live orders deterministically and guards check-in / transfer / merge', () => {
  const t2 = INITIAL_TABLES.find((t) => t.id === 'T2')!;
  const t3 = INITIAL_TABLES.find((t) => t.id === 'T3')!;
  const t4 = INITIAL_TABLES.find((t) => t.id === 'T4')!;
  const t1 = INITIAL_TABLES.find((t) => t.id === 'T1')!;

  // T3 is seed status 'preparing' -> resolves as 'occupied' with active kitchen ticket
  const effT3 = resolveEffectiveTableState(t3, INITIAL_ORDERS);
  assert.equal(effT3.status, 'occupied');
  assert.equal(effT3.hasActiveKitchenTicket, true);

  // T4 is 'reserved' -> can check in cleanly
  assert.doesNotThrow(() => assertCanCheckInTable(t4, INITIAL_ORDERS));

  // T2 is 'occupied' -> check-in rejects with 409
  assert.throws(
    () => assertCanCheckInTable(t2, INITIAL_ORDERS),
    (err) => err instanceof InvalidDomainTransitionError && err.domain === 'table' && err.httpStatus === 409
  );

  // Cannot transfer from unoccupied table T1
  assert.throws(
    () => assertCanMoveTableParty('transfer', t1, t4, INITIAL_ORDERS),
    (err) => err instanceof InvalidDomainTransitionError && err.httpStatus === 409
  );

  // Cannot transfer onto already-occupied table T3, but CAN merge onto T3
  assert.throws(
    () => assertCanMoveTableParty('transfer', t2, t3, INITIAL_ORDERS),
    (err) => err instanceof InvalidDomainTransitionError && err.httpStatus === 409
  );
  assert.doesNotThrow(() => assertCanMoveTableParty('merge', t2, t3, INITIAL_ORDERS));
});

test('Campaign lifecycle state machine handles active <-> paused, scheduled -> active, expired -> active', () => {
  const activeCamp = INITIAL_CAMPAIGNS.find((c) => c.status === 'active')!;
  assert.equal(transitionCampaignStatus(activeCamp.status, 'toggle'), 'paused');
  assert.equal(transitionCampaignStatus('paused', 'toggle'), 'active');
  assert.equal(transitionCampaignStatus('scheduled', 'activate'), 'active');
  assert.equal(transitionCampaignStatus('expired', 'activate'), 'active');

  assert.throws(
    () => transitionCampaignStatus('paused', 'pause'),
    (err) => err instanceof InvalidDomainTransitionError && err.domain === 'campaign'
  );
});

test('Staff duty, YouPI checkout phase, and workspace navigation derivation stay deterministic', () => {
  const staff = INITIAL_STAFF_ROSTER[0];
  assert.equal(getStaffDutyStatus(staff), 'on_duty');
  const offDuty = transitionStaffDuty(staff);
  assert.equal(offDuty.dutyStatus, 'off_duty');
  assert.equal(offDuty.isOnDuty, false);
  assert.equal(offDuty.statRight, 'Off Duty');

  const backOn = transitionStaffDuty(offDuty);
  assert.equal(backOn.dutyStatus, 'on_duty');
  assert.equal(backOn.isOnDuty, true);
  assert.equal(backOn.statRight, 'Clocked In');

  assert.equal(deriveYoupiCheckoutPhase({ status: 'initiated' }), 'awaiting_payment');
  assert.equal(deriveYoupiCheckoutPhase({ status: 'active' }), 'awaiting_payment');
  assert.equal(deriveYoupiCheckoutPhase({ status: 'queued' }), 'awaiting_payment');
  assert.equal(deriveYoupiCheckoutPhase({ status: 'processing' }), 'verifying_observer');
  assert.equal(deriveYoupiCheckoutPhase({ status: 'observed' }), 'observed_pending_bank');
  assert.equal(deriveYoupiCheckoutPhase({ status: 'reconciled' }), 'succeeded');
  assert.equal(deriveYoupiCheckoutPhase({ status: 'succeeded' }), 'succeeded');
  assert.equal(deriveYoupiCheckoutPhase({ status: 'refunded' }), 'refunded');
  assert.equal(deriveYoupiCheckoutPhase({ status: 'manual_review' }), 'manual_review');
  assert.equal(deriveYoupiCheckoutPhase({ status: 'failed' }), 'retryable_terminal');
  assert.equal(deriveYoupiCheckoutPhase({ status: 'expired' }), 'retryable_terminal');
  assert.equal(deriveYoupiCheckoutPhase({ status: 'cancelled' }), 'retryable_terminal');

  // Navigation mode cannot get desynced from active screen
  assert.equal(deriveWorkspaceMode('menu', 'staff'), 'customer');
  assert.equal(deriveWorkspaceMode('kitchen-display-system', 'customer'), 'staff');
  assert.equal(deriveWorkspaceMode('splash', 'customer', 'staff'), 'staff');
});
