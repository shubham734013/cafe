import React, { useMemo, useState } from 'react';
import { type ColumnDef } from '@tanstack/react-table';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { CafeOrder, ServiceMode } from '../types/cafe';
import { filterOrders, formatINR } from '../utils/cafeLogic';
import { CafeDataTable } from './CafeDataTable';

interface OrderManagementScreenProps {
  orders: CafeOrder[];
  onAdvanceOrderStatus: (orderId: string) => void;
  onDownloadInvoicePdf?: (order: CafeOrder) => void;
  onExportExcel?: () => void;
  onRefresh?: () => void;
  onNotify: (msg: string) => void;
}

export const OrderManagementScreen: React.FC<OrderManagementScreenProps> = ({
  orders,
  onAdvanceOrderStatus,
  onDownloadInvoicePdf,
  onExportExcel,
  onRefresh,
  onNotify,
}) => {
  const [channelFilter, setChannelFilter] = useState<'all' | ServiceMode>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [viewMode, setViewMode] = useState<'cards' | 'table'>('cards');
  const [selectedOrder, setSelectedOrder] = useState<CafeOrder | null>(null);
  const [spinning, setSpinning] = useState(false);

  const visibleOrders = filterOrders(orders, channelFilter, searchQuery);

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
        cell: ({ row }) => (
          <span className="uppercase font-mono text-[11px] text-on-surface-variant">
            {row.original.paymentMode}
          </span>
        ),
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
            onChange={(e) => setSearchQuery(e.target.value)}
            aria-label="Search orders by ID, customer, or table"
            placeholder="Search order ID, item, or table..."
            className="w-full h-11 pl-9 pr-9 bg-surface-container-low rounded-lg text-on-surface placeholder:text-outline text-sm focus:outline-none focus:ring-1 focus:ring-primary-container shadow-inner"
          />
          {searchQuery && (
            <button
              type="button"
              aria-label="Clear Search"
              onClick={() => setSearchQuery('')}
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
                onClick={() => setChannelFilter(pill.id)}
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
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
          {visibleOrders.map((order) => {
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
                className={`p-3.5 rounded-xl bg-surface-container flex flex-col gap-3 shadow-md ${
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
                              ? `Delivery · ${order.deliveryPartner || 'Swiggy'}`
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
                      {order.status === 'placed'
                        ? 'New KOT'
                        : order.status === 'preparing'
                          ? 'Preparing'
                          : order.status === 'ready'
                            ? 'Ready for Pickup'
                            : 'Completed'}
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
                <div className="flex items-center justify-between pt-0.5 gap-2 mt-auto">
                  <div className="flex items-center gap-1 text-outline text-[11px]">
                    <span className="material-symbols-outlined text-[15px]">schedule</span>
                    <span>
                      {order.paymentRef || `${order.paymentMode.toUpperCase()} Settled`}
                    </span>
                  </div>

                  <div className="flex items-center gap-2">
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
                        <span>{isReady ? 'Mark Handover' : 'Mark Ready'}</span>
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
      )}

      {/* Daily Order Shift Tally Banner */}
      <div className="w-full p-4 rounded-xl bg-gradient-to-r from-surface-container-high via-surface-container to-surface-container-high shadow-lg flex items-center justify-between">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-full bg-primary-container/20 flex items-center justify-center text-primary-container">
            <span className="material-symbols-outlined text-[18px]">query_stats</span>
          </div>
          <div className="flex flex-col">
            <span className="text-sm font-bold text-on-surface">Daily Order Shift Tally</span>
            <span className="text-[11px] text-on-surface-variant">
              {orders.length} Orders Completed &amp; Ongoing
            </span>
          </div>
        </div>
        <div className="flex flex-col items-end">
          <span className="text-xl font-bold text-primary tabular-nums">
            {formatINR(shiftRevenue + 16658)}
          </span>
          <span className="text-[11px] text-tertiary flex items-center gap-0.5">
            <span className="material-symbols-outlined text-[13px]">trending_up</span>+14% vs
            yesterday
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
    </div>
  );
};
