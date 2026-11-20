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
  activeOrder?: CafeOrder;
  allOrders: CafeOrder[];
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
  activeOrder,
  allOrders,
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

  // Feedback State
  const [rating, setRating] = useState<number>(activeOrder?.rating || 5);
  const [hoverRating, setHoverRating] = useState<number | null>(null);
  const [selectedTags, setSelectedTags] = useState<string[]>(activeOrder?.feedbackTags || []);
  const [feedbackComment, setFeedbackComment] = useState('');
  const [isSubmittingFeedback, setIsSubmittingFeedback] = useState(false);
  const [feedbackSubmitted, setFeedbackSubmitted] = useState(Boolean(activeOrder?.rating));

  useEffect(() => {
    if (activeOrder?.rating) {
      setRating(activeOrder.rating);
      setFeedbackSubmitted(true);
    } else {
      setFeedbackSubmitted(false);
    }
  }, [activeOrder?.id, activeOrder?.rating]);

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
    return (
      <div className="flex flex-col items-center justify-center py-20 px-4 text-center max-w-sm mx-auto">
        <div className="w-24 h-24 rounded-full bg-surface-container flex items-center justify-center text-[#FF6422] mb-5 shadow-lg border border-outline-variant/15">
          <span className="material-symbols-outlined text-[48px]">receipt_long</span>
        </div>
        <h2 className="text-xl sm:text-2xl font-black text-on-surface tracking-tight">
          No Active Orders
        </h2>
        <p className="text-xs sm:text-sm text-on-surface-variant mt-2 leading-relaxed">
          You don&apos;t have any active orders right now. Explore our delicious menu and place your order!
        </p>
        <button
          type="button"
          onClick={onBackToMenu}
          className="mt-6 px-8 py-3.5 rounded-full bg-[#FF6422] hover:bg-[#E55518] text-white font-black text-xs sm:text-sm shadow-[0_8px_24px_rgba(255,100,34,0.35)] active:scale-95 transition-all cursor-pointer inline-flex items-center gap-2"
        >
          <span className="material-symbols-outlined text-[18px]">restaurant_menu</span>
          <span>Explore Menu</span>
        </button>
      </div>
    );
  }

  const statusMeta = ORDER_STATUS_META[activeOrder.status];
  const currentIdx = statusMeta.stepIndex;
  const progressPercent = statusMeta.progressPercent;
  const statusMessage = statusMeta.trackingMessage;

  return (
    <div className="flex flex-col w-full pb-28 pt-1 space-y-4">
      {/* Top Header Bar */}
      <div className="flex items-center justify-between pb-2">
        <button
          type="button"
          onClick={onBackToMenu}
          aria-label="Back to Menu"
          className="w-10 h-10 rounded-full bg-surface-container hover:bg-surface-container-high flex items-center justify-center text-on-surface transition-colors cursor-pointer shrink-0"
        >
          <span className="material-symbols-outlined text-[22px]">arrow_back</span>
        </button>

        <h1 className="text-lg font-black text-on-surface tracking-tight">Track Order</h1>

        {/* Dining Mode Pill */}
        <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-surface-container text-xs font-bold text-on-surface border border-outline-variant/15 shrink-0">
          <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
          <span className="text-[#FF6422]">
            {activeOrder.serviceMode === 'dine-in'
              ? `Table ${activeOrder.tableNumber?.replace('T', '') || '3'}`
              : activeOrder.serviceMode}
          </span>
        </div>
      </div>

      {/* Multiple Orders Selector Strip (if user placed multiple orders) */}
      {allOrders.length > 1 && (
        <div className="flex items-center gap-2 overflow-x-auto no-scrollbar py-1">
          {allOrders.slice(0, 6).map((order) => {
            const isCurrent = order.id === activeOrder.id;
            return (
              <button
                key={order.id}
                type="button"
                onClick={() => onSelectOrder(order.id)}
                className={`px-3.5 py-1.5 rounded-full text-xs font-bold whitespace-nowrap transition-all cursor-pointer ${
                  isCurrent
                    ? 'bg-[#FF6422] text-white shadow-md'
                    : 'bg-surface-container text-on-surface hover:bg-surface-container-high border border-outline-variant/15'
                }`}
              >
                #{order.id} · {order.status.toUpperCase()}
              </button>
            );
          })}
        </div>
      )}

      {/* Hero Order Status Card */}
      <div className="p-5 rounded-3xl bg-surface-container border border-outline-variant/15 shadow-sm space-y-3">
        <div className="flex items-start justify-between gap-2">
          <div>
            <div className="flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
              <span className="text-[11px] font-black uppercase tracking-wider text-emerald-500">
                Live Kitchen Status
              </span>
            </div>
            <h2 className="text-2xl font-black text-on-surface tracking-tight mt-1">
              Order <span className="text-[#FF6422]">#{activeOrder.id}</span>
            </h2>
            <p className="text-xs text-on-surface-variant flex items-center gap-1 mt-0.5">
              <span className="material-symbols-outlined text-[14px]">schedule</span>
              <span>Placed at {activeOrder.createdAtLabel}</span>
            </p>
          </div>

          <div className="text-right">
            <span className="text-2xl font-black text-[#FF6422] tabular-nums block">
              ₹{activeOrder.total}
            </span>
            <span
              className={`inline-block rounded-full px-2.5 py-0.5 text-[10px] font-black uppercase tracking-wider mt-1 ${
                activeOrder.paymentStatus === 'paid'
                  ? 'bg-emerald-500/15 text-emerald-500 border border-emerald-500/25'
                  : activeOrder.paymentMode === 'cash' ||
                      activeOrder.paymentChannelLabel === 'Pay on Counter'
                    ? 'bg-amber-500/15 text-amber-500 border border-amber-500/25'
                    : 'bg-blue-500/15 text-blue-400 border border-blue-500/25'
              }`}
            >
              {activeOrder.paymentStatus === 'paid'
                ? 'PAID ✓'
                : activeOrder.paymentMode === 'cash' ||
                    activeOrder.paymentChannelLabel === 'Pay on Counter'
                  ? 'PAY ON COUNTER'
                  : 'AWAITING UPI'}
            </span>
          </div>
        </div>

        {/* Stepper Timeline */}
        <div className="pt-2 pb-1">
          <div className="relative py-2 flex items-center justify-between w-full px-2">
            {/* Background connecting track */}
            <div className="absolute left-6 right-6 top-1/2 -translate-y-3.5 h-1 bg-surface-container-high rounded-full z-0">
              <div
                className="h-full bg-[#FF6422] rounded-full transition-all duration-500"
                style={{ width: `${progressPercent}%` }}
              />
            </div>

            {STEPS.map((step, idx) => {
              const isDone = idx < currentIdx || activeOrder.status === 'served';
              const isActive = idx === currentIdx && activeOrder.status !== 'served';
              return (
                <div
                  key={step.key}
                  className={`relative z-10 flex flex-col items-center gap-1 ${
                    !isDone && !isActive ? 'opacity-50' : ''
                  }`}
                >
                  <div
                    className={`w-9 h-9 rounded-full flex items-center justify-center transition-all ${
                      isDone
                        ? 'bg-[#FF6422] text-white shadow-md'
                        : isActive
                          ? 'w-10 h-10 bg-[#FF6422] text-white shadow-[0_0_16px_rgba(255,100,34,0.4)] ring-4 ring-[#FF6422]/20'
                          : 'bg-surface-container-high text-on-surface-variant'
                    }`}
                  >
                    <span
                      className={`material-symbols-outlined text-[18px] ${
                        isDone ? 'font-bold' : isActive ? 'animate-pulse text-[20px]' : ''
                      }`}
                    >
                      {isDone ? 'check' : step.icon}
                    </span>
                  </div>
                  <span
                    className={`text-[11px] font-bold ${
                      isActive
                        ? 'text-[#FF6422]'
                        : isDone
                          ? 'text-on-surface'
                          : 'text-on-surface-variant'
                    }`}
                  >
                    {step.label}
                  </span>
                </div>
              );
            })}
          </div>
        </div>

        {/* Preparation Message */}
        <div className="p-3 rounded-2xl bg-surface flex items-center gap-2.5 border border-outline-variant/15">
          <span className="material-symbols-outlined text-[20px] text-[#FF6422] shrink-0">
            soup_kitchen
          </span>
          <p className="text-xs font-semibold text-on-surface leading-snug">{statusMessage}</p>
        </div>
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
              <p className="text-[11px] text-on-surface-variant mt-0.5">
                Leave a rating to earn <strong className="text-[#FF6422]">+25 Beans</strong>
              </p>
            </div>
            {feedbackSubmitted && (
              <span className="px-2.5 py-0.5 rounded-full bg-emerald-500/20 text-emerald-500 text-[10px] font-bold">
                Rated ✓
              </span>
            )}
          </div>

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
