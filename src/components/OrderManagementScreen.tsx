import React, { useMemo, useState } from 'react';
import { type ColumnDef } from '@tanstack/react-table';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { ORDER_STATUS_META } from '../state/cafeStateMachines';
import type { CafeOrder, ServiceMode } from '../types/cafe';
import { filterOrders, formatINR } from '../utils/cafeLogic';
import { CafeDataTable } from './CafeDataTable';

interface OrderManagementScreenProps {
  orders: CafeOrder[];
  onAdvanceOrderStatus: (orderId: string) => void;
  onPayCounterOrder?: (orderId: string) => void | Promise<void>;
  onRefundOrder?: (orderId: string, reason: string) => Promise<void>;
  onDownloadInvoicePdf?: (order: CafeOrder) => void;
  onPrintThermalReceipt?: (order: CafeOrder) => void;
  onExportExcel?: () => void;
  onRefresh?: () => void;
  onNotify: (msg: string) => void;
}

const PAGE_SIZE = 12;

export const OrderManagementScreen: React.FC<OrderManagementScreenProps> = ({
  orders,
  onAdvanceOrderStatus,
  onPayCounterOrder,
  onRefundOrder,
  onDownloadInvoicePdf,
  onPrintThermalReceipt,
  onExportExcel,
  onRefresh,
  onNotify,
}) => {
  const [channelFilter, setChannelFilter] = useState<'all' | ServiceMode>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [viewMode, setViewMode] = useState<'cards' | 'table'>('cards');
  const [visibleLimit, setVisibleLimit] = useState(PAGE_SIZE);
  const [selectedOrder, setSelectedOrder] = useState<CafeOrder | null>(null);

  // Refund state
  const [refundTargetOrder, setRefundTargetOrder] = useState<CafeOrder | null>(null);
  const [refundReason, setRefundReason] = useState('Customer cancellation request');
  const [isRefunding, setIsRefunding] = useState(false);

  const visibleOrders = useMemo(
    () => filterOrders(orders, channelFilter, searchQuery),
    [channelFilter, orders, searchQuery]
  );
  const columns = useMemo<ColumnDef<CafeOrder>[]>(
    () => [
      { accessorKey: 'id', header: 'Order' },
      { accessorKey: 'serviceMode', header: 'Service' },
      {
        accessorKey: 'total',
        header: 'Order Total',
        cell: ({ row }) => formatINR(row.original.total),
      },
      {
        accessorKey: 'status',
        header: 'Status',
        cell: ({ row }) => ORDER_STATUS_META[row.original.status].kotBadgeLabel,
      },
      { accessorKey: 'createdAtLabel', header: 'Placed' },
    ],
    []
  );
  const preparingCount = orders.filter(
    (order) => order.status === 'placed' || order.status === 'preparing'
  ).length;
  const readyCount = orders.filter((order) => order.status === 'ready').length;
  const completedCount = orders.filter((order) => order.status === 'served').length;

  const resetFilters = () => {
    setChannelFilter('all');
    setSearchQuery('');
    setVisibleLimit(PAGE_SIZE);
  };

  return (
    <div className="flex flex-col w-full pb-8 gap-4">
      <header className="flex items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold text-on-surface">Order Management</h1>
        </div>
        <div className="flex gap-2">
          {onRefresh && (
            <button
              type="button"
              onClick={onRefresh}
              className="rounded-lg bg-surface-container-high px-3 py-2 text-xs font-semibold text-on-surface"
            >
              Refresh
            </button>
          )}
          {onExportExcel && (
            <button
              type="button"
              onClick={onExportExcel}
              className="rounded-lg bg-primary-container px-3 py-2 text-xs font-bold text-on-primary-container"
            >
              Export
            </button>
          )}
        </div>
      </header>

      <div className="grid grid-cols-3 gap-2 rounded-xl bg-surface-container-low p-2.5">
        {[
          ['Preparing', preparingCount],
          ['Ready to Pick', readyCount],
          ['Completed', completedCount],
        ].map(([label, count]) => (
          <div key={label} className="flex flex-col items-center rounded-lg bg-surface-container/60 p-2">
            <span className="text-[11px] text-on-surface-variant">{label}</span>
            <span className="text-xl font-bold text-primary tabular-nums">{count}</span>
          </div>
        ))}
      </div>

      <div className="flex flex-col gap-3 rounded-xl bg-surface-container-low p-3">
        <input
          type="search"
          value={searchQuery}
          onChange={(event) => {
            setSearchQuery(event.target.value);
            setVisibleLimit(PAGE_SIZE);
          }}
          placeholder="Search orders..."
          aria-label="Search orders"
          className="rounded-lg bg-surface-container px-3 py-2 text-sm text-on-surface"
        />
        <div className="flex gap-2 overflow-x-auto">
          {([
            ['all', `All (${orders.length})`],
            ['dine-in', `Dine-In (${orders.filter((order) => order.serviceMode === 'dine-in').length})`],
            ['takeaway', `Takeaway (${orders.filter((order) => order.serviceMode === 'takeaway').length})`],
            ['delivery', `Delivery (${orders.filter((order) => order.serviceMode === 'delivery').length})`],
          ] as const).map(([mode, label]) => (
            <button
              key={mode}
              type="button"
              onClick={() => {
                setChannelFilter(mode);
                setVisibleLimit(PAGE_SIZE);
              }}
              className={`shrink-0 rounded-full px-3.5 py-1.5 text-xs ${
                channelFilter === mode
                  ? 'bg-primary-container font-bold text-on-primary'
                  : 'bg-surface-container-high text-on-surface-variant'
              }`}
            >
              {label}
            </button>
          ))}
          <button
            type="button"
            onClick={() => setViewMode(viewMode === 'cards' ? 'table' : 'cards')}
            className="ml-auto shrink-0 rounded-lg bg-surface-container-high px-3 py-1.5 text-xs text-on-surface"
          >
            {viewMode === 'cards' ? 'Table View' : 'Card View'}
          </button>
        </div>
      </div>

      {viewMode === 'table' ? (
        <CafeDataTable
          data={visibleOrders}
          columns={columns}
          emptyText="No orders match the selected filters."
        />
      ) : visibleOrders.length === 0 ? (
        <div className="rounded-xl bg-surface-container-low p-8 text-center">
          <p className="text-sm font-semibold text-on-surface">No orders match your filters</p>
          <button type="button" onClick={resetFilters} className="mt-2 text-xs text-primary">
            Reset filters
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          {visibleOrders.slice(0, visibleLimit).map((order) => {
            const isDineIn = order.serviceMode === 'dine-in';
            const isDelivery = order.serviceMode === 'delivery';
            const totalItemsCount = order.items.reduce((s, i) => s + i.quantity, 0);

            return (
              <article
                key={order.id}
                className="relative overflow-hidden flex flex-col justify-between p-4 sm:p-5 rounded-3xl liquid-glass-card shadow-2xl transition-all space-y-4 border border-white/[0.08]"
              >
                {/* Header Row: Avatar + Order & Channel + Action Buttons */}
                <div className="flex items-center justify-between gap-2.5 relative">
                  <div className="flex items-center gap-3 min-w-0 flex-1">
                    <div
                      className={`relative w-12 h-12 rounded-full flex items-center justify-center text-sm font-black shrink-0 shadow-md ${
                        order.paymentStatus === 'paid'
                          ? 'bg-gradient-to-tr from-emerald-500/30 to-emerald-400/10 text-emerald-300 border border-emerald-500/40'
                          : order.paymentStatus === 'refunded'
                            ? 'bg-amber-500/20 text-amber-300 border border-amber-500/30'
                            : 'bg-surface-container-high/90 text-primary border border-white/[0.08]'
                      }`}
                    >
                      <span className="material-symbols-outlined text-[20px]">
                        {isDineIn ? 'restaurant' : isDelivery ? 'delivery_dining' : 'takeout_dining'}
                      </span>
                    </div>

                    <div className="flex flex-col min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="text-sm sm:text-base text-on-surface font-extrabold truncate tracking-tight">
                          #{order.id}
                        </span>
                        <span
                          className={`px-2.5 py-0.5 rounded-full text-[10px] font-black tracking-wider uppercase shrink-0 ${
                            order.paymentStatus === 'refunded'
                              ? 'bg-amber-500/20 text-amber-300 border border-amber-500/30'
                              : order.paymentStatus === 'paid'
                                ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30'
                                : order.paymentMode === 'cash' || order.paymentChannelLabel === 'Pay on Counter'
                                  ? 'bg-amber-500/20 text-amber-400 border border-amber-500/30'
                                  : 'bg-blue-500/20 text-blue-400 border border-blue-500/30'
                          }`}
                        >
                          {order.paymentStatus === 'refunded'
                            ? 'REFUNDED'
                            : order.paymentStatus === 'paid'
                              ? 'PAID'
                              : order.paymentMode === 'cash' || order.paymentChannelLabel === 'Pay on Counter'
                                ? 'COUNTER'
                                : 'UPI PENDING'}
                        </span>
                      </div>
                      <div className="flex items-center gap-1.5 text-on-surface-variant/80 text-xs sm:text-sm mt-0.5">
                        <span className="material-symbols-outlined text-[15px] shrink-0">
                          {isDineIn ? 'table_restaurant' : isDelivery ? 'local_shipping' : 'shopping_bag'}
                        </span>
                        <span className="tabular-nums font-medium tracking-wide">
                          {isDineIn
                            ? order.tableNumber
                              ? `Dine-In · ${order.tableNumber}`
                              : 'Dine-In'
                            : isDelivery
                              ? `Delivery · ${order.deliveryPartner ?? 'Direct'}`
                              : 'Takeaway'}
                        </span>
                      </div>
                      {isDelivery && order.deliveryAddress && (
                        <p className="mt-1 flex items-start gap-1.5 text-xs text-on-surface-variant">
                          <span className="material-symbols-outlined mt-px text-[14px]">location_on</span>
                          <span className="line-clamp-2">{order.deliveryAddress}</span>
                        </p>
                      )}
                    </div>
                  </div>

                  {/* Action Icon Buttons */}
                  <div className="flex items-center gap-2 shrink-0">
                    {order.paymentStatus !== 'paid' && onPayCounterOrder && (
                      <button
                        type="button"
                        aria-label={`Mark order ${order.id} paid`}
                        onClick={async () => {
                          await onPayCounterOrder(order.id);
                          onNotify(`Order #${order.id} marked as PAID`);
                        }}
                        className="w-10 h-10 rounded-2xl bg-emerald-500/15 border border-emerald-500/30 flex items-center justify-center text-emerald-400 hover:bg-emerald-500/25 active:scale-95 transition-all cursor-pointer shadow-sm"
                        title="Mark Paid"
                      >
                        <span className="material-symbols-outlined text-[18px]">payments</span>
                      </button>
                    )}
                    {order.status !== 'served' && (
                      <button
                        type="button"
                        aria-label={`Advance order ${order.id}`}
                        onClick={() => onAdvanceOrderStatus(order.id)}
                        className="w-10 h-10 rounded-2xl bg-primary/20 border border-primary/40 flex items-center justify-center text-primary hover:bg-primary/30 active:scale-95 transition-all cursor-pointer shadow-sm"
                        title="Advance Status"
                      >
                        <span className="material-symbols-outlined text-[18px]">fast_forward</span>
                      </button>
                    )}
                    <button
                      type="button"
                      aria-label={`View order ${order.id} details`}
                      onClick={() => {
                        setSelectedOrder(order);
                        onNotify(`Order #${order.id} details opened`);
                      }}
                      className="w-10 h-10 rounded-2xl bg-surface-container-high/80 border border-white/[0.08] flex items-center justify-center text-on-surface-variant hover:text-primary active:scale-95 transition-all cursor-pointer shadow-sm hover:border-primary/40"
                      title="View Order Details"
                    >
                      <span className="material-symbols-outlined text-[18px]">visibility</span>
                    </button>
                  </div>
                </div>

                {/* Middle Metrics Inset Card */}
                <div className="grid grid-cols-3 gap-2 py-3 px-4 rounded-2xl bg-black/40 backdrop-blur-md border border-white/[0.05] text-center items-center shadow-inner">
                  <div className="flex flex-col">
                    <span className="text-[11px] text-on-surface-variant/70 font-semibold mb-0.5">Items</span>
                    <span className="text-xs sm:text-sm md:text-base text-on-surface font-black tabular-nums tracking-tight">
                      {totalItemsCount} Items
                    </span>
                  </div>
                  <div className="flex flex-col">
                    <span className="text-[11px] text-on-surface-variant/70 font-semibold mb-0.5">Total Amount</span>
                    <span className="text-xs sm:text-sm md:text-base text-secondary font-black tabular-nums tracking-tight">
                      {formatINR(order.total)}
                    </span>
                  </div>
                  <div className="flex flex-col">
                    <span className="text-[11px] text-on-surface-variant/70 font-semibold mb-0.5">Status</span>
                    <span className="text-xs sm:text-sm md:text-base text-on-surface font-black tabular-nums tracking-tight uppercase">
                      {ORDER_STATUS_META[order.status].kotBadgeLabel}
                    </span>
                  </div>
                </div>

                {/* Items Inset Sub-Card */}
                <div className="rounded-2xl liquid-glass-subcard p-3 space-y-1.5 text-xs text-on-surface-variant border border-white/[0.04]">
                  {order.items.slice(0, 3).map((item) => (
                    <div key={item.menuItemId} className="flex justify-between gap-2 py-0.5">
                      <span className="truncate text-on-surface font-medium">
                        <span className="text-primary font-bold">{item.quantity}×</span> {item.name}
                      </span>
                      <span className="tabular-nums font-semibold text-on-surface shrink-0">
                        {formatINR(item.price * item.quantity)}
                      </span>
                    </div>
                  ))}
                  {order.items.length > 3 && (
                    <div className="pt-1 text-[11px] text-on-surface-variant/70 italic text-center">
                      +{order.items.length - 3} more items...
                    </div>
                  )}
                </div>

                {/* Footer Row: Channel & Schedule */}
                <div className="flex items-center justify-between gap-3 text-xs sm:text-sm pt-0.5">
                  <div className="flex items-center gap-1.5 min-w-0">
                    <span className="material-symbols-outlined text-[18px] text-primary shrink-0">
                      payment
                    </span>
                    <span className="text-xs text-on-surface-variant/80 font-medium truncate">
                      {order.paymentChannelLabel || (order.paymentMode === 'cash' ? 'Cash on Counter' : 'Online Gateway')}
                    </span>
                  </div>
                  <div className="flex items-center gap-1 text-on-surface-variant/70 text-xs shrink-0 font-medium">
                    <span className="material-symbols-outlined text-[15px]">schedule</span>
                    <span>{order.createdAtLabel}</span>
                  </div>
                </div>
              </article>
            );
          })}
          {visibleLimit < visibleOrders.length && (
            <button
              type="button"
              onClick={() => setVisibleLimit((limit) => limit + PAGE_SIZE)}
              className="rounded-lg bg-surface-container-high px-4 py-2 text-xs font-semibold text-primary lg:col-span-2"
            >
              Load more orders
            </button>
          )}
        </div>
      )}

      <div className="flex items-center justify-between rounded-xl bg-surface-container-low p-4">
        <span className="text-xs text-on-surface-variant">{orders.length} Orders Recorded</span>
        <span className="font-bold text-primary">
          {formatINR(orders.reduce((total, order) => total + order.total, 0))}
        </span>
      </div>

      <Dialog open={Boolean(selectedOrder)} onOpenChange={(open) => !open && setSelectedOrder(null)}>
        <DialogContent className="bg-surface-container-low text-on-surface sm:max-w-md">
          {selectedOrder && (
            <>
              <DialogHeader>
                <DialogTitle className="text-primary">Order #{selectedOrder.id}</DialogTitle>
                <DialogDescription>
                  {selectedOrder.createdAtLabel} · {selectedOrder.status}
                </DialogDescription>
              </DialogHeader>
              <div className="space-y-2 rounded-xl bg-surface-container-lowest p-3 text-sm">
                {selectedOrder.items.map((item) => (
                  <div key={item.menuItemId} className="flex justify-between gap-2">
                    <span>{item.quantity} × {item.name}</span>
                    <span>{formatINR(item.price * item.quantity)}</span>
                  </div>
                ))}
                <div className="flex justify-between border-t border-outline-variant pt-2 font-bold">
                  <span>Order Total</span>
                  <span>{formatINR(selectedOrder.total)}</span>
                </div>
              </div>
              <div className="flex flex-wrap gap-2">
                {selectedOrder.paymentStatus !== 'paid' && onPayCounterOrder && (
                  <button
                    type="button"
                    onClick={async () => {
                      await onPayCounterOrder(selectedOrder.id);
                      setSelectedOrder((prev) => (prev ? { ...prev, paymentStatus: 'paid' } : null));
                      onNotify(`Order #${selectedOrder.id} settled as PAID`);
                    }}
                    className="flex-1 rounded-xl bg-emerald-600 hover:bg-emerald-500 py-2 px-3 text-xs font-bold text-white flex items-center justify-center gap-1 shadow-sm cursor-pointer min-w-[140px]"
                  >
                    <span className="material-symbols-outlined text-[16px]">payments</span>
                    <span>Settle ({formatINR(selectedOrder.total)})</span>
                  </button>
                )}
                {onPrintThermalReceipt && (
                  <button
                    type="button"
                    onClick={() => {
                      onPrintThermalReceipt(selectedOrder);
                    }}
                    className="flex-1 rounded-xl bg-surface-container-high py-2 px-3 text-xs font-bold text-primary flex items-center justify-center gap-1 min-w-[120px] cursor-pointer"
                  >
                    <span className="material-symbols-outlined text-[15px]">print</span>
                    <span>Thermal Slip</span>
                  </button>
                )}
                {onDownloadInvoicePdf && (
                  <button
                    type="button"
                    onClick={() => onDownloadInvoicePdf(selectedOrder)}
                    className="flex-1 rounded-xl bg-surface-container-high py-2 text-xs font-bold text-primary min-w-[120px]"
                  >
                    Download Invoice
                  </button>
                )}
                {onRefundOrder && selectedOrder.paymentStatus === 'paid' && (
                  <button
                    type="button"
                    onClick={() => {
                      setRefundTargetOrder(selectedOrder);
                    }}
                    className="flex-1 rounded-xl bg-amber-500/15 hover:bg-amber-500/25 border border-amber-500/30 py-2 px-3 text-xs font-bold text-amber-400 flex items-center justify-center gap-1 min-w-[120px] cursor-pointer"
                  >
                    <span className="material-symbols-outlined text-[15px]">currency_exchange</span>
                    <span>Issue Refund</span>
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => setSelectedOrder(null)}
                  className="flex-1 rounded-xl bg-primary-container py-2 text-sm font-bold text-on-primary-container min-w-[80px]"
                >
                  Close
                </button>
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>

      {/* Refund Confirmation Modal */}
      {refundTargetOrder && (
        <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-surface-container-low border border-outline-variant/30 rounded-2xl p-5 w-full max-w-md text-on-surface shadow-2xl flex flex-col gap-3">
            <div className="flex items-center gap-2 text-amber-400">
              <span className="material-symbols-outlined text-2xl">currency_exchange</span>
              <h3 className="text-base font-bold text-on-surface">
                Issue Order Refund · #{refundTargetOrder.id}
              </h3>
            </div>
            <p className="text-xs text-on-surface-variant">
              Confirm refund of <strong className="text-on-surface">{formatINR(refundTargetOrder.total)}</strong> for Order #{refundTargetOrder.kotNumber}. This will mark the order as Refunded and cancel kitchen preparation.
            </p>

            <div className="flex flex-col gap-1.5 pt-1">
              <label className="text-[11px] font-bold text-on-surface-variant uppercase tracking-wider">
                Select Refund Reason:
              </label>
              {[
                'Customer requested cancellation',
                'Quality / taste complaint',
                'Kitchen out of ingredients',
                'Accidental / duplicate charge',
              ].map((reasonOption) => (
                <button
                  key={reasonOption}
                  type="button"
                  onClick={() => setRefundReason(reasonOption)}
                  className={`text-left px-3 py-2 rounded-lg text-xs font-semibold transition-all cursor-pointer ${
                    refundReason === reasonOption
                      ? 'bg-amber-500/20 text-amber-300 border border-amber-500/50'
                      : 'bg-surface-container-high text-on-surface-variant hover:text-on-surface'
                  }`}
                >
                  {reasonOption}
                </button>
              ))}

              <input
                type="text"
                value={refundReason}
                onChange={(e) => setRefundReason(e.target.value)}
                placeholder="Custom reason..."
                className="mt-1 w-full bg-surface-container-high rounded-lg px-3 py-2 text-xs text-on-surface focus:outline-none focus:ring-1 focus:ring-amber-400"
              />
            </div>

            <div className="flex gap-2 pt-3">
              <button
                type="button"
                disabled={isRefunding}
                onClick={() => setRefundTargetOrder(null)}
                className="flex-1 py-2 rounded-xl bg-surface-container-high text-xs font-bold cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={isRefunding || !refundReason.trim()}
                onClick={async () => {
                  if (!onRefundOrder || !refundTargetOrder) return;
                  try {
                    setIsRefunding(true);
                    await onRefundOrder(refundTargetOrder.id, refundReason);
                    onNotify(`Order #${refundTargetOrder.id} successfully refunded (${formatINR(refundTargetOrder.total)})`);
                    setSelectedOrder((prev) =>
                      prev?.id === refundTargetOrder.id
                        ? { ...prev, paymentStatus: 'refunded', refundReason, refundAmount: refundTargetOrder.total }
                        : prev
                    );
                    setRefundTargetOrder(null);
                  } catch {
                    onNotify('Could not process refund');
                  } finally {
                    setIsRefunding(false);
                  }
                }}
                className="flex-1 py-2 rounded-xl bg-amber-500 hover:bg-amber-400 text-neutral-950 text-xs font-black uppercase tracking-wider cursor-pointer disabled:opacity-50 flex items-center justify-center gap-1 shadow-md"
              >
                {isRefunding ? 'Refunding...' : `Refund ${formatINR(refundTargetOrder.total)}`}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
