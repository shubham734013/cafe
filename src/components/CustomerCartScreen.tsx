import React, { useState } from 'react';
import { CartItem, PaymentMode, ServiceMode } from '../types/cafe';
import { calculateCartTotals } from '../utils/cafeLogic';
import { CafeImage } from './CafeImage';

interface CustomerCartScreenProps {
  cart: CartItem[];
  serviceMode: ServiceMode;
  selectedTable: string;
  couponCode: string;
  cookingNote: string;
  paymentMode: PaymentMode;
  onUpdateQty: (menuItemId: string, delta: number) => void;
  onRemoveItem: (menuItemId: string) => void;
  onCouponChange: (code: string) => void;
  onCookingNoteChange: (note: string) => void;
  onPaymentModeChange: (mode: PaymentMode) => void;
  onCheckout: () => void;
  onBrowseMenu: () => void;
}

export const CustomerCartScreen: React.FC<CustomerCartScreenProps> = ({
  cart,
  serviceMode,
  selectedTable,
  couponCode,
  cookingNote,
  paymentMode,
  onUpdateQty,
  onRemoveItem,
  onCouponChange,
  onCookingNoteChange,
  onPaymentModeChange,
  onCheckout,
  onBrowseMenu,
}) => {
  const [couponDraft, setCouponDraft] = useState(couponCode);
  const [placing, setPlacing] = useState(false);

  const totals = calculateCartTotals(cart, couponCode, serviceMode, false);

  const handleApplyCoupon = () => {
    onCouponChange(couponDraft.trim().toUpperCase());
  };

  const handleCheckout = () => {
    if (cart.length === 0 || placing) return;
    setPlacing(true);
    setTimeout(() => {
      setPlacing(false);
      onCheckout();
    }, 550);
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

          {/* Payment Option Quick Select */}
          <div className="flex flex-col gap-2 p-3.5 rounded-xl bg-surface-container-low shadow-sm">
            <span className="text-xs text-on-surface-variant font-medium">Payment Mode</span>
            <div className="grid grid-cols-3 gap-2">
              {[
                { id: 'upi' as PaymentMode, label: 'UPI / QR', icon: 'qr_code_scanner' },
                { id: 'card' as PaymentMode, label: 'Card', icon: 'credit_card' },
                { id: 'cash' as PaymentMode, label: 'Cash Counter', icon: 'payments' },
              ].map((pm) => {
                const active = paymentMode === pm.id;
                return (
                  <button
                    key={pm.id}
                    type="button"
                    onClick={() => onPaymentModeChange(pm.id)}
                    className={`flex items-center justify-center gap-1.5 py-2.5 px-1 rounded-lg text-xs font-semibold transition-all cursor-pointer ${
                      active
                        ? 'bg-primary-container text-on-primary-container font-bold shadow-sm'
                        : 'bg-surface-container text-on-surface hover:bg-surface-container-high'
                    }`}
                  >
                    <span className={`material-symbols-outlined text-[16px] ${active ? 'icon-filled' : ''}`}>
                      {pm.icon}
                    </span>
                    <span className="truncate">{pm.label}</span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Primary Checkout Action */}
          <button
            type="button"
            disabled={placing}
            onClick={handleCheckout}
            className="w-full h-12 flex items-center justify-between px-5 rounded-xl bg-primary-container hover:bg-primary text-on-primary-container text-base font-bold tracking-tight shadow-[0_4px_16px_rgba(245,158,11,0.25)] active:scale-[0.99] transition-all cursor-pointer"
          >
            {placing ? (
              <div className="flex items-center justify-center w-full gap-2">
                <span className="material-symbols-outlined animate-spin text-[20px]">sync</span>
                <span>Sending to Kitchen KOT...</span>
              </div>
            ) : (
              <>
                <div className="flex items-center gap-2">
                  <span className="material-symbols-outlined text-[22px]">shopping_bag</span>
                  <span>Proceed to Checkout</span>
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
