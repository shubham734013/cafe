import type { StaffRole, StaffScreenId } from '../types/cafe';

const MANAGER_OWNER_SCREENS: ReadonlySet<StaffScreenId> = new Set([
  'staff-home',
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

const KITCHEN_SCREENS: ReadonlySet<StaffScreenId> = new Set([
  'pos-orders',
  'kitchen-display-system',
  'kitchen-tables',
  'inventory-stock',
  'order-management',
  'table-layout',
]);

const SERVER_SCREENS: ReadonlySet<StaffScreenId> = new Set([
  'pos-terminal',
  'order-management',
  'table-layout',
  'inventory-stock',
]);

const ROLE_SCREEN_MAP: Record<StaffRole, ReadonlySet<StaffScreenId>> = {
  'super-admin': MANAGER_OWNER_SCREENS,
  owner: MANAGER_OWNER_SCREENS,
  manager: MANAGER_OWNER_SCREENS,
  cashier: new Set<StaffScreenId>([
    'pos-terminal',
    'kitchen-display-system',
    'order-management',
    'table-layout',
    'inventory-stock',
    'crm-customers',
  ]),
  barista: KITCHEN_SCREENS,
  kitchen: KITCHEN_SCREENS,
  server: SERVER_SCREENS,
  waiter: SERVER_SCREENS,
};

export function canStaffRoleAccessScreen(
  role: StaffRole | undefined | null,
  screen: StaffScreenId
): boolean {
  if (!role) return false;
  return ROLE_SCREEN_MAP[role]?.has(screen) ?? false;
}

export function getDefaultStaffScreenForRole(role: StaffRole | undefined | null): StaffScreenId {
  switch (role) {
    case 'super-admin':
    case 'owner':
    case 'manager':
      return 'admin-dashboard';
    case 'barista':
    case 'kitchen':
      return 'kitchen-display-system';
    case 'server':
    case 'waiter':
      return 'table-layout';
    case 'cashier':
    default:
      return 'pos-terminal';
  }
}

export function formatStaffRoleLabel(role: StaffRole | undefined | null): string {
  switch (role) {
    case 'super-admin':
      return 'Super Admin';
    case 'owner':
    case 'manager':
      return 'Manager / Owner';
    case 'cashier':
      return 'Cashier';
    case 'barista':
    case 'kitchen':
      return 'Kitchen / Barista';
    case 'server':
    case 'waiter':
      return 'Server / Floor';
    default:
      return 'Locked';
  }
}
