import { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { io } from 'socket.io-client';
import { z } from 'zod';
import {
  INITIAL_CAFE_SETTINGS,
  INITIAL_CAMPAIGNS,
  INITIAL_LOYALTY_RULES,
  INITIAL_TABLES,
  MENU_ITEMS,
} from '../data/cafeSeedData';
import type { CafeBootstrapState } from '../server/store';
import type {
  addCustomerSchema,
  addIngredientSchema,
  addLoyaltyRuleSchema,
  addStaffSchema,
  addTableSchema,
  cafeSettingsSchema,
  createCampaignSchema,
  createOrderSchema,
  reserveTableSchema,
} from '../shared/schemas';
import type { DailyReconciliationSummary, YoupiPaymentRecord } from '../payments/types';
import type { UpiAppId } from '../payments/upiUri';
import type {
  AuthSessionState,
  CafeOrder,
  CafeSettings,
  CafeTable,
  CardNetwork,
} from '../types/cafe';

export const BOOTSTRAP_QUERY_KEY = ['cafeos', 'bootstrap'] as const;
export const YOUPI_CONFIG_QUERY_KEY = ['cafeos', 'youpi-config'] as const;
export const AUTH_SESSION_QUERY_KEY = ['cafeos', 'auth-session'] as const;

export interface YoupiGatewayConfigInfo {
  configured: boolean;
  mode: 'youpi-live' | 'youpi-sandbox-fallback';
  gateway: 'youpi-pg';
  currency: 'INR';
  payeeVpa: string;
  payeeName?: string;
  isDemoVpa?: boolean;
  confirmOnObserver: boolean;
  activeWindowSeconds: number;
  processingWindowSeconds: number;
}

const FALLBACK_BOOTSTRAP: CafeBootstrapState = {
  outletId: 'seth-sawariya-main',
  orders: [],
  payments: [],
  tables: INITIAL_TABLES.map((t) => ({
    ...t,
    activeOrderId: undefined,
    reservedBy: undefined,
    reservedPartySize: undefined,
  })),
  inventory: [],
  customers: [],
  loyaltyRules: INITIAL_LOYALTY_RULES,
  pointLedger: [],
  campaigns: INITIAL_CAMPAIGNS,
  staffRoster: [],
  cafeSettings: INITIAL_CAFE_SETTINGS,
  menuItems: MENU_ITEMS,
  rewardPoints: 0,
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

export async function fetchYoupiPaymentStatusApi(
  paymentId: string,
  sync = true
): Promise<YoupiPaymentRecord> {
  const res = await apiJson<{ payment: YoupiPaymentRecord }>(
    `/api/payments/${encodeURIComponent(paymentId)}?sync=${sync ? 'true' : 'false'}`
  );
  return res.payment;
}

export async function fetchCustomerPaymentsApi(
  customerId: string
): Promise<YoupiPaymentRecord[]> {
  const res = await apiJson<{ payments: YoupiPaymentRecord[] }>(
    `/api/customers/${encodeURIComponent(customerId)}/payments`
  );
  return res.payments;
}

export async function authenticateManagerPinApi(pin: string): Promise<AuthSessionState> {
  return apiJson<AuthSessionState>('/api/auth/pin', {
    method: 'POST',
    body: JSON.stringify({ pin }),
  });
}

export async function fetchDailyReconciliationApi(): Promise<DailyReconciliationSummary> {
  return apiJson<DailyReconciliationSummary>('/api/payments/reconciliation/daily');
}

export function useCafeApi() {
  const queryClient = useQueryClient();
  const [socketConnected, setSocketConnected] = useState(false);

  const bootstrapQuery = useQuery<CafeBootstrapState>({
    queryKey: BOOTSTRAP_QUERY_KEY,
    queryFn: () => apiJson<CafeBootstrapState>('/api/bootstrap'),
    placeholderData: FALLBACK_BOOTSTRAP,
    staleTime: 15_000,
    refetchOnWindowFocus: false,
    refetchInterval: socketConnected ? false : 30_000,
  });

  const authSessionQuery = useQuery<AuthSessionState>({
    queryKey: AUTH_SESSION_QUERY_KEY,
    queryFn: () => apiJson<AuthSessionState>('/api/auth/session'),
    staleTime: 30_000,
    refetchOnWindowFocus: false,
  });

  const youpiConfigQuery = useQuery<YoupiGatewayConfigInfo>({
    queryKey: YOUPI_CONFIG_QUERY_KEY,
    queryFn: () => apiJson<YoupiGatewayConfigInfo>('/api/payments/config'),
    staleTime: 60_000,
    refetchOnWindowFocus: false,
  });

  // Real-time Socket.IO subscription with cache-patching to prevent redundant full refetches
  useEffect(() => {
    const socket = io({
      query: { outletId: 'seth-sawariya-main' },
      transports: ['websocket', 'polling'],
    });

    const handleConnect = () => setSocketConnected(true);
    const handleDisconnect = () => setSocketConnected(false);

    const handleOrderCreated = (payload?: { order?: CafeOrder; rewardPoints?: number }) => {
      if (!payload?.order) return;
      queryClient.setQueryData<CafeBootstrapState>(BOOTSTRAP_QUERY_KEY, (prev) => {
        if (!prev) return prev;
        const exists = prev.orders.some((o) => o.id === payload.order!.id);
        return {
          ...prev,
          orders: exists ? prev.orders : [payload.order!, ...prev.orders],
          rewardPoints:
            typeof payload.rewardPoints === 'number' ? payload.rewardPoints : prev.rewardPoints,
          updatedAt: new Date().toISOString(),
        };
      });
    };

    const handleOrderUpdated = (payload?: { order?: CafeOrder }) => {
      if (!payload?.order) return;
      queryClient.setQueryData<CafeBootstrapState>(BOOTSTRAP_QUERY_KEY, (prev) => {
        if (!prev) return prev;
        const exists = prev.orders.some((o) => o.id === payload.order!.id);
        return {
          ...prev,
          orders: exists
            ? prev.orders.map((o) => (o.id === payload.order!.id ? payload.order! : o))
            : prev.orders,
          updatedAt: new Date().toISOString(),
        };
      });
    };

    const handlePaymentUpdated = (payload?: { payment?: YoupiPaymentRecord }) => {
      if (!payload?.payment) {
        void queryClient.invalidateQueries({ queryKey: BOOTSTRAP_QUERY_KEY });
        return;
      }
      queryClient.setQueryData<CafeBootstrapState>(BOOTSTRAP_QUERY_KEY, (prev) => {
        if (!prev) return prev;
        const exists = prev.payments.some((p) => p.id === payload.payment!.id);
        return {
          ...prev,
          payments: exists
            ? prev.payments.map((p) => (p.id === payload.payment!.id ? payload.payment! : p))
            : [payload.payment!, ...prev.payments],
          updatedAt: new Date().toISOString(),
        };
      });
    };

    const handleTableUpdated = (payload?: { table?: CafeTable }) => {
      if (!payload?.table) {
        void queryClient.invalidateQueries({ queryKey: BOOTSTRAP_QUERY_KEY });
        return;
      }
      queryClient.setQueryData<CafeBootstrapState>(BOOTSTRAP_QUERY_KEY, (prev) => {
        if (!prev) return prev;
        const exists = prev.tables.some((t) => t.id === payload.table!.id);
        return {
          ...prev,
          tables: exists
            ? prev.tables.map((t) => (t.id === payload.table!.id ? payload.table! : t))
            : [...prev.tables, payload.table!],
          updatedAt: new Date().toISOString(),
        };
      });
    };

    const handleSettingsUpdated = (payload?: { settings?: CafeSettings }) => {
      if (!payload?.settings) return;
      queryClient.setQueryData<CafeBootstrapState>(BOOTSTRAP_QUERY_KEY, (prev) =>
        prev
          ? { ...prev, cafeSettings: payload.settings!, updatedAt: new Date().toISOString() }
          : prev
      );
      void queryClient.invalidateQueries({ queryKey: YOUPI_CONFIG_QUERY_KEY });
    };

    const handleSync = (meta?: { event?: string }) => {
      const granularEvents = new Set([
        'order:created',
        'order:updated',
        'payment:updated',
        'settings:updated',
      ]);
      // Staff sockets receive full granular events directly; invalidate on public/non-granular events
      const isStaffAuthed = Boolean(
        queryClient.getQueryData<AuthSessionState>(AUTH_SESSION_QUERY_KEY)?.authenticated
      );
      if (isStaffAuthed && meta?.event && granularEvents.has(meta.event)) {
        return;
      }
      void queryClient.invalidateQueries({ queryKey: BOOTSTRAP_QUERY_KEY });
    };

    socket.on('connect', handleConnect);
    socket.on('disconnect', handleDisconnect);
    socket.on('order:created', handleOrderCreated);
    socket.on('order:updated', handleOrderUpdated);
    socket.on('payment:updated', handlePaymentUpdated);
    socket.on('table:updated', handleTableUpdated);
    socket.on('settings:updated', handleSettingsUpdated);
    socket.on('cafe:sync', handleSync);

    return () => {
      socket.off('connect', handleConnect);
      socket.off('disconnect', handleDisconnect);
      socket.off('order:created', handleOrderCreated);
      socket.off('order:updated', handleOrderUpdated);
      socket.off('payment:updated', handlePaymentUpdated);
      socket.off('table:updated', handleTableUpdated);
      socket.off('settings:updated', handleSettingsUpdated);
      socket.off('cafe:sync', handleSync);
      socket.disconnect();
    };
  }, [queryClient]);

  const invalidate = () => queryClient.invalidateQueries({ queryKey: BOOTSTRAP_QUERY_KEY });

  const loginPinMutation = useMutation({
    mutationFn: (pin: string) => authenticateManagerPinApi(pin),
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

  const createYoupiPaymentMutation = useMutation({
    mutationFn: (payload: {
      orderId: string;
      customerId?: string;
      customerName?: string;
      customerPhone?: string;
      idempotencyKey: string;
      preferredApp?: UpiAppId;
    }) =>
      apiJson<{ payment: YoupiPaymentRecord; duplicate: boolean }>('/api/payments', {
        method: 'POST',
        headers: { 'Idempotency-Key': payload.idempotencyKey },
        body: JSON.stringify(payload),
      }),
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: BOOTSTRAP_QUERY_KEY }),
        queryClient.invalidateQueries({ queryKey: YOUPI_CONFIG_QUERY_KEY }),
      ]);
    },
  });

  const settleOrderPaymentMutation = useMutation({
    mutationFn: (payload: {
      orderId: string;
      action: 'settle' | 'fail' | 'refund';
      network?: CardNetwork;
      last4?: string;
      authCode?: string;
      note?: string;
    }) =>
      apiJson<{ order: CafeOrder }>(
        `/api/orders/${encodeURIComponent(payload.orderId)}/settle-payment`,
        {
          method: 'POST',
          body: JSON.stringify({
            action: payload.action,
            network: payload.network,
            last4: payload.last4,
            authCode: payload.authCode,
            note: payload.note,
          }),
        }
      ),
    onSuccess: invalidate,
  });

  const markYoupiSubmittedMutation = useMutation({
    mutationFn: (paymentId: string) =>
      apiJson<{ payment: YoupiPaymentRecord }>(
        `/api/payments/${encodeURIComponent(paymentId)}/submitted`,
        { method: 'POST', body: JSON.stringify({}) }
      ),
    onSuccess: invalidate,
  });

  const cancelYoupiPaymentMutation = useMutation({
    mutationFn: (paymentId: string) =>
      apiJson<{ payment: YoupiPaymentRecord }>(
        `/api/payments/${encodeURIComponent(paymentId)}/cancel`,
        { method: 'POST', body: JSON.stringify({}) }
      ),
    onSuccess: invalidate,
  });

  const verifyBankCreditMutation = useMutation({
    mutationFn: (payload: {
      paymentId: string;
      decision: 'approve' | 'reject';
      utr?: string;
      note?: string;
    }) =>
      apiJson<{ payment: YoupiPaymentRecord }>(
        `/api/payments/${encodeURIComponent(payload.paymentId)}/verify-bank`,
        {
          method: 'POST',
          body: JSON.stringify({
            decision: payload.decision,
            utr: payload.utr,
            note: payload.note,
          }),
        }
      ),
    onSuccess: invalidate,
  });

  const refundYoupiPaymentMutation = useMutation({
    mutationFn: (payload: {
      paymentId: string;
      refundRef?: string;
      reason?: string;
    }) =>
      apiJson<{ payment: YoupiPaymentRecord }>(
        `/api/payments/${encodeURIComponent(payload.paymentId)}/refund`,
        {
          method: 'POST',
          body: JSON.stringify({
            refundRef: payload.refundRef,
            reason: payload.reason,
          }),
        }
      ),
    onSuccess: invalidate,
  });

  const simulateYoupiWebhookMutation = useMutation({
    mutationFn: (payload: {
      paymentId: string;
      outcome: 'OBSERVED_SUCCESS' | 'RECONCILED' | 'MANUAL_REVIEW' | 'FAILED' | 'EXPIRED' | 'CANCELLED';
      utr?: string;
    }) =>
      apiJson<{ payment: YoupiPaymentRecord }>(
        `/api/payments/${encodeURIComponent(payload.paymentId)}/simulate-webhook`,
        {
          method: 'POST',
          body: JSON.stringify({ outcome: payload.outcome, utr: payload.utr }),
        }
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

  const reserveTableMutation = useMutation({
    mutationFn: (payload: z.infer<typeof reserveTableSchema>) =>
      apiJson<{ table: CafeTable }>('/api/tables/reserve', {
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
    mutationFn: (id: string) =>
      apiJson(`/api/inventory/${encodeURIComponent(id)}/restock`, {
        method: 'POST',
        body: JSON.stringify({}),
      }),
    onSuccess: invalidate,
  });

  const addIngredientMutation = useMutation({
    mutationFn: (payload: z.infer<typeof addIngredientSchema>) =>
      apiJson('/api/inventory', { method: 'POST', body: JSON.stringify(payload) }),
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
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: BOOTSTRAP_QUERY_KEY }),
        queryClient.invalidateQueries({ queryKey: YOUPI_CONFIG_QUERY_KEY }),
      ]);
    },
  });

  const resetSettingsMutation = useMutation({
    mutationFn: () => apiJson('/api/settings/reset', { method: 'POST' }),
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: BOOTSTRAP_QUERY_KEY }),
        queryClient.invalidateQueries({ queryKey: YOUPI_CONFIG_QUERY_KEY }),
      ]);
    },
  });

  return {
    data: bootstrapQuery.data ?? FALLBACK_BOOTSTRAP,
    authSession: authSessionQuery.data ?? { authenticated: false, session: null },
    isAuthLoading: authSessionQuery.isLoading,
    youpiConfig: youpiConfigQuery.data,
    isLoading: bootstrapQuery.isLoading,
    isError: bootstrapQuery.isError,
    errorMessage:
      bootstrapQuery.error instanceof Error ? bootstrapQuery.error.message : undefined,
    socketConnected,
    refetch: bootstrapQuery.refetch,
    loginPinMutation,
    logoutPinMutation,
    createOrderMutation,
    createYoupiPaymentMutation,
    settleOrderPaymentMutation,
    markYoupiSubmittedMutation,
    cancelYoupiPaymentMutation,
    verifyBankCreditMutation,
    refundYoupiPaymentMutation,
    simulateYoupiWebhookMutation,
    advanceOrderMutation,
    toggleKotItemMutation,
    reserveTableMutation,
    checkInTableMutation,
    addTableMutation,
    transferTableMutation,
    mergeTablesMutation,
    restockItemMutation,
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
