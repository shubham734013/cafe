import crypto from 'node:crypto';
import express, { type Request, type Response, type Router } from 'express';
import { z } from 'zod';
import { createRateLimiter } from './rateLimit';
import type { YoupiPaymentService } from './paymentService';
import { computeYoupiHmacSha256, computeYoupiV2HmacSha256 } from './webhookHandler';
import { GatewayRequestError } from './youpiClient';
import type { StaffRole } from '../types/cafe';

const createPaymentSchema = z.object({
  orderId: z.string().trim().min(1, 'Order ID is required').max(64),
  customerId: z.string().trim().max(64).optional(),
  customerName: z.string().trim().max(80).optional(),
  customerEmail: z.string().trim().email('Enter a valid email address').optional(),
  customerPhone: z
    .string()
    .trim()
    .transform((v) => v.replace(/\D/g, '').slice(-10))
    .refine((v) => /^\d{10}$/.test(v), 'Enter a 10-digit Indian mobile number')
    .optional(),
  idempotencyKey: z.string().trim().min(4).max(128).optional(),
  preferredApp: z.enum(['any', 'paytm', 'gpay', 'phonepe', 'amazonpay']).optional().default('any'),
});

const verifyBankSchema = z.object({
  decision: z.enum(['approve', 'reject']),
  utr: z.string().trim().max(24).optional(),
  note: z.string().trim().max(240).optional(),
});

const refundSchema = z.object({
  refundRef: z.string().trim().max(64).optional(),
  reason: z.string().trim().max(240).optional(),
});

const simulateWebhookSchema = z.object({
  outcome: z.enum([
    'OBSERVED_SUCCESS',
    'RECONCILED',
    'MANUAL_REVIEW',
    'FAILED',
    'EXPIRED',
    'CANCELLED',
  ]),
  utr: z.string().trim().max(24).optional(),
  overrideAmountPaise: z.number().int().positive().optional(),
});

export interface AuthCheckResult {
  allowed: boolean;
  httpStatus?: 401 | 403;
  error?: string;
}

export interface YoupiRouterDeps {
  paymentService: YoupiPaymentService;
  authorizeStaffRoles: (req: Request, roles: readonly StaffRole[]) => AuthCheckResult;
  authorizeOrderAccess: (req: Request, orderId: string) => AuthCheckResult;
  authorizeCustomerAccess: (req: Request, customerId: string) => AuthCheckResult;
}

function sendDenied(res: Response, check: AuthCheckResult): void {
  res.status(check.httpStatus ?? 401).json({ error: check.error || 'Unauthorized' });
}

export function createYoupiPaymentRouter(deps: YoupiRouterDeps): Router {
  const router = express.Router();
  const {
    paymentService,
    authorizeStaffRoles,
    authorizeOrderAccess,
    authorizeCustomerAccess,
  } = deps;

  const writeLimiter = createRateLimiter({
    windowMs: 60_000,
    maxRequests: 30,
    keyPrefix: 'youpi-write',
  });

  const readLimiter = createRateLimiter({
    windowMs: 60_000,
    maxRequests: 120,
    keyPrefix: 'youpi-read',
  });

  const webhookLimiter = createRateLimiter({
    windowMs: 60_000,
    maxRequests: 180,
    keyPrefix: 'youpi-webhook',
  });

  // Public gateway configuration (zero secrets)
  router.get('/payments/config', (_req, res) => {
    res.json(paymentService.getConfigInfo());
  });

  // Daily bank reconciliation summary (cashier / manager / owner)
  router.get('/payments/reconciliation/daily', readLimiter, (req, res) => {
    const auth = authorizeStaffRoles(req, ['owner', 'manager', 'cashier']);
    if (!auth.allowed) {
      sendDenied(res, auth);
      return;
    }
    res.json(paymentService.getDailyReconciliationSummary());
  });

  // Create YouPI-PG payment session (Method C: server-authoritative amount)
  router.post('/payments', writeLimiter, express.json({ limit: '64kb' }), async (req, res, next) => {
    try {
      const parsed = createPaymentSchema.parse(req.body);
      const auth = authorizeOrderAccess(req, parsed.orderId);
      if (!auth.allowed) {
        sendDenied(res, auth);
        return;
      }

      const headerIdem =
        typeof req.headers['idempotency-key'] === 'string'
          ? req.headers['idempotency-key'].trim()
          : undefined;
      const idempotencyKey =
        parsed.idempotencyKey || headerIdem || `yp_idem_${parsed.orderId}_${Date.now()}`;

      const result = await paymentService.createPaymentSession({
        orderId: parsed.orderId,
        customerId: parsed.customerId,
        customerName: parsed.customerName,
        customerEmail: parsed.customerEmail,
        customerPhone: parsed.customerPhone,
        idempotencyKey,
        preferredApp: parsed.preferredApp,
      });

      res.status(result.duplicate ? 200 : 201).json(result);
    } catch (err) {
      if (err instanceof GatewayRequestError) {
        res.status(err.httpStatus).json({ error: err.userMessage, code: err.code });
        return;
      }
      next(err);
    }
  });

  // Poll YouPI-PG session status
  router.get('/payments/:id', readLimiter, async (req, res, next) => {
    try {
      const sync = req.query.sync !== 'false';
      const payment = await paymentService.getPaymentStatus(String(req.params.id), {
        syncWithGateway: sync,
      });
      if (!payment) {
        res.status(404).json({ error: 'Payment session not found' });
        return;
      }
      const auth = authorizeOrderAccess(req, payment.orderId);
      if (!auth.allowed) {
        sendDenied(res, auth);
        return;
      }
      res.json({ payment });
    } catch (err) {
      if (err instanceof GatewayRequestError) {
        res.status(err.httpStatus).json({ error: err.userMessage, code: err.code });
        return;
      }
      next(err);
    }
  });

  // Mark payer clicked "I Have Paid" (moves sandbox session to 30s PROCESSING verification)
  router.post('/payments/:id/submitted', writeLimiter, async (req, res, next) => {
    try {
      const existing = await paymentService.getPaymentStatus(String(req.params.id), {
        syncWithGateway: false,
      });
      if (!existing) {
        res.status(404).json({ error: 'Payment session not found.' });
        return;
      }
      const auth = authorizeOrderAccess(req, existing.orderId);
      if (!auth.allowed) {
        sendDenied(res, auth);
        return;
      }
      const payment = await paymentService.markPayerSubmitted(existing.id);
      res.json({ payment });
    } catch (err) {
      if (err instanceof GatewayRequestError) {
        res.status(err.httpStatus).json({ error: err.userMessage, code: err.code });
        return;
      }
      next(err);
    }
  });

  // Cancel YouPI-PG session & release single-slot FIFO queue
  router.post('/payments/:id/cancel', writeLimiter, async (req, res, next) => {
    try {
      const existing = await paymentService.getPaymentStatus(String(req.params.id), {
        syncWithGateway: false,
      });
      if (!existing) {
        res.status(404).json({ error: 'Payment session not found.' });
        return;
      }
      const auth = authorizeOrderAccess(req, existing.orderId);
      if (!auth.allowed) {
        sendDenied(res, auth);
        return;
      }
      const payment = await paymentService.cancelPaymentSession(existing.id);
      res.json({ payment });
    } catch (err) {
      if (err instanceof GatewayRequestError) {
        res.status(err.httpStatus).json({ error: err.userMessage, code: err.code });
        return;
      }
      next(err);
    }
  });

  // Staff bank-statement verification (cashier / manager / owner)
  router.post(
    '/payments/:id/verify-bank',
    writeLimiter,
    express.json({ limit: '32kb' }),
    (req, res, next) => {
      try {
        const auth = authorizeStaffRoles(req, ['owner', 'manager', 'cashier']);
        if (!auth.allowed) {
          sendDenied(res, auth);
          return;
        }
        const parsed = verifyBankSchema.parse(req.body ?? {});
        const payment = paymentService.staffVerifyBankCredit({
          paymentId: String(req.params.id),
          decision: parsed.decision,
          utr: parsed.utr,
          note: parsed.note,
        });
        res.json({ payment });
      } catch (err) {
        if (err instanceof GatewayRequestError) {
          res.status(err.httpStatus).json({ error: err.userMessage, code: err.code });
          return;
        }
        next(err);
      }
    }
  );

  // Strict Owner / Manager PIN protected UPI payment refund
  router.post(
    '/payments/:id/refund',
    writeLimiter,
    express.json({ limit: '32kb' }),
    async (req, res, next) => {
      try {
        const auth = authorizeStaffRoles(req, ['owner', 'manager']);
        if (!auth.allowed) {
          sendDenied(res, auth);
          return;
        }
        const parsed = refundSchema.parse(req.body ?? {});
        const payment = await paymentService.refundPaymentSession({
          paymentId: String(req.params.id),
          refundRef: parsed.refundRef,
          reason: parsed.reason,
        });
        res.json({ payment });
      } catch (err) {
        if (err instanceof GatewayRequestError) {
          res.status(err.httpStatus).json({ error: err.userMessage, code: err.code });
          return;
        }
        next(err);
      }
    }
  );

  // Order & Customer payment history (RBAC / Ownership enforced)
  router.get('/orders/:id/payments', readLimiter, (req, res) => {
    const orderId = String(req.params.id);
    const auth = authorizeOrderAccess(req, orderId);
    if (!auth.allowed) {
      sendDenied(res, auth);
      return;
    }
    res.json({ payments: paymentService.listPaymentsByOrder(orderId) });
  });

  router.get('/customers/:id/payments', readLimiter, (req, res) => {
    const customerId = String(req.params.id);
    const auth = authorizeCustomerAccess(req, customerId);
    if (!auth.allowed) {
      sendDenied(res, auth);
      return;
    }
    res.json({ payments: paymentService.listPaymentsByCustomer(customerId) });
  });

  // Public YouPI-PG signed webhook endpoint (raw body required BEFORE global express.json)
  router.post(
    '/webhooks/youpi',
    webhookLimiter,
    express.raw({ type: '*/*', limit: '256kb' }),
    (req, res) => {
      const rawBody = Buffer.isBuffer(req.body)
        ? req.body
        : Buffer.from(typeof req.body === 'string' ? req.body : JSON.stringify(req.body ?? {}));

      const signature =
        typeof req.headers['x-gateway-signature'] === 'string'
          ? req.headers['x-gateway-signature']
          : undefined;
      const signatureV2 =
        typeof req.headers['x-gateway-signature-v2'] === 'string'
          ? req.headers['x-gateway-signature-v2']
          : undefined;
      const timestamp =
        typeof req.headers['x-gateway-timestamp'] === 'string'
          ? req.headers['x-gateway-timestamp']
          : undefined;
      const deliveryId =
        typeof req.headers['x-gateway-delivery-id'] === 'string'
          ? req.headers['x-gateway-delivery-id']
          : undefined;

      const result = paymentService.processWebhook({
        rawBody,
        signature,
        signatureV2,
        timestamp,
        deliveryId,
      });

      res.status(result.httpStatus).json(result.body);
    }
  );

  // Non-production sandbox webhook simulator for testing observer/reconciliation/tamper cases
  if (process.env.NODE_ENV !== 'production') {
    router.post(
      '/payments/:id/simulate-webhook',
      express.json({ limit: '32kb' }),
      async (req, res, next) => {
        try {
          const gw = paymentService.getGatewayForDev();
          if (typeof gw.simulateOutcome !== 'function') {
            res.status(403).json({ error: 'Simulator is disabled when live YouPI-PG is configured.' });
            return;
          }
          const parsed = simulateWebhookSchema.parse(req.body ?? {});
          const existing = await paymentService.getPaymentStatus(String(req.params.id), {
            syncWithGateway: false,
          });
          if (!existing) {
            res.status(404).json({ error: 'Payment session not found' });
            return;
          }

          const auth = authorizeOrderAccess(req, existing.orderId);
          if (!auth.allowed) {
            sendDenied(res, auth);
            return;
          }

          const payload = gw.simulateOutcome(existing.gatewayPaymentId, parsed.outcome, {
            utr: parsed.utr,
            overrideAmountPaise: parsed.overrideAmountPaise,
          });
          if (!payload) {
            res.status(404).json({ error: 'Sandbox gateway session not found' });
            return;
          }

          const ts = String(payload.timestamp ?? Date.now());
          const deliveryId = payload.deliveryId || `dlv_${crypto.randomBytes(6).toString('hex')}`;
          const rawBody = Buffer.from(JSON.stringify(payload), 'utf8');
          const secret = paymentService.getWebhookSecretForDev();
          const result = paymentService.processWebhook({
            rawBody,
            signature: computeYoupiHmacSha256(rawBody, secret),
            signatureV2: computeYoupiV2HmacSha256(rawBody, ts, secret),
            timestamp: ts,
            deliveryId,
          });

          res.json({
            simulated: true,
            webhookResult: result.body,
            payment:
              result.payment ??
              (await paymentService.getPaymentStatus(existing.id, { syncWithGateway: false })),
          });
        } catch (err) {
          next(err);
        }
      }
    );
  }

  return router;
}
