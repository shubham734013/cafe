import { create } from 'zustand';
import {
  getPathForScreen,
  isAdminPath,
  isKitchenPath,
  resolveCafeRoute,
} from '../routing/routes';
import { deriveWorkspaceMode } from '../state/cafeStateMachines';
import type {
  CartItem,
  MenuCategory,
  MenuItem,
  ScreenId,
  ServiceMode,
  StaffRole,
  WorkspaceMode,
} from '../types/cafe';
import { getItemVariants } from '../utils/menuVariants';

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
    return { screen: 'splash', mode: 'customer', table: '', trackedOrderId: '' };
  }
  const params = new URLSearchParams(window.location.search);
  const rawTable = params.get('table')?.trim().toUpperCase() || 'T1';
  const table = rawTable;
  const orderFromUrl = params.get('orderId')?.trim() || '';
  let storedOrder = '';
  try {
    storedOrder = window.localStorage.getItem('cafeos_tracked_order')?.trim() || '';
  } catch {}
  const trackedOrderId = orderFromUrl || storedOrder || '';
  if (orderFromUrl) {
    try {
      window.localStorage.setItem('cafeos_tracked_order', orderFromUrl);
    } catch {}
  }
  const route = resolveCafeRoute(window.location.pathname, window.location.search);
  // Returning customers should not briefly render the onboarding/splash route and
  // then replace the entire viewport. Besides being faster, this prevents a large
  // layout shift during normal page entry.
  if (route.screen === 'splash') {
    try {
      if (window.localStorage.getItem('cafeos_onboarding_seen') === 'true') {
        return { screen: 'home', mode: 'customer', table, trackedOrderId };
      }
    } catch {}
  }
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

function upsertItem(
  list: CartItem[],
  item: MenuItem,
  quantity = 1,
  size?: string
): CartItem[] {
  const variants = getItemVariants(item);
  const selectedSize = size ?? variants[0]?.size ?? 'Regular';
  const selectedVariant = variants.find(
    (variant) => variant.size.trim().toLowerCase() === selectedSize.trim().toLowerCase()
  );
  const existing = list.find(
    (cartItem) =>
      cartItem.menuItemId === item.id &&
      (cartItem.size ?? 'Regular').trim().toLowerCase() === selectedSize.trim().toLowerCase()
  );
  if (existing) {
    return list.map((c) =>
      c.menuItemId === item.id && (c.size ?? 'Regular') === (existing.size ?? 'Regular')
        ? { ...c, quantity: c.quantity + quantity }
        : c
    );
  }
  return [
    ...list,
    {
      menuItemId: item.id,
      name: item.name,
      price: selectedVariant?.price ?? item.price,
      quantity,
      note: item.defaultNote,
      size: selectedSize,
      imageUrl: item.imageUrl,
      station: item.station,
      checked: false,
    },
  ];
}

function upsertPosItem(
  list: CartItem[],
  item: MenuItem,
  variant?: { size: string; price: number },
  quantity = 1,
  note?: string
): CartItem[] {
  const selectedSize = variant?.size;
  const existing = list.find(
    (cartItem) => cartItem.menuItemId === item.id && cartItem.size === selectedSize
  );
  if (existing) {
    return list.map((cartItem) =>
      cartItem.menuItemId === item.id && cartItem.size === selectedSize
        ? {
            ...cartItem,
            quantity: cartItem.quantity + quantity,
            note: note || cartItem.note,
          }
        : cartItem
    );
  }
  return [
    ...list,
    {
      menuItemId: item.id,
      name: item.name,
      price: variant?.price ?? item.price,
      quantity,
      size: selectedSize,
      note: note || item.defaultNote,
      imageUrl: item.imageUrl,
      station: item.station,
      checked: false,
    },
  ];
}

function adjustQty(list: CartItem[], menuItemId: string, delta: number, size = 'Regular'): CartItem[] {
  return list
    .map((c) =>
      c.menuItemId === menuItemId && (c.size ?? 'Regular') === size
        ? { ...c, quantity: c.quantity + delta }
        : c
    )
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
  navigate: (
    screen: ScreenId,
    mode?: WorkspaceMode,
    options?: { replace?: boolean; role?: StaffRole }
  ) => void;
  setServiceMode: (mode: ServiceMode) => void;
  setSelectedTable: (table: string) => void;
  setMenuCategory: (cat: MenuCategory) => void;
  addCustomerItem: (item: MenuItem, quantity?: number, size?: string) => void;
  updateCustomerQty: (menuItemId: string, delta: number, size?: string) => void;
  removeCustomerItem: (menuItemId: string, size?: string) => void;
  clearCustomerCart: () => void;
  addPosItem: (
    item: MenuItem,
    variant?: { size: string; price: number },
    quantity?: number,
    note?: string
  ) => void;
  updatePosQty: (menuItemId: string, delta: number, size?: string) => void;
  clearPosCart: () => void;
  setCouponCode: (code: string) => void;
  setCookingNote: (note: string) => void;
  setTrackedOrderId: (orderId: string) => void;
}

const initialUrl = getInitialFromUrl();

export const useCafeStore = create<CafeClientState>((set) => ({
  activeScreen: initialUrl.screen,
  workspaceMode: initialUrl.mode,
  serviceMode: 'delivery',
  selectedTable: initialUrl.table || 'T1',
  menuCategory: 'All',
  customerCart: getInitialCustomerCart(),
  posCart: [],
  couponCode: '',
  cookingNote: '',
  trackedOrderId: initialUrl.trackedOrderId,

  navigate: (screen, mode, options) =>
    set((state) => {
      const workspaceMode = deriveWorkspaceMode(screen, state.workspaceMode, mode);
      if (typeof window !== 'undefined') {
        const url = new URL(window.location.href);
        url.pathname = getPathForScreen(screen, {
          kitchen:
            isKitchenPath(window.location.pathname) || options?.role === 'kitchen',
          admin:
            !isKitchenPath(window.location.pathname) &&
            (options?.role === 'admin' || isAdminPath(window.location.pathname)),
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

  addCustomerItem: (item, quantity = 1, size) =>
    set((state) => {
      const nextCart = upsertItem(state.customerCart, item, quantity, size);
      persistCustomerCart(nextCart);
      return { customerCart: nextCart };
    }),
  updateCustomerQty: (menuItemId, delta, size = 'Regular') =>
    set((state) => {
      const nextCart = adjustQty(state.customerCart, menuItemId, delta, size);
      persistCustomerCart(nextCart);
      return { customerCart: nextCart };
    }),
  removeCustomerItem: (menuItemId, size = 'Regular') =>
    set((state) => {
      const nextCart = state.customerCart.filter(
        (c) => c.menuItemId !== menuItemId || (c.size ?? 'Regular') !== size
      );
      persistCustomerCart(nextCart);
      return { customerCart: nextCart };
    }),
  clearCustomerCart: () => {
    persistCustomerCart([]);
    set({ customerCart: [] });
  },

  addPosItem: (item, variant, quantity = 1, note) =>
    set((state) => ({ posCart: upsertPosItem(state.posCart, item, variant, quantity, note) })),
  updatePosQty: (menuItemId, delta, size) =>
    set((state) => ({
      posCart: state.posCart
        .map((item) =>
          item.menuItemId === menuItemId && item.size === size
            ? { ...item, quantity: item.quantity + delta }
            : item
        )
        .filter((item) => item.quantity > 0),
    })),
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
