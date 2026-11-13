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
import { CustomerCartScreen } from './components/CustomerCartScreen';
import { CustomerHomeScreen } from './components/CustomerHomeScreen';
import { CustomerMenuScreen } from './components/CustomerMenuScreen';
import { CustomerRewardsScreen } from './components/CustomerRewardsScreen';
import { LiveTrackingScreen } from './components/LiveTrackingScreen';
import { SplashScreen } from './components/SplashScreen';
import type { SettingsTab } from './components/SettingsProfileScreen';
import type { PosCardSlipInput } from './components/PosTerminalScreen';
import { YoupiCheckoutModal } from './components/YoupiCheckoutModal';
import { useCafeApi } from './hooks/useCafeApi';
import type { YoupiPaymentRecord } from './payments/types';
import { type UpiAppId, getUpiAppLabel } from './payments/upiUri';
import { useCafeStore } from './store/useCafeStore';
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
import { calculateCartTotals, formatOrderCsv } from './utils/cafeLogic';
import {
  buildCustomersExcelBuffer,
  buildInventoryExcelBuffer,
  buildLoyaltyLedgerExcelBuffer,
  buildOrdersExcelBuffer,
  triggerBlobDownload,
} from './utils/exporters';
import {
  canStaffRoleAccessScreen,
  formatStaffRoleLabel,
  getDefaultStaffScreenForRole,
} from './utils/rbac';

const PosTerminalScreen = lazy(() =>
  import('./components/PosTerminalScreen').then((m) => ({ default: m.PosTerminalScreen }))
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

const XLSX_MIME = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';

function ScreenFallback() {
  return (
    <div className="flex items-center justify-center py-20 text-xs text-on-surface-variant gap-2">
      <span className="material-symbols-outlined text-[18px] animate-spin text-primary">
        progress_activity
      </span>
      <span>Loading module...</span>
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
    customerPayment,
    customerUpiApp,
    customerCardDraft,
    posPayment,
    posUpiApp,
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
    setCustomerPayment,
    setCustomerUpiApp,
    setCustomerCardDraft,
    setPosPayment,
    setPosUpiApp,
    setTrackedOrderId,
  } = useCafeStore();

  const {
    data,
    authSession,
    youpiConfig,
    isError,
    errorMessage,
    refetch,
    loginPinMutation,
    logoutPinMutation,
    createOrderMutation,
    createYoupiPaymentMutation,
    settleOrderPaymentMutation,
    markYoupiSubmittedMutation,
    cancelYoupiPaymentMutation,
    verifyBankCreditMutation,
    refundYoupiPaymentMutation,
    simulateYoupiWebhookMutation,
    advanceOrderMutation,
    toggleKotItemMutation,
    reserveTableMutation,
    checkInTableMutation,
    addTableMutation,
    transferTableMutation,
    mergeTablesMutation,
    restockItemMutation,
    addIngredientMutation,
    addCustomerMutation,
    addLoyaltyRuleMutation,
    createCampaignMutation,
    toggleCampaignMutation,
    addStaffMutation,
    toggleStaffDutyMutation,
    saveSettingsMutation,
    resetSettingsMutation,
  } = useCafeApi();

  const [activeYoupiPayment, setActiveYoupiPayment] = useState<YoupiPaymentRecord | null>(null);
  const [youpiModalOpen, setYoupiModalOpen] = useState(false);
  const [autoLaunchOneTap, setAutoLaunchOneTap] = useState(false);
  const [settingsInitialTab, setSettingsInitialTab] = useState<SettingsTab>('Cafe Profile');
  const [pinModalOpen, setPinModalOpen] = useState(false);
  const [pinInput, setPinInput] = useState('');
  const [pinError, setPinError] = useState<string | null>(null);
  const checkoutInFlightRef = useRef(false);
  const customerAttemptKeyRef = useRef<{ signature: string; key: string } | null>(null);
  const posAttemptKeyRef = useRef<{ signature: string; key: string } | null>(null);

  const {
    orders,
    payments = [],
    tables,
    inventory,
    customers,
    loyaltyRules,
    pointLedger,
    campaigns,
    staffRoster,
    cafeSettings,
    rewardPoints,
  } = data;

  const showToast = useCallback((msg: string) => {
    toast.success(msg);
  }, []);

  const showErrorToast = useCallback((err: unknown, fallback: string) => {
    const message = err instanceof Error ? err.message : fallback;
    toast.error(message);
  }, []);

  const handleNavigate = useCallback(
    (screen: ScreenId, mode?: WorkspaceMode) => {
      const targetMode = mode ?? workspaceMode;
      if (targetMode === 'staff' && screen !== 'splash') {
        if (!authSession.authenticated) {
          setPinError(null);
          setPinModalOpen(true);
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
    [authSession.authenticated, authSession.session?.role, navigate, workspaceMode]
  );

  useEffect(() => {
    if (
      workspaceMode === 'staff' &&
      activeScreen !== 'splash' &&
      authSession.authenticated &&
      authSession.session?.role &&
      !canStaffRoleAccessScreen(authSession.session.role, activeScreen as StaffScreenId)
    ) {
      navigate(getDefaultStaffScreenForRole(authSession.session.role), 'staff');
    }
  }, [activeScreen, authSession.authenticated, authSession.session?.role, navigate, workspaceMode]);

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
      const targetScreen =
        workspaceMode === 'staff' &&
        activeScreen !== 'splash' &&
        canStaffRoleAccessScreen(role, activeScreen as StaffScreenId)
          ? activeScreen
          : getDefaultStaffScreenForRole(role);
      navigate(targetScreen, 'staff');
      showToast(`Signed in as ${formatStaffRoleLabel(role)}`);
    } catch (err) {
      setPinError(err instanceof Error ? err.message : 'Invalid staff PIN');
    }
  };

  const openYoupiSessionForOrder = useCallback(
    async (order: CafeOrder, preferredAppOverride?: UpiAppId) => {
      const idempotencyKey =
        typeof crypto !== 'undefined' && crypto.randomUUID
          ? `yp_${order.id}_${crypto.randomUUID()}`
          : `yp_${order.id}_${Date.now()}`;
      const { payment } = await createYoupiPaymentMutation.mutateAsync({
        orderId: order.id,
        customerId: order.customerId,
        idempotencyKey,
        preferredApp: preferredAppOverride ?? order.preferredUpiApp ?? 'any',
      });
      setActiveYoupiPayment(payment);
      setYoupiModalOpen(true);
    },
    [createYoupiPaymentMutation]
  );

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
    async (overrides?: {
      paymentMode?: PaymentMode;
      preferredUpiApp?: UpiAppId;
      oneTap?: boolean;
    }) => {
      if (customerCart.length === 0 || checkoutInFlightRef.current) return;
      checkoutInFlightRef.current = true;
      const effectivePaymentMode = overrides?.paymentMode ?? customerPayment;
      const effectiveUpiApp = overrides?.preferredUpiApp ?? customerUpiApp;
      if (overrides?.paymentMode) {
        setCustomerPayment(overrides.paymentMode);
      }
      if (overrides?.preferredUpiApp) {
        setCustomerUpiApp(overrides.preferredUpiApp);
      }
      try {
        const signature = JSON.stringify({
          serviceMode,
          selectedTable,
          couponCode,
          effectivePaymentMode,
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
          paymentMode: effectivePaymentMode,
          preferredUpiApp: effectivePaymentMode === 'upi' ? effectiveUpiApp : undefined,
          cardDetails:
            effectivePaymentMode === 'card'
              ? {
                  method: customerCardDraft.method,
                  network: customerCardDraft.network,
                  last4: customerCardDraft.last4.trim() || undefined,
                  holderName: customerCardDraft.holderName.trim() || undefined,
                }
              : undefined,
          cookingNote,
          isPosTerminal: false,
          customerId: 'cust-1',
          idempotencyKey,
        });
        customerAttemptKeyRef.current = null;
        clearCustomerCart();
        setCookingNote('');
        setTrackedOrderId(res.order.id);
        navigate('tracking', 'customer');
        if (effectivePaymentMode === 'upi') {
          try {
            setAutoLaunchOneTap(Boolean(overrides?.oneTap));
            await openYoupiSessionForOrder(res.order, effectiveUpiApp);
            showToast(
              `Order #${res.order.id} created — complete via ${getUpiAppLabel(effectiveUpiApp)} (YouPI-PG)`
            );
          } catch (upiErr) {
            setAutoLaunchOneTap(false);
            showErrorToast(
              upiErr,
              `Order #${res.order.id} created, but UPI checkout could not start`
            );
          }
        } else if (effectivePaymentMode === 'card') {
          showToast(
            customerCardDraft.method === 'online_card'
              ? `Order #${res.order.id} paid via ${customerCardDraft.network} & sent to Kitchen KOT!`
              : `Order #${res.order.id} placed — Card EDC machine requested at table!`
          );
        } else {
          showToast(`Order #${res.order.id} placed — pay cash at counter!`);
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
      customerCardDraft,
      customerCart,
      customerPayment,
      customerUpiApp,
      data.outletId,
      navigate,
      openYoupiSessionForOrder,
      selectedTable,
      serviceMode,
      setCookingNote,
      setCustomerPayment,
      setCustomerUpiApp,
      setTrackedOrderId,
      showErrorToast,
      showToast,
    ]
  );

  const handlePosCheckout = useCallback(
    async (cardSlip?: PosCardSlipInput) => {
      if (posCart.length === 0 || checkoutInFlightRef.current) return;
      checkoutInFlightRef.current = true;
      try {
        const signature = JSON.stringify({
          serviceMode,
          selectedTable,
          posPayment,
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
          paymentMode: posPayment,
          preferredUpiApp: posPayment === 'upi' ? posUpiApp : undefined,
          cardDetails:
            posPayment === 'card' && cardSlip
              ? {
                  method: 'edc_table',
                  network: cardSlip.network,
                  last4: cardSlip.last4,
                  authCode: cardSlip.authCode,
                }
              : undefined,
          cookingNote: '',
          isPosTerminal: true,
          idempotencyKey,
        });
        posAttemptKeyRef.current = null;
        clearPosCart();
        if (posPayment === 'upi') {
          try {
            await openYoupiSessionForOrder(res.order, posUpiApp);
            showToast(
              `POS Order #${res.order.id} sent to KOT — awaiting ${getUpiAppLabel(posUpiApp)}`
            );
          } catch (upiErr) {
            showErrorToast(
              upiErr,
              `POS Order #${res.order.id} sent to KOT, but UPI session failed`
            );
          }
        } else {
          showToast(`POS Order #${res.order.id} dispatched to KOT (${res.order.kotNumber})`);
        }
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
      openYoupiSessionForOrder,
      posCart,
      posPayment,
      posUpiApp,
      selectedTable,
      serviceMode,
      showErrorToast,
      showToast,
    ]
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

  const handleExportCsv = useCallback(() => {
    triggerBlobDownload('seth-sawariya-cafe-orders.csv', formatOrderCsv(orders), 'text/csv;charset=utf-8;');
    showToast('Exported Seth Sawariya CafeOS CSV report');
  }, [orders, showToast]);

  const handleExportOrdersExcel = useCallback(async () => {
    try {
      const buf = await buildOrdersExcelBuffer(orders);
      triggerBlobDownload('seth-sawariya-orders.xlsx', buf, XLSX_MIME);
      showToast('Exported Seth Sawariya Orders Excel (.xlsx)');
    } catch (err) {
      showErrorToast(err, 'Excel export failed');
    }
  }, [orders, showErrorToast, showToast]);

  const handleExportInventoryExcel = useCallback(async () => {
    try {
      const buf = await buildInventoryExcelBuffer(inventory);
      triggerBlobDownload('seth-sawariya-inventory.xlsx', buf, XLSX_MIME);
      showToast('Exported Inventory Excel (.xlsx)');
    } catch (err) {
      showErrorToast(err, 'Inventory export failed');
    }
  }, [inventory, showErrorToast, showToast]);

  const handleExportCustomersExcel = useCallback(async () => {
    try {
      const buf = await buildCustomersExcelBuffer(customers);
      triggerBlobDownload('seth-sawariya-customers.xlsx', buf, XLSX_MIME);
      showToast('Exported CRM Customer Directory (.xlsx)');
    } catch (err) {
      showErrorToast(err, 'CRM export failed');
    }
  }, [customers, showErrorToast, showToast]);

  const handleExportLedgerExcel = useCallback(async () => {
    try {
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
          'Barista',
          'Cashier',
          'Kitchen Line',
          'Store Manager',
          'Server / Steward',
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
    () => orders.filter((o) => o.status !== 'served').length,
    [orders]
  );

  const activeTrackedOrder = useMemo(
    () => orders.find((o) => o.id === trackedOrderId) || orders[0],
    [orders, trackedOrderId]
  );

  const activePaymentForModal = useMemo(
    () =>
      activeYoupiPayment
        ? payments.find((p) => p.id === activeYoupiPayment.id) ?? activeYoupiPayment
        : null,
    [activeYoupiPayment, payments]
  );

  const handlePaymentModalUpdate = useCallback((next: YoupiPaymentRecord) => {
    setActiveYoupiPayment(next);
  }, []);

  const canRefund =
    !authSession.authenticated ||
    authSession.session?.role === 'owner' ||
    authSession.session?.role === 'manager';

  if (activeScreen === 'splash') {
    return (
      <SplashScreen
        onEnterCustomer={() => handleNavigate('home', 'customer')}
        onEnterStaff={() => handleNavigate('pos-terminal', 'staff')}
      />
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
      onOpenPinUnlock={() => {
        setPinError(null);
        setPinModalOpen(true);
      }}
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
      onShowSplash={() => navigate('splash')}
    >
      {activeScreen === 'home' && (
        <CustomerHomeScreen
          serviceMode={serviceMode}
          selectedTable={selectedTable}
          tables={tables}
          cartCount={customerTotals.itemCount}
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
          onAddToCart={addCustomerItem}
          onReserveTable={async (input) => {
            const res = await reserveTableMutation.mutateAsync(input);
            return res.table;
          }}
          onNotify={showToast}
        />
      )}

      {activeScreen === 'menu' && (
        <CustomerMenuScreen
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
          onToggleServiceMode={() => {
            const order: ServiceMode[] = ['dine-in', 'takeaway', 'delivery'];
            const next = order[(order.indexOf(serviceMode) + 1) % order.length];
            setServiceMode(next);
            showToast(`Switched mode to ${next}`);
          }}
        />
      )}

      {activeScreen === 'cart' && (
        <CustomerCartScreen
          cart={customerCart}
          serviceMode={serviceMode}
          selectedTable={selectedTable}
          couponCode={couponCode}
          cookingNote={cookingNote}
          paymentMode={customerPayment}
          preferredUpiApp={customerUpiApp}
          cardDraft={customerCardDraft}
          payeeVpa={youpiConfig?.payeeVpa || cafeSettings.upiVpa}
          payeeName={youpiConfig?.payeeName || cafeSettings.cafeName}
          onUpdateQty={updateCustomerQty}
          onRemoveItem={removeCustomerItem}
          onCouponChange={setCouponCode}
          onCookingNoteChange={setCookingNote}
          onPaymentModeChange={setCustomerPayment}
          onPreferredUpiAppChange={setCustomerUpiApp}
          onCardDraftChange={setCustomerCardDraft}
          onCheckout={handleCustomerCheckout}
          onBrowseMenu={() => handleNavigate('menu', 'customer')}
        />
      )}

      {activeScreen === 'tracking' && (
        <LiveTrackingScreen
          activeOrder={activeTrackedOrder}
          activePayment={
            activeTrackedOrder
              ? payments.find((p) => p.orderId === activeTrackedOrder.id)
              : undefined
          }
          allOrders={orders}
          onSelectOrder={setTrackedOrderId}
          onPayViaYoupi={(order) =>
            void openYoupiSessionForOrder(order).catch((e) =>
              showErrorToast(e, 'Unable to start UPI session')
            )
          }
          onDownloadInvoicePdf={handleDownloadInvoicePdf}
          onNotify={showToast}
          onBackToMenu={() => handleNavigate('menu', 'customer')}
        />
      )}

      {activeScreen === 'rewards' && (
        <CustomerRewardsScreen
          points={rewardPoints}
          onRedeemCoupon={(code) => {
            setCouponCode(code);
            handleNavigate('cart', 'customer');
            showToast(`Coupon ${code} selected for your cart`);
          }}
          onAddRewardItem={(item) => {
            addCustomerItem(item);
            handleNavigate('cart', 'customer');
          }}
        />
      )}

      <Suspense fallback={<ScreenFallback />}>
        {activeScreen === 'pos-terminal' && (
          <PosTerminalScreen
            posCart={posCart}
            serviceMode={serviceMode}
            selectedTable={selectedTable}
            tables={tables}
            paymentMode={posPayment}
            preferredUpiApp={posUpiApp}
            cafeName={cafeSettings.upiPayeeName || cafeSettings.cafeName}
            upiVpa={cafeSettings.upiVpa || youpiConfig?.payeeVpa}
            isSubmitting={createOrderMutation.isPending || createYoupiPaymentMutation.isPending}
            onServiceModeChange={setServiceMode}
            onTableChange={setSelectedTable}
            onPaymentModeChange={setPosPayment}
            onPreferredUpiAppChange={setPosUpiApp}
            onAddPosItem={addPosItem}
            onUpdatePosQty={updatePosQty}
            onClearPosCart={clearPosCart}
            onCompletePosOrder={handlePosCheckout}
          />
        )}

        {activeScreen === 'kitchen-display-system' && (
          <KitchenDisplayScreen
            orders={orders}
            onToggleKotItem={handleToggleKotItem}
            onAdvanceOrderStatus={handleAdvanceOrderStatus}
            onNotify={showToast}
          />
        )}

        {activeScreen === 'admin-dashboard' && (
          <AdminDashboardScreen
            orders={orders}
            inventory={inventory}
            tables={tables}
            onRestockItem={handleRestockItem}
            onNavigateStaff={(screen) => handleNavigate(screen, 'staff')}
            onExportCsv={handleExportOrdersExcel}
          />
        )}

        {activeScreen === 'order-management' && (
          <OrderManagementScreen
            orders={orders}
            payments={payments}
            managerPinRequired={cafeSettings.managerPinRequired}
            isStaffAuthenticated={authSession.authenticated}
            canRefund={canRefund}
            onAdvanceOrderStatus={handleAdvanceOrderStatus}
            onCollectYoupi={(order) =>
              void openYoupiSessionForOrder(order).catch((e) =>
                showErrorToast(e, 'Unable to open YouPI-PG session')
              )
            }
            onVerifyBankCredit={async (payload) => {
              const res = await verifyBankCreditMutation.mutateAsync(payload);
              showToast(
                res.payment.status === 'reconciled'
                  ? `Order #${res.payment.orderId} confirmed settled (UTR ${res.payment.utr})`
                  : `Order #${res.payment.orderId} payment marked rejected`
              );
            }}
            onRefundYoupiPayment={async (payload) => {
              const res = await refundYoupiPaymentMutation.mutateAsync(payload);
              showToast(
                `Order #${res.payment.orderId} UPI payment refunded (${res.payment.refundRef})`
              );
            }}
            onSettleOrderPayment={async (payload) => {
              const res = await settleOrderPaymentMutation.mutateAsync(payload);
              showToast(
                res.order.paymentStatus === 'paid'
                  ? `Order #${res.order.id} payment settled (${res.order.paymentRef})`
                  : res.order.paymentStatus === 'refunded'
                    ? `Order #${res.order.id} marked refunded`
                    : `Order #${res.order.id} payment updated`
              );
            }}
            onDownloadInvoicePdf={handleDownloadInvoicePdf}
            onExportExcel={handleExportOrdersExcel}
            onRefresh={() => void refetch()}
            onNotify={showToast}
          />
        )}

        {activeScreen === 'reports-analytics' && (
          <ReportsAnalyticsScreen
            orders={orders}
            payments={payments}
            onExportCsv={handleExportCsv}
            onExportExcel={handleExportOrdersExcel}
            onDownloadReportPdf={handleDownloadReportPdf}
            onNotify={showToast}
          />
        )}

        {activeScreen === 'table-layout' && (
          <TableLayoutScreen
            tables={tables}
            orders={orders}
            selectedTable={selectedTable}
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
            youpiConfig={youpiConfig}
            initialTab={settingsInitialTab}
            onSaveSettings={handleSaveSettings}
            onResetDefaults={handleResetSettings}
            onNotify={showToast}
          />
        )}
      </Suspense>

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
          className="bg-surface-container border border-outline-variant/30 text-on-surface sm:max-w-sm rounded-2xl p-5"
        >
          <DialogHeader>
            <DialogTitle className="text-lg font-bold text-primary flex items-center gap-2">
              <span className="material-symbols-outlined text-[20px]">shield_person</span>
              <span>Staff Workspace PIN</span>
            </DialogTitle>
            <DialogDescription className="text-xs text-on-surface-variant">
              Enter your 4-digit role PIN to unlock live POS, KOT, orders, and operational records.
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={(e) => void handleGlobalPinSubmit(e)} className="space-y-4">
            <div>
              <label className="block text-xs font-semibold text-on-surface-variant mb-1">
                4-Digit Role PIN
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
                className="w-full px-3 py-2.5 rounded-lg bg-surface-container-low text-on-surface text-center text-lg tracking-[0.5em] font-mono focus:outline-none focus:ring-1 focus:ring-primary"
              />
              {pinError && (
                <p className="text-xs text-error mt-1.5" role="alert">
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
                  if (workspaceMode === 'staff' && !authSession.authenticated) {
                    handleNavigate('home', 'customer');
                  }
                }}
                className="flex-1 py-2.5 rounded-lg bg-surface-container-high text-on-surface text-xs font-semibold cursor-pointer disabled:opacity-50"
              >
                Customer View
              </button>
              <button
                type="submit"
                data-testid="staff-pin-submit"
                disabled={loginPinMutation.isPending}
                className="flex-1 py-2.5 rounded-lg bg-primary-container text-on-primary text-xs font-bold cursor-pointer disabled:opacity-50"
              >
                {loginPinMutation.isPending ? 'Verifying...' : 'Unlock Staff'}
              </button>
            </div>
          </form>
        </DialogContent>
      </Dialog>

      <YoupiCheckoutModal
        open={youpiModalOpen}
        payment={activePaymentForModal}
        gatewayMode={youpiConfig?.mode}
        autoLaunchOneTap={autoLaunchOneTap}
        isSubmitting={
          createYoupiPaymentMutation.isPending ||
          markYoupiSubmittedMutation.isPending ||
          cancelYoupiPaymentMutation.isPending ||
          simulateYoupiWebhookMutation.isPending
        }
        onPaymentUpdate={handlePaymentModalUpdate}
        onMarkSubmitted={async (paymentId) => {
          try {
            const res = await markYoupiSubmittedMutation.mutateAsync(paymentId);
            setActiveYoupiPayment(res.payment);
            showToast('Checking YouPI-PG bank alert observer...');
          } catch (err) {
            showErrorToast(err, 'Could not submit payment verification');
            throw err;
          }
        }}
        onCancelSession={async (paymentId) => {
          try {
            const res = await cancelYoupiPaymentMutation.mutateAsync(paymentId);
            setActiveYoupiPayment(res.payment);
            showToast('Checkout cancelled and queue slot released.');
          } catch (err) {
            showErrorToast(err, 'Could not cancel UPI session');
            throw err;
          }
        }}
        onRetrySession={async () => {
          if (!activeYoupiPayment) return;
          const targetOrder = orders.find((o) => o.id === activeYoupiPayment.orderId);
          if (!targetOrder) {
            const missingErr = new Error(`Order #${activeYoupiPayment.orderId} was not found.`);
            showErrorToast(missingErr, missingErr.message);
            throw missingErr;
          }
          try {
            await openYoupiSessionForOrder(targetOrder);
          } catch (err) {
            showErrorToast(err, 'Could not restart UPI session');
            throw err;
          }
        }}
        onSimulateOutcome={
          youpiConfig?.mode === 'youpi-sandbox-fallback'
            ? async (paymentId, outcome) => {
                try {
                  const res = await simulateYoupiWebhookMutation.mutateAsync({ paymentId, outcome });
                  setActiveYoupiPayment(res.payment);
                  showToast(`Simulated YouPI webhook: ${outcome}`);
                } catch (err) {
                  showErrorToast(err, 'Webhook simulation failed');
                  throw err;
                }
              }
            : undefined
        }
        onOpenPaymentSettings={() => {
          setYoupiModalOpen(false);
          setAutoLaunchOneTap(false);
          setSettingsInitialTab('Payments');
          handleNavigate('settings-cafe-profile', 'staff');
        }}
        onClose={() => {
          setYoupiModalOpen(false);
          setAutoLaunchOneTap(false);
        }}
        continueLabel={
          workspaceMode === 'staff' ? 'Done — Return to POS' : 'View Live Order Status'
        }
        onContinueToTracking={() => {
          setYoupiModalOpen(false);
          setAutoLaunchOneTap(false);
          if (workspaceMode === 'customer') {
            navigate('tracking', 'customer');
          }
        }}
      />
    </AppShell>
  );
}
