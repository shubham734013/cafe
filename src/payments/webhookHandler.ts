import crypto from 'node:crypto';
import type { YoupiGatewayRawStatus, YoupiWebhookPayload } from './types';

export const DEFAULT_WEBHOOK_TOLERANCE_MS = 2 * 60 * 60 * 1000; // 2 hours (covers YouPI 1h retry schedule)

export function computeYoupiHmacSha256(payload: Buffer | string, secret: string): string {
  const hex = crypto.createHmac('sha256', secret).update(payload).digest('hex');
  return `sha256=${hex}`;
}

export function computeYoupiV2HmacSha256(
  rawBody: Buffer | string,
  timestamp: string,
  secret: string
): string {
  const bodyStr = Buffer.isBuffer(rawBody) ? rawBody.toString('utf8') : rawBody;
  const hex = crypto.createHmac('sha256', secret).update(`${timestamp}.${bodyStr}`).digest('hex');
  return `sha256=${hex}`;
}

function timingSafeMatch(provided: string, expected: string): boolean {
  const a = Buffer.from(provided.trim(), 'utf8');
  const b = Buffer.from(expected.trim(), 'utf8');
  if (a.length === 0 || a.length !== b.length) return false;
  return crypto.timingSafeEqual(a, b);
}

export interface VerifyYoupiWebhookHeadersInput {
  rawBody: Buffer | string;
  signature?: string;
  signatureV2?: string;
  timestamp?: string;
  deliveryId?: string;
  secret: string;
  toleranceMs?: number;
  nowMs?: number;
  requireTimestamp?: boolean;
}

export function verifyYoupiWebhookRequest(
  input: VerifyYoupiWebhookHeadersInput
): { valid: true; payload: YoupiWebhookPayload } | { valid: false; reason: string } {
  const {
    rawBody,
    signature,
    signatureV2,
    timestamp,
    deliveryId,
    secret,
    toleranceMs = DEFAULT_WEBHOOK_TOLERANCE_MS,
    nowMs = Date.now(),
    requireTimestamp = true,
  } = input;

  if (!secret) {
    return { valid: false, reason: 'Webhook secret is not configured on the server.' };
  }

  if (!signature || !signature.trim()) {
    return { valid: false, reason: 'Missing X-Gateway-Signature header.' };
  }

  const expectedSig = computeYoupiHmacSha256(rawBody, secret);
  if (!timingSafeMatch(signature, expectedSig)) {
    return { valid: false, reason: 'Invalid X-Gateway-Signature.' };
  }

  if (timestamp !== undefined && timestamp !== '') {
    const parsedTs = Number(timestamp);
    if (!Number.isFinite(parsedTs) || Math.abs(nowMs - parsedTs) > toleranceMs) {
      return { valid: false, reason: 'X-Gateway-Timestamp outside accepted tolerance window.' };
    }
    if (signatureV2 && signatureV2.trim()) {
      const expectedV2 = computeYoupiV2HmacSha256(rawBody, timestamp, secret);
      if (!timingSafeMatch(signatureV2, expectedV2)) {
        return { valid: false, reason: 'Invalid X-Gateway-Signature-V2.' };
      }
    }
  } else if (requireTimestamp) {
    return { valid: false, reason: 'Missing X-Gateway-Timestamp header.' };
  }

  let parsed: Record<string, unknown>;
  try {
    const text = Buffer.isBuffer(rawBody) ? rawBody.toString('utf8') : rawBody;
    parsed = JSON.parse(text) as Record<string, unknown>;
  } catch {
    return { valid: false, reason: 'Malformed webhook JSON payload.' };
  }

  const event = String(parsed.event || '').trim().toUpperCase() as YoupiGatewayRawStatus;
  const paymentId = String(parsed.paymentId || '').trim();
  const orderId = String(parsed.orderId || '').trim();
  const rawAmountPaise = parsed.amountPaise;
  const amountPaise =
    typeof rawAmountPaise === 'number'
      ? rawAmountPaise
      : Number(String(rawAmountPaise ?? '').trim());

  if (!event || !paymentId || !orderId || !Number.isFinite(amountPaise)) {
    return {
      valid: false,
      reason: 'Webhook payload missing required fields (event, paymentId, orderId, amountPaise).',
    };
  }

  const payloadDeliveryId =
    typeof parsed.deliveryId === 'string' ? parsed.deliveryId.trim() : undefined;
  if (deliveryId && payloadDeliveryId && deliveryId.trim() !== payloadDeliveryId) {
    return { valid: false, reason: 'X-Gateway-Delivery-Id header does not match payload deliveryId.' };
  }

  return {
    valid: true,
    payload: {
      event,
      paymentId,
      orderId,
      amount: String(parsed.amount ?? (amountPaise / 100).toFixed(2)),
      amountPaise: Math.round(amountPaise),
      currency: String(parsed.currency || 'INR').toUpperCase(),
      method: typeof parsed.method === 'string' ? parsed.method.toUpperCase() : 'UPI',
      settlementState:
        typeof parsed.settlementState === 'string'
          ? (parsed.settlementState.toUpperCase() as YoupiWebhookPayload['settlementState'])
          : undefined,
      utr: typeof parsed.utr === 'string' ? parsed.utr.trim() : undefined,
      deliveryId: deliveryId?.trim() || payloadDeliveryId,
      timestamp:
        typeof parsed.timestamp === 'number' || typeof parsed.timestamp === 'string'
          ? parsed.timestamp
          : timestamp,
      verificationTag:
        typeof parsed.verificationTag === 'string' ? parsed.verificationTag : undefined,
      verificationLevel:
        typeof parsed.verificationLevel === 'number' ? parsed.verificationLevel : undefined,
      verificationSources: Array.isArray(parsed.verificationSources)
        ? parsed.verificationSources.map(String)
        : undefined,
      completedAt: typeof parsed.completedAt === 'string' ? parsed.completedAt : undefined,
      reason: typeof parsed.reason === 'string' ? parsed.reason : undefined,
      metadata:
        parsed.metadata && typeof parsed.metadata === 'object'
          ? (parsed.metadata as Record<string, unknown>)
          : undefined,
    },
  };
}
