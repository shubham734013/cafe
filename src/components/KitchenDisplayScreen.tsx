import React, { useEffect, useState } from 'react';
import { CafeOrder } from '../types/cafe';

interface KitchenDisplayScreenProps {
  orders: CafeOrder[];
  onToggleKotItem: (orderId: string, menuItemId: string) => void;
  onAdvanceOrderStatus: (orderId: string) => void;
  onNotify: (msg: string) => void;
}

type KotFilter = 'all' | 'dine-in' | 'takeaway' | 'priority';

export const KitchenDisplayScreen: React.FC<KitchenDisplayScreenProps> = ({
  orders,
  onToggleKotItem,
  onAdvanceOrderStatus,
  onNotify,
}) => {
  const [filter, setFilter] = useState<KotFilter>('all');
  const [isMuted, setIsMuted] = useState(false);
  const [tickSeconds, setTickSeconds] = useState(0);

  useEffect(() => {
    const interval = setInterval(() => {
      setTickSeconds((s) => s + 1);
    }, 1000);
    return () => clearInterval(interval);
  }, []);

  const activeKotOrders = orders.filter((o) => o.status !== 'served');
  const preparingCount = activeKotOrders.filter(
    (o) => o.status === 'placed' || o.status === 'preparing'
  ).length;
  const readyCount = activeKotOrders.filter((o) => o.status === 'ready').length;

  const filteredOrders = activeKotOrders.filter((order) => {
    if (filter === 'all') return true;
    if (filter === 'dine-in') return order.serviceMode === 'dine-in';
    if (filter === 'takeaway') return order.serviceMode === 'takeaway';
    if (filter === 'priority') return Boolean(order.isUrgent);
    return true;
  });

  const formatTimer = (baseMinutes: number, idx: number) => {
    const totalSec = baseMinutes * 60 + ((idx * 17 + tickSeconds) % 3600);
    const min = Math.floor(totalSec / 60);
    const sec = totalSec % 60;
    return `${String(min).padStart(2, '0')}:${String(sec).padStart(2, '0')}`;
  };

  return (
    <div className="flex flex-col w-full pb-6 space-y-4">
      {/* Live KOT Top Banner & Sound Controls */}
      <div className="w-full bg-surface-container-high rounded-xl p-4 shadow-md flex items-center justify-between gap-2">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-lg bg-surface-container-highest flex items-center justify-center text-primary shrink-0">
            <span className="material-symbols-outlined text-[24px]">soup_kitchen</span>
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-lg sm:text-xl font-bold text-on-surface">
                Kitchen Orders (KOT)
              </h1>
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-on-tertiary-container text-tertiary text-[11px] font-semibold">
                <span className="w-1.5 h-1.5 rounded-full bg-tertiary animate-ping" />
                Live
              </span>
            </div>
            <p className="text-xs text-on-surface-variant flex items-center gap-2 mt-0.5 tabular-nums">
              <span>
                <strong className="text-primary">{preparingCount}</strong> in preparation
              </span>
              <span>·</span>
              <span>
                <strong className="text-tertiary">{readyCount}</strong> ready
              </span>
            </p>
          </div>
        </div>

        <div className="flex items-center gap-1.5 shrink-0">
          <button
            type="button"
            aria-label={isMuted ? 'Unmute KOT chime audio alert' : 'Mute KOT chime audio alert'}
            onClick={() => {
              setIsMuted((m) => !m);
              onNotify(isMuted ? 'KOT chime enabled' : 'KOT chime muted');
            }}
            className={`w-10 h-10 rounded-lg bg-surface-container flex items-center justify-center transition-colors cursor-pointer ${
              isMuted ? 'text-error' : 'text-on-surface-variant hover:text-primary'
            }`}
          >
            <span className="material-symbols-outlined text-[20px]">
              {isMuted ? 'volume_off' : 'volume_up'}
            </span>
          </button>
          <button
            type="button"
            aria-label="Refresh KOT feed"
            onClick={() => onNotify('KOT feed synchronized')}
            className="w-10 h-10 rounded-lg bg-surface-container flex items-center justify-center text-on-surface-variant hover:text-primary transition-colors cursor-pointer"
          >
            <span className="material-symbols-outlined text-[20px]">refresh</span>
          </button>
        </div>
      </div>

      {/* Filter Selector Chips */}
      <div className="flex items-center gap-2 overflow-x-auto no-scrollbar py-0.5">
        {[
          { id: 'all' as KotFilter, label: `All (${activeKotOrders.length})` },
          {
            id: 'dine-in' as KotFilter,
            label: `Dine-In (${activeKotOrders.filter((o) => o.serviceMode === 'dine-in').length})`,
          },
          {
            id: 'takeaway' as KotFilter,
            label: `Takeaway (${activeKotOrders.filter((o) => o.serviceMode === 'takeaway').length})`,
          },
          { id: 'priority' as KotFilter, label: 'Urgent', icon: 'local_fire_department' },
        ].map((tab) => {
          const active = filter === tab.id;
          return (
            <button
              key={tab.id}
              type="button"
              onClick={() => setFilter(tab.id)}
              className={`px-3.5 py-1.5 rounded-full text-xs font-semibold shrink-0 shadow-sm transition-all flex items-center gap-1 cursor-pointer ${
                active
                  ? 'bg-primary-container text-on-primary-container font-bold'
                  : 'bg-surface-container-high text-on-surface-variant hover:text-on-surface'
              }`}
            >
              {tab.icon && (
                <span className="material-symbols-outlined text-[15px] text-error">
                  {tab.icon}
                </span>
              )}
              <span>{tab.label}</span>
            </button>
          );
        })}
      </div>

      {/* KOT Tickets Grid */}
      {filteredOrders.length === 0 ? (
        <div className="bg-surface-container-low rounded-xl p-8 text-center">
          <span className="material-symbols-outlined text-4xl text-tertiary mb-2">
            check_circle
          </span>
          <p className="text-base font-bold text-on-surface">Kitchen Queue Clear</p>
          <p className="text-xs text-on-surface-variant mt-1">
            All tickets in this filter have been dispatched. Place an order from POS or Customer
            Menu to see live KOT tickets.
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4 items-start">
          {filteredOrders.map((order, idx) => {
            const isPlaced = order.status === 'placed';
            const isPreparing = order.status === 'preparing';
            const isReady = order.status === 'ready';

            return (
              <article
                key={order.id}
                className="w-full rounded-xl bg-surface-container-low shadow-lg overflow-hidden flex flex-col"
              >
                <div className="bg-surface-container-high p-4 flex items-center justify-between gap-2">
                  <div className="flex flex-col min-w-0">
                    <div className="flex items-center gap-1.5 flex-wrap">
                      <span className="text-lg font-bold tracking-tight text-primary">
                        #{order.id}
                      </span>
                      <span
                        className={`px-2 py-0.5 rounded-md text-[11px] font-bold uppercase tracking-wider flex items-center gap-1 ${
                          order.serviceMode === 'dine-in'
                            ? 'bg-secondary-container text-on-secondary-container'
                            : 'bg-surface-container-highest text-primary-fixed'
                        }`}
                      >
                        {order.serviceMode === 'takeaway' && (
                          <span className="material-symbols-outlined text-[13px]">
                            shopping_bag
                          </span>
                        )}
                        {order.serviceMode === 'dine-in'
                          ? `Table ${order.tableNumber || 'T3'}`
                          : order.serviceMode === 'delivery'
                            ? order.deliveryPartner || 'Delivery'
                            : 'Takeaway'}
                      </span>
                    </div>
                    <span className="text-[11px] text-on-surface-variant mt-0.5">
                      {(() => {
                        const totalQty = order.items.reduce((s, i) => s + i.quantity, 0);
                        return `${totalQty} ${totalQty === 1 ? 'item' : 'items'}`;
                      })()}{' '}
                      · {order.elapsedMinutes}m ago
                    </span>
                  </div>

                  <div className="flex items-center gap-1 px-3 py-1.5 rounded-lg bg-surface-container-lowest text-primary shadow-inner shrink-0">
                    <span className="material-symbols-outlined text-[16px] text-primary-container animate-pulse">
                      timer
                    </span>
                    <span className="text-sm font-bold tracking-wider tabular-nums">
                      {formatTimer(order.elapsedMinutes, idx)}
                    </span>
                  </div>
                </div>

                {/* Items Checklist */}
                <div className="p-3.5 space-y-2 bg-surface-container-low">
                  {order.items.map((item) => {
                    const checked = Boolean(item.checked);
                    return (
                      <button
                        key={item.menuItemId}
                        type="button"
                        onClick={() => onToggleKotItem(order.id, item.menuItemId)}
                        className={`w-full text-left flex items-start justify-between p-2.5 rounded-lg transition-colors cursor-pointer ${
                          checked
                            ? 'bg-surface-container-lowest opacity-70'
                            : 'bg-surface-container hover:bg-surface-container-high'
                        }`}
                      >
                        <div className="flex items-start gap-2.5 min-w-0">
                          <span className="w-5 h-5 rounded mt-0.5 bg-surface-container-high flex items-center justify-center text-primary-container shrink-0">
                            <span
                              className={`material-symbols-outlined text-[16px] transition-opacity ${
                                checked ? 'opacity-100' : 'opacity-0'
                              }`}
                            >
                              check
                            </span>
                          </span>
                          <div className="flex flex-col min-w-0">
                            <span
                              className={`text-sm font-semibold ${
                                checked ? 'line-through text-on-surface-variant' : 'text-on-surface'
                              }`}
                            >
                              {item.quantity} × {item.name}
                            </span>
                            <span className="text-xs text-secondary flex items-center gap-1 mt-0.5">
                              <span className="material-symbols-outlined text-[13px]">tune</span>
                              {item.note}
                            </span>
                          </div>
                        </div>
                        <span className="text-[11px] px-2 py-0.5 rounded bg-surface-container-highest text-on-surface-variant font-medium shrink-0">
                          {item.station}
                        </span>
                      </button>
                    );
                  })}
                </div>

                {/* Card Action Buttons */}
                <div className="px-3.5 pb-3.5 pt-1 bg-surface-container-low flex gap-2 mt-auto">
                  <button
                    type="button"
                    onClick={() => onAdvanceOrderStatus(order.id)}
                    className={`flex-1 h-11 rounded-lg text-sm font-bold flex items-center justify-center gap-2 transition-all active:scale-[0.98] cursor-pointer ${
                      isReady
                        ? 'bg-tertiary-container text-on-tertiary-container shadow-[0_0_16px_rgba(43,202,98,0.25)]'
                        : isPreparing
                          ? 'bg-tertiary-container text-on-tertiary-container shadow-[0_0_16px_rgba(43,202,98,0.25)]'
                          : 'bg-primary-container hover:bg-primary text-on-primary-container shadow-[0_0_16px_rgba(245,158,11,0.2)]'
                    }`}
                  >
                    <span className="material-symbols-outlined text-[19px]">
                      {isReady ? 'done_all' : isPreparing ? 'check_circle' : 'skillet'}
                    </span>
                    <span>
                      {isPlaced
                        ? 'Prepare Order'
                        : isPreparing
                          ? 'Mark as Ready'
                          : 'Dispatch / Served'}
                    </span>
                  </button>
                </div>
              </article>
            );
          })}
        </div>
      )}

      {/* Chef Station Quick Telemetry Bar */}
      <aside className="w-full bg-surface-container-lowest rounded-xl p-4 flex flex-col gap-2 shadow-md">
        <div className="flex items-center justify-between text-on-surface-variant text-xs">
          <span className="flex items-center gap-1 text-primary font-medium">
            <span className="material-symbols-outlined text-[16px]">speed</span>
            Avg Cook Pace
          </span>
          <span className="text-on-surface font-semibold tabular-nums">06m 12s</span>
        </div>
        <div className="w-full h-1.5 rounded-full bg-surface-container-highest overflow-hidden">
          <div className="h-full bg-primary-container rounded-full w-[68%]" />
        </div>
        <div className="flex items-center justify-between pt-0.5 text-xs text-on-surface-variant">
          <span className="flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-full bg-tertiary" />
            Station 1 (Hot Kitchen + Barista)
          </span>
          <span className="text-secondary text-[11px]">Active Sync: Live</span>
        </div>
      </aside>
    </div>
  );
};
