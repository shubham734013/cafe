import React, { useState } from 'react';
import type { CafeTable, CartItem, PaymentMode, PromoCampaign, ServiceMode } from '../types/cafe';
import type { CustomerAuthSession } from '../lib/supabaseClient';
import { calculateCartTotals, formatINR } from '../utils/cafeLogic';
import { CafeImage } from './CafeImage';
import { CoffeeBrewLoader } from './CoffeeBrewLoader';
import { BookTableModal } from './BookTableModal';

interface CustomerCartScreenProps {
  cart: CartItem[];
  serviceMode: ServiceMode;
  selectedTable: string;
  tables?: CafeTable[];
  campaigns?: PromoCampaign[];
  firstOrderEligible: boolean;
  availablePoints?: number;
  couponCode: string;
  cookingNote: string;
  customerSession?: CustomerAuthSession | null;
  onNavigateLogin?: () => void;
  onServiceModeChange?: (mode: ServiceMode) => void;
  onTableChange?: (table: string) => void;
  onReserveTable: (details: { date: string; time: string; guests: string }) => Promise<string>;
  onUpdateQty: (menuItemId: string, delta: number) => void;
  onRemoveItem: (menuItemId: string) => void;
  onCouponChange: (code: string) => void;
  onCookingNoteChange: (note: string) => void;
  onCheckout: (paymentMode: PaymentMode, redeemPoints: number) => void | Promise<void>;
  onBrowseMenu: () => void;
}

type CheckoutState = 'idle' | 'submitting' | 'error';

export const CustomerCartScreen: React.FC<CustomerCartScreenProps> = ({
  cart,
  serviceMode,
  selectedTable,
  tables: _tables = [],
  campaigns = [],
  firstOrderEligible,
  availablePoints = 0,
  couponCode,
  cookingNote,
  customerSession,
  onNavigateLogin,
  onServiceModeChange,
  onTableChange,
  onReserveTable,
  onUpdateQty,
  onRemoveItem,
  onCouponChange,
  onCookingNoteChange,
  onCheckout,
  onBrowseMenu,
}) => {
  const [couponDraft, setCouponDraft] = useState(couponCode);
  const [paymentMode, setPaymentMode] = useState<PaymentMode>('upi');
  const [redeemPointsActive, setRedeemPointsActive] = useState(false);
  const [checkoutState, setCheckoutState] = useState<CheckoutState>('idle');
  const [checkoutError, setCheckoutError] = useState('');
  const [screenStep, setScreenStep] = useState<'cart' | 'checkout'>('cart');
  const [couponExpanded, setCouponExpanded] = useState(false);
  const [isBookTableOpen, setIsBookTableOpen] = useState(false);
  const isSubmitting = checkoutState === 'submitting';

  const pointsToRedeem = redeemPointsActive ? Math.min(availablePoints, 200) : 0;
  const totals = calculateCartTotals(
    cart,
    couponCode,
    serviceMode,
    false,
    campaigns,
    pointsToRedeem,
    firstOrderEligible
  );

  const formatBillingAmount = (amount: number) =>
    `₹${amount.toLocaleString('en-IN', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    })}`;

  const handleCheckout = async () => {
    if (cart.length === 0 || isSubmitting) return;
    if (!customerSession) {
      setCheckoutError('Please sign in with your Name, Mobile & Email before placing your order.');
      onNavigateLogin?.();
      return;
    }
    setCheckoutState('submitting');
    setCheckoutError('');
    try {
      await onCheckout(paymentMode, pointsToRedeem);
      setCheckoutState('idle');
    } catch (error) {
      setCheckoutState('error');
      setCheckoutError(error instanceof Error ? error.message : 'Unable to place order');
    }
  };

  // Empty Cart State styled matching the app's clean UI
  if (cart.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-20 px-4 text-center max-w-sm mx-auto">
        <div className="w-24 h-24 rounded-full bg-surface-container flex items-center justify-center text-[#FF6422] mb-5 shadow-lg border border-outline-variant/15">
          <span className="material-symbols-outlined text-[48px]">shopping_bag</span>
        </div>
        <h2 className="text-xl sm:text-2xl font-black text-on-surface tracking-tight">
          Your Cart is Empty
        </h2>
        <p className="text-xs sm:text-sm text-on-surface-variant mt-2 leading-relaxed">
          Looks like you haven&apos;t added any food yet. Discover our delicious pizzas, burgers, pasta, and drinks!
        </p>
        <button
          type="button"
          onClick={onBrowseMenu}
          className="mt-6 px-8 py-3.5 rounded-full bg-[#FF6422] hover:bg-[#E55518] text-white font-black text-xs sm:text-sm shadow-[0_8px_24px_rgba(255,100,34,0.35)] active:scale-95 transition-all cursor-pointer inline-flex items-center gap-2"
        >
          <span className="material-symbols-outlined text-[18px]">restaurant_menu</span>
          <span>Explore Menu</span>
        </button>
      </div>
    );
  }

  return (
    <div className="flex flex-col w-full pb-28 pt-1 space-y-4">
      {screenStep === 'cart' ? (
        /* ========================================================
           SCREEN 7: YOUR CART (Matches Reference Image Screen 7)
           ======================================================== */
        <>
          {/* Top Header */}
          <div className="flex items-center justify-between pb-1">
            <button
              type="button"
              onClick={onBrowseMenu}
              aria-label="Back to Menu"
              className="w-9 h-9 rounded-full bg-white border border-[#EAE2D7] flex items-center justify-center text-[#1F1610] shadow-xs hover:bg-[#F5EFE8] transition-colors cursor-pointer shrink-0"
            >
              <span className="material-symbols-outlined text-[20px]">arrow_back</span>
            </button>

            <h1 className="text-base sm:text-lg font-bold text-[#1F1610] tracking-tight font-serif">
              Your Cart
            </h1>

            <div className="w-9" />
          </div>

          {/* Cart Items List (Panel 7) */}
          <div className="space-y-2.5">
            {cart.map((item) => (
              <div
                key={item.menuItemId}
                className="flex items-center justify-between gap-3 p-3.5 rounded-2xl bg-white border border-[#EAE2D7] shadow-xs"
              >
                {/* Food Thumbnail */}
                <div className="w-14 h-14 sm:w-16 sm:h-16 rounded-xl overflow-hidden bg-[#FAF7F2] shrink-0 border border-[#EAE2D7]">
                  <CafeImage
                    src={item.imageUrl}
                    alt={item.name}
                    className="w-full h-full object-cover"
                    fallbackIcon="restaurant"
                  />
                </div>

                {/* Title & Price */}
                <div className="flex-1 min-w-0">
                  <h3 className="font-bold text-xs sm:text-sm text-[#1F1610] truncate">
                    {item.name}
                  </h3>
                  <p className="text-[10px] text-[#7A7067] truncate mt-0.5">
                    {item.note || 'Regular (250 ml)'}
                  </p>
                  <div className="font-bold text-xs sm:text-sm text-[#1F1610] mt-1">
                    ₹{item.price * item.quantity}
                  </div>
                </div>

                {/* Quantity Counter Pill [ - 1 + ] */}
                <div className="flex items-center gap-2 bg-[#FAF7F2] px-2.5 py-1 rounded-full border border-[#EAE2D7]">
                  <button
                    type="button"
                    aria-label={`Decrease ${item.name}`}
                    onClick={() => onUpdateQty(item.menuItemId, -1)}
                    className="w-5 h-5 flex items-center justify-center text-[#1F1610] font-bold text-xs cursor-pointer hover:bg-[#EAE2D7] rounded-full"
                  >
                    –
                  </button>
                  <span className="text-xs font-bold text-[#1F1610] min-w-[14px] text-center tabular-nums">
                    {item.quantity}
                  </span>
                  <button
                    type="button"
                    aria-label={`Increase ${item.name}`}
                    onClick={() => onUpdateQty(item.menuItemId, 1)}
                    className="w-5 h-5 flex items-center justify-center text-[#1F1610] font-bold text-xs cursor-pointer hover:bg-[#EAE2D7] rounded-full"
                  >
                    +
                  </button>
                </div>
              </div>
            ))}
          </div>

          {/* Apply Coupon Card (Panel 7) */}
          <div className="rounded-2xl bg-white border border-[#EAE2D7] p-3.5 shadow-xs space-y-2">
            <button
              type="button"
              onClick={() => setCouponExpanded(!couponExpanded)}
              className="w-full flex items-center justify-between text-left cursor-pointer"
            >
              <div className="flex items-center gap-2.5">
                <span className="material-symbols-outlined text-[20px] text-[#C67C4E]">
                  local_offer
                </span>
                <span className="text-xs font-bold text-[#1F1610]">
                  {couponCode ? `Coupon Applied: ${couponCode}` : 'Apply Coupon'}
                </span>
              </div>
              <span className="material-symbols-outlined text-[18px] text-[#7A7067]">
                {couponExpanded ? 'expand_less' : 'chevron_right'}
              </span>
            </button>

            {couponExpanded && (
              <div className="pt-2 space-y-2 border-t border-[#F5EFE8]">
                <div className="flex items-center gap-2">
                  <input
                    type="text"
                    value={couponDraft}
                    onChange={(e) => setCouponDraft(e.target.value)}
                    placeholder="Enter coupon code"
                    className="w-full bg-[#FAF7F2] px-3 py-2 rounded-xl text-xs font-bold text-[#1F1610] uppercase border border-[#EAE2D7] focus:outline-none focus:ring-1 focus:ring-[#382319]"
                  />
                  <button
                    type="button"
                    onClick={() => onCouponChange(couponDraft.trim().toUpperCase())}
                    className="px-4 py-2 rounded-xl bg-[#382319] text-white text-xs font-bold shrink-0 cursor-pointer"
                  >
                    Apply
                  </button>
                </div>

                {campaigns.filter((c) => c.status === 'active').length > 0 && (
                  <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar pt-1">
                    {campaigns
                      .filter((c) => c.status === 'active')
                      .map((c) => (
                        <button
                          key={c.id}
                          type="button"
                          onClick={() => {
                            setCouponDraft(c.code);
                            onCouponChange(c.code);
                          }}
                          className={`shrink-0 px-2.5 py-1 rounded-full text-[10px] font-bold border transition-colors ${
                            couponCode.toUpperCase() === c.code.toUpperCase()
                              ? 'bg-[#382319] text-white border-[#382319]'
                              : 'bg-white text-[#7A7067] border-[#EAE2D7]'
                          }`}
                        >
                          {c.code}
                        </button>
                      ))}
                  </div>
                )}
              </div>
            )}

            {totals.couponApplied && (
              <p className="text-[11px] font-bold text-emerald-700">
                ✓ {totals.discountLabel || `${couponCode} applied!`}
              </p>
            )}
            {totals.couponError && (
              <p className="text-[11px] font-bold text-red-600">{totals.couponError}</p>
            )}
          </div>

          {/* Bill Details (Panel 7) */}
          <div className="rounded-2xl bg-white border border-[#EAE2D7] p-4 shadow-xs space-y-2.5">
            <div className="flex justify-between text-xs text-[#7A7067]">
              <span>Subtotal</span>
              <span className="font-semibold text-[#1F1610]">
                {formatBillingAmount(totals.subtotal)}
              </span>
            </div>

            {totals.discount > 0 && (
              <div className="flex justify-between text-xs text-emerald-700 font-bold">
                <span>Discount</span>
                <span>-{formatBillingAmount(totals.discount)}</span>
              </div>
            )}

            <div className="flex justify-between text-xs text-[#7A7067]">
              <span>Delivery Fee</span>
              <span className="font-semibold text-[#1F1610]">
                {serviceMode === 'dine-in' ? '₹0 (Dine-in)' : '₹0'}
              </span>
            </div>

            <div className="flex justify-between text-xs text-[#7A7067]">
              <span>Taxes (5% included)</span>
              <span className="font-semibold text-[#1F1610]">
                {formatBillingAmount(totals.tax)} included
              </span>
            </div>

            <div className="border-t border-[#F5EFE8] pt-2 flex justify-between items-baseline">
              <span className="font-serif font-bold text-base text-[#1F1610]">Total</span>
              <span className="font-serif font-black text-xl text-[#1F1610]">
                {formatINR(totals.total)}
              </span>
            </div>
          </div>

          {/* Full-Width Espresso Button: Proceed to Checkout -> */}
          <div className="pt-2">
            <button
              type="button"
              onClick={() => setScreenStep('checkout')}
              className="w-full py-4 rounded-2xl bg-[#382319] hover:bg-[#2B1B13] text-white text-sm font-bold tracking-wide shadow-md transition-all cursor-pointer active:scale-[0.98] flex items-center justify-center gap-2"
            >
              <span>Proceed to Checkout</span>
              <span className="material-symbols-outlined text-[18px]">arrow_forward</span>
            </button>
          </div>
        </>
      ) : (
        /* ========================================================
           SCREEN 8: CHECKOUT (Matches Reference Image Screen 8)
           ======================================================== */
        <>
          {/* Top Header */}
          <div className="flex items-center justify-between pb-1">
            <button
              type="button"
              onClick={() => setScreenStep('cart')}
              aria-label="Back to Cart"
              className="w-9 h-9 rounded-full bg-white border border-[#EAE2D7] flex items-center justify-center text-[#1F1610] shadow-xs hover:bg-[#F5EFE8] transition-colors cursor-pointer shrink-0"
            >
              <span className="material-symbols-outlined text-[20px]">arrow_back</span>
            </button>

            <h1 className="text-base sm:text-lg font-bold text-[#1F1610] tracking-tight font-serif">
              Checkout
            </h1>

            <div className="w-9" />
          </div>

          {/* Stepper (Address -> Payment -> Confirm) */}
          <div className="flex items-center justify-center gap-6 py-2">
            <div className="flex items-center gap-1.5 text-xs font-bold text-[#382319]">
              <span className="w-5 h-5 rounded-full bg-[#382319] text-white text-[10px] flex items-center justify-center">
                ✓
              </span>
              <span>Address</span>
            </div>
            <div className="w-8 h-px bg-[#EAE2D7]" />
            <div className="flex items-center gap-1.5 text-xs font-bold text-[#382319]">
              <span className="w-5 h-5 rounded-full bg-[#382319] text-white text-[10px] flex items-center justify-center">
                2
              </span>
              <span>Payment</span>
            </div>
            <div className="w-8 h-px bg-[#EAE2D7]" />
            <div className="flex items-center gap-1.5 text-xs font-medium text-[#8C7E74]">
              <span className="w-5 h-5 rounded-full bg-[#F5EFE8] text-[#8C7E74] text-[10px] flex items-center justify-center border border-[#EAE2D7]">
                3
              </span>
              <span>Confirm</span>
            </div>
          </div>

          {/* Delivery Address Card (Panel 8) */}
          <div className="rounded-2xl bg-white border border-[#EAE2D7] p-4 shadow-xs space-y-1">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-[#1F1610]">Delivery Address</span>
              <button
                type="button"
                onClick={onNavigateLogin}
                className="text-xs font-bold text-[#C67C4E] hover:underline cursor-pointer"
              >
                Change
              </button>
            </div>
            <div className="flex items-start gap-2.5 pt-1">
              <div className="w-7 h-7 rounded-full bg-[#FAF7F2] border border-[#EAE2D7] flex items-center justify-center text-[#382319] shrink-0 mt-0.5">
                <span className="material-symbols-outlined text-[16px]">home</span>
              </div>
              <div>
                <p className="text-xs font-bold text-[#1F1610]">Home</p>
                <p className="text-[11px] text-[#7A7067]">
                  {customerSession
                    ? `${customerSession.name}, Sanganer, Jaipur, Rajasthan 302029`
                    : 'Sanganer, Jaipur, Rajasthan 302029'}
                </p>
              </div>
            </div>
          </div>

          {/* Delivery Type Selector (Panel 8: Delivery, Takeaway, Dine-in) */}
          <div>
            <label className="block text-xs font-bold text-[#1F1610] mb-2">
              Delivery Type
            </label>
            <div className="grid grid-cols-3 gap-2">
              {[
                {
                  mode: 'delivery' as ServiceMode,
                  label: 'Delivery',
                  sub: '20-30 min',
                  icon: 'two_wheeler',
                },
                {
                  mode: 'takeaway' as ServiceMode,
                  label: 'Takeaway',
                  sub: 'Ready in 15 min',
                  icon: 'shopping_bag',
                },
                {
                  mode: 'dine-in' as ServiceMode,
                  label: 'Dine-in',
                  sub: `Table ${selectedTable.replace('T', '') || '3'}`,
                  icon: 'table_restaurant',
                },
              ].map((opt, i) => {
                const isSelected = serviceMode === opt.mode;
                return (
                  <button
                    key={`${opt.label}-${i}`}
                    type="button"
                    onClick={() => {
                      if (opt.label === 'Dine-in') {
                        setIsBookTableOpen(true);
                      } else {
                        onServiceModeChange?.(opt.mode);
                      }
                    }}
                    className={`p-3 rounded-2xl flex flex-col items-center gap-1 text-center transition-all cursor-pointer ${
                      isSelected
                        ? 'bg-[#F8EFE6] border-2 border-[#382319] shadow-xs'
                        : 'bg-white border border-[#EAE2D7] hover:bg-[#FAF7F2]'
                    }`}
                  >
                    <span className="material-symbols-outlined text-[20px] text-[#382319]">
                      {opt.icon}
                    </span>
                    <span className="text-xs font-bold text-[#1F1610]">{opt.label}</span>
                    <span className="text-[10px] text-[#7A7067]">{opt.sub}</span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Payment Method Selector (Panel 8) */}
          <div className="rounded-2xl bg-white border border-[#EAE2D7] p-4 shadow-xs space-y-2">
            <span className="text-xs font-bold text-[#1F1610] block">Payment Method</span>

            <div className="space-y-2">
              <button
                type="button"
                onClick={() => setPaymentMode('upi')}
                className={`w-full p-3 rounded-xl border flex items-center justify-between transition-colors cursor-pointer ${
                  paymentMode === 'upi'
                    ? 'border-[#382319] bg-[#F8EFE6]'
                    : 'border-[#EAE2D7] bg-white hover:bg-[#FAF7F2]'
                }`}
              >
                <div className="flex items-center gap-2.5">
                  <span className="material-symbols-outlined text-[20px] text-[#382319]">
                    qr_code_scanner
                  </span>
                  <div className="text-left">
                    <p className="text-xs font-bold text-[#1F1610]">UPI (GPay, PhonePe, etc.)</p>
                    <p className="text-[10px] text-[#7A7067]">Instant cashless payment</p>
                  </div>
                </div>
                <div
                  className={`w-4 h-4 rounded-full border-2 flex items-center justify-center ${
                    paymentMode === 'upi' ? 'border-[#382319]' : 'border-[#EAE2D7]'
                  }`}
                >
                  {paymentMode === 'upi' && <div className="w-2 h-2 rounded-full bg-[#382319]" />}
                </div>
              </button>

              <button
                type="button"
                onClick={() => setPaymentMode('cash')}
                className={`w-full p-3 rounded-xl border flex items-center justify-between transition-colors cursor-pointer ${
                  paymentMode === 'cash'
                    ? 'border-[#382319] bg-[#F8EFE6]'
                    : 'border-[#EAE2D7] bg-white hover:bg-[#FAF7F2]'
                }`}
              >
                <div className="flex items-center gap-2.5">
                  <span className="material-symbols-outlined text-[20px] text-[#382319]">
                    payments
                  </span>
                  <div className="text-left">
                    <p className="text-xs font-bold text-[#1F1610]">Pay at Counter</p>
                    <p className="text-[10px] text-[#7A7067]">Cash or Card at desk</p>
                  </div>
                </div>
                <div
                  className={`w-4 h-4 rounded-full border-2 flex items-center justify-center ${
                    paymentMode === 'cash' ? 'border-[#382319]' : 'border-[#EAE2D7]'
                  }`}
                >
                  {paymentMode === 'cash' && <div className="w-2 h-2 rounded-full bg-[#382319]" />}
                </div>
              </button>
            </div>
          </div>

          {/* Cooking Note */}
          <div className="rounded-2xl bg-white border border-[#EAE2D7] p-3 shadow-xs flex items-center gap-2">
            <span className="material-symbols-outlined text-[18px] text-[#8C7E74]">edit_note</span>
            <input
              type="text"
              value={cookingNote}
              onChange={(e) => onCookingNoteChange(e.target.value)}
              placeholder="Any special cooking note for chef?"
              className="text-xs bg-transparent w-full text-[#1F1610] placeholder:text-[#8C7E74] focus:outline-none"
            />
          </div>

          {/* Customer Sign-in Status Banner */}
          {!customerSession && (
            <div className="p-3.5 rounded-2xl bg-amber-50 border border-amber-200 flex items-center justify-between">
              <div>
                <p className="text-xs font-bold text-amber-900">Sign in to place order</p>
                <p className="text-[10px] text-amber-700">Link your name & phone to this order</p>
              </div>
              {onNavigateLogin && (
                <button
                  type="button"
                  onClick={onNavigateLogin}
                  className="px-3 py-1.5 rounded-xl bg-[#382319] text-white text-xs font-bold shadow-xs cursor-pointer"
                >
                  Sign In
                </button>
              )}
            </div>
          )}

          {checkoutError && (
            <p className="text-xs text-red-600 bg-red-50 border border-red-200 p-3 rounded-xl font-medium">
              {checkoutError}
            </p>
          )}

          {/* Total & Place Order Button (Panel 8) */}
          <div className="pt-2 flex items-center justify-between gap-4">
            <div>
              <span className="text-[11px] text-[#7A7067] block">Total</span>
              <span className="font-serif font-black text-2xl text-[#1F1610]">
                {formatINR(totals.total)}
              </span>
            </div>

            <button
              type="button"
              disabled={isSubmitting}
              onClick={() => void handleCheckout()}
              className="flex-1 py-4 rounded-2xl bg-[#382319] hover:bg-[#2B1B13] text-white text-sm font-bold tracking-wide shadow-md transition-all cursor-pointer active:scale-[0.98] disabled:opacity-50 flex items-center justify-center gap-2"
            >
              {isSubmitting ? (
                <span>Placing Order...</span>
              ) : (
                <>
                  <span>Place Order</span>
                  <span className="material-symbols-outlined text-[18px]">arrow_forward</span>
                </>
              )}
            </button>
          </div>
        </>
      )}

      {/* Brewing Order Overlay */}
      {isSubmitting && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 animate-fade-in">
          <div className="w-full max-w-sm rounded-3xl bg-white border border-[#EAE2D7] p-6 shadow-2xl">
            <CoffeeBrewLoader
              size="md"
              title="Sending to Kitchen"
              subtitle="Preparing your order..."
            />
          </div>
        </div>
      )}

      {/* Book a Table Modal (Panel 11) */}
      <BookTableModal
        isOpen={isBookTableOpen}
        onClose={() => setIsBookTableOpen(false)}
        onConfirm={async (details) => {
          const tableId = await onReserveTable(details);
          onTableChange?.(tableId);
          onServiceModeChange?.('dine-in');
          return tableId;
        }}
      />
    </div>
  );
};
