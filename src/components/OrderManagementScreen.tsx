import React, { useMemo, useState } from 'react';
import { type ColumnDef } from '@tanstack/react-table';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { authenticateManagerPinApi } from '../hooks/useCafeApi';
import type { YoupiPaymentRecord } from '../payments/types';
import { ORDER_STATUS_META } from '../state/cafeStateMachines';
import { CafeOrder, CardNetwork, ServiceMode } from '../types/cafe';
import { filterOrders, formatINR } from '../utils/cafeLogic';
import { CafeDataTable } from './CafeDataTable';

type VerifyDialogState =
  | { status: 'closed' }
  | { status: 'editing'; order: CafeOrder; payment: YoupiPaymentRecord }
  | { status: 'submitting'; order: CafeOrder; payment: YoupiPaymentRecord }
  | { status: 'error'; order: CafeOrder; payment: YoupiPaymentRecord; errorMessage: string };

type SettleDialogState =
  | { status: 'closed' }
  | { status: 'editing'; order: CafeOrder }
  | { status: 'submitting'; order: CafeOrder }
  | { status: 'error'; order: CafeOrder; errorMessage: string };

type RefundDialogState =
  | { status: 'closed' }
  | { status: 'editing'; order: CafeOrder; payment?: YoupiPaymentRecord }
  | { status: 'submitting'; order: CafeOrder; payment?: YoupiPaymentRecord }
  | { status: 'error'; order: CafeOrder; payment?: YoupiPaymentRecord; errorMessage: string };

type PaymentFilterKey = 'all' | 'upi' | 'card' | 'cash' | 'aggregators' | 'needs_action';

interface OrderManagementScreenProps {
  orders: CafeOrder[];
  payments?: YoupiPaymentRecord[];
  managerPinRequired?: boolean;
  isStaffAuthenticated?: boolean;
  canRefund?: boolean;
  onAdvanceOrderStatus: (orderId: string) => void;
  onCollectYoupi?: (order: CafeOrder) => void;
  onVerifyBankCredit?: (payload: {
    paymentId: string;
    decision: 'approve' | 'reject';
    utr?: string;
    note?: string;
  }) => Promise<void>;
  onRefundYoupiPayment?: (payload: {
    paymentId: string;
    refundRef?: string;
    reason?: string;
  }) => Promise<void>;
  onSettleOrderPayment?: (payload: {
    orderId: string;
    action: 'settle' | 'fail' | 'refund';
    network?: CardNetwork;
    last4?: string;
    authCode?: string;
    note?: string;
  }) => Promise<void>;
  onDownloadInvoicePdf?: (order: CafeOrder) => void;
  onExportExcel?: () => void;
  onRefresh?: () => void;
  onNotify: (msg: string) => void;
}

function getPaymentBadge(order: CafeOrder): { label: string; className: string } {
  const st = order.paymentStatus;
  if (st === 'refunded') {
    return {
      label: 'Refunded',
      className: 'bg-surface-container-highest text-on-surface-variant line-through',
    };
  }
  if (!st || st === 'paid') {
    if (order.deliveryPartner && /swiggy|zomato/i.test(order.deliveryPartner)) {
      return {
        label: `${order.deliveryPartner} Prepaid`,
        className: 'bg-tertiary-container/20 text-tertiary',
      };
    }
    return {
      label:
        order.paymentMode === 'upi'
          ? 'UPI Settled'
          : order.paymentMode === 'card'
            ? 'Card Settled'
            : 'Cash Paid',
      className: 'bg-tertiary-container/20 text-tertiary',
    };
  }
  if (st === 'observed') {
    return {
      label: 'Alert Matched · Verify',
      className: 'bg-primary-container/25 text-primary',
    };
  }
  if (st === 'manual_review') {
    return {
      label: 'Manual Review',
      className: 'bg-error-container/25 text-error',
    };
  }
  if (st === 'pending') {
    return {
      label:
        order.paymentMode === 'upi'
          ? 'Awaiting UPI'
          : order.paymentMode === 'card'
            ? 'Awaiting Card EDC'
            : 'Cash Due at Counter',
      className: 'bg-primary/15 text-primary',
    };
  }
  return {
    label: `${order.paymentMode.toUpperCase()} ${st}`,
    className: 'bg-error-container/20 text-error uppercase',
  };
}

const CARDS_PAGE_SIZE = 12;

export const OrderManagementScreen: React.FC<OrderManagementScreenProps> = ({
  orders,
  payments = [],
  managerPinRequired = true,
  isStaffAuthenticated = false,
  canRefund = true,
  onAdvanceOrderStatus,
  onCollectYoupi,
  onVerifyBankCredit,
  onRefundYoupiPayment,
  onSettleOrderPayment,
  onDownloadInvoicePdf,
  onExportExcel,
  onRefresh,
  onNotify,
}) => {
  const [channelFilter, setChannelFilter] = useState<'all' | ServiceMode>('all');
  const [paymentFilter, setPaymentFilter] = useState<PaymentFilterKey>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [viewMode, setViewMode] = useState<'cards' | 'table'>('cards');
  const [visibleLimit, setVisibleLimit] = useState(CARDS_PAGE_SIZE);
  const [selectedOrder, setSelectedOrder] = useState<CafeOrder | null>(null);
  const [verifyDialog, setVerifyDialog] = useState<VerifyDialogState>({ status: 'closed' });
  const [verifyUtr, setVerifyUtr] = useState('');
  const [verifyPin, setVerifyPin] = useState('');
  const [verifyNote, setVerifyNote] = useState('');

  const [settleDialog, setSettleDialog] = useState<SettleDialogState>({ status: 'closed' });
  const [settleNetwork, setSettleNetwork] = useState<CardNetwork>('Visa');
  const [settleLast4, setSettleLast4] = useState('');
  const [settleAuthCode, setSettleAuthCode] = useState('');
  const [settlePin, setSettlePin] = useState('');
  const [settleNote, setSettleNote] = useState('');

  const [refundDialog, setRefundDialog] = useState<RefundDialogState>({ status: 'closed' });
  const [refundRefInput, setRefundRefInput] = useState('');
  const [refundPin, setRefundPin] = useState('');
  const [refundReason, setRefundReason] = useState('');

  const verifyBusy = verifyDialog.status === 'submitting';
  const verifyError = verifyDialog.status === 'error' ? verifyDialog.errorMessage : null;
  const settleBusy = settleDialog.status === 'submitting';
  const settleError = settleDialog.status === 'error' ? settleDialog.errorMessage : null;
  const refundBusy = refundDialog.status === 'submitting';
  const refundError = refundDialog.status === 'error' ? refundDialog.errorMessage : null;

  const [spinning, setSpinning] = useState(false);

  const paymentByOrderId = useMemo(() => {
    const map = new Map<string, YoupiPaymentRecord>();
    for (const p of payments) {
      if (!map.has(p.orderId)) {
        map.set(p.orderId, p);
      }
    }
    return map;
  }, [payments]);

  const paymentStats = useMemo(() => {
    const isAggregator = (o: CafeOrder) =>
      Boolean(o.deliveryPartner && /swiggy|zomato/i.test(o.deliveryPartner));
    const upiOrders = orders.filter((o) => o.paymentMode === 'upi');
    const cardOrders = orders.filter((o) => o.paymentMode === 'card');
    const cashOrders = orders.filter((o) => o.paymentMode === 'cash');
    const aggOrders = orders.filter(isAggregator);
    const needsAction = orders.filter(
      (o) =>
        o.paymentStatus === 'pending' ||
        o.paymentStatus === 'observed' ||
        o.paymentStatus === 'manual_review'
    );
    return {
      upiTotal: upiOrders.reduce((s, o) => s + o.total, 0),
      upiCount: upiOrders.length,
      cardTotal: cardOrders.reduce((s, o) => s + o.total, 0),
      cardCount: cardOrders.length,
      cashTotal: cashOrders.reduce((s, o) => s + o.total, 0),
      cashCount: cashOrders.length,
      aggTotal: aggOrders.reduce((s, o) => s + o.total, 0),
      aggCount: aggOrders.length,
      needsActionCount: needsAction.length,
      needsActionTotal: needsAction.reduce((s, o) => s + o.total, 0),
    };
  }, [orders]);

  const visibleOrders = useMemo(() => {
    const byServiceAndSearch = filterOrders(orders, channelFilter, searchQuery);
    if (paymentFilter === 'all') return byServiceAndSearch;
    if (paymentFilter === 'aggregators') {
      return byServiceAndSearch.filter((o) =>
        Boolean(o.deliveryPartner && /swiggy|zomato/i.test(o.deliveryPartner))
      );
    }
    if (paymentFilter === 'needs_action') {
      return byServiceAndSearch.filter(
        (o) =>
          o.paymentStatus === 'pending' ||
          o.paymentStatus === 'observed' ||
          o.paymentStatus === 'manual_review'
      );
    }
    return byServiceAndSearch.filter((o) => o.paymentMode === paymentFilter);
  }, [channelFilter, orders, paymentFilter, searchQuery]);

  const preparingCount = orders.filter(
    (o) => o.status === 'placed' || o.status === 'preparing'
  ).length;
  const readyCount = orders.filter((o) => o.status === 'ready').length;
  const completedCount = orders.filter((o) => o.status === 'served').length;
  const shiftRevenue = orders.reduce((sum, o) => sum + o.total, 0);

  const handleRefresh = () => {
    setSpinning(true);
    onRefresh?.();
    setTimeout(() => {
      setSpinning(false);
      onNotify('Live orders feed refreshed');
    }, 450);
  };

  const columns = useMemo<ColumnDef<CafeOrder, unknown>[]>(
    () => [
      {
        accessorKey: 'id',
        header: 'Order #',
        cell: ({ row }) => (
          <div>
            <span className="font-bold text-primary">#{row.original.id}</span>
            <p className="text-[11px] text-on-surface-variant">{row.original.createdAtLabel}</p>
          </div>
        ),
      },
      {
        accessorKey: 'serviceMode',
        header: 'Channel',
        cell: ({ row }) => (
          <span className="px-2 py-0.5 rounded-full bg-secondary-container/20 text-primary-fixed-dim text-[11px] font-semibold">
            {row.original.serviceMode === 'dine-in'
              ? `Dine-In · ${row.original.tableNumber || 'T3'}`
              : row.original.deliveryPartner || 'Takeaway'}
          </span>
        ),
      },
      {
        id: 'itemsCount',
        header: 'Items',
        accessorFn: (o) => o.items.reduce((s, i) => s + i.quantity, 0),
        cell: ({ row }) => (
          <span className="tabular-nums text-on-surface-variant">
            {row.original.items.reduce((s, i) => s + i.quantity, 0)} items
          </span>
        ),
      },
      {
        accessorKey: 'status',
        header: 'Status',
        cell: ({ row }) => {
          const st = row.original.status;
          return (
            <span
              className={`px-2 py-0.5 rounded-full text-[11px] font-semibold uppercase ${
                st === 'ready'
                  ? 'bg-tertiary-container/20 text-tertiary'
                  : st === 'served'
                    ? 'bg-surface-container-highest text-on-surface-variant'
                    : 'bg-primary-container/20 text-primary'
              }`}
            >
              {st}
            </span>
          );
        },
      },
      {
        accessorKey: 'paymentMode',
        header: 'Payment',
        cell: ({ row }) => {
          const badge = getPaymentBadge(row.original);
          return (
            <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${badge.className}`}>
              {badge.label}
            </span>
          );
        },
      },
      {
        accessorKey: 'total',
        header: 'Total',
        cell: ({ row }) => (
          <span className="font-bold text-primary tabular-nums">₹{row.original.total}</span>
        ),
      },
      {
        id: 'actions',
        header: 'Actions',
        enableSorting: false,
        cell: ({ row }) => {
          const order = row.original;
          return (
            <div className="flex items-center gap-1.5">
              {order.status !== 'served' ? (
                <button
                  type="button"
                  onClick={() => onAdvanceOrderStatus(order.id)}
                  className="px-2.5 py-1 rounded bg-primary-container text-on-primary text-[11px] font-bold cursor-pointer"
                >
                  Advance
                </button>
              ) : (
                <button
                  type="button"
                  onClick={() => setSelectedOrder(order)}
                  className="px-2.5 py-1 rounded bg-surface-container-high text-primary text-[11px] font-semibold cursor-pointer"
                >
                  Receipt
                </button>
              )}
            </div>
          );
        },
      },
    ],
    [onAdvanceOrderStatus]
  );

  return (
    <div className="flex flex-col w-full pb-6 space-y-4">
      {/* Header & Search */}
      <div className="flex flex-col gap-2.5">
        <div className="flex items-center justify-between pt-1 gap-2">
          <div className="flex items-center gap-2">
            <h1 className="text-2xl font-bold text-on-surface tracking-tight">Orders</h1>
            <span className="inline-flex items-center justify-center px-2.5 py-0.5 rounded-full bg-primary-container/20 text-primary-container text-[11px] font-bold tabular-nums">
              Live {orders.length}
            </span>
          </div>
          <div className="flex items-center gap-1.5">
            <div className="inline-flex rounded-lg bg-surface-container-low p-0.5">
              <button
                type="button"
                onClick={() => setViewMode('cards')}
                className={`px-2.5 py-1 rounded-md text-xs font-semibold cursor-pointer ${
                  viewMode === 'cards'
                    ? 'bg-primary-container text-on-primary font-bold'
                    : 'text-on-surface-variant'
                }`}
              >
                Cards
              </button>
              <button
                type="button"
                onClick={() => setViewMode('table')}
                className={`px-2.5 py-1 rounded-md text-xs font-semibold cursor-pointer ${
                  viewMode === 'table'
                    ? 'bg-primary-container text-on-primary font-bold'
                    : 'text-on-surface-variant'
                }`}
              >
                Table
              </button>
            </div>
            {onExportExcel && (
              <button
                type="button"
                onClick={onExportExcel}
                className="px-2.5 py-1.5 rounded-lg bg-surface-container-high text-primary text-xs font-semibold flex items-center gap-1 hover:bg-surface-bright cursor-pointer"
              >
                <span className="material-symbols-outlined text-[16px]">table_view</span>
                <span className="hidden sm:inline">Excel</span>
              </button>
            )}
            <button
              type="button"
              aria-label="Refresh Orders"
              onClick={handleRefresh}
              className="w-9 h-9 rounded-lg bg-surface-container-high flex items-center justify-center text-on-surface-variant hover:text-on-surface active:scale-95 transition-all cursor-pointer"
            >
              <span
                className={`material-symbols-outlined text-[19px] ${spinning ? 'animate-spin' : ''}`}
              >
                refresh
              </span>
            </button>
          </div>
        </div>

        {/* Search Input */}
        <div className="relative w-full">
          <span className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-outline">
            <span className="material-symbols-outlined text-[18px]">search</span>
          </span>
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => {
              setSearchQuery(e.target.value);
              setVisibleLimit(CARDS_PAGE_SIZE);
            }}
            aria-label="Search orders by ID, customer, or table"
            placeholder="Search order ID, item, or table..."
            className="w-full h-11 pl-9 pr-9 bg-surface-container-low rounded-lg text-on-surface placeholder:text-outline text-sm focus:outline-none focus:ring-1 focus:ring-primary-container shadow-inner"
          />
          {searchQuery && (
            <button
              type="button"
              aria-label="Clear Search"
              onClick={() => {
                setSearchQuery('');
                setVisibleLimit(CARDS_PAGE_SIZE);
              }}
              className="absolute inset-y-0 right-0 pr-3 flex items-center text-outline hover:text-on-surface cursor-pointer"
            >
              <span className="material-symbols-outlined text-[16px]">close</span>
            </button>
          )}
        </div>

        {/* Channel Segmented Filter Bar */}
        <div className="flex items-center gap-1.5 overflow-x-auto py-0.5 no-scrollbar">
          {[
            { id: 'all' as const, label: `All (${orders.length})` },
            {
              id: 'dine-in' as const,
              label: `Dine-In (${orders.filter((o) => o.serviceMode === 'dine-in').length})`,
            },
            {
              id: 'takeaway' as const,
              label: `Takeaway (${orders.filter((o) => o.serviceMode === 'takeaway').length})`,
            },
            {
              id: 'delivery' as const,
              label: `Delivery (${orders.filter((o) => o.serviceMode === 'delivery').length})`,
            },
          ].map((pill) => {
            const active = channelFilter === pill.id;
            return (
              <button
                key={pill.id}
                type="button"
                onClick={() => {
                  setChannelFilter(pill.id);
                  setVisibleLimit(CARDS_PAGE_SIZE);
                }}
                className={`px-3.5 py-1.5 rounded-full text-xs shrink-0 shadow-sm transition-all cursor-pointer ${
                  active
                    ? 'bg-primary-container text-on-primary font-bold'
                    : 'bg-surface-container-high text-on-surface-variant hover:text-on-surface font-medium'
                }`}
              >
                {pill.label}
              </button>
            );
          })}
        </div>
        {/* Payment Channel Management Filter Bar */}
        <div className="flex items-center gap-1.5 overflow-x-auto py-0.5 no-scrollbar">
          {[
            { id: 'all' as PaymentFilterKey, label: 'All Payments' },
            { id: 'upi' as PaymentFilterKey, label: `UPI / YouPI (${paymentStats.upiCount})` },
            { id: 'card' as PaymentFilterKey, label: `Cards (${paymentStats.cardCount})` },
            { id: 'cash' as PaymentFilterKey, label: `Cash (${paymentStats.cashCount})` },
            { id: 'aggregators' as PaymentFilterKey, label: `Swiggy / Zomato (${paymentStats.aggCount})` },
            {
              id: 'needs_action' as PaymentFilterKey,
              label: `Needs Settlement (${paymentStats.needsActionCount})`,
            },
          ].map((pill) => {
            const active = paymentFilter === pill.id;
            return (
              <button
                key={pill.id}
                type="button"
                onClick={() => {
                  setPaymentFilter(pill.id);
                  setVisibleLimit(CARDS_PAGE_SIZE);
                }}
                className={`px-3 py-1 rounded-lg text-[11px] shrink-0 transition-all cursor-pointer border ${
                  active
                    ? 'bg-secondary-container/40 text-primary border-primary/50 font-bold'
                    : 'bg-surface-container-low text-on-surface-variant border-outline-variant/20 hover:text-on-surface font-medium'
                }`}
              >
                {pill.label}
              </button>
            );
          })}
        </div>
      </div>

      {/* Payment Reconciliation & Settlement Strip */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-2.5">
        <div className="p-3 rounded-xl bg-surface-container-low border border-outline-variant/15">
          <span className="text-[10px] uppercase tracking-wider text-on-surface-variant font-semibold">
            UPI / YouPI-PG
          </span>
          <p className="text-lg font-bold text-primary tabular-nums mt-0.5">
            {formatINR(paymentStats.upiTotal)}
          </p>
          <span className="text-[10px] text-on-surface-variant">
            {paymentStats.upiCount} orders · Paytm/GPay/PhonePe/QR
          </span>
        </div>
        <div className="p-3 rounded-xl bg-surface-container-low border border-outline-variant/15">
          <span className="text-[10px] uppercase tracking-wider text-on-surface-variant font-semibold">
            Card (EDC &amp; Online)
          </span>
          <p className="text-lg font-bold text-on-surface tabular-nums mt-0.5">
            {formatINR(paymentStats.cardTotal)}
          </p>
          <span className="text-[10px] text-on-surface-variant">
            {paymentStats.cardCount} orders · Visa/MC/RuPay
          </span>
        </div>
        <div className="p-3 rounded-xl bg-surface-container-low border border-outline-variant/15">
          <span className="text-[10px] uppercase tracking-wider text-on-surface-variant font-semibold">
            Cash &amp; Swiggy/Zomato
          </span>
          <p className="text-lg font-bold text-tertiary tabular-nums mt-0.5">
            {formatINR(paymentStats.cashTotal + paymentStats.aggTotal)}
          </p>
          <span className="text-[10px] text-on-surface-variant">
            {paymentStats.cashCount} cash · {paymentStats.aggCount} aggregator
          </span>
        </div>
        <div className="p-3 rounded-xl bg-surface-container-low border border-primary/25">
          <span className="text-[10px] uppercase tracking-wider text-primary font-semibold">
            Awaiting Settlement
          </span>
          <p className="text-lg font-bold text-primary tabular-nums mt-0.5">
            {formatINR(paymentStats.needsActionTotal)}
          </p>
          <span className="text-[10px] text-on-surface-variant">
            {paymentStats.needsActionCount} orders pending verify / EDC / cash
          </span>
        </div>
      </div>

      {/* Operational Overview Strip */}
      <div className="grid grid-cols-3 gap-2 p-2.5 rounded-xl bg-surface-container-low shadow-sm">
        <div className="flex flex-col items-center justify-center p-2 rounded-lg bg-surface-container/60">
          <span className="text-[11px] text-secondary">Preparing</span>
          <span className="text-xl font-bold text-primary tabular-nums">
            {String(preparingCount).padStart(2, '0')}
          </span>
        </div>
        <div className="flex flex-col items-center justify-center p-2 rounded-lg bg-surface-container/60">
          <span className="text-[11px] text-tertiary">Ready to Pick</span>
          <span className="text-xl font-bold text-tertiary tabular-nums">
            {String(readyCount).padStart(2, '0')}
          </span>
        </div>
        <div className="flex flex-col items-center justify-center p-2 rounded-lg bg-surface-container/60">
          <span className="text-[11px] text-on-surface-variant">Completed</span>
          <span className="text-xl font-bold text-on-surface tabular-nums">
            {String(completedCount).padStart(2, '0')}
          </span>
        </div>
      </div>

      {/* Orders Feed: TanStack Table or Cards */}
      {viewMode === 'table' ? (
        <CafeDataTable
          data={visibleOrders}
          columns={columns}
          emptyText="No orders match the selected filter."
        />
      ) : visibleOrders.length === 0 ? (
        <div className="p-8 rounded-xl bg-surface-container-low text-center space-y-2 border border-outline-variant/15">
          <span className="material-symbols-outlined text-[28px] text-outline">receipt_long</span>
          <p className="text-sm font-semibold text-on-surface">No orders match your filters</p>
          <p className="text-xs text-on-surface-variant">
            Clear search or switch channel / payment filters to view orders.
          </p>
          {(channelFilter !== 'all' || paymentFilter !== 'all' || searchQuery) && (
            <button
              type="button"
              onClick={() => {
                setChannelFilter('all');
                setPaymentFilter('all');
                setSearchQuery('');
                setVisibleLimit(CARDS_PAGE_SIZE);
              }}
              className="mt-1 px-4 py-1.5 rounded-lg bg-surface-container-high text-primary text-xs font-bold cursor-pointer"
            >
              Reset Filters
            </button>
          )}
        </div>
      ) : (
        <div className="space-y-3">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
            {visibleOrders.slice(0, visibleLimit).map((order) => {
              const isServed = order.status === 'served';
              const isReady = order.status === 'ready';
              const iconName =
                order.serviceMode === 'dine-in'
                  ? isServed
                    ? 'check_circle'
                    : 'table_restaurant'
                  : order.serviceMode === 'takeaway'
                    ? 'shopping_bag'
                    : 'two_wheeler';

              return (
                <div
                  key={order.id}
                  className={`p-3.5 rounded-xl bg-surface-container flex flex-col gap-3 shadow-md min-w-0 ${
                    isServed ? 'opacity-90' : 'hover:bg-surface-variant/40'
                  } transition-colors`}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex items-center gap-2.5 min-w-0">
                      <div
                        className={`w-9 h-9 rounded-lg flex items-center justify-center shrink-0 ${
                          isReady
                            ? 'bg-tertiary-container/15 text-tertiary'
                            : isServed
                              ? 'bg-surface-container-highest text-on-surface-variant'
                              : 'bg-primary-container/15 text-primary-container'
                        }`}
                      >
                        <span className="material-symbols-outlined text-[20px]">{iconName}</span>
                      </div>
                      <div className="flex flex-col min-w-0">
                        <div className="flex items-center gap-1.5 flex-wrap">
                          <span className="text-base font-bold text-on-surface tracking-tight">
                            #{order.id}
                          </span>
                          <span className="px-2 py-0.5 rounded-full bg-secondary-container/20 text-primary-fixed-dim text-[11px] font-bold">
                            {order.serviceMode === 'dine-in'
                              ? `Dine-In · ${order.tableNumber || 'T3'}`
                              : order.serviceMode === 'delivery'
                                ? order.deliveryPartner
                                  ? `Delivery · ${order.deliveryPartner}`
                                  : 'Delivery'
                                : 'Takeaway'}
                          </span>
                        </div>
                      <div className="flex items-center gap-1.5 text-on-surface-variant text-[11px]">
                        <span>{order.createdAtLabel}</span>
                        <span>·</span>
                        <span>
                          {(() => {
                            const totalQty = order.items.reduce((s, i) => s + i.quantity, 0);
                            return `${totalQty} ${totalQty === 1 ? 'Item' : 'Items'}`;
                          })()}
                        </span>
                      </div>
                    </div>
                  </div>

                  <div className="flex flex-col items-end shrink-0">
                    <span className="text-lg font-bold text-primary tracking-tight tabular-nums">
                      ₹{order.total}
                    </span>
                    <span
                      className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-semibold mt-0.5 ${
                        isReady
                          ? 'bg-tertiary-container/20 text-tertiary font-bold'
                          : isServed
                            ? 'bg-surface-container-highest text-on-surface-variant'
                            : 'bg-primary-container/20 text-primary'
                      }`}
                    >
                      {!isServed && (
                        <span
                          className={`w-1.5 h-1.5 rounded-full ${
                            isReady ? 'bg-tertiary' : 'bg-primary animate-ping'
                          }`}
                        />
                      )}
                      {ORDER_STATUS_META[order.status].kotBadgeLabel}
                    </span>
                  </div>
                </div>

                {/* Itemized preview */}
                <div className="p-2.5 rounded-lg bg-surface-container-lowest text-xs flex flex-col gap-1">
                  {order.items.map((item) => (
                    <div
                      key={item.menuItemId}
                      className="flex justify-between items-center text-on-surface"
                    >
                      <span className="truncate">
                        {item.quantity} × {item.name}
                      </span>
                      <span className="text-primary-fixed-dim shrink-0 tabular-nums">
                        ₹{item.price * item.quantity}
                      </span>
                    </div>
                  ))}
                  {order.riderNote && (
                    <div className="flex items-center justify-between text-outline text-[11px] pt-1">
                      <span>{order.riderNote}</span>
                      <span className="text-tertiary font-bold">Prepaid</span>
                    </div>
                  )}
                </div>

                {/* Action Footer */}
                <div className="flex flex-wrap items-center justify-between pt-0.5 gap-2 mt-auto">
                  <div className="flex items-center gap-1.5 flex-wrap text-outline text-[11px]">
                    <span className="material-symbols-outlined text-[15px]">payments</span>
                    <span
                      className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                        getPaymentBadge(order).className
                      }`}
                    >
                      {getPaymentBadge(order).label}
                    </span>
                    {(() => {
                      const yp = paymentByOrderId.get(order.id);
                      if (!yp) {
                        return (
                          <span>
                            {order.paymentChannelLabel ? `${order.paymentChannelLabel} · ` : ''}
                            {order.paymentRef || `${order.paymentMode.toUpperCase()} Settled`}
                          </span>
                        );
                      }
                      return (
                        <span className="font-mono text-[10px] text-on-surface-variant">
                          {order.paymentChannelLabel ? `${order.paymentChannelLabel} · ` : ''}
                          {yp.utr ? `UTR ${yp.utr}` : `L${yp.verificationLevel}`}
                        </span>
                      );
                    })()}
                  </div>

                  <div className="flex items-center gap-1.5 flex-wrap">
                    {(() => {
                      const yp = paymentByOrderId.get(order.id);
                      if (
                        yp &&
                        (yp.status === 'observed' || yp.status === 'manual_review') &&
                        onVerifyBankCredit
                      ) {
                        return (
                          <button
                            type="button"
                            onClick={() => {
                              setVerifyDialog({ status: 'editing', order, payment: yp });
                              setVerifyUtr(yp.utr || '');
                              setVerifyPin('');
                              setVerifyNote('');
                            }}
                            className="px-2.5 py-1.5 rounded-lg bg-primary/20 text-primary text-xs font-bold flex items-center gap-1 cursor-pointer hover:bg-primary/30"
                          >
                            <span className="material-symbols-outlined text-[15px]">
                              verified_user
                            </span>
                            <span>Verify Bank Credit</span>
                          </button>
                        );
                      }
                      if (
                        order.paymentMode === 'upi' &&
                        order.paymentStatus &&
                        order.paymentStatus !== 'paid' &&
                        order.paymentStatus !== 'observed' &&
                        order.paymentStatus !== 'refunded' &&
                        onCollectYoupi
                      ) {
                        return (
                          <button
                            type="button"
                            onClick={() => onCollectYoupi(order)}
                            className="px-2.5 py-1.5 rounded-lg bg-primary/20 text-primary text-xs font-bold flex items-center gap-1 cursor-pointer hover:bg-primary/30"
                          >
                            <span className="material-symbols-outlined text-[15px]">qr_code_2</span>
                            <span>Collect UPI</span>
                          </button>
                        );
                      }
                      if (
                        canRefund &&
                        order.paymentMode === 'upi' &&
                        (!order.paymentStatus || order.paymentStatus === 'paid') &&
                        ((yp && yp.status === 'reconciled' && onRefundYoupiPayment) || onSettleOrderPayment)
                      ) {
                        return (
                          <button
                            type="button"
                            data-testid={`refund-upi-${order.id}`}
                            onClick={() => {
                              setRefundDialog({ status: 'editing', order, payment: yp });
                              setRefundRefInput('');
                              setRefundPin('');
                              setRefundReason('');
                            }}
                            className="px-2.5 py-1.5 rounded-lg bg-surface-container-high text-on-surface-variant hover:text-error text-xs font-bold flex items-center gap-1 cursor-pointer"
                          >
                            <span className="material-symbols-outlined text-[15px]">undo</span>
                            <span>Refund UPI</span>
                          </button>
                        );
                      }
                      if (
                        order.paymentMode !== 'upi' &&
                        onSettleOrderPayment &&
                        order.paymentStatus !== 'refunded'
                      ) {
                        const isPendingNonUpi = order.paymentStatus === 'pending';
                        return (
                          <button
                            type="button"
                            onClick={() => {
                              setSettleDialog({ status: 'editing', order });
                              setSettleNetwork(order.cardDetails?.network ?? 'Visa');
                              setSettleLast4(order.cardDetails?.last4 ?? '');
                              setSettleAuthCode(order.cardDetails?.authCode ?? '');
                              setSettlePin('');
                              setSettleNote('');
                            }}
                            className={`px-2.5 py-1.5 rounded-lg text-xs font-bold flex items-center gap-1 cursor-pointer ${
                              isPendingNonUpi
                                ? 'bg-primary/20 text-primary hover:bg-primary/30'
                                : 'bg-surface-container-high text-on-surface-variant hover:text-on-surface'
                            }`}
                          >
                            <span className="material-symbols-outlined text-[15px]">
                              {order.paymentMode === 'card' ? 'credit_card' : 'payments'}
                            </span>
                            <span>
                              {isPendingNonUpi
                                ? order.paymentMode === 'card'
                                  ? 'Settle Card EDC'
                                  : 'Collect Cash'
                                : 'Manage Payment'}
                            </span>
                          </button>
                        );
                      }
                      return null;
                    })()}

                    <button
                      type="button"
                      onClick={() => onNotify(`Printing KOT ${order.kotNumber} for #${order.id}`)}
                      className="px-3 py-1.5 rounded-lg bg-surface-container-high text-on-surface text-xs font-semibold flex items-center gap-1 active:scale-95 transition-all cursor-pointer"
                    >
                      <span className="material-symbols-outlined text-[15px]">print</span>
                      <span>Print KOT</span>
                    </button>

                    {!isServed ? (
                      <button
                        type="button"
                        onClick={() => onAdvanceOrderStatus(order.id)}
                        className={`px-3 py-1.5 rounded-lg text-xs font-bold flex items-center gap-1 active:scale-95 transition-all cursor-pointer ${
                          isReady
                            ? 'bg-tertiary-container text-on-tertiary-container'
                            : 'bg-primary-container text-on-primary'
                        }`}
                      >
                        <span>{ORDER_STATUS_META[order.status].orderMgmtActionLabel ?? 'Advance'}</span>
                        <span className="material-symbols-outlined text-[15px]">
                          {isReady ? 'done_all' : 'chevron_right'}
                        </span>
                      </button>
                    ) : (
                      <button
                        type="button"
                        onClick={() => setSelectedOrder(order)}
                        className="text-primary hover:text-primary-container text-xs font-semibold cursor-pointer"
                      >
                        Receipt
                      </button>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
          </div>
          {visibleOrders.length > visibleLimit && (
            <div className="flex items-center justify-center pt-1">
              <button
                type="button"
                onClick={() => setVisibleLimit((prev) => prev + CARDS_PAGE_SIZE)}
                className="px-4 py-2 rounded-xl bg-surface-container-high hover:bg-surface-bright text-primary text-xs font-bold cursor-pointer"
              >
                Load More Orders ({visibleOrders.length - visibleLimit} remaining)
              </button>
            </div>
          )}
        </div>
      )}

      {/* Daily Order Shift Tally Banner */}
      <div className="w-full p-4 rounded-xl bg-gradient-to-r from-surface-container-high via-surface-container to-surface-container-high shadow-lg flex items-center justify-between gap-2">
        <div className="flex items-center gap-2.5 min-w-0">
          <div className="w-8 h-8 rounded-full bg-primary-container/20 flex items-center justify-center text-primary-container shrink-0">
            <span className="material-symbols-outlined text-[18px]">query_stats</span>
          </div>
          <div className="flex flex-col min-w-0">
            <span className="text-sm font-bold text-on-surface truncate">Daily Order Shift Tally</span>
            <span className="text-[11px] text-on-surface-variant truncate">
              {orders.length} Orders Recorded Today
            </span>
          </div>
        </div>
        <div className="flex flex-col items-end shrink-0">
          <span className="text-xl font-bold text-primary tabular-nums">
            {formatINR(shiftRevenue)}
          </span>
          <span className="text-[11px] text-tertiary flex items-center gap-0.5">
            <span className="material-symbols-outlined text-[13px]">trending_up</span>Live total
          </span>
        </div>
      </div>

      {/* Order Receipt Dialog */}
      <Dialog open={Boolean(selectedOrder)} onOpenChange={(o) => !o && setSelectedOrder(null)}>
        <DialogContent className="bg-surface-container-low border border-outline-variant/30 text-on-surface sm:max-w-md rounded-2xl p-5">
          {selectedOrder && (
            <>
              <DialogHeader>
                <DialogTitle className="text-lg font-bold text-primary">
                  Order #{selectedOrder.id}
                </DialogTitle>
                <DialogDescription className="text-xs text-on-surface-variant">
                  {selectedOrder.createdAtLabel} · {selectedOrder.paymentMode.toUpperCase()}
                </DialogDescription>
              </DialogHeader>
              <div className="bg-surface-container-lowest rounded-xl p-3.5 space-y-2 text-xs">
                {selectedOrder.items.map((item) => (
                  <div key={item.menuItemId} className="flex justify-between">
                    <span>
                      {item.quantity} × {item.name}
                    </span>
                    <span className="tabular-nums">₹{item.price * item.quantity}</span>
                  </div>
                ))}
                <div className="h-px bg-surface-variant my-1" />
                <div className="flex justify-between text-sm font-bold text-primary">
                  <span>Total</span>
                  <span className="tabular-nums">₹{selectedOrder.total}</span>
                </div>
              </div>
              <div className="flex gap-2">
                {onDownloadInvoicePdf && (
                  <button
                    type="button"
                    onClick={() => onDownloadInvoicePdf(selectedOrder)}
                    className="flex-1 h-11 rounded-xl bg-surface-container-high text-primary font-bold text-xs flex items-center justify-center gap-1.5 cursor-pointer hover:bg-surface-bright"
                  >
                    <span className="material-symbols-outlined text-[16px]">picture_as_pdf</span>
                    <span>PDF Invoice</span>
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => setSelectedOrder(null)}
                  className="flex-1 h-11 rounded-xl bg-primary-container text-on-primary-container font-bold text-sm cursor-pointer"
                >
                  Close Receipt
                </button>
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>
      {/* Verify Bank Credit Dialog (Manager PIN Protected) */}
      <Dialog
        open={verifyDialog.status !== 'closed'}
        onOpenChange={(o) => !o && !verifyBusy && setVerifyDialog({ status: 'closed' })}
      >
        <DialogContent className="bg-surface-container border border-outline-variant/30 text-on-surface sm:max-w-md rounded-2xl p-5">
          {verifyDialog.status !== 'closed' && (
            <>
              <DialogHeader>
                <DialogTitle className="text-lg font-bold text-primary flex items-center gap-2">
                  <span className="material-symbols-outlined text-[20px]">verified_user</span>
                  <span>Verify Bank Credit · #{verifyDialog.order.id}</span>
                </DialogTitle>
                <DialogDescription className="text-xs text-on-surface-variant">
                  Confirm ₹{verifyDialog.payment.amountInr} appears on your bank app/statement before marking settled.
                </DialogDescription>
              </DialogHeader>

              <div className="bg-surface-container-low rounded-xl p-3 text-xs space-y-1.5">
                <div className="flex justify-between">
                  <span className="text-outline">YouPI-PG Status</span>
                  <span className="font-mono font-bold text-primary">
                    {verifyDialog.payment.gatewayStatus} ({verifyDialog.payment.settlementState})
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-outline">Observer Sources</span>
                  <span>
                    {verifyDialog.payment.verificationSources.join(', ') || 'None'} (L
                    {verifyDialog.payment.verificationLevel})
                  </span>
                </div>
                {verifyDialog.payment.manualReviewReason && (
                  <p className="text-error text-[11px] pt-1">
                    Flag: {verifyDialog.payment.manualReviewReason}
                  </p>
                )}
              </div>

              <div className="space-y-3 text-xs">
                <div>
                  <label className="block font-semibold text-on-surface-variant mb-1">
                    12-Digit Bank UTR / RRN
                  </label>
                  <input
                    type="text"
                    value={verifyUtr}
                    onChange={(e) => setVerifyUtr(e.target.value)}
                    placeholder="e.g. 429812345678"
                    className="w-full px-3 py-2 rounded-lg bg-surface-container-low text-on-surface font-mono text-sm focus:outline-none focus:ring-1 focus:ring-primary"
                  />
                </div>

                {managerPinRequired && (
                  <div>
                    <label className="block font-semibold text-on-surface-variant mb-1">
                      Staff 4-Digit PIN {isStaffAuthenticated ? '(Optional override)' : ''}
                    </label>
                    <input
                      type="password"
                      inputMode="numeric"
                      maxLength={4}
                      value={verifyPin}
                      onChange={(e) => setVerifyPin(e.target.value)}
                      placeholder={isStaffAuthenticated ? 'Session active (optional PIN)' : 'Enter 4-digit staff PIN'}
                      className="w-full px-3 py-2 rounded-lg bg-surface-container-low text-on-surface font-mono text-sm focus:outline-none focus:ring-1 focus:ring-primary"
                    />
                  </div>
                )}

                <div>
                  <label className="block font-semibold text-on-surface-variant mb-1">
                    Audit Note (Optional)
                  </label>
                  <input
                    type="text"
                    value={verifyNote}
                    onChange={(e) => setVerifyNote(e.target.value)}
                    placeholder="Matched on HDFC statement"
                    className="w-full px-3 py-2 rounded-lg bg-surface-container-low text-on-surface text-sm focus:outline-none focus:ring-1 focus:ring-primary"
                  />
                </div>

                {verifyError && <p className="text-error text-xs">{verifyError}</p>}
              </div>

              <div className="flex gap-2 pt-1">
                <button
                  type="button"
                  disabled={verifyBusy}
                  onClick={async () => {
                    if (!onVerifyBankCredit) return;
                    const { order, payment } = verifyDialog;
                    setVerifyDialog({ status: 'submitting', order, payment });
                    try {
                      if (managerPinRequired) {
                        const pin = verifyPin.trim();
                        if (!isStaffAuthenticated && pin.length === 0) {
                          throw new Error('Enter your 4-digit staff PIN to continue.');
                        }
                        if (pin.length > 0) {
                          await authenticateManagerPinApi(pin);
                        }
                      }
                      await onVerifyBankCredit({
                        paymentId: payment.id,
                        decision: 'reject',
                        note: verifyNote.trim() || 'Rejected by manager during bank check',
                      });
                      setVerifyDialog({ status: 'closed' });
                    } catch (err) {
                      setVerifyDialog({
                        status: 'error',
                        order,
                        payment,
                        errorMessage: err instanceof Error ? err.message : 'Rejection failed',
                      });
                    }
                  }}
                  className="px-4 py-2.5 rounded-xl bg-error-container/30 text-error font-semibold text-xs cursor-pointer disabled:opacity-40"
                >
                  Reject
                </button>
                <button
                  type="button"
                  disabled={verifyBusy}
                  onClick={async () => {
                    if (!onVerifyBankCredit) return;
                    const { order, payment } = verifyDialog;
                    setVerifyDialog({ status: 'submitting', order, payment });
                    try {
                      if (managerPinRequired) {
                        const pin = verifyPin.trim();
                        if (!isStaffAuthenticated && pin.length === 0) {
                          throw new Error('Enter your 4-digit staff PIN to continue.');
                        }
                        if (pin.length > 0) {
                          await authenticateManagerPinApi(pin);
                        }
                      }
                      await onVerifyBankCredit({
                        paymentId: payment.id,
                        decision: 'approve',
                        utr: verifyUtr.trim(),
                        note: verifyNote.trim() || undefined,
                      });
                      setVerifyDialog({ status: 'closed' });
                    } catch (err) {
                      setVerifyDialog({
                        status: 'error',
                        order,
                        payment,
                        errorMessage: err instanceof Error ? err.message : 'Verification failed',
                      });
                    }
                  }}
                  className="flex-1 py-2.5 rounded-xl bg-tertiary text-on-tertiary font-bold text-xs cursor-pointer disabled:opacity-40"
                >
                  Confirm Credit &amp; Mark Paid
                </button>
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>

      {/* Card EDC / Cash Settlement & Refund Dialog (Manager PIN Protected) */}
      <Dialog
        open={settleDialog.status !== 'closed'}
        onOpenChange={(o) => !o && !settleBusy && setSettleDialog({ status: 'closed' })}
      >
        <DialogContent className="bg-surface-container border border-outline-variant/30 text-on-surface sm:max-w-md rounded-2xl p-5">
          {settleDialog.status !== 'closed' && (
            <>
              <DialogHeader>
                <DialogTitle className="text-lg font-bold text-primary flex items-center gap-2">
                  <span className="material-symbols-outlined text-[20px]">
                    {settleDialog.order.paymentMode === 'card' ? 'credit_card' : 'payments'}
                  </span>
                  <span>
                    {settleDialog.order.paymentStatus === 'pending'
                      ? `Settle ${settleDialog.order.paymentMode.toUpperCase()} · #${settleDialog.order.id}`
                      : `Manage Payment · #${settleDialog.order.id}`}
                  </span>
                </DialogTitle>
                <DialogDescription className="text-xs text-on-surface-variant">
                  Payable amount <span className="text-primary font-bold">₹{settleDialog.order.total}</span> ·{' '}
                  {settleDialog.order.paymentChannelLabel || settleDialog.order.paymentMode.toUpperCase()}
                </DialogDescription>
              </DialogHeader>

              <div className="space-y-3 text-xs">
                {settleDialog.order.paymentMode === 'card' && (
                  <>
                    <div>
                      <span className="block font-semibold text-on-surface-variant mb-1">
                        Card Network
                      </span>
                      <div className="grid grid-cols-4 gap-1.5">
                        {(['Visa', 'Mastercard', 'RuPay', 'Amex'] as CardNetwork[]).map((net) => (
                          <button
                            key={net}
                            type="button"
                            onClick={() => setSettleNetwork(net)}
                            className={`py-1.5 rounded-lg font-bold cursor-pointer ${
                              settleNetwork === net
                                ? 'bg-primary text-on-primary'
                                : 'bg-surface-container-low text-on-surface-variant'
                            }`}
                          >
                            {net}
                          </button>
                        ))}
                      </div>
                    </div>
                    <div className="grid grid-cols-2 gap-2">
                      <div>
                        <label className="block font-semibold text-on-surface-variant mb-1">
                          Last 4 Digits
                        </label>
                        <input
                          type="text"
                          inputMode="numeric"
                          maxLength={4}
                          value={settleLast4}
                          onChange={(e) =>
                            setSettleLast4(e.target.value.replace(/\D/g, '').slice(0, 4))
                          }
                          placeholder="4242"
                          className="w-full px-3 py-2 rounded-lg bg-surface-container-low text-on-surface font-mono text-sm focus:outline-none focus:ring-1 focus:ring-primary"
                        />
                      </div>
                      <div>
                        <label className="block font-semibold text-on-surface-variant mb-1">
                          EDC Auth Code
                        </label>
                        <input
                          type="text"
                          value={settleAuthCode}
                          onChange={(e) => setSettleAuthCode(e.target.value.toUpperCase())}
                          placeholder="e.g. AUTH8421"
                          className="w-full px-3 py-2 rounded-lg bg-surface-container-low text-on-surface font-mono text-sm focus:outline-none focus:ring-1 focus:ring-primary"
                        />
                      </div>
                    </div>
                  </>
                )}

                {managerPinRequired && (
                  <div>
                    <label className="block font-semibold text-on-surface-variant mb-1">
                      Staff 4-Digit PIN {isStaffAuthenticated ? '(Optional override)' : ''}
                    </label>
                    <input
                      type="password"
                      inputMode="numeric"
                      maxLength={4}
                      value={settlePin}
                      onChange={(e) => setSettlePin(e.target.value)}
                      placeholder={isStaffAuthenticated ? 'Session active (optional PIN)' : 'Enter 4-digit staff PIN'}
                      className="w-full px-3 py-2 rounded-lg bg-surface-container-low text-on-surface font-mono text-sm focus:outline-none focus:ring-1 focus:ring-primary"
                    />
                  </div>
                )}

                <div>
                  <label className="block font-semibold text-on-surface-variant mb-1">
                    Settlement / Audit Note
                  </label>
                  <input
                    type="text"
                    value={settleNote}
                    onChange={(e) => setSettleNote(e.target.value)}
                    placeholder="Optional counter slip / refund note"
                    className="w-full px-3 py-2 rounded-lg bg-surface-container-low text-on-surface text-sm focus:outline-none focus:ring-1 focus:ring-primary"
                  />
                </div>

                {settleError && <p className="text-error text-xs">{settleError}</p>}
              </div>

              <div className="flex gap-2 pt-1">
                {settleDialog.order.paymentStatus === 'paid' ? (
                  canRefund ? (
                    <button
                      type="button"
                      disabled={settleBusy}
                      onClick={async () => {
                        if (!onSettleOrderPayment) return;
                        const { order } = settleDialog;
                        setSettleDialog({ status: 'submitting', order });
                        try {
                          if (managerPinRequired) {
                            const pin = settlePin.trim();
                            if (!isStaffAuthenticated && pin.length === 0) {
                              throw new Error('Enter your 4-digit Manager PIN to issue a refund.');
                            }
                            if (pin.length > 0) {
                              await authenticateManagerPinApi(pin);
                            }
                          }
                          await onSettleOrderPayment({
                            orderId: order.id,
                            action: 'refund',
                            note: settleNote.trim() || `Refunded ₹${order.total} at counter`,
                          });
                          setSettleDialog({ status: 'closed' });
                        } catch (err) {
                          setSettleDialog({
                            status: 'error',
                            order,
                            errorMessage: err instanceof Error ? err.message : 'Refund failed',
                          });
                        }
                      }}
                      className="flex-1 py-2.5 rounded-xl bg-error-container/30 text-error font-bold text-xs cursor-pointer disabled:opacity-40"
                    >
                      Issue Full Refund (₹{settleDialog.order.total})
                    </button>
                  ) : (
                    <p className="text-xs text-on-surface-variant py-2 text-center w-full">
                      Refunds require Manager or Owner PIN authorization.
                    </p>
                  )
                ) : (
                  <>
                    <button
                      type="button"
                      disabled={settleBusy}
                      onClick={async () => {
                        if (!onSettleOrderPayment) return;
                        const { order } = settleDialog;
                        setSettleDialog({ status: 'submitting', order });
                        try {
                          if (managerPinRequired) {
                            const pin = settlePin.trim();
                            if (!isStaffAuthenticated && pin.length === 0) {
                              throw new Error('Enter your 4-digit staff PIN to continue.');
                            }
                            if (pin.length > 0) {
                              await authenticateManagerPinApi(pin);
                            }
                          }
                          await onSettleOrderPayment({
                            orderId: order.id,
                            action: 'fail',
                            note: settleNote.trim() || 'Marked declined/cancelled at counter',
                          });
                          setSettleDialog({ status: 'closed' });
                        } catch (err) {
                          setSettleDialog({
                            status: 'error',
                            order,
                            errorMessage: err instanceof Error ? err.message : 'Update failed',
                          });
                        }
                      }}
                      className="px-4 py-2.5 rounded-xl bg-error-container/30 text-error font-semibold text-xs cursor-pointer disabled:opacity-40"
                    >
                      Mark Declined
                    </button>
                    <button
                      type="button"
                      disabled={settleBusy}
                      onClick={async () => {
                        if (!onSettleOrderPayment) return;
                        const { order } = settleDialog;
                        setSettleDialog({ status: 'submitting', order });
                        try {
                          if (managerPinRequired) {
                            const pin = settlePin.trim();
                            if (!isStaffAuthenticated && pin.length === 0) {
                              throw new Error('Enter your 4-digit staff PIN to continue.');
                            }
                            if (pin.length > 0) {
                              await authenticateManagerPinApi(pin);
                            }
                          }
                          await onSettleOrderPayment({
                            orderId: order.id,
                            action: 'settle',
                            network: order.paymentMode === 'card' ? settleNetwork : undefined,
                            last4:
                              order.paymentMode === 'card' && settleLast4.trim()
                                ? settleLast4.trim()
                                : undefined,
                            authCode:
                              order.paymentMode === 'card' && settleAuthCode.trim()
                                ? settleAuthCode.trim()
                                : undefined,
                            note: settleNote.trim() || undefined,
                          });
                          setSettleDialog({ status: 'closed' });
                        } catch (err) {
                          setSettleDialog({
                            status: 'error',
                            order,
                            errorMessage: err instanceof Error ? err.message : 'Settlement failed',
                          });
                        }
                      }}
                      className="flex-1 py-2.5 rounded-xl bg-tertiary text-on-tertiary font-bold text-xs cursor-pointer disabled:opacity-40"
                    >
                      {settleDialog.order.paymentMode === 'card'
                        ? 'Confirm Card EDC & Mark Paid'
                        : 'Confirm Cash Collected'}
                    </button>
                  </>
                )}
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>

      {/* UPI Refund Dialog (Manager PIN Protected) */}
      <Dialog
        open={refundDialog.status !== 'closed'}
        onOpenChange={(o) => !o && !refundBusy && setRefundDialog({ status: 'closed' })}
      >
        <DialogContent className="bg-surface-container border border-outline-variant/30 text-on-surface sm:max-w-md rounded-2xl p-5">
          {refundDialog.status !== 'closed' && (
            <>
              <DialogHeader>
                <DialogTitle className="text-lg font-bold text-error flex items-center gap-2">
                  <span className="material-symbols-outlined text-[20px]">undo</span>
                  <span>Issue UPI Refund · #{refundDialog.order.id}</span>
                </DialogTitle>
                <DialogDescription className="text-xs text-on-surface-variant">
                  Refund full settled amount{' '}
                  <span className="text-primary font-bold">₹{refundDialog.order.total}</span>
                  {refundDialog.payment?.utr ? ` (Original UTR ${refundDialog.payment.utr})` : ''}.
                </DialogDescription>
              </DialogHeader>

              <div className="space-y-3 text-xs">
                <div>
                  <label className="block font-semibold text-on-surface-variant mb-1">
                    Bank Refund Reference / UTR (Optional)
                  </label>
                  <input
                    type="text"
                    value={refundRefInput}
                    onChange={(e) => setRefundRefInput(e.target.value)}
                    placeholder="Auto-generated if left blank"
                    className="w-full px-3 py-2 rounded-lg bg-surface-container-low text-on-surface font-mono text-sm focus:outline-none focus:ring-1 focus:ring-primary"
                  />
                </div>

                {managerPinRequired && (
                  <div>
                    <label className="block font-semibold text-on-surface-variant mb-1">
                      Manager 4-Digit PIN {isStaffAuthenticated ? '(Optional override)' : ''}
                    </label>
                    <input
                      type="password"
                      inputMode="numeric"
                      maxLength={4}
                      value={refundPin}
                      onChange={(e) => setRefundPin(e.target.value)}
                      placeholder={isStaffAuthenticated ? 'Session active (optional PIN)' : 'Enter 4-digit Manager PIN'}
                      className="w-full px-3 py-2 rounded-lg bg-surface-container-low text-on-surface font-mono text-sm focus:outline-none focus:ring-1 focus:ring-primary"
                    />
                  </div>
                )}

                <div>
                  <label className="block font-semibold text-on-surface-variant mb-1">
                    Refund Reason (Optional)
                  </label>
                  <input
                    type="text"
                    value={refundReason}
                    onChange={(e) => setRefundReason(e.target.value)}
                    placeholder="e.g. Guest cancelled item / duplicate payment"
                    className="w-full px-3 py-2 rounded-lg bg-surface-container-low text-on-surface text-sm focus:outline-none focus:ring-1 focus:ring-primary"
                  />
                </div>

                {refundError && <p className="text-error text-xs">{refundError}</p>}
              </div>

              <div className="flex gap-2 pt-1">
                <button
                  type="button"
                  disabled={refundBusy}
                  onClick={() => setRefundDialog({ status: 'closed' })}
                  className="px-4 py-2.5 rounded-xl bg-surface-container-high text-on-surface-variant font-semibold text-xs cursor-pointer disabled:opacity-40"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  data-testid="confirm-upi-refund-btn"
                  disabled={refundBusy}
                  onClick={async () => {
                    const { order, payment } = refundDialog;
                    setRefundDialog({ status: 'submitting', order, payment });
                    try {
                      if (managerPinRequired) {
                        const pin = refundPin.trim();
                        if (!isStaffAuthenticated && pin.length === 0) {
                          throw new Error('Enter your 4-digit Manager PIN to issue a refund.');
                        }
                        if (pin.length > 0) {
                          await authenticateManagerPinApi(pin);
                        }
                      }
                      if (payment && payment.status === 'reconciled' && onRefundYoupiPayment) {
                        await onRefundYoupiPayment({
                          paymentId: payment.id,
                          refundRef: refundRefInput.trim() || undefined,
                          reason: refundReason.trim() || undefined,
                        });
                      } else if (onSettleOrderPayment) {
                        await onSettleOrderPayment({
                          orderId: order.id,
                          action: 'refund',
                          note: refundReason.trim() || `UPI Refund ₹${order.total}`,
                        });
                      }
                      setRefundDialog({ status: 'closed' });
                    } catch (err) {
                      setRefundDialog({
                        status: 'error',
                        order,
                        payment,
                        errorMessage: err instanceof Error ? err.message : 'UPI refund failed',
                      });
                    }
                  }}
                  className="flex-1 py-2.5 rounded-xl bg-error-container/30 text-error font-bold text-xs cursor-pointer disabled:opacity-40"
                >
                  {refundBusy ? 'Refunding...' : `Confirm UPI Refund (₹${refundDialog.order.total})`}
                </button>
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
};
