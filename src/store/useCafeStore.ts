import { create } from 'zustand';
import { MENU_ITEMS } from '../data/cafeSeedData';
import type { UpiAppId } from '../payments/upiUri';
import { deriveWorkspaceMode } from '../state/cafeStateMachines';
import type {
  CardMethodType,
  CardNetwork,
  CartItem,
  MenuCategory,
  MenuItem,
  PaymentMode,
  ScreenId,
  ServiceMode,
  WorkspaceMode,
} from '../types/cafe';

export interface CardCheckoutDraft {
  method: CardMethodType;
  network: CardNetwork;
  last4: string;
  holderName: string;
}

const STAFF_SCREENS = new Set<ScreenId>([
  'pos-terminal',
  'kitchen-display-system',
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
} {
  if (typeof window === 'undefined') {
    return { screen: 'splash', mode: 'customer', table: 'T3' };
  }
  const params = new URLSearchParams(window.location.search);
  const rawTable = params.get('table')?.trim().toUpperCase() || '';
  const table = rawTable || 'T3';
  const screenParam = params.get('screen') as ScreenId | null;
  if (screenParam) {
    return {
      screen: screenParam,
      mode: deriveWorkspaceMode(screenParam, 'customer'),
      table,
    };
  }
  if (rawTable) {
    return { screen: 'menu', mode: 'customer', table };
  }
  if (params.get('autostart') === '1') {
    return { screen: 'home', mode: 'customer', table };
  }
  return { screen: 'splash', mode: 'customer', table };
}

function buildInitialCustomerCart(): CartItem[] {
  const protein = MENU_ITEMS.find((m) => m.id === 'protein-shake')!;
  const sandwich = MENU_ITEMS.find((m) => m.id === 'veg-sandwich')!;
  const coldCoffee = MENU_ITEMS.find((m) => m.id === 'cold-coffee')!;
  return [
    {
      menuItemId: protein.id,
      name: protein.name,
      price: protein.price,
      quantity: 1,
      note: 'Cold · 300ml · Rich Cocoa',
      imageUrl: protein.imageUrl,
      station: protein.station,
    },
    {
      menuItemId: sandwich.id,
      name: sandwich.name,
      price: sandwich.price,
      quantity: 1,
      note: 'Toasted Jumbo · Spiced Herb',
      imageUrl: sandwich.imageUrl,
      station: sandwich.station,
    },
    {
      menuItemId: coldCoffee.id,
      name: coldCoffee.name,
      price: coldCoffee.price,
      quantity: 1,
      note: 'Seth Sawariya Classic · Extra Froth',
      imageUrl: coldCoffee.imageUrl,
      station: coldCoffee.station,
    },
  ];
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

function upsertItem(list: CartItem[], item: MenuItem): CartItem[] {
  const existing = list.find((c) => c.menuItemId === item.id);
  if (existing) {
    return list.map((c) =>
      c.menuItemId === item.id ? { ...c, quantity: c.quantity + 1 } : c
    );
  }
  return [
    ...list,
    {
      menuItemId: item.id,
      name: item.name,
      price: item.price,
      quantity: 1,
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
  customerPayment: PaymentMode;
  customerUpiApp: UpiAppId;
  customerCardDraft: CardCheckoutDraft;
  posPayment: PaymentMode;
  posUpiApp: UpiAppId;
  trackedOrderId: string;
  navigate: (screen: ScreenId, mode?: WorkspaceMode) => void;
  setServiceMode: (mode: ServiceMode) => void;
  setSelectedTable: (table: string) => void;
  setMenuCategory: (cat: MenuCategory) => void;
  addCustomerItem: (item: MenuItem) => void;
  updateCustomerQty: (menuItemId: string, delta: number) => void;
  removeCustomerItem: (menuItemId: string) => void;
  clearCustomerCart: () => void;
  addPosItem: (item: MenuItem) => void;
  updatePosQty: (menuItemId: string, delta: number) => void;
  clearPosCart: () => void;
  setCouponCode: (code: string) => void;
  setCookingNote: (note: string) => void;
  setCustomerPayment: (mode: PaymentMode) => void;
  setCustomerUpiApp: (app: UpiAppId) => void;
  setCustomerCardDraft: (patch: Partial<CardCheckoutDraft>) => void;
  setPosPayment: (mode: PaymentMode) => void;
  setPosUpiApp: (app: UpiAppId) => void;
  setTrackedOrderId: (orderId: string) => void;
}

const initialUrl = getInitialFromUrl();

export const useCafeStore = create<CafeClientState>((set) => ({
  activeScreen: initialUrl.screen,
  workspaceMode: initialUrl.mode,
  serviceMode: 'dine-in',
  selectedTable: initialUrl.table,
  menuCategory: 'Beverages',
  customerCart: buildInitialCustomerCart(),
  posCart: buildInitialPosCart(),
  couponCode: 'CAFE50',
  cookingNote: '',
  customerPayment: 'upi',
  customerUpiApp: 'paytm',
  customerCardDraft: {
    method: 'online_card',
    network: 'Visa',
    last4: '',
    holderName: '',
  },
  posPayment: 'upi',
  posUpiApp: 'any',
  trackedOrderId: 'SSCB421',

  navigate: (screen, mode) =>
    set((state) => ({
      activeScreen: screen,
      workspaceMode: deriveWorkspaceMode(screen, state.workspaceMode, mode),
    })),
  setServiceMode: (serviceMode) => set({ serviceMode }),
  setSelectedTable: (selectedTable) => set({ selectedTable }),
  setMenuCategory: (menuCategory) => set({ menuCategory }),

  addCustomerItem: (item) =>
    set((state) => ({ customerCart: upsertItem(state.customerCart, item) })),
  updateCustomerQty: (menuItemId, delta) =>
    set((state) => ({ customerCart: adjustQty(state.customerCart, menuItemId, delta) })),
  removeCustomerItem: (menuItemId) =>
    set((state) => ({
      customerCart: state.customerCart.filter((c) => c.menuItemId !== menuItemId),
    })),
  clearCustomerCart: () => set({ customerCart: [] }),

  addPosItem: (item) => set((state) => ({ posCart: upsertItem(state.posCart, item) })),
  updatePosQty: (menuItemId, delta) =>
    set((state) => ({ posCart: adjustQty(state.posCart, menuItemId, delta) })),
  clearPosCart: () => set({ posCart: [] }),

  setCouponCode: (couponCode) => set({ couponCode }),
  setCookingNote: (cookingNote) => set({ cookingNote }),
  setCustomerPayment: (customerPayment) => set({ customerPayment }),
  setCustomerUpiApp: (customerUpiApp) => set({ customerUpiApp }),
  setCustomerCardDraft: (patch) =>
    set((state) => ({
      customerCardDraft: { ...state.customerCardDraft, ...patch },
    })),
  setPosPayment: (posPayment) => set({ posPayment }),
  setPosUpiApp: (posUpiApp) => set({ posUpiApp }),
  setTrackedOrderId: (trackedOrderId) => set({ trackedOrderId }),
}));
