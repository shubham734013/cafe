import test from 'node:test';
import assert from 'node:assert/strict';
import {
  computeYoupiHmacSha256,
  computeYoupiV2HmacSha256,
  verifyYoupiWebhookRequest,
} from './webhookHandler';

const SECRET = 'unit-test-youpi-webhook-secret';

test('verifyYoupiWebhookRequest accepts valid HMAC-SHA256 v1 and v2 signatures over raw bytes', () => {
  const now = 1_750_000_000_000;
  const payload = {
    event: 'OBSERVED_SUCCESS',
    paymentId: 'gw_pay_001',
    orderId: 'SSCB421',
    amount: '240.00',
    amountPaise: 24000,
    currency: 'INR',
    settlementState: 'NOT_RECONCILED',
    utr: '429812345678',
    deliveryId: 'dlv_abc123',
    timestamp: now,
  };
  const rawBody = Buffer.from(JSON.stringify(payload), 'utf8');
  const ts = String(now);

  const result = verifyYoupiWebhookRequest({
    rawBody,
    signature: computeYoupiHmacSha256(rawBody, SECRET),
    signatureV2: computeYoupiV2HmacSha256(rawBody, ts, SECRET),
    timestamp: ts,
    deliveryId: 'dlv_abc123',
    secret: SECRET,
    nowMs: now + 5000,
  });

  assert.equal(result.valid, true);
  if (result.valid) {
    assert.equal(result.payload.event, 'OBSERVED_SUCCESS');
    assert.equal(result.payload.amountPaise, 24000);
    assert.equal(result.payload.utr, '429812345678');
  }
});

test('verifyYoupiWebhookRequest rejects tampered body, wrong v2 signature, stale timestamp, and mismatched deliveryId', () => {
  const now = 1_750_000_000_000;
  const ts = String(now);
  const rawBody = Buffer.from(
    JSON.stringify({
      event: 'RECONCILED',
      paymentId: 'gw_pay_002',
      orderId: 'SSCB422',
      amountPaise: 15000,
      deliveryId: 'dlv_111',
    }),
    'utf8'
  );
  const validSig = computeYoupiHmacSha256(rawBody, SECRET);
  const validV2 = computeYoupiV2HmacSha256(rawBody, ts, SECRET);

  // Tampered body
  const tamperedBody = Buffer.from(rawBody.toString('utf8').replace('15000', '100'), 'utf8');
  const tamperedRes = verifyYoupiWebhookRequest({
    rawBody: tamperedBody,
    signature: validSig,
    signatureV2: validV2,
    timestamp: ts,
    secret: SECRET,
    nowMs: now,
  });
  assert.equal(tamperedRes.valid, false);

  // Wrong V2 signature
  const badV2Res = verifyYoupiWebhookRequest({
    rawBody,
    signature: validSig,
    signatureV2: 'sha256=' + '0'.repeat(64),
    timestamp: ts,
    secret: SECRET,
    nowMs: now,
  });
  assert.equal(badV2Res.valid, false);

  // Stale timestamp (> 2h)
  const staleRes = verifyYoupiWebhookRequest({
    rawBody,
    signature: validSig,
    signatureV2: validV2,
    timestamp: ts,
    secret: SECRET,
    nowMs: now + 3 * 60 * 60 * 1000,
  });
  assert.equal(staleRes.valid, false);

  // Mismatched deliveryId header vs payload
  const mismatchDlv = verifyYoupiWebhookRequest({
    rawBody,
    signature: validSig,
    signatureV2: validV2,
    timestamp: ts,
    deliveryId: 'dlv_other',
    secret: SECRET,
    nowMs: now,
  });
  assert.equal(mismatchDlv.valid, false);
});
