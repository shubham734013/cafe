import React, { useEffect, useMemo, useState } from 'react';
import { CAFE_ASSETS } from '../data/cafeSeedData';
import { AuthSessionState, ScreenId, StaffScreenId, WorkspaceMode } from '../types/cafe';
import { isKitchenPath } from '../routing/routes';
import { canStaffRoleAccessScreen, formatStaffRoleLabel } from '../utils/rbac';
import { CafeBrandEmblem } from './CafeBrandEmblem';
import { CafeImage } from './CafeImage';

interface AppShellProps {
  activeScreen: ScreenId;
  workspaceMode: WorkspaceMode;
  cartCount: number;
  liveKotCount: number;
  cafeName?: string;
  authSession?: AuthSessionState;
  isSyncError?: boolean;
  syncErrorMessage?: string;
  onRetrySync?: () => void;
  onLockStaff?: () => void;
  onNavigate: (screen: ScreenId, mode?: WorkspaceMode) => void;
  children: React.ReactNode;
}

const CUSTOMER_NAV: { id: ScreenId; label: string; icon: string }[] = [
  { id: 'home', label: 'Home', icon: 'home' },
  { id: 'menu', label: 'Search', icon: 'search' },
  { id: 'tracking', label: 'Orders', icon: 'receipt_long' },
  { id: 'cart', label: 'Cart', icon: 'shopping_bag' },
];

const STAFF_NAV_MOBILE: { id: StaffScreenId; label: string; icon: string }[] = [
  { id: 'admin-dashboard', label: 'Dashboard', icon: 'dashboard' },
  { id: 'pos-terminal', label: 'POS', icon: 'point_of_sale' },
  { id: 'kitchen-display-system', label: 'Kitchen', icon: 'countertops' },
  { id: 'order-management', label: 'Orders', icon: 'receipt_long' },
  { id: 'table-layout', label: 'Tables', icon: 'table_restaurant' },
];

const STAFF_NAV_SIDEBAR: { id: StaffScreenId; label: string; icon: string }[] = [
  { id: 'admin-dashboard', label: 'Dashboard', icon: 'dashboard' },
  { id: 'pos-terminal', label: 'POS Terminal', icon: 'point_of_sale' },
  { id: 'kitchen-display-system', label: 'Kitchen KDS', icon: 'countertops' },
  { id: 'order-management', label: 'Orders & Billing', icon: 'receipt_long' },
  { id: 'table-layout', label: 'Tables & Floor', icon: 'table_restaurant' },
  { id: 'inventory-stock', label: 'Inventory & Stock', icon: 'inventory_2' },
  { id: 'crm-customers', label: 'Customers & CRM', icon: 'groups' },
  { id: 'offers-campaigns', label: 'Offers & Campaigns', icon: 'local_offer' },
  { id: 'loyalty-rewards', label: 'Loyalty & Rewards', icon: 'stars' },
  { id: 'reports-analytics', label: 'Reports & Analytics', icon: 'insights' },
  { id: 'staff-roles', label: 'Staff & Roles', icon: 'badge' },
  { id: 'settings-cafe-profile', label: 'Settings', icon: 'settings' },
];

const KITCHEN_NAV_SCREENS = new Set<StaffScreenId>([
  'kitchen-display-system',
  'order-management',
  'table-layout',
  'inventory-stock',
]);

const SCREEN_TITLES: Record<ScreenId, string> = {
  splash: 'Welcome',
  home: 'Home',
  menu: 'Menu',
  cart: 'Cart',
  tracking: 'Order Tracking',
  rewards: 'Rewards',
  profile: 'Personal Profile',
  'staff-home': 'Owner Workspace',
  'pos-terminal': 'POS Terminal',
  'pos-orders': 'POS Orders',
  'kitchen-display-system': 'Kitchen Display System',
  'kitchen-tables': 'Kitchen Table Details',
  'admin-dashboard': 'Live Operations & Mgmt',
  'order-management': 'Order Management',
  'reports-analytics': 'Reports & Analytics',
  'table-layout': 'Table Management',
  'inventory-stock': 'Inventory & Stock',
  'crm-customers': 'CRM & Customers',
  'loyalty-rewards': 'Loyalty & Rewards',
  'offers-campaigns': 'Offers & Campaigns',
  'staff-roles': 'Staff & Roles',
  'settings-cafe-profile': 'Settings & Cafe Profile',
};

export const AppShell: React.FC<AppShellProps> = ({
  activeScreen,
  workspaceMode,
  cartCount,
  liveKotCount,
  cafeName = 'Seth Sawariya Cafe',
  authSession,
  isSyncError = false,
  syncErrorMessage,
  onRetrySync,
  onLockStaff,
  onNavigate,
  children,
}) => {
  const [notifOpen, setNotifOpen] = useState(false);
  const [moreDrawerOpen, setMoreDrawerOpen] = useState(false);
  const [isLightTheme, setIsLightTheme] = useState(() => {
    if (typeof window !== 'undefined') {
      return localStorage.getItem('cafe_customer_theme') === 'light';
    }
    return false;
  });

  const activeRole = authSession?.authenticated ? authSession.session?.role : null;
  const isStaffWorkspace = workspaceMode === 'staff';

  useEffect(() => {
    if (typeof document !== 'undefined') {
      if (isLightTheme) {
        document.documentElement.classList.add('customer-theme-light');
        document.body.classList.add('customer-theme-light');
      } else {
        document.documentElement.classList.remove('customer-theme-light');
        document.body.classList.remove('customer-theme-light');
      }
    }
  }, [isLightTheme]);

  const toggleTheme = () => {
    setIsLightTheme((prev) => {
      const next = !prev;
      if (typeof window !== 'undefined') {
        localStorage.setItem('cafe_customer_theme', next ? 'light' : 'dark');
      }
      return next;
    });
  };
  const isStaff = isStaffWorkspace && Boolean(activeRole);
  const canShowStaffModules = isStaff;
  const isKitchenRoute =
    typeof window !== 'undefined' && isKitchenPath(window.location.pathname);

  const visibleStaffNav = useMemo(() => {
    if (!activeRole) return [];
    return STAFF_NAV_SIDEBAR.filter(
      (item) =>
        canStaffRoleAccessScreen(activeRole, item.id) &&
        (!isKitchenRoute || KITCHEN_NAV_SCREENS.has(item.id))
    );
  }, [activeRole, isKitchenRoute]);

  const visibleMobileStaffTabs = useMemo(() => {
    if (!activeRole) return [];
    return STAFF_NAV_MOBILE.filter(
      (item) =>
        canStaffRoleAccessScreen(activeRole, item.id) &&
        (!isKitchenRoute || KITCHEN_NAV_SCREENS.has(item.id))
    );
  }, [activeRole, isKitchenRoute]);

  const isActiveInMobilePrimaryTabs = visibleMobileStaffTabs.some((t) => t.id === activeScreen);
  const hasMoreStaffNav =
    !isKitchenRoute && visibleStaffNav.length > visibleMobileStaffTabs.length;

  return (
    <div className="min-h-screen w-full overflow-x-hidden bg-surface text-on-surface flex flex-col md:flex-row">
      {/* Desktop Left Workspace Rail */}
      <aside className="hidden md:flex md:w-64 md:flex-col md:fixed md:inset-y-0 bg-surface-container-lowest z-40 p-4 justify-between shadow-[1px_0_12px_rgba(0,0,0,0.3)]">
        <div className="space-y-6 overflow-y-auto no-scrollbar">
          {/* Brand */}
          <div className="flex items-center gap-2.5 px-1">
            <div className="w-10 h-10 rounded-xl bg-surface-container-high p-1.5 flex items-center justify-center shrink-0">
              <CafeBrandEmblem className="w-full h-full" />
            </div>
            <div className="min-w-0">
              <div className="text-sm font-bold text-primary truncate">{cafeName}</div>
              <div className="text-[11px] text-on-surface-variant truncate">CafeOS Hub</div>
            </div>
          </div>

          {!isStaffWorkspace && (
            <div className="space-y-1">
              <p className="px-2.5 text-[11px] font-semibold uppercase tracking-wider text-outline mb-1.5">
                Customer App
              </p>
              {CUSTOMER_NAV.map((item) => {
                const active = activeScreen === item.id;
                return (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => onNavigate(item.id, 'customer')}
                    className={`w-full flex items-center justify-between px-3 py-2.5 rounded-xl text-sm transition-colors cursor-pointer ${
                      active
                        ? 'bg-primary-container text-on-primary-container font-bold shadow-sm'
                        : 'text-on-surface-variant hover:text-on-surface hover:bg-surface-container-low font-medium'
                    }`}
                  >
                    <span className="flex items-center gap-2.5">
                      <span
                        className={`material-symbols-outlined text-[20px] ${
                          active ? 'icon-filled' : ''
                        }`}
                      >
                        {item.icon}
                      </span>
                      <span>{item.label}</span>
                    </span>
                    {item.id === 'cart' && cartCount > 0 && (
                      <span
                        className={`px-1.5 py-0.5 rounded-full text-[10px] font-bold tabular-nums ${
                          active
                            ? 'bg-on-primary/20 text-on-primary'
                            : 'bg-primary/20 text-primary'
                        }`}
                      >
                        {cartCount}
                      </span>
                    )}
                  </button>
                );
              })}

              <div className="pt-3 border-t border-outline-variant/15 space-y-1">
                <p className="px-2.5 text-[11px] font-semibold uppercase tracking-wider text-outline mb-1.5">
                  Management
                </p>
                <button
                  type="button"
                  onClick={() => onNavigate('admin-dashboard', 'staff')}
                  className="w-full flex items-center justify-between px-3 py-2.5 rounded-2xl text-sm bg-[#FF6422]/10 hover:bg-[#FF6422]/20 text-[#FF6422] font-bold border border-[#FF6422]/20 transition-all cursor-pointer"
                >
                  <span className="flex items-center gap-2.5">
                    <span className="material-symbols-outlined text-[20px]">admin_panel_settings</span>
                    <span>Admin Panel</span>
                  </span>
                  <span className="material-symbols-outlined text-[16px]">chevron_right</span>
                </button>
              </div>
            </div>
          )}

          {/* Staff & Admin CafeOS Links */}
          {canShowStaffModules && (
            <div className="space-y-1">
              <div className="px-2.5 flex items-center justify-between mb-1.5">
                <p className="text-[11px] font-semibold uppercase tracking-wider text-outline">
                  Staff &amp; Admin CafeOS
                </p>
                {activeRole && (
                  <span className="px-1.5 py-0.5 rounded bg-primary/15 text-primary text-[9px] font-bold uppercase">
                    {activeRole}
                  </span>
                )}
              </div>
              {visibleStaffNav.map((item) => {
                const active = activeScreen === item.id;
                return (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => onNavigate(item.id, 'staff')}
                    className={`w-full flex items-center justify-between px-3 py-2.5 rounded-xl text-sm transition-colors cursor-pointer ${
                      active
                        ? 'bg-primary-container text-on-primary-container font-bold shadow-sm'
                        : 'text-on-surface-variant hover:text-on-surface hover:bg-surface-container-low font-medium'
                    }`}
                  >
                    <span className="flex items-center gap-2.5 truncate">
                      <span
                        className={`material-symbols-outlined text-[20px] ${
                          active ? 'icon-filled' : ''
                        }`}
                      >
                        {item.icon}
                      </span>
                      <span className="truncate">{item.label}</span>
                    </span>
                    {item.id === 'kitchen-display-system' && liveKotCount > 0 && (
                      <span
                        className={`px-1.5 py-0.5 rounded-full text-[10px] font-bold tabular-nums ${
                          active
                            ? 'bg-on-primary/20 text-on-primary'
                            : 'bg-tertiary/20 text-tertiary'
                        }`}
                      >
                        {liveKotCount}
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
          )}
        </div>

        {/* Bottom Actions */}
        <div className="space-y-1.5 mt-4">
          {canShowStaffModules && !isKitchenRoute ? (
            <button
              type="button"
              onClick={onLockStaff}
              className="w-full flex items-center justify-between px-3 py-2 rounded-xl bg-surface-container-low hover:bg-surface-container text-xs text-primary transition-colors cursor-pointer"
            >
              <span className="flex items-center gap-2 truncate">
                <span className="material-symbols-outlined text-[16px]">lock</span>
                <span className="truncate">{formatStaffRoleLabel(activeRole)}</span>
              </span>
              <span className="text-[10px] font-bold uppercase">Lock</span>
            </button>
          ) : null}
        </div>
      </aside>

      {/* Main Content Column */}
      <div className="flex-1 flex flex-col md:pl-64 min-h-screen w-full min-w-0">
        {/* Top Header */}
        <header className="fixed top-0 left-0 right-0 md:left-64 z-30 pt-safe bg-surface/85 backdrop-blur-xl shadow-[0_1px_8px_rgba(0,0,0,0.25)]">
          <div className="h-14 md:h-16 px-4 max-w-7xl mx-auto flex items-center justify-between gap-2">
            <div className="flex items-center gap-2.5 min-w-0">
              {isStaffWorkspace ? (
                <div className="w-9 h-9 rounded-lg bg-surface-container-high flex items-center justify-center text-primary-container shrink-0 md:hidden">
                  <span className="material-symbols-outlined text-[20px]">local_cafe</span>
                </div>
              ) : (
                <div className="w-8 h-8 shrink-0 md:hidden">
                  <CafeBrandEmblem className="w-full h-full" />
                </div>
              )}

              <div className="flex flex-col min-w-0">
                <div className="flex items-center gap-1.5 min-w-0">
                  <span className="text-sm sm:text-base font-bold text-primary tracking-tight truncate">
                    {cafeName}
                    {isStaffWorkspace && <span className="hidden sm:inline"> Staff</span>}
                  </span>
                  {isStaffWorkspace && (
                    <span className="hidden sm:inline-block px-1.5 py-0.5 rounded-full bg-primary-container/20 text-primary-container text-[10px] font-bold uppercase shrink-0">
                      {activeRole ? formatStaffRoleLabel(activeRole) : 'Staff Locked'}
                    </span>
                  )}
                </div>
                <span className="text-[11px] text-on-surface-variant truncate">
                  {SCREEN_TITLES[activeScreen]}
                </span>
              </div>
            </div>

            {/* Right Header Controls */}
            <div className="flex items-center gap-1 shrink-0">
              <button
                type="button"
                aria-label={isLightTheme ? 'Switch to Dark Theme' : 'Switch to Light Theme'}
                onClick={toggleTheme}
                className="px-2.5 py-1 rounded-full bg-surface-container hover:bg-surface-container-high flex items-center gap-1 text-xs font-bold text-on-surface transition-all cursor-pointer shadow-sm border border-outline-variant/15"
              >
                <span className="material-symbols-outlined text-[15px] text-amber-400">
                  {isLightTheme ? 'light_mode' : 'dark_mode'}
                </span>
                <span className="text-[11px] font-bold hidden sm:inline">
                  {isLightTheme ? 'Light' : 'Dark'}
                </span>
              </button>

              {isStaff && canStaffRoleAccessScreen(activeRole, 'settings-cafe-profile') && (
                <button
                  type="button"
                  aria-label="Settings and Cafe Profile"
                  onClick={() => onNavigate('settings-cafe-profile', 'staff')}
                  className="w-9 h-9 flex items-center justify-center rounded-lg text-on-surface-variant hover:text-primary hover:bg-surface-container-high/60 transition-colors cursor-pointer"
                >
                  <span className="material-symbols-outlined text-[20px]">settings</span>
                </button>
              )}

              {activeRole !== 'barista' && <div className="relative">
                <button
                  type="button"
                  aria-label="Notifications"
                  onClick={() => setNotifOpen((o) => !o)}
                  className="w-10 h-10 flex items-center justify-center rounded-full text-on-surface-variant hover:text-primary transition-colors cursor-pointer"
                >
                  <span className="material-symbols-outlined text-[21px]">notifications</span>
                </button>

                {notifOpen && (
                  <div className="absolute right-0 mt-2 w-72 rounded-xl bg-surface-container-highest p-3 shadow-2xl z-50 space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-bold text-on-surface">Cafe Updates</span>
                      <button
                        type="button"
                        onClick={() => setNotifOpen(false)}
                        className="text-[11px] text-primary font-semibold cursor-pointer"
                      >
                        Close
                      </button>
                    </div>
                    <div className="p-2.5 rounded-lg bg-surface-container text-xs">
                      <p className="font-semibold text-on-surface">
                        {liveKotCount} active KOT tickets in kitchen
                      </p>
                    </div>
                  </div>
                )}
              </div>}

              {!isStaffWorkspace ? (
                <>
                  <button
                    type="button"
                    onClick={() => onNavigate('admin-dashboard', 'staff')}
                    className="px-2.5 py-1 rounded-full bg-[#FF6422]/15 hover:bg-[#FF6422]/25 text-[#FF6422] border border-[#FF6422]/25 flex items-center gap-1 text-xs font-bold transition-all cursor-pointer shadow-sm"
                  >
                    <span className="material-symbols-outlined text-[15px]">shield_person</span>
                    <span>Admin</span>
                  </button>
                </>
              ) : (
                <button
                  type="button"
                  onClick={() => onNavigate('home', 'customer')}
                  className="px-2.5 py-1 rounded-full bg-surface-container hover:bg-surface-container-high text-on-surface border border-outline-variant/15 flex items-center gap-1 text-xs font-bold transition-all cursor-pointer shadow-sm"
                >
                  <span className="material-symbols-outlined text-[15px] text-[#FF6422]">restaurant</span>
                  <span className="hidden sm:inline">Customer App</span>
                </button>
              )}

              {(!isStaffWorkspace || (activeRole && canStaffRoleAccessScreen(activeRole, 'staff-roles'))) && <button
                type="button"
                aria-label={isStaffWorkspace ? 'Open Staff Permissions' : 'Open Personal Profile'}
                onClick={() => {
                  if (isStaffWorkspace) {
                    if (activeRole && canStaffRoleAccessScreen(activeRole, 'staff-roles')) {
                      onNavigate('staff-roles', 'staff');
                    }
                    return;
                  }
                  onNavigate('profile', 'customer');
                }}
                disabled={isStaffWorkspace && !activeRole}
                className="w-9 h-9 rounded-full overflow-hidden ring-1 ring-primary/40 flex items-center justify-center shrink-0 cursor-pointer disabled:cursor-default"
              >
                {isStaffWorkspace ? (
                  <div className="w-full h-full bg-gradient-to-tr from-primary-container to-primary flex items-center justify-center text-on-primary">
                    <span className="material-symbols-outlined text-[18px]">shield_person</span>
                  </div>
                ) : (
                  <CafeImage
                    src={CAFE_ASSETS.avatar}
                    alt="Guest Profile"
                    className="w-full h-full object-cover"
                  />
                )}
              </button>}
            </div>
          </div>
        </header>

        {/* Main Stage */}
        <main className="flex-1 w-full max-w-7xl mx-auto pt-[4.5rem] md:pt-20 pb-24 md:pb-10 px-4 min-w-0">
          {isSyncError && (
            <div
              role="alert"
              className="mb-4 rounded-xl bg-error-container/25 border border-error/45 px-3.5 py-2.5 flex items-center justify-between gap-3 text-xs"
            >
              <div className="flex items-center gap-2 text-error font-medium min-w-0">
                <span className="material-symbols-outlined text-[18px] shrink-0">cloud_off</span>
                <span className="truncate">
                  {syncErrorMessage || 'Unable to sync live cafe state from server.'}
                </span>
              </div>
              {onRetrySync && (
                <button
                  type="button"
                  onClick={onRetrySync}
                  className="px-3 py-1.5 rounded-lg bg-error text-on-error font-bold shrink-0 cursor-pointer"
                >
                  Retry
                </button>
              )}
            </div>
          )}
          {children}
        </main>

        {/* Mobile Bottom Tab Bar */}
        {(!isStaffWorkspace || isStaff) && (
          <nav className="md:hidden fixed bottom-0 left-0 right-0 z-40 pb-safe bg-surface-container-lowest/95 backdrop-blur-xl shadow-[0_-1px_12px_rgba(0,0,0,0.35)]">
          {isStaff ? (
            <div className="flex items-center justify-around h-16 px-1">
              {visibleMobileStaffTabs.map((tab) => {
                const active = activeScreen === tab.id;
                return (
                  <button
                    key={tab.id}
                    type="button"
                    onClick={() => onNavigate(tab.id, 'staff')}
                    className={`relative flex flex-col items-center justify-center min-w-[54px] min-h-[44px] px-2 py-1 rounded-lg transition-colors cursor-pointer ${
                      active
                        ? 'text-primary-container bg-surface-container-high/70 font-bold'
                        : 'text-on-surface-variant hover:text-on-surface'
                    }`}
                  >
                    <span
                      className={`material-symbols-outlined text-[22px] ${
                        active ? 'icon-filled' : ''
                      }`}
                    >
                      {tab.icon}
                    </span>
                    <span className="text-[11px] tracking-tight mt-0.5">{tab.label}</span>
                  </button>
                );
              })}

              {hasMoreStaffNav && <button
                type="button"
                data-testid="mobile-staff-more-btn"
                onClick={() => setMoreDrawerOpen(true)}
                className={`relative flex flex-col items-center justify-center min-w-[54px] min-h-[44px] px-2 py-1 rounded-lg transition-colors cursor-pointer ${
                  !isActiveInMobilePrimaryTabs || moreDrawerOpen
                    ? 'text-primary-container bg-surface-container-high/70 font-bold'
                    : 'text-on-surface-variant hover:text-on-surface'
                }`}
              >
                <span className="relative inline-flex items-center justify-center">
                  <span className="material-symbols-outlined text-[22px]">apps</span>
                  {liveKotCount > 0 && (
                    <span className="absolute -top-1 -right-2.5 min-w-[16px] h-4 px-1 rounded-full bg-tertiary text-on-tertiary text-[9px] font-bold flex items-center justify-center tabular-nums shadow-sm">
                      {liveKotCount}
                    </span>
                  )}
                </span>
                <span className="text-[11px] tracking-tight mt-0.5">More</span>
              </button>}
            </div>
          ) : (
            <div className="flex items-center justify-around h-16 px-1">
              {CUSTOMER_NAV.map((tab) => {
                const active = activeScreen === tab.id;
                return (
                  <button
                    key={tab.id}
                    type="button"
                    onClick={() => onNavigate(tab.id, 'customer')}
                    className={`relative flex flex-col items-center justify-center min-w-[56px] min-h-[44px] px-2 py-1 rounded-2xl transition-all cursor-pointer ${
                      active
                        ? 'text-[#FF6422] font-black scale-105'
                        : 'text-on-surface-variant hover:text-on-surface font-semibold'
                    }`}
                  >
                    <span className="relative inline-flex items-center justify-center">
                      <span
                        className={`material-symbols-outlined text-[24px] ${
                          active ? 'icon-filled text-[#FF6422]' : ''
                        }`}
                      >
                        {tab.icon}
                      </span>
                      {tab.id === 'cart' && cartCount > 0 && (
                        <span className="absolute -top-1 -right-2.5 w-4 h-4 rounded-full bg-[#FF6422] text-white text-[9px] font-black flex items-center justify-center tabular-nums shadow-md">
                          {cartCount}
                        </span>
                      )}
                    </span>
                    <span className="text-[11px] tracking-tight mt-0.5">{tab.label}</span>
                  </button>
                );
              })}
            </div>
          )}
          </nav>
        )}

        {/* Mobile Staff Modules Slide-Up Drawer */}
        {canShowStaffModules &&
          hasMoreStaffNav &&
          moreDrawerOpen && (
          <div
            className="md:hidden fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-end"
            onClick={() => setMoreDrawerOpen(false)}
          >
            <div
              data-testid="mobile-staff-more-drawer"
              className="w-full max-h-[82vh] overflow-y-auto rounded-t-2xl bg-surface-container border-t border-outline-variant/25 p-4 space-y-3"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex items-center justify-between gap-2">
                <div>
                  <h3 className="text-sm font-bold text-primary">Staff CafeOS Modules</h3>
                  <p className="text-[11px] text-on-surface-variant">
                    Signed in as: {activeRole ? formatStaffRoleLabel(activeRole) : 'PIN Locked'}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setMoreDrawerOpen(false)}
                  className="px-2.5 py-1.5 rounded-lg bg-surface-container-high text-xs font-semibold text-on-surface cursor-pointer"
                >
                  Close
                </button>
              </div>

              <div className="grid grid-cols-2 gap-2">
                {visibleStaffNav.map((item) => {
                  const active = activeScreen === item.id;
                  return (
                    <button
                      key={item.id}
                      type="button"
                      onClick={() => {
                        setMoreDrawerOpen(false);
                        onNavigate(item.id, 'staff');
                      }}
                      className={`p-3 rounded-xl text-left flex items-center gap-2.5 transition-colors cursor-pointer ${
                        active
                          ? 'bg-primary-container text-on-primary-container font-bold'
                          : 'bg-surface-container-low hover:bg-surface-container-high text-on-surface'
                      }`}
                    >
                      <span
                        className={`material-symbols-outlined text-[20px] shrink-0 ${
                          active ? 'text-on-primary-container' : 'text-primary'
                        }`}
                      >
                        {item.icon}
                      </span>
                      <span className="text-xs font-semibold leading-tight truncate">
                        {item.label}
                      </span>
                    </button>
                  );
                })}
              </div>

              <div className="pt-2 border-t border-outline-variant/20">
                <button
                  type="button"
                  onClick={() => {
                    setMoreDrawerOpen(false);
                    onLockStaff?.();
                  }}
                  className="w-full py-2.5 rounded-xl bg-surface-container-high text-primary text-xs font-bold flex items-center justify-center gap-1.5 cursor-pointer"
                >
                  <span className="material-symbols-outlined text-[16px]">lock</span>
                  <span>Switch / Lock PIN</span>
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
