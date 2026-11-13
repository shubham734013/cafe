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
  createCampaignSchema,
  createOrderSchema,
  reserveTableSchema,
  restockIngredientSchema,
  settleOrderPaymentSchema,
  staffPinLoginSchema,
  tableTransferMergeSchema,
  toggleKotItemSchema,
} from '../shared/schemas';
import {
  assertAuthSecretConfigured,
  authenticateStaffPin,
  canCustomerAccessCustomer,
  canCustomerAccessOrder,
  clearStaffSessionCookie,
  getCustomerSession,
  getStaffSession,
  getStaffSessionFromCookieHeader,
  hasStaffRole,
  issueOrUpdateCustomerSessionCookie,
  setStaffSessionCookie,
} from './auth';
import { createRateLimiter } from '../payments/rateLimit';
import { type AuthCheckResult, createYoupiPaymentRouter } from '../payments/router';
import { YoupiPaymentService } from '../payments/paymentService';
import { InvalidStateTransitionError } from '../payments/stateMachine';
import type { YoupiGatewayClient } from '../payments/types';
import { GatewayRequestError, createYoupiGatewayFromEnv } from '../payments/youpiClient';
import { InvalidDomainTransitionError } from '../state/cafeStateMachines';
import type { StaffRole } from '../types/cafe';
import { cafeOpenApiSpec } from './openapi';
import { CafeStore } from './store';

export interface CafeServerBundle {
  app: Express;
  httpServer: http.Server;
  io: SocketIOServer;
  store: CafeStore;
  paymentService: YoupiPaymentService;
}

export interface CreateCafeServerOptions {
  gateway?: YoupiGatewayClient;
  webhookSecret?: string;
  confirmOnObserver?: boolean;
  enableReconciliationJob?: boolean;
}

function parseBody<T extends z.ZodTypeAny>(schema: T, body: unknown): z.infer<T> {
  return schema.parse(body);
}

const ROLE_LABELS: Record<StaffRole, string> = {
  owner: 'Owner',
  manager: 'Manager',
  cashier: 'Cashier',
  barista: 'Barista',
  server: 'Server / Steward',
};

export function createCafeServer(
  store = new CafeStore(),
  options: CreateCafeServerOptions = {}
): CafeServerBundle {
  assertAuthSecretConfigured();

  const app = express();
  const httpServer = http.createServer(app);
  const io = new SocketIOServer(httpServer, {
    cors: { origin: true, credentials: true },
  });

  const STAFF_ROOM = 'outlet:seth-sawariya-main:staff';
  const PUBLIC_ROOM = 'outlet:seth-sawariya-main:public';

  io.on('connection', (socket) => {
    const cookieHeader = socket.handshake.headers.cookie;
    const staffSession = getStaffSessionFromCookieHeader(cookieHeader);
    if (staffSession) {
      void socket.join(STAFF_ROOM);
    } else {
      void socket.join(PUBLIC_ROOM);
    }

    // Reject unverified arbitrary room joins from clients
    socket.on('outlet:join', () => {
      const currentStaff = getStaffSessionFromCookieHeader(socket.handshake.headers.cookie);
      if (currentStaff) {
        void socket.join(STAFF_ROOM);
      } else {
        void socket.join(PUBLIC_ROOM);
      }
    });
  });

  const emitSync = (event: string, payload?: unknown) => {
    io.to(STAFF_ROOM).emit(event, payload ?? { ts: Date.now() });
    io.to(STAFF_ROOM).emit('cafe:sync', { event, ts: Date.now() });
    // Public clients receive minimal non-PII invalidation pulse only
    io.to(PUBLIC_ROOM).emit('cafe:sync', { event, ts: Date.now() });
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

  const checkOrderAccess = (req: Request, orderId: string): AuthCheckResult => {
    const staff = getStaffSession(req);
    if (staff) return { allowed: true };
    const customer = getCustomerSession(req);
    if (!customer) {
      return {
        allowed: false,
        httpStatus: 401,
        error: 'Authentication or active order session required',
      };
    }
    if (!canCustomerAccessOrder(customer, orderId)) {
      return {
        allowed: false,
        httpStatus: 403,
        error: 'You do not have permission to access this order',
      };
    }
    return { allowed: true };
  };

  const checkCustomerAccess = (req: Request, customerId: string): AuthCheckResult => {
    const staff = getStaffSession(req);
    if (staff) {
      if (hasStaffRole(staff, ['owner', 'manager', 'cashier'])) {
        return { allowed: true };
      }
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

  const paymentService = new YoupiPaymentService({
    gateway: options.gateway ?? createYoupiGatewayFromEnv(),
    persistence: store.createYoupiPersistenceAdapter(),
    webhookSecret: options.webhookSecret,
    confirmOnObserver: options.confirmOnObserver,
    resolvePayeeConfig: () => {
      const settings = store.getBootstrap().cafeSettings;
      return {
        payeeVpa: settings.upiVpa,
        payeeName: settings.upiPayeeName || settings.cafeName,
      };
    },
    onPaymentUpdated: (payment) => {
      emitSync('payment:updated', { payment });
    },
  });

  // Mount YouPI-PG router BEFORE global express.json() so /api/webhooks/youpi preserves raw bytes
  app.use(
    '/api',
    createYoupiPaymentRouter({
      paymentService,
      authorizeStaffRoles: checkStaffRoles,
      authorizeOrderAccess: checkOrderAccess,
      authorizeCustomerAccess: checkCustomerAccess,
    })
  );

  if (options.enableReconciliationJob !== false) {
    const reconcileTimer = setInterval(() => {
      void paymentService.reconcileStuckPendingPayments();
    }, 45_000);
    reconcileTimer.unref();
    httpServer.on('close', () => clearInterval(reconcileTimer));
  }

  app.use(express.json({ limit: '1mb' }));

  const pinLoginLimiter = createRateLimiter({
    windowMs: 60_000,
    maxRequests: 10,
    keyPrefix: 'staff-pin-login',
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
    res.json({
      ok: true,
      service: 'seth-sawariya-cafeos',
      socketioClients: io.engine.clientsCount,
      updatedAt: store.getBootstrap().updatedAt,
    });
  });

  app.get('/api/bootstrap', (req, res) => {
    const staffSession = getStaffSession(req);
    const customerSession = getCustomerSession(req);
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
  app.get('/api/orders', requireRoles(['owner', 'manager', 'cashier', 'barista', 'server']), (_req, res) => {
    res.json({ orders: store.getOrders() });
  });

  app.post('/api/orders', (req, res, next) => {
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

      const result = store.createOrder(input);
      if (!staffSession && !result.duplicate) {
        issueOrUpdateCustomerSessionCookie(req, res, result.order.id, result.order.customerId);
      }
      if (!result.duplicate) {
        emitSync('order:created', {
          order: result.order,
          rewardPoints: result.rewardPoints,
        });
      }
      res.status(result.duplicate ? 200 : 201).json(result);
    } catch (err) {
      next(err);
    }
  });

  app.post(
    '/api/orders/:id/advance',
    requireRoles(['owner', 'manager', 'barista', 'cashier']),
    (req, res, next) => {
      try {
        const updated = store.advanceOrderStatus(String(req.params.id));
        if (!updated) {
          res.status(404).json({ error: 'Order not found' });
          return;
        }
        emitSync('order:updated', { order: updated });
        res.json({ order: updated });
      } catch (err) {
        next(err);
      }
    }
  );

  app.post(
    '/api/orders/:id/toggle-item',
    requireRoles(['owner', 'manager', 'barista', 'cashier']),
    (req, res, next) => {
      try {
        const { menuItemId } = parseBody(toggleKotItemSchema, req.body);
        const updated = store.toggleKotItem(String(req.params.id), menuItemId);
        if (!updated) {
          res.status(404).json({ error: 'Order not found' });
          return;
        }
        emitSync('order:updated', { order: updated });
        res.json({ order: updated });
      } catch (err) {
        next(err);
      }
    }
  );

  app.post(
    '/api/orders/:id/settle-payment',
    requireRoles(['owner', 'manager', 'cashier']),
    (req, res, next) => {
      try {
        const input = parseBody(settleOrderPaymentSchema, req.body ?? {});
        if (input.action === 'refund' && !hasStaffRole(getStaffSession(req), ['owner', 'manager'])) {
          res.status(403).json({ error: 'Only Owner or Manager can issue order refunds' });
          return;
        }
        const updated = store.settleOrderPayment(String(req.params.id), input);
        if (!updated) {
          res.status(404).json({ error: 'Order not found' });
          return;
        }
        emitSync('order:updated', { order: updated });
        res.json({ order: updated });
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
    requireRoles(['owner', 'manager', 'barista', 'cashier']),
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
    requireRoles(['owner', 'manager', 'barista', 'cashier']),
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

  // Staff
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

  // Settings (Owner & Manager only; NEVER bypass auth via managerPinRequired)
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
    if (err instanceof InvalidStateTransitionError) {
      res.status(409).json({
        error: err.message,
        fromStatus: err.fromStatus,
        toStatus: err.toStatus,
      });
      return;
    }
    if (err instanceof GatewayRequestError) {
      res.status(err.httpStatus).json({
        error: err.userMessage,
        code: err.code,
        retryable: err.retryable,
      });
      return;
    }
    const message = err instanceof Error ? err.message : 'Internal server error';
    res.status(500).json({ error: message });
  });

  return { app, httpServer, io, store, paymentService };
}
