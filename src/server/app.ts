import crypto from 'node:crypto';
import http from 'node:http';
import express, { type Express, type NextFunction, type Request, type Response } from 'express';
import { Server as SocketIOServer } from 'socket.io';
import swaggerUi from 'swagger-ui-express';
import { z } from 'zod';
import {
  addCustomerSchema,
  addIngredientSchema,
  addLoyaltyRuleSchema,
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
  requestReorderSchema,
} from '../shared/schemas';
import {
  assertAuthSecretConfigured,
  authenticateStaffPin,
  canCustomerAccessCustomer,
  canCustomerAccessOrder,
  clearStaffSessionCookie,
  getCustomerSession,
  getCustomerSessionFromCookieHeader,
  getStaffSession,
  getStaffSessionFromCookieHeader,
  hasStaffRole,
  issueOrUpdateCustomerSessionCookie,
  setStaffSessionCookie,
} from './auth';
import { createRateLimiter, createTableRateLimiter } from './rateLimit';
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
  'super-admin': 'Super Admin',
  owner: 'Manager / Owner',
  manager: 'Manager / Owner',
  cashier: 'Cashier',
  barista: 'Barista',
  kitchen: 'Kitchen / Barista',
  server: 'Server / Steward',
  waiter: 'Server / Steward',
};

const ROUTE_DATA_SCREENS = new Set<ScreenId>([
  'splash',
  'home',
  'menu',
  'cart',
  'tracking',
  'rewards',
  'profile',
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
  const httpServer = http.createServer(app);
  const allowedOrigins = process.env.CORS_ORIGIN
    ? process.env.CORS_ORIGIN.split(',').map((s) => s.trim())
    : [
        'http://localhost:3000',
        'http://localhost:3002',
        'http://127.0.0.1:3000',
        'http://127.0.0.1:3002',
        'http://localhost:5173',
      ];

  const io = new SocketIOServer(httpServer, {
    cors: {
      origin: (requestOrigin, callback) => {
        if (!requestOrigin) return callback(null, true);
        if (
          process.env.NODE_ENV !== 'production' ||
          allowedOrigins.includes(requestOrigin) ||
          /^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(requestOrigin)
        ) {
          return callback(null, requestOrigin);
        }
        return callback(new Error(`CORS origin not allowed: ${requestOrigin}`), false);
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
      void socket.join(STAFF_ROOM);
      if (['kitchen', 'barista', 'owner', 'manager'].includes(staffSession.role)) {
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
        void socket.join(STAFF_ROOM);
        if (['kitchen', 'barista', 'owner', 'manager'].includes(currentStaff.role)) {
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
      event.startsWith('stock:')
    ) {
      io.to(KITCHEN_ROOM).emit(event, data);
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
    if (event === 'menu:item-availability' || event === 'cafe:sync') {
      io.to(PUBLIC_ROOM).emit(event, { ts: Date.now() });
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
      if (hasStaffRole(staff, ['owner', 'manager', 'cashier'])) return { allowed: true };
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
      if (!hasStaffRole(staffSession, ['owner', 'manager', 'cashier', 'server'])) {
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

  const assertGatewayOrderMatchesCafeOrder = (
    gatewayOrder: UpiGatewayOrder,
    order: NonNullable<ReturnType<CafeStore['getOrder']>>
  ) => {
    if (
      gatewayOrder.clientOrderId !== order.id ||
      gatewayOrder.amountPaise !== Math.round(order.total * 100)
    ) {
      throw new UpiGatewayRequestError(
        'The UPI gateway order does not match the CafeOS order amount or reference.'
      );
    }
  };

  const syncGatewayOrder = async (orderId: string, gatewayOrder: UpiGatewayOrder) => {
    const order = store.getOrder(orderId);
    if (!order) return null;
    assertGatewayOrderMatchesCafeOrder(gatewayOrder, order);
    const updated = store.attachGatewayPayment(
      orderId,
      gatewayOrder.orderId,
      mapGatewayStatus(gatewayOrder.status),
      gatewayOrder.utr
    );
    if (updated) emitSync('order:updated', { order: updated });
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

      const orderId = payload.data.client_order_id;
      if (!store.getOrder(orderId)) {
        res.status(404).json({ error: 'CafeOS order not found for this gateway event.' });
        return;
      }
      if (!store.isPersistenceHealthy()) {
        res.status(503).json({ error: 'CafeOS persistence is unavailable; retry the webhook.' });
        return;
      }

      try {
        const gatewayOrder = await upiGateway.getOrder(orderId);
        if (!gatewayOrder) {
          res.status(404).json({ error: 'UPI gateway order not found; retry the webhook.' });
          return;
        }
        const updated = await syncGatewayOrder(orderId, gatewayOrder);
        if (!updated) {
          res.status(404).json({ error: 'CafeOS order no longer exists.' });
          return;
        }
        await store.flushToPersistence();
        res.status(200).json({ received: true });
      } catch (error) {
        console.error(
          '[CafeOS] Could not verify UPI gateway webhook against gateway status:',
          error instanceof Error ? error.message : 'Gateway verification failed'
        );
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
      const existingOrder = orderId ? store.getOrder(orderId) : null;
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
          store.attachGatewayPayment(orderId, orderId, 'paid', utr);
          await store.flushToPersistence();
          const updated = store.getOrder(orderId);
          if (updated) {
            emitSync('order:updated', { order: updated });
          }
        } else {
          const gatewayOrder = await upiGateway.getOrder(orderId);
          if (gatewayOrder) {
            await syncGatewayOrder(orderId, gatewayOrder);
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
    const orderId = String(req.params.id);
    const session = String(req.query.session || '');
    const mode = String(req.query.mode || (process.env.CASHFREE_ENVIRONMENT === 'PRODUCTION' ? 'production' : 'sandbox'));
    const order = store.getOrder(orderId);
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
        <a href="/tracking?orderId=${encodeURIComponent(order.id)}" class="px-3 py-1.5 bg-slate-700 hover:bg-slate-600 rounded text-slate-200 text-xs inline-block">Go to Order Tracking</a>
      </div>
    </div>
  </div>

  <script>
    (function() {
      const session = ${JSON.stringify(session)};
      const mode = ${JSON.stringify(mode)};
      const orderId = ${JSON.stringify(order.id)};

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
    const orderId = String(req.params.id);
    const order = store.getOrder(orderId);
    if (!order) {
      res.redirect('/tracking');
      return;
    }
    try {
      const gatewayOrder = await upiGateway.getOrder(orderId);
      if (gatewayOrder) {
        await syncGatewayOrder(orderId, gatewayOrder);
        await store.flushToPersistence();
      }
    } catch {
      // Continue to tracking
    }
    res.redirect(`/tracking?orderId=${encodeURIComponent(orderId)}`);
  });

  // Cashfree Mock Checkout (for local development & instant testing)
  app.get('/api/cashfree-mock/checkout', (req, res) => {
    const orderId = String(req.query.orderId || '');
    const session = String(req.query.session || '');
    const order = store.getOrder(orderId);
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
          <input type="hidden" name="orderId" value="${order.id}">
          <input type="hidden" name="session" value="${session}">
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
    const orderId = String(req.body.orderId || '');
    if (upiGateway instanceof CashfreeGateway) {
      upiGateway.simulateMockPayment(orderId, 'CF' + Date.now());
      const gatewayOrder = await upiGateway.getOrder(orderId);
      if (gatewayOrder) {
        await syncGatewayOrder(orderId, gatewayOrder);
        await store.flushToPersistence();
      }
    }
    res.redirect(`/api/orders/${encodeURIComponent(orderId)}/cashfree-return`);
  });

  app.use(express.json({ limit: '1mb' }));

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

  // OpenAPI & Swagger UI (restricted to owner/manager in production)
  const docsGuard = (req: Request, res: Response, next: NextFunction) => {
    if (process.env.NODE_ENV !== 'production') {
      next();
      return;
    }
    const auth = checkStaffRoles(req, ['owner', 'manager']);
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

  app.get('/api/audit', requireRoles(['owner', 'manager']), async (req, res, next) => {
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

  app.post('/api/auth/pin', pinLoginLimiter, (req, res, next) => {
    try {
      const { pin } = parseBody(staffPinLoginSchema, req.body);
      const matched = authenticateStaffPin(pin);
      if (!matched) {
        res.status(401).json({ error: 'Invalid 4-digit staff PIN' });
        return;
      }
      const payload = {
        role: matched.role,
        staffName: matched.staffName,
        issuedAt: Date.now(),
        exp: Date.now() + 12 * 60 * 60 * 1000,
      };
      setStaffSessionCookie(res, payload);
      res.json({ authenticated: true, session: payload });
    } catch (err) {
      next(err);
    }
  });

  app.post('/api/auth/logout', (_req, res) => {
    clearStaffSessionCookie(res);
    res.json({ authenticated: false, session: null });
  });

  // Orders & KDS
  const tableOrderLimiter = createTableRateLimiter({
    windowMs: 60_000,
    maxRequests: 10,
  });

  app.get(
    '/api/orders',
    requireRoles(['owner', 'manager', 'cashier', 'barista', 'server', 'kitchen', 'waiter']),
    (req, res) => {
      const staffSession = getStaffSession(req);
      const orders =
        staffSession?.role === 'barista' || (staffSession?.role as string) === 'kitchen'
          ? store.getBootstrap({ staffSession, customerSession: null }).orders
          : store.getOrders();
      res.json({ orders });
    }
  );

  app.post('/api/orders', tableOrderLimiter, async (req, res, next) => {
    try {
      const input = parseBody(createOrderSchema, req.body);
      const staffSession = getStaffSession(req);
      if (input.isPosTerminal && !staffSession) {
        res.status(401).json({ error: 'Staff PIN authentication required for POS orders' });
        return;
      }
      if (input.isPosTerminal && !hasStaffRole(staffSession, ['owner', 'manager', 'cashier', 'server'])) {
        res.status(403).json({ error: 'Your role cannot create POS terminal orders' });
        return;
      }

      const customerSession = staffSession ? null : getCustomerSession(req);
      const customerId = staffSession
        ? input.customerId
        : customerSession?.customerId || `guest_${crypto.randomUUID()}`;
      const orderInput = staffSession ? input : { ...input, customerId };
      const result = await store.createOrder(orderInput);
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

      let gatewayOrder = await upiGateway.getOrder(order.id);
      if (!gatewayOrder) {
        try {
          gatewayOrder = await upiGateway.createOrder({
            clientOrderId: order.id,
            amountPaise,
            note: `CafeOS ${order.id}`,
          });
        } catch (error) {
          if (!(error instanceof UpiGatewayRequestError) || error.statusCode !== 422) {
            throw error;
          }
          gatewayOrder = await upiGateway.getOrder(order.id);
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

      const gatewayOrder = await upiGateway.getOrder(order.id);
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
    requireRoles(['owner', 'manager', 'cashier', 'server']),
    async (req, res, next) => {
      try {
        const orderId = String(req.params.id);
        const staffSession = getStaffSession(req);
        const order = store.markOrderPaidAtCounter(orderId, staffSession?.staffName);
        if (!order) {
          res.status(404).json({ error: 'Order not found' });
          return;
        }
        await store.flushToPersistence();
        emitSync('order:updated', { order });
        res.status(200).json({ ok: true, order });
      } catch (err) {
        next(err);
      }
    }
  );

  app.post(
    '/api/orders/:id/refund',
    requireRoles(['owner', 'manager']),
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

  app.get('/api/activity-log', requireRoles(['owner', 'manager']), (_req, res) => {
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
    requireRoles(['owner', 'manager', 'barista', 'kitchen', 'cashier', 'server', 'waiter']),
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
          staffSession?.role || 'manager'
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
        await store.flushToPersistence();
        res.status(200).json({ ok: true, order, lowStockAlerts });
      } catch (err) {
        next(err);
      }
    }
  );

  app.patch(
    '/api/orders/:id/status',
    requireRoles(['owner', 'manager', 'barista', 'kitchen', 'cashier', 'server', 'waiter']),
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
          staffSession?.role || 'manager'
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
        await store.flushToPersistence();
        res.status(200).json({ ok: true, order, lowStockAlerts });
      } catch (err) {
        next(err);
      }
    }
  );

  app.post(
    '/api/orders/:id/advance',
    requireRoles(['owner', 'manager', 'barista', 'kitchen', 'cashier', 'server', 'waiter']),
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
        await store.flushToPersistence();
        res.json({ order: updated });
      } catch (err) {
        next(err);
      }
    }
  );

  app.post(
    '/api/orders/:id/toggle-item',
    requireRoles(['owner', 'manager', 'barista', 'kitchen', 'cashier', 'server', 'waiter']),
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

  app.post('/api/orders/:id/feedback', async (req, res, next) => {
    try {
      const input = parseBody(orderFeedbackSchema, req.body);
      const result = store.recordOrderFeedback(String(req.params.id), input);
      if (!result) {
        res.status(404).json({ error: 'Order not found' });
        return;
      }
      await store.flushToPersistence();
      emitSync('order:feedback-received', {
        orderId: String(req.params.id),
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
      store.recordCustomerFeedback(input);
      await store.flushToPersistence();
      emitSync('activity:updated', {});
      res.status(201).json({ ok: true });
    } catch (err) {
      next(err);
    }
  });

  app.post(
    '/api/menu/:id/toggle-availability',
    requireRoles(['owner', 'manager', 'barista', 'kitchen', 'cashier']),
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

  // Tables
  app.post('/api/tables/reserve', (req, res, next) => {
    try {
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

  app.post('/api/tables', requireRoles(['owner', 'manager']), (req, res, next) => {
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
    requireRoles(['owner', 'manager', 'server', 'cashier']),
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
    requireRoles(['owner', 'manager', 'server', 'cashier']),
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
    requireRoles(['owner', 'manager', 'server', 'cashier']),
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
    requireRoles(['owner', 'manager', 'cashier']),
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
    requireRoles(['owner', 'manager', 'cashier', 'barista', 'kitchen']),
    (req, res, next) => {
      try {
        const { addedQty } = parseBody(restockIngredientSchema, req.body ?? {});
        const item = store.restockIngredient(String(req.params.id), addedQty);
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
    '/api/inventory/request-reorder',
    requireRoles(['owner', 'manager', 'cashier', 'barista', 'kitchen', 'server', 'waiter']),
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
    requireRoles(['owner', 'manager', 'cashier']),
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

  // Loyalty
  app.post('/api/loyalty/rules', requireRoles(['owner', 'manager']), (req, res, next) => {
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
  app.post('/api/campaigns', requireRoles(['owner', 'manager']), (req, res, next) => {
    try {
      const input = parseBody(createCampaignSchema, req.body);
      const campaign = store.createCampaign(input);
      emitSync('campaign:updated', { campaign });
      res.status(201).json({ campaign });
    } catch (err) {
      next(err);
    }
  });

  app.post('/api/campaigns/:id/toggle', requireRoles(['owner', 'manager']), (req, res, next) => {
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

  // Staff management is restricted to Manager / Owner and Super Admin.
  app.post('/api/staff', requireRoles(['owner', 'manager']), (req, res, next) => {
    try {
      const input = parseBody(addStaffSchema, req.body);
      const member = store.addStaff(input);
      emitSync('staff:updated', { member });
      res.status(201).json({ member });
    } catch (err) {
      next(err);
    }
  });

  app.post('/api/staff/:id/toggle-duty', requireRoles(['owner', 'manager']), (req, res) => {
    const member = store.toggleStaffDuty(String(req.params.id));
    if (!member) {
      res.status(404).json({ error: 'Staff member not found' });
      return;
    }
    emitSync('staff:updated', { member });
    res.json({ member });
  });

  // Settings (Manager / Owner and Super Admin only; never bypass auth via managerPinRequired)
  app.put('/api/settings', requireRoles(['owner', 'manager']), (req, res, next) => {
    try {
      const input = parseBody(cafeSettingsSchema, req.body);
      const settings = store.saveSettings(input);
      emitSync('settings:updated', { settings });
      res.json({ settings });
    } catch (err) {
      next(err);
    }
  });

  app.post('/api/settings/reset', requireRoles(['owner', 'manager']), (_req, res) => {
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
    if (err instanceof z.ZodError) {
      res.status(400).json({
        error: err.issues[0]?.message || 'Invalid request payload',
        issues: err.issues,
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
    const message = err instanceof Error ? err.message : 'Internal server error';
    res.status(500).json({ error: message });
  });

  return { app, httpServer, io, store };
}
