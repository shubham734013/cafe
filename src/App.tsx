import { Suspense, lazy, useCallback, useMemo } from 'react';
import { toast } from 'sonner';
import { AppShell } from './components/AppShell';
import { CustomerCartScreen } from './components/CustomerCartScreen';
import { CustomerHomeScreen } from './components/CustomerHomeScreen';
import { CustomerMenuScreen } from './components/CustomerMenuScreen';
import { CustomerRewardsScreen } from './components/CustomerRewardsScreen';
import { LiveTrackingScreen } from './components/LiveTrackingScreen';
import { SplashScreen } from './components/SplashScreen';
import { useCafeApi } from './hooks/useCafeApi';
import { useCafeStore } from './store/useCafeStore';
import type {
  CafeOrder,
  CafeSettings,
  CafeTable,
  CustomerProfile,
  InventoryIngredient,
  LoyaltyRule,
  PromoCampaign,
  ScreenId,
  ServiceMode,
  StaffMember,
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
    posPayment,
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
    setPosPayment,
    setTrackedOrderId,
  } = useCafeStore();

  const {
    data,
    refetch,
    createOrderMutation,
    advanceOrderMutation,
    toggleKotItemMutation,
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
      navigate(screen, mode);
      window.scrollTo({ top: 0, behavior: 'smooth' });
    },
    [navigate]
  );

  const handleCustomerCheckout = useCallback(async () => {
    if (customerCart.length === 0) return;
    try {
      const idempotencyKey =
        typeof crypto !== 'undefined' && crypto.randomUUID
          ? crypto.randomUUID()
          : `cust-${Date.now()}`;
      const res = await createOrderMutation.mutateAsync({
        outletId: data.outletId,
        serviceMode,
        tableNumber: serviceMode === 'dine-in' ? selectedTable : undefined,
        deliveryPartner: serviceMode === 'delivery' ? 'Direct Delivery' : undefined,
        items: customerCart,
        couponCode,
        paymentMode: customerPayment,
        cookingNote,
        isPosTerminal: false,
        idempotencyKey,
      });
      clearCustomerCart();
      setCookingNote('');
      setTrackedOrderId(res.order.id);
      navigate('tracking', 'customer');
      showToast(`Order #${res.order.id} placed & sent to Kitchen KOT!`);
    } catch (err) {
      showErrorToast(err, 'Could not submit order');
    }
  }, [
    clearCustomerCart,
    cookingNote,
    couponCode,
    createOrderMutation,
    customerCart,
    customerPayment,
    data.outletId,
    navigate,
    selectedTable,
    serviceMode,
    setCookingNote,
    setTrackedOrderId,
    showErrorToast,
    showToast,
  ]);

  const handlePosCheckout = useCallback(async () => {
    if (posCart.length === 0) return;
    try {
      const idempotencyKey =
        typeof crypto !== 'undefined' && crypto.randomUUID
          ? crypto.randomUUID()
          : `pos-${Date.now()}`;
      const res = await createOrderMutation.mutateAsync({
        outletId: data.outletId,
        serviceMode,
        tableNumber: serviceMode === 'dine-in' ? selectedTable : undefined,
        deliveryPartner: serviceMode === 'delivery' ? 'Direct Delivery' : undefined,
        items: posCart,
        couponCode: '',
        paymentMode: posPayment,
        cookingNote: '',
        isPosTerminal: true,
        idempotencyKey,
      });
      clearPosCart();
      showToast(`POS Order #${res.order.id} dispatched to KOT (${res.order.kotNumber})`);
    } catch (err) {
      showErrorToast(err, 'Failed to punch POS order');
    }
  }, [
    clearPosCart,
    createOrderMutation,
    data.outletId,
    posCart,
    posPayment,
    selectedTable,
    serviceMode,
    showErrorToast,
    showToast,
  ]);

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
              res.campaign.status === 'active' ? 'activated' : 'paused / scheduled'
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
    async (next: CafeSettings) => {
      try {
        await saveSettingsMutation.mutateAsync(next);
        showToast(`Saved profile for ${next.cafeName}`);
      } catch (err) {
        showErrorToast(err, 'Failed to save settings');
      }
    },
    [saveSettingsMutation, showErrorToast, showToast]
  );

  const handleResetSettings = useCallback(async () => {
    try {
      await resetSettingsMutation.mutateAsync();
    } catch (err) {
      showErrorToast(err, 'Failed to reset settings');
    }
  }, [resetSettingsMutation, showErrorToast]);

  const customerTotals = useMemo(
    () => calculateCartTotals(customerCart, couponCode, serviceMode, false),
    [couponCode, customerCart, serviceMode]
  );

  const liveKotCount = useMemo(
    () => orders.filter((o) => o.status !== 'served').length,
    [orders]
  );

  const activeTrackedOrder = orders.find((o) => o.id === trackedOrderId) || orders[0];

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
          onUpdateQty={updateCustomerQty}
          onRemoveItem={removeCustomerItem}
          onCouponChange={setCouponCode}
          onCookingNoteChange={setCookingNote}
          onPaymentModeChange={setCustomerPayment}
          onCheckout={handleCustomerCheckout}
          onBrowseMenu={() => handleNavigate('menu', 'customer')}
        />
      )}

      {activeScreen === 'tracking' && activeTrackedOrder && (
        <LiveTrackingScreen
          activeOrder={activeTrackedOrder}
          allOrders={orders}
          onSelectOrder={setTrackedOrderId}
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
            cafeName={cafeSettings.cafeName}
            onServiceModeChange={setServiceMode}
            onTableChange={setSelectedTable}
            onPaymentModeChange={setPosPayment}
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
            onRestockItem={handleRestockItem}
            onNavigateStaff={(screen) => handleNavigate(screen, 'staff')}
            onExportCsv={handleExportOrdersExcel}
          />
        )}

        {activeScreen === 'order-management' && (
          <OrderManagementScreen
            orders={orders}
            onAdvanceOrderStatus={handleAdvanceOrderStatus}
            onDownloadInvoicePdf={handleDownloadInvoicePdf}
            onExportExcel={handleExportOrdersExcel}
            onRefresh={() => void refetch()}
            onNotify={showToast}
          />
        )}

        {activeScreen === 'reports-analytics' && (
          <ReportsAnalyticsScreen
            orders={orders}
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
    </AppShell>
  );
}
