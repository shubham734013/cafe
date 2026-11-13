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
  restockIngredientSchema,
  staffPinLoginSchema,
  tableTransferMergeSchema,
  toggleKotItemSchema,
} from '../shared/schemas';
import {
  clearStaffSessionCookie,
  getStaffSession,
  setStaffSessionCookie,
  verifyStaffPin,
} from './auth';
import { cafeOpenApiSpec } from './openapi';
import { CafeStore } from './store';

export interface CafeServerBundle {
  app: Express;
  httpServer: http.Server;
  io: SocketIOServer;
  store: CafeStore;
}

function parseBody<T extends z.ZodTypeAny>(schema: T, body: unknown): z.infer<T> {
  return schema.parse(body);
}

export function createCafeServer(store = new CafeStore()): CafeServerBundle {
  const app = express();
  const httpServer = http.createServer(app);
  const io = new SocketIOServer(httpServer, {
    cors: { origin: true, credentials: true },
  });

  const OUTLET_ROOM = 'outlet:seth-sawariya-main';

  io.on('connection', (socket) => {
    const requestedOutlet =
      typeof socket.handshake.query.outletId === 'string' && socket.handshake.query.outletId
        ? `outlet:${socket.handshake.query.outletId}`
        : OUTLET_ROOM;
    void socket.join(requestedOutlet);

    socket.on('outlet:join', (outletId: string) => {
      if (typeof outletId === 'string' && outletId.trim()) {
        void socket.join(`outlet:${outletId.trim()}`);
      }
    });
  });

  const emitSync = (event: string, payload?: unknown) => {
    io.to(OUTLET_ROOM).emit(event, payload ?? { ts: Date.now() });
    io.to(OUTLET_ROOM).emit('cafe:sync', { event, ts: Date.now() });
  };

  app.use(express.json({ limit: '1mb' }));

  // OpenAPI & Swagger UI
  app.get('/api/openapi.json', (_req, res) => {
    res.json(cafeOpenApiSpec);
  });
  app.use('/api/docs', swaggerUi.serve, swaggerUi.setup(cafeOpenApiSpec));

  app.get('/api/health', (_req, res) => {
    res.json({
      ok: true,
      service: 'seth-sawariya-cafeos',
      socketioClients: io.engine.clientsCount,
      updatedAt: store.getBootstrap().updatedAt,
    });
  });

  app.get('/api/bootstrap', (_req, res) => {
    res.json(store.getBootstrap());
  });

  // Auth endpoints
  app.get('/api/auth/session', (req, res) => {
    const session = getStaffSession(req);
    res.json({
      authenticated: Boolean(session),
      session,
    });
  });

  app.post('/api/auth/pin', (req, res, next) => {
    try {
      const { pin } = parseBody(staffPinLoginSchema, req.body);
      if (!verifyStaffPin(pin)) {
        res.status(401).json({ error: 'Invalid 4-digit staff PIN' });
        return;
      }
      const payload = {
        role: 'manager' as const,
        staffName: 'Seth Sawariya Manager',
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
    res.json({ authenticated: false });
  });

  // Orders & KDS
  app.get('/api/orders', (_req, res) => {
    res.json({ orders: store.getOrders() });
  });

  app.post('/api/orders', (req, res, next) => {
    try {
      const input = parseBody(createOrderSchema, req.body);
      const result = store.createOrder(input);
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

  app.post('/api/orders/:id/advance', (req, res) => {
    const updated = store.advanceOrderStatus(req.params.id);
    if (!updated) {
      res.status(404).json({ error: 'Order not found' });
      return;
    }
    emitSync('order:updated', { order: updated });
    res.json({ order: updated });
  });

  app.post('/api/orders/:id/toggle-item', (req, res, next) => {
    try {
      const { menuItemId } = parseBody(toggleKotItemSchema, req.body);
      const updated = store.toggleKotItem(req.params.id, menuItemId);
      if (!updated) {
        res.status(404).json({ error: 'Order not found' });
        return;
      }
      emitSync('order:updated', { order: updated });
      res.json({ order: updated });
    } catch (err) {
      next(err);
    }
  });

  // Tables
  app.post('/api/tables', (req, res, next) => {
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

  app.post('/api/tables/:id/check-in', (req, res) => {
    const updated = store.checkInTable(req.params.id);
    if (!updated) {
      res.status(404).json({ error: 'Table not found' });
      return;
    }
    emitSync('table:updated', { table: updated });
    res.json({ table: updated });
  });

  app.post('/api/tables/transfer', (req, res, next) => {
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
  });

  app.post('/api/tables/merge', (req, res, next) => {
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
  });

  // Inventory
  app.post('/api/inventory', (req, res, next) => {
    try {
      const input = parseBody(addIngredientSchema, req.body);
      const item = store.addIngredient(input);
      emitSync('inventory:updated', { item });
      res.status(201).json({ item });
    } catch (err) {
      next(err);
    }
  });

  app.post('/api/inventory/:id/restock', (req, res, next) => {
    try {
      const { addedQty } = parseBody(restockIngredientSchema, req.body ?? {});
      const item = store.restockIngredient(req.params.id, addedQty);
      if (!item) {
        res.status(404).json({ error: 'Ingredient not found' });
        return;
      }
      emitSync('inventory:updated', { item });
      res.json({ item });
    } catch (err) {
      next(err);
    }
  });

  // CRM & DPDP export
  app.post('/api/customers', (req, res, next) => {
    try {
      const input = parseBody(addCustomerSchema, req.body);
      const customer = store.addCustomer(input);
      emitSync('customer:updated', { customer });
      res.status(201).json({ customer });
    } catch (err) {
      next(err);
    }
  });

  app.get('/api/customers/:id/export', (req, res) => {
    const exported = store.exportCustomerPii(req.params.id);
    if (!exported) {
      res.status(404).json({ error: 'Customer not found' });
      return;
    }
    res.json(exported);
  });

  // Loyalty
  app.post('/api/loyalty/rules', (req, res, next) => {
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
  app.post('/api/campaigns', (req, res, next) => {
    try {
      const input = parseBody(createCampaignSchema, req.body);
      const campaign = store.createCampaign(input);
      emitSync('campaign:updated', { campaign });
      res.status(201).json({ campaign });
    } catch (err) {
      next(err);
    }
  });

  app.post('/api/campaigns/:id/toggle', (req, res) => {
    const campaign = store.toggleCampaignStatus(req.params.id);
    if (!campaign) {
      res.status(404).json({ error: 'Campaign not found' });
      return;
    }
    emitSync('campaign:updated', { campaign });
    res.json({ campaign });
  });

  // Staff
  app.post('/api/staff', (req, res, next) => {
    try {
      const input = parseBody(addStaffSchema, req.body);
      const member = store.addStaff(input);
      emitSync('staff:updated', { member });
      res.status(201).json({ member });
    } catch (err) {
      next(err);
    }
  });

  app.post('/api/staff/:id/toggle-duty', (req, res) => {
    const member = store.toggleStaffDuty(req.params.id);
    if (!member) {
      res.status(404).json({ error: 'Staff member not found' });
      return;
    }
    emitSync('staff:updated', { member });
    res.json({ member });
  });

  // Settings
  app.put('/api/settings', (req, res, next) => {
    try {
      const input = parseBody(cafeSettingsSchema, req.body);
      const settings = store.saveSettings(input);
      emitSync('settings:updated', { settings });
      res.json({ settings });
    } catch (err) {
      next(err);
    }
  });

  app.post('/api/settings/reset', (_req, res) => {
    const settings = store.resetSettings();
    emitSync('settings:updated', { settings });
    res.json({ settings });
  });

  // Central Zod + error handler
  app.use((err: unknown, _req: Request, res: Response, _next: NextFunction) => {
    if (err instanceof z.ZodError) {
      res.status(400).json({
        error: err.issues[0]?.message || 'Invalid request payload',
        issues: err.issues,
      });
      return;
    }
    const message = err instanceof Error ? err.message : 'Internal server error';
    res.status(500).json({ error: message });
  });

  return { app, httpServer, io, store };
}
