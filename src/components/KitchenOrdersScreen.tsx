import React, { useMemo, useState } from 'react';
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
  onRefresh?: () => void;
  onNotify?: (msg: string) => void;
}

type KitchenTab = 'active' | 'preparing' | 'ready' | 'dine-in' | 'takeaway' | 'completed';

export const KitchenOrdersScreen: React.FC<KitchenOrdersScreenProps> = ({
  orders,
  onAdvanceOrderStatus,
  onToggleKotItem,
  onRefresh,
  onNotify,
}) => {
  const [selectedTab, setSelectedTab] = useState<KitchenTab>('active');
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedOrderId, setSelectedOrderId] = useState<string | null>(null);
  const [advancingId, setAdvancingId] = useState<string | null>(null);

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
              Live KDS
            </span>
          </div>
          <p className="text-xs text-on-surface-variant mt-0.5">
            Synchronized live cooking queue · Zero duplicate tickets
          </p>
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
            placeholder="Search by KOT, Table #, or dish name..."
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

            return (
              <div
                key={order.id}
                onClick={() => setSelectedOrderId(order.id)}
                className={`group rounded-3xl bg-surface-container hover:bg-surface-container-high border transition-all cursor-pointer shadow-sm hover:shadow-md flex flex-col justify-between p-4 sm:p-5 ${
                  isUrgent && !isServed
                    ? 'border-red-500/40 ring-1 ring-red-500/20'
                    : isReady
                      ? 'border-emerald-500/30'
                      : 'border-outline-variant/15'
                }`}
              >
                {/* Header: KOT Number, Channel, Status Badge */}
                <div>
                  <div className="flex items-start justify-between gap-2 mb-3">
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="font-black text-base text-on-surface group-hover:text-[#FF6422] transition-colors">
                          KOT {order.kotNumber}
                        </span>
                        {isUrgent && !isServed && (
                          <span className="px-1.5 py-0.5 rounded-full bg-red-500/15 text-red-400 text-[10px] font-black animate-pulse">
                            URGENT
                          </span>
                        )}
                      </div>
                      <p className="text-xs text-on-surface-variant font-medium mt-0.5">
                        {order.tableNumber ? `Table ${order.tableNumber.replace('T', '')}` : 'Counter'}{' '}
                        · <span className="capitalize">{order.serviceMode}</span>
                      </p>
                    </div>

                    {/* Status Badge */}
                    <span
                      className={`px-2.5 py-1 rounded-full text-[11px] font-black capitalize shrink-0 ${
                        isServed
                          ? 'bg-surface-container-highest text-on-surface-variant'
                          : isReady
                            ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30'
                            : 'bg-amber-500/20 text-amber-400 border border-amber-500/30'
                      }`}
                    >
                      {statusMeta.kotBadgeLabel}
                    </span>
                  </div>

                  {/* Items Checklist */}
                  <div className="space-y-1.5 py-2 border-t border-b border-outline-variant/10">
                    {order.items.map((item) => (
                      <div
                        key={item.menuItemId}
                        onClick={(e) => {
                          e.stopPropagation();
                          onToggleKotItem?.(order.id, item.menuItemId);
                        }}
                        className="flex items-center justify-between gap-2 py-1 px-1.5 rounded-xl hover:bg-surface-variant/40 transition-colors text-xs"
                      >
                        <div className="flex items-center gap-2 min-w-0">
                          <span
                            className={`w-4 h-4 rounded-md flex items-center justify-center shrink-0 text-[12px] font-bold transition-all ${
                              item.checked
                                ? 'bg-emerald-500 text-white'
                                : 'border border-outline-variant text-transparent hover:border-[#FF6422]'
                            }`}
                          >
                            ✓
                          </span>
                          <span
                            className={`font-semibold truncate ${
                              item.checked
                                ? 'line-through text-on-surface-variant opacity-70'
                                : 'text-on-surface'
                            }`}
                          >
                            {item.quantity}× {item.name}
                          </span>
                        </div>
                        {item.note && (
                          <span className="text-[10px] text-amber-400/90 truncate shrink-0 max-w-[90px]">
                            {item.note}
                          </span>
                        )}
                      </div>
                    ))}
                  </div>

                  {order.cookingNote && (
                    <div className="mt-2 p-2 rounded-xl bg-[#FF6422]/10 border border-[#FF6422]/20 text-[11px] text-[#FF6422] font-semibold">
                      Chef Note: {order.cookingNote}
                    </div>
                  )}
                </div>

                {/* Footer Row: Progress & Action Button */}
                <div className="mt-4 pt-2 flex items-center justify-between gap-3">
                  <div className="text-[11px] text-on-surface-variant font-medium">
                    <span>
                      {phase.checkedCount}/{phase.totalCount} prepped
                    </span>
                    <span className="mx-1.5">·</span>
                    <span className={isUrgent ? 'text-red-400 font-bold' : ''}>
                      {order.elapsedMinutes}m ago
                    </span>
                  </div>

                  {/* Status Advance Action Button */}
                  {!isServed && onAdvanceOrderStatus && (
                    <button
                      type="button"
                      disabled={advancingId === order.id}
                      onClick={(e) => handleAdvance(e, order)}
                      className={`px-3 py-1.5 rounded-full text-xs font-bold text-white shadow-sm transition-all active:scale-95 cursor-pointer flex items-center gap-1 shrink-0 ${
                        isReady
                          ? 'bg-blue-600 hover:bg-blue-500'
                          : order.status === 'preparing'
                            ? 'bg-emerald-600 hover:bg-emerald-500'
                            : 'bg-[#FF6422] hover:bg-[#E55518]'
                      }`}
                    >
                      {advancingId === order.id ? (
                        <span>Updating...</span>
                      ) : isReady ? (
                        <>
                          <span className="material-symbols-outlined text-[15px]">done_all</span>
                          <span>Serve</span>
                        </>
                      ) : order.status === 'preparing' ? (
                        <>
                          <span className="material-symbols-outlined text-[15px]">notifications</span>
                          <span>Mark Ready</span>
                        </>
                      ) : (
                        <>
                          <span className="material-symbols-outlined text-[15px]">skillet</span>
                          <span>Start Prep</span>
                        </>
                      )}
                    </button>
                  )}
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
    </section>
  );
};
