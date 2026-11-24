import React, { useEffect, useRef, useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { ORDER_STATUS_META } from '../state/cafeStateMachines';
import { CafeOrder, CafeSettings, MenuItem, PromoCampaign } from '../types/cafe';
import { CafeImage } from './CafeImage';
import { findCafeAssistantMenuItem, getCafeAssistantReply } from '../utils/cafeAssistant';

interface LiveTrackingScreenProps {
  initialView?: 'track' | 'orders';
  activeOrder?: CafeOrder;
  allOrders: CafeOrder[];
  availableBeans: number;
  menuItems: MenuItem[];
  cafeSettings?: CafeSettings;
  campaigns: PromoCampaign[];
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
  menuItems,
  cafeSettings,
  campaigns,
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
  const [viewMode, setViewMode] = useState<'track' | 'orders'>('track');
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
  const [emailBillModalOpen, setEmailBillModalOpen] = useState(false);
  const [emailBillTarget, setEmailBillTarget] = useState('');
  const [isSendingBillEmail, setIsSendingBillEmail] = useState(false);
  const [stewardChatOpen, setStewardChatOpen] = useState(false);
  const [stewardDraft, setStewardDraft] = useState('');
  const [stewardReplying, setStewardReplying] = useState(false);
  const stewardMessagesEndRef = useRef<HTMLDivElement>(null);
  const [lastMentionedMenuItem, setLastMentionedMenuItem] = useState<MenuItem>();
  const [stewardMessages, setStewardMessages] = useState<
    { id: number; sender: 'steward' | 'customer'; text: string }[]
  >([
    {
      id: 1,
      sender: 'steward',
      text: 'Hi! I’m your CafeOS assistant. Ask me about your order, menu prices and availability, payments, receipts, rewards, or cafe details. Your chat stays on this device.',
    },
  ]);

  const sendStewardMessage = (message: string) => {
    const text = message.trim();
    if (!text || stewardReplying) return;

    const customerId = Date.now();
    const mentionedItem = findCafeAssistantMenuItem(text, menuItems);
    if (mentionedItem) setLastMentionedMenuItem(mentionedItem);
    setStewardMessages((current) =>
      [...current, { id: customerId, sender: 'customer' as const, text }].slice(-100)
    );
    setStewardDraft('');
    setStewardReplying(true);
    const reply = getCafeAssistantReply(text, {
      activeOrder,
      menuItems,
      availableBeans,
      cafeSettings,
      campaigns,
      lastMentionedMenuItem,
    });
    window.setTimeout(() => {
      setStewardMessages((current) =>
        [...current, { id: customerId + 1, sender: 'steward' as const, text: reply }].slice(-100)
      );
      setStewardReplying(false);
    }, 450);
  };

  useEffect(() => {
    stewardMessagesEndRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' });
  }, [stewardMessages, stewardReplying]);

  const handleSendBillEmail = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeOrder || !emailBillTarget.trim() || !emailBillTarget.includes('@')) {
      onNotify('Please enter a valid email address.');
      return;
    }
    setIsSendingBillEmail(true);
    try {
      const res = await fetch(`/api/orders/${activeOrder.id}/send-bill-email`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: emailBillTarget.trim(),
          name: activeOrder.customerName,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to send bill');
      onNotify(
        data.simulated
          ? `[Simulated] Bill dispatched to ${emailBillTarget.trim()} via Brevo.`
          : `Tax invoice emailed to ${emailBillTarget.trim()} via Brevo!`
      );
      setEmailBillModalOpen(false);
    } catch (err) {
      onNotify(err instanceof Error ? err.message : 'Failed to send bill email');
    } finally {
      setIsSendingBillEmail(false);
    }
  };

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
    if (initialView) {
      setViewMode(initialView);
    }
  }, [initialView]);

  useEffect(() => {
    if (activeOrder) {
      setViewMode('track');
    }
  }, [activeOrder?.id]);

  const prevPaymentStatusRef = useRef(activeOrder?.paymentStatus);
  useEffect(() => {
    if (prevPaymentStatusRef.current === 'pending' && activeOrder?.paymentStatus === 'paid') {
      setViewMode('track');
      onNotify?.(`Payment verified! Order #${activeOrder.id} is confirmed.`);
    }
    prevPaymentStatusRef.current = activeOrder?.paymentStatus;
  }, [activeOrder?.paymentStatus, activeOrder?.id, onNotify]);

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
    }, 3_000);
    return () => window.clearInterval(timer);
  }, [activeOrder?.id, activeOrder?.paymentProvider, activeOrder?.paymentStatus, onRefreshPayment]);

  if (!activeOrder) {
    if (allOrders.length > 0) {
      // If user has orders but none actively selected, show My Orders list (Panel 10)
      return (
        <div className="mx-auto flex w-full max-w-xl flex-col gap-4 px-3 py-2 pb-28 text-on-surface">
          <div className="flex items-center justify-between pb-1">
            <button
              type="button"
              onClick={onBackToMenu}
              aria-label="Back"
              className="w-9 h-9 rounded-full bg-surface-container-low border border-outline-variant flex items-center justify-center text-on-surface shadow-xs hover:bg-surface-container-high transition-colors cursor-pointer"
            >
              <span className="material-symbols-outlined text-[20px]">arrow_back</span>
            </button>
            <h1 className="text-base sm:text-lg font-bold text-on-surface tracking-tight font-serif">
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
                    ? 'bg-primary text-white shadow-xs'
                    : 'bg-surface-container-low text-on-surface-variant border border-outline-variant hover:bg-surface-container'
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
                  className="p-4 rounded-2xl bg-surface-container-low border border-outline-variant shadow-xs cursor-pointer hover:shadow-md transition-all space-y-2.5"
                >
                  <div className="flex items-center justify-between">
                    <span className="font-bold text-xs sm:text-sm text-on-surface">
                      #TSC-{order.kotNumber || order.id.slice(0, 4)}
                    </span>
                    <span className={`px-2.5 py-0.5 rounded-full text-[10px] font-bold ${
                      order.status === 'served'
                        ? 'bg-emerald-500/10 text-emerald-300 border border-emerald-500/25'
                        : 'bg-amber-500/10 text-amber-300 border border-amber-500/25'
                    }`}>
                      {order.status === 'served' ? 'Delivered' : 'Preparing'} • ₹{order.total}
                    </span>
                  </div>

                  <p className="text-xs text-on-surface-variant">
                    {order.items.length} {order.items.length === 1 ? 'item' : 'items'}
                  </p>

                  <div className="flex items-center justify-between pt-1">
                    <div className="flex items-center gap-2 overflow-hidden">
                      {order.items.slice(0, 4).map((item, idx) => (
                        <div
                          key={`${item.menuItemId}-${idx}`}
                          className="w-10 h-10 rounded-xl overflow-hidden bg-surface-container border border-outline-variant shrink-0"
                        >
                          <CafeImage
                            src={item.imageUrl}
                            alt={item.name}
                            productId={item.menuItemId}
                            className="w-full h-full object-cover"
                            fallbackIcon="restaurant"
                          />
                        </div>
                      ))}
                    </div>
                    <span className="material-symbols-outlined text-[20px] text-on-surface-variant">
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
        <div className="w-20 h-20 rounded-full bg-surface-container-low border border-outline-variant flex items-center justify-center text-primary mb-4 shadow-xs">
          <span className="material-symbols-outlined text-[40px]">receipt_long</span>
        </div>
        <h2 className="text-xl font-bold text-on-surface tracking-tight font-serif">
          No Active Orders
        </h2>
        <p className="text-xs text-on-surface-variant mt-1.5 leading-relaxed">
          You don&apos;t have any active orders right now. Explore our delicious menu and place your order!
        </p>
        <button
          type="button"
          onClick={onBackToMenu}
          className="mt-5 px-6 py-3 rounded-full bg-primary hover:brightness-90 text-white font-bold text-xs shadow-xs transition-all cursor-pointer inline-flex items-center gap-2"
        >
          <span className="material-symbols-outlined text-[16px]">restaurant_menu</span>
          <span>Explore Menu</span>
        </button>
      </div>
    );
  }

  const statusMeta = ORDER_STATUS_META[activeOrder.status];
  const currentIdx = statusMeta.stepIndex;
  const statusMessage = statusMeta.trackingMessage;

  if (viewMode === 'orders') {
    return (
      <div className="mx-auto flex w-full max-w-xl flex-col gap-4 px-3 py-2 pb-28 text-on-surface">
        <div className="flex items-center justify-between pb-1">
          <button
            type="button"
            onClick={() => setViewMode('track')}
            aria-label="Back"
            className="w-9 h-9 rounded-full bg-surface-container-low border border-outline-variant flex items-center justify-center text-on-surface shadow-xs hover:bg-surface-container-high transition-colors cursor-pointer"
          >
            <span className="material-symbols-outlined text-[20px]">arrow_back</span>
          </button>
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-full overflow-hidden border border-[#D4AF37]/60 shadow-xs bg-black p-0.5 shrink-0">
              <img src="/images/tsc-logo.jpg" alt="The Sawariya Cafe" className="w-full h-full object-cover rounded-full" />
            </div>
            <h1 className="text-base sm:text-lg font-bold text-on-surface tracking-tight font-serif">
              My Orders
            </h1>
          </div>
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
                  ? 'bg-primary text-white shadow-xs'
                  : 'bg-surface-container-low text-on-surface-variant border border-outline-variant hover:bg-surface-container'
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
                className="p-4 rounded-2xl bg-surface-container-low border border-outline-variant shadow-xs cursor-pointer hover:shadow-md transition-all space-y-2.5"
              >
                <div className="flex items-center justify-between">
                  <span className="font-bold text-xs sm:text-sm text-on-surface">
                    #TSC-{order.kotNumber || order.id.slice(0, 4)}
                  </span>
                  <span className={`px-2.5 py-0.5 rounded-full text-[10px] font-bold ${
                    order.status === 'served'
                      ? 'bg-emerald-500/10 text-emerald-300 border border-emerald-500/25'
                      : 'bg-amber-500/10 text-amber-300 border border-amber-500/25'
                  }`}>
                    {order.status === 'served' ? 'Delivered' : 'Preparing'} • ₹{order.total}
                  </span>
                </div>

                <p className="text-xs text-on-surface-variant">
                  {order.items.length} {order.items.length === 1 ? 'item' : 'items'}
                </p>

                <div className="flex items-center justify-between pt-1">
                  <div className="flex items-center gap-2 overflow-hidden">
                    {order.items.slice(0, 4).map((item, idx) => (
                      <div
                        key={`${item.menuItemId}-${idx}`}
                        className="w-10 h-10 rounded-xl overflow-hidden bg-surface-container border border-outline-variant shrink-0"
                      >
                        <CafeImage
                          src={item.imageUrl}
                          alt={item.name}
                          productId={item.menuItemId}
                          className="w-full h-full object-cover"
                          fallbackIcon="restaurant"
                        />
                      </div>
                    ))}
                  </div>
                  <span className="material-symbols-outlined text-[20px] text-on-surface-variant">
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
    <div className="mx-auto flex w-full max-w-xl flex-col gap-4 px-3 py-2 pb-28 text-on-surface">
      {/* Top Header Bar (Panel 9) */}
      <div className="flex items-center justify-between pb-1">
        <button
          type="button"
          onClick={() => {
            if (allOrders.length > 1) setViewMode('orders');
            else onBackToMenu();
          }}
          aria-label="Back"
          className="w-9 h-9 rounded-full bg-surface-container-low border border-outline-variant flex items-center justify-center text-on-surface shadow-xs hover:bg-surface-container-high transition-colors cursor-pointer shrink-0"
        >
          <span className="material-symbols-outlined text-[20px]">arrow_back</span>
        </button>

        <h1 className="text-base sm:text-lg font-bold text-on-surface tracking-tight font-serif">
          Track Order
        </h1>

        <button
          type="button"
          aria-label="Help and Support"
          onClick={() => onNotify('Captain notified! Call steward or support: +91 98765 43210')}
          className="w-9 h-9 rounded-full bg-surface-container-low border border-outline-variant flex items-center justify-center text-on-surface shadow-xs hover:bg-surface-container-high transition-colors cursor-pointer shrink-0"
        >
          <span className="material-symbols-outlined text-[20px]">headset_mic</span>
        </button>
      </div>

      {allOrders.length > 1 && (
        <div className="flex items-center justify-between px-1">
          <span className="text-xs text-on-surface-variant">
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

      {/* Order progress illustration (Panel 9) */}
      <div className="rounded-3xl bg-surface-container-low border border-outline-variant p-5 shadow-xs flex flex-col items-center justify-center text-center">
        {activeOrder.status === 'preparing' ? (
          <div className="flex h-36 w-full max-w-[18rem] items-center justify-center overflow-hidden rounded-2xl bg-surface-container">
            <img
              src="/customer-cooking.svg"
              alt="Fresh food sizzling in a pan while the kitchen prepares your order"
              className="h-full w-full object-contain"
            />
          </div>
        ) : (
          <div className="tracking-food-animation flex h-28 w-48 items-center justify-center" aria-label="Animated food serving illustration">
            <svg className="h-28 w-48 overflow-visible" viewBox="0 0 192 112" fill="none" aria-hidden="true">
              <ellipse className="tracking-plate-shadow" cx="96" cy="96" rx="65" ry="8" fill="#C67C4E" opacity=".16" />
              <ellipse cx="96" cy="89" rx="69" ry="16" fill="#FFF8EE" stroke="#C67C4E" strokeWidth="3" />
              <ellipse cx="96" cy="85" rx="53" ry="10" fill="#F1D7B2" stroke="#A85C36" strokeWidth="2" />

              <g className="tracking-food-bowl">
                <path d="M51 76c3 18 18 29 45 29s42-11 45-29H51Z" fill="#FFFDF8" stroke="#A85C36" strokeWidth="3" />
                <ellipse cx="96" cy="76" rx="45" ry="12" fill="#E8A85A" stroke="#A85C36" strokeWidth="3" />
                <ellipse cx="96" cy="73" rx="33" ry="7" fill="#8FA64A" />
                <circle cx="79" cy="70" r="4" fill="#F5D04F" />
                <circle cx="105" cy="68" r="5" fill="#F7B84B" />
                <circle cx="119" cy="73" r="4" fill="#E95D3F" />
                <path d="M82 59c8-8 21-8 29 0" stroke="#A85C36" strokeWidth="2.5" strokeLinecap="round" />
              </g>

              <g className="tracking-steam tracking-steam-one" stroke="#C67C4E" strokeWidth="3" strokeLinecap="round">
                <path d="M78 57c-8-9 7-12 0-22" />
              </g>
              <g className="tracking-steam tracking-steam-two" stroke="#C67C4E" strokeWidth="3" strokeLinecap="round">
                <path d="M98 54c-8-10 8-14 1-25" />
              </g>
              <g className="tracking-steam tracking-steam-three" stroke="#C67C4E" strokeWidth="3" strokeLinecap="round">
                <path d="M118 58c-7-8 7-12 1-20" />
              </g>
            </svg>
          </div>
        )}

        <h2 className="font-serif font-black text-xl text-on-surface mt-3">
          {activeOrder.status === 'placed'
            ? 'Order Confirmed'
            : activeOrder.status === 'preparing'
              ? 'Preparing Your Order'
              : activeOrder.status === 'ready'
                ? 'Ready for Pickup'
                : 'Order Delivered'}
        </h2>
        <p className="text-xs text-on-surface-variant mt-0.5">
          {statusMessage || 'Your food is being freshly prepared.'}
        </p>
      </div>

      {/* 3-Step Vertical Timeline (Panel 9) */}
      <div className="rounded-2xl bg-surface-container-low border border-outline-variant p-5 shadow-xs space-y-4">
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
            done: currentIdx >= 2,
            active: currentIdx === 1 || currentIdx === 2,
          },
          {
            title: 'Delivered',
            sub: 'Enjoy your meal!',
            done: currentIdx >= 4,
            active: currentIdx >= 4,
          },
        ].map((step, idx, arr) => (
          <div key={step.title} className="flex items-start gap-3 relative">
            {idx < arr.length - 1 && (
              <div
                className={`absolute left-3 top-6 bottom-0 w-0.5 -ml-px ${
                  step.done ? 'bg-primary' : 'bg-outline-variant'
                }`}
              />
            )}
            <div
              className={`w-6 h-6 rounded-full flex items-center justify-center text-xs shrink-0 z-10 transition-colors ${
                step.done
                  ? 'bg-primary text-white'
                  : step.active
                    ? 'bg-primary text-white ring-4 ring-[#382319]/15'
                    : 'bg-surface-container-high text-on-surface-variant border border-outline-variant'
              }`}
            >
              {step.done ? '✓' : idx + 1}
            </div>
            <div className="flex-1 pb-1">
              <p className="font-bold text-xs sm:text-sm text-on-surface">{step.title}</p>
              <p className="text-[11px] text-on-surface-variant mt-0.5">{step.sub}</p>
            </div>
          </div>
        ))}
      </div>

      {/* Order Details Expandable Card (Panel 9) */}
      <div className="rounded-2xl bg-surface-container-low border border-outline-variant p-4 shadow-xs space-y-3">
        <button
          type="button"
          onClick={() => setDetailsOpen(!detailsOpen)}
          className="w-full flex items-center justify-between text-left cursor-pointer"
        >
          <div className="flex items-center gap-2">
            <span className="material-symbols-outlined text-[20px] text-primary">
              receipt_long
            </span>
            <span className="text-xs sm:text-sm font-bold text-on-surface">
              Order Details (#{activeOrder.kotNumber})
            </span>
          </div>
          <span className="material-symbols-outlined text-[18px] text-on-surface-variant">
            {detailsOpen ? 'expand_less' : 'chevron_right'}
          </span>
        </button>

        {detailsOpen && (
          <div className="pt-2 border-t border-outline-variant/50 space-y-2.5">
            <div className="space-y-2">
              {activeOrder.items.map((item) => (
                <div
                  key={item.menuItemId}
                  className="flex items-center justify-between text-xs"
                >
                  <span className="text-on-surface">
                    {item.quantity}x {item.name}
                  </span>
                  <span className="font-bold text-on-surface">
                    ₹{item.price * item.quantity}
                  </span>
                </div>
              ))}
            </div>

            <div className="border-t border-outline-variant/50 pt-2 flex justify-between text-xs font-bold text-on-surface">
              <span>Total Paid</span>
              <span>₹{activeOrder.total}</span>
            </div>

            <div className="flex items-center gap-2 pt-1">
              <button
                type="button"
                onClick={() => setInvoiceOpen(true)}
                className="flex-1 py-2 rounded-xl bg-surface-container border border-outline-variant text-xs font-bold text-on-surface hover:bg-surface-container-high cursor-pointer"
              >
                View Invoice
              </button>
              <button
                type="button"
                onClick={() => {
                  setEmailBillTarget(activeOrder.customerEmail || '');
                  setEmailBillModalOpen(true);
                }}
                className="flex-1 py-2 rounded-xl bg-[#FF6422]/10 border border-[#FF6422]/30 text-xs font-bold text-[#FF6422] hover:bg-[#FF6422]/20 cursor-pointer flex items-center justify-center gap-1"
              >
                <span className="material-symbols-outlined text-[14px]">mail</span>
                <span>Email Bill</span>
              </button>
              {onPrintThermalReceipt && (
                <button
                  type="button"
                  onClick={() => onPrintThermalReceipt(activeOrder)}
                  className="flex-1 py-2 rounded-xl bg-surface-container border border-outline-variant text-xs font-bold text-on-surface hover:bg-surface-container-high cursor-pointer"
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
        <div className="p-4 rounded-3xl bg-emerald-500/100/10 border border-emerald-500/30 shadow-md flex flex-col sm:flex-row sm:items-center justify-between gap-3 animate-fade-in">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-emerald-500/100/20 text-emerald-400 flex items-center justify-center shrink-0">
              <span className="material-symbols-outlined text-[22px]">check_circle</span>
            </div>
            <div>
              <h3 className="text-xs sm:text-sm font-bold text-on-surface">
                Payment Confirmed · ₹{activeOrder.total} Paid
              </h3>
              <p className="text-[11px] text-on-surface-variant mt-0.5">
                {activeOrder.paidEmailSentAt && activeOrder.customerEmail ? (
                  <span className="text-emerald-400 font-medium inline-flex items-center gap-1">
                    <span className="material-symbols-outlined text-[14px]">mark_email_read</span>
                    <span>GST tax invoice & bill emailed to {activeOrder.customerEmail}</span>
                  </span>
                ) : (
                  'Your payment is verified and your order is active in the kitchen.'
                )}
              </p>
            </div>
          </div>
          {onBackToMenu && (
            <button
              type="button"
              onClick={onBackToMenu}
              className="px-5 py-2.5 rounded-full bg-primary hover:brightness-90 text-white text-xs font-black shadow-md transition-all active:scale-95 cursor-pointer inline-flex items-center justify-center gap-1.5 shrink-0"
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
              className="px-5 py-2.5 rounded-full bg-primary hover:brightness-90 text-white text-xs font-black shadow-md transition-all active:scale-95 cursor-pointer disabled:opacity-50 inline-flex items-center justify-center gap-1.5 shrink-0"
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
          <div className="p-4 rounded-3xl bg-amber-500/100/10 border border-amber-500/30 shadow-sm flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-amber-500/100/20 text-amber-500 flex items-center justify-center shrink-0">
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
                    productId={item.menuItemId}
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
        <p className="text-xs text-error bg-red-950/40 p-3 rounded-2xl">{paymentError}</p>
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
          onClick={() => setStewardChatOpen(true)}
          className="py-3 px-4 rounded-full bg-surface-container hover:bg-surface-container-high border border-outline-variant/20 text-xs font-bold text-on-surface flex items-center justify-center gap-1.5 shadow-sm transition-all cursor-pointer active:scale-95"
        >
          <span className="material-symbols-outlined text-[18px]">smart_toy</span>
          <span>Cafe Assistant</span>
        </button>

        {onBackToMenu && (
          <button
            type="button"
            onClick={onBackToMenu}
            className="col-span-2 sm:col-span-1 py-3 px-4 rounded-full bg-primary hover:brightness-90 text-white text-xs font-bold flex items-center justify-center gap-1.5 shadow-sm transition-all cursor-pointer active:scale-95"
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
                <span className="rounded-full bg-primary/10 px-2 py-0.5 font-semibold text-[#C84B17]">
                  +25 Beans
                </span>
                <span>· 2 Beans = ₹1 off a future order</span>
              </p>
            </div>
            {feedbackSubmitted && (
              <span className="px-2.5 py-0.5 rounded-full bg-emerald-500/100/20 text-emerald-500 text-[10px] font-bold">
                Rated ✓
              </span>
            )}
          </div>

          {feedbackSubmitted && (
            <div
              role="status"
              className="rounded-xl border border-emerald-500/20 bg-emerald-500/100/10 px-3 py-2.5 text-xs text-on-surface"
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
                        ? 'bg-primary text-white shadow-sm'
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
            className="w-full py-3 rounded-full bg-primary hover:brightness-90 text-white text-xs font-black shadow-md active:scale-95 transition-all cursor-pointer disabled:opacity-50"
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

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 pt-2">
              <button
                type="button"
                onClick={() => {
                  setEmailBillTarget(activeOrder.customerEmail || '');
                  setEmailBillModalOpen(true);
                }}
                className="py-2.5 px-3 rounded-full bg-[#FF6422] text-white text-xs font-bold shadow-md cursor-pointer inline-flex items-center justify-center gap-1.5"
              >
                <span className="material-symbols-outlined text-[16px]">mail</span>
                <span>Email Bill via Brevo</span>
              </button>
              {onDownloadInvoicePdf && (
                <button
                  type="button"
                  onClick={() => onDownloadInvoicePdf(activeOrder)}
                  className="py-2.5 px-3 rounded-full bg-primary text-white text-xs font-bold shadow-md cursor-pointer inline-flex items-center justify-center gap-1.5"
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

      {/* Steward Chat */}
      <Dialog open={stewardChatOpen} onOpenChange={setStewardChatOpen}>
        <DialogContent className="max-w-sm bg-surface-container border border-outline-variant/30 text-on-surface p-0 overflow-hidden rounded-2xl">
          <DialogHeader className="border-b border-outline-variant/20 px-4 py-3">
            <DialogTitle className="flex items-center gap-2 text-sm font-bold text-on-surface">
              <span className="relative flex h-9 w-9 items-center justify-center rounded-full bg-[#FF6422]/15 text-[#FF6422]">
                <span className="material-symbols-outlined text-[20px]">smart_toy</span>
                <span className="absolute bottom-0 right-0 h-2.5 w-2.5 rounded-full border-2 border-surface-container bg-emerald-500" />
              </span>
              <span>
                CafeOS Assistant
                <span className="block text-[10px] font-medium text-emerald-600">Private · replies locally</span>
              </span>
            </DialogTitle>
            <DialogDescription className="sr-only">
              Ask the local CafeOS assistant about your order, menu, payment, rewards, or cafe information.
            </DialogDescription>
          </DialogHeader>

          <div className="flex max-h-[360px] min-h-[260px] flex-col">
            <div className="flex-1 space-y-2.5 overflow-y-auto px-4 py-3">
              {stewardMessages.map((message) => (
                <div
                  key={message.id}
                  className={`flex ${message.sender === 'customer' ? 'justify-end' : 'justify-start'}`}
                >
                  <div
                    className={`max-w-[82%] rounded-2xl px-3 py-2 text-xs leading-relaxed ${
                      message.sender === 'customer'
                        ? 'rounded-br-md bg-[#FF6422] text-white'
                        : 'rounded-bl-md border border-outline-variant/20 bg-surface-container-low text-on-surface'
                    }`}
                  >
                    {message.text}
                  </div>
                </div>
              ))}
              {stewardReplying && (
                <div className="flex justify-start" role="status" aria-label="Assistant is replying">
                  <div className="flex items-center gap-1 rounded-2xl rounded-bl-md border border-outline-variant/20 bg-surface-container-low px-3 py-2.5">
                    <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-on-surface-variant" />
                    <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-on-surface-variant [animation-delay:120ms]" />
                    <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-on-surface-variant [animation-delay:240ms]" />
                  </div>
                </div>
              )}
              <div ref={stewardMessagesEndRef} />
            </div>

            <div className="flex gap-1.5 overflow-x-auto px-4 pb-2 no-scrollbar">
              {['Order status', 'Menu recommendations', 'Check rewards'].map((reply) => (
                <button
                  key={reply}
                  type="button"
                  onClick={() => sendStewardMessage(reply)}
                  disabled={stewardReplying}
                  className="shrink-0 rounded-full border border-outline-variant/30 bg-surface-container-low px-2.5 py-1.5 text-[10px] font-bold text-on-surface-variant cursor-pointer hover:border-[#FF6422]/40 hover:text-[#FF6422]"
                >
                  {reply}
                </button>
              ))}
            </div>

            <form
              onSubmit={(event) => {
                event.preventDefault();
                sendStewardMessage(stewardDraft);
              }}
              className="flex items-center gap-2 border-t border-outline-variant/20 p-3"
            >
              <input
                value={stewardDraft}
                onChange={(event) => setStewardDraft(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === 'Enter' && !event.shiftKey) {
                    event.preventDefault();
                    sendStewardMessage(stewardDraft);
                  }
                }}
                disabled={stewardReplying}
                aria-label="Message the cafe assistant"
                placeholder="Ask anything about your visit..."
                className="min-w-0 flex-1 rounded-xl border border-outline-variant/30 bg-surface-container-low px-3 py-2 text-xs text-on-surface placeholder:text-on-surface-variant focus:outline-none focus:ring-1 focus:ring-[#FF6422]"
              />
              <button
                type="button"
                aria-label="Send message"
                onClick={() => sendStewardMessage(stewardDraft)}
                disabled={!stewardDraft.trim() || stewardReplying}
                className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[#FF6422] text-white disabled:opacity-45 cursor-pointer"
              >
                <span className="material-symbols-outlined text-[18px]">send</span>
              </button>
            </form>
          </div>
        </DialogContent>
      </Dialog>

      {/* Brevo Email Bill Dialog */}
      <Dialog open={emailBillModalOpen} onOpenChange={setEmailBillModalOpen}>
        <DialogContent className="max-w-sm bg-surface-container border border-outline-variant/30 text-on-surface">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-base font-bold text-on-surface">
              <span className="material-symbols-outlined text-[#FF6422] text-[20px]">receipt_long</span>
              <span>Email Bill / Tax Invoice</span>
            </DialogTitle>
            <DialogDescription className="text-xs text-on-surface-variant">
              Delivered via official Brevo mailer to your inbox.
            </DialogDescription>
          </DialogHeader>

          <form onSubmit={handleSendBillEmail} className="space-y-3 mt-2">
            <div>
              <label className="block text-xs font-semibold text-on-surface-variant mb-1">
                Recipient Email
              </label>
              <input
                type="email"
                required
                value={emailBillTarget}
                onChange={(e) => setEmailBillTarget(e.target.value)}
                placeholder="your.email@example.com"
                className="w-full px-3 py-2 rounded-xl bg-surface-container-low text-on-surface text-xs focus:outline-none focus:ring-1 focus:ring-primary"
              />
            </div>

            <div className="flex gap-2 pt-2">
              <button
                type="button"
                onClick={() => setEmailBillModalOpen(false)}
                className="flex-1 py-2 rounded-xl bg-surface-container-high text-on-surface text-xs font-semibold cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={isSendingBillEmail}
                className="flex-1 py-2 rounded-xl bg-[#FF6422] hover:bg-[#E55518] text-white text-xs font-bold transition-all disabled:opacity-50 cursor-pointer flex items-center justify-center gap-1.5"
              >
                {isSendingBillEmail ? (
                  <span>Sending...</span>
                ) : (
                  <>
                    <span className="material-symbols-outlined text-[16px]">send</span>
                    <span>Send Bill</span>
                  </>
                )}
              </button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
};
