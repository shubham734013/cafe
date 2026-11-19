import { Suspense, lazy, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { toast } from 'sonner';
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
  PaymentMode,
  PromoCampaign,
  ScreenId,
  ServiceMode,
  StaffMember,
  StaffScreenId,
  WorkspaceMode,
} from './types/cafe';
import type { CustomerFeedbackInput } from './shared/schemas';
import { calculateCartTotals, formatOrderCsv, isKitchenActiveOrder } from './utils/cafeLogic';
import { triggerBlobDownload } from './utils/download';
import {
  canStaffRoleAccessScreen,
  formatStaffRoleLabel,
  getDefaultStaffScreenForRole,
} from './utils/rbac';

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
const SplashScreen = lazy(() =>
  import('./components/SplashScreen').then((m) => ({ default: m.SplashScreen }))
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
import { ThermalReceiptModal } from './components/ThermalReceiptModal';
import { CoffeeBrewLoader } from './components/CoffeeBrewLoader';
import {
  AdminDashboardSkeleton,
  CustomerCartSkeleton,
  KitchenDisplaySkeleton,
  MenuScreenSkeleton,
} from './components/SkeletonLoaders';

const XLSX_MIME = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';

function ScreenFallback() {
  return (
    <div className="flex flex-col items-center justify-center py-12">
      <CoffeeBrewLoader
        size="sm"
        title="Brewing Workspace"
        subtitle="Extracting fresh data..."
      />
    </div>
  );
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
    isLoading,
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
    toggleKotItemMutation,
    toggleMenuAvailabilityMutation,
    submitOrderFeedbackMutation,
    submitCustomerFeedbackMutation,
    reserveTableMutation,
    checkInTableMutation,
    addTableMutation,
    transferTableMutation,
    mergeTablesMutation,
    restockItemMutation,
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
  const checkoutInFlightRef = useRef(false);
  const customerAttemptKeyRef = useRef<{ signature: string; key: string } | null>(null);
  const posAttemptKeyRef = useRef<{ signature: string; key: string } | null>(null);
  const pendingStaffScreenRef = useRef<StaffScreenId | null>(null);

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
    activityLog,
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
    toast.success(msg);
  }, []);

  const showErrorToast = useCallback((err: unknown, fallback: string) => {
    const message = err instanceof Error ? err.message : fallback;
    toast.error(message);
  }, []);

  const handleStartPayment = useCallback(
    async (orderId: string) => {
      const isMobile =
        typeof navigator !== 'undefined' &&
        /iPhone|iPad|iPod|Android/i.test(navigator.userAgent);
      let checkoutWindow: Window | null = null;
      if (!isMobile) {
        checkoutWindow = window.open('about:blank', '_blank');
        if (checkoutWindow) checkoutWindow.opener = null;
      }
      try {
        const result = await createPaymentSessionMutation.mutateAsync(orderId);
        if (result.checkoutUrl) {
          if (checkoutWindow) {
            checkoutWindow.location.assign(result.checkoutUrl);
          } else {
            window.location.assign(result.checkoutUrl);
          }
          return;
        }
        checkoutWindow?.close();
        if (result.paymentStatus === 'paid') showToast('Payment is already confirmed.');
      } catch (error) {
        checkoutWindow?.close();
        throw error;
      }
    },
    [createPaymentSessionMutation, showToast]
  );

  const handleRefreshPaymentStatus = useCallback(
    async (orderId: string) => {
      await refreshPaymentStatusMutation.mutateAsync(orderId);
    },
    [refreshPaymentStatusMutation]
  );

  const handleNavigate = useCallback(
    (screen: ScreenId, mode?: WorkspaceMode) => {
      const targetMode = mode ?? workspaceMode;
      if (targetMode === 'staff' && screen !== 'splash') {
        if (!authSession.authenticated) {
          pendingStaffScreenRef.current = screen as StaffScreenId;
          setPinError(null);
          setPinModalOpen(true);
          return;
        } else if (!canStaffRoleAccessScreen(authSession.session?.role, screen as StaffScreenId)) {
          const fallbackScreen = getDefaultStaffScreenForRole(authSession.session?.role);
          toast.error(
            `${formatStaffRoleLabel(authSession.session?.role)} access does not permit that module.`
          );
          navigate(fallbackScreen, 'staff');
          window.scrollTo({ top: 0, behavior: 'smooth' });
          return;
        }
      }
      navigate(screen, mode);
      window.scrollTo({ top: 0, behavior: 'smooth' });
    },
    [authSession.authenticated, authSession.session?.role, navigate]
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
      navigate(getDefaultStaffScreenForRole(authSession.session.role), 'staff', { replace: true });
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
      navigate(targetScreen, 'staff', { replace: true });
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
    async (selectedPaymentMode: PaymentMode = 'upi') => {
      if (customerCart.length === 0 || checkoutInFlightRef.current) return;
      checkoutInFlightRef.current = true;
      try {
        const signature = JSON.stringify({
          serviceMode,
          selectedTable,
          couponCode,
          paymentMode: selectedPaymentMode,
          items: customerCart.map((i) => `${i.menuItemId}:${i.quantity}`),
        });
        const idempotencyKey = getStableAttemptKey(customerAttemptKeyRef, 'cust', signature);
        const res = await createOrderMutation.mutateAsync({
          outletId: data.outletId,
          serviceMode,
          tableNumber: serviceMode === 'dine-in' ? selectedTable : undefined,
          deliveryPartner: serviceMode === 'delivery' ? 'Direct Delivery' : undefined,
          items: customerCart,
          couponCode,
          cookingNote,
          isPosTerminal: false,
          paymentMode: selectedPaymentMode,
          idempotencyKey,
        });
        customerAttemptKeyRef.current = null;
        clearCustomerCart();
        setCookingNote('');
        setTrackedOrderId(res.order.id);
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
      data.outletId,
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
    async (selectedPaymentMode: PaymentMode = 'cash', customerId?: string) => {
      if (posCart.length === 0 || checkoutInFlightRef.current) return;
      checkoutInFlightRef.current = true;
      try {
        const signature = JSON.stringify({
          serviceMode,
          selectedTable,
          paymentMode: selectedPaymentMode,
          customerId,
          items: posCart.map((i) => `${i.menuItemId}:${i.quantity}`),
        });
        const idempotencyKey = getStableAttemptKey(posAttemptKeyRef, 'pos', signature);
        const res = await createOrderMutation.mutateAsync({
          outletId: data.outletId,
          serviceMode,
          tableNumber: serviceMode === 'dine-in' ? selectedTable : undefined,
          deliveryPartner: serviceMode === 'delivery' ? 'Direct Delivery' : undefined,
          items: posCart,
          couponCode: '',
          cookingNote: '',
          isPosTerminal: true,
          paymentMode: selectedPaymentMode,
          customerId,
          idempotencyKey,
        });
        posAttemptKeyRef.current = null;
        setLastCompletedPosOrder(res.order);
        clearPosCart();
        showToast(`POS Order #${res.order.id} dispatched to KOT (${res.order.kotNumber}).`);
      } catch (err) {
        showErrorToast(err, 'Failed to punch POS order');
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
    async (orderId: string, rating: number, tags: string[], comment: string) => {
      await submitOrderFeedbackMutation.mutateAsync({
        orderId,
        rating,
        tags,
        comment,
      });
    },
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
    async (id: string) => {
      try {
        const res = (await restockItemMutation.mutateAsync(id)) as {
          item?: InventoryIngredient;
        };
        if (res.item) {
          showToast(
            `Restocked ${res.item.name} -> ${res.item.quantity} ${res.item.unit} (${res.item.status})`
          );
        }
      } catch (err) {
        showErrorToast(err, 'Failed to restock ingredient');
      }
    },
    [restockItemMutation, showErrorToast, showToast]
  );

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
      }
    },
    [addIngredientMutation, showErrorToast, showToast]
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
          validityLabel: campaign.validityLabel,
          description: campaign.description,
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
        const allowedRoles = [
          'Owner',
          'Owner & Store Lead',
          'Barista',
          'Kitchen Line',
          'Server / Steward',
          'Cashier',
          'Store Manager',
        ] as const;
        const role = allowedRoles.includes(member.role as (typeof allowedRoles)[number])
          ? (member.role as (typeof allowedRoles)[number])
          : 'Barista';
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
    () => calculateCartTotals(customerCart, couponCode, serviceMode, false, campaigns),
    [campaigns, couponCode, customerCart, serviceMode]
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

  useEffect(() => {
    if (activeScreen === 'splash' && splashFinished && !isLoading && !isAuthLoading && !isError) {
      navigate('home', 'customer', { replace: true });
    }
  }, [activeScreen, isAuthLoading, isError, isLoading, navigate, splashFinished]);

  if (activeScreen === 'splash') {
    return (
      <Suspense fallback={<ScreenFallback />}>
        <SplashScreen
          errorMessage={isError ? errorMessage : undefined}
          onRetry={() => void refetch()}
          onFinish={() => setSplashFinished(true)}
        />
      </Suspense>
    );
  }

  return (
    <AppShell
      activeScreen={activeScreen}
      workspaceMode={workspaceMode}
      cartCount={customerTotals.itemCount}
      liveKotCount={liveKotCount}
      cafeName={cafeSettings.cafeName}
      authSession={authSession}
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
        <Suspense fallback={<ScreenFallback />}>
          <CustomerHomeScreen
            serviceMode={serviceMode}
            selectedTable={selectedTable}
            tables={tables}
            cartCount={customerTotals.itemCount}
            orders={orders}
            menuItems={menuItems}
            onSelectServiceAndTable={(mode, table) => {
              setServiceMode(mode);
              setSelectedTable(table);
            }}
            onNavigateMenu={(cat) => {
              if (cat) setMenuCategory(cat);
              handleNavigate('menu', 'customer');
            }}
            onNavigateCart={() => handleNavigate('cart', 'customer')}
            onNavigateRewards={() => handleNavigate('rewards', 'customer')}
            onNavigateAdmin={() => handleNavigate('admin-dashboard', 'staff')}
            onAddToCart={addCustomerItem}
            onSubmitFeedback={handleSubmitCustomerFeedback}
            onReserveTable={async (input) => {
              const res = await reserveTableMutation.mutateAsync(input);
              return res.table;
            }}
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
            onAddToCart={addCustomerItem}
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
            availablePoints={rewardPoints}
            couponCode={couponCode}
            cookingNote={cookingNote}
            onServiceModeChange={setServiceMode}
            onTableChange={setSelectedTable}
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
        <Suspense fallback={<ScreenFallback />}>
          <LiveTrackingScreen
            activeOrder={activeTrackedOrder}
            allOrders={orders}
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
        <Suspense fallback={<ScreenFallback />}>
          <CustomerRewardsScreen
            points={rewardPoints}
            campaigns={campaigns}
            onRedeemCoupon={(code) => {
              setCouponCode(code);
              handleNavigate('cart', 'customer');
              showToast(`Coupon ${code} selected for your cart`);
            }}
          />
        </Suspense>
      )}

      {activeScreen === 'profile' && (
        <Suspense fallback={<ScreenFallback />}>
          <CustomerProfileScreen
            onNotify={showToast}
            onBrowseMenu={() => handleNavigate('menu', 'customer')}
          />
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
      <Suspense fallback={<ScreenFallback />}>
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
            isConnected={socketConnected}
            onRefresh={() => void refetch()}
            onToggleKotItem={handleToggleKotItem}
            onAdvanceOrderStatus={handleAdvanceOrderStatus}
            onRequestReorder={handleRequestIngredientReorder}
            onNotify={showToast}
          />
        )}

        {activeScreen === 'pos-orders' && (
          <KitchenPosOrdersScreen
            orders={orders}
            onAdvanceOrderStatus={handleAdvanceOrderStatus}
            onToggleKotItem={handleToggleKotItem}
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
          />
        )}

        {activeScreen === 'order-management' && isKitchenRoute && (
          <KitchenOrdersScreen
            orders={orders}
            onAdvanceOrderStatus={handleAdvanceOrderStatus}
            onToggleKotItem={handleToggleKotItem}
            onRefresh={() => void refetch()}
            onNotify={showToast}
          />
        )}

        {activeScreen === 'order-management' && !isKitchenRoute && (
          <OrderManagementScreen
            orders={orders}
            onAdvanceOrderStatus={handleAdvanceOrderStatus}
            onPayCounterOrder={(orderId) => payCounterOrderMutation.mutateAsync(orderId).then(() => {})}
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
            onRestockItem={handleRestockItem}
            onAddIngredient={handleAddIngredient}
            onExportExcel={handleExportInventoryExcel}
            onNotify={showToast}
          />
        )}

        {activeScreen === 'crm-customers' && (
          <CrmCustomersScreen
            customers={customers}
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
            managerPinRequired={cafeSettings.managerPinRequired}
            authSession={authSession}
            onLoginPin={(pin) => loginPinMutation.mutateAsync(pin)}
            onLogoutPin={async () => {
              await logoutPinMutation.mutateAsync();
            }}
            onToggleManagerPin={(enabled) => {
              void handleSaveSettings({
                ...cafeSettings,
                managerPinRequired: enabled,
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
              Enter your 4-digit role PIN to unlock the Admin Dashboard, POS, and Kitchen KDS.
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
                <span className="block text-xs font-black text-on-surface">👑 Owner (Full Admin & POS)</span>
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

      <ThermalReceiptModal
        open={thermalModalOpen}
        onOpenChange={setThermalModalOpen}
        order={thermalModalOrder}
        settings={cafeSettings}
      />

    </AppShell>
  );
}
