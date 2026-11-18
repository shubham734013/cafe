import type { ScreenId, StaffScreenId, WorkspaceMode } from '../types/cafe';
import { deriveWorkspaceMode } from '../state/cafeStateMachines';

const CUSTOMER_PATHS: Record<Exclude<ScreenId, 'splash' | StaffScreenId>, string> = {
  home: '/customer',
  menu: '/customer/menu',
  cart: '/customer/cart',
  tracking: '/customer/tracking',
  rewards: '/customer/rewards',
  profile: '/customer/profile',
};

const STAFF_PATHS: Record<StaffScreenId, string> = {
  'staff-home': '/manager',
  'pos-terminal': '/manager/pos',
  'pos-orders': '/kitchen/pos-orders',
  'kitchen-display-system': '/kitchen',
  'kitchen-tables': '/kitchen/tables',
  'admin-dashboard': '/admin',
  'order-management': '/manager/orders',
  'reports-analytics': '/manager/reports',
  'table-layout': '/manager/tables',
  'inventory-stock': '/manager/inventory',
  'crm-customers': '/manager/customers',
  'loyalty-rewards': '/manager/loyalty',
  'offers-campaigns': '/manager/campaigns',
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
};

const MANAGER_PATHS: Partial<Record<StaffScreenId, string>> = {
  'kitchen-display-system': '/manager/kitchen',
  'kitchen-tables': '/manager/table-details',
};

const PATH_TO_SCREEN = new Map<string, ScreenId>(
  [
    ...Object.entries(CUSTOMER_PATHS),
    ...Object.entries(STAFF_PATHS),
    ...Object.entries(KITCHEN_PATHS),
    ...Object.entries(MANAGER_PATHS),
    ['staff-home', '/staff'],
    ['pos-terminal', '/staff/pos'],
    ['pos-orders', '/staff/pos-orders'],
    ['kitchen-display-system', '/staff/kitchen'],
    ['admin-dashboard', '/staff/dashboard'],
    ['order-management', '/staff/orders'],
    ['reports-analytics', '/staff/reports'],
    ['table-layout', '/staff/tables'],
    ['inventory-stock', '/staff/inventory'],
    ['crm-customers', '/staff/customers'],
    ['loyalty-rewards', '/staff/loyalty'],
    ['offers-campaigns', '/staff/campaigns'],
    ['staff-roles', '/staff/team'],
    ['settings-cafe-profile', '/staff/settings'],
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

export function isManagerPath(pathname: string): boolean {
  return pathname === '/manager' || pathname.startsWith('/manager/') ||
    pathname === '/admin' || pathname.startsWith('/admin/');
}

export function resolveCafeRoute(pathname: string, search = ''): CafeRoute {
  const normalizedPath = pathname.replace(/\/+$/, '') || '/';
  let screen = PATH_TO_SCREEN.get(normalizedPath);

  if (!screen && normalizedPath === '/') {
    const params = new URLSearchParams(search);
    const legacyScreen = params.get('screen');
    if (legacyScreen && CUSTOMER_SCREEN_IDS.has(legacyScreen as ScreenId)) {
      screen = legacyScreen as ScreenId;
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
  options: { kitchen?: boolean; manager?: boolean } = {}
): string {
  if (screen === 'splash') return '/';
  if (options.kitchen) {
    const kitchenPath = KITCHEN_PATHS[screen as StaffScreenId];
    if (kitchenPath) return kitchenPath;
  }
  if (options.manager) {
    const managerPath = MANAGER_PATHS[screen as StaffScreenId];
    if (managerPath) return managerPath;
  }
  return CUSTOMER_PATHS[screen as keyof typeof CUSTOMER_PATHS] ?? STAFF_PATHS[screen as StaffScreenId];
}
