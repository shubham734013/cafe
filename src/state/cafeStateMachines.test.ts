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
  canTransitionOrderStatus,
  deriveWorkspaceMode,
  getStaffDutyStatus,
  resolveEffectiveTableState,
  transitionCampaignStatus,
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

test('Staff duty and workspace navigation derivation stay deterministic', () => {
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

  // Navigation mode cannot get desynced from active screen
  assert.equal(deriveWorkspaceMode('menu', 'staff'), 'customer');
  assert.equal(deriveWorkspaceMode('kitchen-display-system', 'customer'), 'staff');
  assert.equal(deriveWorkspaceMode('splash', 'customer', 'staff'), 'staff');
});
