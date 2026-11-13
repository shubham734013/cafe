import React, { useMemo, useState } from 'react';
import { CAFE_ASSETS } from '../data/cafeSeedData';
import { AuthSessionState, ScreenId, StaffScreenId, WorkspaceMode } from '../types/cafe';
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
  onOpenPinUnlock?: () => void;
  onLockStaff?: () => void;
  onNavigate: (screen: ScreenId, mode?: WorkspaceMode) => void;
  onShowSplash: () => void;
  children: React.ReactNode;
}

const CUSTOMER_NAV: { id: ScreenId; label: string; icon: string }[] = [
  { id: 'home', label: 'Home', icon: 'home' },
  { id: 'menu', label: 'Menu', icon: 'restaurant_menu' },
  { id: 'cart', label: 'Cart', icon: 'shopping_bag' },
  { id: 'tracking', label: 'Orders', icon: 'receipt_long' },
  { id: 'rewards', label: 'Rewards', icon: 'loyalty' },
];

const STAFF_NAV_MOBILE: { id: StaffScreenId; label: string; icon: string }[] = [
  { id: 'admin-dashboard', label: 'Dashboard', icon: 'dashboard' },
  { id: 'pos-terminal', label: 'POS', icon: 'point_of_sale' },
  { id: 'order-management', label: 'Orders', icon: 'receipt_long' },
  { id: 'table-layout', label: 'Tables', icon: 'table_restaurant' },
];

const STAFF_NAV_SIDEBAR: { id: StaffScreenId; label: string; icon: string }[] = [
  { id: 'pos-terminal', label: 'POS Terminal', icon: 'point_of_sale' },
  { id: 'kitchen-display-system', label: 'Kitchen KOT', icon: 'countertops' },
  { id: 'admin-dashboard', label: 'Admin Dashboard', icon: 'dashboard' },
  { id: 'order-management', label: 'Order Management', icon: 'receipt_long' },
  { id: 'reports-analytics', label: 'Reports & Analytics', icon: 'insights' },
  { id: 'table-layout', label: 'Table Management', icon: 'table_restaurant' },
  { id: 'inventory-stock', label: 'Inventory & Stock', icon: 'inventory_2' },
  { id: 'crm-customers', label: 'CRM & Customers', icon: 'groups' },
  { id: 'loyalty-rewards', label: 'Loyalty & Rewards', icon: 'stars' },
  { id: 'offers-campaigns', label: 'Offers & Campaigns', icon: 'local_offer' },
  { id: 'staff-roles', label: 'Staff & Roles', icon: 'badge' },
  { id: 'settings-cafe-profile', label: 'Settings & Profile', icon: 'settings' },
];

const SCREEN_TITLES: Record<ScreenId, string> = {
  splash: 'Welcome',
  home: 'Home',
  menu: 'Menu',
  cart: 'Cart',
  tracking: 'Order Tracking',
  rewards: 'Rewards',
  'pos-terminal': 'POS Terminal',
  'kitchen-display-system': 'Kitchen Display System',
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
  onOpenPinUnlock,
  onLockStaff,
  onNavigate,
  onShowSplash,
  children,
}) => {
  const [notifOpen, setNotifOpen] = useState(false);
  const [moreDrawerOpen, setMoreDrawerOpen] = useState(false);

  const isStaff = workspaceMode === 'staff';
  const activeRole = authSession?.authenticated ? authSession.session?.role : null;

  const visibleStaffNav = useMemo(() => {
    if (!activeRole) return STAFF_NAV_SIDEBAR;
    return STAFF_NAV_SIDEBAR.filter((item) => canStaffRoleAccessScreen(activeRole, item.id));
  }, [activeRole]);

  const visibleMobileStaffTabs = useMemo(() => {
    if (!activeRole) return STAFF_NAV_MOBILE;
    const permitted = STAFF_NAV_MOBILE.filter((item) =>
      canStaffRoleAccessScreen(activeRole, item.id)
    );
    return permitted.length > 0 ? permitted : [STAFF_NAV_SIDEBAR.find((s) => canStaffRoleAccessScreen(activeRole, s.id)) ?? STAFF_NAV_MOBILE[2]];
  }, [activeRole]);

  const isActiveInMobilePrimaryTabs = visibleMobileStaffTabs.some((t) => t.id === activeScreen);

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

          {/* Customer Experience Links */}
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
          </div>

          {/* Staff & Admin CafeOS Links */}
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
        </div>

        {/* Bottom Actions */}
        <div className="space-y-1.5 mt-4">
          {authSession?.authenticated ? (
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
          ) : (
            onOpenPinUnlock && (
              <button
                type="button"
                onClick={onOpenPinUnlock}
                className="w-full flex items-center gap-2 px-3 py-2 rounded-xl bg-primary-container/15 hover:bg-primary-container/25 text-xs font-semibold text-primary transition-colors cursor-pointer"
              >
                <span className="material-symbols-outlined text-[16px]">pin</span>
                <span>Staff PIN Unlock</span>
              </button>
            )
          )}
          <button
            type="button"
            onClick={onShowSplash}
            className="w-full flex items-center gap-2 px-3 py-2 rounded-xl bg-surface-container-low hover:bg-surface-container text-xs text-on-surface-variant hover:text-primary transition-colors cursor-pointer"
          >
            <span className="material-symbols-outlined text-[18px]">auto_awesome</span>
            <span>View Splash Screen</span>
          </button>
        </div>
      </aside>

      {/* Main Content Column */}
      <div className="flex-1 flex flex-col md:pl-64 min-h-screen w-full min-w-0">
        {/* Top Header */}
        <header className="fixed top-0 left-0 right-0 md:left-64 z-30 pt-safe bg-surface/85 backdrop-blur-xl shadow-[0_1px_8px_rgba(0,0,0,0.25)]">
          <div className="h-14 md:h-16 px-4 max-w-7xl mx-auto flex items-center justify-between gap-2">
            <div className="flex items-center gap-2.5 min-w-0">
              {isStaff ? (
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
                    {isStaff && <span className="hidden sm:inline"> POS</span>}
                  </span>
                  {isStaff && (
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
              {/* Quick Mode Switcher */}
              <button
                type="button"
                data-testid="workspace-mode-switcher"
                onClick={() =>
                  onNavigate(
                    isStaff ? 'home' : 'pos-terminal',
                    isStaff ? 'customer' : 'staff'
                  )
                }
                className="px-2.5 sm:px-3 py-1.5 rounded-full bg-surface-container-high hover:bg-surface-bright text-xs font-semibold text-primary flex items-center gap-1 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
              >
                <span className="material-symbols-outlined text-[15px]">swap_horiz</span>
                <span className="sm:hidden">{isStaff ? 'Cafe' : 'POS'}</span>
                <span className="hidden sm:inline">
                  {isStaff ? 'Customer View' : 'Staff POS'}
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

              <div className="relative">
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
                      <p className="text-on-surface-variant text-[11px] mt-0.5">
                        Avg prep pace: 6m 12s
                      </p>
                    </div>
                    <div className="p-2.5 rounded-lg bg-surface-container text-xs">
                      <p className="font-semibold text-tertiary">Promo CAFE50 active</p>
                      <p className="text-on-surface-variant text-[11px] mt-0.5">
                        ₹50 off orders ₹200+
                      </p>
                    </div>
                  </div>
                )}
              </div>

              <button
                type="button"
                aria-label={isStaff ? 'Open Staff Permissions & PIN' : 'Open Rewards Profile'}
                onClick={() => {
                  if (isStaff) {
                    if (!authSession?.authenticated && onOpenPinUnlock) {
                      onOpenPinUnlock();
                    } else {
                      onNavigate('staff-roles', 'staff');
                    }
                  } else {
                    onNavigate('rewards', 'customer');
                  }
                }}
                className="w-9 h-9 rounded-full overflow-hidden ring-1 ring-primary/40 flex items-center justify-center shrink-0 cursor-pointer"
              >
                {isStaff ? (
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
              </button>
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

              {/* Mobile "More" Drawer Button unlocking all 12 Staff Modules */}
              <button
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
              </button>
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
                    className={`relative flex flex-col items-center justify-center min-w-[56px] min-h-[44px] px-2 py-1 rounded-lg transition-colors cursor-pointer ${
                      active
                        ? 'text-primary-container bg-surface-container-high/70 font-bold'
                        : 'text-on-surface-variant hover:text-on-surface'
                    }`}
                  >
                    <span className="relative inline-flex items-center justify-center">
                      <span
                        className={`material-symbols-outlined text-[22px] ${
                          active ? 'icon-filled' : ''
                        }`}
                      >
                        {tab.icon}
                      </span>
                      {tab.id === 'cart' && cartCount > 0 && (
                        <span className="absolute -top-1 -right-2.5 w-4 h-4 rounded-full bg-primary-container text-on-primary text-[9px] font-bold flex items-center justify-center tabular-nums shadow-sm">
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

        {/* Mobile Staff Modules Slide-Up Drawer */}
        {isStaff && moreDrawerOpen && (
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

              <div className="flex gap-2 pt-2 border-t border-outline-variant/20">
                {authSession?.authenticated ? (
                  <button
                    type="button"
                    onClick={() => {
                      setMoreDrawerOpen(false);
                      onLockStaff?.();
                    }}
                    className="flex-1 py-2.5 rounded-xl bg-surface-container-high text-primary text-xs font-bold flex items-center justify-center gap-1.5 cursor-pointer"
                  >
                    <span className="material-symbols-outlined text-[16px]">lock</span>
                    <span>Switch / Lock PIN</span>
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={() => {
                      setMoreDrawerOpen(false);
                      onOpenPinUnlock?.();
                    }}
                    className="flex-1 py-2.5 rounded-xl bg-primary text-on-primary text-xs font-bold flex items-center justify-center gap-1.5 cursor-pointer"
                  >
                    <span className="material-symbols-outlined text-[16px]">pin</span>
                    <span>Unlock Staff PIN</span>
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => {
                    setMoreDrawerOpen(false);
                    onNavigate('home', 'customer');
                  }}
                  className="flex-1 py-2.5 rounded-xl bg-surface-container-low text-on-surface text-xs font-semibold flex items-center justify-center gap-1.5 cursor-pointer"
                >
                  <span className="material-symbols-outlined text-[16px]">storefront</span>
                  <span>Customer View</span>
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
