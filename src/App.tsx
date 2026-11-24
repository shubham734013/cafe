import { Suspense, lazy, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { AppShell } from './components/AppShell';
import { useCafeApi } from './hooks/useCafeApi';
import { useCafeStore } from './store/useCafeStore';
import { isKitchenPath } from './routing/routes';
import type {
  CafeOrder,
  CafeSettings,
  CafeTable,
  CustomerProfile,
  InventoryIngredient,
  LoyaltyRule,
  MenuItem,
  PaymentMode,
  PromoCampaign,
  ScreenId,
  ServiceMode,
  StaffMember,
  StaffScreenId,
  WorkspaceMode,
} from './types/cafe';
import type { z } from 'zod';
import type { addMenuItemSchema, createOrderSchema, CustomerFeedbackInput } from './shared/schemas';
import { calculateCartTotals, formatOrderCsv, isKitchenActiveOrder } from './utils/cafeLogic';
import { triggerBlobDownload } from './utils/download';
import { notify } from './lib/notifications';
import {
  canStaffRoleAccessScreen,
  formatStaffRoleLabel,
  getDefaultStaffScreenForRole,
} from './utils/rbac';
import type { CustomerAuthSession } from './lib/supabaseClient';

const PosTerminalScreen = lazy(() =>
  import('./components/PosTerminalScreen').then((m) => ({ default: m.PosTerminalScreen }))
);
const KitchenOrdersScreen = lazy(() =>
  import('./components/KitchenOrdersScreen').then((m) => ({ default: m.KitchenOrdersScreen }))
);
const KitchenTablesScreen = lazy(() =>
  import('./components/KitchenTablesScreen').then((m) => ({ default: m.KitchenTablesScreen }))
);
const CustomerCartScreen = lazy(() =>
  import('./components/CustomerCartScreen').then((m) => ({ default: m.CustomerCartScreen }))
);
const CustomerHomeScreen = lazy(() =>
  import('./components/CustomerHomeScreen').then((m) => ({ default: m.CustomerHomeScreen }))
);
const CustomerMenuScreen = lazy(() =>
  import('./components/CustomerMenuScreen').then((m) => ({ default: m.CustomerMenuScreen }))
);
const CustomerRewardsScreen = lazy(() =>
  import('./components/CustomerRewardsScreen').then((m) => ({ default: m.CustomerRewardsScreen }))
);
const CustomerProfileScreen = lazy(() =>
  import('./components/CustomerProfileScreen').then((m) => ({ default: m.CustomerProfileScreen }))
);
const PrivacyPolicyScreen = lazy(() =>
  import('./components/legal/PrivacyPolicyScreen').then((m) => ({ default: m.PrivacyPolicyScreen }))
);
const TermsAndConditionsScreen = lazy(() =>
  import('./components/legal/TermsAndConditionsScreen').then((m) => ({ default: m.TermsAndConditionsScreen }))
);
const CustomerLoginScreen = lazy(() =>
  import('./components/CustomerLoginScreen').then((m) => ({ default: m.CustomerLoginScreen }))
);
const LiveTrackingScreen = lazy(() =>
  import('./components/LiveTrackingScreen').then((m) => ({ default: m.LiveTrackingScreen }))
);
const KitchenPosOrdersScreen = lazy(() =>
  import('./components/KitchenPosOrdersScreen').then((m) => ({
    default: m.KitchenPosOrdersScreen,
  }))
);
const StaffWorkspaceHome = lazy(() =>
  import('./components/StaffWorkspaceHome').then((m) => ({ default: m.StaffWorkspaceHome }))
);
const KitchenDisplayScreen = lazy(() =>
  import('./components/KitchenDisplayScreen').then((m) => ({ default: m.KitchenDisplayScreen }))
);
const AdminDashboardScreen = lazy(() =>
  import('./components/AdminDashboardScreen').then((m) => ({ default: m.AdminDashboardScreen }))
);
const OrderManagementScreen = lazy(() =>
  import('./components/OrderManagementScreen').then((m) => ({ default: m.OrderManagementScreen }))
);
const ReportsAnalyticsScreen = lazy(() =>
  import('./components/ReportsAnalyticsScreen').then((m) => ({ default: m.ReportsAnalyticsScreen }))
);
const TableLayoutScreen = lazy(() =>
  import('./components/TableLayoutScreen').then((m) => ({ default: m.TableLayoutScreen }))
);
const InventoryStockScreen = lazy(() =>
  import('./components/InventoryStockScreen').then((m) => ({ default: m.InventoryStockScreen }))
);
const CrmCustomersScreen = lazy(() =>
  import('./components/CrmCustomersScreen').then((m) => ({ default: m.CrmCustomersScreen }))
);
const LoyaltyRewardsAdminScreen = lazy(() =>
  import('./components/LoyaltyRewardsAdminScreen').then((m) => ({
    default: m.LoyaltyRewardsAdminScreen,
  }))
);
const OffersCampaignsScreen = lazy(() =>
  import('./components/OffersCampaignsScreen').then((m) => ({ default: m.OffersCampaignsScreen }))
);
const StaffRolesScreen = lazy(() =>
  import('./components/StaffRolesScreen').then((m) => ({ default: m.StaffRolesScreen }))
);
const SettingsProfileScreen = lazy(() =>
  import('./components/SettingsProfileScreen').then((m) => ({ default: m.SettingsProfileScreen }))
);
import { CoffeeBrewLoader } from './components/CoffeeBrewLoader';
import { SplashScreen } from './components/SplashScreen';
import {
  AdminDashboardSkeleton,
  CustomerCartSkeleton,
  CustomerHomeScreenSkeleton,
  InventoryStockSkeleton,
  KitchenDisplaySkeleton,
  LiveTrackingSkeleton,
  MenuScreenSkeleton,
  PosTerminalSkeleton,
  ScreenSkeleton,
  TableLayoutSkeleton,
} from './components/SkeletonLoaders';

const AkshatRitualUI = lazy(() =>
  import('./components/AkshatRitualUI').then((m) => ({ default: m.AkshatRitualUI }))
);
const ThermalReceiptModal = lazy(() =>
  import('./components/ThermalReceiptModal').then((m) => ({ default: m.ThermalReceiptModal }))
);

const XLSX_MIME = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';

function ScreenFallback({ screen }: { screen?: ScreenId } = {}) {
  return <ScreenSkeleton screen={screen} />;
}

export default function App() {
  const {
    activeScreen,
    workspaceMode,
    serviceMode,
    selectedTable,
    menuCategory,
    customerCart,
    posCart,
    couponCode,
    cookingNote,
    trackedOrderId,
    navigate,
    setServiceMode,
    setSelectedTable,
    setMenuCategory,
    addCustomerItem,
    updateCustomerQty,
    removeCustomerItem,
    clearCustomerCart,
    addPosItem,
    updatePosQty,
    clearPosCart,
    setCouponCode,
    setCookingNote,
    setTrackedOrderId,
  } = useCafeStore();

  const isKitchenRoute =
    typeof window !== 'undefined' && isKitchenPath(window.location.pathname);

  const {
    data,
    authSession,
    isAuthLoading,
    isError,
    socketConnected,
    errorMessage,
    refetch,
    loginPinMutation,
    logoutPinMutation,
    createOrderMutation,
    createPaymentSessionMutation,
    refreshPaymentStatusMutation,
    advanceOrderMutation,
    payCounterOrderMutation,
    refundOrderMutation,
    cancelOrderItemMutation,
    toggleKotItemMutation,
    toggleMenuAvailabilityMutation,
    addMenuItemMutation,
    updateMenuItemMutation,
    submitOrderFeedbackMutation,
    submitCustomerFeedbackMutation,
    checkInTableMutation,
    reserveTableMutation,
    addTableMutation,
    transferTableMutation,
    mergeTablesMutation,
    restockItemMutation,
    createPurchaseOrderMutation,
    receivePurchaseOrderMutation,
    requestReorderMutation,
    addIngredientMutation,
    addCustomerMutation,
    addLoyaltyRuleMutation,
    createCampaignMutation,
    toggleCampaignMutation,
    addStaffMutation,
    toggleStaffDutyMutation,
    saveSettingsMutation,
    resetSettingsMutation,
  } = useCafeApi(activeScreen, isKitchenRoute, trackedOrderId);

  const [pinModalOpen, setPinModalOpen] = useState(false);
  const [pinInput, setPinInput] = useState('');
  const [pinError, setPinError] = useState<string | null>(null);
  const [restockTarget, setRestockTarget] = useState<InventoryIngredient | null>(null);
  const [restockQuantity, setRestockQuantity] = useState('');
  const [restockUnitCost, setRestockUnitCost] = useState('');
  const [restockError, setRestockError] = useState<string | null>(null);
  const checkoutInFlightRef = useRef(false);
  const customerAttemptKeyRef = useRef<{ signature: string; key: string } | null>(null);
  const posAttemptKeyRef = useRef<{ signature: string; key: string } | null>(null);
  const pendingStaffScreenRef = useRef<StaffScreenId | null>(null);
  const [customerSession, setCustomerSession] = useState<CustomerAuthSession | null>(null);
  const [deliveryAddress, setDeliveryAddress] = useState(() => {
    try {
      return window.localStorage.getItem('cafeos_delivery_address') || '';
    } catch (error) {
      console.warn('Could not read the saved delivery address:', error);
      return '';
    }
  });
  const [deliveryLocationOpen, setDeliveryLocationOpen] = useState(false);
  const [customerRewardsTab, setCustomerRewardsTab] = useState<'offers' | 'rewards'>('offers');
  const [trackingInitialView, setTrackingInitialView] = useState<'track' | 'orders'>('track');
  const needsCustomerAuth = ['login', 'profile', 'rewards', 'tracking', 'cart'].includes(activeScreen);

  useEffect(() => {
    // Account state is not needed for an anonymous landing page. Avoid placing the
    // Supabase client on the first-paint network path.
    if (!needsCustomerAuth) return;

    let active = true;
    let unsubscribe: (() => void) | undefined;

    void import('./lib/supabaseClient')
      .then(async ({
        getLocalCustomerSession,
        subscribeToSupabaseAuth,
        syncCustomerIdentityWithCafe,
        syncSupabaseCustomerSession,
      }) => {
        if (!active) return;
        setCustomerSession(getLocalCustomerSession());

        const syncIdentity = async () => {
          const session = await syncSupabaseCustomerSession();
          if (!active) return;
          if (session) setCustomerSession(session);
          await syncCustomerIdentityWithCafe();
          if (active) await refetch();
        };

        void syncIdentity().catch((error: unknown) => {
          console.error('Could not sync verified customer identity:', error);
        });

        unsubscribe = subscribeToSupabaseAuth((session) => {
          if (!active) return;
          setCustomerSession(session);
          void syncCustomerIdentityWithCafe()
            .then(() => refetch())
            .catch((error: unknown) => {
              console.error('Could not sync verified customer identity:', error);
            });
        });
      })
      .catch((error: unknown) => {
        if (active) console.error('Could not load customer authentication:', error);
      });

    return () => {
      active = false;
      unsubscribe?.();
    };
  }, [needsCustomerAuth, refetch]);

  const {
    orders,
    tables,
    inventory,
    customers,
    loyaltyRules,
    pointLedger,
    campaigns,
    staffRoster,
    cafeSettings,
    rewardPoints,
    menuItems,
    customerReviews,
    activityLog,
    purchaseOrders,
  } = data;

  // Thermal Receipt Modal & Feedback State
  const [thermalModalOrder, setThermalModalOrder] = useState<CafeOrder | null>(null);
  const [thermalModalOpen, setThermalModalOpen] = useState(false);
  const [lastCompletedPosOrder, setLastCompletedPosOrder] = useState<CafeOrder | null>(null);

  const handleOpenThermalReceipt = useCallback(
    (order: CafeOrder) => {
      setThermalModalOrder(order);
      setThermalModalOpen(true);
    },
    []
  );

  const showToast = useCallback((msg: string) => {
    notify('success', msg);
  }, []);

  const showErrorToast = useCallback((err: unknown, fallback: string) => {
    const message = err instanceof Error ? err.message : fallback;
    notify('error', message);
  }, []);

  const handleSaveDeliveryAddress = useCallback(
    (address: string) => {
      try {
        window.localStorage.setItem('cafeos_delivery_address', address);
      } catch (error) {
        console.error('Could not save the delivery address:', error);
        showErrorToast(error, 'Could not save your delivery address.');
        return;
      }
      setDeliveryAddress(address);
      setDeliveryLocationOpen(false);
      showToast('Delivery address saved.');
    },
    [showErrorToast, showToast]
  );

  const [cartAddedNotice, setCartAddedNotice] = useState<{
    itemName: string;
    quantity: number;
  } | null>(null);

  const handleAddCustomerItem = useCallback(
    (item: MenuItem, quantity = 1, size?: string) => {
      addCustomerItem(item, quantity, size);
      setCartAddedNotice({ itemName: item.name, quantity });
    },
    [addCustomerItem]
  );

  const dismissCartAddedNotice = useCallback(() => {
    setCartAddedNotice(null);
  }, []);

  const handleNavigate = useCallback(
    (screen: ScreenId, mode?: WorkspaceMode) => {
      const targetMode = mode ?? workspaceMode;
      if (screen === 'rewards' && targetMode === 'customer') setCustomerRewardsTab('offers');
      if (screen === 'tracking' && targetMode === 'customer') setTrackingInitialView('orders');
      if (targetMode === 'staff' && screen !== 'splash') {
        if (!authSession.authenticated) {
          pendingStaffScreenRef.current = screen as StaffScreenId;
          setPinError(null);
          setPinModalOpen(true);
          return;
        } else if (!canStaffRoleAccessScreen(authSession.session?.role, screen as StaffScreenId)) {
          const fallbackScreen = getDefaultStaffScreenForRole(authSession.session?.role);
          notify(
            'error',
            `${formatStaffRoleLabel(authSession.session?.role)} access does not permit that module.`
          );
          navigate(fallbackScreen, 'staff', {
            ...(authSession.session?.role ? { role: authSession.session.role } : {}),
          });
          window.scrollTo({ top: 0, behavior: 'smooth' });
          return;
        }
      }
      navigate(
        screen,
        mode,
        targetMode === 'staff' && authSession.session?.role
          ? { role: authSession.session.role }
          : undefined
      );
      window.scrollTo({ top: 0, behavior: 'smooth' });
    },
    [authSession.authenticated, authSession.session?.role, navigate]
  );

  const handleStartPayment = useCallback(
    async (orderId: string) => {
      try {
        const result = await createPaymentSessionMutation.mutateAsync(orderId);
        if (result.checkoutUrl) {
          window.location.assign(result.checkoutUrl);
          return;
        }
        if (result.paymentStatus === 'paid') {
          showToast('Payment is already confirmed.');
          setTrackedOrderId(orderId);
          setTrackingInitialView('track');
          handleNavigate('tracking', 'customer');
        }
      } catch (error) {
        throw error;
      }
    },
    [createPaymentSessionMutation, showToast, setTrackedOrderId, handleNavigate]
  );

  const handleRefreshPaymentStatus = useCallback(
    async (orderId: string) => {
      await refreshPaymentStatusMutation.mutateAsync(orderId);
    },
    [refreshPaymentStatusMutation]
  );

  const handleReserveTable = useCallback(
    async (payload: { guestName: string; guestPhone?: string; partySize: number; timeSlot: string }) => {
      const { table } = await reserveTableMutation.mutateAsync(payload);
      setSelectedTable(table.id);
      return table.id;
    },
    [reserveTableMutation, setSelectedTable]
  );

  useEffect(() => {
    if (workspaceMode !== 'staff' || activeScreen === 'splash' || isKitchenRoute) return;
    if (isAuthLoading) return;
    if (!authSession.authenticated) {
      pendingStaffScreenRef.current = activeScreen as StaffScreenId;
      setPinError(null);
      setPinModalOpen(true);
      return;
    }
    if (pinModalOpen) {
      setPinModalOpen(false);
    }
    if (
      authSession.session?.role &&
      !canStaffRoleAccessScreen(authSession.session.role, activeScreen as StaffScreenId)
    ) {
      navigate(getDefaultStaffScreenForRole(authSession.session.role), 'staff', {
        replace: true,
        role: authSession.session.role,
      });
    }
  }, [
    activeScreen,
    authSession.authenticated,
    authSession.session?.role,
    isAuthLoading,
    navigate,
    pinModalOpen,
    workspaceMode,
  ]);

  const handleGlobalPinSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const cleaned = pinInput.trim();
    if (!/^\d{4}$/.test(cleaned)) {
      setPinError('Enter a valid 4-digit staff PIN.');
      return;
    }
    setPinError(null);
    try {
      const sessionState = await loginPinMutation.mutateAsync(cleaned);
      setPinInput('');
      setPinModalOpen(false);
      const role = sessionState.session?.role;
      const requestedScreen = pendingStaffScreenRef.current;
      pendingStaffScreenRef.current = null;
      const targetScreen =
        requestedScreen && canStaffRoleAccessScreen(role, requestedScreen)
          ? requestedScreen
          : workspaceMode === 'staff' &&
              activeScreen !== 'splash' &&
              canStaffRoleAccessScreen(role, activeScreen as StaffScreenId)
            ? activeScreen
          : getDefaultStaffScreenForRole(role);
      navigate(targetScreen, 'staff', {
        replace: true,
        ...(role ? { role } : {}),
      });
      showToast(`Signed in as ${formatStaffRoleLabel(role)}`);
    } catch (err) {
      setPinError(err instanceof Error ? err.message : 'Invalid staff PIN');
    }
  };

  const getStableAttemptKey = (
    ref: { current: { signature: string; key: string } | null },
    prefix: string,
    signature: string
  ): string => {
    if (ref.current && ref.current.signature === signature) {
      return ref.current.key;
    }
    const key =
      typeof crypto !== 'undefined' && crypto.randomUUID
        ? `${prefix}_${crypto.randomUUID()}`
        : `${prefix}_${Date.now()}`;
    ref.current = { signature, key };
    return key;
  };

  const handleCustomerCheckout = useCallback(
    async (selectedPaymentMode: PaymentMode = 'upi', redeemPoints = 0) => {
      if (!customerSession) {
        showToast('Please sign in with your Name, Mobile & Email before placing your order.');
        handleNavigate('login', 'customer');
        return;
      }
      if (customerCart.length === 0 || checkoutInFlightRef.current) return;
      checkoutInFlightRef.current = true;
      try {
        if (serviceMode === 'delivery' && deliveryAddress.trim().length < 5) {
          setDeliveryLocationOpen(true);
          throw new Error('Add a delivery address before placing a delivery order.');
        }
        const table = serviceMode === 'dine-in' ? (selectedTable?.trim() || 'T1') : undefined;
        const signature = JSON.stringify({
          serviceMode,
          selectedTable: table,
          deliveryAddress: serviceMode === 'delivery' ? deliveryAddress.trim() : '',
          couponCode,
          paymentMode: selectedPaymentMode,
          redeemPoints,
          customerId: customerSession.id,
          items: customerCart.map((i) => `${i.menuItemId}:${i.quantity}`),
        });
        const idempotencyKey = getStableAttemptKey(customerAttemptKeyRef, 'cust', signature);
        const res = await createOrderMutation.mutateAsync({
          outletId: data.outletId,
          serviceMode,
          tableNumber: table,
          deliveryAddress: serviceMode === 'delivery' ? deliveryAddress.trim() : undefined,
          deliveryPartner: serviceMode === 'delivery' ? 'Direct Delivery' : undefined,
          items: customerCart,
          couponCode: couponCode.trim(),
          cookingNote: cookingNote.trim(),
          customerName: customerSession.name,
          customerEmail: customerSession.email,
          customerPhone: customerSession.phone,
          isPosTerminal: false,
          paymentMode: selectedPaymentMode,
          redeemPoints,
          customerId: customerSession.id,
          idempotencyKey,
        });
        customerAttemptKeyRef.current = null;
        clearCustomerCart();
        setCookingNote('');
        setTrackedOrderId(res.order.id);
        setTrackingInitialView('track');
        navigate('tracking', 'customer');

        if (selectedPaymentMode === 'upi') {
          showToast(`Order #${res.order.id} reserved. Opening UPI Checkout...`);
          try {
            await handleStartPayment(res.order.id);
          } catch {
            showToast('You can complete payment from the tracking screen.');
          }
        } else {
          showToast(`Order #${res.order.id} confirmed! Please pay on counter.`);
        }
      } catch (err) {
        showErrorToast(err, 'Could not submit order');
      } finally {
        checkoutInFlightRef.current = false;
      }
    },
    [
      clearCustomerCart,
      cookingNote,
      couponCode,
      createOrderMutation,
      customerCart,
      customerSession,
      data.outletId,
      deliveryAddress,
      handleNavigate,
      handleStartPayment,
      navigate,
      selectedTable,
      serviceMode,
      setCookingNote,
      setTrackedOrderId,
      showErrorToast,
      showToast,
    ]
  );

  const handlePosCheckout = useCallback(
    async (
      selectedPaymentMode: PaymentMode = 'cash',
      customerId?: string,
      cookingNote = '',
      customerEmail?: string,
      customerPhone?: string
    ) => {
      if (posCart.length === 0 || checkoutInFlightRef.current) return;
      checkoutInFlightRef.current = true;
      try {
        const table = serviceMode === 'dine-in' ? (selectedTable?.trim() || 'T1') : undefined;
        const signature = JSON.stringify({
          serviceMode,
          selectedTable: table,
          paymentMode: selectedPaymentMode,
          customerId,
          customerEmail,
          customerPhone,
          items: posCart.map((i) => `${i.menuItemId}:${i.quantity}`),
        });
        const idempotencyKey = getStableAttemptKey(posAttemptKeyRef, 'pos', signature);
        const res = await createOrderMutation.mutateAsync({
          outletId: data.outletId,
          serviceMode,
          tableNumber: table,
          deliveryPartner: serviceMode === 'delivery' ? 'Direct Delivery' : undefined,
          items: posCart,
          couponCode: '',
          cookingNote: cookingNote.trim(),
          customerEmail,
          customerPhone,
          isPosTerminal: true,
          paymentMode: selectedPaymentMode,
          customerId,
          idempotencyKey,
        });
        posAttemptKeyRef.current = null;
        setLastCompletedPosOrder(res.order);
        clearPosCart();
        showToast(
          `Counter order #${res.order.id} placed · Paid via ${selectedPaymentMode.toUpperCase()} (₹${res.order.total})`
        );
      } catch (err) {
        showErrorToast(err, 'Failed to punch counter order');
      } finally {
        checkoutInFlightRef.current = false;
      }
    },
    [
      clearPosCart,
      createOrderMutation,
      data.outletId,
      posCart,
      selectedTable,
      serviceMode,
      showErrorToast,
      showToast,
    ]
  );

  const handleToggleMenuAvailability = useCallback(
    async (menuItemId: string) => {
      try {
        const res = await toggleMenuAvailabilityMutation.mutateAsync(menuItemId);
        showToast(
          `${res.item.name} is now ${res.item.isAvailable !== false ? 'IN STOCK' : 'SOLD OUT (86)'}`
        );
      } catch (err) {
        showErrorToast(err, 'Could not toggle item availability');
      }
    },
    [showErrorToast, showToast, toggleMenuAvailabilityMutation]
  );

  const handleAddMenuItem = useCallback(
    async (payload: z.infer<typeof addMenuItemSchema>) => {
      try {
        const res = await addMenuItemMutation.mutateAsync(payload);
        showToast(`Added ${res.item.name} to ${res.item.category}!`);
      } catch (err) {
        showErrorToast(err, 'Could not add product');
        throw err;
      }
    },
    [addMenuItemMutation, showErrorToast, showToast]
  );

  const handleUpdateMenuItem = useCallback(
    async (id: string, updates: Partial<MenuItem>) => {
      try {
        const res = await updateMenuItemMutation.mutateAsync({ id, updates });
        showToast(`Updated ${res.item.name}!`);
      } catch (err) {
        showErrorToast(err, 'Could not update product');
        throw err;
      }
    },
    [showErrorToast, showToast, updateMenuItemMutation]
  );

  const handleCreateCounterOrder = useCallback(
    async (
      payload: z.infer<typeof createOrderSchema>,
      paidBy: 'cash' | 'card' | 'upi' = 'cash'
    ): Promise<CafeOrder> => {
      try {
        const res = await createOrderMutation.mutateAsync({
          ...payload,
          isPosTerminal: true,
          paymentMode: paidBy,
        });
        const paymentLabel =
          paidBy === 'cash'
            ? 'Paid by Cash'
            : paidBy === 'upi'
              ? 'Paid by UPI'
              : 'Paid by Card';
        showToast(`Counter order #${res.order.id} placed · ${paymentLabel} (₹${res.order.total})`);
        return res.order;
      } catch (err) {
        showErrorToast(err, 'Could not place counter order');
        throw err;
      }
    },
    [createOrderMutation, showErrorToast, showToast]
  );

  const handlePayCounterOrder = useCallback(
    async (orderId: string, paymentMode: 'cash' | 'card' | 'upi' = 'cash'): Promise<void> => {
      try {
        const res = await payCounterOrderMutation.mutateAsync({ orderId, paymentMode });
        const modeLabel = paymentMode === 'cash' ? 'Cash' : paymentMode === 'card' ? 'Card Swipe' : 'UPI';
        showToast(`Order #${res.order.id} settled as Paid via ${modeLabel} (₹${res.order.total})`);
      } catch (err) {
        showErrorToast(err, 'Could not record counter payment');
        throw err;
      }
    },
    [payCounterOrderMutation, showErrorToast, showToast]
  );

  const handleQuickAddCustomer = useCallback(
    async (name: string, phone: string) => {
      try {
        await addCustomerMutation.mutateAsync({
          name,
          phone,
          segment: 'new',
          favorites: '',
          dpdpConsent: true,
        });
        showToast(`Customer ${name} registered for loyalty!`);
      } catch (err) {
        showErrorToast(err, 'Could not register customer');
      }
    },
    [addCustomerMutation, showErrorToast, showToast]
  );

  const handleSubmitFeedback = useCallback(
    (orderId: string, rating: number, tags: string[], comment: string) =>
      submitOrderFeedbackMutation.mutateAsync({
        orderId,
        rating,
        tags,
        comment,
      }),
    [submitOrderFeedbackMutation]
  );

  const handleSubmitCustomerFeedback = useCallback(
    async (feedback: CustomerFeedbackInput) => {
      await submitCustomerFeedbackMutation.mutateAsync(feedback);
    },
    [submitCustomerFeedbackMutation]
  );

  const handleToggleKotItem = useCallback(
    async (orderId: string, menuItemId: string) => {
      try {
        await toggleKotItemMutation.mutateAsync({ orderId, menuItemId });
      } catch (err) {
        showErrorToast(err, 'Could not update KOT item');
      }
    },
    [showErrorToast, toggleKotItemMutation]
  );

  const handleAdvanceOrderStatus = useCallback(
    async (orderId: string) => {
      try {
        const res = await advanceOrderMutation.mutateAsync(orderId);
        showToast(`Order #${res.order.id} updated to ${res.order.status.toUpperCase()}`);
      } catch (err) {
        showErrorToast(err, 'Could not advance order status');
      }
    },
    [advanceOrderMutation, showErrorToast, showToast]
  );

  const handleRefundOrder = useCallback(
    async (orderId: string, reason: string) => {
      try {
        await refundOrderMutation.mutateAsync({ orderId, reason });
        showToast(`Order #${orderId} refunded successfully`);
      } catch (err) {
        showErrorToast(err, 'Failed to refund order');
      }
    },
    [refundOrderMutation, showErrorToast, showToast]
  );

  const handleCancelKotItem = useCallback(
    async (orderId: string, menuItemId: string, reason?: string, quantity?: number) => {
      try {
        const res = await cancelOrderItemMutation.mutateAsync({
          orderId,
          menuItemId,
          reason,
          quantity,
        });
        showToast(res.message || `Item cancelled and ₹${res.refundAmount} refunded`);
        return res;
      } catch (err) {
        showErrorToast(err, 'Failed to cancel item & refund');
        throw err;
      }
    },
    [cancelOrderItemMutation, showErrorToast, showToast]
  );

  const handleExportCsv = useCallback(() => {
    triggerBlobDownload('seth-sawariya-cafe-orders.csv', formatOrderCsv(orders), 'text/csv;charset=utf-8;');
    showToast('Exported Seth Sawariya CafeOS CSV report');
  }, [orders, showToast]);

  const handleExportOrdersExcel = useCallback(async () => {
    try {
      const { buildOrdersExcelBuffer } = await import('./utils/exporters');
      const buf = await buildOrdersExcelBuffer(orders);
      triggerBlobDownload('seth-sawariya-orders.xlsx', buf, XLSX_MIME);
      showToast('Exported Seth Sawariya Orders Excel (.xlsx)');
    } catch (err) {
      showErrorToast(err, 'Excel export failed');
    }
  }, [orders, showErrorToast, showToast]);

  const handleExportInventoryExcel = useCallback(async () => {
    try {
      const { buildInventoryExcelBuffer } = await import('./utils/exporters');
      const buf = await buildInventoryExcelBuffer(inventory);
      triggerBlobDownload('seth-sawariya-inventory.xlsx', buf, XLSX_MIME);
      showToast('Exported Inventory Excel (.xlsx)');
    } catch (err) {
      showErrorToast(err, 'Inventory export failed');
    }
  }, [inventory, showErrorToast, showToast]);

  const handleExportCustomersExcel = useCallback(async () => {
    try {
      const { buildCustomersExcelBuffer } = await import('./utils/exporters');
      const buf = await buildCustomersExcelBuffer(customers);
      triggerBlobDownload('seth-sawariya-customers.xlsx', buf, XLSX_MIME);
      showToast('Exported CRM Customer Directory (.xlsx)');
    } catch (err) {
      showErrorToast(err, 'CRM export failed');
    }
  }, [customers, showErrorToast, showToast]);

  const handleExportLedgerExcel = useCallback(async () => {
    try {
      const { buildLoyaltyLedgerExcelBuffer } = await import('./utils/exporters');
      const buf = await buildLoyaltyLedgerExcelBuffer(pointLedger);
      triggerBlobDownload('seth-sawariya-loyalty-ledger.xlsx', buf, XLSX_MIME);
      showToast('Exported Loyalty Ledger Excel (.xlsx)');
    } catch (err) {
      showErrorToast(err, 'Ledger export failed');
    }
  }, [pointLedger, showErrorToast, showToast]);

  const handleDownloadInvoicePdf = useCallback(
    async (order: CafeOrder) => {
      try {
        const { generateOrderInvoicePdfBlob } = await import('./components/CafePdfDocuments');
        const blob = await generateOrderInvoicePdfBlob(order, cafeSettings);
        triggerBlobDownload(`invoice-${order.id}.pdf`, blob, 'application/pdf');
        showToast(`Downloaded GST Invoice PDF for #${order.id}`);
      } catch (err) {
        showErrorToast(err, 'Could not generate PDF invoice');
      }
    },
    [cafeSettings, showErrorToast, showToast]
  );

  const handleDownloadReportPdf = useCallback(
    async (args: {
      timeframeLabel: string;
      totalRevenue: number;
      totalOrders: number;
      avgOrderValue: number;
    }) => {
      try {
        const { generateSalesReportPdfBlob } = await import('./components/CafePdfDocuments');
        const blob = await generateSalesReportPdfBlob({
          orders,
          settings: cafeSettings,
          ...args,
        });
        triggerBlobDownload('seth-sawariya-sales-report.pdf', blob, 'application/pdf');
        showToast(`Downloaded ${args.timeframeLabel} Sales Summary PDF`);
      } catch (err) {
        showErrorToast(err, 'Could not generate PDF report');
      }
    },
    [cafeSettings, orders, showErrorToast, showToast]
  );

  const handleExportCustomerPii = useCallback(
    async (customer: CustomerProfile) => {
      try {
        const res = await fetch(`/api/customers/${encodeURIComponent(customer.id)}/export`);
        const payload = res.ok
          ? await res.json()
          : { exportedAt: new Date().toISOString(), dpdpCompliance: 'INDIA_DPDP_2023', customer };
        triggerBlobDownload(
          `dpdp-export-${customer.phone}.json`,
          JSON.stringify(payload, null, 2),
          'application/json'
        );
        showToast(`Exported DPDP data package for ${customer.name}`);
      } catch (err) {
        showErrorToast(err, 'Could not export customer PII');
      }
    },
    [showErrorToast, showToast]
  );

  const handleRestockItem = useCallback(
    (id: string) => {
      const item = inventory.find((ingredient) => ingredient.id === id);
      if (!item) {
        showErrorToast(new Error('Ingredient not found'), 'Failed to restock ingredient');
        return;
      }
      setRestockTarget(item);
      setRestockQuantity('');
      setRestockUnitCost(String(item.unitCost));
      setRestockError(null);
    },
    [inventory, showErrorToast]
  );

  const handleSubmitRestock = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!restockTarget) return;
    const quantity = Number(restockQuantity);
    const unitCost = Number(restockUnitCost);
    if (!Number.isFinite(quantity) || quantity <= 0) {
      setRestockError('Enter a restock quantity greater than zero.');
      return;
    }
    if (!Number.isFinite(unitCost) || unitCost < 0) {
      setRestockError('Enter a valid non-negative unit price.');
      return;
    }
    const totalCost = quantity * unitCost;
    if (!Number.isFinite(totalCost)) {
      setRestockError('The total cost is too large.');
      return;
    }
    try {
      await restockItemMutation.mutateAsync({
        id: restockTarget.id,
        addedQty: quantity,
        unitCost,
      });
      showToast(
        `Restocked ${quantity} ${restockTarget.unit} of ${restockTarget.name} · ₹${unitCost.toFixed(2)}/${restockTarget.unit} · Total ₹${totalCost.toFixed(2)}`
      );
      setRestockTarget(null);
    } catch (error) {
      showErrorToast(error, 'Failed to restock ingredient');
    }
  };

  const handleRequestIngredientReorder = useCallback(
    async (ingredientId: string, note?: string) => {
      try {
        await requestReorderMutation.mutateAsync({ id: ingredientId, note });
      } catch (err) {
        showErrorToast(err, 'Failed to send reorder request');
      }
    },
    [requestReorderMutation, showErrorToast]
  );

  const handleAddIngredient = useCallback(
    async (payload: Omit<InventoryIngredient, 'id' | 'status' | 'fillPct'>) => {
      try {
        const unit = (['kg', 'g', 'L', 'ml', 'pcs'].includes(payload.unit)
          ? payload.unit
          : 'kg') as 'kg' | 'g' | 'L' | 'ml' | 'pcs';
        await addIngredientMutation.mutateAsync({
          name: payload.name,
          quantity: payload.quantity,
          unit,
          minThreshold: payload.minThreshold,
          supplier: payload.supplier,
          unitCost: payload.unitCost,
        });
        showToast(`Added ingredient "${payload.name}" to inventory`);
      } catch (err) {
        showErrorToast(err, 'Failed to add ingredient');
        throw err;
      }
    },
    [addIngredientMutation, showErrorToast, showToast]
  );

  const handleCreatePurchaseOrder = useCallback(
    async (payload: {
      supplier: string;
      note?: string;
      lines: Array<{ ingredientId: string; quantity: number; unitCost: number }>;
    }) => {
      try {
        await createPurchaseOrderMutation.mutateAsync(payload);
        showToast('Purchase order created');
      } catch (err) {
        showErrorToast(err, 'Failed to create purchase order');
      }
    },
    [createPurchaseOrderMutation, showErrorToast, showToast]
  );

  const handleReceivePurchaseOrder = useCallback(
    async (payload: {
      purchaseOrderId: string;
      receivedLines: Array<{
        ingredientId: string;
        quantity: number;
        batchNumber?: string;
        expiryDate?: string;
      }>;
    }) => {
      try {
        await receivePurchaseOrderMutation.mutateAsync(payload);
        showToast('Purchase order receipt recorded');
      } catch (err) {
        showErrorToast(err, 'Failed to receive purchase order');
      }
    },
    [receivePurchaseOrderMutation, showErrorToast, showToast]
  );

  const handleCheckInTable = useCallback(
    async (tableId: string) => {
      try {
        await checkInTableMutation.mutateAsync(tableId);
        showToast(`Checked in party at Table ${tableId}`);
      } catch (err) {
        showErrorToast(err, 'Could not check in table');
      }
    },
    [checkInTableMutation, showErrorToast, showToast]
  );

  const handleAddTable = useCallback(
    async (table: CafeTable) => {
      try {
        await addTableMutation.mutateAsync({
          id: table.id,
          seats: table.seats,
          zone: table.zone,
          floor: table.floor,
        });
        showToast(`Added ${table.label} (${table.seats}S) to ${table.floor}`);
      } catch (err) {
        showErrorToast(err, 'Failed to add table');
      }
    },
    [addTableMutation, showErrorToast, showToast]
  );

  const handleTransferTable = useCallback(
    async (sourceTableId: string, targetTableId: string) => {
      try {
        await transferTableMutation.mutateAsync({ sourceTableId, targetTableId });
        showToast(`Transferred active KOT from ${sourceTableId} to ${targetTableId}`);
      } catch (err) {
        showErrorToast(err, 'Table transfer failed');
      }
    },
    [showErrorToast, showToast, transferTableMutation]
  );

  const handleMergeTables = useCallback(
    async (sourceTableId: string, targetTableId: string) => {
      try {
        await mergeTablesMutation.mutateAsync({ sourceTableId, targetTableId });
        showToast(`Merged ${sourceTableId} orders into ${targetTableId}`);
      } catch (err) {
        showErrorToast(err, 'Table merge failed');
      }
    },
    [mergeTablesMutation, showErrorToast, showToast]
  );

  const handleAddCustomer = useCallback(
    async (customer: Omit<CustomerProfile, 'id'>) => {
      try {
        await addCustomerMutation.mutateAsync({
          name: customer.name,
          phone: customer.phone,
          segment: customer.segment,
          favorites: customer.favorites,
          note: customer.note,
          dpdpConsent: true,
        });
        showToast(`Added customer ${customer.name} to CRM`);
      } catch (err) {
        showErrorToast(err, 'Failed to add customer');
      }
    },
    [addCustomerMutation, showErrorToast, showToast]
  );

  const handleAddLoyaltyRule = useCallback(
    async (rule: Omit<LoyaltyRule, 'id'>) => {
      try {
        await addLoyaltyRuleMutation.mutateAsync({
          title: rule.title,
          headline: rule.headline,
          badge: rule.badge,
          description: rule.description,
        });
        showToast(`Added loyalty rule: ${rule.title}`);
      } catch (err) {
        showErrorToast(err, 'Failed to add loyalty rule');
      }
    },
    [addLoyaltyRuleMutation, showErrorToast, showToast]
  );

  const handleCreateCampaign = useCallback(
    async (campaign: Omit<PromoCampaign, 'id'>) => {
      try {
        await createCampaignMutation.mutateAsync({
          title: campaign.title,
          code: campaign.code,
          discountPercentage: campaign.discountPercentage ?? 0,
          minimumOrderAmount: campaign.minimumOrderAmount ?? 0,
          validityLabel: campaign.validityLabel,
          description: campaign.description,
          targetSegment: campaign.targetSegment ?? 'all',
        });
        showToast(`Created promo campaign "${campaign.title}" (${campaign.code})`);
      } catch (err) {
        showErrorToast(err, 'Failed to create campaign');
      }
    },
    [createCampaignMutation, showErrorToast, showToast]
  );

  const handleToggleCampaignStatus = useCallback(
    async (id: string) => {
      try {
        const res = (await toggleCampaignMutation.mutateAsync(id)) as {
          campaign?: PromoCampaign;
        };
        if (res.campaign) {
          showToast(
            `${res.campaign.title} ${
              res.campaign.status === 'active'
                ? 'activated'
                : res.campaign.status === 'paused'
                  ? 'paused'
                  : res.campaign.status
            }`
          );
        }
      } catch (err) {
        showErrorToast(err, 'Failed to toggle campaign');
      }
    },
    [showErrorToast, showToast, toggleCampaignMutation]
  );

  const handleAddStaff = useCallback(
    async (member: Omit<StaffMember, 'id'>) => {
      try {
        const allowedRoles = ['Admin', 'Kitchen'] as const;
        const role = allowedRoles.includes(member.role as (typeof allowedRoles)[number])
          ? (member.role as (typeof allowedRoles)[number])
          : 'Kitchen';
        await addStaffMutation.mutateAsync({
          name: member.name,
          role,
          shiftLabel: member.shiftLabel,
          phone: member.phone || undefined,
        });
        showToast(`Added ${member.name} (${member.role}) to shift roster`);
      } catch (err) {
        showErrorToast(err, 'Failed to add staff member');
      }
    },
    [addStaffMutation, showErrorToast, showToast]
  );

  const handleToggleStaffDuty = useCallback(
    async (id: string) => {
      try {
        const res = (await toggleStaffDutyMutation.mutateAsync(id)) as {
          member?: StaffMember;
        };
        if (res.member) {
          showToast(
            `${res.member.name} clocked ${res.member.isOnDuty ? 'IN (On Duty)' : 'OUT (Off Duty)'}`
          );
        }
      } catch (err) {
        showErrorToast(err, 'Failed to update staff status');
      }
    },
    [showErrorToast, showToast, toggleStaffDutyMutation]
  );

  const handleSaveSettings = useCallback(
    async (next: CafeSettings): Promise<boolean> => {
      try {
        await saveSettingsMutation.mutateAsync(next);
        showToast(`Saved profile for ${next.cafeName}`);
        return true;
      } catch (err) {
        showErrorToast(err, 'Failed to save settings');
        return false;
      }
    },
    [saveSettingsMutation, showErrorToast, showToast]
  );

  const handleResetSettings = useCallback(async (): Promise<boolean> => {
    try {
      await resetSettingsMutation.mutateAsync();
      showToast('Restored Seth Sawariya CafeOS default settings');
      return true;
    } catch (err) {
      showErrorToast(err, 'Failed to reset settings');
      return false;
    }
  }, [resetSettingsMutation, showErrorToast, showToast]);

  const customerTotals = useMemo(
    () =>
      calculateCartTotals(
        customerCart,
        couponCode,
        serviceMode,
        false,
        campaigns,
        0,
        Boolean(data.firstOrderEligible)
      ),
    [campaigns, couponCode, customerCart, data.firstOrderEligible, serviceMode]
  );

  const liveKotCount = useMemo(
    () => orders.filter(isKitchenActiveOrder).length,
    [orders]
  );

  const activeTrackedOrder = useMemo(
    () => orders.find((o) => o.id === trackedOrderId) || orders[0],
    [orders, trackedOrderId]
  );

  const isStaffRouteBlocked =
    workspaceMode === 'staff' &&
    activeScreen !== 'splash' &&
    (!authSession.authenticated ||
      !authSession.session?.role ||
      !canStaffRoleAccessScreen(authSession.session.role, activeScreen as StaffScreenId));

  const [splashFinished, setSplashFinished] = useState(false);
  const [splashDestination, setSplashDestination] = useState<'home' | 'login'>('home');
  const [customerLoginInitialTab, setCustomerLoginInitialTab] = useState<'register' | 'login'>('register');
  const finishSplash = useCallback(
    (destination: 'home' | 'login' = 'home', initialTab: 'register' | 'login' = 'register') => {
      setSplashDestination(destination);
      setCustomerLoginInitialTab(initialTab);
      setSplashFinished(true);
    },
    []
  );
  const refreshedHomeAfterSplash = useRef(false);

  useEffect(() => {
    if (activeScreen === 'splash' && splashFinished && !isError) {
      setSplashFinished(false);
      navigate(splashDestination, 'customer', { replace: true });
    }
  }, [activeScreen, isError, navigate, splashDestination, splashFinished]);

  useEffect(() => {
    if (activeScreen !== 'home' || !splashFinished || refreshedHomeAfterSplash.current) return;
    refreshedHomeAfterSplash.current = true;
    void refetch();
  }, [activeScreen, refetch, splashFinished]);

  if (activeScreen === 'splash') {
    return (
      <SplashScreen
        errorMessage={isError ? errorMessage : undefined}
        onRetry={() => void refetch()}
        onFinish={finishSplash}
      />
    );
  }

  if (activeScreen === 'akshat') {
    return (
      <Suspense fallback={<ScreenSkeleton screen={activeScreen} />}>
        <AkshatRitualUI onSwitchToCafe={() => handleNavigate('home', 'customer')} />
      </Suspense>
    );
  }

  return (
    <AppShell
      activeScreen={activeScreen}
      workspaceMode={workspaceMode}
      cartCount={customerTotals.itemCount}
      cartAddedNotice={cartAddedNotice}
      onDismissCartAddedNotice={dismissCartAddedNotice}
      liveKotCount={liveKotCount}
      cafeName={cafeSettings.cafeName}
      cafeLogoUrl={cafeSettings.logoUrl || '/images/tsc-logo.jpg'}
      authSession={authSession}
      deliveryAddress={deliveryAddress}
      deliveryLocationOpen={deliveryLocationOpen}
      onOpenDeliveryLocation={() => setDeliveryLocationOpen(true)}
      onCloseDeliveryLocation={() => setDeliveryLocationOpen(false)}
      onSaveDeliveryLocation={handleSaveDeliveryAddress}
      assistantContext={{
        activeOrder: activeTrackedOrder,
        menuItems,
        availableBeans: rewardPoints,
        cafeSettings,
        campaigns,
        orders,
        tables,
        inventory,
        authSession,
      }}
      isSyncError={isError}
      syncErrorMessage={errorMessage}
      onRetrySync={() => void refetch()}
      onLockStaff={() => {
        void logoutPinMutation
          .mutateAsync()
          .then(() => {
            showToast('Staff session locked');
            handleNavigate('home', 'customer');
          })
          .catch((err) => showErrorToast(err, 'Could not lock session'));
      }}
      onNavigate={handleNavigate}
    >
      {activeScreen === 'home' && (
        <Suspense fallback={<CustomerHomeScreenSkeleton />}>
          <CustomerHomeScreen
            cartCount={customerTotals.itemCount}
            cart={customerCart}
            orders={orders}
            customerReviews={customerReviews}
            menuItems={menuItems}
            firstOrderEligible={Boolean(data.firstOrderEligible)}
            showFirstOrderOffer={!customerSession || Boolean(data.firstOrderEligible)}
            onNavigateMenu={(cat) => {
              setMenuCategory(cat ?? 'All');
              handleNavigate('menu', 'customer');
            }}
            onNavigateCart={() => handleNavigate('cart', 'customer')}
            onNavigateRewards={() => handleNavigate('rewards', 'customer')}
            onAddToCart={handleAddCustomerItem}
            onUpdateQty={updateCustomerQty}
            onSubmitFeedback={handleSubmitCustomerFeedback}
            onNotify={showToast}
          />
        </Suspense>
      )}

      {activeScreen === 'menu' && (
        <Suspense fallback={<MenuScreenSkeleton />}>
          <CustomerMenuScreen
            items={menuItems}
            serviceMode={serviceMode}
            selectedTable={selectedTable}
            activeCategory={menuCategory}
            onCategoryChange={setMenuCategory}
            cart={customerCart}
            cartTotal={customerTotals.total}
            cartCount={customerTotals.itemCount}
            onAddToCart={handleAddCustomerItem}
            onUpdateQty={updateCustomerQty}
            onNavigateCart={() => handleNavigate('cart', 'customer')}
            onNavigateHome={() => handleNavigate('home', 'customer')}
            onToggleServiceMode={() => {
              const order: ServiceMode[] = ['dine-in', 'takeaway', 'delivery'];
              const next = order[(order.indexOf(serviceMode) + 1) % order.length];
              setServiceMode(next);
              showToast(`Switched mode to ${next}`);
            }}
          />
        </Suspense>
      )}

      {activeScreen === 'cart' && (
        <Suspense fallback={<CustomerCartSkeleton />}>
          <CustomerCartScreen
            cart={customerCart}
            serviceMode={serviceMode}
            selectedTable={selectedTable}
            tables={tables}
            campaigns={campaigns}
            firstOrderEligible={Boolean(data.firstOrderEligible)}
            availablePoints={rewardPoints}
            couponCode={couponCode}
            cookingNote={cookingNote}
            customerSession={customerSession}
            deliveryAddress={deliveryAddress}
            onOpenDeliveryLocation={() => setDeliveryLocationOpen(true)}
            onNavigateLogin={() => handleNavigate('login', 'customer')}
            onServiceModeChange={setServiceMode}
            onTableChange={setSelectedTable}
            onReserveTable={({ guests }) =>
              handleReserveTable({
                guestName: customerSession?.name || 'Cafe Guest',
                ...(customerSession?.phone ? { guestPhone: customerSession.phone } : {}),
                partySize: Number.parseInt(guests, 10) || 2,
                timeSlot: 'Walk-in - Now',
              })
            }
            onUpdateQty={updateCustomerQty}
            onRemoveItem={removeCustomerItem}
            onCouponChange={setCouponCode}
            onCookingNoteChange={setCookingNote}
            onCheckout={handleCustomerCheckout}
            onBrowseMenu={() => handleNavigate('menu', 'customer')}
          />
        </Suspense>
      )}

      {activeScreen === 'tracking' && (
        <Suspense fallback={<LiveTrackingSkeleton />}>
          <LiveTrackingScreen
            initialView={trackingInitialView}
            activeOrder={activeTrackedOrder}
            allOrders={orders}
            availableBeans={rewardPoints}
            menuItems={menuItems}
            cafeSettings={cafeSettings}
            campaigns={campaigns}
            onSelectOrder={setTrackedOrderId}
            onDownloadInvoicePdf={handleDownloadInvoicePdf}
            onStartPayment={handleStartPayment}
            onRefreshPayment={handleRefreshPaymentStatus}
            onSubmitFeedback={handleSubmitFeedback}
            onPrintThermalReceipt={handleOpenThermalReceipt}
            onNotify={showToast}
            onBackToMenu={() => handleNavigate('menu', 'customer')}
          />
        </Suspense>
      )}

      {activeScreen === 'rewards' && (
        <Suspense fallback={<ScreenSkeleton screen={activeScreen} />}>
          <CustomerRewardsScreen
            points={rewardPoints}
            campaigns={campaigns}
            initialTab={customerRewardsTab}
            hasMatchedCustomerProfile={Boolean(data.customerHasMatchedProfile)}
            onRedeemCoupon={(code) => {
              setCouponCode(code);
              handleNavigate('cart', 'customer');
              showToast(`Coupon ${code} selected for your cart`);
            }}
            onNavigateProfile={() => handleNavigate('profile', 'customer')}
            onNotify={showToast}
            onBrowseMenu={() => handleNavigate('menu', 'customer')}
            onNavigateCart={() => handleNavigate('cart', 'customer')}
          />
        </Suspense>
      )}

      {activeScreen === 'profile' && (
        <Suspense fallback={<ScreenSkeleton screen={activeScreen} />}>
          <CustomerProfileScreen
            onNotify={showToast}
            onBrowseMenu={() => handleNavigate('menu', 'customer')}
            onNavigateOrders={() => handleNavigate('tracking', 'customer')}
            onNavigateRewards={() => {
              setCustomerRewardsTab('rewards');
              navigate('rewards', 'customer');
            }}
            onNavigateOffers={() => handleNavigate('rewards', 'customer')}
            onSessionChange={setCustomerSession}
            onNavigateLogin={() => handleNavigate('login', 'customer')}
            onNavigatePrivacyPolicy={() => handleNavigate('privacy-policy', 'customer')}
            onNavigateTerms={() => handleNavigate('terms-and-conditions', 'customer')}
            assistantContext={{
              activeOrder: activeTrackedOrder,
              menuItems,
              availableBeans: rewardPoints,
              cafeSettings,
              campaigns,
            }}
          />
        </Suspense>
      )}

      {activeScreen === 'login' && (
        <Suspense fallback={<ScreenSkeleton screen={activeScreen} />}>
          <CustomerLoginScreen
            initialTab={customerLoginInitialTab}
            onNotify={showToast}
            hasCartItems={customerCart.length > 0}
            onLocalTestSessionChange={setCustomerSession}
            onReturnToCart={() => handleNavigate('cart', 'customer')}
            onSuccess={() => {
              if (customerCart.length > 0) {
                showToast('Signed in successfully! You can now place your order.');
                handleNavigate('cart', 'customer');
              } else {
                handleNavigate('profile', 'customer');
              }
            }}
            onBrowseMenu={() => handleNavigate('menu', 'customer')}
          />
        </Suspense>
      )}

      {activeScreen === 'privacy-policy' && (
        <Suspense fallback={<ScreenSkeleton screen={activeScreen} />}>
          <PrivacyPolicyScreen onBack={() => handleNavigate('menu', 'customer')} />
        </Suspense>
      )}

      {activeScreen === 'terms-and-conditions' && (
        <Suspense fallback={<ScreenSkeleton screen={activeScreen} />}>
          <TermsAndConditionsScreen onBack={() => handleNavigate('menu', 'customer')} />
        </Suspense>
      )}

      {isStaffRouteBlocked ? (
        <div className="flex min-h-[50vh] flex-col items-center justify-center gap-3 px-5 text-center">
          <span className="material-symbols-outlined text-3xl text-primary">lock</span>
          <h1 className="text-lg font-bold text-on-surface">Staff workspace locked</h1>
          <p className="max-w-sm text-sm text-on-surface-variant">
            {!authSession.authenticated
              ? 'Enter a staff PIN to access this module.'
              : 'Your staff role does not have access to this module.'}
          </p>
          {!authSession.authenticated && (
            <button
              type="button"
              onClick={() => {
                setPinError(null);
                setPinModalOpen(true);
              }}
              className="rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-on-primary"
            >
              Unlock Staff Workspace
            </button>
          )}
        </div>
      ) : (
      <Suspense fallback={<ScreenSkeleton screen={activeScreen} />}>
        {activeScreen === 'staff-home' && authSession.session?.role && (
          <StaffWorkspaceHome
            role={authSession.session.role}
            onNavigate={(screen) => handleNavigate(screen, 'staff')}
          />
        )}

        {activeScreen === 'pos-terminal' && (
          <PosTerminalScreen
            posCart={posCart}
            serviceMode={serviceMode}
            selectedTable={selectedTable}
            tables={tables}
            menuItems={menuItems}
            customers={customers}
            isSubmitting={createOrderMutation.isPending}
            lastCompletedOrder={lastCompletedPosOrder}
            onServiceModeChange={setServiceMode}
            onTableChange={setSelectedTable}
            onAddPosItem={addPosItem}
            onUpdatePosQty={updatePosQty}
            onClearPosCart={clearPosCart}
            onCompletePosOrder={handlePosCheckout}
            onToggleItemAvailability={handleToggleMenuAvailability}
            onQuickAddCustomer={handleQuickAddCustomer}
            onPrintReceipt={handleOpenThermalReceipt}
          />
        )}

        {activeScreen === 'kitchen-display-system' && (
          <KitchenDisplayScreen
            orders={orders}
            inventory={inventory}
            menuItems={menuItems}
            isConnected={socketConnected}
            onRefresh={() => void refetch()}
            onToggleKotItem={handleToggleKotItem}
            onCancelKotItem={handleCancelKotItem}
            onAdvanceOrderStatus={handleAdvanceOrderStatus}
            onRequestReorder={handleRequestIngredientReorder}
            onToggleMenuAvailability={handleToggleMenuAvailability}
            onNotify={showToast}
          />
        )}

        {activeScreen === 'pos-orders' && (
          <KitchenPosOrdersScreen
            orders={orders}
            onAdvanceOrderStatus={handleAdvanceOrderStatus}
            onToggleKotItem={handleToggleKotItem}
            onCancelKotItem={handleCancelKotItem}
            onNotify={showToast}
          />
        )}

        {activeScreen === 'admin-dashboard' && (
          <AdminDashboardScreen
            orders={orders}
            inventory={inventory}
            isConnected={socketConnected}
            tables={tables}
            activityLog={activityLog}
            customers={customers}
            menuItems={menuItems}
            staffRoster={staffRoster}
            onRestockItem={handleRestockItem}
            onNavigateStaff={(screen) => handleNavigate(screen, 'staff')}
            onExportCsv={handleExportOrdersExcel}
            onAddMenuItem={handleAddMenuItem}
            onUpdateMenuItem={handleUpdateMenuItem}
            onToggleMenuAvailability={handleToggleMenuAvailability}
            onCreateCounterOrder={handleCreateCounterOrder}
            onPayCounterOrder={handlePayCounterOrder}
          />
        )}

        {activeScreen === 'order-management' && isKitchenRoute && (
          <KitchenOrdersScreen
            orders={orders}
            menuItems={menuItems}
            onAdvanceOrderStatus={handleAdvanceOrderStatus}
            onToggleKotItem={handleToggleKotItem}
            onCancelKotItem={handleCancelKotItem}
            onToggleMenuAvailability={handleToggleMenuAvailability}
            onRefresh={() => void refetch()}
            onNotify={showToast}
          />
        )}

        {activeScreen === 'order-management' && !isKitchenRoute && (
          <OrderManagementScreen
            orders={orders}
            onAdvanceOrderStatus={handleAdvanceOrderStatus}
            onPayCounterOrder={handlePayCounterOrder}
            onRefundOrder={handleRefundOrder}
            onDownloadInvoicePdf={handleDownloadInvoicePdf}
            onPrintThermalReceipt={handleOpenThermalReceipt}
            onExportExcel={handleExportOrdersExcel}
            onRefresh={() => void refetch()}
            onNotify={showToast}
          />
        )}

        {activeScreen === 'reports-analytics' && (
          <ReportsAnalyticsScreen
            orders={orders}
            inventory={inventory}
            customers={customers}
            staffRoster={staffRoster}
            menuItems={menuItems}
            onExportCsv={handleExportCsv}
            onExportExcel={handleExportOrdersExcel}
            onDownloadReportPdf={handleDownloadReportPdf}
            onNotify={showToast}
          />
        )}

        {(activeScreen === 'table-layout' || activeScreen === 'kitchen-tables') &&
          isKitchenRoute && (
            <KitchenTablesScreen
              tables={tables}
              orders={orders}
              detailsOnly={activeScreen === 'kitchen-tables'}
              onAdvanceOrderStatus={handleAdvanceOrderStatus}
              onNotify={showToast}
            />
          )}

        {(activeScreen === 'table-layout' || activeScreen === 'kitchen-tables') &&
          !isKitchenRoute && (
          <TableLayoutScreen
            tables={tables}
            orders={orders}
            selectedTable={selectedTable}
            readOnly={activeScreen === 'kitchen-tables'}
            cafeSettings={cafeSettings}
            onSelectTableForPos={(tableId) => {
              setServiceMode('dine-in');
              setSelectedTable(tableId);
              handleNavigate('pos-terminal', 'staff');
              showToast(`Selected Table ${tableId} in POS`);
            }}
            onCheckInTable={handleCheckInTable}
            onAddTable={handleAddTable}
            onTransferTable={handleTransferTable}
            onMergeTables={handleMergeTables}
            onNotify={showToast}
          />
        )}

        {activeScreen === 'inventory-stock' && (
          <InventoryStockScreen
            items={inventory}
            purchaseOrders={purchaseOrders}
            onRestockItem={handleRestockItem}
            onAddIngredient={handleAddIngredient}
            onRefresh={async () => {
              const result = await refetch();
              if (result.error) {
                showErrorToast(result.error, 'Failed to refresh inventory');
                return;
              }
              showToast('Inventory refreshed');
            }}
            onCreatePurchaseOrder={handleCreatePurchaseOrder}
            onReceivePurchaseOrder={handleReceivePurchaseOrder}
            onExportExcel={handleExportInventoryExcel}
            onNotify={showToast}
          />
        )}

        {activeScreen === 'crm-customers' && (
          <CrmCustomersScreen
            customers={customers}
            orders={orders}
            onAddCustomer={handleAddCustomer}
            onExportCsv={handleExportCustomersExcel}
            onExportExcel={handleExportCustomersExcel}
            onExportCustomerPii={handleExportCustomerPii}
            onNotify={showToast}
          />
        )}

        {activeScreen === 'loyalty-rewards' && (
          <LoyaltyRewardsAdminScreen
            rules={loyaltyRules}
            ledger={pointLedger}
            customersCount={customers.length}
            rewardPoints={rewardPoints}
            onAddRule={handleAddLoyaltyRule}
            onExportLedger={handleExportLedgerExcel}
            onNotify={showToast}
          />
        )}

        {activeScreen === 'offers-campaigns' && (
          <OffersCampaignsScreen
            campaigns={campaigns}
            onCreateCampaign={handleCreateCampaign}
            onToggleCampaignStatus={handleToggleCampaignStatus}
            onNotify={showToast}
          />
        )}

        {activeScreen === 'staff-roles' && (
          <StaffRolesScreen
            roster={staffRoster}
            adminPinRequired={cafeSettings.adminPinRequired}
            authSession={authSession}
            onLoginPin={(pin) => loginPinMutation.mutateAsync(pin)}
            onLogoutPin={async () => {
              await logoutPinMutation.mutateAsync();
            }}
            onToggleAdminPin={(enabled) => {
              void handleSaveSettings({
                ...cafeSettings,
                adminPinRequired: enabled,
              });
            }}
            onAddStaff={handleAddStaff}
            onToggleDuty={handleToggleStaffDuty}
            onNotify={showToast}
          />
        )}

        {activeScreen === 'settings-cafe-profile' && (
          <SettingsProfileScreen
            settings={cafeSettings}
            onSaveSettings={handleSaveSettings}
            onResetDefaults={handleResetSettings}
            onNotify={showToast}
          />
        )}
      </Suspense>
      )}

      <Dialog
        open={Boolean(restockTarget)}
        onOpenChange={(open) => {
          if (!restockItemMutation.isPending && !open) {
            setRestockTarget(null);
            setRestockError(null);
          }
        }}
      >
        <DialogContent className="bg-surface-container border border-outline-variant/20 text-on-surface sm:max-w-md rounded-3xl p-6 shadow-2xl">
          <DialogHeader>
            <DialogTitle className="text-lg font-black text-on-surface">
              Restock {restockTarget?.name}
            </DialogTitle>
            <DialogDescription className="text-xs text-on-surface-variant">
              Enter the received quantity and price per {restockTarget?.unit}. The total is
              calculated automatically.
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={(event) => void handleSubmitRestock(event)} className="space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <label className="space-y-1.5">
                <span className="block text-xs font-bold text-on-surface">
                  Received quantity ({restockTarget?.unit})
                </span>
                <input
                  type="number"
                  min="0.01"
                  step="any"
                  required
                  autoFocus
                  value={restockQuantity}
                  onChange={(event) => setRestockQuantity(event.target.value)}
                  placeholder="e.g. 5"
                  className="w-full rounded-xl border border-outline-variant/20 bg-surface px-3 py-2.5 text-sm text-on-surface focus:outline-none focus:ring-2 focus:ring-[#FF6422]/50"
                />
              </label>
              <label className="space-y-1.5">
                <span className="block text-xs font-bold text-on-surface">
                  Price per {restockTarget?.unit} (₹)
                </span>
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  required
                  value={restockUnitCost}
                  onChange={(event) => setRestockUnitCost(event.target.value)}
                  placeholder="Unit price"
                  className="w-full rounded-xl border border-outline-variant/20 bg-surface px-3 py-2.5 text-sm text-on-surface focus:outline-none focus:ring-2 focus:ring-[#FF6422]/50"
                />
              </label>
            </div>
            <div className="flex items-center justify-between rounded-xl bg-surface px-4 py-3">
              <span className="text-sm font-bold text-on-surface-variant">Total cost</span>
              <span className="text-lg font-black text-[#FF6422] tabular-nums">
                ₹
                {(
                  (Number(restockQuantity) || 0) *
                  (Number(restockUnitCost) || 0)
                ).toFixed(2)}
              </span>
            </div>
            {restockError && (
              <p className="text-xs font-semibold text-red-500" role="alert">
                {restockError}
              </p>
            )}
            <div className="flex gap-2">
              <button
                type="button"
                disabled={restockItemMutation.isPending}
                onClick={() => setRestockTarget(null)}
                className="flex-1 rounded-full bg-surface-container-high px-4 py-3 text-xs font-bold text-on-surface transition-colors hover:bg-surface-variant disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={restockItemMutation.isPending}
                className="flex-1 rounded-full bg-[#FF6422] px-4 py-3 text-xs font-bold text-white transition-colors hover:bg-[#E55518] disabled:opacity-50"
              >
                {restockItemMutation.isPending ? 'Saving...' : 'Confirm restock'}
              </button>
            </div>
          </form>
        </DialogContent>
      </Dialog>

      {/* Global Staff Role PIN Unlock Modal */}
      <Dialog
        open={pinModalOpen}
        onOpenChange={(open) => {
          if (!loginPinMutation.isPending) {
            setPinModalOpen(open);
            if (!open) setPinError(null);
          }
        }}
      >
        <DialogContent
          data-testid="staff-pin-modal"
          className="bg-surface-container border border-outline-variant/20 text-on-surface sm:max-w-sm rounded-3xl p-6 shadow-2xl space-y-3"
        >
          <DialogHeader>
            <DialogTitle className="text-lg font-black text-on-surface flex items-center gap-2">
              <span className="material-symbols-outlined text-[22px] text-[#FF6422]">shield_person</span>
              <span>Staff & Admin Workspace PIN</span>
            </DialogTitle>
            <DialogDescription className="text-xs text-on-surface-variant">
              Enter your 4-digit PIN to access Admin Dashboard, Billing, and Kitchen Screen.
            </DialogDescription>
          </DialogHeader>

          {/* Quick Role Fill Chips */}
          <div className="space-y-1.5">
            <span className="text-[11px] font-bold text-on-surface-variant block">Quick Roles (Click to fill):</span>
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => setPinInput('7777')}
                className="p-3 rounded-2xl bg-surface hover:bg-surface-variant border border-outline-variant/15 text-left transition-all cursor-pointer"
              >
                <span className="block text-xs font-black text-on-surface">👑 Admin (Full Access)</span>
                <span className="text-[11px] text-[#FF6422] font-mono font-bold">PIN: 7777</span>
              </button>
              <button
                type="button"
                onClick={() => setPinInput('3456')}
                className="p-3 rounded-2xl bg-surface hover:bg-surface-variant border border-outline-variant/15 text-left transition-all cursor-pointer"
              >
                <span className="block text-xs font-black text-on-surface">🍳 Kitchen Staff (KDS)</span>
                <span className="text-[11px] text-[#FF6422] font-mono font-bold">PIN: 3456</span>
              </button>
            </div>
          </div>

          <form onSubmit={(e) => void handleGlobalPinSubmit(e)} className="space-y-4 pt-1">
            <div>
              <label className="block text-xs font-bold text-on-surface mb-1">
                Enter 4-Digit PIN
              </label>
              <input
                type="password"
                inputMode="numeric"
                maxLength={4}
                autoFocus
                data-testid="staff-pin-input"
                value={pinInput}
                onChange={(e) => setPinInput(e.target.value.replace(/\D/g, '').slice(0, 4))}
                placeholder="••••"
                className="w-full px-3 py-3 rounded-2xl bg-surface text-on-surface text-center text-xl tracking-[0.5em] font-mono focus:outline-none focus:ring-2 focus:ring-[#FF6422]/50 border border-outline-variant/20"
              />
              {pinError && (
                <p className="text-xs text-red-400 mt-1.5 font-semibold" role="alert">
                  {pinError}
                </p>
              )}
            </div>
            <div className="flex gap-2">
              <button
                type="button"
                disabled={loginPinMutation.isPending}
                onClick={() => {
                  setPinModalOpen(false);
                  pendingStaffScreenRef.current = null;
                  if (workspaceMode === 'staff' && !authSession.authenticated) {
                    handleNavigate('home', 'customer');
                  }
                }}
                className="flex-1 py-3 rounded-full bg-surface-container-high hover:bg-surface-variant text-on-surface text-xs font-bold transition-all cursor-pointer disabled:opacity-50"
              >
                Customer View
              </button>
              <button
                type="submit"
                data-testid="staff-pin-submit"
                disabled={loginPinMutation.isPending}
                className="flex-1 py-3 rounded-full bg-[#FF6422] hover:bg-[#E55518] text-white text-xs font-bold shadow-md transition-all active:scale-95 cursor-pointer disabled:opacity-50"
              >
                {loginPinMutation.isPending ? 'Verifying...' : 'Unlock Admin'}
              </button>
            </div>
          </form>
        </DialogContent>
      </Dialog>

      {thermalModalOpen && (
        <Suspense fallback={null}>
          <ThermalReceiptModal
            open={thermalModalOpen}
            onOpenChange={setThermalModalOpen}
            order={thermalModalOrder}
            settings={cafeSettings}
          />
        </Suspense>
      )}

    </AppShell>
  );
}
