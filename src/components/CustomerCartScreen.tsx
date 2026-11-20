import React, { useState } from 'react';
import type { CafeTable, CartItem, PaymentMode, PromoCampaign, ServiceMode } from '../types/cafe';
import type { CustomerAuthSession } from '../lib/supabaseClient';
import { calculateCartTotals, formatINR } from '../utils/cafeLogic';
import { CafeImage } from './CafeImage';
import { CoffeeBrewLoader } from './CoffeeBrewLoader';

interface CustomerCartScreenProps {
  cart: CartItem[];
  serviceMode: ServiceMode;
  selectedTable: string;
  tables?: CafeTable[];
  campaigns?: PromoCampaign[];
  availablePoints?: number;
  couponCode: string;
  cookingNote: string;
  customerSession?: CustomerAuthSession | null;
  onNavigateLogin?: () => void;
  onServiceModeChange?: (mode: ServiceMode) => void;
  onTableChange?: (table: string) => void;
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
  availablePoints = 0,
  couponCode,
  cookingNote,
  customerSession,
  onNavigateLogin,
  onServiceModeChange,
  onTableChange: _onTableChange,
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
  const isSubmitting = checkoutState === 'submitting';

  const pointsToRedeem = redeemPointsActive ? Math.min(availablePoints, 200) : 0;
  const totals = calculateCartTotals(
    cart,
    couponCode,
    serviceMode,
    false,
    campaigns,
    pointsToRedeem
  );

  const formatBillingAmount = (amount: number) =>
    `₹${amount.toLocaleString('en-IN', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    })}`;

  const taxableAmount = Number(
    Math.max(0, totals.subtotal - totals.discount - totals.tax).toFixed(2)
  );
  const cgst = Number((totals.tax / 2).toFixed(2));
  const sgst = Number((totals.tax - cgst).toFixed(2));

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
      {/* Header Bar */}
      <div className="flex items-center justify-between pb-2">
        <button
          type="button"
          onClick={onBrowseMenu}
          aria-label="Back to Menu"
          className="w-10 h-10 rounded-full bg-surface-container hover:bg-surface-container-high flex items-center justify-center text-on-surface transition-colors cursor-pointer shrink-0"
        >
          <span className="material-symbols-outlined text-[22px]">arrow_back</span>
        </button>

        <h1 className="text-lg font-black text-on-surface tracking-tight">My Cart</h1>

        {/* Dining Mode Pill */}
        <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-surface-container text-xs font-bold text-on-surface border border-outline-variant/15 shrink-0">
          <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
          <span className="text-[#FF6422]">
            {serviceMode === 'dine-in' ? `Table ${selectedTable.replace('T', '')}` : serviceMode}
          </span>
        </div>
      </div>

      {/* Service Mode Selector Switch (Dine-In / Takeaway) */}
      <div className="flex items-center justify-between p-1.5 rounded-2xl bg-surface-container border border-outline-variant/15 liquid-glass-card">
        <button
          type="button"
          onClick={() => onServiceModeChange?.('dine-in')}
          className={`flex-1 py-2 rounded-xl text-xs font-bold transition-all cursor-pointer flex items-center justify-center gap-1.5 ${
            serviceMode === 'dine-in'
              ? 'bg-[#FF6422] text-white shadow-md'
              : 'text-on-surface-variant hover:text-on-surface'
          }`}
        >
          <span className="material-symbols-outlined text-[16px]">table_restaurant</span>
          <span>Dine-In</span>
        </button>
        <button
          type="button"
          onClick={() => onServiceModeChange?.('takeaway')}
          className={`flex-1 py-2 rounded-xl text-xs font-bold transition-all cursor-pointer flex items-center justify-center gap-1.5 ${
            serviceMode === 'takeaway'
              ? 'bg-[#FF6422] text-white shadow-md'
              : 'text-on-surface-variant hover:text-on-surface'
          }`}
        >
          <span className="material-symbols-outlined text-[16px]">takeout_dining</span>
          <span>Takeaway</span>
        </button>
      </div>

      {/* Cart Items List */}
      <div className="space-y-3">
        <div className="flex items-center justify-between px-1">
          <h2 className="text-sm font-extrabold text-on-surface tracking-tight">
            Order Items ({totals.itemCount})
          </h2>
          <button
            type="button"
            onClick={onBrowseMenu}
            className="text-xs font-bold text-[#FF6422] hover:underline cursor-pointer"
          >
            + Add More
          </button>
        </div>

        {cart.map((item) => (
          <div
            key={item.menuItemId}
            className="group flex items-center justify-between gap-3.5 p-3.5 rounded-3xl bg-surface-container hover:bg-surface-container-high border border-outline-variant/15 shadow-sm transition-all liquid-glass-card"
          >
            {/* Circular Dish Image */}
            <div className="w-16 h-16 sm:w-20 sm:h-20 rounded-full overflow-hidden shrink-0 shadow-md ring-2 ring-outline-variant/10">
              <CafeImage
                src={item.imageUrl}
                alt={item.name}
                className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                fallbackIcon="restaurant"
              />
            </div>

            {/* Middle Item Info */}
            <div className="flex-1 min-w-0">
              <h3 className="text-xs sm:text-sm font-extrabold text-on-surface truncate">
                {item.name}
              </h3>
              {item.note && (
                <span className="inline-block text-[10px] text-on-surface-variant mt-0.5 truncate bg-surface-container-high px-2 py-0.5 rounded-full">
                  {item.note}
                </span>
              )}
              <div className="mt-1">
                <span className="text-sm sm:text-base font-black text-[#FF6422] tabular-nums">
                  ₹{item.price * item.quantity}
                </span>
                {item.quantity > 1 && (
                  <span className="text-[10px] text-on-surface-variant ml-1.5 tabular-nums">
                    (₹{item.price} each)
                  </span>
                )}
              </div>
            </div>

            {/* Right Quantity Counter & Remove */}
            <div className="flex flex-col items-end gap-2 shrink-0">
              <button
                type="button"
                aria-label={`Remove ${item.name}`}
                onClick={() => onRemoveItem(item.menuItemId)}
                className="text-outline hover:text-red-500 transition-colors p-1 cursor-pointer"
              >
                <span className="material-symbols-outlined text-[16px]">close</span>
              </button>

              <div className="flex items-center gap-2 px-2.5 py-1 rounded-full bg-surface border border-outline-variant/20 shadow-inner">
                <button
                  type="button"
                  aria-label={`Decrease quantity for ${item.name}`}
                  onClick={() => onUpdateQty(item.menuItemId, -1)}
                  className="w-6 h-6 rounded-full bg-surface-container hover:bg-surface-container-high flex items-center justify-center text-on-surface font-bold text-xs cursor-pointer transition-colors"
                >
                  –
                </button>
                <span className="text-xs font-black text-on-surface w-4 text-center tabular-nums">
                  {item.quantity}
                </span>
                <button
                  type="button"
                  aria-label={`Increase quantity for ${item.name}`}
                  onClick={() => onUpdateQty(item.menuItemId, 1)}
                  className="w-6 h-6 rounded-full bg-surface-container hover:bg-surface-container-high flex items-center justify-center text-on-surface font-bold text-xs cursor-pointer transition-colors"
                >
                  +
                </button>
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Special Cooking Instructions Input */}
      <div className="flex items-center gap-2.5 p-3 rounded-2xl bg-surface-container border border-outline-variant/15 shadow-sm liquid-glass-card">
        <span className="material-symbols-outlined text-[20px] text-[#FF6422] shrink-0">
          edit_note
        </span>
        <input
          type="text"
          value={cookingNote}
          onChange={(event) => onCookingNoteChange(event.target.value)}
          placeholder="Any special cooking note for chef?"
          className="bg-transparent text-xs text-on-surface placeholder:text-outline w-full focus:outline-none"
        />
      </div>

      {/* Promo Code Card */}
      <div className="p-4 rounded-3xl bg-surface-container border border-outline-variant/15 shadow-sm space-y-2.5 liquid-glass-card">
        <div className="flex items-center justify-between">
          <label
            htmlFor="cart-coupon"
            className="text-xs font-extrabold text-on-surface flex items-center gap-1.5"
          >
            <span className="material-symbols-outlined text-[16px] text-[#FF6422]">
              local_offer
            </span>
            <span>Have a Coupon Code?</span>
          </label>
          {totals.couponApplied && (
            <button
              type="button"
              onClick={() => {
                onCouponChange('');
                setCouponDraft('');
              }}
              className="text-[11px] text-red-500 hover:underline font-bold"
            >
              Remove
            </button>
          )}
        </div>

        <div className="flex items-center gap-2">
          <input
            id="cart-coupon"
            type="text"
            value={couponDraft}
            onChange={(event) => setCouponDraft(event.target.value)}
            placeholder="Enter promo code"
            className="w-full bg-surface px-3.5 py-2.5 rounded-full text-xs font-extrabold text-on-surface uppercase tracking-wider focus:outline-none focus:ring-1 focus:ring-[#FF6422] font-mono border border-outline-variant/20"
          />
          <button
            type="button"
            onClick={() => onCouponChange(couponDraft.trim().toUpperCase())}
            className="h-10 px-5 rounded-full bg-[#FF6422] hover:bg-[#E55518] text-white text-xs font-black cursor-pointer transition-all active:scale-95 shadow-md shrink-0"
          >
            Apply
          </button>
        </div>

        {campaigns.some((campaign) => campaign.status === 'active') && (
        <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar pt-1">
          {campaigns.filter((campaign) => campaign.status === 'active').map((campaign) => {
            const isCurrent = couponCode.toUpperCase() === campaign.code.toUpperCase();
            return (
              <button
                key={campaign.id}
                type="button"
                onClick={() => {
                  setCouponDraft(campaign.code);
                  onCouponChange(campaign.code);
                }}
                className={`shrink-0 px-3 py-1 rounded-full text-[11px] font-bold transition-all cursor-pointer ${
                  isCurrent
                    ? 'bg-emerald-500 text-neutral-950 shadow-sm'
                    : 'bg-surface-container-high text-on-surface-variant hover:text-on-surface'
                }`}
              >
                {isCurrent ? `✓ ${campaign.code}` : `+ ${campaign.code}`}
              </button>
            );
          })}
        </div>
        )}

        {totals.couponApplied && (
          <span className="text-[11px] font-bold text-emerald-500 flex items-center gap-1 pt-0.5">
            <span className="material-symbols-outlined text-[14px]">check_circle</span>
            {totals.discountLabel || `${couponCode} applied successfully!`}
          </span>
        )}
        {totals.couponError && (
          <p className="text-[11px] text-red-400 font-medium">{totals.couponError}</p>
        )}
      </div>

      {/* Loyalty Points Redemption (if available) */}
      {availablePoints > 0 && (
        <div className="flex items-center justify-between p-3.5 rounded-3xl bg-surface-container border border-outline-variant/15 shadow-sm liquid-glass-card">
          <div className="flex items-center gap-2.5">
            <span className="material-symbols-outlined text-amber-400 text-[22px]">stars</span>
            <div>
              <span className="text-xs font-extrabold text-on-surface block">
                Redeem Beans
              </span>
              <span className="text-[11px] text-on-surface-variant">
                {availablePoints} Beans available · Save up to ₹
                {Math.floor(Math.min(availablePoints, 200) * 0.5)}
              </span>
            </div>
          </div>
          <button
            type="button"
            onClick={() => setRedeemPointsActive(!redeemPointsActive)}
            className={`px-3.5 py-1.5 rounded-full text-xs font-bold transition-all cursor-pointer active:scale-95 ${
              redeemPointsActive
                ? 'bg-[#FF6422] text-white shadow-sm'
                : 'bg-surface-container-high text-on-surface-variant hover:text-on-surface'
            }`}
          >
            {redeemPointsActive ? 'Applied ✓' : 'Redeem'}
          </button>
        </div>
      )}

      {/* Bill Summary Card */}
      <div className="p-4 rounded-3xl bg-surface-container border border-outline-variant/15 shadow-sm space-y-2.5 liquid-glass-card">
        <div className="flex items-center justify-between pb-2 border-b border-outline-variant/15">
          <span className="text-xs font-extrabold text-on-surface tracking-tight uppercase">
            Bill Summary
          </span>
          <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-[#FF6422]/15 text-[#FF6422]">
            GST INCLUSIVE
          </span>
        </div>

        <div className="flex justify-between text-xs text-on-surface-variant">
          <span>Item Subtotal</span>
          <span className="font-bold text-on-surface tabular-nums">
            {formatBillingAmount(totals.subtotal)}
          </span>
        </div>

        {totals.discount > 0 && (
          <div className="flex justify-between text-xs text-emerald-500 font-bold">
            <span>{totals.discountLabel || 'Promotional Discount'}</span>
            <span className="tabular-nums">-{formatBillingAmount(totals.discount)}</span>
          </div>
        )}

        {totals.pointsDiscount ? (
          <div className="flex justify-between text-xs text-amber-400 font-bold">
            <span>Bean Discount ({totals.pointsRedeemed} Beans)</span>
            <span className="tabular-nums">-{formatBillingAmount(totals.pointsDiscount)}</span>
          </div>
        ) : null}

        <div className="h-px bg-outline-variant/15 my-1" />

        <div className="flex justify-between text-[11px] text-on-surface-variant">
          <span>Taxable Value</span>
          <span className="tabular-nums">{formatBillingAmount(taxableAmount)}</span>
        </div>
        <div className="flex justify-between text-[11px] text-on-surface-variant">
          <span>CGST @ 2.5%</span>
          <span className="tabular-nums">{formatBillingAmount(cgst)}</span>
        </div>
        <div className="flex justify-between text-[11px] text-on-surface-variant">
          <span>SGST @ 2.5%</span>
          <span className="tabular-nums">{formatBillingAmount(sgst)}</span>
        </div>

        {totals.roundOff !== 0 && (
          <div className="flex justify-between text-[11px] text-on-surface-variant">
            <span>Round Off</span>
            <span className="tabular-nums">
              {totals.roundOff > 0 ? '+' : '-'}
              {formatBillingAmount(Math.abs(totals.roundOff))}
            </span>
          </div>
        )}

        <div className="h-px bg-outline-variant/15 my-1" />

        <div className="flex justify-between items-center pt-1">
          <div>
            <span className="text-sm font-black text-on-surface block">Amount Payable</span>
            <span className="text-[10px] text-on-surface-variant font-medium">
              Inclusive of all taxes
            </span>
          </div>
          <span className="text-2xl font-black text-[#FF6422] tabular-nums">
            {formatINR(totals.total)}
          </span>
        </div>
      </div>

      {/* Customer Account & Authentication Card */}
      {customerSession ? (
        <div className="p-4 rounded-3xl bg-surface-container border border-outline-variant/15 shadow-sm flex items-center justify-between liquid-glass-card">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-[#FF6422]/15 text-[#FF6422] font-black text-sm flex items-center justify-center shrink-0 border border-[#FF6422]/20">
              {customerSession.name.charAt(0).toUpperCase()}
            </div>
            <div>
              <div className="flex items-center gap-1.5">
                <span className="text-xs font-black text-on-surface">
                  Ordering as {customerSession.name}
                </span>
                <span className="inline-flex items-center gap-0.5 px-1.5 py-0.2 rounded-full text-[9px] font-bold bg-emerald-500/15 text-emerald-400 border border-emerald-500/30">
                  <span className="material-symbols-outlined text-[11px]">verified</span>
                  Signed In
                </span>
              </div>
              <p className="text-[11px] text-on-surface-variant font-medium mt-0.5">
                {customerSession.phone || customerSession.email}
              </p>
            </div>
          </div>
          {onNavigateLogin && (
            <button
              type="button"
              onClick={onNavigateLogin}
              className="text-[11px] font-bold text-on-surface-variant hover:text-[#FF6422] underline cursor-pointer"
            >
              Switch
            </button>
          )}
        </div>
      ) : (
        <div className="p-4 rounded-3xl bg-amber-500/10 border border-amber-500/30 text-amber-200 shadow-sm space-y-3">
          <div className="flex items-start gap-3">
            <div className="w-10 h-10 rounded-2xl bg-amber-500/20 text-amber-400 flex items-center justify-center shrink-0 border border-amber-500/30">
              <span className="material-symbols-outlined text-[22px]">lock</span>
            </div>
            <div className="flex-1">
              <h4 className="text-xs sm:text-sm font-black text-amber-300">
                Sign in required to place order
              </h4>
              <p className="text-[11px] sm:text-xs text-amber-200/80 mt-0.5 leading-relaxed">
                Order place karne se pehle please sign in karein. Aapka Name, Mobile & Email order ke sath link hoga.
              </p>
            </div>
          </div>
          {onNavigateLogin && (
            <button
              type="button"
              onClick={onNavigateLogin}
              className="w-full py-2.5 px-4 rounded-2xl bg-gradient-to-r from-[#FF6422] to-amber-500 hover:brightness-110 text-white font-extrabold text-xs sm:text-sm tracking-wide shadow-md transition-all flex items-center justify-center gap-2 cursor-pointer active:scale-[0.98]"
            >
              <span className="material-symbols-outlined text-[18px]">login</span>
              <span>Sign In / Create Account to Order</span>
            </button>
          )}
        </div>
      )}

      {/* Payment Options Card */}
      <div className="p-4 rounded-3xl bg-surface-container border border-outline-variant/15 shadow-sm space-y-2.5 liquid-glass-card">
        <span className="text-xs font-extrabold text-on-surface tracking-tight uppercase block">
          Payment Method
        </span>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
          {/* Online UPI */}
          <button
            type="button"
            onClick={() => setPaymentMode('upi')}
            className={`p-3 rounded-2xl border text-left transition-all flex items-center justify-between cursor-pointer ${
              paymentMode === 'upi'
                ? 'bg-[#FF6422]/10 border-[#FF6422] ring-1 ring-[#FF6422]'
                : 'bg-surface border-outline-variant/20 hover:border-outline-variant/50'
            }`}
          >
            <div className="flex items-center gap-2.5">
              <div className="w-8 h-8 rounded-full bg-[#FF6422]/15 text-[#FF6422] flex items-center justify-center shrink-0">
                <span className="material-symbols-outlined text-[18px]">qr_code_scanner</span>
              </div>
              <div>
                <span className="text-xs font-extrabold text-on-surface block">Pay Online (UPI)</span>
                <span className="text-[10px] text-on-surface-variant">GPay, PhonePe, Paytm</span>
              </div>
            </div>
            <div
              className={`w-4 h-4 rounded-full border-2 flex items-center justify-center shrink-0 ${
                paymentMode === 'upi' ? 'border-[#FF6422]' : 'border-outline-variant'
              }`}
            >
              {paymentMode === 'upi' && <div className="w-2 h-2 bg-[#FF6422] rounded-full" />}
            </div>
          </button>

          {/* Pay on Counter */}
          <button
            type="button"
            onClick={() => setPaymentMode('cash')}
            className={`p-3 rounded-2xl border text-left transition-all flex items-center justify-between cursor-pointer ${
              paymentMode === 'cash'
                ? 'bg-[#FF6422]/10 border-[#FF6422] ring-1 ring-[#FF6422]'
                : 'bg-surface border-outline-variant/20 hover:border-outline-variant/50'
            }`}
          >
            <div className="flex items-center gap-2.5">
              <div className="w-8 h-8 rounded-full bg-amber-500/15 text-amber-500 flex items-center justify-center shrink-0">
                <span className="material-symbols-outlined text-[18px]">storefront</span>
              </div>
              <div>
                <span className="text-xs font-extrabold text-on-surface block">Pay at Counter</span>
                <span className="text-[10px] text-on-surface-variant">Cash or Card at Counter</span>
              </div>
            </div>
            <div
              className={`w-4 h-4 rounded-full border-2 flex items-center justify-center shrink-0 ${
                paymentMode === 'cash' ? 'border-[#FF6422]' : 'border-outline-variant'
              }`}
            >
              {paymentMode === 'cash' && <div className="w-2 h-2 bg-[#FF6422] rounded-full" />}
            </div>
          </button>
        </div>
      </div>

      {checkoutError && (
        <p className="text-xs text-red-400 bg-red-950/40 p-3 rounded-2xl">{checkoutError}</p>
      )}

      {/* Place Order CTA Button */}
      <div className="pt-1">
        {!customerSession ? (
          <button
            type="button"
            onClick={onNavigateLogin}
            className="w-full py-4 rounded-full bg-surface-container-highest hover:bg-surface-variant text-on-surface text-sm sm:text-base font-black tracking-wide border border-[#FF6422]/40 transition-all cursor-pointer active:scale-[0.98] flex items-center justify-center gap-2 group shadow-lg"
          >
            <span className="material-symbols-outlined text-[20px] text-[#FF6422] group-hover:scale-110 transition-transform">
              lock
            </span>
            <span>Sign In to Place Order • ₹{totals.total}</span>
          </button>
        ) : (
          <button
            type="button"
            disabled={isSubmitting}
            onClick={() => void handleCheckout()}
            className="w-full py-4 rounded-full bg-[#FF6422] hover:bg-[#E55518] text-white text-sm sm:text-base font-black tracking-wide shadow-[0_8px_24px_rgba(255,100,34,0.35)] transition-all cursor-pointer active:scale-[0.98] disabled:opacity-50 flex items-center justify-center gap-2"
          >
            {isSubmitting ? (
              <div className="flex items-center gap-2">
                <span className="material-symbols-outlined text-[20px] animate-spin">
                  progress_activity
                </span>
                <span>Placing your order...</span>
              </div>
            ) : paymentMode === 'upi' ? (
              <>
                <span className="material-symbols-outlined text-[20px]">bolt</span>
                <span>Proceed to Pay • ₹{totals.total}</span>
              </>
            ) : (
              <>
                <span className="material-symbols-outlined text-[20px]">check_circle</span>
                <span>Place Order • ₹{totals.total} (Pay on Counter)</span>
              </>
            )}
          </button>
        )}
      </div>

      {/* Brewing Order Full-Screen Overlay while Submitting */}
      {isSubmitting && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-md p-4 animate-fade-in">
          <div className="w-full max-w-sm rounded-3xl bg-surface-container border border-outline-variant/20 p-6 shadow-2xl">
            <CoffeeBrewLoader
              size="md"
              title="Sending to Kitchen"
              subtitle="Sending your order to the kitchen..."
            />
          </div>
        </div>
      )}
    </div>
  );
};
