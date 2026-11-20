import type { StaffRole, StaffScreenId } from '../types/cafe';
import { canStaffRoleAccessScreen, formatStaffRoleLabel } from '../utils/rbac';

const STAFF_MODULES: Array<{
  id: Exclude<StaffScreenId, 'staff-home'>;
  title: string;
  description: string;
  icon: string;
}> = [
  {
    id: 'pos-terminal',
    title: 'Billing Counter',
    description: 'Create and manage in-person orders.',
    icon: 'point_of_sale',
  },
  {
    id: 'kitchen-display-system',
    title: 'Kitchen Screen',
    description: 'Prepare and update kitchen orders.',
    icon: 'countertops',
  },
  {
    id: 'admin-dashboard',
    title: 'Admin Dashboard',
    description: 'Open the operational dashboard.',
    icon: 'dashboard',
  },
  {
    id: 'order-management',
    title: 'Order Management',
    description: 'Review and manage orders.',
    icon: 'receipt_long',
  },
  {
    id: 'reports-analytics',
    title: 'Reports & Sales',
    description: 'Review sales and performance reports.',
    icon: 'insights',
  },
  {
    id: 'table-layout',
    title: 'Table Management',
    description: 'Manage table availability and seating.',
    icon: 'table_restaurant',
  },
  {
    id: 'inventory-stock',
    title: 'Stock & Inventory',
    description: 'Track ingredients and stock levels.',
    icon: 'inventory_2',
  },
  {
    id: 'crm-customers',
    title: 'Customer List',
    description: 'Manage customer profiles.',
    icon: 'groups',
  },
  {
    id: 'loyalty-rewards',
    title: 'Reward Points',
    description: 'Configure loyalty rules and rewards.',
    icon: 'stars',
  },
  {
    id: 'offers-campaigns',
    title: 'Offers & Discounts',
    description: 'Manage cafe promotions.',
    icon: 'local_offer',
  },
  {
    id: 'staff-roles',
    title: 'Staff & Team',
    description: 'Manage team members and access.',
    icon: 'badge',
  },
  {
    id: 'settings-cafe-profile',
    title: 'Cafe Settings',
    description: 'Configure cafe profile and operations.',
    icon: 'settings',
  },
];

interface StaffWorkspaceHomeProps {
  role: StaffRole;
  onNavigate: (screen: Exclude<StaffScreenId, 'staff-home'>) => void;
}

export function StaffWorkspaceHome({ role, onNavigate }: StaffWorkspaceHomeProps) {
  const modules = STAFF_MODULES.filter((item) => canStaffRoleAccessScreen(role, item.id));

  return (
    <section className="space-y-6">
      <header>
        <p className="text-xs font-semibold uppercase tracking-wider text-primary">
          {formatStaffRoleLabel(role)} workspace
        </p>
        <h1 className="mt-1 text-2xl font-bold text-on-surface">
          {role === 'admin' ? 'Admin Workspace' : `${formatStaffRoleLabel(role)} Hub`}
        </h1>
        <p className="mt-1 text-xs text-on-surface-variant">
          Select an operational module to begin.
        </p>
      </header>

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        {modules.map((item) => (
          <button
            key={item.id}
            type="button"
            onClick={() => onNavigate(item.id)}
            className="flex min-h-28 items-start gap-3 rounded-2xl border border-outline-variant/30 bg-surface-container-low p-4 text-left transition-colors hover:bg-surface-container-high"
          >
            <span className="material-symbols-outlined rounded-xl bg-primary-container/15 p-2 text-primary">
              {item.icon}
            </span>
            <span>
              <span className="block font-semibold text-on-surface">{item.title}</span>
              <span className="mt-1 block text-xs text-on-surface-variant">
                {item.description}
              </span>
            </span>
          </button>
        ))}
      </div>
    </section>
  );
}
