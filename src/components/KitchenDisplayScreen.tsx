import React, { useEffect, useMemo, useRef, useState } from 'react';
import { AnimatePresence, MotionConfig, motion } from 'motion/react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { ORDER_STATUS_META } from '../state/cafeStateMachines';
import { CafeOrder, InventoryIngredient, OrderStatus } from '../types/cafe';
import { deriveKotCardPhase, isKitchenActiveOrder } from '../utils/cafeLogic';

interface KitchenDisplayScreenProps {
  orders: CafeOrder[];
  inventory?: InventoryIngredient[];
  isConnected?: boolean;
  pendingOrderId?: string | null;
  onToggleKotItem: (orderId: string, menuItemId: string) => void;
  onCancelKotItem?: (orderId: string, menuItemId: string, reason?: string, quantity?: number) => Promise<any>;
  onAdvanceOrderStatus: (orderId: string) => void | Promise<void>;
  onRefresh?: () => void;
  onRequestReorder?: (ingredientId: string, note?: string) => Promise<void>;
  onNotify: (msg: string) => void;
}

type KotFilter = 'all' | 'dine-in' | 'takeaway' | 'priority';

function playKitchenChime() {
  if (typeof window === 'undefined') return;
  try {
    const AudioCtx =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    if (!AudioCtx) return;
    const ctx = new AudioCtx();
    const now = ctx.currentTime;

    const osc1 = ctx.createOscillator();
    const osc2 = ctx.createOscillator();
    const gainNode = ctx.createGain();

    osc1.type = 'sine';
    osc1.frequency.setValueAtTime(587.33, now);
    osc1.frequency.exponentialRampToValueAtTime(880, now + 0.15);

    osc2.type = 'triangle';
    osc2.frequency.setValueAtTime(880, now);
    osc2.frequency.exponentialRampToValueAtTime(1174.66, now + 0.15);

    gainNode.gain.setValueAtTime(0.2, now);
    gainNode.gain.exponentialRampToValueAtTime(0.001, now + 0.8);

    osc1.connect(gainNode);
    osc2.connect(gainNode);
    gainNode.connect(ctx.destination);

    osc1.start(now);
    osc2.start(now);
    osc1.stop(now + 0.8);
    osc2.stop(now + 0.8);
  } catch {
    // Non-fatal if audio context blocked before gesture
  }
}

const KotElapsedBadge: React.FC<{ baseMinutes: number; createdAt?: string }> = React.memo(
  ({ baseMinutes, createdAt }) => {
    const mountedAt = useRef(Date.now()).current;
    const [now, setNow] = useState(mountedAt);

    useEffect(() => {
      const interval = setInterval(() => {
        setNow(Date.now());
      }, 1000);
      return () => clearInterval(interval);
    }, []);

    const createdAtMs = createdAt ? Date.parse(createdAt) : Number.NaN;
    const totalSec = Number.isFinite(createdAtMs)
      ? Math.max(0, Math.floor((now - createdAtMs) / 1000))
      : Math.max(0, baseMinutes * 60 + Math.floor((now - mountedAt) / 1000));
    const min = Math.floor(totalSec / 60);
    const sec = totalSec % 60;
    return (
      <div className="flex items-center gap-1.5 text-on-surface shrink-0">
        <span className="material-symbols-outlined text-[20px] text-on-surface-variant">
          timer
        </span>
        <span className="text-lg font-bold tracking-tight tabular-nums">
          {String(min).padStart(2, '0')}:{String(sec).padStart(2, '0')}
        </span>
      </div>
    );
  }
);

KotElapsedBadge.displayName = 'KotElapsedBadge';

export const KitchenDisplayScreen: React.FC<KitchenDisplayScreenProps> = ({
  orders,
  inventory = [],
  isConnected = false,
  pendingOrderId = null,
  onToggleKotItem,
  onCancelKotItem,
  onAdvanceOrderStatus,
  onRefresh,
  onRequestReorder,
  onNotify,
}) => {
  const [filter, setFilter] = useState<KotFilter>('all');
  const [isMuted, setIsMuted] = useState(false);
  const [localPendingId, setLocalPendingId] = useState<string | null>(null);
  const [justPreparedIds, setJustPreparedIds] = useState<Set<string>>(() => new Set());
  const [stockModalOpen, setStockModalOpen] = useState(false);
  const [stockSearch, setStockSearch] = useState('');
  const [reorderNotes, setReorderNotes] = useState<Record<string, string>>({});
  const [requestingId, setRequestingId] = useState<string | null>(null);

  // State for cancelling an individual item from kitchen KOT
  const [cancelTarget, setCancelTarget] = useState<{ order: CafeOrder; item: CafeOrder['items'][number] } | null>(null);
  const [cancelQty, setCancelQty] = useState(1);
  const [cancelReason, setCancelReason] = useState('Out of Stock / Ingredient Unavailable');
  const [cancelCustomReason, setCancelCustomReason] = useState('');
  const [isCancelling, setIsCancelling] = useState(false);
  const prevStatusMapRef = useRef<Record<string, OrderStatus>>({});
  const prevOrderCountRef = useRef<number | null>(null);

  const lowStockCount = useMemo(
    () =>
      inventory.filter(
        (i) => i.status === 'Reorder Soon' || i.status === 'Critical' || i.reorderRequested
      ).length,
    [inventory]
  );

  const filteredInventory = useMemo(() => {
    const q = stockSearch.toLowerCase().trim();
    if (!q) return inventory;
    return inventory.filter(
      (item) => item.name.toLowerCase().includes(q) || item.supplier.toLowerCase().includes(q)
    );
  }, [inventory, stockSearch]);

  const handleRequestReorder = async (item: InventoryIngredient) => {
    if (!onRequestReorder || requestingId === item.id) return;
    setRequestingId(item.id);
    try {
      const note = reorderNotes[item.id] || 'Kitchen chef flagged item as low';
      await onRequestReorder(item.id, note);
      onNotify(`Reorder request sent to admin for ${item.name}!`);
    } catch {
      onNotify(`Failed to send reorder request for ${item.name}`);
    } finally {
      setRequestingId(null);
    }
  };

  useEffect(() => {
    const handleNewOrder = (e: Event) => {
      const customEvt = e as CustomEvent<{ order?: CafeOrder; orderId?: string }>;
      const order = customEvt.detail?.order;
      if (!isMuted) {
        playKitchenChime();
      }
      const ticketLabel = order?.kotNumber || (order?.id ? `#${order.id}` : 'ticket');
      const tableLabel = order?.tableNumber ? ` (Table ${order.tableNumber})` : '';
      onNotify(`🔔 New Kitchen Order ${ticketLabel}${tableLabel}!`);
    };

    window.addEventListener('cafe:order:new', handleNewOrder);
    return () => window.removeEventListener('cafe:order:new', handleNewOrder);
  }, [isMuted, onNotify]);

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

    if (newlyPrepared.length > 0 && !isMuted) {
      playKitchenChime();
    }

    const prevCount = prevOrderCountRef.current;
    if (prevCount !== null && orders.length > prevCount && !isMuted) {
      playKitchenChime();
    }
    prevOrderCountRef.current = orders.length;

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

  const activeKotOrders = orders.filter(isKitchenActiveOrder);
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
      // onNotify is called by the mutation handler
    } finally {
      setIsCancelling(false);
    }
  };

  return (
    <MotionConfig reducedMotion="user">
      <div className="flex flex-col w-full pb-6 space-y-4">
        {/* Live KOT Top Banner & Sound Controls */}
        <div className="w-full bg-surface-container rounded-3xl p-4 sm:p-5 border border-outline-variant/15 shadow-sm flex items-center justify-between gap-2">
          <div className="flex items-center gap-3">
            <div className="w-11 h-11 rounded-2xl bg-[#FF6422]/15 flex items-center justify-center text-[#FF6422] shrink-0">
              <span className="material-symbols-outlined text-[26px]">soup_kitchen</span>
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-lg sm:text-xl font-black text-on-surface tracking-tight">
                  Live Kitchen Orders
                </h1>
                <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full bg-surface-container-high text-on-surface-variant text-[11px] font-black">
                  <span className={`w-1.5 h-1.5 rounded-full ${isConnected ? 'bg-emerald-500 animate-pulse' : 'bg-outline'}`} />
                  {isConnected ? 'Connected' : 'Connecting'}
                </span>
              </div>
              <p className="text-xs text-on-surface-variant flex items-center gap-2 mt-0.5 tabular-nums">
                <span>
                  <strong className="text-[#FF6422]">{preparingCount}</strong> in preparation
                </span>
                <span>·</span>
                <span>
                  <strong className="text-emerald-400">{readyCount}</strong> ready
                </span>
              </p>
            </div>
          </div>

          <div className="flex items-center gap-1.5 shrink-0">
            {/* Kitchen Stock Alert & Reorder Button */}
            <button
              type="button"
              onClick={() => setStockModalOpen(true)}
              className="flex items-center gap-1.5 px-3.5 py-2 rounded-full bg-amber-500/15 hover:bg-amber-500/25 border border-amber-500/30 text-amber-300 text-xs font-bold transition-all active:scale-95 cursor-pointer shrink-0"
            >
              <span className="material-symbols-outlined text-[18px]">inventory_2</span>
              <span className="hidden sm:inline">Stock Alert</span>
              {lowStockCount > 0 && (
                <span className="px-1.5 py-0.2 rounded-full bg-amber-500 text-neutral-950 text-[10px] font-black">
                  {lowStockCount}
                </span>
              )}
            </button>

            <button
              type="button"
              aria-label={isMuted ? 'Unmute order audio alert' : 'Mute order audio alert'}
              onClick={() => {
                setIsMuted((m) => !m);
                onNotify(isMuted ? 'Order bell sound enabled' : 'Order bell sound muted');
              }}
              className={`w-10 h-10 rounded-full bg-surface-container hover:bg-surface-container-high border border-outline-variant/15 flex items-center justify-center transition-colors cursor-pointer ${
                isMuted ? 'text-red-400' : 'text-on-surface-variant hover:text-[#FF6422]'
              }`}
            >
              <span className="material-symbols-outlined text-[20px]">
                {isMuted ? 'volume_off' : 'volume_up'}
              </span>
            </button>
            <button
              type="button"
              aria-label="Refresh orders feed"
              onClick={() => {
                onRefresh?.();
                onNotify('Kitchen orders refreshed');
              }}
              className="w-10 h-10 rounded-full bg-surface-container hover:bg-surface-container-high border border-outline-variant/15 flex items-center justify-center text-on-surface-variant hover:text-[#FF6422] transition-colors cursor-pointer"
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
          </motion.div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4 items-start">
            <AnimatePresence mode="popLayout">
              {filteredOrders.map((order, cardIdx) => {
                const statusMeta = ORDER_STATUS_META[order.status];
                const isServed = order.status === 'served';
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
                    className={`w-full rounded-[1.75rem] overflow-hidden flex flex-col border font-sans transition-colors duration-300 ${
                      isPrepared
                        ? 'bg-tertiary/10 border-tertiary/35 shadow-[0_8px_24px_rgba(27,54,37,0.1)]'
                        : 'bg-surface-container border-outline-variant/70 shadow-[0_6px_20px_rgba(85,62,42,0.08)]'
                    }`}
                  >
                    <div className={`px-4 pt-4 pb-3 ${isPrepared ? 'bg-tertiary/10' : ''}`}>
                      <div className="flex items-start justify-between gap-3">
                        <span className="text-xl sm:text-2xl font-black tracking-tight text-on-surface truncate">
                          #{order.id}
                        </span>
                        <KotElapsedBadge
                          baseMinutes={order.elapsedMinutes}
                          createdAt={order.createdAt}
                        />
                      </div>
                      <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs sm:text-sm font-medium">
                        <span className="text-on-surface">
                          {order.serviceMode === 'dine-in'
                            ? order.tableNumber
                              ? `Table ${order.tableNumber}`
                              : 'Dine-In'
                            : order.serviceMode === 'delivery'
                              ? order.deliveryPartner || 'Delivery'
                              : 'Takeaway'}
                        </span>
                        <span aria-hidden="true" className="text-on-surface-variant">·</span>
                        <AnimatePresence mode="wait">
                          <motion.span
                            key={order.status}
                            data-testid={`kot-status-badge-${order.id}`}
                            initial={{ opacity: 0, y: -5 }}
                            animate={{ opacity: 1, y: 0 }}
                            exit={{ opacity: 0, y: 5 }}
                            transition={{ duration: 0.12 }}
                            className={
                              isPrepared
                                ? 'text-emerald-300'
                                : order.status === 'preparing'
                                  ? 'text-primary'
                                  : 'text-amber-400'
                            }
                          >
                            {isPrepared
                              ? 'Prepared'
                              : order.status === 'preparing'
                                ? 'Preparing'
                                : 'Pending'}
                          </motion.span>
                        </AnimatePresence>
                        <span aria-hidden="true" className="text-on-surface-variant">·</span>
                        <span
                          className={
                            order.paymentMode === 'cash' ||
                            order.paymentChannelLabel === 'Pay on Counter'
                              ? 'text-amber-400'
                              : 'text-emerald-400'
                          }
                        >
                          {order.paymentMode === 'cash' ||
                          order.paymentChannelLabel === 'Pay on Counter'
                            ? `Pay on Counter (₹${order.total})`
                            : 'Paid online'}
                        </span>
                      </div>
                    </div>
                    <div className="mx-4 border-t border-outline-variant/70" />

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
                    <div className="px-4 py-2 divide-y divide-outline-variant/30">
                      <AnimatePresence initial={true}>
                        {order.items.map((item, itemIdx) => {
                          const checked = Boolean(item.checked);
                          const isCancelled = item.status === 'cancelled';

                          if (isCancelled) {
                            return (
                              <div
                                key={`${item.menuItemId}-cancelled-${itemIdx}`}
                                className="w-full text-left flex items-start justify-between p-2.5 rounded-lg bg-error-container/20 border border-error/30 opacity-80 transition-all"
                              >
                                <div className="flex items-start gap-2.5 min-w-0">
                                  <span className="w-5 h-5 rounded mt-0.5 flex items-center justify-center shrink-0 bg-error/20 text-error">
                                    <span className="material-symbols-outlined text-[15px]">block</span>
                                  </span>
                                  <div className="flex flex-col min-w-0">
                                    <div className="flex items-center gap-1.5 flex-wrap">
                                      <span className="text-sm font-semibold line-through text-error">
                                        {item.quantity} × {item.name}
                                      </span>
                                      <span className="px-1.5 py-0.2 rounded text-[10px] font-black uppercase bg-error/20 text-error border border-error/30">
                                        Cancelled · ₹{item.refundAmount || item.price * item.quantity} Refunded
                                      </span>
                                    </div>
                                    <span className="text-[11px] text-error/80 mt-0.5">
                                      Reason: {item.cancelledReason || 'Cancelled in kitchen'}
                                    </span>
                                  </div>
                                </div>
                                <span className="text-[10px] px-2 py-0.5 rounded bg-error/15 text-error font-semibold shrink-0">
                                  Refunded
                                </span>
                              </div>
                            );
                          }

                          return (
                            <motion.button
                              key={item.menuItemId}
                              layout
                              type="button"
                              data-testid={`kot-item-${order.id}-${item.menuItemId}`}
                              data-item-checked={checked ? 'true' : 'false'}
                              aria-pressed={checked}
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
                              className={`w-full text-left flex items-start justify-between gap-3 py-2 rounded-lg transition-colors duration-200 cursor-pointer hover:bg-surface-container-high ${
                                checked ? 'opacity-65' : ''
                              }`}
                            >
                              <div className="min-w-0 flex-1">
                                <span
                                  className={`block text-base sm:text-lg font-bold leading-snug transition-colors duration-200 ${
                                    checked
                                      ? 'line-through text-on-surface-variant'
                                      : 'text-on-surface'
                                  }`}
                                >
                                  {checked && (
                                    <span className="material-symbols-outlined text-[16px] text-emerald-300 align-middle mr-1">
                                      check_circle
                                    </span>
                                  )}
                                  {item.quantity} × {item.name}
                                </span>
                                {item.note && (
                                  <span
                                    className={`block text-sm mt-0.5 ${
                                      checked ? 'text-on-surface-variant' : 'text-emerald-300'
                                    }`}
                                  >
                                    {item.note.replace(/,\s*/g, ' · ')}
                                  </span>
                                )}
                              </div>
                              <div className="flex items-center gap-1.5 shrink-0 ml-2">
                                <span className="text-sm text-on-surface-variant font-medium pt-0.5">
                                  {item.station}
                                </span>
                                {onCancelKotItem && !isServed && (
                                  <span
                                    role="button"
                                    title="Cancel this item and initiate refund"
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      setCancelTarget({ order, item });
                                      setCancelQty(item.quantity);
                                      setCancelReason('Out of Stock / Ingredient Unavailable');
                                      setCancelCustomReason('');
                                    }}
                                    className="w-7 h-7 rounded-md flex items-center justify-center text-on-surface-variant hover:text-error hover:bg-error/15 transition-all cursor-pointer"
                                  >
                                    <span className="material-symbols-outlined text-[16px]">cancel</span>
                                  </span>
                                )}
                              </div>
                            </motion.button>
                          );
                        })}
                      </AnimatePresence>
                    </div>

                    {/* Card Action Buttons */}
                    {statusMeta.kdsActionLabel && (
                      <div className="px-4 pb-4 pt-1 flex gap-2 mt-auto">
                        <button
                          type="button"
                          disabled={isBusy}
                          onClick={() => void handleAdvance(order.id)}
                          className="flex-1 min-h-12 rounded-xl font-sans text-base sm:text-lg font-bold flex items-center justify-center gap-2 transition-all duration-300 active:scale-[0.98] cursor-pointer disabled:opacity-50 text-white bg-[#FF6422] hover:bg-[#E55518] shadow-[0_4px_14px_rgba(255,100,34,0.35)]"
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

        {/* Kitchen Ingredient Low-Stock Alert & Quick Reorder Dialog */}
        <Dialog open={stockModalOpen} onOpenChange={setStockModalOpen}>
          <DialogContent className="bg-surface-container-low text-on-surface sm:max-w-xl max-h-[85vh] flex flex-col p-5">
            <DialogHeader className="pb-3 border-b border-outline-variant/20">
              <div className="flex items-center gap-2 text-amber-400">
                <span className="material-symbols-outlined text-[22px]">emergency</span>
                <DialogTitle className="text-base sm:text-lg font-bold text-on-surface">
                  Kitchen Stock Alert &amp; Quick Reorder
                </DialogTitle>
              </div>
              <DialogDescription className="text-xs text-on-surface-variant">
                Flag ingredients running low during service so management can arrange restocking immediately.
              </DialogDescription>
            </DialogHeader>

            {/* Quick Search Bar */}
            <div className="pt-3 pb-2">
              <div className="relative">
                <span className="material-symbols-outlined absolute left-3 top-1/2 -translate-y-1/2 text-outline text-[18px]">
                  search
                </span>
                <input
                  type="text"
                  value={stockSearch}
                  onChange={(e) => setStockSearch(e.target.value)}
                  placeholder="Search ingredients (Milk, Beans, Bread...)"
                  className="w-full pl-9 pr-3 py-2 bg-surface-container text-xs rounded-lg text-on-surface placeholder:text-outline focus:outline-none focus:ring-1 focus:ring-primary"
                />
              </div>
            </div>

            {/* Ingredients List */}
            <div className="flex-1 overflow-y-auto space-y-2.5 pr-1 py-1 divide-y divide-outline-variant/10">
              {filteredInventory.length === 0 ? (
                <div className="p-8 text-center text-xs text-on-surface-variant">
                  No matching ingredients found.
                </div>
              ) : (
                filteredInventory.map((item) => {
                  const isRequested = Boolean(item.reorderRequested);
                  const isCritical =
                    item.status === 'Critical' || item.quantity <= item.minThreshold;
                  const isBusy = requestingId === item.id;
                  return (
                    <div key={item.id} className="pt-2.5 flex flex-col gap-2">
                      <div className="flex items-center justify-between gap-2">
                        <div className="flex items-center gap-2.5 min-w-0">
                          <div className="w-8 h-8 rounded-lg bg-surface-container flex items-center justify-center text-primary shrink-0">
                            <span className="material-symbols-outlined text-[18px]">
                              {item.icon || 'inventory_2'}
                            </span>
                          </div>
                          <div className="min-w-0">
                            <div className="flex items-center gap-1.5 flex-wrap">
                              <span className="text-xs font-bold text-on-surface truncate">
                                {item.name}
                              </span>
                              <span
                                className={`px-1.5 py-0.5 rounded text-[10px] font-bold ${
                                  isCritical
                                    ? 'bg-error/20 text-error'
                                    : 'bg-surface-container-high text-on-surface-variant'
                                }`}
                              >
                                {item.quantity} {item.unit}
                              </span>
                              {isRequested && (
                                <span className="px-1.5 py-0.5 rounded text-[9px] font-black bg-amber-500/20 text-amber-400 border border-amber-500/30 flex items-center gap-0.5">
                                  <span className="material-symbols-outlined text-[11px]">
                                    check_circle
                                  </span>
                                  Reorder Flagged
                                </span>
                              )}
                            </div>
                            <p className="text-[11px] text-on-surface-variant truncate">
                              Min: {item.minThreshold} {item.unit} · Supplier: {item.supplier}
                            </p>
                          </div>
                        </div>

                        {/* Action Button */}
                        <button
                          type="button"
                          disabled={isRequested || isBusy}
                          onClick={() => void handleRequestReorder(item)}
                          className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all shrink-0 cursor-pointer ${
                            isRequested
                              ? 'bg-amber-500/15 text-amber-300 border border-amber-500/25 cursor-default'
                              : 'bg-primary text-on-primary hover:bg-primary-container shadow active:scale-95'
                          }`}
                        >
                          {isBusy ? 'Sending...' : isRequested ? 'Flagged ✓' : 'Flag Low / Reorder'}
                        </button>
                      </div>

                      {/* Quick Note Input if not yet flagged */}
                      {!isRequested && (
                        <div className="flex items-center gap-2 pl-10.5">
                          <input
                            type="text"
                            value={reorderNotes[item.id] || ''}
                            onChange={(e) =>
                              setReorderNotes({ ...reorderNotes, [item.id]: e.target.value })
                            }
                            placeholder="Add note (e.g. Only 1 carton left in chiller)"
                            className="w-full bg-surface-container-lowest px-2.5 py-1 text-[11px] rounded text-on-surface placeholder:text-outline-variant focus:outline-none focus:ring-1 focus:ring-primary"
                          />
                        </div>
                      )}
                    </div>
                  );
                })
              )}
            </div>
          </DialogContent>
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
      </div>
    </MotionConfig>
  );
};
