import React, { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { CAFE_ASSETS } from '../data/cafeSeedData';
import { AuthSessionState, ScreenId, StaffScreenId, WorkspaceMode } from '../types/cafe';
import { isKitchenPath } from '../routing/routes';
import { canStaffRoleAccessScreen, formatStaffRoleLabel } from '../utils/rbac';
import type { CafeAssistantContext } from '../utils/cafeAssistant';
import { CafeAssistantChat } from './CafeAssistantChat';
import { VishalAiAssistant } from './VishalAiAssistant';
import { CafeBrandEmblem } from './CafeBrandEmblem';
import { CafeImage } from './CafeImage';
import type { ShaderType } from './LiquidGlassShader';
import { CustomerThemeProvider } from './CustomerThemeContext';

const LiquidGlassShader = lazy(() =>
  import('./LiquidGlassShader').then((module) => ({ default: module.LiquidGlassShader }))
);

interface AppShellProps {
  activeScreen: ScreenId;
  workspaceMode: WorkspaceMode;
  cartCount: number;
  cartAddedNotice?: { itemName: string; quantity: number } | null;
  onDismissCartAddedNotice?: () => void;
  liveKotCount: number;
  cafeName?: string;
  cafeLogoUrl?: string;
  authSession?: AuthSessionState;
  isSyncError?: boolean;
  syncErrorMessage?: string;
  onRetrySync?: () => void;
  onLockStaff?: () => void;
  deliveryAddress?: string;
  deliveryLocationOpen?: boolean;
  onOpenDeliveryLocation?: () => void;
  onCloseDeliveryLocation?: () => void;
  onSaveDeliveryLocation?: (address: string) => void;
  assistantContext?: CafeAssistantContext;
  onNavigate: (screen: ScreenId, mode?: WorkspaceMode) => void;
  children: React.ReactNode;
}

const CUSTOMER_NAV: readonly { id: ScreenId; label: string; icon: string }[] = [
  { id: 'home', label: 'Home', icon: 'home' },
  { id: 'menu', label: 'Menu', icon: 'restaurant_menu' },
  { id: 'tracking', label: 'Orders', icon: 'receipt_long' },
  { id: 'rewards', label: 'Offers', icon: 'local_offer' },
  { id: 'profile', label: 'Profile', icon: 'person' },
];

const STAFF_NAV_MOBILE: { id: StaffScreenId; label: string; icon: string }[] = [
  { id: 'admin-dashboard', label: 'Dashboard', icon: 'dashboard' },
  { id: 'pos-terminal', label: 'Billing', icon: 'point_of_sale' },
  { id: 'kitchen-display-system', label: 'Kitchen', icon: 'countertops' },
  { id: 'order-management', label: 'Orders', icon: 'receipt_long' },
  { id: 'inventory-stock', label: 'Stock', icon: 'inventory_2' },
];

const STAFF_NAV_SIDEBAR: { id: StaffScreenId; label: string; icon: string }[] = [
  { id: 'admin-dashboard', label: 'Dashboard', icon: 'dashboard' },
  { id: 'pos-terminal', label: 'Billing Counter', icon: 'point_of_sale' },
  { id: 'kitchen-display-system', label: 'Kitchen Screen', icon: 'countertops' },
  { id: 'order-management', label: 'Orders & Bills', icon: 'receipt_long' },
  { id: 'inventory-stock', label: 'Stock & Inventory', icon: 'inventory_2' },
  { id: 'crm-customers', label: 'Customer List', icon: 'groups' },
  { id: 'offers-campaigns', label: 'Offers & Discounts', icon: 'local_offer' },
  { id: 'loyalty-rewards', label: 'Reward Points', icon: 'stars' },
  { id: 'reports-analytics', label: 'Reports & Sales', icon: 'insights' },
  { id: 'staff-roles', label: 'Staff & Team', icon: 'badge' },
  { id: 'settings-cafe-profile', label: 'Cafe Settings', icon: 'settings' },
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
  tracking: 'Order Status',
  rewards: 'Beans & Offers',
  profile: 'My Profile',
  login: 'Customer Sign In',
  'privacy-policy': 'Privacy Policy',
  'terms-and-conditions': 'Terms & Conditions',
  akshat: 'Akshat',
  'staff-home': 'Staff Home',
  'pos-terminal': 'Billing Counter',
  'pos-orders': 'Billing Orders',
  'kitchen-display-system': 'Kitchen Screen',
  'kitchen-tables': 'Kitchen Table Details',
  'admin-dashboard': 'Admin Dashboard',
  'order-management': 'Order Management',
  'reports-analytics': 'Reports & Sales',
  'table-layout': 'Table Management',
  'inventory-stock': 'Stock & Inventory',
  'crm-customers': 'Customer List',
  'loyalty-rewards': 'Reward Points',
  'offers-campaigns': 'Offers & Discounts',
  'staff-roles': 'Staff & Team',
  'settings-cafe-profile': 'Cafe Settings',
};

export const AppShell: React.FC<AppShellProps> = ({
  activeScreen,
  workspaceMode,
  cartCount,
  cartAddedNotice,
  onDismissCartAddedNotice,
  liveKotCount,
  cafeName = 'Seth Sawariya Cafe',
  cafeLogoUrl = '/images/tsc-logo.jpg',
  authSession,
  isSyncError = false,
  syncErrorMessage,
  onRetrySync,
  onLockStaff,
  deliveryAddress = '',
  deliveryLocationOpen = false,
  onOpenDeliveryLocation,
  onCloseDeliveryLocation,
  onSaveDeliveryLocation,
  assistantContext,
  onNavigate,
  children,
}) => {
  const [notifOpen, setNotifOpen] = useState(false);
  const [supportChatOpen, setSupportChatOpen] = useState(false);
  const [moreDrawerOpen, setMoreDrawerOpen] = useState(false);
  const [deliveryAddressDraft, setDeliveryAddressDraft] = useState('');
  const [savedProfileAddress, setSavedProfileAddress] = useState('');
  const [gpsCoordinates, setGpsCoordinates] = useState('');
  const [gpsStatus, setGpsStatus] = useState<'idle' | 'locating' | 'located' | 'error'>('idle');
  const [gpsMessage, setGpsMessage] = useState('');
  const gpsRequestIdRef = useRef(0);
  const [isLightTheme, setIsLightTheme] = useState(() => {
    if (typeof window !== 'undefined') {
      const saved = localStorage.getItem('cafe_customer_theme');
      if (saved) return saved === 'light';
    }
    return true;
  });

  const activeRole = authSession?.authenticated ? authSession.session?.role : null;
  const isStaffWorkspace = workspaceMode === 'staff';

  const requestCurrentLocation = useCallback(() => {
    const requestId = ++gpsRequestIdRef.current;
    if (!window.isSecureContext || !navigator.geolocation) {
      setGpsStatus('error');
      setGpsMessage('GPS needs a secure connection. Enter your address manually.');
      return;
    }

    setGpsStatus('locating');
    setGpsMessage('Getting your current location…');
    navigator.geolocation.getCurrentPosition(
      ({ coords }) => {
        if (requestId !== gpsRequestIdRef.current) return;
        const coordinates = `Current location: ${coords.latitude.toFixed(5)}, ${coords.longitude.toFixed(5)}`;
        setGpsCoordinates(coordinates);
        setDeliveryAddressDraft((current) => current.trim() || coordinates);
        setGpsStatus('located');
        setGpsMessage('GPS location found. Add your street address or landmark for accurate delivery.');
      },
      (error) => {
        if (requestId !== gpsRequestIdRef.current) return;
        setGpsStatus('error');
        setGpsMessage(
          error.code === error.PERMISSION_DENIED
            ? 'Location permission denied. Allow GPS access or enter your address manually.'
            : error.code === error.POSITION_UNAVAILABLE
              ? 'Current location is unavailable. Check GPS and try again.'
              : 'Location request timed out. Try again or enter your address manually.'
        );
      },
      { enableHighAccuracy: true, timeout: 15000, maximumAge: 60000 }
    );
  }, []);

  useEffect(() => {
    if (!deliveryLocationOpen) return;
    setDeliveryAddressDraft(deliveryAddress);
    try {
      const profile = JSON.parse(localStorage.getItem('cafeos_customer_profile') || '{}') as {
        address?: unknown;
      };
      setSavedProfileAddress(typeof profile.address === 'string' ? profile.address.trim() : '');
    } catch (error) {
      console.warn('Could not read the saved profile address:', error);
      setSavedProfileAddress('');
    }
  }, [deliveryAddress, deliveryLocationOpen]);

  useEffect(() => {
    if (!deliveryLocationOpen || !gpsCoordinates) return;
    setDeliveryAddressDraft((current) => current.trim() || gpsCoordinates);
  }, [deliveryLocationOpen, gpsCoordinates]);

  useEffect(() => {
    if (!cartAddedNotice || !onDismissCartAddedNotice) return;
    const timeoutId = window.setTimeout(onDismissCartAddedNotice, 4000);
    return () => window.clearTimeout(timeoutId);
  }, [cartAddedNotice, onDismissCartAddedNotice]);

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

  const [shaderType] = useState<ShaderType>(() => {
    if (typeof window !== 'undefined') {
      const saved = localStorage.getItem('cafe_shader_type') as ShaderType | null;
      if (saved) return saved;
    }
    return 'aceternity-gradient';
  });

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
    <div
      className={`min-h-screen w-full overflow-x-clip flex flex-col md:flex-row relative ${
        isLightTheme
          ? 'bg-[#FAF7F2] text-[#221A15]'
          : 'bg-[#0B0F17]/90 text-on-surface'
      }`}
    >
      {/* Liquid Glass Fluid Shader Background (Active in Dark Mode) */}
      {!isLightTheme && (
        <Suspense fallback={null}>
          <LiquidGlassShader type={shaderType} intensity={0.9} />
        </Suspense>
      )}

      {/* Desktop Left Workspace Rail */}
      <aside
        className={`${activeScreen === 'login' ? 'hidden' : 'hidden md:flex'} ${activeScreen === 'login' ? '' : 'md:w-64 md:flex-col md:fixed md:inset-y-0'} z-40 p-4 justify-between transition-all ${
          isLightTheme
            ? 'bg-[#F4EFEA] border-r border-[#E5DDD2] text-[#221A15]'
            : 'bg-surface-container-lowest/65 backdrop-blur-2xl border-r border-white/[0.08] text-on-surface shadow-[1px_0_24px_rgba(0,0,0,0.45)]'
        }`}
      >
        <div className="flex min-h-0 flex-1 flex-col space-y-4 overflow-y-auto no-scrollbar">
          {/* Brand */}
          {!isStaffWorkspace ? (
            <div className="flex flex-col items-center text-center pt-2 px-1">
              <div className="w-16 h-16 rounded-full flex items-center justify-center shadow-lg mb-2 overflow-hidden border-2 border-[#D4AF37]/60 bg-black p-0.5">
                <img
                  src={cafeLogoUrl}
                  alt="The Sawariya Cafe Logo"
                  className="w-full h-full object-cover rounded-full"
                />
              </div>
              <h2 className={`font-serif font-bold text-base leading-tight tracking-tight ${
                isLightTheme ? 'text-[#1F1610]' : 'text-on-surface'
              }`}>
                The Sawariya Cafe
              </h2>
              <span className={`text-[11px] font-medium leading-tight ${
                isLightTheme ? 'text-[#7A7067]' : 'text-on-surface-variant'
              }`}>
                Sanganer, Jaipur
              </span>
            </div>
          ) : (
            <div className="flex items-center gap-2.5 px-1">
              <div className="w-11 h-11 rounded-full overflow-hidden border border-[#D4AF37]/60 shadow-sm shrink-0 bg-black p-0.5">
                <img
                  src={cafeLogoUrl}
                  alt="The Sawariya Cafe Logo"
                  className="w-full h-full object-cover rounded-full"
                />
              </div>
              <div className="min-w-0">
                <div className="text-sm font-bold text-primary truncate">{cafeName}</div>
                <div className="text-[10px] text-on-surface-variant font-medium">The Sawariya Cafe</div>
              </div>
            </div>
          )}

          {!isStaffWorkspace && (
            <div className="space-y-1">
              <div className={`w-full border-t my-3 ${isLightTheme ? 'border-[#EAE2D7]' : 'border-outline-variant/15'}`} />
              {CUSTOMER_NAV.map((item) => {
                const active = activeScreen === item.id;
                return (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => onNavigate(item.id, 'customer')}
                    className={`w-full flex items-center gap-3 px-3.5 py-2.5 rounded-2xl text-sm transition-all cursor-pointer ${
                      active
                        ? isLightTheme
                          ? 'bg-[#382319] text-white font-bold shadow-xs'
                          : 'bg-primary text-on-primary font-bold shadow-md'
                        : isLightTheme
                          ? 'text-[#7A7067] hover:bg-[#F5EFE8] hover:text-[#1F1610] font-medium'
                          : 'text-on-surface-variant hover:bg-surface-container hover:text-on-surface font-medium'
                    }`}
                  >
                    <span className="material-symbols-outlined text-[20px]">
                      {item.icon}
                    </span>
                    <span>{item.label}</span>
                  </button>
                );
              })}

              <button
                type="button"
                onClick={() => onNavigate('cart', 'customer')}
                className={`w-full flex items-center justify-between gap-3 px-3.5 py-2.5 rounded-2xl text-sm transition-all cursor-pointer ${
                  activeScreen === 'cart'
                    ? isLightTheme
                      ? 'bg-[#382319] text-white font-bold shadow-xs'
                      : 'bg-primary text-on-primary font-bold shadow-md'
                    : isLightTheme
                      ? 'text-[#7A7067] hover:bg-[#F5EFE8] hover:text-[#1F1610] font-medium'
                      : 'text-on-surface-variant hover:bg-surface-container hover:text-on-surface font-medium'
                }`}
              >
                <span className="flex items-center gap-3">
                  <span className="material-symbols-outlined text-[20px]">shopping_bag</span>
                  <span>Cart</span>
                </span>
                {cartCount > 0 && (
                  <span className={`min-w-5 h-5 px-1.5 rounded-full text-[10px] font-bold flex items-center justify-center tabular-nums ${
                    activeScreen === 'cart'
                      ? 'bg-white/20 text-white'
                      : isLightTheme
                        ? 'bg-[#382319]/10 text-[#382319]'
                        : 'bg-primary/15 text-primary'
                  }`}>
                    {cartCount}
                  </span>
                )}
              </button>

              <div className={`pt-4 mt-4 border-t ${isLightTheme ? 'border-[#EAE2D7]' : 'border-outline-variant/15'}`}>
                <button
                  type="button"
                  onClick={() => onNavigate('admin-dashboard', 'staff')}
                  className={`w-full flex items-center gap-2.5 px-3 py-2 rounded-xl text-xs sm:text-sm font-semibold transition-colors cursor-pointer ${
                    isLightTheme
                      ? 'text-[#7A7067] hover:bg-[#F5EFE8] hover:text-[#1F1610]'
                      : 'text-on-surface-variant hover:bg-surface-container hover:text-on-surface'
                  }`}
                >
                  <span className="material-symbols-outlined text-[20px]">verified_user</span>
                  <span>Admin Panel</span>
                </button>
              </div>
            </div>
          )}

          {/* Staff Links */}
          {canShowStaffModules && (
            <div className="space-y-1">
              <div className="px-2.5 mb-1.5" />
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

          <div className="mt-auto pt-4">
            {!isStaffWorkspace ? (
              <div
                className={`rounded-2xl border p-3 ${
                  isLightTheme
                    ? 'border-[#E3DBD2] bg-[#FAF7F2]'
                    : 'border-white/10 bg-surface-container-low/75'
                }`}
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="inline-flex items-center gap-1.5 text-[10px] font-extrabold uppercase tracking-[0.16em] text-primary">
                    <span className="material-symbols-outlined text-[16px]">shopping_bag</span>
                    Your bag
                  </span>
                  <span className="rounded-lg bg-primary/10 px-2 py-0.5 text-[10px] font-bold tabular-nums text-primary">
                    {cartCount}
                  </span>
                </div>
                <p className={`mt-2 text-xs font-medium ${
                  isLightTheme ? 'text-[#4D453D]' : 'text-on-surface'
                }`}>
                  {cartCount > 0
                    ? `${cartCount} ${cartCount === 1 ? 'item' : 'items'} ready in your bag`
                    : 'Your next favorite is one tap away.'}
                </p>
                <button
                  type="button"
                  onClick={() => onNavigate(cartCount > 0 ? 'cart' : 'menu', 'customer')}
                  className="mt-2 flex w-full items-center justify-between gap-2 rounded-xl bg-primary/10 px-2.5 py-2 text-[11px] font-bold text-primary transition-colors hover:bg-primary/15 cursor-pointer"
                >
                  {cartCount > 0 ? 'Review your bag' : 'Browse the menu'}
                  <span className="material-symbols-outlined text-[16px]">arrow_forward</span>
                </button>
              </div>
            ) : null}
          </div>
        </div>

        {/* Bottom Actions */}
        <div className="space-y-1.5 mt-4">
          <button
            type="button"
            aria-label={isLightTheme ? 'Switch to Dark Mode' : 'Switch to Light Mode'}
            onClick={toggleTheme}
            className={`w-full flex items-center gap-2.5 px-3 py-2.5 rounded-xl text-sm font-medium transition-colors cursor-pointer ${
              isLightTheme
                ? 'text-[#4D453D] hover:bg-[#EAE2D8]'
                : 'text-on-surface-variant hover:text-on-surface hover:bg-surface-container-low'
            }`}
          >
            <span className="material-symbols-outlined text-[20px] text-amber-400">
              {isLightTheme ? 'dark_mode' : 'light_mode'}
            </span>
            <span>{isLightTheme ? 'Switch to Dark Mode' : 'Switch to Light Mode'}</span>
          </button>
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
      <div className={`flex-1 flex flex-col min-h-screen w-full min-w-0 ${activeScreen === 'login' ? '' : 'md:pl-64'}`}>
        {/* Top Header */}
        <header
          className={`fixed top-0 left-0 right-0 md:left-64 z-30 pt-safe transition-all ${
            isLightTheme
              ? 'bg-surface/85 backdrop-blur-xl border-b border-outline-variant/15'
              : 'bg-surface-container-lowest/65 backdrop-blur-2xl border-b border-white/[0.08] shadow-[0_4px_30px_rgba(0,0,0,0.35)]'
          } ${
            !isStaffWorkspace ? (activeScreen === 'home' ? 'md:hidden' : 'hidden') : ''
          }`}
        >
          <div className="h-14 md:h-16 px-4 max-w-7xl mx-auto flex items-center justify-between gap-2">
            <div className="flex items-center gap-2.5 min-w-0">
              {isStaffWorkspace ? (
                <>
                  <div className="w-9 h-9 rounded-full overflow-hidden border border-[#D4AF37]/60 flex items-center justify-center shrink-0 md:hidden shadow-sm bg-black p-0.5">
                    <img src={cafeLogoUrl} alt="The Sawariya Cafe Logo" className="w-full h-full object-cover rounded-full" />
                  </div>
                  <div className="flex flex-col min-w-0">
                    <div className="flex items-center gap-1.5 min-w-0">
                      <span className="text-sm sm:text-base font-bold text-primary tracking-tight truncate">
                        {cafeName}
                      </span>
                    </div>
                    <span className="text-[11px] text-on-surface-variant truncate">
                      {SCREEN_TITLES[activeScreen]}
                    </span>
                  </div>
                </>
              ) : (
                <div className="flex items-center gap-2 min-w-0">
                  <div className="w-8 h-8 rounded-full overflow-hidden border border-[#D4AF37]/60 flex items-center justify-center shrink-0 shadow-xs bg-black p-0.5">
                    <img src={cafeLogoUrl} alt="The Sawariya Cafe Logo" className="w-full h-full object-cover rounded-full" />
                  </div>
                  <button
                    type="button"
                    onClick={onOpenDeliveryLocation}
                    aria-label={`Delivery location: ${deliveryAddress || 'add address'}`}
                    aria-haspopup="dialog"
                    className="flex items-center gap-1.5 sm:gap-2 min-w-0 max-w-[130px] min-[390px]:max-w-[180px] sm:max-w-xs text-left rounded-xl focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#C67C4E]"
                  >
                    <div className={`w-7 h-7 rounded-full flex items-center justify-center shrink-0 ${
                      isLightTheme ? 'bg-[#FAF7F2] border border-[#EAE2D7] text-[#382319]' : 'bg-primary/20 text-primary'
                    }`}>
                      <span className="material-symbols-outlined text-[16px]">location_on</span>
                    </div>
                    <div className="flex flex-col min-w-0 text-left">
                      <div className="flex items-center gap-0.5 min-w-0">
                        <span className={`text-xs sm:text-sm font-bold tracking-tight truncate ${
                          isLightTheme ? 'text-[#1F1610]' : 'text-on-surface'
                        }`}>
                          {deliveryAddress ? 'Deliver to' : 'Set delivery location'}
                        </span>
                        <span className={`material-symbols-outlined text-[15px] ${
                          isLightTheme ? 'text-[#7A7067]' : 'text-on-surface-variant'
                        }`}>
                          expand_more
                        </span>
                      </div>
                      <span className={`text-[10px] truncate font-medium ${
                        isLightTheme ? 'text-[#7A7067]' : 'text-on-surface-variant'
                      }`}>
                        {deliveryAddress || 'Tap to add your address'}
                      </span>
                    </div>
                  </button>
                </div>
              )}
            </div>

            {/* Right Header Controls */}
            <div className="flex items-center gap-1.5 shrink-0">
              {!isStaffWorkspace && (
                <button
                  type="button"
                  onClick={() => onNavigate('cart', 'customer')}
                  aria-label="Cart"
                  className={`relative w-9 h-9 rounded-full flex items-center justify-center transition-colors cursor-pointer ${
                    isLightTheme
                      ? 'bg-white border border-[#EAE2D7] text-[#1F1610] hover:bg-[#F5EFE8] shadow-xs'
                      : 'bg-surface-container border border-outline-variant/15 text-on-surface hover:bg-surface-container-high'
                  }`}
                >
                  <span className="material-symbols-outlined text-[19px]">shopping_bag</span>
                  {cartCount > 0 && (
                    <span className={`absolute -top-1 -right-1 w-4 h-4 text-white text-[9px] font-bold rounded-full flex items-center justify-center shadow-xs ${
                      isLightTheme ? 'bg-[#382319]' : 'bg-primary'
                    }`}>
                      {cartCount}
                    </span>
                  )}
                </button>
              )}

              <button
                type="button"
                aria-label={isLightTheme ? 'Switch to Dark Theme' : 'Switch to Light Theme'}
                onClick={toggleTheme}
                className={`liquid-glass-pill px-3 py-1.5 rounded-full hover:bg-surface-container-high/80 items-center gap-1.5 text-xs font-bold text-on-surface transition-all cursor-pointer shadow-sm active:scale-95 ${
                  isStaffWorkspace ? 'flex' : 'hidden'
                }`}
              >
                <span className="material-symbols-outlined text-[16px] text-amber-400">
                  {isLightTheme ? 'light_mode' : 'dark_mode'}
                </span>
                <span className="text-[11px] font-bold hidden sm:inline">
                  {isLightTheme ? 'Light' : 'Liquid Glass'}
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

              {activeRole !== 'kitchen' && <div className="relative">
                <button
                  type="button"
                  aria-label={isStaffWorkspace ? 'Notifications' : 'Support'}
                  aria-haspopup="dialog"
                  aria-expanded={notifOpen}
                  onClick={() => setNotifOpen((o) => !o)}
                  className={`h-9 flex items-center justify-center rounded-full transition-colors cursor-pointer ${
                    isLightTheme
                      ? 'bg-white border border-[#EAE2D7] text-[#1F1610] hover:bg-[#F5EFE8]'
                      : 'bg-surface-container border border-outline-variant/15 text-on-surface hover:bg-surface-container-high'
                  } ${
                    isStaffWorkspace ? 'w-9' : 'gap-1.5 px-2.5'
                  }`}
                >
                  <span className="material-symbols-outlined text-[19px]">
                    {isStaffWorkspace ? 'notifications' : 'support_agent'}
                  </span>
                  {!isStaffWorkspace && <span className="text-[11px] font-bold hidden min-[400px]:inline">Support</span>}
                </button>

                {notifOpen && (
                  <div
                    role="dialog"
                    aria-label={isStaffWorkspace ? 'Cafe updates' : 'Help and support'}
                    className="absolute right-0 mt-2 w-80 max-w-[calc(100vw-2rem)] max-h-[calc(100dvh-6rem)] overflow-y-auto rounded-xl bg-surface-container-highest p-3 shadow-2xl z-50 space-y-2"
                  >
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-bold text-on-surface">
                        {isStaffWorkspace ? 'Cafe Updates' : 'Help & Support'}
                      </span>
                      <button
                        type="button"
                        onClick={() => setNotifOpen(false)}
                        className="text-[11px] text-primary font-semibold cursor-pointer"
                      >
                        Close
                      </button>
                    </div>
                    {isStaffWorkspace ? (
                      <div className="p-2.5 rounded-lg bg-surface-container text-xs">
                        <p className="font-semibold text-on-surface">
                          {liveKotCount} active orders in kitchen
                        </p>
                      </div>
                    ) : (
                      <>
                        <div className="rounded-lg bg-surface-container p-2.5 text-xs">
                          <p className="mb-2 text-on-surface-variant">
                            Need help with an order or visit? Contact our support team.
                          </p>
                          <div className="space-y-1">
                            <a
                              href="tel:+919876543210"
                              className="block rounded-md px-2 py-1.5 font-semibold text-primary hover:bg-surface-container-high"
                            >
                              Call +91 98765 43210
                            </a>
                            <a
                              href="mailto:TheSawariyacafe70@gmail.com"
                              className="block break-all rounded-md px-2 py-1.5 font-semibold text-primary hover:bg-surface-container-high"
                            >
                              Email TheSawariyacafe70@gmail.com
                            </a>
                          </div>
                        </div>

                        {!supportChatOpen ? (
                          <button
                            type="button"
                            onClick={() => setSupportChatOpen(true)}
                            className="flex w-full items-center gap-2 rounded-lg border border-[#D4AF37]/40 bg-surface-container px-3 py-2.5 text-left text-xs font-bold text-on-surface transition-colors hover:bg-surface-container-high"
                          >
                            <span className="material-symbols-outlined text-[18px] text-[#D4AF37]">smart_toy</span>
                            <span className="flex-1">Ask Vishal AI ✨</span>
                            <span className="material-symbols-outlined text-[16px] text-on-surface-variant">chevron_right</span>
                          </button>
                        ) : (
                          <CafeAssistantChat
                            context={assistantContext}
                            onClose={() => setSupportChatOpen(false)}
                          />
                        )}
                      </>
                    )}
                  </div>
                )}
              </div>}

              {isStaffWorkspace && (
                <button
                  type="button"
                  onClick={() => onNavigate('home', 'customer')}
                  className="px-2.5 py-1 rounded-full bg-surface-container hover:bg-surface-container-high text-on-surface border border-outline-variant/15 flex items-center gap-1 text-xs font-bold transition-all cursor-pointer shadow-sm"
                >
                  <span className="material-symbols-outlined text-[15px] text-[#FF6422]">restaurant</span>
                  <span className="hidden sm:inline">Customer App</span>
                </button>
              )}

              {(!isKitchenRoute && isStaffWorkspace && activeRole && canStaffRoleAccessScreen(activeRole, 'staff-roles')) && <button
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
        <main
          className={`flex-1 w-full max-w-7xl mx-auto px-3 sm:px-4 md:px-6 min-w-0 ${
            activeScreen === 'login'
              ? 'p-0 max-w-none'
              : !isStaffWorkspace
                ? `${activeScreen === 'home' ? 'pt-16' : 'pt-4'} md:pt-8 pb-24 md:pb-12`
                : 'pt-[4.5rem] md:pt-20 pb-24 md:pb-10'
          }`}
        >
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
          <div
            key={`${workspaceMode}-${activeScreen}`}
            className={!isStaffWorkspace ? 'customer-screen-enter' : undefined}
          >
            <CustomerThemeProvider value={{ isLightTheme, toggleTheme }}>
              {children}
            </CustomerThemeProvider>
          </div>
        </main>

        {/* Mobile Bottom Tab Bar */}
        {((!isStaffWorkspace &&
          activeScreen !== 'splash' &&
          activeScreen !== 'login' &&
          activeScreen !== 'privacy-policy' &&
          activeScreen !== 'terms-and-conditions') ||
          isStaff) && (
          <nav className={`md:hidden fixed bottom-0 left-0 right-0 z-40 pb-safe transition-all ${
            isLightTheme
              ? 'bg-[#F4EFEA]/95 border-t border-[#E5DDD2]'
              : 'bg-surface-container-lowest/70 backdrop-blur-2xl border-t border-white/[0.08] shadow-[0_-8px_32px_rgba(0,0,0,0.45)]'
          }`}>
          {isStaff ? (
            <div className="flex items-center justify-around h-16 px-1">
              {visibleMobileStaffTabs.map((tab) => {
                const active = activeScreen === tab.id;
                return (
                  <button
                    key={tab.id}
                    type="button"
                    onClick={() => onNavigate(tab.id, 'staff')}
                    className={`relative flex flex-col items-center justify-center min-w-[54px] min-h-[44px] px-2 py-1 rounded-xl transition-all cursor-pointer ${
                      active
                        ? 'text-primary bg-primary/15 border border-primary/25 font-bold shadow-xs'
                        : 'text-on-surface-variant hover:text-on-surface'
                    }`}
                  >
                    <span
                      className={`material-symbols-outlined text-[22px] ${
                        active ? 'icon-filled text-primary' : ''
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
                className={`relative flex flex-col items-center justify-center min-w-[54px] min-h-[44px] px-2 py-1 rounded-xl transition-all cursor-pointer ${
                  !isActiveInMobilePrimaryTabs || moreDrawerOpen
                    ? 'text-primary bg-primary/15 border border-primary/25 font-bold'
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
            <div className={`flex items-center justify-around h-16 px-1 transition-all ${
              isLightTheme ? 'bg-white border-t border-[#EAE2D7] shadow-[0_-4px_20px_rgba(56,35,25,0.06)]' : ''
            }`}>
              {CUSTOMER_NAV.map((tab) => {
                const active = activeScreen === tab.id;
                return (
                  <button
                    key={tab.id}
                    type="button"
                    onClick={() => onNavigate(tab.id, 'customer')}
                    className={`flex flex-1 min-w-0 flex-col items-center justify-center py-1 px-0.5 transition-all cursor-pointer ${
                      active
                        ? isLightTheme
                          ? 'text-[#382319] font-bold'
                          : 'text-primary font-bold'
                        : isLightTheme
                          ? 'text-[#8C7E74] font-medium hover:text-[#382319]'
                          : 'text-on-surface-variant font-medium'
                    }`}
                  >
                    <div className="relative flex flex-col items-center">
                      <span className={`material-symbols-outlined text-[20px] min-[360px]:text-[22px] transition-transform ${active ? 'scale-110 font-bold' : ''}`}>
                        {tab.icon}
                      </span>
                      {active && (
                        <span className={`w-1 h-1 rounded-full mt-0.5 ${
                          isLightTheme ? 'bg-[#382319]' : 'bg-primary'
                        }`} />
                      )}
                    </div>
                    <span className="text-[10px] min-[360px]:text-[11px] mt-0.5 tracking-tight font-medium truncate max-w-full">
                      {tab.label}
                    </span>
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

        {cartAddedNotice && !isStaffWorkspace && activeScreen !== 'cart' && (
          <div
            role="status"
            aria-live="polite"
            className={`fixed left-1/2 z-[45] flex w-[min(calc(100%-1.5rem),28rem)] -translate-x-1/2 items-center gap-3 rounded-2xl border px-3.5 py-3 shadow-2xl backdrop-blur-xl md:!bottom-5 ${
              isLightTheme
                ? 'border-[#E5DDD2] bg-[#FFFCF8]/95 text-[#24180F]'
                : 'border-white/10 bg-[#211A16]/95 text-on-surface'
            }`}
            style={{ bottom: 'calc(4.75rem + env(safe-area-inset-bottom))' }}
          >
            <span className="material-symbols-outlined !flex h-9 w-9 shrink-0 !items-center !justify-center rounded-full bg-primary/15 !text-[20px] !leading-[20px] text-primary">
              check
            </span>
            <div className="min-w-0 flex-1">
              <p className="text-xs font-bold">Added to cart</p>
              <p className="truncate text-[11px] text-on-surface-variant">
                {cartAddedNotice.quantity > 1 && `${cartAddedNotice.quantity}x `}
                {cartAddedNotice.itemName}
              </p>
            </div>
            <button
              type="button"
              onClick={() => {
                onDismissCartAddedNotice?.();
                onNavigate('cart', 'customer');
              }}
              className="flex shrink-0 items-center gap-1 rounded-xl bg-primary px-3 py-2 text-xs font-bold text-on-primary transition-transform active:scale-95"
            >
              View cart
              <span className="material-symbols-outlined text-[15px]">arrow_forward</span>
            </button>
            <button
              type="button"
              aria-label="Dismiss cart notification"
              onClick={onDismissCartAddedNotice}
              className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-on-surface-variant hover:bg-surface-container-high"
            >
              <span className="material-symbols-outlined text-[17px]">close</span>
            </button>
          </div>
        )}

        {deliveryLocationOpen && (
          <div
            className="fixed inset-0 z-[60] flex items-center justify-center bg-black/55 p-3 backdrop-blur-sm"
            onMouseDown={(event) => {
              if (event.target === event.currentTarget) onCloseDeliveryLocation?.();
            }}
          >
            <section
              role="dialog"
              aria-modal="true"
              aria-labelledby="delivery-location-title"
              className="w-full max-w-md rounded-3xl border border-[#EAE2D7] bg-[#FAF7F2] p-5 shadow-2xl"
            >
              <div className="mb-4 flex items-center justify-between">
                <div>
                  <h2 id="delivery-location-title" className="font-serif text-lg font-bold text-[#1F1610]">
                    Delivery location
                  </h2>
                  <p className="mt-1 text-xs text-[#7A7067]">Where should we bring your order?</p>
                </div>
                <button
                  type="button"
                  aria-label="Close delivery location"
                  onClick={onCloseDeliveryLocation}
                  className="flex h-9 w-9 items-center justify-center rounded-full border border-[#EAE2D7] bg-white text-[#382319]"
                >
                  <span className="material-symbols-outlined text-[20px]">close</span>
                </button>
              </div>

              {savedProfileAddress && savedProfileAddress !== deliveryAddress && (
                <button
                  type="button"
                  onClick={() => setDeliveryAddressDraft(savedProfileAddress)}
                  className="mb-3 flex w-full items-center gap-3 rounded-2xl border border-[#EAE2D7] bg-white p-3 text-left hover:bg-[#F5EFE8]"
                >
                  <span className="material-symbols-outlined text-[#382319]">home</span>
                  <span className="min-w-0 flex-1">
                    <span className="block text-xs font-bold text-[#1F1610]">Use profile address</span>
                    <span className="block truncate text-[11px] text-[#7A7067]">{savedProfileAddress}</span>
                  </span>
                  <span className="material-symbols-outlined text-[18px] text-[#8C7E74]">arrow_forward</span>
                </button>
              )}

              <button
                type="button"
                disabled={gpsStatus === 'locating'}
                onClick={() => {
                  if (gpsCoordinates) {
                    setDeliveryAddressDraft(gpsCoordinates);
                    setGpsMessage('GPS coordinates added. Add your street address or landmark for accurate delivery.');
                  } else {
                    requestCurrentLocation();
                  }
                }}
                className="mb-3 flex w-full items-center gap-2 rounded-2xl border border-[#EAE2D7] bg-white px-3 py-2.5 text-left text-xs font-bold text-[#382319] transition-colors hover:bg-[#F5EFE8] disabled:cursor-wait disabled:opacity-60"
              >
                <span className="material-symbols-outlined text-[18px]">my_location</span>
                <span>{gpsStatus === 'locating' ? 'Getting current location…' : 'Use current location'}</span>
              </button>
              {gpsMessage && (
                <p
                  role="status"
                  aria-live="polite"
                  className={`mb-3 text-[11px] ${
                    gpsStatus === 'error' ? 'text-red-700' : 'text-[#7A7067]'
                  }`}
                >
                  {gpsMessage}
                </p>
              )}

              <label htmlFor="delivery-address-input" className="mb-1.5 block text-xs font-bold text-[#1F1610]">
                Full address and landmark
              </label>
              <textarea
                id="delivery-address-input"
                autoFocus
                rows={3}
                maxLength={240}
                value={deliveryAddressDraft}
                onChange={(event) => setDeliveryAddressDraft(event.target.value)}
                placeholder="House / flat, street, area, city and landmark"
                className="w-full resize-none rounded-2xl border border-[#EAE2D7] bg-white p-3 text-sm text-[#1F1610] placeholder:text-[#A69A8E] focus:border-[#C67C4E] focus:outline-none focus:ring-2 focus:ring-[#C67C4E]/20"
              />
              <p className="mt-1 text-[10px] text-[#8C7E74]">Up to 240 characters</p>

              <div className="mt-4 flex gap-2">
                <button
                  type="button"
                  onClick={onCloseDeliveryLocation}
                  className="flex-1 rounded-2xl border border-[#EAE2D7] bg-white py-3 text-xs font-bold text-[#382319]"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  disabled={deliveryAddressDraft.trim().length < 5}
                  onClick={() => onSaveDeliveryLocation?.(deliveryAddressDraft.trim())}
                  className="flex-1 rounded-2xl bg-[#382319] py-3 text-xs font-bold text-white transition-opacity disabled:cursor-not-allowed disabled:opacity-45"
                >
                  Save location
                </button>
              </div>
            </section>
          </div>
        )}

        {/* Global Floating AI Copilot & Butler: Vishal */}
        <VishalAiAssistant context={assistantContext} />
      </div>
    </div>
  );
};
