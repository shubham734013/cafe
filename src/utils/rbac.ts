import type { StaffRole, StaffScreenId } from '../types/cafe';

const ROLE_SCREEN_MAP: Record<StaffRole, ReadonlySet<StaffScreenId>> = {
  owner: new Set<StaffScreenId>([
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
  ]),
  manager: new Set<StaffScreenId>([
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
  ]),
  cashier: new Set<StaffScreenId>([
    'pos-terminal',
    'kitchen-display-system',
    'admin-dashboard',
    'order-management',
    'table-layout',
    'inventory-stock',
    'crm-customers',
    'staff-roles',
  ]),
  barista: new Set<StaffScreenId>([
    'kitchen-display-system',
    'order-management',
    'inventory-stock',
    'staff-roles',
  ]),
  server: new Set<StaffScreenId>([
    'pos-terminal',
    'order-management',
    'table-layout',
    'staff-roles',
  ]),
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
    case 'barista':
      return 'kitchen-display-system';
    case 'server':
      return 'table-layout';
    case 'cashier':
    case 'manager':
    case 'owner':
    default:
      return 'pos-terminal';
  }
}

export function formatStaffRoleLabel(role: StaffRole | undefined | null): string {
  switch (role) {
    case 'owner':
      return 'Owner';
    case 'manager':
      return 'Manager';
    case 'cashier':
      return 'Cashier';
    case 'barista':
      return 'Barista / KOT';
    case 'server':
      return 'Server / Floor';
    default:
      return 'Locked';
  }
}
