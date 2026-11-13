import React, { useMemo, useState } from 'react';
import {
  DEMO_PLACEHOLDER_VPA,
  UPI_APP_OPTIONS,
  type UpiAppId,
  buildAllUpiAppUris,
  getUpiAppLabel,
  getUpiAppOption,
  isValidUpiVpa,
} from '../payments/upiUri';
import type { CardCheckoutDraft } from '../store/useCafeStore';
import { CardNetwork, CartItem, PaymentMode, ServiceMode } from '../types/cafe';
import { calculateCartTotals } from '../utils/cafeLogic';
import { CafeImage } from './CafeImage';
import { UpiAppIcon } from './UpiAppIcon';

interface CustomerCartScreenProps {
  cart: CartItem[];
  serviceMode: ServiceMode;
  selectedTable: string;
  couponCode: string;
  cookingNote: string;
  paymentMode: PaymentMode;
  preferredUpiApp: UpiAppId;
  cardDraft: CardCheckoutDraft;
  payeeVpa?: string;
  payeeName?: string;
  onUpdateQty: (menuItemId: string, delta: number) => void;
  onRemoveItem: (menuItemId: string) => void;
  onCouponChange: (code: string) => void;
  onCookingNoteChange: (note: string) => void;
  onPaymentModeChange: (mode: PaymentMode) => void;
  onPreferredUpiAppChange: (app: UpiAppId) => void;
  onCardDraftChange: (patch: Partial<CardCheckoutDraft>) => void;
  onCheckout: (overrides?: {
    paymentMode?: PaymentMode;
    preferredUpiApp?: UpiAppId;
    oneTap?: boolean;
  }) => void | Promise<void>;
  onBrowseMenu: () => void;
}

type CartCheckoutState =
  | { status: 'idle' }
  | { status: 'submitting'; app?: UpiAppId }
  | { status: 'error'; message: string };

export const CustomerCartScreen: React.FC<CustomerCartScreenProps> = ({
  cart,
  serviceMode,
  selectedTable,
  couponCode,
  cookingNote,
  paymentMode,
  preferredUpiApp,
  cardDraft,
  payeeVpa,
  payeeName,
  onUpdateQty,
  onRemoveItem,
  onCouponChange,
  onCookingNoteChange,
  onPaymentModeChange,
  onPreferredUpiAppChange,
  onCardDraftChange,
  onCheckout,
  onBrowseMenu,
}) => {
  const [couponDraft, setCouponDraft] = useState(couponCode);
  const [checkoutState, setCheckoutState] = useState<CartCheckoutState>({ status: 'idle' });
  const isSubmitting = checkoutState.status === 'submitting';
  const checkoutError = checkoutState.status === 'error' ? checkoutState.message : null;

  const totals = calculateCartTotals(cart, couponCode, serviceMode, false);
  const effectiveVpa = payeeVpa && isValidUpiVpa(payeeVpa) ? payeeVpa.trim() : DEMO_PLACEHOLDER_VPA;

  const dynamicAppUris = useMemo(() => {
    if (totals.total <= 0) return null;
    try {
      return buildAllUpiAppUris({
        payeeVpa: effectiveVpa,
        payeeName: payeeName || 'Seth Sawariya Cafe',
        amountInr: totals.total,
        note: serviceMode === 'dine-in' ? `Table ${selectedTable} Order` : 'Cafe Order',
      });
    } catch {
      return null;
    }
  }, [effectiveVpa, payeeName, selectedTable, serviceMode, totals.total]);

  const handleApplyCoupon = () => {
    onCouponChange(couponDraft.trim().toUpperCase());
  };

  const handleCheckout = async (appOverride?: UpiAppId) => {
    if (cart.length === 0 || isSubmitting) return;
    const isOneTapUpi = Boolean(appOverride) || paymentMode === 'upi';
    if (
      !appOverride &&
      paymentMode === 'card' &&
      cardDraft.last4.trim() &&
      !/^\d{4}$/.test(cardDraft.last4.trim())
    ) {
      setCheckoutState({
        status: 'error',
        message: 'Enter only the last 4 digits of your card (or leave blank).',
      });
      return;
    }
    setCheckoutState({ status: 'submitting', app: appOverride });
    try {
      await onCheckout(
        isOneTapUpi
          ? {
              paymentMode: 'upi',
              preferredUpiApp: appOverride ?? preferredUpiApp,
              oneTap: true,
            }
          : undefined
      );
      setCheckoutState({ status: 'idle' });
    } catch (err) {
      setCheckoutState({
        status: 'error',
        message: err instanceof Error ? err.message : 'Unable to initiate checkout',
      });
    }
  };

  if (cart.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-16 px-4 text-center max-w-md mx-auto">
        <div className="w-20 h-20 rounded-2xl bg-surface-container-high flex items-center justify-center text-primary mb-4 shadow-lg">
          <span className="material-symbols-outlined text-[40px]">shopping_basket</span>
        </div>
        <h2 className="text-xl font-bold text-on-surface">Your cart is empty</h2>
        <p className="text-sm text-on-surface-variant mt-1.5">
          Explore our artisanal brews, protein shakes, and grilled cafe classics.
        </p>
        <button
          type="button"
          onClick={onBrowseMenu}
          className="mt-6 h-12 px-6 rounded-xl bg-primary-container text-on-primary-container font-bold text-sm flex items-center gap-2 shadow-md active:scale-95 transition-all cursor-pointer"
        >
          <span className="material-symbols-outlined text-[18px]">restaurant_menu</span>
          <span>Browse Cafe Menu</span>
        </button>
      </div>
    );
  }

  return (
    <div className="flex flex-col w-full pb-8 gap-4">
      {/* Top Order Meta & Table Selector */}
      <div className="flex items-center justify-between pt-1">
        <div className="flex items-center gap-2.5">
          <div className="w-9 h-9 rounded-lg bg-surface-container-high flex items-center justify-center text-primary">
            <span className="material-symbols-outlined icon-filled text-[20px]">local_cafe</span>
          </div>
          <div className="flex flex-col">
            <h1 className="text-xl text-on-surface font-bold tracking-tight">Your Cart</h1>
            <span className="text-[11px] text-on-surface-variant flex items-center gap-1">
              <span className="inline-block w-2 h-2 rounded-full bg-tertiary animate-pulse" />
              Ordering for{' '}
              {serviceMode === 'dine-in'
                ? 'Dine-In'
                : serviceMode === 'takeaway'
                  ? 'Takeaway'
                  : 'Delivery'}
            </span>
          </div>
        </div>

        <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-surface-container-highest shadow-sm">
          <span className="material-symbols-outlined icon-filled text-[16px] text-primary">
            table_restaurant
          </span>
          <span className="text-xs text-primary font-bold">
            {serviceMode === 'dine-in' ? `Table ${selectedTable}` : serviceMode.toUpperCase()}
          </span>
        </div>
      </div>

      {/* Desktop 2-Col Split / Mobile Stacked */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 items-start">
        <div className="lg:col-span-7 flex flex-col gap-3">
          {/* Cart Count Notification Ribbon */}
          <div className="flex items-center justify-between px-4 py-2.5 rounded-lg bg-surface-container-low shadow-sm">
            <div className="flex items-center gap-1.5 text-on-surface-variant">
              <span className="material-symbols-outlined text-[18px] text-secondary">
                shopping_basket
              </span>
              <span className="text-xs font-semibold text-on-surface tabular-nums">
                {totals.itemCount} Handcrafted {totals.itemCount === 1 ? 'Item' : 'Items'}
              </span>
            </div>
            <span className="text-[11px] text-primary uppercase tracking-wider font-semibold">
              Kitchen Ready
            </span>
          </div>

          {/* Cart Items List */}
          <div className="flex flex-col gap-2.5">
            {cart.map((item) => (
              <div
                key={item.menuItemId}
                className="flex items-center gap-3 p-3 rounded-xl bg-surface-container shadow-md"
              >
                <div className="w-16 h-16 rounded-lg overflow-hidden shrink-0 bg-surface-container-lowest">
                  <CafeImage src={item.imageUrl} alt={item.name} />
                </div>

                <div className="flex flex-col flex-1 min-w-0">
                  <div className="flex items-start justify-between gap-1">
                    <h3 className="text-base font-semibold text-on-surface truncate">
                      {item.name}
                    </h3>
                    <button
                      type="button"
                      aria-label={`Remove ${item.name}`}
                      onClick={() => onRemoveItem(item.menuItemId)}
                      className="text-on-surface-variant hover:text-error transition-colors p-1 -mr-1 cursor-pointer"
                    >
                      <span className="material-symbols-outlined text-[18px]">delete_outline</span>
                    </button>
                  </div>
                  <span className="text-[11px] text-on-surface-variant mb-1 truncate">
                    {item.note}
                  </span>

                  <div className="flex items-center justify-between mt-auto">
                    <span className="text-base text-primary font-bold tabular-nums">
                      ₹{item.price * item.quantity}
                    </span>
                    <div className="flex items-center gap-2 px-2 py-1 rounded-full bg-surface-container-lowest shadow-inner">
                      <button
                        type="button"
                        aria-label={`Decrease quantity for ${item.name}`}
                        onClick={() => onUpdateQty(item.menuItemId, -1)}
                        className="w-7 h-7 flex items-center justify-center rounded-full text-on-surface-variant hover:text-primary active:scale-95 transition-transform cursor-pointer"
                      >
                        <span className="material-symbols-outlined text-[16px]">remove</span>
                      </button>
                      <span className="text-xs text-on-surface font-semibold w-4 text-center tabular-nums">
                        {item.quantity}
                      </span>
                      <button
                        type="button"
                        aria-label={`Increase quantity for ${item.name}`}
                        onClick={() => onUpdateQty(item.menuItemId, 1)}
                        className="w-7 h-7 flex items-center justify-center rounded-full text-on-surface-variant hover:text-primary active:scale-95 transition-transform cursor-pointer"
                      >
                        <span className="material-symbols-outlined text-[16px]">add</span>
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>

          {/* Cooking Instructions Note */}
          <div className="flex items-center gap-2.5 p-3 rounded-xl bg-surface-container-low shadow-sm">
            <span className="material-symbols-outlined icon-filled text-[20px] text-primary">
              restaurant
            </span>
            <input
              type="text"
              value={cookingNote}
              onChange={(e) => onCookingNoteChange(e.target.value)}
              aria-label="Special cooking instructions"
              placeholder="Any special cooking note? (e.g. less ice, extra crispy)"
              className="bg-transparent text-xs sm:text-sm text-on-surface placeholder:text-on-surface-variant/60 w-full focus:outline-none"
            />
          </div>
        </div>

        {/* Right Summary Column */}
        <div className="lg:col-span-5 flex flex-col gap-3">
          {/* Coupon / Promo Section */}
          <div className="flex flex-col gap-2 p-3.5 rounded-xl bg-surface-container shadow-md">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-on-surface flex items-center gap-1.5">
                <span className="material-symbols-outlined text-[18px] text-primary">sell</span>
                Have a Coupon?
              </span>
              {totals.couponApplied && (
                <span className="text-[11px] text-tertiary font-semibold flex items-center gap-0.5">
                  <span className="material-symbols-outlined text-[14px]">check_circle</span>
                  {couponCode} Applied
                </span>
              )}
            </div>

            <div className="flex items-center gap-2 mt-0.5">
              <div className="relative flex-1">
                <input
                  type="text"
                  value={couponDraft}
                  onChange={(e) => setCouponDraft(e.target.value)}
                  aria-label="Coupon code"
                  placeholder="Enter code (CAFE50)"
                  className="w-full bg-surface-container-lowest px-3 py-2.5 pr-8 rounded-lg text-xs font-semibold text-on-surface uppercase tracking-wider focus:outline-none focus:ring-1 focus:ring-primary"
                />
                {couponDraft && (
                  <button
                    type="button"
                    aria-label="Clear coupon"
                    onClick={() => {
                      setCouponDraft('');
                      onCouponChange('');
                    }}
                    className="absolute right-2 top-1/2 -translate-y-1/2 text-on-surface-variant hover:text-on-surface cursor-pointer"
                  >
                    <span className="material-symbols-outlined text-[16px]">close</span>
                  </button>
                )}
              </div>
              <button
                type="button"
                onClick={handleApplyCoupon}
                className="h-10 px-4 rounded-lg bg-primary-container text-on-primary-container text-sm font-bold active:scale-95 transition-all shadow-sm cursor-pointer"
              >
                {totals.couponApplied && couponDraft.toUpperCase() === couponCode ? 'Applied' : 'Apply'}
              </button>
            </div>

            {totals.couponError && (
              <p className="text-[11px] text-error font-medium">{totals.couponError}</p>
            )}
          </div>

          {/* Bill Breakdown Summary Card */}
          <div className="flex flex-col gap-2.5 p-4 rounded-xl bg-surface-container shadow-md">
            <div className="flex items-center justify-between pb-1">
              <span className="text-base text-on-surface font-semibold">Bill Details</span>
              <span className="text-[11px] text-on-surface-variant">Table {selectedTable}</span>
            </div>

            <div className="flex items-center justify-between text-sm">
              <span className="text-on-surface-variant">Item Subtotal</span>
              <span className="text-on-surface font-medium tabular-nums">
                ₹{totals.subtotal.toFixed(2)}
              </span>
            </div>

            {totals.discount > 0 && (
              <div className="flex items-center justify-between text-sm">
                <span className="text-tertiary flex items-center gap-1">
                  <span className="material-symbols-outlined text-[16px]">local_offer</span>
                  {totals.discountLabel}
                </span>
                <span className="text-tertiary font-semibold tabular-nums">
                  -₹{totals.discount.toFixed(2)}
                </span>
              </div>
            )}

            <div className="flex items-center justify-between text-sm">
              <span className="text-on-surface-variant flex items-center gap-1">
                Taxes &amp; GST (5%)
                <span className="material-symbols-outlined text-[14px] text-on-surface-variant/80">
                  info
                </span>
              </span>
              <span className="text-on-surface font-medium tabular-nums">
                ₹{totals.tax.toFixed(2)}
              </span>
            </div>

            <div className="flex items-center justify-between text-sm">
              <span className="text-on-surface-variant">Round Off Relief</span>
              <span className="text-on-surface font-medium tabular-nums">
                -₹{totals.roundOff.toFixed(2)}
              </span>
            </div>

            <div className="h-px w-full bg-surface-variant my-1" />

            <div className="flex items-center justify-between pt-0.5">
              <div className="flex flex-col">
                <span className="text-base text-on-surface font-bold">To Pay</span>
                {totals.discount > 0 && (
                  <span className="text-[11px] text-tertiary tabular-nums">
                    Saved ₹{totals.discount} on this order
                  </span>
                )}
              </div>
              <span className="text-[26px] text-primary font-bold tabular-nums">
                ₹{totals.total}
              </span>
            </div>
          </div>

          {/* Swiggy-Style Payment Options Sheet */}
          <div className="flex flex-col gap-3 p-3.5 rounded-2xl bg-surface-container-low shadow-md border border-outline-variant/25">
            <div className="flex items-center justify-between gap-2 pb-1 border-b border-outline-variant/15">
              <div className="flex items-center gap-2">
                <div className="w-7 h-7 rounded-lg bg-primary/15 text-primary flex items-center justify-center">
                  <span className="material-symbols-outlined text-[17px]">verified_user</span>
                </div>
                <div>
                  <span className="text-xs text-on-surface font-bold uppercase tracking-wider block leading-tight">
                    Payment Options
                  </span>
                  <span className="text-[10px] text-on-surface-variant block">
                    Pay ₹{totals.total} securely via YouPI-PG
                  </span>
                </div>
              </div>
              <span className="text-[10px] px-2 py-0.5 rounded-md bg-tertiary/15 text-tertiary font-bold flex items-center gap-1 shrink-0">
                <span className="material-symbols-outlined text-[12px]">lock</span>
                100% Safe
              </span>
            </div>

            {/* Section 1: Swiggy-Style Preferred UPI Apps List */}
            <div className="rounded-xl bg-surface-container p-2.5 space-y-2 border border-outline-variant/15">
              <div className="flex items-center justify-between px-0.5">
                <span className="text-[11px] font-bold text-on-surface flex items-center gap-1.5">
                  <span className="material-symbols-outlined text-[15px] text-primary">
                    qr_code_scanner
                  </span>
                  Pay by any UPI App
                </span>
                <span className="text-[10px] text-tertiary font-semibold">Zero Convenience Fee</span>
              </div>

              <div className="flex flex-col divide-y divide-outline-variant/15 rounded-xl overflow-hidden border border-outline-variant/15 bg-surface-container-lowest/70">
                {UPI_APP_OPTIONS.map((app) => {
                  const selected = paymentMode === 'upi' && preferredUpiApp === app.id;
                  const tag =
                    app.id === 'gpay'
                      ? 'Fastest'
                      : app.id === 'paytm'
                        ? 'Popular'
                        : app.id === 'amazonpay'
                          ? 'Rewards'
                          : null;
                  return (
                    <div
                      key={app.id}
                      className={`w-full flex items-center gap-2.5 px-3 py-2.5 transition-all ${
                        selected
                          ? 'bg-primary-container/15'
                          : 'hover:bg-surface-container-high/70'
                      }`}
                    >
                      <button
                        type="button"
                        data-testid={`payment-option-upi-${app.id}`}
                        onClick={() => {
                          onPaymentModeChange('upi');
                          onPreferredUpiAppChange(app.id);
                          setCheckoutState({ status: 'idle' });
                        }}
                        className="flex items-center gap-3 flex-1 min-w-0 text-left cursor-pointer"
                      >
                        <UpiAppIcon appId={app.id} className="w-9 h-9" />

                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-1.5 flex-wrap">
                            <span className="text-xs font-bold text-on-surface">{app.label}</span>
                            {tag && (
                              <span
                                className={`text-[9px] font-extrabold uppercase tracking-wide px-1.5 py-0.5 rounded border ${app.accentClass}`}
                              >
                                {tag}
                              </span>
                            )}
                          </div>
                          <span className="block text-[10px] text-on-surface-variant truncate mt-0.5">
                            {selected
                              ? `One-Tap ready · ${app.schemePrefix}`
                              : app.tagline}
                          </span>
                        </div>
                      </button>

                      <div className="flex items-center gap-2 shrink-0">
                        {selected ? (
                          <button
                            type="button"
                            disabled={isSubmitting}
                            data-testid={`one-tap-pay-${app.id}`}
                            onClick={() => void handleCheckout(app.id)}
                            className="px-3 py-1.5 rounded-lg bg-primary text-on-primary text-[11px] font-bold shadow-sm hover:brightness-105 active:scale-95 transition-all cursor-pointer tabular-nums disabled:opacity-60"
                          >
                            {isSubmitting ? 'Starting...' : `Pay ₹${totals.total}`}
                          </button>
                        ) : (
                          <span
                            aria-hidden="true"
                            className="w-4 h-4 rounded-full border-2 border-outline flex items-center justify-center"
                          />
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>

              {paymentMode === 'upi' && (
                <div className="space-y-1 px-1 pt-0.5 text-[10px] text-on-surface-variant">
                  <div className="flex items-center justify-between gap-2">
                    <span>
                      App Handler:{' '}
                      <span className="font-mono text-primary font-semibold">
                        {getUpiAppOption(preferredUpiApp).schemePrefix}
                      </span>
                    </span>
                    {getUpiAppOption(preferredUpiApp).androidPackage && (
                      <span className="font-mono truncate max-w-[190px]">
                        {getUpiAppOption(preferredUpiApp).androidPackage}
                      </span>
                    )}
                  </div>
                  {dynamicAppUris?.[preferredUpiApp] && (
                    <div
                      data-testid="dynamic-upi-uri-preview"
                      data-uri={dynamicAppUris[preferredUpiApp].oneTapUri}
                      title={dynamicAppUris[preferredUpiApp].oneTapUri}
                      className="font-mono text-[9px] text-outline truncate bg-surface-container-lowest/70 px-2 py-1 rounded border border-outline-variant/15"
                    >
                      URI: {dynamicAppUris[preferredUpiApp].oneTapUri}
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Section 2: Credit / Debit Cards (Swiggy & Zomato Style) */}
            <div
              className={`rounded-xl p-2.5 border transition-all ${
                paymentMode === 'card'
                  ? 'bg-surface-container border-primary shadow-sm'
                  : 'bg-surface-container border-outline-variant/15'
              }`}
            >
              <button
                type="button"
                data-testid="payment-option-card"
                onClick={() => {
                  onPaymentModeChange('card');
                  setCheckoutState({ status: 'idle' });
                }}
                className="w-full flex items-center justify-between gap-2 text-left cursor-pointer"
              >
                <div className="flex items-center gap-2.5">
                  <div
                    className={`w-9 h-9 rounded-xl flex items-center justify-center ${
                      paymentMode === 'card'
                        ? 'bg-primary text-on-primary'
                        : 'bg-surface-container-high text-primary'
                    }`}
                  >
                    <span className="material-symbols-outlined text-[19px]">credit_card</span>
                  </div>
                  <div>
                    <span className="text-xs font-bold text-on-surface block">
                      Credit &amp; Debit Cards
                    </span>
                    <span className="text-[10px] text-on-surface-variant block">
                      Visa, Mastercard, RuPay, Amex · Online or Table EDC
                    </span>
                  </div>
                </div>
                <span
                  className={`w-4 h-4 rounded-full border-2 flex items-center justify-center ${
                    paymentMode === 'card' ? 'border-primary' : 'border-outline'
                  }`}
                >
                  {paymentMode === 'card' && <span className="w-2 h-2 rounded-full bg-primary" />}
                </span>
              </button>

              {paymentMode === 'card' && (
                <div className="mt-3 pt-2.5 border-t border-outline-variant/20 space-y-2.5">
                  <div className="grid grid-cols-2 gap-1.5">
                    {[
                      {
                        id: 'online_card' as const,
                        label: 'Pay Card Online',
                        sub: 'Tokenized instant approval',
                      },
                      {
                        id: 'edc_table' as const,
                        label: 'Card Machine (EDC)',
                        sub: 'Tap / Swipe at table',
                      },
                    ].map((opt) => (
                      <button
                        key={opt.id}
                        type="button"
                        onClick={() => onCardDraftChange({ method: opt.id })}
                        className={`p-2 rounded-lg text-left border cursor-pointer transition-all ${
                          cardDraft.method === opt.id
                            ? 'bg-primary/15 border-primary text-on-surface'
                            : 'bg-surface-container-lowest border-transparent text-on-surface-variant'
                        }`}
                      >
                        <span className="block text-[11px] font-bold">{opt.label}</span>
                        <span className="block text-[9px] opacity-80">{opt.sub}</span>
                      </button>
                    ))}
                  </div>

                  <div>
                    <span className="block text-[10px] font-semibold text-on-surface-variant mb-1">
                      Card Network
                    </span>
                    <div className="grid grid-cols-4 gap-1.5">
                      {(['Visa', 'Mastercard', 'RuPay', 'Amex'] as CardNetwork[]).map((net) => (
                        <button
                          key={net}
                          type="button"
                          onClick={() => onCardDraftChange({ network: net })}
                          className={`py-1.5 rounded-lg text-[11px] font-bold cursor-pointer ${
                            cardDraft.network === net
                              ? 'bg-primary text-on-primary'
                              : 'bg-surface-container-lowest text-on-surface-variant hover:text-on-surface'
                          }`}
                        >
                          {net}
                        </button>
                      ))}
                    </div>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                    <div>
                      <label className="block text-[10px] font-semibold text-on-surface-variant mb-1">
                        Name on Card (Optional)
                      </label>
                      <input
                        type="text"
                        value={cardDraft.holderName}
                        onChange={(e) => onCardDraftChange({ holderName: e.target.value })}
                        placeholder="e.g. Aarav Sharma"
                        className="w-full px-2.5 py-1.5 rounded-lg bg-surface-container-lowest text-xs text-on-surface focus:outline-none focus:ring-1 focus:ring-primary"
                      />
                    </div>
                    <div>
                      <label className="block text-[10px] font-semibold text-on-surface-variant mb-1">
                        Last 4 Digits Only (Optional)
                      </label>
                      <input
                        type="text"
                        inputMode="numeric"
                        maxLength={4}
                        value={cardDraft.last4}
                        onChange={(e) => {
                          setCheckoutState({ status: 'idle' });
                          onCardDraftChange({ last4: e.target.value.replace(/\D/g, '').slice(0, 4) });
                        }}
                        placeholder="e.g. 4242"
                        className="w-full px-2.5 py-1.5 rounded-lg bg-surface-container-lowest text-xs font-mono text-on-surface focus:outline-none focus:ring-1 focus:ring-primary"
                      />
                    </div>
                  </div>

                  {checkoutError && <p className="text-[11px] text-error font-medium">{checkoutError}</p>}

                  <p className="text-[10px] text-tertiary flex items-center gap-1">
                    <span className="material-symbols-outlined text-[13px]">lock</span>
                    <span>
                      PCI-Safe: Full 16-digit card numbers &amp; CVVs are never collected or stored.
                    </span>
                  </p>
                </div>
              )}
            </div>

            {/* Section 3: Cash at Counter */}
            <button
              type="button"
              data-testid="payment-option-cash"
              onClick={() => {
                onPaymentModeChange('cash');
                setCheckoutState({ status: 'idle' });
              }}
              className={`w-full rounded-xl p-2.5 border flex items-center justify-between gap-2 text-left transition-all cursor-pointer ${
                paymentMode === 'cash'
                  ? 'bg-surface-container border-primary shadow-sm'
                  : 'bg-surface-container border-outline-variant/15 hover:bg-surface-container-high'
              }`}
            >
              <div className="flex items-center gap-2.5">
                <div
                  className={`w-9 h-9 rounded-xl flex items-center justify-center ${
                    paymentMode === 'cash'
                      ? 'bg-primary text-on-primary'
                      : 'bg-surface-container-high text-primary'
                  }`}
                >
                  <span className="material-symbols-outlined text-[19px]">payments</span>
                </div>
                <div>
                  <span className="text-xs font-bold text-on-surface block">Cash at Counter</span>
                  <span className="text-[10px] text-on-surface-variant block">
                    Pay cash to server or billing desk
                  </span>
                </div>
              </div>
              <span
                className={`w-4 h-4 rounded-full border-2 flex items-center justify-center ${
                  paymentMode === 'cash' ? 'border-primary' : 'border-outline'
                }`}
              >
                {paymentMode === 'cash' && <span className="w-2 h-2 rounded-full bg-primary" />}
              </span>
            </button>
          </div>

          {checkoutError && paymentMode !== 'card' && (
            <p className="text-xs text-error font-medium px-1">{checkoutError}</p>
          )}

          {/* Primary Checkout Action */}
          <button
            type="button"
            disabled={isSubmitting}
            onClick={() => void handleCheckout()}
            className="w-full h-12 flex items-center justify-between px-5 rounded-xl bg-primary-container hover:bg-primary text-on-primary-container text-base font-bold tracking-tight shadow-[0_4px_16px_rgba(245,158,11,0.25)] active:scale-[0.99] transition-all cursor-pointer"
          >
            {isSubmitting ? (
              <div className="flex items-center justify-center w-full gap-2">
                <span className="material-symbols-outlined animate-spin text-[20px]">sync</span>
                <span>Initiating Payment...</span>
              </div>
            ) : (
              <>
                <div className="flex items-center gap-2">
                  <span className="material-symbols-outlined text-[22px]">
                    {paymentMode === 'upi'
                      ? 'bolt'
                      : paymentMode === 'card'
                        ? 'credit_card'
                        : 'payments'}
                  </span>
                  <span>
                    {paymentMode === 'upi'
                      ? `One-Tap Pay · ${getUpiAppLabel(preferredUpiApp)}`
                      : paymentMode === 'card'
                        ? cardDraft.method === 'online_card'
                          ? `Pay with ${cardDraft.network}`
                          : 'Place Order · Card at Table'
                        : 'Place Order · Pay Cash'}
                  </span>
                </div>
                <div className="flex items-center gap-1 text-sm font-bold tabular-nums">
                  <span>₹{totals.total}</span>
                  <span className="material-symbols-outlined text-[20px]">arrow_forward</span>
                </div>
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
};
