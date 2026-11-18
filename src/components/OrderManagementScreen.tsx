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
          <p className="text-xs text-on-surface-variant">
            Track order progress and kitchen status.
          </p>
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
          placeholder="Search order ID or items"
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
        <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
          {visibleOrders.slice(0, visibleLimit).map((order) => (
            <article key={order.id} className="flex flex-col gap-3 rounded-xl bg-surface-container p-4 shadow-sm">
              <button
                type="button"
                onClick={() => setSelectedOrder(order)}
                className="flex items-start justify-between gap-3 text-left"
              >
                <span>
                  <span className="block font-bold text-on-surface">#{order.id}</span>
                  <span className="text-xs text-on-surface-variant">
                    {order.serviceMode === 'dine-in'
                      ? `Dine-In · ${order.tableNumber ?? 'T3'}`
                      : order.serviceMode === 'delivery'
                        ? `Delivery · ${order.deliveryPartner ?? 'Direct'}`
                        : 'Takeaway'}
                    {' · '}{order.createdAtLabel}
                  </span>
                </span>
                <span className="text-right">
                  <span className="block font-bold text-primary">{formatINR(order.total)}</span>
                  <div className="flex items-center justify-end gap-1.5 mt-0.5">
                    {order.paymentStatus === 'refunded' ? (
                      <span className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-amber-500/25 text-amber-300 border border-amber-500/40">
                        REFUNDED
                      </span>
                    ) : order.paymentStatus === 'paid' ? (
                      <span className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-emerald-500/20 text-emerald-400">PAID</span>
                    ) : order.paymentMode === 'cash' || order.paymentChannelLabel === 'Pay on Counter' ? (
                      <span className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-amber-500/20 text-amber-400">COUNTER</span>
                    ) : (
                      <span className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-blue-500/20 text-blue-400">UPI PENDING</span>
                    )}
                    <span className="text-xs text-on-surface-variant">
                      {ORDER_STATUS_META[order.status].kotBadgeLabel}
                    </span>
                  </div>
                </span>
              </button>
              <div className="flex flex-col gap-1 border-t border-outline-variant/30 pt-2 text-xs text-on-surface-variant">
                {order.items.map((item) => (
                  <div key={item.menuItemId} className="flex justify-between gap-2">
                    <span>{item.quantity} × {item.name}</span>
                    <span>{formatINR(item.price * item.quantity)}</span>
                  </div>
                ))}
              </div>
              <div className="flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => {
                    setSelectedOrder(order);
                    onNotify(`Order #${order.id} details opened`);
                  }}
                  className="rounded-lg bg-surface-container-high px-3 py-2 text-xs font-semibold text-on-surface"
                >
                  Details
                </button>
                {order.paymentStatus !== 'paid' && onPayCounterOrder && (
                  <button
                    type="button"
                    onClick={async () => {
                      await onPayCounterOrder(order.id);
                      onNotify(`Order #${order.id} marked as PAID`);
                    }}
                    className="rounded-lg bg-emerald-600 hover:bg-emerald-500 px-3 py-2 text-xs font-bold text-white flex items-center gap-1 shadow-sm cursor-pointer"
                  >
                    <span className="material-symbols-outlined text-[14px]">payments</span>
                    <span>Mark Paid</span>
                  </button>
                )}
                {order.status !== 'served' && (
                  <button
                    type="button"
                    onClick={() => onAdvanceOrderStatus(order.id)}
                    className="rounded-lg bg-primary px-3 py-2 text-xs font-bold text-on-primary"
                  >
                    Advance Order
                  </button>
                )}
              </div>
            </article>
          ))}
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
              Confirm refunding <strong className="text-on-surface">{formatINR(refundTargetOrder.total)}</strong> for KOT #{refundTargetOrder.kotNumber}. This will update the order status to REFUNDED, log an audit event, and release any active kitchen ticket.
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
                placeholder="Or type custom refund reason..."
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
