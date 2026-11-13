import React, { useEffect, useRef, useState } from 'react';
import { AnimatePresence, MotionConfig, motion } from 'motion/react';
import { ORDER_STATUS_META } from '../state/cafeStateMachines';
import { CafeOrder, OrderStatus } from '../types/cafe';
import { deriveKotCardPhase } from '../utils/cafeLogic';

interface KitchenDisplayScreenProps {
  orders: CafeOrder[];
  pendingOrderId?: string | null;
  onToggleKotItem: (orderId: string, menuItemId: string) => void;
  onAdvanceOrderStatus: (orderId: string) => void | Promise<void>;
  onNotify: (msg: string) => void;
}

type KotFilter = 'all' | 'dine-in' | 'takeaway' | 'priority';

function deterministicOffsetSeconds(orderId: string): number {
  let hash = 0;
  for (let i = 0; i < orderId.length; i += 1) {
    hash = (hash * 31 + orderId.charCodeAt(i)) % 60;
  }
  return hash;
}

const KotElapsedBadge: React.FC<{ baseMinutes: number; orderId: string }> = React.memo(
  ({ baseMinutes, orderId }) => {
    const [elapsedOffsetSec, setElapsedOffsetSec] = useState(0);

    useEffect(() => {
      const interval = setInterval(() => {
        setElapsedOffsetSec((s) => s + 1);
      }, 1000);
      return () => clearInterval(interval);
    }, []);

    const initialSec = deterministicOffsetSeconds(orderId);
    const totalSec = Math.max(0, baseMinutes * 60 + ((initialSec + elapsedOffsetSec) % 3600));
    const min = Math.floor(totalSec / 60);
    const sec = totalSec % 60;
    return (
      <div className="flex items-center gap-1 px-3 py-1.5 rounded-lg bg-surface-container-lowest text-primary shadow-inner shrink-0">
        <span className="material-symbols-outlined text-[16px] text-primary-container animate-pulse">
          timer
        </span>
        <span className="text-sm font-bold tracking-wider tabular-nums">
          {String(min).padStart(2, '0')}:{String(sec).padStart(2, '0')}
        </span>
      </div>
    );
  }
);

KotElapsedBadge.displayName = 'KotElapsedBadge';

export const KitchenDisplayScreen: React.FC<KitchenDisplayScreenProps> = ({
  orders,
  pendingOrderId = null,
  onToggleKotItem,
  onAdvanceOrderStatus,
  onNotify,
}) => {
  const [filter, setFilter] = useState<KotFilter>('all');
  const [isMuted, setIsMuted] = useState(false);
  const [localPendingId, setLocalPendingId] = useState<string | null>(null);
  const [justPreparedIds, setJustPreparedIds] = useState<Set<string>>(() => new Set());
  const prevStatusMapRef = useRef<Record<string, OrderStatus>>({});

  useEffect(() => {
    const prev = prevStatusMapRef.current;
    const newlyPrepared: string[] = [];

    for (const order of orders) {
      const oldStatus = prev[order.id];
      if (
        oldStatus &&
        (oldStatus === 'placed' || oldStatus === 'preparing') &&
        order.status === 'ready'
      ) {
        newlyPrepared.push(order.id);
      }
      prev[order.id] = order.status;
    }

    if (newlyPrepared.length === 0) return;

    setJustPreparedIds((cur) => {
      const next = new Set(cur);
      newlyPrepared.forEach((id) => next.add(id));
      return next;
    });

    const timer = window.setTimeout(() => {
      setJustPreparedIds((cur) => {
        const next = new Set(cur);
        newlyPrepared.forEach((id) => next.delete(id));
        return next;
      });
    }, 1500);

    return () => window.clearTimeout(timer);
  }, [orders]);

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

  const handleAdvance = async (orderId: string) => {
    if (pendingOrderId === orderId || localPendingId === orderId) return;
    setLocalPendingId(orderId);
    try {
      await onAdvanceOrderStatus(orderId);
    } finally {
      setLocalPendingId((prev) => (prev === orderId ? null : prev));
    }
  };

  return (
    <MotionConfig reducedMotion="user">
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
          <motion.div
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.25 }}
            className="bg-surface-container-low rounded-xl p-8 text-center"
          >
            <span className="material-symbols-outlined text-4xl text-tertiary mb-2">
              check_circle
            </span>
            <p className="text-base font-bold text-on-surface">Kitchen Queue Clear</p>
            <p className="text-xs text-on-surface-variant mt-1">
              All tickets in this filter have been dispatched. Place an order from POS or Customer
              Menu to see live KOT tickets.
            </p>
          </motion.div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4 items-start">
            <AnimatePresence mode="popLayout">
              {filteredOrders.map((order, cardIdx) => {
                const statusMeta = ORDER_STATUS_META[order.status];
                const isGreenCta = order.status === 'preparing' || order.status === 'ready';
                const isBusy = pendingOrderId === order.id || localPendingId === order.id;
                const cardPhase = deriveKotCardPhase(order);
                const isPrepared = cardPhase.phase === 'prepared';
                const isJustPrepared = justPreparedIds.has(order.id);

                return (
                  <motion.article
                    key={order.id}
                    layout
                    data-testid={`kot-card-${order.id}`}
                    data-kot-phase={cardPhase.phase}
                    data-status={order.status}
                    data-just-prepared={isJustPrepared ? 'true' : 'false'}
                    initial={{ opacity: 0, y: 18, scale: 0.96 }}
                    animate={{
                      opacity: 1,
                      y: 0,
                      scale: isJustPrepared ? [1, 1.022, 1] : 1,
                    }}
                    exit={{ opacity: 0, scale: 0.92, y: -14 }}
                    transition={{
                      duration: isJustPrepared ? 0.42 : 0.24,
                      delay: isJustPrepared ? 0 : Math.min(cardIdx * 0.04, 0.16),
                      ease: [0.22, 1, 0.36, 1],
                    }}
                    className={`w-full rounded-xl overflow-hidden flex flex-col border transition-colors duration-300 ${
                      isPrepared
                        ? 'bg-tertiary/[0.06] border-tertiary/55 shadow-[0_0_24px_rgba(81,231,123,0.16)]'
                        : 'bg-surface-container-low border-outline-variant/20 shadow-lg'
                    }`}
                  >
                    {/* Top Progress Bar animating from Pending -> Prepared */}
                    <div className="w-full h-1 bg-surface-container-highest overflow-hidden">
                      <motion.div
                        className={`h-full transition-colors duration-300 ${
                          isPrepared ? 'bg-tertiary' : 'bg-primary-container'
                        }`}
                        initial={false}
                        animate={{ width: `${cardPhase.completionPct}%` }}
                        transition={{ duration: 0.35, ease: [0.22, 1, 0.36, 1] }}
                      />
                    </div>

                    <div
                      className={`p-4 flex items-center justify-between gap-2 transition-colors duration-300 ${
                        isPrepared ? 'bg-tertiary/12' : 'bg-surface-container-high'
                      }`}
                    >
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

                          {/* Animated Pending -> Prepared Status Badge */}
                          <AnimatePresence mode="wait">
                            <motion.span
                              key={order.status}
                              data-testid={`kot-status-badge-${order.id}`}
                              initial={{ opacity: 0, y: -5, scale: 0.88 }}
                              animate={{ opacity: 1, y: 0, scale: 1 }}
                              exit={{ opacity: 0, y: 5, scale: 0.88 }}
                              transition={{ duration: 0.12 }}
                              className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wide ${
                                isPrepared
                                  ? 'bg-tertiary-container text-on-tertiary-container shadow-sm'
                                  : order.status === 'preparing'
                                    ? 'bg-primary-container/20 text-primary'
                                    : 'bg-surface-container-highest text-on-surface-variant'
                              }`}
                            >
                              <span className="material-symbols-outlined text-[12px]">
                                {isPrepared
                                  ? 'check_circle'
                                  : order.status === 'preparing'
                                    ? 'skillet'
                                    : 'schedule'}
                              </span>
                              {isPrepared
                                ? 'Prepared'
                                : order.status === 'preparing'
                                  ? 'Preparing'
                                  : 'Pending'}
                            </motion.span>
                          </AnimatePresence>
                        </div>
                        <span className="text-[11px] text-on-surface-variant mt-0.5 tabular-nums">
                          {(() => {
                            const totalQty = order.items.reduce((s, i) => s + i.quantity, 0);
                            return `${totalQty} ${totalQty === 1 ? 'item' : 'items'}`;
                          })()}{' '}
                          · {cardPhase.checkedCount}/{cardPhase.totalCount} prepped ·{' '}
                          {order.elapsedMinutes}m ago
                        </span>
                      </div>

                      <KotElapsedBadge baseMinutes={order.elapsedMinutes} orderId={order.id} />
                    </div>

                    {/* Immediate Visual Feedback Banner when Order Transitions to Prepared */}
                    <AnimatePresence>
                      {isJustPrepared && (
                        <motion.div
                          initial={{ opacity: 0, height: 0 }}
                          animate={{ opacity: 1, height: 'auto' }}
                          exit={{ opacity: 0, height: 0 }}
                          transition={{ duration: 0.22 }}
                          className="overflow-hidden bg-tertiary/20 border-y border-tertiary/35 px-4 py-1.5 flex items-center gap-2 text-xs font-bold text-tertiary"
                        >
                          <span className="material-symbols-outlined text-[15px]">task_alt</span>
                          <span>Order Prepared — Ready for Pickup / Service</span>
                        </motion.div>
                      )}
                    </AnimatePresence>

                    {/* Items Checklist with Entrance & Exit Animations */}
                    <div className="p-3.5 space-y-2">
                      <AnimatePresence initial={true}>
                        {order.items.map((item, itemIdx) => {
                          const checked = Boolean(item.checked);
                          return (
                            <motion.button
                              key={item.menuItemId}
                              layout
                              type="button"
                              data-testid={`kot-item-${order.id}-${item.menuItemId}`}
                              data-item-checked={checked ? 'true' : 'false'}
                              onClick={() => onToggleKotItem(order.id, item.menuItemId)}
                              initial={{ opacity: 0, x: -12, scale: 0.98 }}
                              animate={{ opacity: 1, x: 0, scale: 1 }}
                              exit={{
                                opacity: 0,
                                x: 16,
                                scale: 0.95,
                                height: 0,
                                marginTop: 0,
                                paddingTop: 0,
                                paddingBottom: 0,
                              }}
                              transition={{
                                duration: 0.2,
                                delay: Math.min(itemIdx * 0.035, 0.18),
                                ease: [0.22, 1, 0.36, 1],
                              }}
                              whileTap={{ scale: 0.985 }}
                              className={`w-full text-left flex items-start justify-between p-2.5 rounded-lg transition-all duration-200 cursor-pointer ${
                                checked
                                  ? 'bg-surface-container-lowest/90 opacity-75 ring-1 ring-tertiary/30'
                                  : isPrepared
                                    ? 'bg-surface-container/80 hover:bg-surface-container-high'
                                    : 'bg-surface-container hover:bg-surface-container-high'
                              }`}
                            >
                              <div className="flex items-start gap-2.5 min-w-0">
                                <span
                                  className={`w-5 h-5 rounded mt-0.5 flex items-center justify-center shrink-0 transition-colors duration-200 ${
                                    checked
                                      ? 'bg-tertiary-container text-on-tertiary-container'
                                      : 'bg-surface-container-high text-primary-container'
                                  }`}
                                >
                                  <AnimatePresence mode="wait" initial={false}>
                                    {checked && (
                                      <motion.span
                                        key="checked"
                                        initial={{ scale: 0.4, opacity: 0 }}
                                        animate={{ scale: 1, opacity: 1 }}
                                        exit={{ scale: 0.4, opacity: 0 }}
                                        transition={{ type: 'spring', stiffness: 450, damping: 24 }}
                                        className="material-symbols-outlined text-[15px] font-bold"
                                      >
                                        check
                                      </motion.span>
                                    )}
                                  </AnimatePresence>
                                </span>
                                <div className="flex flex-col min-w-0">
                                  <span
                                    className={`text-sm font-semibold transition-colors duration-200 ${
                                      checked
                                        ? 'line-through text-on-surface-variant'
                                        : 'text-on-surface'
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
                            </motion.button>
                          );
                        })}
                      </AnimatePresence>
                    </div>

                    {/* Card Action Buttons */}
                    {statusMeta.kdsActionLabel && (
                      <div className="px-3.5 pb-3.5 pt-1 flex gap-2 mt-auto">
                        <button
                          type="button"
                          disabled={isBusy}
                          onClick={() => void handleAdvance(order.id)}
                          className={`flex-1 h-11 rounded-lg text-sm font-bold flex items-center justify-center gap-2 transition-all duration-300 active:scale-[0.98] cursor-pointer disabled:opacity-50 ${
                            isGreenCta
                              ? 'bg-tertiary-container text-on-tertiary-container shadow-[0_0_16px_rgba(43,202,98,0.25)]'
                              : 'bg-primary-container hover:bg-primary text-on-primary-container shadow-[0_0_16px_rgba(245,158,11,0.2)]'
                          }`}
                        >
                          <span className="material-symbols-outlined text-[19px]">
                            {isBusy ? 'progress_activity' : statusMeta.kdsActionIcon}
                          </span>
                          <span>{isBusy ? 'Updating...' : statusMeta.kdsActionLabel}</span>
                        </button>
                      </div>
                    )}
                  </motion.article>
                );
              })}
            </AnimatePresence>
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
    </MotionConfig>
  );
};
