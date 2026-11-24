import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import express, { type Express, type NextFunction, type Request, type Response } from 'express';
import { createClient } from '@supabase/supabase-js';
import { Server as SocketIOServer } from 'socket.io';
import swaggerUi from 'swagger-ui-express';
import { z } from 'zod';
import {
  addCustomerSchema,
  addIngredientSchema,
  addLoyaltyRuleSchema,
  addMenuItemSchema,
  updateMenuItemSchema,
  addStaffSchema,
  addTableSchema,
  cafeSettingsSchema,
  customerFeedbackSchema,
  createCampaignSchema,
  createOrderSchema,
  reserveTableSchema,
  restockIngredientSchema,
  staffPinLoginSchema,
  tableTransferMergeSchema,
  toggleKotItemSchema,
  orderFeedbackSchema,
  orderRefundSchema,
  cancelOrderItemSchema,
  orderPayCounterSchema,
  requestReorderSchema,
  stockReceiptSchema,
  stockWasteSchema,
  stockTransferSchema,
  stockCountSchema,
  purchaseOrderSchema,
  receivePurchaseOrderSchema,
  brevoConfirmationSchema,
  broadcastEmailSchema,
  sendBillEmailSchema,
} from '../shared/schemas';
import {
  isBrevoConfigured,
  sendBrevoConfirmationEmail,
  broadcastBrevoMarketingEmail,
  sendBrevoOrderBillEmail,
  sendBrevoOrderPaidEmail,
} from './brevo';
import {
  assertAuthSecretConfigured,
  authenticateStaffPin,
  canCustomerAccessCustomer,
  canCustomerAccessOrder,
  clearCustomerSessionCookie,
  clearStaffSessionCookie,
  getCustomerSession,
  getCustomerSessionFromCookieHeader,
  getStaffSession,
  getStaffSessionFromCookieHeader,
  hasStaffRole,
  issueOrUpdateCustomerSessionCookie,
  setStaffSessionCookie,
  setStaffRefreshTokenCookie,
  clearStaffRefreshTokenCookie,
  rotateRefreshToken,
  checkLockout,
  createRefreshToken,
  STAFF_REFRESH_COOKIE,
  parseCookies,
  updateCustomerCrmIdentityCookie,
  type StaffSessionPayload,
} from './auth';
import { requestOtp, verifyOtp } from './otp';
import {
  consumePasswordResetToken,
  verifyAndApplyEmailChange,
  generateOAuthChallenge,
  verifyOAuthCallbackState,
} from './accountSecurity';
import {
  setupAdmin2Fa,
  confirmAndEnableAdmin2Fa,
  verifyAdmin2Fa,
  isAdmin2FaRequired,
} from './admin2fa';
import { createRateLimiter, createTableRateLimiter } from './rateLimit';
import { noSqlInjectionSanitizer, safeJsonForHtml, verifyCaptchaToken } from './security';
import { InvalidDomainTransitionError } from '../state/cafeStateMachines';
import type { CafeOrder, ScreenId, StaffRole } from '../types/cafe';
import { cafeOpenApiSpec } from './openapi';
import { CafeStore } from './store';
import {
  UpiGateway,
  UpiGatewayRequestError,
  verifyUpiGatewayWebhook,
  type UpiGatewayClient,
  type UpiGatewayOrder,
} from './upiGateway';
import { CashfreeGateway } from './cashfreeGateway';

export interface CafeServerBundle {
  app: Express;
  httpServer: http.Server;
  io: SocketIOServer;
  store: CafeStore;
}

function parseBody<T extends z.ZodTypeAny>(schema: T, body: unknown): z.infer<T> {
  return schema.parse(body);
}

const ROLE_LABELS: Record<StaffRole, string> = {
  admin: 'Admin',
  kitchen: 'Kitchen',
};

const ROUTE_DATA_SCREENS = new Set<ScreenId>([
  'splash',
  'home',
  'menu',
  'cart',
  'tracking',
  'rewards',
  'profile',
  'login',
  'privacy-policy',
  'terms-and-conditions',
  'staff-home',
  'pos-terminal',
  'pos-orders',
  'kitchen-display-system',
  'kitchen-tables',
  'admin-dashboard',
  'order-management',
  'reports-analytics',
  'table-layout',
  'inventory-stock',
  'crm-customers',
  'loyalty-rewards',
  'offers-campaigns',
  'staff-roles',
  'settings-cafe-profile',
]);

interface AuthCheckResult {
  allowed: boolean;
  httpStatus?: number;
  error?: string;
}

export function resolvePaymentGateway(): UpiGatewayClient {
  if (process.env.NODE_ENV === 'test') {
    return new UpiGateway({
      baseUrl: '',
      apiKey: '',
      apiSecret: '',
      isProduction: false,
    });
  }
  if (process.env.CASHFREE_APP_ID && process.env.CASHFREE_SECRET_KEY) {
    return new CashfreeGateway();
  }
  return new UpiGateway();
}

export function createCafeServer(
  store = new CafeStore(),
  upiGateway: UpiGatewayClient = resolvePaymentGateway()
): CafeServerBundle {
  assertAuthSecretConfigured();

  const app = express();
  const configuredProxyHops = process.env.TRUST_PROXY_HOPS;
  const trustProxyHops =
    configuredProxyHops === undefined && process.env.TRUST_PROXY === 'true'
      ? 1
      : Number(configuredProxyHops ?? 0);
  if (!Number.isInteger(trustProxyHops) || trustProxyHops < 0) {
    throw new Error('TRUST_PROXY_HOPS must be a non-negative integer.');
  }
  app.set('trust proxy', trustProxyHops);
  const httpServer = http.createServer(app);
  const isProduction = process.env.NODE_ENV === 'production';
  const allowedOrigins = process.env.CORS_ORIGIN
    ? process.env.CORS_ORIGIN.split(',').map((origin) => origin.trim()).filter(Boolean)
    : [
        'http://localhost:3000',
        'http://localhost:3002',
        'http://127.0.0.1:3000',
        'http://127.0.0.1:3002',
        'http://localhost:5173',
      ];
  const isOriginAllowed = (origin: string): boolean => {
    if (allowedOrigins.includes(origin)) return true;
    if (isProduction) return false;
    try {
      const { protocol, hostname } = new URL(origin);
      return (
        (protocol === 'http:' && ['localhost', '127.0.0.1'].includes(hostname)) ||
        (protocol === 'https:' && hostname.endsWith('.trycloudflare.com'))
      );
    } catch {
      return false;
    }
  };

  const io = new SocketIOServer(httpServer, {
    cors: {
      origin: (requestOrigin, callback) => {
        if (!requestOrigin) return callback(null, true);
        if (isOriginAllowed(requestOrigin)) {
          return callback(null, requestOrigin);
        }
        return callback(new Error('CORS origin not allowed.'), false);
      },
      credentials: true,
    },
  });

  const cafeId = 'seth-sawariya-main';
  const STAFF_ROOM = `outlet:${cafeId}:staff`;
  const KITCHEN_ROOM = `outlet:${cafeId}:kitchen`;
  const PUBLIC_ROOM = `outlet:${cafeId}:public`;

  io.use((socket, next) => {
    const cookieHeader = socket.handshake.headers.cookie;
    (socket.data as any).staffSession = getStaffSessionFromCookieHeader(cookieHeader);
    (socket.data as any).customerSession = getCustomerSessionFromCookieHeader(cookieHeader);
    next();
  });

  io.on('connection', (socket) => {
    const staffSession = (socket.data as any).staffSession;
    const customerSession = (socket.data as any).customerSession;
    const tableToken = socket.handshake.query.tableToken as string;

    if (staffSession) {
      if (staffSession.role === 'admin') {
        void socket.join(STAFF_ROOM);
        void socket.join(KITCHEN_ROOM);
      } else if (staffSession.role === 'kitchen') {
        void socket.join(KITCHEN_ROOM);
      }
    } else {
      void socket.join(PUBLIC_ROOM);
      if (customerSession?.orderIds?.length) {
        for (const oid of customerSession.orderIds) {
          void socket.join(`order:${oid}`);
        }
      }
      if (tableToken && typeof tableToken === 'string') {
        const table = store.getTable(tableToken.trim().toUpperCase());
        if (table) {
          void socket.join(`table:${table.id}`);
        }
      }
    }

    // Explicit authenticated room subscriptions only
    socket.on('outlet:join', (data?: { tableToken?: string; orderId?: string }) => {
      const currentStaff = (socket.data as any).staffSession || getStaffSessionFromCookieHeader(socket.handshake.headers.cookie);
      const currentCust = (socket.data as any).customerSession || getCustomerSessionFromCookieHeader(socket.handshake.headers.cookie);

      if (currentStaff) {
        if (currentStaff.role === 'admin') {
          void socket.join(STAFF_ROOM);
          void socket.join(KITCHEN_ROOM);
        } else if (currentStaff.role === 'kitchen') {
          void socket.join(KITCHEN_ROOM);
        }
      } else {
        void socket.join(PUBLIC_ROOM);
        if (data?.tableToken) {
          const table = store.getTable(data.tableToken.trim().toUpperCase());
          if (table) void socket.join(`table:${table.id}`);
        }
        if (data?.orderId && currentCust?.orderIds?.includes(data.orderId)) {
          void socket.join(`order:${data.orderId}`);
        }
      }
    });

    socket.on('order:subscribe', (data?: { orderId?: string }) => {
      if (!data?.orderId) return;
      const currentStaff = (socket.data as any).staffSession || getStaffSessionFromCookieHeader(socket.handshake.headers.cookie);
      const currentCust = (socket.data as any).customerSession || getCustomerSessionFromCookieHeader(socket.handshake.headers.cookie);
      if (currentStaff || currentCust?.orderIds?.includes(data.orderId)) {
        void socket.join(`order:${data.orderId}`);
      }
    });
  });

  const emitSync = (event: string, payload?: unknown) => {
    const data = (payload ?? { ts: Date.now() }) as Record<string, any>;
    const order = data?.order as CafeOrder | undefined;
    const orderId = order?.id || (typeof data?.orderId === 'string' ? data.orderId : undefined);
    const tableNumber = order?.tableNumber || (typeof data?.tableNumber === 'string' ? data.tableNumber : undefined);

    // 1. Staff room receives all operational events
    io.to(STAFF_ROOM).emit(event, data);
    io.to(STAFF_ROOM).emit('cafe:sync', { event, ts: Date.now() });

    // 2. Kitchen room receives cooking tickets and stock/ingredient events
    if (
      event.startsWith('order:') ||
      event.startsWith('inventory:') ||
      event.startsWith('stock:') ||
      event.startsWith('table:')
    ) {
      io.to(KITCHEN_ROOM).emit(event, data);
      io.to(KITCHEN_ROOM).emit('cafe:sync', { event, ts: Date.now() });
    }

    // 3. Isolated Customer delivery: only emit order events to the specific authorized order room
    if (orderId) {
      io.to(`order:${orderId}`).emit(event, data);
      io.to(`order:${orderId}`).emit('order:updated', data);
    }
    if (tableNumber) {
      io.to(`table:${tableNumber}`).emit(event, data);
    }

    // 4. Non-sensitive catalog/sync notifications to public room
    if (
      event === 'menu:item-availability' ||
      event === 'menu:availability-toggled' ||
      event === 'table:updated' ||
      event === 'cafe:sync'
    ) {
      io.to(PUBLIC_ROOM).emit(event, data);
    }
    // NEVER broadcast private customer order events globally via io.emit()!
  };

  const checkStaffRoles = (req: Request, allowedRoles: readonly StaffRole[]): AuthCheckResult => {
    const session = getStaffSession(req);
    if (!session) {
      return {
        allowed: false,
        httpStatus: 401,
        error: 'Staff PIN authentication required',
      };
    }
    if (!hasStaffRole(session, allowedRoles)) {
      return {
        allowed: false,
        httpStatus: 403,
        error: `Role "${ROLE_LABELS[session.role]}" is not authorized for this action`,
      };
    }
    return { allowed: true };
  };

  const checkCustomerAccess = (req: Request, customerId: string): AuthCheckResult => {
    const staff = getStaffSession(req);
    if (staff) {
      if (hasStaffRole(staff, ['admin'])) return { allowed: true };
      return {
        allowed: false,
        httpStatus: 403,
        error: 'Insufficient staff role to access customer records',
      };
    }
    const customer = getCustomerSession(req);
    if (!customer) {
      return {
        allowed: false,
        httpStatus: 401,
        error: 'Authentication required to access customer records',
      };
    }
    if (!canCustomerAccessCustomer(customer, customerId)) {
      return {
        allowed: false,
        httpStatus: 403,
        error: 'You do not have permission to access another customer record',
      };
    }
    return { allowed: true };
  };

  const requireRoles = (allowedRoles: readonly StaffRole[]) => {
    return (req: Request, res: Response, next: NextFunction) => {
      const auth = checkStaffRoles(req, allowedRoles);
      if (!auth.allowed) {
        res.status(auth.httpStatus ?? 401).json({ error: auth.error });
        return;
      }
      next();
    };
  };

  const getAccessibleOrder = (req: Request, res: Response, orderId: string) => {
    const order = store.getOrder(orderId);
    if (!order) {
      res.status(404).json({ error: 'Order not found' });
      return null;
    }

    const staffSession = getStaffSession(req);
    if (staffSession) {
      if (!hasStaffRole(staffSession, ['admin'])) {
        res.status(403).json({ error: 'Your role cannot access online payment for this order.' });
        return null;
      }
    } else if (!canCustomerAccessOrder(getCustomerSession(req), orderId)) {
      res.status(403).json({ error: 'You do not have access to this order.' });
      return null;
    }

    return order;
  };

  const mapGatewayStatus = (
    status: UpiGatewayOrder['status']
  ): NonNullable<ReturnType<CafeStore['getOrder']>>['paymentStatus'] => {
    switch (status) {
      case 'pending':
        return 'pending';
      case 'paid':
        return 'paid';
      case 'expired':
        return 'expired';
      case 'review':
        return 'manual_review';
      case 'failed':
        return 'failed';
    }
  };

  const getGatewayClientOrderId = (
    order: NonNullable<ReturnType<CafeStore['getOrder']>>
  ) => order.gatewayClientOrderId ?? order.id;

  const getCafeOrderByGatewayReference = (reference: string) =>
    store.getOrderByGatewayClientOrderId(reference) ?? store.getOrder(reference);

  const assertGatewayOrderMatchesCafeOrder = (
    gatewayOrder: UpiGatewayOrder,
    order: NonNullable<ReturnType<CafeStore['getOrder']>>
  ) => {
    if (
      gatewayOrder.clientOrderId !== getGatewayClientOrderId(order) ||
      gatewayOrder.amountPaise !== Math.round(order.total * 100)
    ) {
      throw new UpiGatewayRequestError(
        'The payment gateway order does not match the CafeOS order amount or reference.'
      );
    }
  };

  async function triggerOrderPaidEmailIfEligible(orderId: string) {
    const order = store.getOrder(orderId);
    if (!order) return;
    if (order.paymentStatus !== 'paid') return;
    if (order.paidEmailSentAt) return;

    let email = order.customerEmail?.trim();
    if (!email || !email.includes('@')) {
      if (order.customerId) {
        const crmCustomer = store.getBootstrap().customers.find((c) => c.id === order.customerId);
        if (crmCustomer?.email) {
          email = crmCustomer.email.trim();
          order.customerEmail = email;
        }
      }
    }

    if (!email || !email.includes('@') || !isBrevoConfigured()) return;

    try {
      const state = store.getBootstrap();
      const result = await sendBrevoOrderPaidEmail({
        order,
        toEmail: email,
        toName: order.customerName || 'Valued Guest',
        cafeSettings: state.cafeSettings,
        appUrl: process.env.APP_PUBLIC_URL || process.env.APP_URL || 'http://localhost:3002',
      });
      if (result.success) {
        const updated = store.markOrderPaidEmailSent(order.id, email);
        await store.flushToPersistence();
        if (updated) {
          emitSync('order:updated', { order: updated });
        }
      }
    } catch {
      console.error('[Brevo] Paid-order email dispatch failed.');
    }
  }

  const syncGatewayOrder = async (orderId: string, gatewayOrder: UpiGatewayOrder) => {
    const order = store.getOrder(orderId);
    if (!order) return null;
    assertGatewayOrderMatchesCafeOrder(gatewayOrder, order);
    const rawPayerPhone = gatewayOrder.customerPhone ? gatewayOrder.customerPhone.replace(/\D/g, '').slice(-10) : '';
    const payerPhone = rawPayerPhone.length === 10 && rawPayerPhone !== '9999999999' ? rawPayerPhone : undefined;
    const updated = store.attachGatewayPayment(
      orderId,
      gatewayOrder.orderId,
      mapGatewayStatus(gatewayOrder.status),
      gatewayOrder.utr,
      payerPhone
    );
    if (updated) {
      // 🌟 Industry-Standard Payment Gateway Phone Capture:
      if (payerPhone) {
        if (updated.customerId) {
          const c = store.syncCustomerProfile(updated.customerId, {
            phone: payerPhone,
            name: updated.customerName,
            email: updated.customerEmail,
          });
          if (c) emitSync('customer:updated', { customer: c });
        } else if (updated.customerEmail) {
          const existingCust = store.getCustomers().find(
            (c) => c.email && c.email.toLowerCase() === updated.customerEmail?.toLowerCase()
          );
          if (existingCust) {
            const c = store.syncCustomerProfile(existingCust.id, { phone: payerPhone });
            if (c) emitSync('customer:updated', { customer: c });
          }
        }
      }
      emitSync('order:updated', { order: updated });
      if (updated.paymentStatus === 'paid') {
        void triggerOrderPaidEmailIfEligible(updated.id);
      }
    }
    return updated;
  };

  app.post(
    '/api/webhooks/upi-gateway',
    express.raw({ type: 'application/json', limit: '64kb' }),
    async (req, res) => {
      const webhookSecret = upiGateway.getWebhookSecret();
      if (!webhookSecret || !upiGateway.isConfigured()) {
        res.status(503).json({ error: 'UPI gateway webhook is not configured.' });
        return;
      }
      if (!Buffer.isBuffer(req.body)) {
        res.status(415).json({ error: 'UPI gateway webhook must use application/json.' });
        return;
      }
      if (!verifyUpiGatewayWebhook(req.body, req.header('x-signature'), webhookSecret)) {
        res.status(401).json({ error: 'Invalid or expired UPI gateway signature.' });
        return;
      }

      let payload: unknown;
      try {
        payload = JSON.parse(req.body.toString('utf8'));
      } catch {
        res.status(400).json({ error: 'Invalid UPI gateway webhook JSON.' });
        return;
      }
      if (
        typeof payload !== 'object' ||
        payload === null ||
        !('data' in payload) ||
        typeof payload.data !== 'object' ||
        payload.data === null ||
        !('client_order_id' in payload.data) ||
        typeof payload.data.client_order_id !== 'string'
      ) {
        res.status(400).json({ error: 'Invalid UPI gateway webhook payload.' });
        return;
      }

      const clientOrderId = payload.data.client_order_id;
      const order =
        store.getOrderByGatewayClientOrderId(clientOrderId) ?? store.getOrder(clientOrderId);
      if (!order) {
        res.status(404).json({ error: 'CafeOS order not found for this gateway event.' });
        return;
      }
      if (!store.isPersistenceHealthy()) {
        res.status(503).json({ error: 'CafeOS persistence is unavailable; retry the webhook.' });
        return;
      }

      try {
        const gatewayOrder = await upiGateway.getOrder(clientOrderId);
        if (!gatewayOrder) {
          res.status(404).json({ error: 'UPI gateway order not found; retry the webhook.' });
          return;
        }
        const updated = await syncGatewayOrder(order.id, gatewayOrder);
        if (!updated) {
          res.status(404).json({ error: 'CafeOS order no longer exists.' });
          return;
        }
        await store.flushToPersistence();
        res.status(200).json({ received: true });
      } catch (error) {
        console.error('[CafeOS] UPI gateway webhook verification failed.');
        res.status(503).json({ error: 'Could not verify the payment; retry the webhook.' });
      }
    }
  );

  // Cashfree Payments Webhook
  app.post(
    '/api/webhooks/cashfree',
    express.raw({ type: 'application/json', limit: '64kb' }),
    async (req, res) => {
      if (!(upiGateway instanceof CashfreeGateway)) {
        res.status(503).json({ error: 'Cashfree is not the active payment gateway.' });
        return;
      }
      const signature = req.header('x-webhook-signature');
      const timestamp = req.header('x-webhook-timestamp');
      if (!Buffer.isBuffer(req.body)) {
        res.status(415).json({ error: 'Cashfree webhook must use application/json.' });
        return;
      }
      if (!upiGateway.verifyWebhook(req.body, signature, timestamp)) {
        res.status(401).json({ error: 'Invalid or expired Cashfree signature.' });
        return;
      }

      let payload: unknown;
      try {
        payload = JSON.parse(req.body.toString('utf8'));
      } catch {
        res.status(400).json({ error: 'Invalid Cashfree webhook JSON.' });
        return;
      }

      const p = payload as {
        event_time?: string;
        type?: string;
        data?: {
          order?: {
            order_id?: string;
            order_amount?: number;
            order_currency?: string;
          };
          payment?: {
            cf_payment_id?: string | number;
            payment_status?: string;
            payment_amount?: number;
            payment_currency?: string;
            bank_reference?: string;
          };
        };
      };
      const orderId = p?.data?.order?.order_id;
      const existingOrder = orderId ? getCafeOrderByGatewayReference(orderId) : null;
      if (!orderId || !existingOrder) {
        res.status(404).json({ error: 'CafeOS order not found.' });
        return;
      }

      // 1. Payment Event Idempotency & Deduplication
      const paymentIdentifier = String(
        p?.data?.payment?.cf_payment_id || p?.data?.payment?.bank_reference || `${orderId}:${p?.type}`
      );
      if (store.hasProcessedPaymentEvent(paymentIdentifier)) {
        res.status(200).json({ received: true, duplicate: true });
        return;
      }

      // 2. Validate Payment Amount against order total
      const reportedAmount = Number(
        p?.data?.payment?.payment_amount ?? p?.data?.order?.order_amount ?? 0
      );
      if (reportedAmount > 0 && Math.abs(reportedAmount - existingOrder.total) > 0.01) {
        res.status(400).json({
          error: `Payment amount (${reportedAmount}) does not match order total (${existingOrder.total}).`,
        });
        return;
      }

      // 3. Validate Payment Currency
      const reportedCurrency = (
        p?.data?.payment?.payment_currency ?? p?.data?.order?.order_currency ?? 'INR'
      ).toUpperCase();
      if (reportedCurrency !== 'INR') {
        res.status(400).json({
          error: `Payment currency (${reportedCurrency}) is not valid for this outlet.`,
        });
        return;
      }

      try {
        const paymentStatus = p?.data?.payment?.payment_status?.toUpperCase();
        if (p?.type === 'PAYMENT_SUCCESS_WEBHOOK' || paymentStatus === 'SUCCESS') {
          store.markPaymentProcessed(paymentIdentifier);
          const utr = p?.data?.payment?.bank_reference;
          store.attachGatewayPayment(
            existingOrder.id,
            existingOrder.gatewayOrderId ?? orderId,
            'paid',
            utr
          );

          // 🌟 Auto-sync payer phone from Cashfree webhook payload
          const rawWebhookPhone =
            (p?.data as Record<string, unknown> | undefined)?.customer_details &&
            typeof (p?.data as Record<string, unknown>).customer_details === 'object'
              ? ((p?.data as Record<string, unknown>).customer_details as Record<string, unknown>).customer_phone
              : undefined;
          const cleanWebhookPhone = rawWebhookPhone
            ? String(rawWebhookPhone).replace(/\D/g, '').slice(-10)
            : '';
          if (cleanWebhookPhone.length === 10 && cleanWebhookPhone !== '9999999999') {
            existingOrder.customerPhone = cleanWebhookPhone;
            if (existingOrder.customerId) {
              const c = store.syncCustomerProfile(existingOrder.customerId, {
                phone: cleanWebhookPhone,
                name: existingOrder.customerName,
                email: existingOrder.customerEmail,
              });
              if (c) emitSync('customer:updated', { customer: c });
            } else if (existingOrder.customerEmail) {
              const existingCust = store.getCustomers().find(
                (cust) => cust.email && cust.email.toLowerCase() === existingOrder.customerEmail?.toLowerCase()
              );
              if (existingCust) {
                const c = store.syncCustomerProfile(existingCust.id, { phone: cleanWebhookPhone });
                if (c) emitSync('customer:updated', { customer: c });
              }
            }
          }

          await store.flushToPersistence();
          const updated = store.getOrder(existingOrder.id);
          if (updated) {
            emitSync('order:updated', { order: updated });
            void triggerOrderPaidEmailIfEligible(updated.id);
          }
        } else {
          const gatewayOrder = await upiGateway.getOrder(
            getGatewayClientOrderId(existingOrder)
          );
          if (gatewayOrder) {
            await syncGatewayOrder(existingOrder.id, gatewayOrder);
            await store.flushToPersistence();
          }
        }
        res.status(200).json({ received: true });
      } catch {
        res.status(503).json({ error: 'Could not sync order.' });
      }
    }
  );

  // Cashfree Official Checkout Page (Invokes Cashfree JS SDK v3)
  app.get('/api/orders/:id/cashfree-checkout', (req, res) => {
    const gatewayReference = String(req.params.id);
    const session = String(req.query.session || '');
    const mode = String(req.query.mode || (process.env.CASHFREE_ENVIRONMENT === 'PRODUCTION' ? 'production' : 'sandbox'));
    const order = getCafeOrderByGatewayReference(gatewayReference);
    if (!order) {
      res.status(404).send('Order not found');
      return;
    }

    res.setHeader('Content-Type', 'text/html');
    res.send(`<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Cashfree Secure Checkout · Order #${order.id}</title>
  <script src="https://cdn.tailwindcss.com"></script>
  <script src="https://sdk.cashfree.com/js/v3/cashfree.js"></script>
</head>
<body class="bg-slate-900 text-slate-100 min-h-screen flex items-center justify-center p-4">
  <div class="max-w-md w-full bg-slate-800 border border-slate-700 rounded-2xl p-6 shadow-2xl text-center">
    <div class="w-14 h-14 mx-auto mb-4 relative flex items-center justify-center">
      <div class="w-14 h-14 border-4 border-blue-500/30 border-t-blue-500 rounded-full animate-spin"></div>
      <span class="absolute text-xl">⚡</span>
    </div>
    <h2 class="text-lg font-bold text-white mb-1">Connecting to Cashfree Payments</h2>
    <p class="text-xs text-slate-400 mb-4">Initializing secure 0% fee UPI checkout for Order #${order.id} (₹${order.total.toFixed(2)})...</p>

    <div id="status-box" class="text-xs text-slate-400 bg-slate-900/60 rounded-xl p-3 border border-slate-700/50">
      Launching secure payment gateway...
    </div>

    <div id="error-box" class="hidden text-xs text-red-300 bg-red-950/60 border border-red-800 rounded-xl p-4 mt-3 text-left">
      <div class="font-bold mb-1 text-sm text-red-200">Unable to launch payment</div>
      <div id="error-message" class="mb-3"></div>
      <div class="flex gap-2">
        <button onclick="window.location.reload()" class="px-3 py-1.5 bg-red-800 hover:bg-red-700 rounded text-white text-xs font-semibold cursor-pointer">Retry</button>
        <a href="/customer/tracking?orderId=${encodeURIComponent(order.id)}" class="px-3 py-1.5 bg-slate-700 hover:bg-slate-600 rounded text-slate-200 text-xs inline-block">Go to Order Tracking</a>
      </div>
    </div>
  </div>

  <script>
    (function() {
      const session = ${safeJsonForHtml(session)};
      const mode = ${safeJsonForHtml(mode)};
      const orderId = ${safeJsonForHtml(order.id)};

      function showError(msg) {
        document.getElementById('status-box').classList.add('hidden');
        const errBox = document.getElementById('error-box');
        document.getElementById('error-message').textContent = msg;
        errBox.classList.remove('hidden');
      }

      if (!session) {
        showError('No payment session provided. Please re-initiate checkout from the cart.');
        return;
      }

      if (typeof Cashfree === 'undefined') {
        showError('Cashfree SDK failed to load. Please verify your internet connection or disable ad-blockers.');
        return;
      }

      try {
        const cashfree = Cashfree({ mode: mode });
        cashfree.checkout({
          paymentSessionId: session,
          redirectTarget: '_self'
        }).then(function(result) {
          if (result && result.error) {
            showError(result.error.message || 'Error launching Cashfree checkout.');
          }
        }).catch(function(err) {
          showError(err && err.message ? err.message : String(err));
        });
      } catch (err) {
        showError(err && err.message ? err.message : String(err));
      }
    })();
  </script>
</body>
</html>`);
  });

  // Cashfree Return URL
  app.get('/api/orders/:id/cashfree-return', async (req, res) => {
    const gatewayReference = String(req.params.id);
    const order = getCafeOrderByGatewayReference(gatewayReference);
    if (!order) {
      res.redirect('/customer/tracking');
      return;
    }
    try {
      const gatewayOrder = await upiGateway.getOrder(getGatewayClientOrderId(order));
      if (gatewayOrder) {
        await syncGatewayOrder(order.id, gatewayOrder);
        await store.flushToPersistence();
      }
    } catch {
      // Continue to tracking
    }
    res.redirect(`/customer/tracking?orderId=${encodeURIComponent(order.id)}`);
  });

  // Cashfree Mock Checkout (for local development & instant testing)
  app.get('/api/cashfree-mock/checkout', (req, res) => {
    if (process.env.NODE_ENV === 'production') {
      res.status(404).json({ error: 'Endpoint not available in production' });
      return;
    }
    const gatewayReference = String(req.query.orderId || '');
    const session = String(req.query.session || '');
    const order = getCafeOrderByGatewayReference(gatewayReference);
    if (!order) {
      res.status(404).send('Order not found');
      return;
    }
    res.setHeader('Content-Type', 'text/html');
    res.send(`<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Cashfree Payments · ₹${order.total.toFixed(2)}</title>
  <script src="https://cdn.tailwindcss.com"></script>
</head>
<body class="bg-slate-50 text-slate-800 font-sans min-h-screen flex items-center justify-center p-4">
  <div class="w-full max-w-md bg-white rounded-2xl shadow-xl ring-1 ring-slate-200 overflow-hidden">
    <div class="bg-[#172554] text-white p-6 flex justify-between items-center">
      <div>
        <div class="text-xs uppercase tracking-wider text-blue-200">Cashfree Payments</div>
        <div class="text-xl font-bold mt-1">Seth Sawariya Cafe</div>
      </div>
      <div class="text-right">
        <div class="text-xs text-blue-200">Total Amount</div>
        <div class="text-2xl font-extrabold tabular-nums">₹${order.total.toFixed(2)}</div>
      </div>
    </div>
    <div class="p-6">
      <div class="text-xs text-slate-400 font-semibold uppercase tracking-wider mb-2">Order Reference</div>
      <div class="text-sm font-mono bg-slate-100 rounded-lg p-2.5 text-slate-700 mb-6">${order.id}</div>

      <div class="bg-blue-50 border border-blue-200 rounded-xl p-4 mb-6 text-sm text-blue-900">
        <div class="font-bold flex items-center gap-2 mb-1">
          <span>⚡ Cashfree Zero-MDR Official Gateway</span>
        </div>
        <div class="text-xs text-blue-700 leading-relaxed">
          Official payment gateway with 0% transaction fee on UPI. Automatic payment verification with real-time bank switch settlement.
        </div>
      </div>

      <div class="space-y-3">
        <form method="POST" action="/api/cashfree-mock/pay">
          <input type="hidden" name="orderId" value="${gatewayReference}">
          <input type="hidden" name="session" value="${session}">
          <div class="mb-3 text-left">
            <label class="block text-xs font-semibold text-slate-500 mb-1">UPI Phone Number (Linked to GPay / PhonePe)</label>
            <input type="tel" name="payerPhone" value="${order.customerPhone || '9876543210'}" class="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm font-semibold text-slate-800" />
          </div>
          <button type="submit" class="w-full py-3.5 px-4 bg-[#2563eb] hover:bg-[#1d4ed8] text-white font-semibold rounded-xl shadow-md transition flex items-center justify-center gap-2 cursor-pointer">
            <span>Pay ₹${order.total.toFixed(2)} via UPI (Simulate Bank Success)</span>
          </button>
        </form>
      </div>
    </div>
    <div class="p-4 bg-slate-50 border-t border-slate-100 text-center text-xs text-slate-400">
      Secured by Cashfree Payments · RBI Licensed Payment Aggregator
    </div>
  </div>
</body>
</html>`);
  });

  app.post('/api/cashfree-mock/pay', express.urlencoded({ extended: true }), async (req, res) => {
    if (process.env.NODE_ENV === 'production') {
      res.status(404).json({ error: 'Endpoint not available in production' });
      return;
    }
    const gatewayReference = String(req.body.orderId || '');
    const payerPhone = req.body.payerPhone ? String(req.body.payerPhone).replace(/\D/g, '').slice(-10) : '';
    const order = getCafeOrderByGatewayReference(gatewayReference);
    if (upiGateway instanceof CashfreeGateway && order) {
      upiGateway.simulateMockPayment(gatewayReference, 'CF' + Date.now(), payerPhone || undefined);
      const gatewayOrder = await upiGateway.getOrder(gatewayReference);
      if (gatewayOrder) {
        await syncGatewayOrder(order.id, gatewayOrder);
        await store.flushToPersistence();
      }
    }
    res.redirect(`/api/orders/${encodeURIComponent(gatewayReference)}/cashfree-return`);
  });

  app.use((req, res, next) => {
    // 1. HTTPS redirect in production if behind a reverse proxy
    if (isProduction && !req.secure) {
      const publicUrl = process.env.APP_PUBLIC_URL || process.env.APP_URL;
      if (!publicUrl) {
        res.status(503).send('HTTPS public URL is not configured.');
        return;
      }
      return res.redirect(301, `${new URL(publicUrl).origin}${req.originalUrl}`);
    }

    // 2. Strict Transport Security (HSTS) in production
    if (process.env.NODE_ENV === 'production') {
      res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains; preload');
    }

    // 3. Modern Defense-in-Depth Security Headers
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('X-Frame-Options', 'SAMEORIGIN');
    res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
    res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=(self)');

    // 4. Content Security Policy (Enforced in production, Report-Only in dev/test)
    const cspDirectives =
      "default-src 'self'; script-src 'self' 'unsafe-inline' blob: https://cdn.tailwindcss.com https://sdk.cashfree.com https://accounts.google.com; worker-src 'self' blob:; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src 'self' https://fonts.gstatic.com; img-src 'self' data: https: blob:; connect-src 'self' ws: wss: https: https://accounts.google.com https://oauth2.googleapis.com https://play.google.com https://*.supabase.co; frame-src 'self' https://accounts.google.com https://*.google.com https://*.supabase.co; frame-ancestors 'self';";
    if (process.env.NODE_ENV === 'production') {
      res.setHeader('Content-Security-Policy', cspDirectives);
    } else {
      res.setHeader('Content-Security-Policy-Report-Only', cspDirectives);
    }

    // 5. Cross-Origin Resource Sharing (CORS) & Anti-CSRF Origin Validation
    const origin = req.headers.origin;
    if (origin) {
      if (isOriginAllowed(origin)) {
        res.setHeader('Access-Control-Allow-Origin', origin);
        res.setHeader('Access-Control-Allow-Credentials', 'true');
        res.setHeader('Access-Control-Allow-Methods', 'GET,POST,PUT,PATCH,DELETE,OPTIONS');
        res.setHeader('Access-Control-Allow-Headers', 'Content-Type,Authorization,X-Requested-With');
      } else if (!req.path.startsWith('/api/webhooks/')) {
        res.status(403).json({ error: 'Cross-site origin forbidden.' });
        return;
      }
    }

    if (req.method === 'OPTIONS') {
      res.status(204).end();
      return;
    }

    next();
  });

  app.use(express.json({ limit: '15mb' }));
  app.use(express.urlencoded({ extended: true, limit: '15mb' }));
  const uploadsStaticDir = path.resolve(process.cwd(), 'public', 'images', 'uploads');
  if (!fs.existsSync(uploadsStaticDir)) {
    try {
      fs.mkdirSync(uploadsStaticDir, { recursive: true });
    } catch {}
  }
  app.use('/images/uploads', express.static(uploadsStaticDir));
  app.use(noSqlInjectionSanitizer);

  app.use('/api', (req, res, next) => {
    if (req.path === '/health' || store.isPersistenceHealthy()) {
      next();
      return;
    }
    res.status(503).json({ error: 'CafeOS persistence is unavailable; writes are disabled.' });
  });

  app.use('/api', (req, res, next) => {
    if (!['POST', 'PUT', 'PATCH', 'DELETE'].includes(req.method)) {
      next();
      return;
    }
    const actor = getStaffSession(req);
    res.once('finish', () => {
      void store.recordAuditEvent({
        actorRole: actor?.role ?? null,
        actorName: actor?.staffName ?? null,
        method: req.method,
        path: req.path,
        statusCode: res.statusCode,
        createdAt: new Date().toISOString(),
      });
    });
    next();
  });

  const pinLoginLimiter = createRateLimiter({
    windowMs: 60_000,
    maxRequests: 10,
    keyPrefix: 'staff-pin-login',
  });
  const customerFeedbackLimiter = createRateLimiter({
    windowMs: 60_000,
    maxRequests: 5,
    keyPrefix: 'customer-feedback',
  });
  const brevoConfirmationLimiter = createRateLimiter({
    windowMs: 60_000,
    maxRequests: 5,
    keyPrefix: 'brevo-confirmation',
  });
  const tableReservationLimiter = createRateLimiter({
    windowMs: 60_000,
    maxRequests: 10,
    keyPrefix: 'table-reservation',
  });

  // OpenAPI & Swagger UI (restricted to admin in production)
  const docsGuard = (req: Request, res: Response, next: NextFunction) => {
    if (process.env.NODE_ENV !== 'production') {
      next();
      return;
    }
    const auth = checkStaffRoles(req, ['admin']);
    if (!auth.allowed) {
      res.status(auth.httpStatus ?? 401).json({ error: auth.error });
      return;
    }
    next();
  };

  app.get('/api/openapi.json', docsGuard, (_req, res) => {
    res.json(cafeOpenApiSpec);
  });
  app.use('/api/docs', docsGuard, swaggerUi.serve, swaggerUi.setup(cafeOpenApiSpec));

  app.get('/api/health', (_req, res) => {
    const persistence = store.getPersistenceInfo();
    res.status(persistence.healthy ? 200 : 503).json({
      ok: persistence.healthy,
      service: 'seth-sawariya-cafeos',
      primaryDatabase: 'mongodb',
      socketioClients: io.engine.clientsCount,
      updatedAt: store.getBootstrap().updatedAt,
      persistence,
    });
  });

  // Task 10: Standard SRE Liveness and Readiness Probes
  app.get(['/health/live', '/api/health/live'], (_req, res) => {
    res.status(200).json({ status: 'ok', uptime: process.uptime() });
  });

  app.get(['/health/ready', '/api/health/ready'], (_req, res) => {
    const isHealthy = store.isPersistenceHealthy();
    res.status(isHealthy ? 200 : 503).json({
      status: isHealthy ? 'ready' : 'not_ready',
      database: isHealthy ? 'connected' : 'degraded',
    });
  });

  app.get('/api/audit', requireRoles(['admin']), async (req, res, next) => {
    try {
      const requestedLimit = Number(req.query.limit ?? 100);
      if (!Number.isInteger(requestedLimit) || requestedLimit < 1 || requestedLimit > 200) {
        res.status(400).json({ error: 'limit must be an integer between 1 and 200' });
        return;
      }
      res.json({ events: await store.listAuditEvents(requestedLimit) });
    } catch (error) {
      next(error);
    }
  });

  app.get('/api/bootstrap', (req, res) => {
    const staffSession = getStaffSession(req);
    const customerSession = getCustomerSession(req);
    const requestedScreen = req.query.screen;
    if (typeof requestedScreen === 'string') {
      const requestedScope = req.query.scope;
      if (
        !ROUTE_DATA_SCREENS.has(requestedScreen as ScreenId) ||
        (requestedScope !== undefined &&
          requestedScope !== 'main' &&
          requestedScope !== 'kitchen')
      ) {
        res.status(400).json({ error: 'Unknown route data screen' });
        return;
      }
      res.json(
        store.getRouteData(
          { staffSession, customerSession },
          requestedScreen as ScreenId,
          requestedScope === 'kitchen'
        )
      );
      return;
    }
    res.json(store.getBootstrap({ staffSession, customerSession }));
  });

  // Auth endpoints
  app.get('/api/auth/session', (req, res) => {
    const session = getStaffSession(req);
    res.json({
      authenticated: Boolean(session),
      session,
    });
  });

  app.post('/api/customer/google/session', async (req, res, next) => {
    try {
      const credential =
        typeof req.body?.credential === 'string' ? req.body.credential.trim() : '';
      const accessToken =
        typeof req.body?.accessToken === 'string' ? req.body.accessToken.trim() : '';

      if (!credential && !accessToken) {
        // If demo session is requested (e.g. bypass or quick testing):
        if (req.body?.demo) {
          const demoUser = {
            id: 'google:demo-google-user',
            name: (typeof req.body?.name === 'string' && req.body.name.trim()) || 'Google Customer',
            email: (typeof req.body?.email === 'string' && req.body.email.trim()) || 'customer@gmail.com',
            phone: '',
            provider: 'google' as const,
            confirmed: true,
            phoneVerified: false,
            avatarUrl: 'https://lh3.googleusercontent.com/a/default-user',
            createdAt: new Date().toISOString(),
          };
          const customer = store.upsertGoogleCustomer({
            id: demoUser.id,
            name: demoUser.name,
            email: demoUser.email,
            avatarUrl: demoUser.avatarUrl,
            phone: demoUser.phone,
            googleSubjectId: 'demo-google-user',
            emailVerified: true,
            phoneVerified: false,
            createdAt: demoUser.createdAt,
          });
          await store.flushToPersistence();
          emitSync('customer:updated', { customer });
          emitSync('activity:updated', {});
          updateCustomerCrmIdentityCookie(req, res, demoUser.id, customer.id);
          res.json({ session: { ...demoUser, phone: customer.phone } });
          return;
        }
        res.status(400).json({ error: 'Google credential or access token is required.' });
        return;
      }

      const googleClientId = (
        process.env.VITE_GOOGLE_CLIENT_ID ||
        process.env.GOOGLE_CLIENT_ID ||
        ''
      ).trim();

      if (!googleClientId) {
        res.status(503).json({ error: 'Google Sign-In is not configured in .env (VITE_GOOGLE_CLIENT_ID).' });
        return;
      }

      let payload: {
        sub?: string;
        email?: string;
        name?: string;
        picture?: string;
        email_verified?: boolean | string;
      } | null = null;

      let googleExtractedPhone = '';

      if (credential) {
        const googleResponse = await fetch(
          `https://oauth2.googleapis.com/tokeninfo?id_token=${encodeURIComponent(credential)}`
        );
        const tokenPayload = (await googleResponse.json().catch(() => null)) as {
          sub?: string;
          email?: string;
          name?: string;
          picture?: string;
          aud?: string;
          iss?: string;
          exp?: string;
          email_verified?: string | boolean;
        } | null;

        if (
          googleResponse.ok &&
          tokenPayload?.sub &&
          tokenPayload.email &&
          tokenPayload.aud === googleClientId &&
          ['accounts.google.com', 'https://accounts.google.com'].includes(tokenPayload.iss || '') &&
          (!tokenPayload.exp || Number(tokenPayload.exp) * 1000 > Date.now()) &&
          (tokenPayload.email_verified === true || tokenPayload.email_verified === 'true')
        ) {
          payload = tokenPayload;
        }
      } else if (accessToken) {
        // Verify access token via Google userinfo endpoint
        const [googleResponse, peopleResponse] = await Promise.all([
          fetch('https://www.googleapis.com/oauth2/v3/userinfo', {
            headers: { Authorization: `Bearer ${accessToken}` },
          }),
          fetch('https://people.googleapis.com/v1/people/me?personFields=phoneNumbers', {
            headers: { Authorization: `Bearer ${accessToken}` },
          }).catch(() => null),
        ]);

        const userinfoPayload = (await googleResponse.json().catch(() => null)) as {
          sub?: string;
          email?: string;
          name?: string;
          picture?: string;
          email_verified?: boolean;
        } | null;

        if (googleResponse.ok && userinfoPayload?.sub && userinfoPayload.email) {
          payload = userinfoPayload;
        }

        if (peopleResponse && peopleResponse.ok) {
          const peopleData = (await peopleResponse.json().catch(() => null)) as {
            phoneNumbers?: Array<{ value?: string; canonicalForm?: string; type?: string }>;
          } | null;
          const rawPhone =
            peopleData?.phoneNumbers?.[0]?.canonicalForm ||
            peopleData?.phoneNumbers?.[0]?.value ||
            '';
          if (rawPhone) {
            const digits = rawPhone.replace(/\D/g, '');
            googleExtractedPhone = digits.length >= 10 ? digits.slice(-10) : digits;
          }
        }
      }

      if (!payload?.sub || !payload.email) {
        res.status(401).json({ error: 'Google sign-in credential could not be verified.' });
        return;
      }

      const customer = store.upsertGoogleCustomer({
        id: `google:${payload.sub}`,
        name: payload.name || payload.email.split('@')[0] || 'Customer',
        email: payload.email,
        avatarUrl: payload.picture,
        phone: googleExtractedPhone || '',
        googleSubjectId: payload.sub,
        emailVerified:
          payload.email_verified === true || payload.email_verified === 'true',
        phoneVerified: Boolean(googleExtractedPhone),
        createdAt: new Date().toISOString(),
      });
      await store.flushToPersistence();
      emitSync('customer:updated', { customer });
      emitSync('activity:updated', {});

      updateCustomerCrmIdentityCookie(req, res, `google:${payload.sub}`, customer.id);
      res.json({
        session: {
          id: customer.id,
          name: customer.name,
          email: customer.email,
          phone: customer.phone,
          provider: 'google',
          confirmed: true,
          phoneVerified: false,
          avatarUrl: customer.avatarUrl,
          createdAt: new Date().toISOString(),
        },
      });
    } catch (error) {
      next(error);
    }
  });

  app.post('/api/customer/profile', async (req, res, next) => {
    try {
      const { customerId, name, phone, email, note } = parseBody(
        z.object({
          customerId: z.string().trim().min(1).max(64),
          name: z.string().trim().max(120).optional(),
          phone: z.string().trim().max(30).optional(),
          email: z.string().trim().email().max(254).optional(),
          note: z.string().trim().max(500).optional(),
        }),
        req.body
      );
      if (phone !== undefined && !/^\d{10}$/.test(phone.replace(/\D/g, '').replace(/^91(?=\d{10}$)/, ''))) {
        res.status(400).json({ error: 'Customer mobile number must contain exactly 10 digits.' });
        return;
      }
      const staffAuth = checkStaffRoles(req, ['admin']);
      const customerSession = getCustomerSession(req);
      if (!staffAuth.allowed && !customerSession) {
        res.status(staffAuth.httpStatus ?? 401).json({ error: staffAuth.error || 'Authentication required.' });
        return;
      }
      if (
        customerSession &&
        !staffAuth.allowed &&
        customerSession.customerId !== customerId &&
        customerSession.crmCustomerId !== customerId
      ) {
        res.status(403).json({ error: 'You do not have access to this customer profile.' });
        return;
      }
      let customer = store.syncCustomerProfile(customerId, { name, phone, email, note });
      if (!customer) {
        customer = store.upsertGoogleCustomer({
          id: customerId,
          name: name || 'Valued Customer',
          email: email || '',
          phone: phone || '',
        });
      }
      await store.flushToPersistence();
      emitSync('customer:updated', { customer });
      res.json({ customer });
    } catch (error) {
      next(error);
    }
  });

  app.delete('/api/admin/customers/:id', async (req, res, next) => {
    try {
      const deleted = store.deleteCustomer(req.params.id);
      if (!deleted) {
        res.status(404).json({ error: 'Customer not found' });
        return;
      }
      await store.flushToPersistence();
      emitSync('customer:updated', { customerId: req.params.id, deleted: true });
      emitSync('activity:updated', {});
      res.json({ ok: true, deletedId: req.params.id });
    } catch (err) {
      next(err);
    }
  });

  app.delete('/api/admin/customers', async (_req, res, next) => {
    try {
      store.clearCustomers();
      await store.flushToPersistence();
      emitSync('customers:cleared', {});
      emitSync('activity:updated', {});
      res.json({ ok: true, message: 'All customers cleared from CRM' });
    } catch (err) {
      next(err);
    }
  });

  app.post('/api/customer/identity', async (req, res, next) => {
    try {
      const accessToken = req.header('authorization')?.replace(/^Bearer\s+/i, '');
      if (!accessToken) {
        res.status(401).json({ error: 'Supabase customer authentication is required.' });
        return;
      }

      const supabaseUrl = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
      const supabaseAnonKey =
        process.env.SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY;
      if (!supabaseUrl || !supabaseAnonKey) {
        res.status(503).json({ error: 'Supabase identity verification is not configured.' });
        return;
      }

      const supabase = createClient(supabaseUrl, supabaseAnonKey, {
        auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
      });
      const { data, error } = await supabase.auth.getUser(accessToken);
      if (error || !data.user) {
        res.status(401).json({ error: 'Customer session could not be verified.' });
        return;
      }

      if (!data.user.phone || !data.user.phone_confirmed_at) {
        updateCustomerCrmIdentityCookie(req, res, data.user.id);
        res.json({ verified: false, matched: false });
        return;
      }

      const crmCustomerId = store.findCustomerIdByPhone(data.user.phone);
      updateCustomerCrmIdentityCookie(req, res, data.user.id, crmCustomerId || undefined);
      res.json({ verified: true, matched: Boolean(crmCustomerId) });
    } catch (error) {
      next(error);
    }
  });

  app.delete('/api/customer/identity', (req, res) => {
    updateCustomerCrmIdentityCookie(req, res);
    res.status(204).end();
  });

  app.post('/api/auth/pin', pinLoginLimiter, (req, res, next) => {
    try {
      const ip = req.ip || '127.0.0.1';
      const lockout = checkLockout('staff_login', ip);
      if (lockout.locked) {
        res.status(429).json({
          error: `Too many failed login attempts. Account temporarily locked. Please wait ${lockout.retryAfterSeconds} seconds.`,
          retryAfterSeconds: lockout.retryAfterSeconds,
        });
        return;
      }

      const { pin } = parseBody(staffPinLoginSchema, req.body);
      const matched = authenticateStaffPin(pin, undefined, ip);
      if (!matched) {
        res.status(401).json({ error: 'Invalid 4-digit staff PIN' });
        return;
      }

      // Issue 20: Admin 2FA verification
      if (matched.role === 'admin' && isAdmin2FaRequired('admin')) {
        const totpCode = (req.body as { totpCode?: string }).totpCode;
        if (!totpCode) {
          res.status(403).json({ requires2Fa: true, error: 'Two-factor authentication code required for admin.' });
          return;
        }
        const verifyResult = verifyAdmin2Fa('admin', totpCode);
        if (!verifyResult.valid) {
          res.status(401).json({ error: 'Invalid two-factor authentication or backup code.' });
          return;
        }
      }

      const staffId = matched.staffId || `staff_${matched.role}`;
      const payload: StaffSessionPayload = {
        staffId,
        role: matched.role,
        staffName: matched.staffName,
        issuedAt: Date.now(),
        exp: Date.now() + 15 * 60 * 1000, // Issue 8: 15-minute access token lifetime
      };
      setStaffSessionCookie(res, payload);

      // Issue 10: Refresh token rotation with family ID
      const refreshToken = createRefreshToken(staffId, matched.role);
      setStaffRefreshTokenCookie(res, refreshToken.token);

      res.json({ authenticated: true, session: payload });
    } catch (err) {
      next(err);
    }
  });

  // Issue 10: Refresh Token Rotation Endpoint
  app.post('/api/auth/refresh', (req, res) => {
    const cookies = parseCookies(req.headers.cookie);
    const refreshToken = cookies[STAFF_REFRESH_COOKIE];
    if (!refreshToken) {
      res.status(401).json({ error: 'No refresh token provided.' });
      return;
    }

    const result = rotateRefreshToken(refreshToken);
    if (!result.success || !result.newAccessToken || !result.newRefreshToken) {
      clearStaffSessionCookie(res, req);
      res.status(401).json({ error: result.error || 'Invalid or revoked refresh token.' });
      return;
    }

    const session = getStaffSessionFromCookieHeader(`cafeos_staff_session=${result.newAccessToken}`);
    if (session) {
      setStaffSessionCookie(res, session);
    }
    setStaffRefreshTokenCookie(res, result.newRefreshToken);
    res.json({ authenticated: true, session });
  });

  // Issue 11: Server-side Logout
  app.post('/api/auth/logout', (req, res) => {
    clearStaffSessionCookie(res, req);
    res.json({ authenticated: false, session: null });
  });

  // Issues 1, 2, 3, 4: Hardened OTP Request Endpoint
  app.post('/api/auth/otp/request', async (req, res, next) => {
    try {
      const { identifier, name, email, phone } = req.body as {
        identifier?: string;
        name?: string;
        email?: string;
        phone?: string;
      };
      const cleanId = identifier || email || phone;
      if (!cleanId) {
        res.status(400).json({ error: 'Identifier (email or phone) is required.' });
        return;
      }
      const result = await requestOtp({
        identifier: cleanId,
        ip: req.ip || '127.0.0.1',
        name,
        email,
        phone,
      });
      if (!result.success) {
        if (result.unavailable) {
          res.status(503).json({ error: result.message });
          return;
        }
        res.status(429).json({ error: result.message, retryAfterSeconds: result.retryAfterSeconds });
        return;
      }
      // Issue 2 & 4: Generic response; NEVER return the code in response body
      res.json({ success: true, message: result.message });
    } catch (err) {
      next(err);
    }
  });

  // Issue 1 & 3: Hardened OTP Verification Endpoint
  app.post('/api/auth/otp/verify', (req, res) => {
    const b = (req.body || {}) as {
      identifier?: string;
      email?: string;
      phone?: string;
      code?: string;
      otp?: string;
    };
    const identifier = b.identifier || b.email || b.phone;
    const code = b.code || b.otp;
    if (!identifier || !code) {
      res.status(400).json({ error: 'Identifier and 6-digit code are required.' });
      return;
    }
    const result = verifyOtp({
      identifier,
      code,
      ip: req.ip || '127.0.0.1',
    });
    if (!result.valid) {
      res.status(401).json({ error: result.error || 'Verification failed.' });
      return;
    }
    res.json({ verified: true, message: 'OTP verified successfully.' });
  });

  // Issues 13, 14, 16: Password / Credential Reset Flow
  app.post('/api/auth/reset/request', (req, res) => {
    const { identifier } = req.body as { identifier?: string };
    if (!identifier) {
      res.status(400).json({ error: 'Account identifier is required.' });
      return;
    }
    res.status(503).json({ error: 'Password reset delivery is unavailable.' });
  });

  app.post('/api/auth/reset/confirm', (req, res) => {
    const { token } = req.body as { token?: string };
    if (!token) {
      res.status(400).json({ error: 'Reset token is required.' });
      return;
    }
    const result = consumePasswordResetToken(token);
    if (!result.valid) {
      res.status(401).json({ error: result.error || 'Invalid reset token.' });
      return;
    }
    // Revoke current session cookies on reset
    clearStaffSessionCookie(res, req);
    res.json({ success: true, message: 'Password/PIN reset successfully. All existing sessions have been terminated.' });
  });

  // Issue 15: Email Change Re-Authentication & Dual-Notification
  app.post('/api/auth/email-change/request', async (req, res, next) => {
    try {
      const session = getStaffSession(req);
      if (!session) {
        res.status(401).json({ error: 'Authentication required for email change.' });
        return;
      }
      const { newEmail, currentPin } = req.body as { newEmail?: string; currentPin?: string };
      if (!newEmail || !currentPin) {
        res.status(400).json({ error: 'New email and current PIN are required for re-authentication.' });
        return;
      }
      // Re-authentication verification
      const matched = authenticateStaffPin(currentPin);
      if (!matched || matched.role !== session.role) {
        res.status(401).json({ error: 'Re-authentication failed. Incorrect PIN.' });
        return;
      }
      res.status(503).json({ error: 'Email change verification delivery is unavailable.' });
    } catch (err) {
      next(err);
    }
  });

  app.post('/api/auth/email-change/confirm', (req, res) => {
    const { token } = req.body as { token?: string };
    if (!token) {
      res.status(400).json({ error: 'Verification token is required.' });
      return;
    }
    const result = verifyAndApplyEmailChange(token);
    if (!result.valid) {
      res.status(401).json({ error: result.error || 'Invalid or expired email change token.' });
      return;
    }
    clearStaffSessionCookie(res, req);
    res.json({ success: true, message: 'Email address updated. Please log in again.' });
  });

  // Issue 20: Admin 2FA Setup & Verification
  app.post('/api/auth/2fa/setup', (req, res) => {
    const session = getStaffSession(req);
    if (!session || session.role !== 'admin') {
      res.status(403).json({ error: 'Admin authentication required to configure 2FA.' });
      return;
    }
    const setup = setupAdmin2Fa('admin');
    res.json({
      secret: setup.secret,
      otpauthUri: setup.otpauthUri,
      recoveryCodes: setup.plainRecoveryCodes,
    });
  });

  app.post('/api/auth/2fa/confirm', (req, res) => {
    const session = getStaffSession(req);
    if (!session || session.role !== 'admin') {
      res.status(403).json({ error: 'Admin authentication required.' });
      return;
    }
    const { token } = req.body as { token?: string };
    if (!token) {
      res.status(400).json({ error: 'Verification token is required.' });
      return;
    }
    const confirmed = confirmAndEnableAdmin2Fa('admin', token);
    if (!confirmed) {
      res.status(401).json({ error: 'Invalid 2FA token. Setup not confirmed.' });
      return;
    }
    res.json({ success: true, message: 'Admin 2FA enabled successfully.' });
  });

  // Issue 17: OAuth PKCE Challenge & State Cookie
  app.get('/api/auth/oauth/challenge', (req, res) => {
    const redirectUri = (req.query.redirect_uri as string) || 'http://localhost:3000/api/auth/oauth/callback';
    try {
      const challenge = generateOAuthChallenge(redirectUri);
      res.cookie('cafeos_oauth_state', challenge.state, {
        httpOnly: true,
        sameSite: 'lax',
        secure: process.env.NODE_ENV === 'production',
        path: '/api/auth/oauth',
        maxAge: 10 * 60 * 1000,
      });
      res.json({
        state: challenge.state,
        codeChallenge: challenge.codeChallenge,
        codeVerifier: challenge.codeVerifier,
      });
    } catch (err) {
      res.status(400).json({ error: err instanceof Error ? err.message : 'Invalid OAuth request.' });
    }
  });

  // Customer Brevo Email Confirmation endpoint (Issue 2: Never leak OTP in JSON response)
  app.post('/api/auth/brevo-confirmation', brevoConfirmationLimiter, async (req, res, next) => {
    try {
      const captchaCheck = await verifyCaptchaToken((req.body as { captchaToken?: string })?.captchaToken);
      if (!captchaCheck.valid) {
        res.status(403).json({ error: captchaCheck.error || 'CAPTCHA verification failed' });
        return;
      }
      const input = parseBody(brevoConfirmationSchema, req.body);
      const result = await sendBrevoConfirmationEmail({
        toName: input.name,
        toEmail: input.email,
        phone: input.phone,
        verificationCode: input.code,
        appUrl: process.env.APP_PUBLIC_URL || process.env.APP_URL || 'http://localhost:3002',
      });
      if (!result.success) {
        res.status(503).json({ error: result.error || 'Email delivery is unavailable.' });
        return;
      }
      res.json({
        ok: true,
      });
    } catch (err) {
      next(err);
    }
  });

  // Admin Brevo Email Broadcast endpoint (for marketing, announcements & campaigns)
  app.post('/api/admin/broadcast-email', async (req, res, next) => {
    try {
      const auth = checkStaffRoles(req, ['admin']);
      if (!auth.allowed) {
        res.status(auth.httpStatus ?? 401).json({ error: auth.error });
        return;
      }
      const input = parseBody(broadcastEmailSchema, req.body);
      const state = store.getBootstrap();

      let recipients: Array<{ email: string; name: string }> = [];
      if (input.testEmail) {
        recipients = [{ email: input.testEmail, name: 'Admin Test' }];
      } else {
        const target = input.targetSegment;
        recipients = state.customers
          .filter((c) => (target === 'all' || c.segment === target) && Boolean(c.email))
          .map((c) => ({ email: c.email!, name: c.name }));
      }

      const result = await broadcastBrevoMarketingEmail({
        recipients,
        subject: input.subject,
        heading: input.heading,
        message: input.message,
        promoCode: input.promoCode,
        discountBadge: input.discountBadge,
      });
      if (!result.success && result.sentCount === 0) {
        res.status(503).json({ ok: false, error: result.error || 'Email delivery is unavailable.' });
        return;
      }

      res.json({
        ok: result.success,
        totalRecipients: result.totalRecipients,
        sentCount: result.sentCount,
        failedCount: result.failedCount,
        simulated: result.simulated ?? false,
      });
    } catch (err) {
      next(err);
    }
  });

  // Brevo Order Bill / Tax Invoice email delivery
  app.post('/api/orders/:orderId/send-bill-email', async (req, res, next) => {
    try {
      const staffAuth = checkStaffRoles(req, ['admin']);
      const customerSession = getCustomerSession(req);
      if (!staffAuth.allowed && !customerSession) {
        res.status(staffAuth.httpStatus ?? 401).json({ error: staffAuth.error || 'Authentication required.' });
        return;
      }
      if (
        customerSession &&
        !staffAuth.allowed &&
        !canCustomerAccessOrder(customerSession, req.params.orderId)
      ) {
        res.status(403).json({ error: 'You do not have access to this order.' });
        return;
      }
      const order = store.getOrder(req.params.orderId);
      if (!order) {
        res.status(404).json({ error: `Order "${req.params.orderId}" not found.` });
        return;
      }
      const input = parseBody(sendBillEmailSchema, req.body);
      const state = store.getBootstrap();

      const result = await sendBrevoOrderBillEmail({
        order,
        toEmail: input.email,
        toName: input.name || order.customerName,
        cafeSettings: state.cafeSettings,
        appUrl: process.env.APP_PUBLIC_URL || process.env.APP_URL || 'http://localhost:3002',
      });

      if (!result.success) {
        res.status(503).json({ error: result.error || 'Email delivery is unavailable.' });
        return;
      }

      const updated = store.markOrderPaidEmailSent(order.id, input.email);
      await store.flushToPersistence();
      if (updated) {
        emitSync('order:updated', { order: updated });
      }

      res.json({
        ok: true,
        orderId: order.id,
      });
    } catch (err) {
      next(err);
    }
  });

  // Orders & KDS
  const tableOrderLimiter = createTableRateLimiter({
    windowMs: 60_000,
    maxRequests: 10,
  });

  app.get(
    '/api/orders',
    requireRoles(['admin', 'kitchen']),
    (req, res) => {
      const staffSession = getStaffSession(req);
      const orders =
        staffSession?.role === 'kitchen'
          ? store.getBootstrap({ staffSession, customerSession: null }).orders
          : store.getOrders();
      res.json({ orders });
    }
  );

  app.post('/api/orders', tableOrderLimiter, async (req, res, next) => {
    try {
      const headerIdempotencyKey =
        typeof req.headers['idempotency-key'] === 'string'
          ? req.headers['idempotency-key'].trim()
          : typeof req.headers['x-idempotency-key'] === 'string'
          ? req.headers['x-idempotency-key'].trim()
          : undefined;
      const rawBody =
        typeof req.body === 'object' && req.body !== null
          ? {
              ...req.body,
              idempotencyKey:
                (req.body as { idempotencyKey?: string }).idempotencyKey ||
                headerIdempotencyKey,
            }
          : req.body;
      const input = parseBody(createOrderSchema, rawBody);
      const staffSession = getStaffSession(req);
      if (input.isPosTerminal && !staffSession) {
        res.status(401).json({ error: 'Staff PIN authentication required for POS orders' });
        return;
      }
      if (input.isPosTerminal && !hasStaffRole(staffSession, ['admin'])) {
        res.status(403).json({ error: 'Your role cannot create POS terminal orders' });
        return;
      }

      const customerSession = staffSession ? null : getCustomerSession(req);
      const customerId = staffSession
        ? input.customerId
        : customerSession?.customerId || `guest_${crypto.randomUUID()}`;
      const orderInput = staffSession ? input : { ...input, customerId };
      const crmCustomerId = staffSession
        ? input.customerId
        : customerSession?.crmCustomerId;
      const result = await store.createOrder(
        orderInput,
        store.getCustomerSegment(crmCustomerId),
        crmCustomerId,
        customerSession?.orderIds,
        !staffSession && Boolean(customerSession?.customerId)
      );
      if (!staffSession && result.duplicate && result.order.customerId !== customerId) {
        res.status(403).json({ error: 'This idempotency key belongs to another customer order' });
        return;
      }
      if (!staffSession) {
        issueOrUpdateCustomerSessionCookie(req, res, result.order.id, customerId);
      }
      if (!result.duplicate) {
        emitSync('order:created', {
          order: result.order,
          rewardPoints: result.rewardPoints,
        });
        emitSync('order:new', {
          order: result.order,
        });
        if (result.tableUpdated) {
          emitSync('table:updated', { table: result.tableUpdated });
        }
        emitSync('inventory:updated', { inventory: store.getInventory() });
        if (result.order.paymentStatus === 'paid') {
          void triggerOrderPaidEmailIfEligible(result.order.id);
        }
      }
      res.status(result.duplicate ? 200 : 201).json(result);
    } catch (err) {
      next(err);
    }
  });

  app.post('/api/orders/:id/payment-session', async (req, res, next) => {
    try {
      const orderId = String(req.params.id);
      const order = getAccessibleOrder(req, res, orderId);
      if (!order) return;
      if (!upiGateway.isConfigured()) {
        res.status(503).json({ error: 'UPI gateway is not configured on the CafeOS server.' });
        return;
      }
      if (order.paymentStatus === 'paid') {
        res.status(409).json({ error: 'This order is already paid.' });
        return;
      }
      if (
        order.paymentProvider === 'upi-gateway' &&
        ['expired', 'failed', 'manual_review'].includes(String(order.paymentStatus))
      ) {
        res.status(409).json({
          error: 'This gateway payment attempt is closed. Please create a new order.',
        });
        return;
      }

      const amountPaise = Math.round(order.total * 100);
      if (amountPaise < 100 || amountPaise > 10_000_000) {
        res.status(400).json({ error: 'UPI checkout supports orders from ₹1 to ₹100,000.' });
        return;
      }

      const isLegacyGatewayOrder =
        order.paymentProvider === 'upi-gateway' &&
        Boolean(order.gatewayOrderId) &&
        !order.gatewayClientOrderId;
      const clientOrderId = isLegacyGatewayOrder
        ? order.id
        : store.getOrCreateGatewayClientOrderId(order.id);
      if (!clientOrderId) {
        res.status(404).json({ error: 'Order not found' });
        return;
      }
      if (!isLegacyGatewayOrder) {
        await store.flushToPersistence();
      }

      let gatewayOrder = await upiGateway.getOrder(clientOrderId);
      if (!gatewayOrder) {
        try {
          gatewayOrder = await upiGateway.createOrder({
            clientOrderId,
            amountPaise,
            note: `CafeOS ${order.id}`,
            customerName: order.customerName,
            customerPhone: order.customerPhone,
          });
        } catch (error) {
          if (!(error instanceof UpiGatewayRequestError) || error.statusCode !== 422) {
            throw error;
          }
          gatewayOrder = await upiGateway.getOrder(clientOrderId);
          if (!gatewayOrder) throw error;
        }
      }

      const updatedOrder = await syncGatewayOrder(order.id, gatewayOrder);
      if (!updatedOrder) {
        res.status(404).json({ error: 'Order not found' });
        return;
      }
      await store.flushToPersistence();
      if (updatedOrder.paymentStatus === 'paid') {
        res.json({ paymentStatus: 'paid' });
        return;
      }
      if (updatedOrder.paymentStatus !== 'pending') {
        res.status(409).json({
          error: 'This gateway payment is no longer pending. Please check the order status.',
          paymentStatus: updatedOrder.paymentStatus,
        });
        return;
      }

      res.json({
        checkoutUrl: gatewayOrder.paymentUrl,
        paymentId: gatewayOrder.orderId,
        paymentStatus: updatedOrder.paymentStatus,
      });
    } catch (error) {
      if (error instanceof UpiGatewayRequestError) {
        const statusCode =
          error.statusCode === 400 ? 400 : error.statusCode === 422 ? 409 : 502;
        res.status(statusCode).json({ error: error.message });
        return;
      }
      next(error);
    }
  });

  app.get('/api/orders/:id/payment-status', async (req, res, next) => {
    try {
      const orderId = String(req.params.id);
      const order = getAccessibleOrder(req, res, orderId);
      if (!order) return;
      if (order.paymentProvider !== 'upi-gateway' || !order.gatewayOrderId) {
        res.json({ paymentStatus: order.paymentStatus ?? null });
        return;
      }
      if (!upiGateway.isConfigured()) {
        res.status(503).json({ error: 'UPI gateway is not configured on the CafeOS server.' });
        return;
      }

      const gatewayOrder = await upiGateway.getOrder(getGatewayClientOrderId(order));
      if (!gatewayOrder) {
        res.status(502).json({ error: 'The UPI gateway no longer has this payment order.' });
        return;
      }
      const updatedOrder = await syncGatewayOrder(order.id, gatewayOrder);
      if (!updatedOrder) {
        res.status(404).json({ error: 'Order not found' });
        return;
      }
      await store.flushToPersistence();
      res.json({ paymentStatus: updatedOrder.paymentStatus });
    } catch (error) {
      if (error instanceof UpiGatewayRequestError) {
        res.status(502).json({ error: error.message });
        return;
      }
      next(error);
    }
  });

  app.post(
    '/api/orders/:id/pay-counter',
    requireRoles(['admin']),
    async (req, res, next) => {
      try {
        const orderId = String(req.params.id);
        const input = parseBody(orderPayCounterSchema, req.body || {});
        const staffSession = getStaffSession(req);
        const order = store.markOrderPaidAtCounter(
          orderId,
          staffSession?.staffName,
          input.paymentMode
        );
        if (!order) {
          res.status(404).json({ error: 'Order not found' });
          return;
        }
        await store.flushToPersistence();
        emitSync('order:updated', { order });
        void triggerOrderPaidEmailIfEligible(order.id);
        res.status(200).json({ ok: true, order });
      } catch (err) {
        next(err);
      }
    }
  );

  app.post(
    '/api/orders/:id/refund',
    requireRoles(['admin']),
    async (req, res, next) => {
      try {
        const orderId = String(req.params.id);
        const input = parseBody(orderRefundSchema, req.body || {});
        const staffSession = getStaffSession(req);
        const order = store.refundOrder(
          orderId,
          input.reason,
          staffSession?.staffName,
          staffSession?.role
        );
        if (!order) {
          res.status(404).json({ error: 'Order not found' });
          return;
        }
        await store.flushToPersistence();
        emitSync('order:updated', { order });
        emitSync('order:refunded', { order });
        res.status(200).json({ ok: true, order });
      } catch (err) {
        next(err);
      }
    }
  );

  app.post(
    '/api/orders/:id/cancel-item',
    requireRoles(['admin', 'kitchen']),
    async (req, res, next) => {
      try {
        const orderId = String(req.params.id);
        const input = parseBody(cancelOrderItemSchema, req.body || {});
        const staffSession = getStaffSession(req);
        const result = store.cancelOrderItemAndRefund(
          orderId,
          input.menuItemId,
          input.quantity,
          input.reason,
          staffSession?.staffName,
          staffSession?.role
        );
        if (!result) {
          res.status(404).json({ error: 'Order not found' });
          return;
        }
        await store.flushToPersistence();
        emitSync('order:updated', { order: result.order });
        emitSync('order:item-cancelled', {
          order: result.order,
          refundAmount: result.refundAmount,
          cancelledItem: result.cancelledItem,
        });
        res.status(200).json({
          ok: true,
          order: result.order,
          refundAmount: result.refundAmount,
          cancelledItem: result.cancelledItem,
          message: `Cancelled ${result.cancelledItem.name} and initiated ₹${result.refundAmount} refund`,
        });
      } catch (err) {
        next(err);
      }
    }
  );

  app.get('/api/activity-log', requireRoles(['admin']), (_req, res) => {
    res.json({ ok: true, activities: store.getActivityLog() });
  });

  app.get('/api/orders/:id', (req, res) => {
    const order = getAccessibleOrder(req, res, String(req.params.id));
    if (order) {
      res.json({ order });
    }
  });

  app.post(
    ['/api/orders/:id/status', '/api/orders/:id/transition'],
    requireRoles(['admin', 'kitchen']),
    async (req, res, next) => {
      try {
        const orderId = String(req.params.id);
        const { status } = req.body || {};
        if (!status) {
          res.status(400).json({ error: 'Status is required' });
          return;
        }
        const staffSession = getStaffSession(req);
        const updateResult = store.updateOrderStatus(
          orderId,
          status,
          staffSession?.staffName || 'Staff',
          staffSession?.role || 'admin'
        );
        if (!updateResult) {
          res.status(404).json({ error: 'Order not found' });
          return;
        }

        const { order, lowStockAlerts } = updateResult;
        emitSync('order:updated', { order });
        if (lowStockAlerts.length > 0) {
          emitSync('stock:low', { items: lowStockAlerts });
          emitSync('inventory:updated', { inventory: store.getInventory() });
        }
        if (order.paymentStatus === 'paid') {
          void triggerOrderPaidEmailIfEligible(order.id);
        }
        await store.flushToPersistence();
        res.status(200).json({ ok: true, order, lowStockAlerts });
      } catch (err) {
        next(err);
      }
    }
  );

  app.patch(
    '/api/orders/:id/status',
    requireRoles(['admin', 'kitchen']),
    async (req, res, next) => {
      try {
        const orderId = String(req.params.id);
        const { status } = req.body || {};
        if (!status) {
          res.status(400).json({ error: 'Status is required' });
          return;
        }
        const staffSession = getStaffSession(req);
        const updateResult = store.updateOrderStatus(
          orderId,
          status,
          staffSession?.staffName || 'Staff',
          staffSession?.role || 'admin'
        );
        if (!updateResult) {
          res.status(404).json({ error: 'Order not found' });
          return;
        }

        const { order, lowStockAlerts } = updateResult;
        emitSync('order:updated', { order });
        if (lowStockAlerts.length > 0) {
          emitSync('stock:low', { items: lowStockAlerts });
          emitSync('inventory:updated', { inventory: store.getInventory() });
        }
        if (order.paymentStatus === 'paid') {
          void triggerOrderPaidEmailIfEligible(order.id);
        }
        await store.flushToPersistence();
        res.status(200).json({ ok: true, order, lowStockAlerts });
      } catch (err) {
        next(err);
      }
    }
  );

  app.post(
    '/api/orders/:id/advance',
    requireRoles(['admin', 'kitchen']),
    async (req, res, next) => {
      try {
        const updated = store.advanceOrderStatus(String(req.params.id));
        if (!updated) {
          res.status(404).json({ error: 'Order not found' });
          return;
        }
        emitSync('order:updated', { order: updated });
        emitSync('inventory:updated', { inventory: store.getInventory() });
        emitSync('activity:updated', {});
        if (updated.paymentStatus === 'paid') {
          void triggerOrderPaidEmailIfEligible(updated.id);
        }
        await store.flushToPersistence();
        res.json({ order: updated });
      } catch (err) {
        next(err);
      }
    }
  );

  app.post(
    '/api/orders/:id/toggle-item',
    requireRoles(['admin', 'kitchen']),
    (req, res, next) => {
      try {
        const { menuItemId } = parseBody(toggleKotItemSchema, req.body);
        const updated = store.toggleKotItem(String(req.params.id), menuItemId);
        if (!updated) {
          res.status(404).json({ error: 'Order not found' });
          return;
        }
        emitSync('order:updated', { order: updated });
        emitSync('activity:updated', {});
        res.json({ order: updated });
      } catch (err) {
        next(err);
      }
    }
  );

  app.post('/api/orders/:id/feedback', customerFeedbackLimiter, async (req, res, next) => {
    try {
      const orderId = String(req.params.id);
      const existingOrder = store.getOrder(orderId);
      if (!existingOrder) {
        res.status(404).json({ error: 'Order not found' });
        return;
      }

      const staffSession = getStaffSession(req);
      const customerSession = getCustomerSession(req);
      if (staffSession) {
        if (!hasStaffRole(staffSession, ['admin'])) {
          res.status(403).json({ error: 'Your role cannot submit order feedback.' });
          return;
        }
      } else if (customerSession) {
        if (!canCustomerAccessOrder(customerSession, orderId)) {
          res.status(403).json({ error: 'You do not have permission to leave feedback for this order.' });
          return;
        }
      } else {
        const phone = typeof req.body?.customerPhone === 'string' ? req.body.customerPhone.trim() : '';
        if (existingOrder.customerId && !phone) {
          res.status(401).json({ error: 'Customer session or phone verification required to leave feedback for this order.' });
          return;
        }
      }

      const input = parseBody(orderFeedbackSchema, req.body);
      const result = store.recordOrderFeedback(orderId, input);
      if (!result) {
        res.status(404).json({ error: 'Order not found' });
        return;
      }
      await store.flushToPersistence();
      emitSync('order:feedback-received', {
        orderId,
        order: result.order,
        pointsAwarded: result.pointsAwarded,
      });
      res.status(200).json({ ok: true, order: result.order, pointsAwarded: result.pointsAwarded });
    } catch (err) {
      next(err);
    }
  });

  app.post('/api/customer-feedback', customerFeedbackLimiter, async (req, res, next) => {
    try {
      const input = parseBody(customerFeedbackSchema, req.body);
      const review = store.recordCustomerFeedback(input);
      await store.flushToPersistence();
      emitSync('activity:updated', {});
      res.status(201).json({ ok: true, review });
    } catch (err) {
      next(err);
    }
  });

  app.post('/api/ai/vishal', async (req, res, next) => {
    try {
      const message = typeof req.body?.message === 'string' ? req.body.message.trim() : '';
      const mode = req.body?.mode === 'staff' ? 'staff' : 'customer';
      const state = store.getBootstrap();
      const menu = state.menuItems || [];
      const orders = state.orders || [];
      const settings = state.cafeSettings;

      // Check if Gemini API is available
      const geminiApiKey = process.env.GEMINI_API_KEY;
      if (geminiApiKey && message) {
        try {
          const { GoogleGenAI } = await import('@google/genai');
          const ai = new GoogleGenAI({ apiKey: geminiApiKey });
          const systemInstruction = `You are Vishal, the AI Assistant & Cafe Operations Copilot for "The Sawariya Cafe" (TSC), a premium pure-vegetarian cafe in Jaipur.
Current mode: ${mode}.
Cafe Name: ${settings?.cafeName || 'The Sawariya Cafe'}
Tagline: Good Food • Good Mood
Total Menu items: ${menu.length}. Available: ${menu.filter((m) => m.isAvailable !== false).map((m) => `${m.name} (₹${m.price})`).join(', ')}.
Total orders today: ${orders.length}.
Special offers: Birthday Party celebration for ₹800 (1.5 hrs), Buy 5 get 1 free Cold Coffee, Free ice cream for Google review + Instagram follow, Free delivery under 1km on orders > ₹249.
Wi-Fi: Airtel_The sawariya cafe / Password: Sawariya@1177. Phone: 01414611071, WhatsApp: 7300348070.
Tone: Warm, helpful, polite, and energetic. Reply in friendly Hinglish or Hindi. Keep answers concise, appetizing, and actionable.`;

          const response = await ai.models.generateContent({
            model: 'gemini-2.5-flash',
            contents: message,
            config: {
              systemInstruction,
              temperature: 0.7,
            },
          });

          const replyText = response.text || '';
          if (replyText) {
            res.json({
              ok: true,
              text: replyText,
              provider: 'gemini',
              mode,
            });
            return;
          }
        } catch (geminiError) {
          console.warn('[Vishal AI] Gemini call fallback to local engine:', geminiError);
        }
      }

      // Local intelligence fallback
      const activeKitchen = (orders || []).filter((o) => ['order_received', 'preparing'].includes(o.status));
      const today = new Date().toDateString();
      const todayOrders = (orders || []).filter((o) => o?.createdAt && new Date(o.createdAt).toDateString() === today);
      const todayRevenue = todayOrders
        .filter((o) => o.paymentStatus === 'paid')
        .reduce((sum, o) => sum + (o.total || 0), 0);

      if (mode === 'staff') {
        res.json({
          ok: true,
          provider: 'local',
          mode: 'staff',
          text: `👨‍🍳 Vishal Cafe Copilot Report:\n• Active Cooking KOTs: ${activeKitchen.length}\n• Today's Total Sales: ₹${todayRevenue.toLocaleString('en-IN')} across ${todayOrders.length} orders.\n• Menu Items Available: ${(menu || []).filter((m) => m.isAvailable !== false).length}/${menu.length}`,
          insights: [
            { label: 'Active KOT', value: activeKitchen.length },
            { label: "Today's Sales", value: `₹${todayRevenue}` },
          ],
        });
        return;
      }

      res.json({
        ok: true,
        provider: 'local',
        mode: 'customer',
        text: `Namaste! Main Vishal hoon, The Sawariya Cafe ka AI Assistant. Aap mujhse delicious food recommendations, special offers, order status ya Wi-Fi details pooch sakte hain!`,
      });
    } catch (err) {
      console.error('[Vishal AI Error]:', err);
      next(err);
    }
  });

  app.post(
    '/api/menu/:id/toggle-availability',
    requireRoles(['admin', 'kitchen']),
    async (req, res, next) => {
      try {
        const item = store.toggleMenuItemAvailability(String(req.params.id));
        if (!item) {
          res.status(404).json({ error: 'Menu item not found' });
          return;
        }
        await store.flushToPersistence();
        emitSync('menu:availability-toggled', { item });
        res.status(200).json({ ok: true, item });
      } catch (err) {
        next(err);
      }
    }
  );

  app.post(
    '/api/menu/items',
    requireRoles(['admin']),
    async (req, res, next) => {
      try {
        const input = parseBody(addMenuItemSchema, req.body);
        const item = store.addMenuItem(input);
        await store.flushToPersistence();
        emitSync('menu:item-created', { item });
        emitSync('menu:availability-toggled', { item });
        res.status(201).json({ ok: true, item });
      } catch (err) {
        next(err);
      }
    }
  );

  app.put(
    '/api/menu/items/:id',
    requireRoles(['admin']),
    async (req, res, next) => {
      try {
        const input = parseBody(updateMenuItemSchema, req.body);
        const item = store.updateMenuItem(String(req.params.id), input);
        if (!item) {
          res.status(404).json({ error: 'Menu item not found' });
          return;
        }
        await store.flushToPersistence();
        emitSync('menu:item-updated', { item });
        emitSync('menu:availability-toggled', { item });
        res.status(200).json({ ok: true, item });
      } catch (err) {
        next(err);
      }
    }
  );

  app.post(
    '/api/menu/upload-image',
    requireRoles(['admin']),
    async (req, res, next) => {
      try {
        const { data, fileName } = req.body as { data?: string; fileName?: string };
        if (!data || typeof data !== 'string' || data.length < 10) {
          res.status(400).json({ error: 'Valid image data is required' });
          return;
        }

        let base64Content = data;
        let ext = 'jpg';
        if (data.startsWith('data:image/')) {
          const match = data.match(/^data:image\/([a-zA-Z0-9+.-]+);base64,/);
          if (match) {
            ext = match[1].toLowerCase() === 'jpeg' ? 'jpg' : match[1].toLowerCase();
            base64Content = data.slice(match[0].length);
          }
        } else if (fileName && fileName.includes('.')) {
          const rawExt = fileName.split('.').pop()?.toLowerCase();
          if (rawExt && ['jpg', 'jpeg', 'png', 'webp', 'svg'].includes(rawExt)) {
            ext = rawExt === 'jpeg' ? 'jpg' : rawExt;
          }
        }

        const safeExt = ['jpg', 'png', 'webp', 'svg'].includes(ext) ? ext : 'jpg';
        const uploadsDir = path.resolve(process.cwd(), 'public', 'images', 'uploads');
        if (!fs.existsSync(uploadsDir)) {
          fs.mkdirSync(uploadsDir, { recursive: true });
        }

        const uniqueFileName = `product-${Date.now()}-${crypto.randomBytes(4).toString('hex')}.${safeExt}`;
        const filePath = path.join(uploadsDir, uniqueFileName);
        fs.writeFileSync(filePath, Buffer.from(base64Content, 'base64'));
        const imageUrl = `/images/uploads/${uniqueFileName}`;
        res.status(200).json({ ok: true, imageUrl });
      } catch (err) {
        next(err);
      }
    }
  );

  // Tables
  app.post('/api/tables/reserve', tableReservationLimiter, async (req, res, next) => {
    try {
      const captchaCheck = await verifyCaptchaToken((req.body as { captchaToken?: string })?.captchaToken);
      if (!captchaCheck.valid) {
        res.status(403).json({ error: captchaCheck.error || 'CAPTCHA verification failed' });
        return;
      }
      const input = parseBody(reserveTableSchema, req.body);
      const outcome = store.reserveTable(input);
      if (outcome.notFound) {
        res.status(404).json({ error: 'Requested table not found' });
        return;
      }
      emitSync('table:updated', { table: outcome.table });
      res.status(201).json({ table: outcome.table });
    } catch (err) {
      next(err);
    }
  });

  app.post('/api/tables', requireRoles(['admin']), (req, res, next) => {
    try {
      const input = parseBody(addTableSchema, req.body);
      const outcome = store.addTable(input);
      if (outcome.conflict) {
        res.status(409).json({ error: `Table ${input.id} already exists on floor plan` });
        return;
      }
      emitSync('table:updated', { table: outcome.table });
      res.status(201).json({ table: outcome.table });
    } catch (err) {
      next(err);
    }
  });

  app.post(
    '/api/tables/:id/check-in',
    requireRoles(['admin']),
    (req, res, next) => {
      try {
        const updated = store.checkInTable(String(req.params.id));
        if (!updated) {
          res.status(404).json({ error: 'Table not found' });
          return;
        }
        emitSync('table:updated', { table: updated });
        res.json({ table: updated });
      } catch (err) {
        next(err);
      }
    }
  );

  app.post(
    '/api/tables/transfer',
    requireRoles(['admin']),
    (req, res, next) => {
      try {
        const { sourceTableId, targetTableId } = parseBody(tableTransferMergeSchema, req.body);
        const ok = store.transferTable(sourceTableId, targetTableId);
        if (!ok) {
          res.status(400).json({ error: 'Select two different valid tables' });
          return;
        }
        emitSync('table:updated', { sourceTableId, targetTableId, action: 'transfer' });
        res.json({ ok: true });
      } catch (err) {
        next(err);
      }
    }
  );

  app.post(
    '/api/tables/merge',
    requireRoles(['admin']),
    (req, res, next) => {
      try {
        const { sourceTableId, targetTableId } = parseBody(tableTransferMergeSchema, req.body);
        const ok = store.mergeTables(sourceTableId, targetTableId);
        if (!ok) {
          res.status(400).json({ error: 'Select two different valid tables' });
          return;
        }
        emitSync('table:updated', { sourceTableId, targetTableId, action: 'merge' });
        res.json({ ok: true });
      } catch (err) {
        next(err);
      }
    }
  );

  // Inventory
  app.post(
    '/api/inventory',
    requireRoles(['admin']),
    (req, res, next) => {
      try {
        const input = parseBody(addIngredientSchema, req.body);
        const item = store.addIngredient(input);
        emitSync('inventory:updated', { item });
        res.status(201).json({ item });
      } catch (err) {
        next(err);
      }
    }
  );

  app.post(
    '/api/inventory/:id/restock',
    requireRoles(['admin', 'kitchen']),
    (req, res, next) => {
      try {
        const { addedQty, unitCost } = parseBody(restockIngredientSchema, req.body ?? {});
        const staff = getStaffSession(req);
        const item = store.restockIngredient(
          String(req.params.id),
          addedQty,
          unitCost,
          staff?.staffName
        );
        if (!item) {
          res.status(404).json({ error: 'Ingredient not found' });
          return;
        }
        emitSync('inventory:updated', { item });
        res.json({ item });
      } catch (err) {
        next(err);
      }
    }
  );

  app.post(
    '/api/inventory/receive',
    requireRoles(['admin']),
    (req, res, next) => {
      try {
        const input = parseBody(stockReceiptSchema, req.body);
        const staff = getStaffSession(req);
        const item = store.receiveStock(input, staff?.staffName);
        if (!item) {
          res.status(404).json({ error: 'Ingredient not found' });
          return;
        }
        emitSync('inventory:updated', { inventory: store.getInventory() });
        emitSync('activity:updated', {});
        res.status(201).json({ item });
      } catch (err) {
        next(err);
      }
    }
  );

  app.post(
    '/api/inventory/waste',
    requireRoles(['admin', 'kitchen']),
    (req, res, next) => {
      try {
        const input = parseBody(stockWasteSchema, req.body);
        const staff = getStaffSession(req);
        const item = store.recordWaste(input, staff?.staffName);
        if (!item) {
          res.status(404).json({ error: 'Ingredient not found' });
          return;
        }
        emitSync('inventory:updated', { inventory: store.getInventory() });
        emitSync('activity:updated', {});
        res.status(201).json({ item });
      } catch (err) {
        next(err);
      }
    }
  );

  app.post(
    '/api/inventory/transfer',
    requireRoles(['admin', 'kitchen']),
    (req, res, next) => {
      try {
        const input = parseBody(stockTransferSchema, req.body);
        const staff = getStaffSession(req);
        const item = store.transferStock(input, staff?.staffName);
        if (!item) {
          res.status(404).json({ error: 'Ingredient not found' });
          return;
        }
        emitSync('inventory:updated', { inventory: store.getInventory() });
        emitSync('activity:updated', {});
        res.status(201).json({ item });
      } catch (err) {
        next(err);
      }
    }
  );

  app.post(
    '/api/inventory/count',
    requireRoles(['admin']),
    (req, res, next) => {
      try {
        const input = parseBody(stockCountSchema, req.body);
        const count = store.createStockCount(input, getStaffSession(req)?.staffName);
        emitSync('inventory:updated', { inventory: store.getInventory() });
        res.status(201).json({ count });
      } catch (err) {
        next(err);
      }
    }
  );

  app.post(
    '/api/inventory/count/:id/approve',
    requireRoles(['admin']),
    (req, res, next) => {
      try {
        const count = store.approveStockCount(
          String(req.params.id),
          getStaffSession(req)?.staffName
        );
        if (!count) {
          res.status(404).json({ error: 'Stock count not found' });
          return;
        }
        emitSync('inventory:updated', { inventory: store.getInventory() });
        emitSync('activity:updated', {});
        res.json({ count });
      } catch (err) {
        next(err);
      }
    }
  );

  app.post(
    '/api/inventory/purchase-orders',
    requireRoles(['admin']),
    (req, res, next) => {
      try {
        const input = parseBody(purchaseOrderSchema, req.body);
        const purchaseOrder = store.createPurchaseOrder(
          input,
          getStaffSession(req)?.staffName
        );
        emitSync('activity:updated', {});
        res.status(201).json({ purchaseOrder });
      } catch (err) {
        next(err);
      }
    }
  );

  app.post(
    '/api/inventory/purchase-orders/receive',
    requireRoles(['admin']),
    (req, res, next) => {
      try {
        const input = parseBody(receivePurchaseOrderSchema, req.body);
        const purchaseOrder = store.receivePurchaseOrder(
          input,
          getStaffSession(req)?.staffName
        );
        if (!purchaseOrder) {
          res.status(404).json({ error: 'Purchase order not found' });
          return;
        }
        emitSync('inventory:updated', { inventory: store.getInventory() });
        emitSync('activity:updated', {});
        res.json({ purchaseOrder });
      } catch (err) {
        next(err);
      }
    }
  );

  app.post(
    '/api/inventory/request-reorder',
    requireRoles(['admin', 'kitchen']),
    (req, res, next) => {
      try {
        const { id, note } = parseBody(requestReorderSchema, req.body);
        const staff = getStaffSession(req);
        const item = store.requestIngredientReorder(id, note, staff?.staffName);
        if (!item) {
          res.status(404).json({ error: 'Ingredient not found' });
          return;
        }
        emitSync('inventory:updated', { item });
        emitSync('activity:updated', {});
        res.json({ ok: true, item });
      } catch (err) {
        next(err);
      }
    }
  );

  // CRM & DPDP export
  app.post(
    '/api/customers',
    requireRoles(['admin']),
    (req, res, next) => {
      try {
        const input = parseBody(addCustomerSchema, req.body);
        const customer = store.addCustomer(input);
        emitSync('customer:updated', { customer });
        res.status(201).json({ customer });
      } catch (err) {
        next(err);
      }
    }
  );

  app.get('/api/customers/:id/export', (req, res) => {
    const customerId = String(req.params.id);
    const auth = checkCustomerAccess(req, customerId);
    if (!auth.allowed) {
      res.status(auth.httpStatus ?? 401).json({ error: auth.error });
      return;
    }
    const exported = store.exportCustomerPii(customerId);
    if (!exported) {
      res.status(404).json({ error: 'Customer not found' });
      return;
    }
    res.json(exported);
  });

  // DPDP Act 2023: Right to Data Portability (Current Authenticated Customer)
  app.get('/api/customer/export', (req, res) => {
    const customer = getCustomerSession(req);
    if (!customer || !customer.customerId) {
      res.status(401).json({ error: 'Customer authentication required to export personal data' });
      return;
    }
    const exported = store.exportCustomerPii(customer.customerId);
    if (!exported) {
      res.status(404).json({ error: 'Customer record not found' });
      return;
    }
    res.json(exported);
  });

  // DPDP Act 2023: Right to Erasure / Account Deletion (Self-Service)
  app.delete('/api/customer/account', async (req, res, next) => {
    try {
      const customerSession = getCustomerSession(req);
      if (!customerSession || !customerSession.customerId) {
        res.status(401).json({ error: 'Customer authentication required to delete account' });
        return;
      }
      const customerId = customerSession.customerId;
      const deleted = store.deleteCustomer(customerId);
      await store.flushToPersistence();
      clearCustomerSessionCookie(res);
      emitSync('customer:updated', { customerId, deleted: true });
      emitSync('activity:updated', {});
      res.json({
        ok: true,
        deleted,
        message: 'Account and personal CRM data erased under Section 12 of the DPDP Act 2023.',
      });
    } catch (err) {
      next(err);
    }
  });

  // DPDP Act 2023: Delete Customer by ID (Admin or Verified Customer)
  app.delete('/api/customers/:id', async (req, res, next) => {
    try {
      const customerId = String(req.params.id);
      const auth = checkCustomerAccess(req, customerId);
      if (!auth.allowed) {
        res.status(auth.httpStatus ?? 401).json({ error: auth.error });
        return;
      }
      const deleted = store.deleteCustomer(customerId);
      await store.flushToPersistence();
      const customerSession = getCustomerSession(req);
      if (customerSession?.customerId === customerId) {
        clearCustomerSessionCookie(res);
      }
      emitSync('customer:updated', { customerId, deleted: true });
      emitSync('activity:updated', {});
      res.json({
        ok: true,
        deleted,
        message: 'Customer record erased in compliance with DPDP Act 2023.',
      });
    } catch (err) {
      next(err);
    }
  });

  // Loyalty
  app.post('/api/loyalty/rules', requireRoles(['admin']), (req, res, next) => {
    try {
      const input = parseBody(addLoyaltyRuleSchema, req.body);
      const rule = store.addLoyaltyRule(input);
      emitSync('loyalty:updated', { rule });
      res.status(201).json({ rule });
    } catch (err) {
      next(err);
    }
  });

  // Campaigns
  app.post('/api/campaigns', requireRoles(['admin']), (req, res, next) => {
    try {
      const input = parseBody(createCampaignSchema, req.body);
      const campaign = store.createCampaign(input);
      emitSync('campaign:updated', { campaign });
      res.status(201).json({ campaign });
    } catch (err) {
      next(err);
    }
  });

  app.post('/api/campaigns/:id/toggle', requireRoles(['admin']), (req, res, next) => {
    try {
      const event =
        req.body && typeof (req.body as { event?: unknown }).event === 'string'
          ? ((req.body as { event: string }).event as 'toggle' | 'pause' | 'activate' | 'expire')
          : 'toggle';
      const campaign = store.toggleCampaignStatus(String(req.params.id), event);
      if (!campaign) {
        res.status(404).json({ error: 'Campaign not found' });
        return;
      }
      emitSync('campaign:updated', { campaign });
      res.json({ campaign });
    } catch (err) {
      next(err);
    }
  });

  // Staff management is restricted to Admin.
  app.post('/api/staff', requireRoles(['admin']), (req, res, next) => {
    try {
      const input = parseBody(addStaffSchema, req.body);
      const member = store.addStaff(input);
      emitSync('staff:updated', { member });
      res.status(201).json({ member });
    } catch (err) {
      next(err);
    }
  });

  app.post('/api/staff/:id/toggle-duty', requireRoles(['admin']), (req, res) => {
    const member = store.toggleStaffDuty(String(req.params.id));
    if (!member) {
      res.status(404).json({ error: 'Staff member not found' });
      return;
    }
    emitSync('staff:updated', { member });
    res.json({ member });
  });

  // Settings are admin-only; never bypass PIN authentication.
  app.put('/api/settings', requireRoles(['admin']), (req, res, next) => {
    try {
      const input = parseBody(cafeSettingsSchema, req.body);
      const settings = store.saveSettings(input);
      emitSync('settings:updated', { settings });
      res.json({ settings });
    } catch (err) {
      next(err);
    }
  });

  app.post('/api/settings/reset', requireRoles(['admin']), (_req, res) => {
    const settings = store.resetSettings();
    emitSync('settings:updated', { settings });
    res.json({ settings });
  });

  // Explicit JSON 404 for unknown /api/* paths so SPA fallback never returns HTML
  app.all('/api/*', (_req, res) => {
    res.status(404).json({ error: 'API endpoint not found' });
  });

  // Central Zod + domain state transition + error handler
  app.use((err: unknown, _req: Request, res: Response, _next: NextFunction) => {
    if (
      err instanceof SyntaxError &&
      'status' in err &&
      (err as { status?: number }).status === 400
    ) {
      res.status(400).json({ error: 'Malformed JSON payload in request body' });
      return;
    }
    if (err instanceof z.ZodError) {
      const firstIssue = err.issues[0];
      const fieldPath = firstIssue?.path.length ? `[${firstIssue.path.join('.')}] ` : '';
      const message = firstIssue?.message || 'Invalid request payload';
      res.status(400).json({
        error: `${fieldPath}${message}`.trim(),
      });
      return;
    }
    if (err instanceof InvalidDomainTransitionError) {
      res.status(err.httpStatus).json({
        error: err.message,
        domain: err.domain,
        fromState: err.fromState,
        toState: err.toState,
        action: err.action,
      });
      return;
    }
    console.error(
      '[CafeOS] Request failed:',
      err instanceof Error ? `${err.name}: ${err.message}\n${err.stack}` : 'unknown error'
    );
    res.status(500).json({ error: 'An unexpected internal error occurred. Please try again later.' });
  });

  return { app, httpServer, io, store };
}
