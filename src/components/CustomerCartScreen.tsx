import React, { useEffect, useState } from 'react';
import type { CafeTable, CartItem, PaymentMode, PromoCampaign, ServiceMode } from '../types/cafe';
import type { CustomerAuthSession } from '../lib/supabaseClient';
import {
  calculateCartTotals,
  formatINR,
  isCampaignAutomaticallyRedeemable,
} from '../utils/cafeLogic';
import { CafeImage } from './CafeImage';
import { CustomerFooter } from './CustomerFooter';
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
  deliveryAddress: string;
  onNavigateLogin?: () => void;
  onOpenDeliveryLocation: () => void;
  onServiceModeChange?: (mode: ServiceMode) => void;
  onTableChange?: (table: string) => void;
  onReserveTable: (details: { guests: string }) => Promise<string>;
  onUpdateQty: (menuItemId: string, delta: number, size?: string) => void;
  onRemoveItem: (menuItemId: string, size?: string) => void;
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
  deliveryAddress,
  onNavigateLogin,
  onOpenDeliveryLocation,
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
  useEffect(() => {
    if (deliveryAddress.trim().length >= 5) setCheckoutError('');
  }, [deliveryAddress]);

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
    if (serviceMode === 'delivery' && deliveryAddress.trim().length < 5) {
      setCheckoutError('Add a delivery address before placing a delivery order.');
      onOpenDeliveryLocation();
      return;
    }
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
      <>
        <div className="flex flex-col items-center justify-center py-20 px-4 text-center max-w-sm mx-auto">
          <div className="w-24 h-24 rounded-full overflow-hidden border-2 border-[#D4AF37]/60 shadow-lg mb-4 bg-black p-0.5 mx-auto">
            <img src="/images/tsc-logo.jpg" alt="The Sawariya Cafe" className="w-full h-full object-cover rounded-full" />
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
            className="mt-6 px-8 py-3.5 rounded-full bg-primary hover:brightness-90 text-white font-black text-xs sm:text-sm shadow-[0_8px_24px_rgba(255,100,34,0.35)] active:scale-95 transition-all cursor-pointer inline-flex items-center gap-2"
          >
            <span className="material-symbols-outlined text-[18px]">restaurant_menu</span>
            <span>Explore Menu</span>
          </button>
        </div>
        <CustomerFooter />
      </>
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
              className="w-9 h-9 rounded-full bg-surface-container-low border border-outline-variant flex items-center justify-center text-on-surface shadow-xs hover:bg-surface-container-high transition-colors cursor-pointer shrink-0"
            >
              <span className="material-symbols-outlined text-[20px]">arrow_back</span>
            </button>

            <div className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-full overflow-hidden border border-[#D4AF37]/60 shadow-xs bg-black p-0.5 shrink-0">
                <img src="/images/tsc-logo.jpg" alt="The Sawariya Cafe" className="w-full h-full object-cover rounded-full" />
              </div>
              <h1 className="text-base sm:text-lg font-bold text-on-surface tracking-tight font-serif">
                Your Cart
              </h1>
            </div>

            <div className="w-9" />
          </div>

          {/* Cart Items List (Panel 7) */}
          <div className="space-y-2.5">
            {cart.map((item) => (
              <div
                key={`${item.menuItemId}-${item.size ?? 'Regular'}`}
                className="flex items-center justify-between gap-3 p-3.5 rounded-2xl bg-surface-container-low border border-outline-variant shadow-xs"
              >
                {/* Food Thumbnail */}
                <div className="w-14 h-14 sm:w-16 sm:h-16 rounded-xl overflow-hidden bg-surface-container shrink-0 border border-outline-variant">
                  <CafeImage
                    src={item.imageUrl}
                    alt={item.name}
                    productId={item.menuItemId}
                    className="w-full h-full object-cover"
                    fallbackIcon="restaurant"
                  />
                </div>

                {/* Title & Price */}
                <div className="flex-1 min-w-0">
                  <h3 className="font-bold text-xs sm:text-sm text-on-surface truncate">
                    {item.name}
                  </h3>
                  <p className="text-[10px] text-on-surface-variant truncate mt-0.5">
                    {item.size || item.note || 'Regular'}
                  </p>
                  <div className="font-bold text-xs sm:text-sm text-on-surface mt-1">
                    ₹{item.price * item.quantity}
                  </div>
                </div>

                {/* Quantity Counter Pill [ - 1 + ] */}
                <div className="flex items-center gap-2 bg-surface-container px-2.5 py-1 rounded-full border border-outline-variant">
                  <button
                    type="button"
                    aria-label={`Decrease ${item.name}`}
                    onClick={() => onUpdateQty(item.menuItemId, -1, item.size)}
                    className="w-5 h-5 flex items-center justify-center text-on-surface font-bold text-xs cursor-pointer hover:bg-outline-variant rounded-full"
                  >
                    –
                  </button>
                  <span className="text-xs font-bold text-on-surface min-w-[14px] text-center tabular-nums">
                    {item.quantity}
                  </span>
                  <button
                    type="button"
                    aria-label={`Increase ${item.name}`}
                    onClick={() => onUpdateQty(item.menuItemId, 1, item.size)}
                    className="w-5 h-5 flex items-center justify-center text-on-surface font-bold text-xs cursor-pointer hover:bg-outline-variant rounded-full"
                  >
                    +
                  </button>
                </div>
              </div>
            ))}
          </div>

          {/* Delivery & Prep Time Perks Banner */}
          <div className="rounded-2xl bg-gradient-to-r from-surface-container-low to-surface-container border border-outline-variant p-3.5 shadow-xs space-y-2">
            <div className="flex items-center justify-between text-xs">
              <div className="flex items-center gap-2">
                <span className="material-symbols-outlined text-primary text-[18px]">
                  {serviceMode === 'delivery' && totals.subtotal >= 249
                    ? 'check_circle'
                    : 'moped'}
                </span>
                <span className="font-bold text-on-surface">
                  {serviceMode !== 'delivery'
                    ? 'Free delivery offers apply to delivery orders'
                    : totals.subtotal >= 249
                      ? '🎉 Free Delivery Threshold Reached (Up to 1 KM)!'
                      : `Add ₹${Math.max(0, 249 - totals.subtotal)} more for Free Delivery`}
                </span>
              </div>
              <span className="text-[10px] font-bold text-on-surface-variant bg-surface-container px-2 py-0.5 rounded-full border border-outline-variant">
                1 KM • Min. ₹249
              </span>
            </div>

            {/* Progress bar */}
            <div className="w-full bg-surface-container h-1.5 rounded-full overflow-hidden">
              <div
                className="bg-primary h-full rounded-full transition-all duration-300"
                style={{
                  width: `${
                    serviceMode === 'delivery'
                      ? Math.min(100, Math.round((totals.subtotal / 249) * 100))
                      : 0
                  }%`,
                }}
              />
            </div>

            <div className="flex items-center justify-between pt-1 text-[11px] text-on-surface-variant flex-wrap gap-2">
              <span className="flex items-center gap-1">
                <span className="material-symbols-outlined text-[14px] text-primary">timer</span>
                <span>Prep: 10–15m regular • 15–20m special</span>
              </span>
              <span className="flex items-center gap-1">
                <span className="material-symbols-outlined text-[14px] text-indigo-600">table_restaurant</span>
                <span>Table number service available</span>
              </span>
            </div>
          </div>

          {/* Apply Coupon Card (Panel 7) */}
          <div className="rounded-2xl bg-surface-container-low border border-outline-variant p-3.5 shadow-xs space-y-2">
            <button
              type="button"
              onClick={() => setCouponExpanded(!couponExpanded)}
              className="w-full flex items-center justify-between text-left cursor-pointer"
            >
              <div className="flex items-center gap-2.5">
                <span className="material-symbols-outlined text-[20px] text-[#C67C4E]">
                  local_offer
                </span>
                <span className="text-xs font-bold text-on-surface">
                  {totals.couponApplied
                    ? `Coupon Applied: ${couponCode}`
                    : couponCode
                      ? `Coupon Selected: ${couponCode}`
                      : 'Apply Coupon'}
                </span>
              </div>
              <span className="material-symbols-outlined text-[18px] text-on-surface-variant">
                {couponExpanded ? 'expand_less' : 'chevron_right'}
              </span>
            </button>

            {couponExpanded && (
              <div className="pt-2 space-y-2 border-t border-outline-variant/50">
                <div className="flex items-center gap-2">
                  <input
                    type="text"
                    value={couponDraft}
                    onChange={(e) => setCouponDraft(e.target.value)}
                    placeholder="Enter coupon code"
                    className="w-full bg-surface-container px-3 py-2 rounded-xl text-xs font-bold text-on-surface uppercase border border-outline-variant focus:outline-none focus:ring-1 focus:ring-primary"
                  />
                  <button
                    type="button"
                    onClick={() => onCouponChange(couponDraft.trim().toUpperCase())}
                    className="px-4 py-2 rounded-xl bg-primary text-white text-xs font-bold shrink-0 cursor-pointer"
                  >
                    Apply
                  </button>
                </div>

                {campaigns.filter((c) => c.status === 'active').length > 0 && (
                  <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar pt-1">
                    {campaigns
                      .filter(
                        (campaign) =>
                          campaign.status === 'active' &&
                          isCampaignAutomaticallyRedeemable(campaign)
                      )
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
                              ? 'bg-primary text-white border-primary'
                              : 'bg-surface-container-low text-on-surface-variant border-outline-variant'
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
              <p className="text-[11px] font-bold text-error">{totals.couponError}</p>
            )}
          </div>

          {/* Bill Details (Panel 7) */}
          <div className="rounded-2xl bg-surface-container-low border border-outline-variant p-4 shadow-xs space-y-2.5">
            <div className="flex justify-between text-xs text-on-surface-variant">
              <span>Subtotal</span>
              <span className="font-semibold text-on-surface">
                {formatBillingAmount(totals.subtotal)}
              </span>
            </div>

            {totals.discount > 0 && (
              <div className="flex justify-between text-xs text-emerald-700 font-bold">
                <span>Discount</span>
                <span>-{formatBillingAmount(totals.discount)}</span>
              </div>
            )}

            <div className="flex justify-between text-xs text-on-surface-variant">
              <span>Delivery Fee</span>
              <span className="font-semibold text-on-surface">
                {serviceMode === 'dine-in' ? '₹0 (Dine-in)' : '₹0'}
              </span>
            </div>

            <div className="flex justify-between text-xs text-on-surface-variant">
              <span>Taxes (5% included)</span>
              <span className="font-semibold text-on-surface">
                {formatBillingAmount(totals.tax)} included
              </span>
            </div>

            <div className="border-t border-outline-variant/50 pt-2 flex justify-between items-baseline">
              <span className="font-serif font-bold text-base text-on-surface">Total</span>
              <span className="font-serif font-black text-xl text-on-surface">
                {formatINR(totals.total)}
              </span>
            </div>
          </div>

          {/* Full-Width Espresso Button: Proceed to Checkout -> */}
          <div className="pt-2">
            <button
              type="button"
              onClick={() => setScreenStep('checkout')}
              className="w-full py-4 rounded-2xl bg-primary hover:brightness-90 text-white text-sm font-bold tracking-wide shadow-md transition-all cursor-pointer active:scale-[0.98] flex items-center justify-center gap-2"
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
              className="w-9 h-9 rounded-full bg-surface-container-low border border-outline-variant flex items-center justify-center text-on-surface shadow-xs hover:bg-surface-container-high transition-colors cursor-pointer shrink-0"
            >
              <span className="material-symbols-outlined text-[20px]">arrow_back</span>
            </button>

            <h1 className="text-base sm:text-lg font-bold text-on-surface tracking-tight font-serif">
              Checkout
            </h1>

            <div className="w-9" />
          </div>

          {/* Stepper (Address -> Payment -> Confirm) */}
          <div className="flex items-center justify-center gap-6 py-2">
            <div className="flex items-center gap-1.5 text-xs font-bold text-primary">
              <span className="w-5 h-5 rounded-full bg-primary text-white text-[10px] flex items-center justify-center">
                ✓
              </span>
              <span>Address</span>
            </div>
            <div className="w-8 h-px bg-outline-variant" />
            <div className="flex items-center gap-1.5 text-xs font-bold text-primary">
              <span className="w-5 h-5 rounded-full bg-primary text-white text-[10px] flex items-center justify-center">
                2
              </span>
              <span>Payment</span>
            </div>
            <div className="w-8 h-px bg-outline-variant" />
            <div className="flex items-center gap-1.5 text-xs font-medium text-on-surface-variant">
              <span className="w-5 h-5 rounded-full bg-surface-container-high text-on-surface-variant text-[10px] flex items-center justify-center border border-outline-variant">
                3
              </span>
              <span>Confirm</span>
            </div>
          </div>

          {serviceMode === 'delivery' && (
            <div className="rounded-2xl bg-surface-container-low border border-outline-variant p-4 shadow-xs space-y-1">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-on-surface">Delivery Address</span>
                <button
                  type="button"
                  onClick={onOpenDeliveryLocation}
                  className="text-xs font-bold text-[#C67C4E] hover:underline cursor-pointer"
                >
                  {deliveryAddress ? 'Change' : 'Add address'}
                </button>
              </div>
              <div className="flex items-start gap-2.5 pt-1">
                <div className="w-7 h-7 rounded-full bg-surface-container border border-outline-variant flex items-center justify-center text-primary shrink-0 mt-0.5">
                  <span className="material-symbols-outlined text-[16px]">home</span>
                </div>
                <div>
                  <p className="text-xs font-bold text-on-surface">
                    {customerSession?.name || 'Delivery location'}
                  </p>
                  <p className="text-[11px] text-on-surface-variant">
                    {deliveryAddress || 'Add an address to continue with delivery.'}
                  </p>
                </div>
              </div>
            </div>
          )}

          {/* Delivery Type Selector (Panel 8: Delivery, Takeaway, Dine-in) */}
          <div>
            <label className="block text-xs font-bold text-on-surface mb-2">
              Delivery Type
            </label>
            <div className="grid grid-cols-3 gap-2">
              {[
                {
                  mode: 'delivery' as ServiceMode,
                  label: 'Delivery',
                  sub: 'Free ≤1 km (₹249+)',
                  icon: 'two_wheeler',
                },
                {
                  mode: 'takeaway' as ServiceMode,
                  label: 'Takeaway',
                  sub: '10–15 min prep',
                  icon: 'shopping_bag',
                },
                {
                  mode: 'dine-in' as ServiceMode,
                  label: 'Dine-in',
                  sub: selectedTable ? `Table ${selectedTable.replace('T', '')}` : 'Table Service',
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
                    className={`p-2 sm:p-3 rounded-2xl flex flex-col items-center gap-1 text-center transition-all cursor-pointer min-w-0 ${
                      isSelected
                        ? 'bg-primary/10 border-2 border-primary shadow-xs'
                        : 'bg-surface-container-low border border-outline-variant hover:bg-surface-container'
                    }`}
                  >
                    <span className="material-symbols-outlined text-[18px] sm:text-[20px] text-primary">
                      {opt.icon}
                    </span>
                    <span className="text-[11px] sm:text-xs font-bold text-on-surface truncate max-w-full">{opt.label}</span>
                    <span className="text-[9px] sm:text-[10px] text-on-surface-variant truncate max-w-full">{opt.sub}</span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Payment Method Selector (Panel 8) */}
          <div className="rounded-2xl bg-surface-container-low border border-outline-variant p-4 shadow-xs space-y-2">
            <span className="text-xs font-bold text-on-surface block">Payment Method</span>

            <div className="space-y-2">
              <button
                type="button"
                onClick={() => setPaymentMode('upi')}
                className={`w-full p-3 rounded-xl border flex items-center justify-between transition-colors cursor-pointer ${
                  paymentMode === 'upi'
                    ? 'border-primary bg-primary/10'
                    : 'border-outline-variant bg-surface-container-low hover:bg-surface-container'
                }`}
              >
                <div className="flex items-center gap-2.5">
                  <span className="material-symbols-outlined text-[20px] text-primary">
                    qr_code_scanner
                  </span>
                  <div className="text-left">
                    <p className="text-xs font-bold text-on-surface">UPI (GPay, PhonePe, etc.)</p>
                    <p className="text-[10px] text-on-surface-variant">Instant cashless payment</p>
                  </div>
                </div>
                <div
                  className={`w-4 h-4 rounded-full border-2 flex items-center justify-center ${
                    paymentMode === 'upi' ? 'border-primary' : 'border-outline-variant'
                  }`}
                >
                  {paymentMode === 'upi' && <div className="w-2 h-2 rounded-full bg-primary" />}
                </div>
              </button>

              <button
                type="button"
                onClick={() => setPaymentMode('cash')}
                className={`w-full p-3 rounded-xl border flex items-center justify-between transition-colors cursor-pointer ${
                  paymentMode === 'cash'
                    ? 'border-primary bg-primary/10'
                    : 'border-outline-variant bg-surface-container-low hover:bg-surface-container'
                }`}
              >
                <div className="flex items-center gap-2.5">
                  <span className="material-symbols-outlined text-[20px] text-primary">
                    payments
                  </span>
                  <div className="text-left">
                    <p className="text-xs font-bold text-on-surface">Pay at Counter</p>
                    <p className="text-[10px] text-on-surface-variant">Cash or Card at desk</p>
                  </div>
                </div>
                <div
                  className={`w-4 h-4 rounded-full border-2 flex items-center justify-center ${
                    paymentMode === 'cash' ? 'border-primary' : 'border-outline-variant'
                  }`}
                >
                  {paymentMode === 'cash' && <div className="w-2 h-2 rounded-full bg-primary" />}
                </div>
              </button>
            </div>
          </div>

          {/* Cooking Note */}
          <div className="rounded-2xl bg-surface-container-low border border-outline-variant p-3 shadow-xs flex items-center gap-2">
            <span className="material-symbols-outlined text-[18px] text-on-surface-variant">edit_note</span>
            <input
              type="text"
              value={cookingNote}
              onChange={(e) => onCookingNoteChange(e.target.value)}
              placeholder="Any special cooking note for chef?"
              className="text-xs bg-transparent w-full text-on-surface placeholder:text-on-surface-variant focus:outline-none"
            />
          </div>

          {/* Customer Sign-in Status Banner */}
          {!customerSession && (
            <div className="p-3.5 rounded-2xl bg-amber-500/10 border border-amber-500/25 flex items-center justify-between">
              <div>
                <p className="text-xs font-bold text-amber-900">Sign in to place order</p>
                <p className="text-[10px] text-amber-300">Link your name & phone to this order</p>
              </div>
              {onNavigateLogin && (
                <button
                  type="button"
                  onClick={onNavigateLogin}
                  className="px-3 py-1.5 rounded-xl bg-primary text-white text-xs font-bold shadow-xs cursor-pointer"
                >
                  Sign In
                </button>
              )}
            </div>
          )}

          {checkoutError && (
            <p className="text-xs text-error bg-red-50 border border-red-200 p-3 rounded-xl font-medium">
              {checkoutError}
            </p>
          )}

          {/* Total & Place Order Button (Panel 8) */}
          <div className="pt-2 flex items-center justify-between gap-4">
            <div>
              <span className="text-[11px] text-on-surface-variant block">Total</span>
              <span className="font-serif font-black text-2xl text-on-surface">
                {formatINR(totals.total)}
              </span>
            </div>

            <button
              type="button"
              disabled={isSubmitting}
              onClick={() => void handleCheckout()}
              className="flex-1 py-4 rounded-2xl bg-primary hover:brightness-90 text-white text-sm font-bold tracking-wide shadow-md transition-all cursor-pointer active:scale-[0.98] disabled:opacity-50 flex items-center justify-center gap-2"
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

          <p className="mt-2 text-center text-[10.5px] text-on-surface-variant/75 leading-relaxed">
            🔒 Protected under India&apos;s <strong>DPDP Act, 2023</strong>. Digital invoices &amp; order tokens are dispatched to your registered contact.
          </p>
        </>
      )}

      <CustomerFooter />

      {/* Brewing Order Overlay */}
      {isSubmitting && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 animate-fade-in">
          <div className="w-full max-w-sm rounded-3xl bg-surface-container-low border border-outline-variant p-6 shadow-2xl">
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
