import { create } from 'zustand';
import { MENU_ITEMS } from '../data/cafeSeedData';
import {
  getPathForScreen,
  isKitchenPath,
  isManagerPath,
  resolveCafeRoute,
} from '../routing/routes';
import { deriveWorkspaceMode } from '../state/cafeStateMachines';
import type {
  CartItem,
  MenuCategory,
  MenuItem,
  ScreenId,
  ServiceMode,
  WorkspaceMode,
} from '../types/cafe';

const STAFF_SCREENS = new Set<ScreenId>([
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

function getInitialFromUrl(): {
  screen: ScreenId;
  mode: WorkspaceMode;
  table: string;
  trackedOrderId: string;
} {
  if (typeof window === 'undefined') {
    return { screen: 'splash', mode: 'customer', table: 'T3', trackedOrderId: '' };
  }
  const params = new URLSearchParams(window.location.search);
  const rawTable = params.get('table')?.trim().toUpperCase() || '';
  const table = rawTable || 'T3';
  const orderFromUrl = params.get('orderId')?.trim() || '';
  let storedOrder = '';
  try {
    storedOrder = window.localStorage.getItem('cafeos_tracked_order')?.trim() || '';
  } catch {}
  const trackedOrderId = orderFromUrl || storedOrder || '';
  const route = resolveCafeRoute(window.location.pathname, window.location.search);
  return { ...route, table, trackedOrderId };
}

function getInitialCustomerCart(): CartItem[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = window.localStorage.getItem('cafeos_customer_cart');
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) return parsed;
    }
  } catch {}
  return [];
}

function persistCustomerCart(cart: CartItem[]) {
  if (typeof window !== 'undefined') {
    try {
      if (cart.length === 0) {
        window.localStorage.removeItem('cafeos_customer_cart');
      } else {
        window.localStorage.setItem('cafeos_customer_cart', JSON.stringify(cart));
      }
    } catch {}
  }
}

function buildInitialPosCart(): CartItem[] {
  const protein = MENU_ITEMS.find((m) => m.id === 'protein-shake')!;
  const sandwich = MENU_ITEMS.find((m) => m.id === 'veg-sandwich')!;
  return [
    {
      menuItemId: protein.id,
      name: protein.name,
      price: protein.price,
      quantity: 1,
      note: protein.defaultNote,
      imageUrl: protein.imageUrl,
      station: protein.station,
    },
    {
      menuItemId: sandwich.id,
      name: sandwich.name,
      price: sandwich.price,
      quantity: 1,
      note: sandwich.defaultNote,
      imageUrl: sandwich.imageUrl,
      station: sandwich.station,
    },
  ];
}

function upsertItem(list: CartItem[], item: MenuItem, quantity = 1): CartItem[] {
  const existing = list.find((c) => c.menuItemId === item.id);
  if (existing) {
    return list.map((c) =>
      c.menuItemId === item.id ? { ...c, quantity: c.quantity + quantity } : c
    );
  }
  return [
    ...list,
    {
      menuItemId: item.id,
      name: item.name,
      price: item.price,
      quantity,
      note: item.defaultNote,
      imageUrl: item.imageUrl,
      station: item.station,
      checked: false,
    },
  ];
}

function adjustQty(list: CartItem[], menuItemId: string, delta: number): CartItem[] {
  return list
    .map((c) => (c.menuItemId === menuItemId ? { ...c, quantity: c.quantity + delta } : c))
    .filter((c) => c.quantity > 0);
}

interface CafeClientState {
  activeScreen: ScreenId;
  workspaceMode: WorkspaceMode;
  serviceMode: ServiceMode;
  selectedTable: string;
  menuCategory: MenuCategory;
  customerCart: CartItem[];
  posCart: CartItem[];
  couponCode: string;
  cookingNote: string;
  trackedOrderId: string;
  navigate: (screen: ScreenId, mode?: WorkspaceMode, options?: { replace?: boolean }) => void;
  setServiceMode: (mode: ServiceMode) => void;
  setSelectedTable: (table: string) => void;
  setMenuCategory: (cat: MenuCategory) => void;
  addCustomerItem: (item: MenuItem, quantity?: number) => void;
  updateCustomerQty: (menuItemId: string, delta: number) => void;
  removeCustomerItem: (menuItemId: string) => void;
  clearCustomerCart: () => void;
  addPosItem: (item: MenuItem) => void;
  updatePosQty: (menuItemId: string, delta: number) => void;
  clearPosCart: () => void;
  setCouponCode: (code: string) => void;
  setCookingNote: (note: string) => void;
  setTrackedOrderId: (orderId: string) => void;
}

const initialUrl = getInitialFromUrl();

export const useCafeStore = create<CafeClientState>((set) => ({
  activeScreen: initialUrl.screen,
  workspaceMode: initialUrl.mode,
  serviceMode: 'dine-in',
  selectedTable: initialUrl.table,
  menuCategory: 'Beverages',
  customerCart: getInitialCustomerCart(),
  posCart: buildInitialPosCart(),
  couponCode: 'CAFE50',
  cookingNote: '',
  trackedOrderId: initialUrl.trackedOrderId,

  navigate: (screen, mode, options) =>
    set((state) => {
      const workspaceMode = deriveWorkspaceMode(screen, state.workspaceMode, mode);
      if (typeof window !== 'undefined') {
        const url = new URL(window.location.href);
        url.pathname = getPathForScreen(screen, {
          kitchen: isKitchenPath(window.location.pathname),
          manager: isManagerPath(window.location.pathname),
        });
        url.searchParams.delete('screen');
        const nextUrl = `${url.pathname}${url.search}${url.hash}`;
        if (nextUrl !== `${window.location.pathname}${window.location.search}${window.location.hash}`) {
          if (options?.replace) {
            window.history.replaceState({ screen }, '', nextUrl);
          } else {
            window.history.pushState({ screen }, '', nextUrl);
          }
        }
      }
      return { activeScreen: screen, workspaceMode };
    }),
  setServiceMode: (serviceMode) => set({ serviceMode }),
  setSelectedTable: (selectedTable) => set({ selectedTable }),
  setMenuCategory: (menuCategory) => set({ menuCategory }),

  addCustomerItem: (item, quantity = 1) =>
    set((state) => {
      const nextCart = upsertItem(state.customerCart, item, quantity);
      persistCustomerCart(nextCart);
      return { customerCart: nextCart };
    }),
  updateCustomerQty: (menuItemId, delta) =>
    set((state) => {
      const nextCart = adjustQty(state.customerCart, menuItemId, delta);
      persistCustomerCart(nextCart);
      return { customerCart: nextCart };
    }),
  removeCustomerItem: (menuItemId) =>
    set((state) => {
      const nextCart = state.customerCart.filter((c) => c.menuItemId !== menuItemId);
      persistCustomerCart(nextCart);
      return { customerCart: nextCart };
    }),
  clearCustomerCart: () => {
    persistCustomerCart([]);
    set({ customerCart: [] });
  },

  addPosItem: (item) => set((state) => ({ posCart: upsertItem(state.posCart, item) })),
  updatePosQty: (menuItemId, delta) =>
    set((state) => ({ posCart: adjustQty(state.posCart, menuItemId, delta) })),
  clearPosCart: () => set({ posCart: [] }),

  setCouponCode: (couponCode) => set({ couponCode }),
  setCookingNote: (cookingNote) => set({ cookingNote }),
  setTrackedOrderId: (trackedOrderId) => {
    if (typeof window !== 'undefined') {
      try {
        window.localStorage.setItem('cafeos_tracked_order', trackedOrderId);
      } catch {}
    }
    set({ trackedOrderId });
  },
}));

if (typeof window !== 'undefined') {
  window.addEventListener('popstate', () => {
    const route = resolveCafeRoute(window.location.pathname, window.location.search);
    useCafeStore.setState({
      activeScreen: route.screen,
      workspaceMode: route.mode,
    });
  });
}
