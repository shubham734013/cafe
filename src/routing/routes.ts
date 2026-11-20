import type { ScreenId, StaffScreenId, WorkspaceMode } from '../types/cafe';
import { deriveWorkspaceMode } from '../state/cafeStateMachines';

const CUSTOMER_PATHS: Record<Exclude<ScreenId, 'splash' | StaffScreenId>, string> = {
  home: '/customer',
  menu: '/customer/menu',
  cart: '/customer/cart',
  tracking: '/customer/tracking',
  rewards: '/customer/rewards',
  profile: '/customer/profile',
  login: '/customer/login',
};

const ADMIN_PATHS: Record<StaffScreenId, string> = {
  'staff-home': '/admin/home',
  'pos-terminal': '/admin/pos',
  'pos-orders': '/admin/pos-orders',
  'kitchen-display-system': '/admin/kitchen',
  'kitchen-tables': '/admin/kitchen/tables',
  'admin-dashboard': '/admin',
  'order-management': '/admin/orders',
  'reports-analytics': '/admin/reports',
  'table-layout': '/admin/tables',
  'inventory-stock': '/admin/inventory',
  'crm-customers': '/admin/customers',
  'loyalty-rewards': '/admin/loyalty',
  'offers-campaigns': '/admin/campaigns',
  'staff-roles': '/admin/team',
  'settings-cafe-profile': '/admin/settings',
};

const KITCHEN_PATHS: Partial<Record<StaffScreenId, string>> = {
  'kitchen-display-system': '/kitchen',
  'kitchen-tables': '/kitchen/tables',
  'pos-orders': '/kitchen/pos-orders',
  'pos-terminal': '/kitchen/pos',
  'order-management': '/kitchen/orders',
  'table-layout': '/kitchen/tables-management',
  'inventory-stock': '/kitchen/inventory',
  'settings-cafe-profile': '/kitchen/settings',
};

const PATH_TO_SCREEN = new Map<string, ScreenId>(
  [
    ...Object.entries(CUSTOMER_PATHS),
    ...Object.entries(ADMIN_PATHS),
    ...Object.entries(KITCHEN_PATHS),
  ].map(([screen, pathname]) => [pathname, screen as ScreenId])
);

const CUSTOMER_SCREEN_IDS = new Set<ScreenId>(
  Object.keys(CUSTOMER_PATHS) as Array<keyof typeof CUSTOMER_PATHS>
);

export interface CafeRoute {
  screen: ScreenId;
  mode: WorkspaceMode;
}

export function isKitchenPath(pathname: string): boolean {
  return pathname === '/kitchen' || pathname.startsWith('/kitchen/');
}

export function isAdminPath(pathname: string): boolean {
  return pathname === '/admin' || pathname.startsWith('/admin/');
}

export function resolveCafeRoute(pathname: string, search = ''): CafeRoute {
  const normalizedPath = pathname.replace(/\/+$/, '') || '/';
  let screen = PATH_TO_SCREEN.get(normalizedPath);

  if (!screen && normalizedPath === '/') {
    const params = new URLSearchParams(search);
    const legacyScreen = params.get('screen');
    if (legacyScreen && CUSTOMER_SCREEN_IDS.has(legacyScreen as ScreenId)) {
      screen = legacyScreen as ScreenId;
    } else if (params.get('orderId')?.trim()) {
      screen = 'tracking';
    } else if (params.get('table')?.trim()) {
      screen = 'menu';
    } else if (params.get('autostart') === '1') {
      screen = 'home';
    }
  }

  const resolvedScreen = screen ?? 'splash';
  return {
    screen: resolvedScreen,
    mode: deriveWorkspaceMode(resolvedScreen, 'customer'),
  };
}

export function getPathForScreen(
  screen: ScreenId,
  options: { kitchen?: boolean; admin?: boolean } = {}
): string {
  if (screen === 'splash') return '/';
  if (options.kitchen) {
    const kitchenPath = KITCHEN_PATHS[screen as StaffScreenId];
    if (kitchenPath) return kitchenPath;
  }
  if (options.admin) {
    const adminPath = ADMIN_PATHS[screen as StaffScreenId];
    if (adminPath) return adminPath;
  }
  return CUSTOMER_PATHS[screen as keyof typeof CUSTOMER_PATHS] ?? ADMIN_PATHS[screen as StaffScreenId];
}
