import type { StaffRole, StaffScreenId } from '../types/cafe';

const ADMIN_SCREENS: ReadonlySet<StaffScreenId> = new Set([
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

const ROLE_SCREEN_MAP: Record<StaffRole, ReadonlySet<StaffScreenId>> = {
  admin: ADMIN_SCREENS,
  kitchen: KITCHEN_SCREENS,
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
    case 'admin':
      return 'admin-dashboard';
    case 'kitchen':
      return 'kitchen-display-system';
    default:
      return 'pos-terminal';
  }
}

export function formatStaffRoleLabel(role: StaffRole | undefined | null): string {
  switch (role) {
    case 'admin':
      return 'Admin';
    case 'kitchen':
      return 'Kitchen';
    default:
      return 'Locked';
  }
}
