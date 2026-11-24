import { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { z } from 'zod';
import {
  INITIAL_CAFE_SETTINGS,
  MENU_ITEMS,
} from '../data/cafeSeedData';
import type { CafeBootstrapState } from '../server/store';
import type {
  addCustomerSchema,
  addIngredientSchema,
  addLoyaltyRuleSchema,
  addMenuItemSchema,
  addStaffSchema,
  addTableSchema,
  cafeSettingsSchema,
  CustomerFeedbackInput,
  createCampaignSchema,
  createOrderSchema,
  orderFeedbackSchema,
  reserveTableSchema,
} from '../shared/schemas';
import type {
  AuthSessionState,
  CafeOrder,
  CafeTable,
  CartItem,
  CustomerReview,
  MenuItem,
  PaymentMode,
} from '../types/cafe';

export const BOOTSTRAP_QUERY_KEY = ['cafeos', 'route-data'] as const;
export const AUTH_SESSION_QUERY_KEY = ['cafeos', 'auth-session'] as const;

const FALLBACK_BOOTSTRAP: CafeBootstrapState = {
  outletId: 'seth-sawariya-main',
  orders: [],
  tables: [],
  inventory: [],
  customers: [],
  loyaltyRules: [],
  pointLedger: [],
  campaigns: [],
  staffRoster: [],
  cafeSettings: INITIAL_CAFE_SETTINGS,
  menuItems: MENU_ITEMS,
  customerReviews: [],
  rewardPoints: 0,
  stockMovements: [],
  inventoryBatches: [],
  purchaseOrders: [],
  stockCounts: [],
  activityLog: [],
  firstOrderEligible: false,
  updatedAt: new Date().toISOString(),
};

async function apiJson<T>(url: string, options?: RequestInit): Promise<T> {
  const res = await fetch(url, {
    ...options,
    headers: { 'Content-Type': 'application/json', ...(options?.headers ?? {}) },
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error((data as { error?: string }).error || `Request failed (${res.status})`);
  }
  return data as T;
}

export async function authenticateStaffPinApi(pin: string): Promise<AuthSessionState> {
  return apiJson<AuthSessionState>('/api/auth/pin', {
    method: 'POST',
    body: JSON.stringify({ pin }),
  });
}

export function useCafeApi(screen: string, kitchenRoute = false, trackedOrderId = '') {
  const queryClient = useQueryClient();
  const [socketConnected, setSocketConnected] = useState(false);

  const bootstrapQuery = useQuery<CafeBootstrapState>({
    queryKey: [...BOOTSTRAP_QUERY_KEY, kitchenRoute ? 'kitchen' : 'main'],
    queryFn: () =>
      apiJson<CafeBootstrapState>(
        `/api/bootstrap?screen=${encodeURIComponent(screen)}&scope=${kitchenRoute ? 'kitchen' : 'main'}`
      ),
    placeholderData: FALLBACK_BOOTSTRAP,
    staleTime: 1_000,
    refetchOnWindowFocus: true,
    refetchInterval: 2_500,
  });

  const authSessionQuery = useQuery<AuthSessionState>({
    queryKey: AUTH_SESSION_QUERY_KEY,
    queryFn: () => apiJson<AuthSessionState>('/api/auth/session'),
    staleTime: 30_000,
    refetchOnWindowFocus: false,
  });

  // Centralized real-time operational socket synchronization across all routes
  useEffect(() => {
    // The splash screen has no live data. Deferring the Socket.IO client keeps its
    // parser and transport code out of the first meaningful customer paint.
    if (screen === 'splash') return;

    const params = typeof window !== 'undefined' ? new URLSearchParams(window.location.search) : null;
    const tableToken = params?.get('table') || '';
    const orderId = params?.get('orderId') || trackedOrderId;
    let disposed = false;
    let disconnect: (() => void) | undefined;

    void import('socket.io-client')
      .then(({ io }) => {
        if (disposed) return;
        const socket = io({
          query: {
            outletId: 'seth-sawariya-main',
            tableToken,
            orderId,
            scope: kitchenRoute ? 'kitchen' : 'main',
          },
          transports: ['polling', 'websocket'],
          reconnection: true,
          reconnectionAttempts: 10,
          reconnectionDelay: 1000,
          reconnectionDelayMax: 5000,
        });

        const handleConnect = () => {
          setSocketConnected(true);
          socket.emit('outlet:join', {
            tableToken,
            orderId,
            scope: kitchenRoute ? 'kitchen' : 'main',
          });
        };
        const handleDisconnect = () => setSocketConnected(false);
        const invalidateRouteData = () => {
          void queryClient.invalidateQueries({ queryKey: BOOTSTRAP_QUERY_KEY });
        };
        const handleOrderEvent = (data: unknown) => {
          invalidateRouteData();
          if (typeof window !== 'undefined') {
            window.dispatchEvent(new CustomEvent('cafe:order:new', { detail: data }));
          }
        };

        socket.on('connect', handleConnect);
        socket.on('disconnect', handleDisconnect);
        socket.on('order:created', handleOrderEvent);
        socket.on('order:new', handleOrderEvent);
        socket.on('order:updated', invalidateRouteData);
        socket.on('order:refunded', invalidateRouteData);
        socket.on('order:item-cancelled', invalidateRouteData);
        socket.on('table:updated', invalidateRouteData);
        socket.on('inventory:updated', invalidateRouteData);
        socket.on('stock:low', invalidateRouteData);
        socket.on('activity:updated', invalidateRouteData);
        socket.on('customer:updated', invalidateRouteData);
        socket.on('settings:updated', invalidateRouteData);
        socket.on('menu:availability-toggled', invalidateRouteData);
        socket.on('cafe:sync', invalidateRouteData);

        disconnect = () => {
          socket.off('connect', handleConnect);
          socket.off('disconnect', handleDisconnect);
          socket.off('order:created', handleOrderEvent);
          socket.off('order:new', handleOrderEvent);
          socket.off('order:updated', invalidateRouteData);
          socket.off('order:refunded', invalidateRouteData);
          socket.off('order:item-cancelled', invalidateRouteData);
          socket.off('table:updated', invalidateRouteData);
          socket.off('inventory:updated', invalidateRouteData);
          socket.off('stock:low', invalidateRouteData);
          socket.off('activity:updated', invalidateRouteData);
          socket.off('customer:updated', invalidateRouteData);
          socket.off('settings:updated', invalidateRouteData);
          socket.off('menu:availability-toggled', invalidateRouteData);
          socket.off('cafe:sync', invalidateRouteData);
          socket.disconnect();
        };
      })
      .catch((error: unknown) => {
        if (!disposed) console.error('Could not load live order updates:', error);
      });

    return () => {
      disposed = true;
      disconnect?.();
    };
  }, [kitchenRoute, queryClient, screen, trackedOrderId]);

  const invalidate = () => queryClient.invalidateQueries({ queryKey: BOOTSTRAP_QUERY_KEY });

  const loginPinMutation = useMutation({
    mutationFn: (pin: string) => authenticateStaffPinApi(pin),
    onSuccess: async (sessionData) => {
      queryClient.setQueryData(AUTH_SESSION_QUERY_KEY, sessionData);
      await invalidate();
    },
  });

  const logoutPinMutation = useMutation({
    mutationFn: () =>
      apiJson<AuthSessionState>('/api/auth/logout', { method: 'POST', body: JSON.stringify({}) }),
    onSuccess: async (sessionData) => {
      queryClient.setQueryData(AUTH_SESSION_QUERY_KEY, sessionData);
      await invalidate();
    },
  });

  const createOrderMutation = useMutation({
    mutationFn: (payload: z.infer<typeof createOrderSchema>) =>
      apiJson<{ order: CafeOrder; duplicate: boolean; rewardPoints: number }>('/api/orders', {
        method: 'POST',
        body: JSON.stringify(payload),
      }),
    onSuccess: invalidate,
  });

  const createPaymentSessionMutation = useMutation({
    mutationFn: (orderId: string) =>
      apiJson<{ checkoutUrl?: string; paymentId?: string; paymentStatus?: string }>(
        `/api/orders/${encodeURIComponent(orderId)}/payment-session`,
        { method: 'POST' }
      ),
    onSuccess: invalidate,
  });

  const refreshPaymentStatusMutation = useMutation({
    mutationFn: (orderId: string) =>
      apiJson<{ paymentStatus: CafeOrder['paymentStatus'] | null }>(
        `/api/orders/${encodeURIComponent(orderId)}/payment-status`
      ),
    onSuccess: invalidate,
  });

  const advanceOrderMutation = useMutation({
    mutationFn: (orderId: string) =>
      apiJson<{ order: CafeOrder }>(`/api/orders/${encodeURIComponent(orderId)}/advance`, {
        method: 'POST',
      }),
    onSuccess: invalidate,
  });

  const payCounterOrderMutation = useMutation({
    mutationFn: (args: string | { orderId: string; paymentMode?: PaymentMode; note?: string }) => {
      const orderId = typeof args === 'string' ? args : args.orderId;
      const paymentMode = typeof args === 'string' ? 'cash' : (args.paymentMode || 'cash');
      return apiJson<{ ok: boolean; order: CafeOrder }>(
        `/api/orders/${encodeURIComponent(orderId)}/pay-counter`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ paymentMode }),
        }
      );
    },
    onSuccess: invalidate,
  });

  const refundOrderMutation = useMutation({
    mutationFn: (payload: { orderId: string; reason: string }) =>
      apiJson<{ ok: boolean; order: CafeOrder }>(
        `/api/orders/${encodeURIComponent(payload.orderId)}/refund`,
        {
          method: 'POST',
          body: JSON.stringify({ reason: payload.reason }),
        }
      ),
    onSuccess: invalidate,
  });

  const cancelOrderItemMutation = useMutation({
    mutationFn: (payload: { orderId: string; menuItemId: string; quantity?: number; reason?: string }) =>
      apiJson<{ ok: boolean; order: CafeOrder; refundAmount: number; cancelledItem: CartItem; message: string }>(
        `/api/orders/${encodeURIComponent(payload.orderId)}/cancel-item`,
        {
          method: 'POST',
          body: JSON.stringify({
            menuItemId: payload.menuItemId,
            quantity: payload.quantity,
            reason: payload.reason,
          }),
        }
      ),
    onSuccess: invalidate,
  });

  const toggleKotItemMutation = useMutation({
    mutationFn: (payload: { orderId: string; menuItemId: string }) =>
      apiJson<{ order: CafeOrder }>(
        `/api/orders/${encodeURIComponent(payload.orderId)}/toggle-item`,
        {
          method: 'POST',
          body: JSON.stringify({ menuItemId: payload.menuItemId }),
        }
      ),
    onSuccess: invalidate,
  });

  const toggleMenuAvailabilityMutation = useMutation({
    mutationFn: (menuItemId: string) =>
      apiJson<{ ok: boolean; item: MenuItem }>(
        `/api/menu/${encodeURIComponent(menuItemId)}/toggle-availability`,
        { method: 'POST' }
      ),
    onSuccess: invalidate,
  });

  const addMenuItemMutation = useMutation({
    mutationFn: (payload: z.infer<typeof addMenuItemSchema>) =>
      apiJson<{ ok: boolean; item: MenuItem }>('/api/menu/items', {
        method: 'POST',
        body: JSON.stringify(payload),
      }),
    onSuccess: invalidate,
  });

  const updateMenuItemMutation = useMutation({
    mutationFn: ({ id, updates }: { id: string; updates: Partial<MenuItem> }) =>
      apiJson<{ ok: boolean; item: MenuItem }>(`/api/menu/items/${encodeURIComponent(id)}`, {
        method: 'PUT',
        body: JSON.stringify(updates),
      }),
    onSuccess: invalidate,
  });

  const submitOrderFeedbackMutation = useMutation({
    mutationFn: (payload: {
      orderId: string;
      rating: number;
      tags?: string[];
      comment?: string;
      customerPhone?: string;
    }) =>
      apiJson<{ ok: boolean; order: CafeOrder; pointsAwarded: number }>(
        `/api/orders/${encodeURIComponent(payload.orderId)}/feedback`,
        {
          method: 'POST',
          body: JSON.stringify({
            rating: payload.rating,
            tags: payload.tags,
            comment: payload.comment,
            customerPhone: payload.customerPhone,
          }),
        }
      ),
    onSuccess: invalidate,
  });

  const submitCustomerFeedbackMutation = useMutation({
    mutationFn: (payload: CustomerFeedbackInput) =>
      apiJson<{ ok: boolean; review: CustomerReview }>('/api/customer-feedback', {
        method: 'POST',
        body: JSON.stringify(payload),
      }),
    onSuccess: invalidate,
  });

  const checkInTableMutation = useMutation({
    mutationFn: (tableId: string) =>
      apiJson(`/api/tables/${encodeURIComponent(tableId)}/check-in`, { method: 'POST' }),
    onSuccess: invalidate,
  });

  const reserveTableMutation = useMutation({
    mutationFn: (payload: z.infer<typeof reserveTableSchema>) =>
      apiJson<{ table: CafeTable }>('/api/tables/reserve', {
        method: 'POST',
        body: JSON.stringify(payload),
      }),
    onSuccess: invalidate,
  });

  const addTableMutation = useMutation({
    mutationFn: (payload: z.infer<typeof addTableSchema>) =>
      apiJson('/api/tables', { method: 'POST', body: JSON.stringify(payload) }),
    onSuccess: invalidate,
  });

  const transferTableMutation = useMutation({
    mutationFn: (payload: { sourceTableId: string; targetTableId: string }) =>
      apiJson('/api/tables/transfer', { method: 'POST', body: JSON.stringify(payload) }),
    onSuccess: invalidate,
  });

  const mergeTablesMutation = useMutation({
    mutationFn: (payload: { sourceTableId: string; targetTableId: string }) =>
      apiJson('/api/tables/merge', { method: 'POST', body: JSON.stringify(payload) }),
    onSuccess: invalidate,
  });

  const restockItemMutation = useMutation({
    mutationFn: (payload: { id: string; addedQty: number; unitCost: number }) =>
      apiJson(`/api/inventory/${encodeURIComponent(payload.id)}/restock`, {
        method: 'POST',
        body: JSON.stringify({ addedQty: payload.addedQty, unitCost: payload.unitCost }),
      }),
    onSuccess: invalidate,
  });

  const requestReorderMutation = useMutation({
    mutationFn: (payload: { id: string; note?: string }) =>
      apiJson('/api/inventory/request-reorder', {
        method: 'POST',
        body: JSON.stringify(payload),
      }),
    onSuccess: invalidate,
  });

  const addIngredientMutation = useMutation({
    mutationFn: (payload: z.infer<typeof addIngredientSchema>) =>
      apiJson('/api/inventory', { method: 'POST', body: JSON.stringify(payload) }),
    onSuccess: invalidate,
  });

  const receiveStockMutation = useMutation({
    mutationFn: (payload: {
      ingredientId: string;
      quantity: number;
      unitCost?: number;
      supplier?: string;
      batchNumber?: string;
      expiryDate?: string;
      note?: string;
    }) =>
      apiJson('/api/inventory/receive', {
        method: 'POST',
        body: JSON.stringify(payload),
      }),
    onSuccess: invalidate,
  });

  const recordWasteMutation = useMutation({
    mutationFn: (payload: {
      ingredientId: string;
      quantity: number;
      reason: string;
      batchId?: string;
    }) =>
      apiJson('/api/inventory/waste', {
        method: 'POST',
        body: JSON.stringify(payload),
      }),
    onSuccess: invalidate,
  });

  const transferStockMutation = useMutation({
    mutationFn: (payload: {
      ingredientId: string;
      quantity: number;
      fromLocation: string;
      toLocation: string;
      note?: string;
    }) =>
      apiJson('/api/inventory/transfer', {
        method: 'POST',
        body: JSON.stringify(payload),
      }),
    onSuccess: invalidate,
  });

  const createStockCountMutation = useMutation({
    mutationFn: (payload: {
      physicalCounts: Array<{
        ingredientId: string;
        physicalQuantity: number;
        note?: string;
      }>;
      note?: string;
    }) =>
      apiJson('/api/inventory/count', {
        method: 'POST',
        body: JSON.stringify(payload),
      }),
    onSuccess: invalidate,
  });

  const approveStockCountMutation = useMutation({
    mutationFn: (countId: string) =>
      apiJson(`/api/inventory/count/${encodeURIComponent(countId)}/approve`, {
        method: 'POST',
      }),
    onSuccess: invalidate,
  });

  const createPurchaseOrderMutation = useMutation({
    mutationFn: (payload: {
      supplier: string;
      note?: string;
      lines: Array<{ ingredientId: string; quantity: number; unitCost: number }>;
    }) =>
      apiJson('/api/inventory/purchase-orders', {
        method: 'POST',
        body: JSON.stringify(payload),
      }),
    onSuccess: invalidate,
  });

  const receivePurchaseOrderMutation = useMutation({
    mutationFn: (payload: {
      purchaseOrderId: string;
      receivedLines: Array<{
        ingredientId: string;
        quantity: number;
        batchNumber?: string;
        expiryDate?: string;
      }>;
    }) =>
      apiJson('/api/inventory/purchase-orders/receive', {
        method: 'POST',
        body: JSON.stringify(payload),
      }),
    onSuccess: invalidate,
  });

  const addCustomerMutation = useMutation({
    mutationFn: (payload: z.infer<typeof addCustomerSchema>) =>
      apiJson('/api/customers', { method: 'POST', body: JSON.stringify(payload) }),
    onSuccess: invalidate,
  });

  const addLoyaltyRuleMutation = useMutation({
    mutationFn: (payload: z.infer<typeof addLoyaltyRuleSchema>) =>
      apiJson('/api/loyalty/rules', { method: 'POST', body: JSON.stringify(payload) }),
    onSuccess: invalidate,
  });

  const createCampaignMutation = useMutation({
    mutationFn: (payload: z.infer<typeof createCampaignSchema>) =>
      apiJson('/api/campaigns', { method: 'POST', body: JSON.stringify(payload) }),
    onSuccess: invalidate,
  });

  const toggleCampaignMutation = useMutation({
    mutationFn: (id: string) =>
      apiJson(`/api/campaigns/${encodeURIComponent(id)}/toggle`, { method: 'POST' }),
    onSuccess: invalidate,
  });

  const addStaffMutation = useMutation({
    mutationFn: (payload: z.infer<typeof addStaffSchema>) =>
      apiJson('/api/staff', { method: 'POST', body: JSON.stringify(payload) }),
    onSuccess: invalidate,
  });

  const toggleStaffDutyMutation = useMutation({
    mutationFn: (id: string) =>
      apiJson(`/api/staff/${encodeURIComponent(id)}/toggle-duty`, { method: 'POST' }),
    onSuccess: invalidate,
  });

  const saveSettingsMutation = useMutation({
    mutationFn: (payload: z.input<typeof cafeSettingsSchema>) =>
      apiJson('/api/settings', { method: 'PUT', body: JSON.stringify(payload) }),
    onSuccess: invalidate,
  });

  const resetSettingsMutation = useMutation({
    mutationFn: () => apiJson('/api/settings/reset', { method: 'POST' }),
    onSuccess: invalidate,
  });

  return {
    data: bootstrapQuery.data ?? FALLBACK_BOOTSTRAP,
    authSession: authSessionQuery.data ?? { authenticated: false, session: null },
    isAuthLoading: authSessionQuery.isLoading,
    isLoading: bootstrapQuery.isLoading || bootstrapQuery.isPlaceholderData,
    isError: bootstrapQuery.isError,
    errorMessage:
      bootstrapQuery.error instanceof Error ? bootstrapQuery.error.message : undefined,
    socketConnected,
    refetch: bootstrapQuery.refetch,
    loginPinMutation,
    logoutPinMutation,
    createOrderMutation,
    createPaymentSessionMutation,
    refreshPaymentStatusMutation,
    advanceOrderMutation,
    payCounterOrderMutation,
    refundOrderMutation,
    cancelOrderItemMutation,
    toggleKotItemMutation,
    toggleMenuAvailabilityMutation,
    addMenuItemMutation,
    updateMenuItemMutation,
    submitOrderFeedbackMutation,
    submitCustomerFeedbackMutation,
    checkInTableMutation,
    reserveTableMutation,
    addTableMutation,
    transferTableMutation,
    mergeTablesMutation,
    restockItemMutation,
    receiveStockMutation,
    recordWasteMutation,
    transferStockMutation,
    createStockCountMutation,
    approveStockCountMutation,
    createPurchaseOrderMutation,
    receivePurchaseOrderMutation,
    requestReorderMutation,
    addIngredientMutation,
    addCustomerMutation,
    addLoyaltyRuleMutation,
    createCampaignMutation,
    toggleCampaignMutation,
    addStaffMutation,
    toggleStaffDutyMutation,
    saveSettingsMutation,
    resetSettingsMutation,
  };
}
