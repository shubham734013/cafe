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
import { deriveKotCardPhase } from '../utils/cafeLogic';

interface KitchenPosOrdersScreenProps {
  orders: CafeOrder[];
  onAdvanceOrderStatus?: (orderId: string) => void | Promise<void>;
  onToggleKotItem?: (orderId: string, menuItemId: string) => void;
  onCancelKotItem?: (orderId: string, menuItemId: string, reason?: string, quantity?: number) => void | Promise<unknown>;
  onNotify?: (msg: string) => void;
}

export const KitchenPosOrdersScreen: React.FC<KitchenPosOrdersScreenProps> = ({
  orders,
  onAdvanceOrderStatus,
  onToggleKotItem,
  onNotify,
}) => {
  const [selectedOrderId, setSelectedOrderId] = useState<string | null>(null);
  const [advancingId, setAdvancingId] = useState<string | null>(null);
  const [filterTab, setFilterTab] = useState<'all' | 'active' | 'served'>('active');

  const posOrders = useMemo(
    () => orders.filter((order) => order.isPosTerminal || order.serviceMode === 'dine-in'),
    [orders]
  );

  const filteredOrders = useMemo(() => {
    if (filterTab === 'active') {
      return posOrders.filter((o) => o.status !== 'served' && o.paymentStatus !== 'cancelled');
    }
    if (filterTab === 'served') {
      return posOrders.filter((o) => o.status === 'served');
    }
    return posOrders;
  }, [posOrders, filterTab]);

  const selectedOrder = useMemo(
    () => posOrders.find((order) => order.id === selectedOrderId) ?? null,
    [posOrders, selectedOrderId]
  );

  const handleAdvance = async (e: React.MouseEvent, order: CafeOrder) => {
    e.stopPropagation();
    if (!onAdvanceOrderStatus || advancingId === order.id) return;
    setAdvancingId(order.id);
    try {
      await onAdvanceOrderStatus(order.id);
      onNotify?.(`Counter Order #${order.id} updated!`);
    } catch {
      onNotify?.(`Failed to update Order #${order.id}`);
    } finally {
      setAdvancingId(null);
    }
  };

  return (
    <section className="flex flex-col w-full pb-8 space-y-4">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pt-1">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-xl sm:text-2xl font-black text-on-surface tracking-tight">
              POS Counter Orders
            </h1>
            <span className="px-2.5 py-0.5 rounded-full bg-[#FF6422]/15 text-[#FF6422] text-[11px] font-black inline-flex items-center gap-1">
              <span className="material-symbols-outlined text-[14px]">point_of_sale</span>
              <span>Direct Counter Sync</span>
            </span>
          </div>
          <p className="text-xs text-on-surface-variant mt-0.5">
            Orders placed via cash register / POS counter terminal.
          </p>
        </div>

        {/* Tab Filters */}
        <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar">
          {[
            { id: 'active', label: `Active Cooking (${posOrders.filter((o) => o.status !== 'served').length})` },
            { id: 'served', label: 'Served History' },
            { id: 'all', label: `All Counter (${posOrders.length})` },
          ].map((tab) => {
            const isActive = filterTab === tab.id;
            return (
              <button
                key={tab.id}
                type="button"
                onClick={() => setFilterTab(tab.id as typeof filterTab)}
                className={`px-3 py-1.5 rounded-full text-xs font-bold whitespace-nowrap transition-all cursor-pointer ${
                  isActive
                    ? 'bg-[#FF6422] text-white shadow-sm'
                    : 'bg-surface-container hover:bg-surface-container-high text-on-surface-variant border border-outline-variant/15'
                }`}
              >
                {tab.label}
              </button>
            );
          })}
        </div>
      </div>

      {filteredOrders.length === 0 ? (
        <div className="rounded-3xl border border-outline-variant/15 bg-surface-container p-12 text-center space-y-2">
          <div className="w-12 h-12 rounded-full bg-[#FF6422]/15 text-[#FF6422] flex items-center justify-center mx-auto">
            <span className="material-symbols-outlined text-[24px]">point_of_sale</span>
          </div>
          <h3 className="font-bold text-on-surface text-sm sm:text-base">No Counter Orders Found</h3>
          <p className="text-xs text-on-surface-variant">
            Counter POS orders will appear here automatically in real time.
          </p>
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {filteredOrders.map((order) => {
            const phase = deriveKotCardPhase(order);
            const isServed = order.status === 'served';
            const isReady = order.status === 'ready';

            return (
              <div
                key={order.id}
                onClick={() => setSelectedOrderId(order.id)}
                className="group rounded-3xl bg-surface-container hover:bg-surface-container-high border border-outline-variant/15 p-4 sm:p-5 shadow-sm hover:shadow-md transition-all cursor-pointer flex flex-col justify-between"
              >
                <div>
                  <div className="flex items-start justify-between gap-2 mb-3">
                    <div>
                      <p className="font-black text-sm sm:text-base text-on-surface group-hover:text-[#FF6422] transition-colors">
                        Order #{order.id}
                      </p>
                      <p className="text-xs text-on-surface-variant">
                        {order.createdAtLabel} ·{' '}
                        {order.tableNumber ? `Table ${order.tableNumber}` : 'Counter Pickup'}
                      </p>
                    </div>

                    <span
                      className={`px-2.5 py-0.5 rounded-full text-[11px] font-black capitalize ${
                        isServed
                          ? 'bg-surface-container-highest text-on-surface-variant'
                          : isReady
                            ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30'
                            : 'bg-[#FF6422]/15 text-[#FF6422] border border-[#FF6422]/25'
                      }`}
                    >
                      {ORDER_STATUS_META[order.status]?.kotBadgeLabel || order.status}
                    </span>
                  </div>

                  {/* Items list */}
                  <div className="space-y-1.5 py-2 border-t border-b border-outline-variant/10 text-xs">
                    {order.items.map((item) => (
                      <div
                        key={item.menuItemId}
                        onClick={(e) => {
                          e.stopPropagation();
                          onToggleKotItem?.(order.id, item.menuItemId);
                        }}
                        className="flex items-center justify-between py-1 px-1.5 rounded-xl hover:bg-surface-variant/40 transition-colors"
                      >
                        <div className="flex items-center gap-2 min-w-0">
                          <span
                            className={`w-4 h-4 rounded-md flex items-center justify-center shrink-0 text-[11px] font-bold ${
                              item.checked ? 'bg-emerald-500 text-white' : 'border border-outline-variant text-transparent'
                            }`}
                          >
                            ✓
                          </span>
                          <span
                            className={`truncate ${
                              item.checked ? 'line-through text-on-surface-variant' : 'text-on-surface font-semibold'
                            }`}
                          >
                            {item.quantity}× {item.name}
                          </span>
                        </div>
                        <span className="text-on-surface-variant font-medium shrink-0">
                          ₹{item.price * item.quantity}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Footer */}
                <div className="mt-4 pt-2 flex items-center justify-between gap-2">
                  <div className="text-[11px] text-on-surface-variant">
                    <span className="font-black text-on-surface">₹{order.total}</span>
                    <span className="mx-1">·</span>
                    <span className="capitalize">{order.paymentMode || 'cash'}</span>
                  </div>

                  {!isServed && onAdvanceOrderStatus && (
                    <button
                      type="button"
                      disabled={advancingId === order.id}
                      onClick={(e) => handleAdvance(e, order)}
                      className="px-3 py-1.5 rounded-full bg-[#FF6422] hover:bg-[#E55518] text-white text-xs font-bold shadow-sm transition-all active:scale-95 cursor-pointer"
                    >
                      {advancingId === order.id ? 'Updating...' : isReady ? 'Serve' : 'Advance'}
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Details Dialog */}
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
                  POS Order #{selectedOrder.id}
                </DialogTitle>
                <span className="px-2.5 py-0.5 rounded-full bg-[#FF6422]/15 text-[#FF6422] text-xs font-black capitalize">
                  {selectedOrder.status}
                </span>
              </div>
              <DialogDescription className="text-xs text-on-surface-variant">
                Placed at {selectedOrder.createdAtLabel} · {selectedOrder.serviceMode}
              </DialogDescription>
            </DialogHeader>

            <div className="mt-4 space-y-3">
              <h4 className="text-xs font-bold uppercase tracking-wider text-on-surface-variant">
                Items Checklist
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
                          item.checked ? 'bg-emerald-500 text-white' : 'border border-outline-variant text-transparent'
                        }`}
                      >
                        ✓
                      </span>
                      <p
                        className={`text-xs font-bold ${
                          item.checked ? 'line-through text-on-surface-variant' : 'text-on-surface'
                        }`}
                      >
                        {item.quantity}× {item.name}
                      </p>
                    </div>
                    <span className="text-xs font-semibold text-on-surface">
                      ₹{item.price * item.quantity}
                    </span>
                  </div>
                ))}
              </div>

              {selectedOrder.status !== 'served' && onAdvanceOrderStatus && (
                <div className="pt-2">
                  <button
                    type="button"
                    onClick={(e) => {
                      handleAdvance(e, selectedOrder);
                      setSelectedOrderId(null);
                    }}
                    className="w-full py-3 rounded-full bg-[#FF6422] hover:bg-[#E55518] text-white text-xs font-bold shadow-md transition-all active:scale-95 cursor-pointer"
                  >
                    Advance Order Status
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
