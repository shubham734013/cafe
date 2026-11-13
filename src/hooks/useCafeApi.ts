import { useEffect } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { io } from 'socket.io-client';
import { z } from 'zod';
import {
  INITIAL_CAFE_SETTINGS,
  INITIAL_CAMPAIGNS,
  INITIAL_CUSTOMERS,
  INITIAL_INVENTORY,
  INITIAL_LOYALTY_RULES,
  INITIAL_ORDERS,
  INITIAL_POINT_LEDGER,
  INITIAL_STAFF_ROSTER,
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
} from '../shared/schemas';
import type { CafeOrder } from '../types/cafe';

export const BOOTSTRAP_QUERY_KEY = ['cafeos', 'bootstrap'] as const;

const FALLBACK_BOOTSTRAP: CafeBootstrapState = {
  outletId: 'seth-sawariya-main',
  orders: INITIAL_ORDERS,
  tables: INITIAL_TABLES,
  inventory: INITIAL_INVENTORY,
  customers: INITIAL_CUSTOMERS,
  loyaltyRules: INITIAL_LOYALTY_RULES,
  pointLedger: INITIAL_POINT_LEDGER,
  campaigns: INITIAL_CAMPAIGNS,
  staffRoster: INITIAL_STAFF_ROSTER,
  cafeSettings: INITIAL_CAFE_SETTINGS,
  menuItems: MENU_ITEMS,
  rewardPoints: 340,
  updatedAt: new Date().toISOString(),
};

async function apiJson<T>(url: string, options?: RequestInit): Promise<T> {
  const res = await fetch(url, {
    headers: { 'Content-Type': 'application/json', ...(options?.headers ?? {}) },
    ...options,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error((data as { error?: string }).error || `Request failed (${res.status})`);
  }
  return data as T;
}

export function useCafeApi() {
  const queryClient = useQueryClient();

  const bootstrapQuery = useQuery<CafeBootstrapState>({
    queryKey: BOOTSTRAP_QUERY_KEY,
    queryFn: () => apiJson<CafeBootstrapState>('/api/bootstrap'),
    placeholderData: FALLBACK_BOOTSTRAP,
    staleTime: 10_000,
    refetchInterval: 15_000, // Polling resilience if WebSocket drops
  });

  // Real-time Socket.IO subscription synced to TanStack Query
  useEffect(() => {
    const socket = io({
      query: { outletId: 'seth-sawariya-main' },
      transports: ['websocket', 'polling'],
    });

    const handleSync = () => {
      void queryClient.invalidateQueries({ queryKey: BOOTSTRAP_QUERY_KEY });
    };

    socket.on('cafe:sync', handleSync);
    return () => {
      socket.off('cafe:sync', handleSync);
      socket.disconnect();
    };
  }, [queryClient]);

  const invalidate = () => queryClient.invalidateQueries({ queryKey: BOOTSTRAP_QUERY_KEY });

  const createOrderMutation = useMutation({
    mutationFn: (payload: z.infer<typeof createOrderSchema>) =>
      apiJson<{ order: CafeOrder; duplicate: boolean; rewardPoints: number }>('/api/orders', {
        method: 'POST',
        body: JSON.stringify(payload),
      }),
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
    mutationFn: (payload: z.infer<typeof cafeSettingsSchema>) =>
      apiJson('/api/settings', { method: 'PUT', body: JSON.stringify(payload) }),
    onSuccess: invalidate,
  });

  const resetSettingsMutation = useMutation({
    mutationFn: () => apiJson('/api/settings/reset', { method: 'POST' }),
    onSuccess: invalidate,
  });

  return {
    data: bootstrapQuery.data ?? FALLBACK_BOOTSTRAP,
    isLoading: bootstrapQuery.isLoading,
    refetch: bootstrapQuery.refetch,
    createOrderMutation,
    advanceOrderMutation,
    toggleKotItemMutation,
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
