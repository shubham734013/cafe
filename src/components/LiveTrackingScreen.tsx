import React, { useEffect, useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { ORDER_STATUS_META } from '../state/cafeStateMachines';
import { CafeOrder } from '../types/cafe';
import { CafeImage } from './CafeImage';

interface LiveTrackingScreenProps {
  initialView?: 'track' | 'orders';
  activeOrder?: CafeOrder;
  allOrders: CafeOrder[];
  availableBeans: number;
  onSelectOrder: (orderId: string) => void;
  onDownloadInvoicePdf?: (order: CafeOrder) => void;
  onStartPayment?: (orderId: string) => Promise<void>;
  onRefreshPayment?: (orderId: string) => Promise<void>;
  onSubmitFeedback?: (
    orderId: string,
    rating: number,
    tags: string[],
    comment: string
  ) => Promise<{ pointsAwarded: number }>;
  onPrintThermalReceipt?: (order: CafeOrder) => void;
  onNotify: (msg: string) => void;
  onBackToMenu: () => void;
}

const STEPS: { key: CafeOrder['status']; label: string; icon: string }[] = [
  { key: 'placed', label: 'Placed', icon: 'check' },
  { key: 'preparing', label: 'Preparing', icon: 'skillet' },
  { key: 'ready', label: 'Ready', icon: 'notifications_active' },
  { key: 'served', label: 'Served', icon: 'table_restaurant' },
];

export const LiveTrackingScreen: React.FC<LiveTrackingScreenProps> = ({
  initialView = 'track',
  activeOrder,
  allOrders,
  availableBeans,
  onSelectOrder,
  onDownloadInvoicePdf,
  onStartPayment,
  onRefreshPayment,
  onSubmitFeedback,
  onPrintThermalReceipt,
  onNotify,
  onBackToMenu,
}) => {
  const [invoiceOpen, setInvoiceOpen] = useState(false);
  const [paymentBusy, setPaymentBusy] = useState(false);
  const [paymentError, setPaymentError] = useState('');
  const [viewMode, setViewMode] = useState<'track' | 'orders'>(initialView);
  const [orderTab, setOrderTab] = useState<'all' | 'ongoing' | 'completed'>('all');
  const [detailsOpen, setDetailsOpen] = useState(false);

  // Feedback State
  const [rating, setRating] = useState<number>(activeOrder?.rating || 5);
  const [hoverRating, setHoverRating] = useState<number | null>(null);
  const [selectedTags, setSelectedTags] = useState<string[]>(activeOrder?.feedbackTags || []);
  const [feedbackComment, setFeedbackComment] = useState('');
  const [isSubmittingFeedback, setIsSubmittingFeedback] = useState(false);
  const [feedbackSubmitted, setFeedbackSubmitted] = useState(Boolean(activeOrder?.rating));
  const [beansEarned, setBeansEarned] = useState(activeOrder?.loyaltyPointsAwarded ?? 0);

  useEffect(() => {
    if (activeOrder?.rating) {
      setRating(activeOrder.rating);
      setFeedbackSubmitted(true);
    } else {
      setFeedbackSubmitted(false);
    }
    setBeansEarned(activeOrder?.loyaltyPointsAwarded ?? 0);
  }, [activeOrder?.id, activeOrder?.rating, activeOrder?.loyaltyPointsAwarded]);

  useEffect(() => {
    if (
      !activeOrder ||
      activeOrder.paymentProvider !== 'upi-gateway' ||
      activeOrder.paymentStatus !== 'pending' ||
      !onRefreshPayment
    ) {
      return;
    }
    const timer = window.setInterval(() => {
      void onRefreshPayment(activeOrder.id).catch((error: unknown) => {
        setPaymentError(
          error instanceof Error ? error.message : 'Could not refresh payment status.'
        );
      });
    }, 15_000);
    return () => window.clearInterval(timer);
  }, [activeOrder?.id, activeOrder?.paymentProvider, activeOrder?.paymentStatus, onRefreshPayment]);

  if (!activeOrder) {
    if (allOrders.length > 0) {
      // If user has orders but none actively selected, show My Orders list (Panel 10)
      return (
        <div className="mx-auto flex w-full max-w-xl flex-col gap-4 px-3 py-2 pb-28 text-[#1F1610]">
          <div className="flex items-center justify-between pb-1">
            <button
              type="button"
              onClick={onBackToMenu}
              aria-label="Back"
              className="w-9 h-9 rounded-full bg-white border border-[#EAE2D7] flex items-center justify-center text-[#1F1610] shadow-xs hover:bg-[#F5EFE8] transition-colors cursor-pointer"
            >
              <span className="material-symbols-outlined text-[20px]">arrow_back</span>
            </button>
            <h1 className="text-base sm:text-lg font-bold text-[#1F1610] tracking-tight font-serif">
              My Orders
            </h1>
            <div className="w-9" />
          </div>

          {/* Orders Filter Tabs */}
          <div className="flex items-center gap-2">
            {(['all', 'ongoing', 'completed'] as const).map((tab) => (
              <button
                key={tab}
                type="button"
                onClick={() => setOrderTab(tab)}
                className={`px-4 py-2 rounded-full text-xs font-bold transition-all cursor-pointer ${
                  orderTab === tab
                    ? 'bg-[#382319] text-white shadow-xs'
                    : 'bg-white text-[#7A7067] border border-[#EAE2D7] hover:bg-[#FAF7F2]'
                }`}
              >
                {tab.charAt(0).toUpperCase() + tab.slice(1)}
              </button>
            ))}
          </div>

          {/* Order Cards */}
          <div className="space-y-3 pt-1">
            {allOrders
              .filter((o) => {
                if (orderTab === 'ongoing') return o.status !== 'served' && o.status !== 'cancelled';
                if (orderTab === 'completed') return o.status === 'served';
                return true;
              })
              .map((order) => (
                <div
                  key={order.id}
                  onClick={() => {
                    onSelectOrder(order.id);
                    setViewMode('track');
                  }}
                  className="p-4 rounded-2xl bg-white border border-[#EAE2D7] shadow-xs cursor-pointer hover:shadow-md transition-all space-y-2.5"
                >
                  <div className="flex items-center justify-between">
                    <span className="font-bold text-xs sm:text-sm text-[#1F1610]">
                      #TSC-{order.kotNumber || order.id.slice(0, 4)}
                    </span>
                    <span className={`px-2.5 py-0.5 rounded-full text-[10px] font-bold ${
                      order.status === 'served'
                        ? 'bg-emerald-50 text-emerald-800 border border-emerald-200'
                        : 'bg-amber-50 text-amber-800 border border-amber-200'
                    }`}>
                      {order.status === 'served' ? 'Delivered' : 'Preparing'} • ₹{order.total}
                    </span>
                  </div>

                  <p className="text-xs text-[#7A7067]">
                    {order.items.length} {order.items.length === 1 ? 'item' : 'items'}
                  </p>

                  <div className="flex items-center justify-between pt-1">
                    <div className="flex items-center gap-2 overflow-hidden">
                      {order.items.slice(0, 4).map((item, idx) => (
                        <div
                          key={`${item.menuItemId}-${idx}`}
                          className="w-10 h-10 rounded-xl overflow-hidden bg-[#FAF7F2] border border-[#EAE2D7] shrink-0"
                        >
                          <CafeImage
                            src={item.imageUrl}
                            alt={item.name}
                            className="w-full h-full object-cover"
                            fallbackIcon="restaurant"
                          />
                        </div>
                      ))}
                    </div>
                    <span className="material-symbols-outlined text-[20px] text-[#8C7E74]">
                      chevron_right
                    </span>
                  </div>
                </div>
              ))}
          </div>
        </div>
      );
    }

    return (
      <div className="flex flex-col items-center justify-center py-20 px-4 text-center max-w-sm mx-auto">
        <div className="w-20 h-20 rounded-full bg-white border border-[#EAE2D7] flex items-center justify-center text-[#382319] mb-4 shadow-xs">
          <span className="material-symbols-outlined text-[40px]">receipt_long</span>
        </div>
        <h2 className="text-xl font-bold text-[#1F1610] tracking-tight font-serif">
          No Active Orders
        </h2>
        <p className="text-xs text-[#7A7067] mt-1.5 leading-relaxed">
          You don&apos;t have any active orders right now. Explore our delicious menu and place your order!
        </p>
        <button
          type="button"
          onClick={onBackToMenu}
          className="mt-5 px-6 py-3 rounded-full bg-[#382319] hover:bg-[#2B1B13] text-white font-bold text-xs shadow-xs transition-all cursor-pointer inline-flex items-center gap-2"
        >
          <span className="material-symbols-outlined text-[16px]">restaurant_menu</span>
          <span>Explore Menu</span>
        </button>
      </div>
    );
  }

  const statusMeta = ORDER_STATUS_META[activeOrder.status];
  const currentIdx = statusMeta.stepIndex;
  const progressPercent = statusMeta.progressPercent;
  const statusMessage = statusMeta.trackingMessage;

  if (viewMode === 'orders') {
    return (
      <div className="mx-auto flex w-full max-w-xl flex-col gap-4 px-3 py-2 pb-28 text-[#1F1610]">
        <div className="flex items-center justify-between pb-1">
          <button
            type="button"
            onClick={() => setViewMode('track')}
            aria-label="Back"
            className="w-9 h-9 rounded-full bg-white border border-[#EAE2D7] flex items-center justify-center text-[#1F1610] shadow-xs hover:bg-[#F5EFE8] transition-colors cursor-pointer"
          >
            <span className="material-symbols-outlined text-[20px]">arrow_back</span>
          </button>
          <h1 className="text-base sm:text-lg font-bold text-[#1F1610] tracking-tight font-serif">
            My Orders
          </h1>
          <div className="w-9" />
        </div>

        {/* Orders Filter Tabs */}
        <div className="flex items-center gap-2">
          {(['all', 'ongoing', 'completed'] as const).map((tab) => (
            <button
              key={tab}
              type="button"
              onClick={() => setOrderTab(tab)}
              className={`px-4 py-2 rounded-full text-xs font-bold transition-all cursor-pointer ${
                orderTab === tab
                  ? 'bg-[#382319] text-white shadow-xs'
                  : 'bg-white text-[#7A7067] border border-[#EAE2D7] hover:bg-[#FAF7F2]'
              }`}
            >
              {tab.charAt(0).toUpperCase() + tab.slice(1)}
            </button>
          ))}
        </div>

        {/* Order Cards */}
        <div className="space-y-3 pt-1">
          {allOrders
            .filter((o) => {
              if (orderTab === 'ongoing') return o.status !== 'served' && o.status !== 'cancelled';
              if (orderTab === 'completed') return o.status === 'served';
              return true;
            })
            .map((order) => (
              <div
                key={order.id}
                onClick={() => {
                  onSelectOrder(order.id);
                  setViewMode('track');
                }}
                className="p-4 rounded-2xl bg-white border border-[#EAE2D7] shadow-xs cursor-pointer hover:shadow-md transition-all space-y-2.5"
              >
                <div className="flex items-center justify-between">
                  <span className="font-bold text-xs sm:text-sm text-[#1F1610]">
                    #TSC-{order.kotNumber || order.id.slice(0, 4)}
                  </span>
                  <span className={`px-2.5 py-0.5 rounded-full text-[10px] font-bold ${
                    order.status === 'served'
                      ? 'bg-emerald-50 text-emerald-800 border border-emerald-200'
                      : 'bg-amber-50 text-amber-800 border border-amber-200'
                  }`}>
                    {order.status === 'served' ? 'Delivered' : 'Preparing'} • ₹{order.total}
                  </span>
                </div>

                <p className="text-xs text-[#7A7067]">
                  {order.items.length} {order.items.length === 1 ? 'item' : 'items'}
                </p>

                <div className="flex items-center justify-between pt-1">
                  <div className="flex items-center gap-2 overflow-hidden">
                    {order.items.slice(0, 4).map((item, idx) => (
                      <div
                        key={`${item.menuItemId}-${idx}`}
                        className="w-10 h-10 rounded-xl overflow-hidden bg-[#FAF7F2] border border-[#EAE2D7] shrink-0"
                      >
                        <CafeImage
                          src={item.imageUrl}
                          alt={item.name}
                          className="w-full h-full object-cover"
                          fallbackIcon="restaurant"
                        />
                      </div>
                    ))}
                  </div>
                  <span className="material-symbols-outlined text-[20px] text-[#8C7E74]">
                    chevron_right
                  </span>
                </div>
              </div>
            ))}
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto flex w-full max-w-xl flex-col gap-4 px-3 py-2 pb-28 text-[#1F1610]">
      {/* Top Header Bar (Panel 9) */}
      <div className="flex items-center justify-between pb-1">
        <button
          type="button"
          onClick={() => {
            if (allOrders.length > 1) setViewMode('orders');
            else onBackToMenu();
          }}
          aria-label="Back"
          className="w-9 h-9 rounded-full bg-white border border-[#EAE2D7] flex items-center justify-center text-[#1F1610] shadow-xs hover:bg-[#F5EFE8] transition-colors cursor-pointer shrink-0"
        >
          <span className="material-symbols-outlined text-[20px]">arrow_back</span>
        </button>

        <h1 className="text-base sm:text-lg font-bold text-[#1F1610] tracking-tight font-serif">
          Track Order
        </h1>

        <button
          type="button"
          aria-label="Help and Support"
          onClick={() => onNotify('Captain notified! Call steward or support: +91 98765 43210')}
          className="w-9 h-9 rounded-full bg-white border border-[#EAE2D7] flex items-center justify-center text-[#1F1610] shadow-xs hover:bg-[#F5EFE8] transition-colors cursor-pointer shrink-0"
        >
          <span className="material-symbols-outlined text-[20px]">headset_mic</span>
        </button>
      </div>

      {allOrders.length > 1 && (
        <div className="flex items-center justify-between px-1">
          <span className="text-xs text-[#7A7067]">
            Order #{activeOrder.kotNumber || activeOrder.id.slice(0, 4)}
          </span>
          <button
            type="button"
            onClick={() => setViewMode('orders')}
            className="text-xs font-bold text-[#C67C4E] hover:underline cursor-pointer"
          >
            All Orders ({allOrders.length})
          </button>
        </div>
      )}

      {/* Circular Progress Arc Gauge with Rider Illustration (Panel 9) */}
      <div className="rounded-3xl bg-white border border-[#EAE2D7] p-5 shadow-xs flex flex-col items-center justify-center text-center">
        <div className="relative w-48 h-28 flex items-center justify-center overflow-hidden">
          <svg className="w-48 h-48 -rotate-90" viewBox="0 0 100 100">
            <circle
              cx="50"
              cy="50"
              r="40"
              fill="none"
              stroke="#F5EFE8"
              strokeWidth="7"
              strokeDasharray="125 125"
            />
            <circle
              cx="50"
              cy="50"
              r="40"
              fill="none"
              stroke="#C67C4E"
              strokeWidth="7"
              strokeDasharray="125 125"
              strokeDashoffset={125 - (progressPercent / 100) * 125}
              strokeLinecap="round"
              className="transition-all duration-700"
            />
          </svg>
          <div className="absolute bottom-2 flex flex-col items-center">
            <div className="w-12 h-12 rounded-full bg-[#FAF7F2] border border-[#EAE2D7] flex items-center justify-center text-[#382319] shadow-xs">
              <span className="material-symbols-outlined text-[26px]">two_wheeler</span>
            </div>
          </div>
        </div>

        <h2 className="font-serif font-black text-xl text-[#1F1610] mt-3">
          {activeOrder.status === 'placed'
            ? 'Order Confirmed'
            : activeOrder.status === 'preparing'
              ? 'Preparing Your Order'
              : activeOrder.status === 'ready'
                ? 'Out for Delivery'
                : 'Order Delivered'}
        </h2>
        <p className="text-xs text-[#7A7067] mt-0.5">
          {statusMessage || 'Your food is being freshly prepared.'}
        </p>
      </div>

      {/* 4-Step Vertical Timeline (Panel 9) */}
      <div className="rounded-2xl bg-white border border-[#EAE2D7] p-5 shadow-xs space-y-4">
        {[
          {
            title: 'Order Confirmed',
            sub: activeOrder.createdAtLabel || 'Today, 9:41 AM',
            done: currentIdx >= 0,
            active: currentIdx === 0,
          },
          {
            title: 'Preparing',
            sub: 'Kitchen is preparing your order.',
            done: currentIdx >= 1,
            active: currentIdx === 1,
          },
          {
            title: 'Out for Delivery',
            sub: 'On the way to your location.',
            done: currentIdx >= 2,
            active: currentIdx === 2,
          },
          {
            title: 'Delivered',
            sub: 'Enjoy your meal!',
            done: currentIdx >= 3 || activeOrder.status === 'served',
            active: currentIdx === 3,
          },
        ].map((step, idx, arr) => (
          <div key={step.title} className="flex items-start gap-3 relative">
            {idx < arr.length - 1 && (
              <div
                className={`absolute left-3 top-6 bottom-0 w-0.5 -ml-px ${
                  step.done ? 'bg-[#382319]' : 'bg-[#EAE2D7]'
                }`}
              />
            )}
            <div
              className={`w-6 h-6 rounded-full flex items-center justify-center text-xs shrink-0 z-10 transition-colors ${
                step.done
                  ? 'bg-[#382319] text-white'
                  : step.active
                    ? 'bg-[#382319] text-white ring-4 ring-[#382319]/15'
                    : 'bg-[#F5EFE8] text-[#8C7E74] border border-[#EAE2D7]'
              }`}
            >
              {step.done ? '✓' : idx + 1}
            </div>
            <div className="flex-1 pb-1">
              <p className="font-bold text-xs sm:text-sm text-[#1F1610]">{step.title}</p>
              <p className="text-[11px] text-[#7A7067] mt-0.5">{step.sub}</p>
            </div>
          </div>
        ))}
      </div>

      {/* Order Details Expandable Card (Panel 9) */}
      <div className="rounded-2xl bg-white border border-[#EAE2D7] p-4 shadow-xs space-y-3">
        <button
          type="button"
          onClick={() => setDetailsOpen(!detailsOpen)}
          className="w-full flex items-center justify-between text-left cursor-pointer"
        >
          <div className="flex items-center gap-2">
            <span className="material-symbols-outlined text-[20px] text-[#382319]">
              receipt_long
            </span>
            <span className="text-xs sm:text-sm font-bold text-[#1F1610]">
              Order Details (#{activeOrder.kotNumber})
            </span>
          </div>
          <span className="material-symbols-outlined text-[18px] text-[#8C7E74]">
            {detailsOpen ? 'expand_less' : 'chevron_right'}
          </span>
        </button>

        {detailsOpen && (
          <div className="pt-2 border-t border-[#F5EFE8] space-y-2.5">
            <div className="space-y-2">
              {activeOrder.items.map((item) => (
                <div
                  key={item.menuItemId}
                  className="flex items-center justify-between text-xs"
                >
                  <span className="text-[#1F1610]">
                    {item.quantity}x {item.name}
                  </span>
                  <span className="font-bold text-[#1F1610]">
                    ₹{item.price * item.quantity}
                  </span>
                </div>
              ))}
            </div>

            <div className="border-t border-[#F5EFE8] pt-2 flex justify-between text-xs font-bold text-[#1F1610]">
              <span>Total Paid</span>
              <span>₹{activeOrder.total}</span>
            </div>

            <div className="flex items-center gap-2 pt-1">
              <button
                type="button"
                onClick={() => setInvoiceOpen(true)}
                className="flex-1 py-2 rounded-xl bg-[#FAF7F2] border border-[#EAE2D7] text-xs font-bold text-[#1F1610] hover:bg-[#F5EFE8] cursor-pointer"
              >
                View Invoice
              </button>
              {onPrintThermalReceipt && (
                <button
                  type="button"
                  onClick={() => onPrintThermalReceipt(activeOrder)}
                  className="flex-1 py-2 rounded-xl bg-[#FAF7F2] border border-[#EAE2D7] text-xs font-bold text-[#1F1610] hover:bg-[#F5EFE8] cursor-pointer"
                >
                  Thermal Receipt
                </button>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Payment Confirmed Banner */}
      {activeOrder.paymentStatus === 'paid' && (
        <div className="p-4 rounded-3xl bg-emerald-500/10 border border-emerald-500/30 shadow-md flex flex-col sm:flex-row sm:items-center justify-between gap-3 animate-fade-in">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-emerald-500/20 text-emerald-400 flex items-center justify-center shrink-0">
              <span className="material-symbols-outlined text-[22px]">check_circle</span>
            </div>
            <div>
              <h3 className="text-xs sm:text-sm font-bold text-on-surface">
                Payment Confirmed · ₹{activeOrder.total} Paid
              </h3>
              <p className="text-[11px] text-on-surface-variant mt-0.5">
                Your payment is verified and your order is active in the kitchen.
              </p>
            </div>
          </div>
          {onBackToMenu && (
            <button
              type="button"
              onClick={onBackToMenu}
              className="px-5 py-2.5 rounded-full bg-[#FF6422] hover:bg-[#E55518] text-white text-xs font-black shadow-md transition-all active:scale-95 cursor-pointer inline-flex items-center justify-center gap-1.5 shrink-0"
            >
              <span className="material-symbols-outlined text-[16px]">restaurant_menu</span>
              <span>Order More</span>
            </button>
          )}
        </div>
      )}

      {/* Online UPI Awaiting Payment Action Banner */}
      {activeOrder.paymentMode === 'upi' && activeOrder.paymentStatus !== 'paid' && (
        <div className="p-4 rounded-3xl bg-blue-500/10 border border-blue-500/30 shadow-md flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-blue-500/20 text-blue-400 flex items-center justify-center shrink-0">
              <span className="material-symbols-outlined text-[22px]">hourglass_top</span>
            </div>
            <div>
              <h3 className="text-xs sm:text-sm font-bold text-on-surface">
                Awaiting UPI Payment Confirmation
              </h3>
              <p className="text-[11px] text-on-surface-variant mt-0.5">
                Kitchen prep starts once payment of ₹{activeOrder.total} is verified.
              </p>
            </div>
          </div>
          {onStartPayment && (
            <button
              type="button"
              disabled={paymentBusy}
              onClick={() => {
                setPaymentBusy(true);
                setPaymentError('');
                void onStartPayment(activeOrder.id)
                  .catch((err: unknown) =>
                    setPaymentError(
                      err instanceof Error ? err.message : 'Could not launch payment.'
                    )
                  )
                  .finally(() => setPaymentBusy(false));
              }}
              className="px-5 py-2.5 rounded-full bg-[#FF6422] hover:bg-[#E55518] text-white text-xs font-black shadow-md transition-all active:scale-95 cursor-pointer disabled:opacity-50 inline-flex items-center justify-center gap-1.5 shrink-0"
            >
              <span className="material-symbols-outlined text-[16px]">bolt</span>
              <span>{paymentBusy ? 'Connecting...' : `Pay ₹${activeOrder.total} via UPI`}</span>
            </button>
          )}
        </div>
      )}

      {/* Pay on Counter Banner */}
      {(activeOrder.paymentMode === 'cash' ||
        activeOrder.paymentChannelLabel === 'Pay on Counter') &&
        activeOrder.paymentStatus !== 'paid' && (
          <div className="p-4 rounded-3xl bg-amber-500/10 border border-amber-500/30 shadow-sm flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-amber-500/20 text-amber-500 flex items-center justify-center shrink-0">
              <span className="material-symbols-outlined text-[22px]">storefront</span>
            </div>
            <div className="flex-1">
              <h3 className="text-xs sm:text-sm font-bold text-on-surface">
                Order Sent to Kitchen · Pay at Counter
              </h3>
              <p className="text-[11px] text-on-surface-variant mt-0.5">
                Please settle ₹{activeOrder.total} at the counter upon order pickup or table service.
              </p>
            </div>
          </div>
        )}

      {/* Ordered Items List */}
      <div className="p-4 rounded-3xl bg-surface-container border border-outline-variant/15 shadow-sm space-y-3">
        <div className="flex items-center justify-between pb-2 border-b border-outline-variant/15">
          <div className="flex items-center gap-2">
            <span className="material-symbols-outlined text-[20px] text-[#FF6422]">
              restaurant_menu
            </span>
            <h2 className="text-xs font-extrabold text-on-surface tracking-tight uppercase">
              Items in Order ({activeOrder.items.length})
            </h2>
          </div>
          <span className="text-[11px] font-bold text-on-surface-variant bg-surface-container-high px-2.5 py-0.5 rounded-full">
            Order #{activeOrder.kotNumber}
          </span>
        </div>

        <div className="space-y-2.5">
          {activeOrder.items.map((item) => (
            <div
              key={item.menuItemId}
              className="flex items-center justify-between gap-3 p-2.5 rounded-2xl bg-surface hover:bg-surface-container-high transition-colors"
            >
              <div className="flex items-center gap-3 min-w-0">
                <div className="w-12 h-12 rounded-full overflow-hidden shrink-0 shadow-md ring-2 ring-outline-variant/10">
                  <CafeImage
                    src={item.imageUrl}
                    alt={item.name}
                    className="w-full h-full object-cover"
                    fallbackIcon="restaurant"
                  />
                </div>
                <div className="min-w-0">
                  <h3 className="text-xs sm:text-sm font-extrabold text-on-surface truncate">
                    {item.name}
                  </h3>
                  <p className="text-[11px] text-on-surface-variant truncate">
                    Qty: {item.quantity} {item.note ? `· ${item.note}` : ''}
                  </p>
                </div>
              </div>
              <span className="text-xs sm:text-sm font-black text-[#FF6422] shrink-0 tabular-nums">
                ₹{item.price * item.quantity}
              </span>
            </div>
          ))}
        </div>

        {/* Bill Summary Breakdown */}
        <div className="pt-2 border-t border-outline-variant/15 space-y-1.5">
          <div className="flex justify-between text-xs text-on-surface-variant">
            <span>Item Subtotal</span>
            <span className="font-bold text-on-surface tabular-nums">₹{activeOrder.subtotal}</span>
          </div>
          {activeOrder.discount > 0 && (
            <div className="flex justify-between text-xs text-emerald-500 font-bold">
              <span>Promo Discount</span>
              <span className="tabular-nums">-₹{activeOrder.discount.toFixed(2)}</span>
            </div>
          )}
          <div className="flex justify-between text-[11px] text-on-surface-variant">
            <span>Taxes &amp; GST</span>
            <span className="tabular-nums">₹{activeOrder.tax.toFixed(2)}</span>
          </div>
          <div className="flex justify-between items-center pt-2 border-t border-outline-variant/15">
            <span className="text-sm font-black text-on-surface">Total Paid</span>
            <span className="text-xl font-black text-[#FF6422] tabular-nums">
              ₹{activeOrder.total}
            </span>
          </div>
        </div>
      </div>

      {paymentError && (
        <p className="text-xs text-red-400 bg-red-950/40 p-3 rounded-2xl">{paymentError}</p>
      )}

      {/* Action Buttons: Invoice & Help & Order More */}
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 pt-1">
        <button
          type="button"
          onClick={() => setInvoiceOpen(true)}
          className="py-3 px-4 rounded-full bg-surface-container hover:bg-surface-container-high border border-outline-variant/20 text-xs font-bold text-on-surface flex items-center justify-center gap-1.5 shadow-sm transition-all cursor-pointer active:scale-95"
        >
          <span className="material-symbols-outlined text-[18px]">receipt_long</span>
          <span>View Invoice</span>
        </button>

        <button
          type="button"
          onClick={() => onNotify('Captain notified! Our team will assist your table shortly.')}
          className="py-3 px-4 rounded-full bg-surface-container hover:bg-surface-container-high border border-outline-variant/20 text-xs font-bold text-on-surface flex items-center justify-center gap-1.5 shadow-sm transition-all cursor-pointer active:scale-95"
        >
          <span className="material-symbols-outlined text-[18px]">support_agent</span>
          <span>Call Steward</span>
        </button>

        {onBackToMenu && (
          <button
            type="button"
            onClick={onBackToMenu}
            className="col-span-2 sm:col-span-1 py-3 px-4 rounded-full bg-[#FF6422] hover:bg-[#E55518] text-white text-xs font-bold flex items-center justify-center gap-1.5 shadow-sm transition-all cursor-pointer active:scale-95"
          >
            <span className="material-symbols-outlined text-[18px]">restaurant_menu</span>
            <span>Order More</span>
          </button>
        )}
      </div>

      {/* Star Rating & Review Experience (Active once order is served) */}
      {activeOrder.status === 'served' && (
        <div className="p-5 rounded-3xl bg-surface-container border border-outline-variant/15 shadow-sm space-y-3">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-xs font-extrabold uppercase tracking-wider text-on-surface">
                How Was Your Food?
              </h3>
              <p className="mt-1 flex flex-wrap items-center gap-1.5 text-[11px] text-on-surface-variant">
                <span>Rate this order to earn</span>
                <span className="rounded-full bg-[#FF6422]/10 px-2 py-0.5 font-semibold text-[#C84B17]">
                  +25 Beans
                </span>
                <span>· 2 Beans = ₹1 off a future order</span>
              </p>
            </div>
            {feedbackSubmitted && (
              <span className="px-2.5 py-0.5 rounded-full bg-emerald-500/20 text-emerald-500 text-[10px] font-bold">
                Rated ✓
              </span>
            )}
          </div>

          {feedbackSubmitted && (
            <div
              role="status"
              className="rounded-xl border border-emerald-500/20 bg-emerald-500/10 px-3 py-2.5 text-xs text-on-surface"
            >
              <p className="font-bold text-emerald-600">
                {beansEarned > 0
                  ? `You earned ${beansEarned} Beans for this review.`
                  : 'Beans are awarded once per order.'}
              </p>
              <p className="mt-1 text-on-surface-variant">
                Available balance: <strong>{availableBeans} Beans</strong>. Redeem at checkout
                (up to 50% of your subtotal).
              </p>
            </div>
          )}

          {/* Star selector */}
          <div className="flex items-center gap-2 py-1 justify-center">
            {[1, 2, 3, 4, 5].map((star) => (
              <button
                key={star}
                type="button"
                onClick={() => setRating(star)}
                onMouseEnter={() => setHoverRating(star)}
                onMouseLeave={() => setHoverRating(null)}
                className="p-1 cursor-pointer transition-transform hover:scale-125"
              >
                <span
                  className={`material-symbols-outlined text-[32px] transition-colors ${
                    star <= (hoverRating ?? rating)
                      ? 'text-amber-400 icon-filled'
                      : 'text-outline-variant'
                  }`}
                >
                  star
                </span>
              </button>
            ))}
          </div>

          {/* Feedback tags */}
          <div className="flex items-center gap-1.5 flex-wrap justify-center">
            {['Delicious Taste', 'Fast Prep', 'Perfect Spice', 'Great Packaging', 'Polite Staff'].map(
              (tag) => {
                const isSelected = selectedTags.includes(tag);
                return (
                  <button
                    key={tag}
                    type="button"
                    onClick={() =>
                      setSelectedTags((prev) =>
                        prev.includes(tag) ? prev.filter((t) => t !== tag) : [...prev, tag]
                      )
                    }
                    className={`px-3 py-1 rounded-full text-[11px] font-bold transition-all cursor-pointer ${
                      isSelected
                        ? 'bg-[#FF6422] text-white shadow-sm'
                        : 'bg-surface text-on-surface-variant hover:text-on-surface border border-outline-variant/20'
                    }`}
                  >
                    {tag}
                  </button>
                );
              }
            )}
          </div>

          <input
            type="text"
            value={feedbackComment}
            onChange={(e) => setFeedbackComment(e.target.value)}
            placeholder="Share any special compliments or notes..."
            className="w-full px-3.5 py-2.5 bg-surface text-xs rounded-full border border-outline-variant/20 text-on-surface placeholder:text-outline focus:outline-none focus:ring-1 focus:ring-[#FF6422]"
          />

          <button
            type="button"
            disabled={isSubmittingFeedback}
            onClick={async () => {
              if (!onSubmitFeedback) return;
              setIsSubmittingFeedback(true);
              try {
                const result = await onSubmitFeedback(
                  activeOrder.id,
                  rating,
                  selectedTags,
                  feedbackComment
                );
                setFeedbackSubmitted(true);
                setBeansEarned(result.pointsAwarded || activeOrder.loyaltyPointsAwarded || 0);
                onNotify(
                  result.pointsAwarded > 0
                    ? `Thank you! ${result.pointsAwarded} Beans added to your account.`
                    : 'Your rating was updated. Beans are awarded once per order.'
                );
              } catch (e) {
                onNotify(e instanceof Error ? e.message : 'Could not submit review');
              } finally {
                setIsSubmittingFeedback(false);
              }
            }}
            className="w-full py-3 rounded-full bg-[#FF6422] hover:bg-[#E55518] text-white text-xs font-black shadow-md active:scale-95 transition-all cursor-pointer disabled:opacity-50"
          >
            {isSubmittingFeedback
              ? 'Submitting...'
              : feedbackSubmitted
                ? 'Update Rating'
                : 'Submit Review & Claim Points'}
          </button>
        </div>
      )}

      {/* Digital Invoice Modal */}
      <Dialog open={invoiceOpen} onOpenChange={setInvoiceOpen}>
        <DialogContent className="max-w-md rounded-3xl bg-surface-container border border-outline-variant/20 p-5 shadow-2xl">
          <DialogHeader>
            <DialogTitle className="text-base font-black text-on-surface">
              Tax Invoice #{activeOrder.id}
            </DialogTitle>
            <DialogDescription className="text-xs text-on-surface-variant">
              Seth Sawariya Cafe — Digital Receipt
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-3 pt-2 text-xs text-on-surface">
            <div className="flex justify-between border-b border-outline-variant/15 pb-2">
              <span>Order Number</span>
              <span className="font-bold">#{activeOrder.id}</span>
            </div>
            <div className="flex justify-between border-b border-outline-variant/15 pb-2">
              <span>Date &amp; Time</span>
              <span>{activeOrder.createdAtLabel}</span>
            </div>
            <div className="flex justify-between border-b border-outline-variant/15 pb-2">
              <span>Dining Service</span>
              <span className="font-bold capitalize">{activeOrder.serviceMode}</span>
            </div>

            <div className="py-1 space-y-1.5">
              <span className="text-[11px] font-bold text-on-surface-variant uppercase">
                Items
              </span>
              {activeOrder.items.map((item) => (
                <div key={item.menuItemId} className="flex justify-between text-xs">
                  <span>
                    {item.quantity}x {item.name}
                  </span>
                  <span className="font-bold">₹{item.price * item.quantity}</span>
                </div>
              ))}
            </div>

            <div className="border-t border-outline-variant/15 pt-2 space-y-1">
              <div className="flex justify-between text-xs text-on-surface-variant">
                <span>Subtotal</span>
                <span>₹{activeOrder.subtotal}</span>
              </div>
              <div className="flex justify-between text-xs text-on-surface-variant">
                <span>GST (5%)</span>
                <span>₹{activeOrder.tax.toFixed(2)}</span>
              </div>
              {activeOrder.discount > 0 && (
                <div className="flex justify-between text-xs text-emerald-500 font-bold">
                  <span>Discount</span>
                  <span>-₹{activeOrder.discount.toFixed(2)}</span>
                </div>
              )}
              <div className="flex justify-between text-sm font-black text-on-surface pt-1 border-t border-outline-variant/15">
                <span>Total Paid</span>
                <span className="text-[#FF6422]">₹{activeOrder.total}</span>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-2 pt-2">
              {onDownloadInvoicePdf && (
                <button
                  type="button"
                  onClick={() => onDownloadInvoicePdf(activeOrder)}
                  className="py-2.5 px-3 rounded-full bg-[#FF6422] text-white text-xs font-bold shadow-md cursor-pointer inline-flex items-center justify-center gap-1.5"
                >
                  <span className="material-symbols-outlined text-[16px]">download</span>
                  <span>PDF Invoice</span>
                </button>
              )}
              {onPrintThermalReceipt && (
                <button
                  type="button"
                  onClick={() => onPrintThermalReceipt(activeOrder)}
                  className="py-2.5 px-3 rounded-full bg-surface-container-high text-on-surface text-xs font-bold cursor-pointer inline-flex items-center justify-center gap-1.5"
                >
                  <span className="material-symbols-outlined text-[16px]">print</span>
                  <span>Thermal Bill</span>
                </button>
              )}
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
};
