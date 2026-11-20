import React, { useEffect, useMemo, useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { ORDER_STATUS_META } from '../state/cafeStateMachines';
import type { CafeOrder } from '../types/cafe';
import { deriveKotCardPhase, isKitchenActiveOrder } from '../utils/cafeLogic';

interface KitchenOrdersScreenProps {
  orders: CafeOrder[];
  onAdvanceOrderStatus?: (orderId: string) => void | Promise<void>;
  onToggleKotItem?: (orderId: string, menuItemId: string) => void;
  onCancelKotItem?: (orderId: string, menuItemId: string, reason?: string, quantity?: number) => Promise<any>;
  onRefresh?: () => void;
  onNotify?: (msg: string) => void;
}

type KitchenTab = 'active' | 'preparing' | 'ready' | 'dine-in' | 'takeaway' | 'completed';

export const KitchenOrdersScreen: React.FC<KitchenOrdersScreenProps> = ({
  orders,
  onAdvanceOrderStatus,
  onToggleKotItem,
  onCancelKotItem,
  onRefresh,
  onNotify,
}) => {
  const [selectedTab, setSelectedTab] = useState<KitchenTab>('active');
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedOrderId, setSelectedOrderId] = useState<string | null>(null);
  const [advancingId, setAdvancingId] = useState<string | null>(null);

  // Cancellation state
  const [cancelTarget, setCancelTarget] = useState<{ order: CafeOrder; item: CafeOrder['items'][number] } | null>(null);
  const [cancelQty, setCancelQty] = useState(1);
  const [cancelReason, setCancelReason] = useState('Out of Stock / Ingredient Unavailable');
  const [cancelCustomReason, setCancelCustomReason] = useState('');
  const [isCancelling, setIsCancelling] = useState(false);

  useEffect(() => {
    const handleNewOrder = (e: Event) => {
      const customEvt = e as CustomEvent<{ order?: CafeOrder; orderId?: string }>;
      const order = customEvt.detail?.order;
      const ticketLabel = order?.kotNumber || (order?.id ? `#${order.id}` : 'ticket');
      const tableLabel = order?.tableNumber ? ` (Table ${order.tableNumber})` : '';
      onNotify?.(`🔔 New Kitchen Order ${ticketLabel}${tableLabel}!`);
    };

    window.addEventListener('cafe:order:new', handleNewOrder);
    return () => window.removeEventListener('cafe:order:new', handleNewOrder);
  }, [onNotify]);

  // Active kitchen queue (decluttered: filters out served/cancelled/unpaid upi orders)
  const activeOrders = useMemo(
    () => [...orders].filter(isKitchenActiveOrder).sort((a, b) => b.elapsedMinutes - a.elapsedMinutes),
    [orders]
  );

  const servedOrders = useMemo(
    () => [...orders].filter((o) => o.status === 'served'),
    [orders]
  );

  const preparingCount = useMemo(
    () => activeOrders.filter((o) => o.status === 'placed' || o.status === 'preparing').length,
    [activeOrders]
  );
  const readyCount = useMemo(
    () => activeOrders.filter((o) => o.status === 'ready').length,
    [activeOrders]
  );

  // Filtered orders according to selected tab and search query
  const filteredOrders = useMemo(() => {
    let list = selectedTab === 'completed' ? servedOrders : activeOrders;

    if (selectedTab === 'preparing') {
      list = list.filter((o) => o.status === 'placed' || o.status === 'preparing');
    } else if (selectedTab === 'ready') {
      list = list.filter((o) => o.status === 'ready');
    } else if (selectedTab === 'dine-in') {
      list = list.filter((o) => o.serviceMode === 'dine-in');
    } else if (selectedTab === 'takeaway') {
      list = list.filter((o) => o.serviceMode === 'takeaway');
    }

    const q = searchQuery.trim().toLowerCase();
    if (!q) return list;

    return list.filter(
      (o) =>
        o.id.toLowerCase().includes(q) ||
        o.kotNumber.toLowerCase().includes(q) ||
        (o.tableNumber && o.tableNumber.toLowerCase().includes(q)) ||
        o.items.some((i) => i.name.toLowerCase().includes(q))
    );
  }, [selectedTab, servedOrders, activeOrders, searchQuery]);

  const selectedOrder = useMemo(
    () => orders.find((o) => o.id === selectedOrderId) ?? null,
    [orders, selectedOrderId]
  );

  const handleAdvance = async (e: React.MouseEvent, order: CafeOrder) => {
    e.stopPropagation();
    if (!onAdvanceOrderStatus || advancingId === order.id) return;
    setAdvancingId(order.id);
    try {
      await onAdvanceOrderStatus(order.id);
      const nextLabel =
        order.status === 'placed'
          ? 'Preparing 🍳'
          : order.status === 'preparing'
            ? 'Ready for pickup 🔔'
            : 'Served ✓';
      onNotify?.(`KOT ${order.kotNumber} advanced to ${nextLabel}`);
    } catch {
      onNotify?.(`Failed to advance KOT ${order.kotNumber}`);
    } finally {
      setAdvancingId(null);
    }
  };

  const handleConfirmCancelItem = async () => {
    if (!cancelTarget || !onCancelKotItem || isCancelling) return;
    setIsCancelling(true);
    try {
      const finalReason =
        cancelReason === 'Other' && cancelCustomReason.trim()
          ? cancelCustomReason.trim()
          : cancelReason;
      await onCancelKotItem(
        cancelTarget.order.id,
        cancelTarget.item.menuItemId,
        finalReason,
        cancelQty
      );
      setCancelTarget(null);
    } catch {
      // onNotify is called by mutation handler
    } finally {
      setIsCancelling(false);
    }
  };

  return (
    <section className="flex flex-col w-full pb-10 space-y-4">
      {/* Top Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pt-1">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-xl sm:text-2xl font-black text-on-surface tracking-tight">
              Kitchen Orders
            </h1>
            <span className="px-2.5 py-0.5 rounded-full bg-[#FF6422]/15 text-[#FF6422] text-[11px] font-black inline-flex items-center gap-1">
              <span className="w-2 h-2 rounded-full bg-[#FF6422] animate-pulse" />
              Kitchen Screen
            </span>
          </div>
        </div>

        {/* Counter Summary Pills */}
        <div className="flex items-center gap-2 shrink-0">
          <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-amber-500/15 border border-amber-500/20 text-amber-500 text-xs font-bold">
            <span>🍳</span>
            <span>{preparingCount} in Prep</span>
          </div>
          <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-emerald-500/15 border border-emerald-500/20 text-emerald-400 text-xs font-bold">
            <span>🔔</span>
            <span>{readyCount} Ready</span>
          </div>
          {onRefresh && (
            <button
              type="button"
              onClick={onRefresh}
              title="Refresh queue"
              className="w-8 h-8 rounded-full bg-surface-container hover:bg-surface-container-high border border-outline-variant/20 flex items-center justify-center text-on-surface transition-colors cursor-pointer"
            >
              <span className="material-symbols-outlined text-[18px]">refresh</span>
            </button>
          )}
        </div>
      </div>

      {/* Search & Filter Bar */}
      <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-2.5">
        {/* Search */}
        <div className="relative flex-1">
          <span className="material-symbols-outlined absolute left-3.5 top-1/2 -translate-y-1/2 text-outline text-[18px] pointer-events-none">
            search
          </span>
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search by order #, table, or dish name..."
            className="w-full pl-10 pr-4 py-2 bg-surface-container text-xs sm:text-sm text-on-surface placeholder:text-outline rounded-2xl border border-outline-variant/15 focus:outline-none focus:ring-2 focus:ring-[#FF6422]/50"
          />
        </div>

        {/* Filter Tabs */}
        <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar py-0.5">
          {[
            { id: 'active', label: `All Active (${activeOrders.length})` },
            { id: 'preparing', label: `In Prep (${preparingCount})` },
            { id: 'ready', label: `Ready (${readyCount})` },
            { id: 'dine-in', label: 'Dine-In' },
            { id: 'takeaway', label: 'Takeaway' },
            { id: 'completed', label: `Completed (${servedOrders.length})` },
          ].map((tab) => {
            const isActive = selectedTab === tab.id;
            return (
              <button
                key={tab.id}
                type="button"
                onClick={() => setSelectedTab(tab.id as KitchenTab)}
                className={`px-3 py-1.5 rounded-full text-xs font-bold whitespace-nowrap transition-all cursor-pointer ${
                  isActive
                    ? 'bg-[#FF6422] text-white shadow-sm'
                    : 'bg-surface-container hover:bg-surface-container-high text-on-surface-variant hover:text-on-surface border border-outline-variant/15'
                }`}
              >
                {tab.label}
              </button>
            );
          })}
        </div>
      </div>

      {/* Orders Grid */}
      {filteredOrders.length === 0 ? (
        <div className="rounded-3xl border border-outline-variant/15 bg-surface-container p-12 text-center space-y-2">
          <div className="w-12 h-12 rounded-full bg-[#FF6422]/15 text-[#FF6422] flex items-center justify-center mx-auto">
            <span className="material-symbols-outlined text-[24px]">soup_kitchen</span>
          </div>
          <h3 className="font-bold text-on-surface text-sm sm:text-base">Kitchen Queue Clear</h3>
          <p className="text-xs text-on-surface-variant max-w-sm mx-auto">
            {searchQuery
              ? 'No orders match your search query.'
              : selectedTab === 'completed'
                ? 'No completed orders in this session.'
                : 'No pending orders waiting to be prepared. Everything is served!'}
          </p>
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {filteredOrders.map((order) => {
            const phase = deriveKotCardPhase(order);
            const statusMeta = ORDER_STATUS_META[order.status];
            const isServed = order.status === 'served';
            const isReady = order.status === 'ready';
            const isUrgent = order.elapsedMinutes > 15;
            const tableLabel = order.tableNumber ? `T${order.tableNumber.replace('T', '')}` : 'CTR';
            const activeItemsCount = order.items.reduce(
              (s, i) => s + (i.status !== 'cancelled' ? i.quantity : 0),
              0
            );

            return (
              <div
                key={order.id}
                onClick={() => setSelectedOrderId(order.id)}
                className={`relative overflow-hidden flex flex-col justify-between p-4 sm:p-5 rounded-3xl liquid-glass-card shadow-2xl transition-all space-y-4 border cursor-pointer ${
                  isUrgent && !isServed
                    ? 'border-error/50 ring-1 ring-error/30'
                    : isReady
                      ? 'border-emerald-500/40 ring-1 ring-emerald-500/20'
                      : 'border-white/[0.08] hover:border-primary/40'
                }`}
              >
                {isUrgent && !isServed && (
                  <div className="absolute -right-8 -top-8 w-24 h-24 bg-error/20 rounded-full blur-xl pointer-events-none" />
                )}

                {/* Header Row: Avatar + KOT & Table + Action Buttons */}
                <div className="flex items-center justify-between gap-2.5 relative">
                  <div className="flex items-center gap-3 min-w-0 flex-1">
                    <div
                      className={`relative w-12 h-12 rounded-full flex items-center justify-center text-sm font-black shrink-0 shadow-md ${
                        isUrgent && !isServed
                          ? 'bg-gradient-to-tr from-error/30 to-error/10 text-error border border-error/40'
                          : isReady
                            ? 'bg-gradient-to-tr from-emerald-500/30 to-emerald-400/10 text-emerald-300 border border-emerald-500/40'
                            : 'bg-surface-container-high/90 text-primary border border-white/[0.08]'
                      }`}
                    >
                      {tableLabel}
                      {isUrgent && !isServed && (
                        <span className="absolute -bottom-1 -right-1 w-4 h-4 rounded-full bg-background flex items-center justify-center border border-error/40">
                          <span className="material-symbols-outlined text-[11px] text-error icon-filled">
                            priority_high
                          </span>
                        </span>
                      )}
                    </div>

                    <div className="flex flex-col min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="text-sm sm:text-base text-on-surface font-extrabold truncate tracking-tight">
                          KOT #{order.kotNumber}
                        </span>
                        <span
                          className={`px-2.5 py-0.5 rounded-full text-[10px] font-black tracking-wider uppercase shrink-0 ${
                            isServed
                              ? 'bg-surface-container-highest text-on-surface-variant border border-white/[0.08]'
                              : isReady
                                ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30'
                                : isUrgent
                                  ? 'bg-error/20 text-error border border-error/30 animate-pulse'
                                  : 'bg-amber-500/20 text-amber-300 border border-amber-500/30'
                          }`}
                        >
                          {statusMeta.kotBadgeLabel}
                        </span>
                      </div>
                      <div className="flex items-center gap-1.5 text-on-surface-variant/80 text-xs sm:text-sm mt-0.5">
                        <span className="material-symbols-outlined text-[15px] shrink-0">
                          table_restaurant
                        </span>
                        <span className="tabular-nums font-medium tracking-wide">
                          {order.tableNumber ? `Table ${order.tableNumber.replace('T', '')}` : 'Counter'} · {order.serviceMode}
                        </span>
                      </div>
                    </div>
                  </div>

                  {/* Action Icon Buttons */}
                  <div className="flex items-center gap-2 shrink-0" onClick={(e) => e.stopPropagation()}>
                    {!isServed && onAdvanceOrderStatus && (
                      <button
                        type="button"
                        disabled={advancingId === order.id}
                        aria-label={`Advance order ${order.kotNumber}`}
                        onClick={(e) => handleAdvance(e, order)}
                        className={`w-10 h-10 rounded-2xl border flex items-center justify-center transition-all cursor-pointer shadow-sm active:scale-95 ${
                          isReady
                            ? 'bg-blue-600/20 border-blue-500/40 text-blue-400 hover:bg-blue-600/30'
                            : order.status === 'preparing'
                              ? 'bg-emerald-500/20 border-emerald-500/40 text-emerald-400 hover:bg-emerald-500/30'
                              : 'bg-amber-500/20 border-amber-500/40 text-amber-300 hover:bg-amber-500/30'
                        }`}
                        title={isReady ? 'Mark Served' : order.status === 'preparing' ? 'Mark Ready' : 'Start Prep'}
                      >
                        <span className="material-symbols-outlined text-[18px]">
                          {isReady ? 'done_all' : order.status === 'preparing' ? 'notifications' : 'skillet'}
                        </span>
                      </button>
                    )}
                    <button
                      type="button"
                      aria-label={`Print ticket for ${order.kotNumber}`}
                      onClick={() => onNotify?.(`Printed KOT #${order.kotNumber}`)}
                      className="w-10 h-10 rounded-2xl bg-surface-container-high/80 border border-white/[0.08] flex items-center justify-center text-on-surface-variant hover:text-on-surface active:scale-95 transition-all cursor-pointer shadow-sm hover:border-white/20"
                      title="Print KOT Ticket"
                    >
                      <span className="material-symbols-outlined text-[18px]">print</span>
                    </button>
                    <button
                      type="button"
                      aria-label={`View order ${order.kotNumber}`}
                      onClick={() => setSelectedOrderId(order.id)}
                      className="w-10 h-10 rounded-2xl bg-surface-container-high/80 border border-white/[0.08] flex items-center justify-center text-on-surface-variant hover:text-primary active:scale-95 transition-all cursor-pointer shadow-sm hover:border-primary/40"
                      title="View Details"
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
                      {activeItemsCount} Items
                    </span>
                  </div>
                  <div className="flex flex-col">
                    <span className="text-[11px] text-on-surface-variant/70 font-semibold mb-0.5">Elapsed Time</span>
                    <span className="text-xs sm:text-sm md:text-base text-[#f59e0b] dark:text-[#fbbf24] font-black tabular-nums tracking-tight">
                      {order.elapsedMinutes} Mins
                    </span>
                  </div>
                  <div className="flex flex-col">
                    <span className="text-[11px] text-on-surface-variant/70 font-semibold mb-0.5">Progress</span>
                    <span className="text-xs sm:text-sm md:text-base text-on-surface font-black tabular-nums tracking-tight">
                      {phase.checkedCount}/{phase.totalCount} Ready
                    </span>
                  </div>
                </div>

                {/* Items Checklist Inset Container */}
                <div className="rounded-2xl liquid-glass-subcard p-3 space-y-1.5 border border-white/[0.04]">
                  {order.items.map((item, itemIdx) => {
                    const isCancelled = item.status === 'cancelled';
                    if (isCancelled) {
                      return (
                        <div
                          key={`${item.menuItemId}-cancelled-${itemIdx}`}
                          className="flex items-center justify-between gap-2 py-1.5 px-2.5 rounded-xl bg-red-950/20 border border-red-500/20 text-xs"
                        >
                          <div className="flex items-center gap-2 min-w-0">
                            <span className="w-4 h-4 rounded-md flex items-center justify-center shrink-0 bg-red-500/20 text-red-400 text-[11px] font-bold">
                              ✕
                            </span>
                            <span className="font-semibold line-through text-red-300 truncate">
                              {item.quantity}× {item.name}
                            </span>
                          </div>
                          <span className="text-[10px] px-1.5 py-0.5 rounded bg-red-500/20 text-red-300 font-bold shrink-0">
                            Cancelled · ₹{item.refundAmount || item.price * item.quantity} Refunded
                          </span>
                        </div>
                      );
                    }

                    return (
                      <div
                        key={item.menuItemId}
                        onClick={(e) => {
                          e.stopPropagation();
                          onToggleKotItem?.(order.id, item.menuItemId);
                        }}
                        className="flex items-center justify-between gap-2 py-1.5 px-2.5 rounded-xl hover:bg-surface-container-high/60 transition-colors text-xs cursor-pointer group/item"
                      >
                        <div className="flex items-center gap-2 min-w-0">
                          <span
                            className={`w-4 h-4 rounded-md flex items-center justify-center shrink-0 text-[11px] font-bold transition-all ${
                              item.checked
                                ? 'bg-emerald-500 text-white'
                                : 'border border-outline-variant text-transparent hover:border-primary'
                            }`}
                          >
                            ✓
                          </span>
                          <span
                            className={`font-semibold truncate ${
                              item.checked
                                ? 'line-through text-on-surface-variant opacity-60'
                                : 'text-on-surface'
                            }`}
                          >
                            {item.quantity}× {item.name}
                          </span>
                        </div>
                        <div className="flex items-center gap-1.5 shrink-0">
                          {item.note && (
                            <span className="text-[10px] text-amber-400/90 truncate max-w-[100px] bg-amber-500/10 px-1.5 py-0.5 rounded">
                              {item.note}
                            </span>
                          )}
                          {onCancelKotItem && !isServed && (
                            <button
                              type="button"
                              title="Cancel item and refund"
                              onClick={(e) => {
                                e.stopPropagation();
                                setCancelTarget({ order, item });
                                setCancelQty(item.quantity);
                                setCancelReason('Out of Stock / Ingredient Unavailable');
                                setCancelCustomReason('');
                              }}
                              className="w-6 h-6 rounded flex items-center justify-center text-outline hover:text-red-400 hover:bg-red-500/15 transition-all cursor-pointer opacity-70 group-hover/item:opacity-100"
                            >
                              <span className="material-symbols-outlined text-[15px]">cancel</span>
                            </button>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>

                {order.cookingNote && (
                  <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-surface-container-high/60 text-secondary text-xs">
                    <span className="material-symbols-outlined text-[14px] shrink-0">
                      restaurant
                    </span>
                    <span className="text-[11px] truncate font-medium">Chef Note: {order.cookingNote}</span>
                  </div>
                )}

                {/* Footer Row: Progress & Schedule */}
                <div className="flex items-center justify-between gap-3 text-xs sm:text-sm pt-0.5">
                  <div className="flex items-center gap-1.5 min-w-0">
                    <span className="material-symbols-outlined text-[18px] text-primary shrink-0">
                      skillet
                    </span>
                    <span className="text-xs text-on-surface-variant/80 font-medium truncate">
                      {order.items[0]?.name || 'Fresh order'}
                    </span>
                  </div>
                  <div className="flex items-center gap-1 text-on-surface-variant/70 text-xs shrink-0 font-medium">
                    <span className="material-symbols-outlined text-[15px]">schedule</span>
                    <span>{order.elapsedMinutes}m ago</span>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Ticket Details Modal */}
      <Dialog
        open={selectedOrder !== null}
        onOpenChange={(open) => {
          if (!open) setSelectedOrderId(null);
        }}
      >
        {selectedOrder && (
          <DialogContent className="max-h-[85vh] overflow-y-auto rounded-3xl border border-outline-variant/20 bg-surface-container p-6 text-on-surface sm:max-w-lg shadow-2xl">
            <DialogHeader>
              <div className="flex items-center justify-between">
                <DialogTitle className="text-lg font-black text-on-surface">
                  KOT {selectedOrder.kotNumber} · #{selectedOrder.id}
                </DialogTitle>
                <span className="px-2.5 py-0.5 rounded-full bg-[#FF6422]/15 text-[#FF6422] text-xs font-black capitalize">
                  {selectedOrder.status}
                </span>
              </div>
              <DialogDescription className="text-xs text-on-surface-variant">
                {selectedOrder.tableNumber
                  ? `Dine-In · Table ${selectedOrder.tableNumber}`
                  : selectedOrder.serviceMode}{' '}
                · Placed at {selectedOrder.createdAtLabel}
              </DialogDescription>
            </DialogHeader>

            <div className="mt-4 space-y-3">
              <h4 className="text-xs font-bold uppercase tracking-wider text-on-surface-variant">
                Ordered Items
              </h4>
              <div className="space-y-2">
                {selectedOrder.items.map((item) => (
                  <div
                    key={item.menuItemId}
                    onClick={() => onToggleKotItem?.(selectedOrder.id, item.menuItemId)}
                    className="flex items-center justify-between p-2.5 rounded-2xl bg-surface hover:bg-surface-variant/50 transition-colors cursor-pointer"
                  >
                    <div className="flex items-center gap-2.5">
                      <span
                        className={`w-5 h-5 rounded-lg flex items-center justify-center text-xs font-bold ${
                          item.checked
                            ? 'bg-emerald-500 text-white'
                            : 'border border-outline-variant text-transparent'
                        }`}
                      >
                        ✓
                      </span>
                      <div>
                        <p
                          className={`text-xs font-bold ${
                            item.checked
                              ? 'line-through text-on-surface-variant'
                              : 'text-on-surface'
                          }`}
                        >
                          {item.quantity}× {item.name}
                        </p>
                        {item.note && (
                          <p className="text-[11px] text-[#FF6422]">{item.note}</p>
                        )}
                      </div>
                    </div>
                    <span className="text-xs font-semibold text-on-surface-variant">
                      ₹{item.price * item.quantity}
                    </span>
                  </div>
                ))}
              </div>

              {selectedOrder.cookingNote && (
                <div className="p-3 rounded-2xl bg-[#FF6422]/10 border border-[#FF6422]/20 text-xs text-[#FF6422]">
                  <strong className="block font-bold">Special Preparation Note:</strong>
                  {selectedOrder.cookingNote}
                </div>
              )}

              {/* Modal Advance Button */}
              {selectedOrder.status !== 'served' && onAdvanceOrderStatus && (
                <div className="pt-2">
                  <button
                    type="button"
                    onClick={(e) => {
                      handleAdvance(e, selectedOrder);
                      setSelectedOrderId(null);
                    }}
                    className="w-full py-3 rounded-full bg-[#FF6422] hover:bg-[#E55518] text-white text-xs font-bold shadow-md hover:shadow-lg transition-all active:scale-95 cursor-pointer flex items-center justify-center gap-2"
                  >
                    <span className="material-symbols-outlined text-[18px]">
                      {selectedOrder.status === 'ready'
                        ? 'done_all'
                        : selectedOrder.status === 'preparing'
                          ? 'notifications'
                          : 'skillet'}
                    </span>
                    <span>
                      {selectedOrder.status === 'ready'
                        ? 'Complete & Mark Served'
                        : selectedOrder.status === 'preparing'
                          ? 'Mark Food Ready'
                          : 'Accept & Start Cooking'}
                    </span>
                  </button>
                </div>
              )}
            </div>
          </DialogContent>
        )}
      </Dialog>

      {/* Item Cancel & Refund Dialog */}
      <Dialog open={Boolean(cancelTarget)} onOpenChange={(open) => !open && setCancelTarget(null)}>
        <DialogContent className="max-w-md bg-surface-container dark:bg-slate-900/95 backdrop-blur-2xl border border-outline-variant/30 text-on-surface p-5 rounded-2xl shadow-2xl">
          <DialogHeader>
            <DialogTitle className="text-base font-bold text-on-surface flex items-center gap-2">
              <span className="material-symbols-outlined text-red-500 text-[20px]">
                remove_shopping_cart
              </span>
              <span>Cancel Item &amp; Issue Refund</span>
            </DialogTitle>
            <DialogDescription className="text-xs text-on-surface-variant">
              Order #{cancelTarget?.order.kotNumber || cancelTarget?.order.id} ·{' '}
              {cancelTarget?.order.tableNumber ? `Table ${cancelTarget.order.tableNumber.replace('T', '')}` : 'Counter'} ·{' '}
              <span className="capitalize">{cancelTarget?.order.serviceMode}</span>
            </DialogDescription>
          </DialogHeader>

          {cancelTarget && (
            <div className="space-y-4 pt-2">
              {/* Item Summary Card */}
              <div className="p-3.5 rounded-xl bg-surface-container-high/60 border border-outline-variant/20 flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center text-primary font-bold shrink-0">
                    <span className="material-symbols-outlined text-[20px]">restaurant</span>
                  </div>
                  <div>
                    <h4 className="text-sm font-bold text-on-surface">{cancelTarget.item.name}</h4>
                    <p className="text-xs text-on-surface-variant">
                      ₹{cancelTarget.item.price} each · Station: {cancelTarget.item.station}
                    </p>
                  </div>
                </div>
                <div className="text-right">
                  <span className="text-base font-black text-red-400 tabular-nums">
                    ₹{cancelTarget.item.price * cancelQty}
                  </span>
                  <span className="block text-[10px] text-on-surface-variant font-medium">
                    Refund Amount
                  </span>
                </div>
              </div>

              {/* Quantity to Cancel (if quantity > 1) */}
              {cancelTarget.item.quantity > 1 && (
                <div className="flex items-center justify-between p-2.5 rounded-xl bg-surface-container border border-outline-variant/15 text-xs">
                  <span className="font-semibold text-on-surface">Quantity to Cancel:</span>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      disabled={cancelQty <= 1}
                      onClick={() => setCancelQty((q) => Math.max(1, q - 1))}
                      className="w-7 h-7 rounded-lg bg-surface-container-high flex items-center justify-center font-bold text-on-surface disabled:opacity-40 cursor-pointer"
                    >
                      -
                    </button>
                    <span className="w-6 text-center font-bold text-on-surface tabular-nums">
                      {cancelQty}
                    </span>
                    <button
                      type="button"
                      disabled={cancelQty >= cancelTarget.item.quantity}
                      onClick={() => setCancelQty((q) => Math.min(cancelTarget.item.quantity, q + 1))}
                      className="w-7 h-7 rounded-lg bg-surface-container-high flex items-center justify-center font-bold text-on-surface disabled:opacity-40 cursor-pointer"
                    >
                      +
                    </button>
                  </div>
                </div>
              )}

              {/* Cancellation Reason Dropdown */}
              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-on-surface-variant">
                  Cancellation Reason:
                </label>
                <select
                  value={cancelReason}
                  onChange={(e) => setCancelReason(e.target.value)}
                  className="w-full bg-surface-container-high px-3 py-2 rounded-xl text-xs font-medium text-on-surface border border-outline-variant/20 focus:outline-none focus:ring-1 focus:ring-primary"
                >
                  <option value="Out of Stock / Ingredient Unavailable">
                    Out of Stock / Ingredient Unavailable
                  </option>
                  <option value="Burnt / Accidental Spoilage in Kitchen">
                    Burnt / Accidental Spoilage in Kitchen
                  </option>
                  <option value="Customer Cancellation Request">
                    Customer Cancellation Request
                  </option>
                  <option value="Kitchen Station Delay">Kitchen Station Delay</option>
                  <option value="Other">Other (Custom note)</option>
                </select>
              </div>

              {cancelReason === 'Other' && (
                <input
                  type="text"
                  value={cancelCustomReason}
                  onChange={(e) => setCancelCustomReason(e.target.value)}
                  placeholder="Type custom cancellation reason..."
                  className="w-full bg-surface-container-high px-3 py-2 rounded-xl text-xs text-on-surface border border-outline-variant/20 focus:outline-none focus:ring-1 focus:ring-primary"
                />
              )}

              {/* Payment & Refund Explanation */}
              <div className="p-2.5 rounded-xl bg-amber-500/10 border border-amber-500/20 text-amber-300 text-[11px] leading-relaxed flex items-start gap-2">
                <span className="material-symbols-outlined text-[16px] shrink-0 mt-0.5">info</span>
                <div>
                  {cancelTarget.order.paymentStatus === 'paid' ? (
                    <span>
                      This order was <strong>Paid Online</strong>. Cancelling will issue an immediate refund of{' '}
                      <strong>₹{cancelTarget.item.price * cancelQty}</strong> and restore recipe ingredients to inventory.
                    </span>
                  ) : (
                    <span>
                      This order is <strong>Pay on Counter</strong>. Cancelling will deduct{' '}
                      <strong>₹{cancelTarget.item.price * cancelQty}</strong> from the order bill and restore recipe ingredients to inventory.
                    </span>
                  )}
                </div>
              </div>

              {/* Modal Action Buttons */}
              <div className="flex gap-2 pt-1">
                <button
                  type="button"
                  disabled={isCancelling}
                  onClick={() => setCancelTarget(null)}
                  className="flex-1 py-2.5 rounded-xl bg-surface-container-high text-xs font-bold text-on-surface hover:bg-surface-bright transition-colors cursor-pointer"
                >
                  Keep Item
                </button>
                <button
                  type="button"
                  disabled={isCancelling}
                  onClick={handleConfirmCancelItem}
                  className="flex-1 py-2.5 rounded-xl bg-red-600 hover:bg-red-500 text-xs font-bold text-white transition-all shadow-md active:scale-95 cursor-pointer flex items-center justify-center gap-1.5 disabled:opacity-50"
                >
                  {isCancelling ? (
                    <>
                      <span className="material-symbols-outlined text-[16px] animate-spin">
                        progress_activity
                      </span>
                      <span>Processing...</span>
                    </>
                  ) : (
                    <>
                      <span className="material-symbols-outlined text-[16px]">check_circle</span>
                      <span>Confirm Cancel &amp; Refund</span>
                    </>
                  )}
                </button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </section>
  );
};
