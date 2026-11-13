import React, { useEffect, useMemo, useRef, useState } from 'react';
import { MENU_ITEMS } from '../data/cafeSeedData';
import { UPI_APP_OPTIONS, type UpiAppId } from '../payments/upiUri';
import { buildUpiPaymentUri } from '../shared/upi';
import {
  CafeTable,
  CardNetwork,
  CartItem,
  MenuCategory,
  MenuItem,
  PaymentMode,
  ServiceMode,
} from '../types/cafe';
import { calculateCartTotals, filterMenuItems } from '../utils/cafeLogic';
import { CafeImage } from './CafeImage';
import { QrPreviewModal } from './QrPreviewModal';

export interface PosCardSlipInput {
  network: CardNetwork;
  last4?: string;
  authCode?: string;
}

interface PosTerminalScreenProps {
  posCart: CartItem[];
  serviceMode: ServiceMode;
  selectedTable: string;
  tables: CafeTable[];
  paymentMode: PaymentMode;
  preferredUpiApp: UpiAppId;
  cafeName?: string;
  upiVpa?: string;
  isSubmitting?: boolean;
  onServiceModeChange: (mode: ServiceMode) => void;
  onTableChange: (table: string) => void;
  onPaymentModeChange: (mode: PaymentMode) => void;
  onPreferredUpiAppChange: (app: UpiAppId) => void;
  onAddPosItem: (item: MenuItem) => void;
  onUpdatePosQty: (menuItemId: string, delta: number) => void;
  onClearPosCart: () => void;
  onCompletePosOrder: (cardDetails?: PosCardSlipInput) => void;
}

const POS_CATEGORIES: { id: MenuCategory; label: string; icon: string }[] = [
  { id: 'Beverages', label: 'Beverages', icon: 'local_cafe' },
  { id: 'Snacks', label: 'Snacks', icon: 'cookie' },
  { id: 'Meals', label: 'Meals', icon: 'lunch_dining' },
  { id: 'Combos', label: 'Combos', icon: 'fastfood' },
  { id: 'Desserts', label: 'Desserts', icon: 'icecream' },
  { id: 'All', label: 'All', icon: 'apps' },
];

export const PosTerminalScreen: React.FC<PosTerminalScreenProps> = ({
  posCart,
  serviceMode,
  selectedTable,
  tables,
  paymentMode,
  preferredUpiApp,
  cafeName = 'Seth Sawariya Cafe',
  upiVpa,
  isSubmitting = false,
  onServiceModeChange,
  onTableChange,
  onPaymentModeChange,
  onPreferredUpiAppChange,
  onAddPosItem,
  onUpdatePosQty,
  onClearPosCart,
  onCompletePosOrder,
}) => {
  const [searchQuery, setSearchQuery] = useState('');
  const [activeCategory, setActiveCategory] = useState<MenuCategory>('All');
  const [tableDropdownOpen, setTableDropdownOpen] = useState(false);
  const [upiQrOpen, setUpiQrOpen] = useState(false);
  const [cardNetwork, setCardNetwork] = useState<CardNetwork>('Visa');
  const [cardLast4, setCardLast4] = useState('');
  const [cardAuthCode, setCardAuthCode] = useState('');
  const searchInputRef = useRef<HTMLInputElement>(null);

  const visibleItems = filterMenuItems(MENU_ITEMS, activeCategory, searchQuery);
  const totals = calculateCartTotals(posCart, '', serviceMode, true);

  const upiUri = useMemo(
    () =>
      buildUpiPaymentUri({
        vpa: upiVpa,
        payeeName: cafeName,
        amountInr: totals.total,
        transactionRef: `POS${selectedTable}${Math.round(totals.total)}`,
        note: `${cafeName} ${serviceMode === 'dine-in' ? `Table ${selectedTable}` : serviceMode}`,
      }),
    [cafeName, selectedTable, serviceMode, totals.total, upiVpa]
  );

  const submitPosOrder = () => {
    if (posCart.length === 0 || isSubmitting) return;
    if (paymentMode === 'card') {
      onCompletePosOrder({
        network: cardNetwork,
        last4: cardLast4.trim() || undefined,
        authCode: cardAuthCode.trim() || undefined,
      });
      setCardLast4('');
      setCardAuthCode('');
    } else {
      onCompletePosOrder();
    }
  };

  // Keyboard shortcuts: F3 search, F7 UPI, F9 Complete Order
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'F3') {
        e.preventDefault();
        searchInputRef.current?.focus();
      } else if (e.key === 'F7') {
        e.preventDefault();
        onPaymentModeChange('upi');
      } else if (e.key === 'F9') {
        e.preventDefault();
        if (posCart.length > 0 && !isSubmitting) {
          submitPosOrder();
        }
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [onPaymentModeChange, posCart.length, isSubmitting, paymentMode, cardNetwork, cardLast4, cardAuthCode]);

  return (
    <div className="flex flex-col w-full pb-6 space-y-4">
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 items-start">
        {/* Left: Catalog & Controls */}
        <div className="lg:col-span-7 flex flex-col space-y-3">
          {/* Service Mode Selector & Table Status Pill */}
          <div className="flex flex-wrap sm:flex-nowrap items-center justify-between gap-2 bg-surface-container-low p-1.5 rounded-xl shadow-md relative">
            <div className="flex items-center gap-1 p-1 bg-surface-container rounded-lg overflow-x-auto no-scrollbar max-w-full">
              {[
                { id: 'dine-in' as ServiceMode, label: 'Dine-In', icon: 'restaurant' },
                { id: 'takeaway' as ServiceMode, label: 'Takeaway', icon: 'takeout_dining' },
                { id: 'delivery' as ServiceMode, label: 'Delivery', icon: 'moped' },
              ].map((m) => {
                const active = serviceMode === m.id;
                return (
                  <button
                    key={m.id}
                    type="button"
                    onClick={() => onServiceModeChange(m.id)}
                    className={`px-2.5 py-1.5 rounded-lg text-xs transition-all flex items-center gap-1 whitespace-nowrap cursor-pointer ${
                      active
                        ? 'bg-primary text-on-primary font-bold shadow-sm'
                        : 'text-on-surface-variant hover:text-on-surface hover:bg-surface-container-high/60 font-medium'
                    }`}
                  >
                    <span className="material-symbols-outlined text-[16px]">{m.icon}</span>
                    <span>{m.label}</span>
                  </button>
                );
              })}
            </div>

            <div className="relative shrink-0">
              <button
                type="button"
                aria-label="Select table number"
                onClick={() => setTableDropdownOpen((o) => !o)}
                className="flex items-center gap-1.5 bg-surface-container-highest/70 hover:bg-surface-container-highest px-3 py-2 rounded-lg text-primary text-xs transition-all cursor-pointer"
              >
                <span className="w-2 h-2 rounded-full bg-tertiary animate-ping" />
                <span className="text-on-surface font-semibold">{selectedTable}</span>
                <span className="material-symbols-outlined text-[16px] text-on-surface-variant">
                  expand_more
                </span>
              </button>

              {tableDropdownOpen && (
                <div className="absolute right-0 mt-2 w-40 rounded-xl bg-surface-container-highest shadow-2xl z-30 p-1.5 grid grid-cols-2 gap-1">
                  {tables.map((t) => (
                    <button
                      key={t.id}
                      type="button"
                      onClick={() => {
                        onTableChange(t.id);
                        setTableDropdownOpen(false);
                      }}
                      className={`px-2.5 py-1.5 rounded-lg text-xs font-semibold text-left cursor-pointer ${
                        selectedTable === t.id
                          ? 'bg-primary text-on-primary font-bold'
                          : 'text-on-surface hover:bg-surface-container-high'
                      }`}
                    >
                      {t.id}
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* Search Bar with F3 Shortcut */}
          <div className="relative flex items-center w-full">
            <div className="absolute left-3.5 flex items-center pointer-events-none text-primary">
              <span className="material-symbols-outlined text-[20px]">search</span>
            </div>
            <input
              ref={searchInputRef}
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              aria-label="Search POS menu item"
              placeholder="Search menu item (F3)..."
              className="w-full bg-surface-container-low text-on-surface placeholder:text-on-surface-variant/70 text-sm pl-11 pr-20 py-3 rounded-xl focus:outline-none focus:ring-1 focus:ring-primary shadow-inner"
            />
            <div className="absolute right-2.5 flex items-center gap-1">
              <span className="bg-surface-container-high px-1.5 py-0.5 rounded text-[10px] font-mono text-outline font-semibold tracking-wider">
                F3
              </span>
              {searchQuery && (
                <button
                  type="button"
                  aria-label="Clear POS search"
                  onClick={() => setSearchQuery('')}
                  className="w-7 h-7 flex items-center justify-center rounded-lg text-on-surface-variant hover:text-primary cursor-pointer"
                >
                  <span className="material-symbols-outlined text-[16px]">close</span>
                </button>
              )}
            </div>
          </div>

          {/* Category Nav Chips */}
          <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar py-0.5">
            {POS_CATEGORIES.map((cat) => {
              const active = activeCategory === cat.id;
              return (
                <button
                  key={cat.id}
                  type="button"
                  onClick={() => setActiveCategory(cat.id)}
                  className={`shrink-0 flex items-center gap-1.5 px-3.5 py-2 rounded-full text-xs transition-all cursor-pointer ${
                    active
                      ? 'bg-primary text-on-primary font-bold shadow-[0_0_12px_rgba(245,158,11,0.25)]'
                      : 'bg-surface-container-low text-on-surface-variant hover:text-on-surface hover:bg-surface-container font-medium'
                  }`}
                >
                  <span className={`material-symbols-outlined text-[16px] ${active ? 'icon-filled' : ''}`}>
                    {cat.icon}
                  </span>
                  <span>{cat.label}</span>
                </button>
              );
            })}
          </div>

          {/* Menu Catalogue Grid */}
          {visibleItems.length === 0 ? (
            <div className="p-8 rounded-xl bg-surface-container-low text-center space-y-2.5">
              <span className="material-symbols-outlined text-3xl text-outline">search_off</span>
              <p className="text-sm font-bold text-on-surface">No menu items match your filter</p>
              <p className="text-xs text-on-surface-variant">
                Try clearing the search query or switching back to All categories.
              </p>
              <button
                type="button"
                onClick={() => {
                  setActiveCategory('All');
                  setSearchQuery('');
                }}
                className="px-4 py-2 rounded-lg bg-primary text-on-primary text-xs font-bold cursor-pointer"
              >
                Reset Filters
              </button>
            </div>
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5">
              {visibleItems.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => onAddPosItem(item)}
                  className="relative text-left bg-surface-container-low hover:bg-surface-container p-2.5 rounded-xl flex flex-col justify-between shadow-md transition-all active:scale-[0.98] cursor-pointer group"
                >
                  <div className="relative w-full h-24 rounded-lg overflow-hidden bg-surface-container-lowest mb-2">
                    <CafeImage
                      src={item.imageUrl}
                      alt={item.name}
                      className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                    />
                    {item.category === 'Snacks' || item.category === 'Meals' ? (
                      <div className="absolute top-1 left-1 bg-tertiary-container/90 backdrop-blur-md px-1.5 py-0.5 rounded text-[9px] text-on-tertiary-container font-bold">
                        VEG
                      </div>
                    ) : (
                      <div className="absolute bottom-1 right-1 bg-surface-container-lowest/80 backdrop-blur-md px-1.5 py-0.5 rounded text-[10px] text-tertiary font-bold flex items-center gap-0.5">
                        <span className="material-symbols-outlined icon-filled text-[11px]">
                          star
                        </span>
                        {item.rating}
                      </div>
                    )}
                  </div>
                  <div className="flex flex-col min-w-0 w-full">
                    <span className="text-sm font-bold text-on-surface truncate">{item.name}</span>
                    <div className="flex items-center justify-between mt-1">
                      <span className="text-lg font-bold text-primary tabular-nums">
                        ₹{item.price}
                      </span>
                      <span className="w-8 h-8 rounded-lg bg-surface-container-high group-hover:bg-primary group-hover:text-on-primary text-primary flex items-center justify-center transition-colors">
                        <span className="material-symbols-outlined text-[18px]">add</span>
                      </span>
                    </div>
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Right: Current Order / Running KOT Tray Sheet */}
        <div className="lg:col-span-5 bg-surface-container-low rounded-2xl p-4 shadow-xl flex flex-col space-y-4 lg:sticky lg:top-20">
          {/* Order Card Header */}
          <div className="flex items-center justify-between pb-1">
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-lg bg-surface-container-high flex items-center justify-center text-primary">
                <span className="material-symbols-outlined text-[18px]">receipt_long</span>
              </div>
              <div className="flex items-center gap-1.5">
                <span className="text-base font-bold text-on-surface">Current Order</span>
                <span className="px-2 py-0.5 bg-primary/20 text-primary rounded-full text-[11px] font-bold">
                  {serviceMode === 'dine-in' ? `Table ${selectedTable}` : serviceMode.toUpperCase()}
                </span>
              </div>
            </div>

            <div className="flex items-center gap-2">
              <span className="px-2 py-0.5 rounded-full bg-surface-container-highest text-on-surface-variant text-[11px] tabular-nums">
                {totals.itemCount} {totals.itemCount === 1 ? 'item' : 'items'}
              </span>
              <button
                type="button"
                aria-label="Clear POS Order"
                onClick={onClearPosCart}
                disabled={posCart.length === 0}
                className="w-8 h-8 flex items-center justify-center rounded-lg text-on-surface-variant hover:text-error disabled:opacity-40 transition-colors cursor-pointer"
              >
                <span className="material-symbols-outlined text-[18px]">delete_sweep</span>
              </button>
            </div>
          </div>

          {/* Running Order Item List */}
          <div className="space-y-2 bg-surface-container-lowest/60 p-2.5 rounded-xl min-h-[120px]">
            {posCart.length === 0 ? (
              <div className="py-8 text-center text-xs text-on-surface-variant">
                Tap menu tiles on the left to add items to this KOT order.
              </div>
            ) : (
              posCart.map((item) => (
                <div
                  key={item.menuItemId}
                  className="flex items-center justify-between p-2 rounded-lg bg-surface-container-low/80 gap-2"
                >
                  <div className="flex items-center gap-2.5 min-w-0">
                    <div className="w-9 h-9 rounded-lg overflow-hidden shrink-0 bg-surface-container-high">
                      <CafeImage src={item.imageUrl} alt={item.name} />
                    </div>
                    <div className="flex flex-col min-w-0">
                      <span className="text-sm text-on-surface truncate font-semibold">
                        {item.name}
                      </span>
                      <div className="flex items-center gap-1 text-[11px] text-tertiary truncate">
                        <span className="w-1.5 h-1.5 rounded-full bg-tertiary shrink-0" />
                        <span className="truncate">{item.note}</span>
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center gap-2.5 shrink-0">
                    <div className="flex items-center bg-surface-container-lowest rounded-lg p-0.5">
                      <button
                        type="button"
                        aria-label={`Decrease POS ${item.name}`}
                        onClick={() => onUpdatePosQty(item.menuItemId, -1)}
                        className="w-7 h-7 flex items-center justify-center rounded text-on-surface-variant hover:text-on-surface hover:bg-surface-container transition-colors cursor-pointer"
                      >
                        <span className="material-symbols-outlined text-[14px]">remove</span>
                      </button>
                      <span className="w-5 text-center text-xs font-bold text-on-surface tabular-nums">
                        {item.quantity}
                      </span>
                      <button
                        type="button"
                        aria-label={`Increase POS ${item.name}`}
                        onClick={() => onUpdatePosQty(item.menuItemId, 1)}
                        className="w-7 h-7 flex items-center justify-center rounded text-on-surface-variant hover:text-on-surface hover:bg-surface-container transition-colors cursor-pointer"
                      >
                        <span className="material-symbols-outlined text-[14px]">add</span>
                      </button>
                    </div>
                    <span className="text-sm font-bold text-on-surface w-12 text-right tabular-nums">
                      ₹{item.price * item.quantity}
                    </span>
                  </div>
                </div>
              ))
            )}
          </div>

          {/* Financial Breakdown Table */}
          <div className="bg-surface-container-high/40 p-3 rounded-xl space-y-1.5">
            <div className="flex items-center justify-between text-xs text-on-surface-variant">
              <span>Subtotal</span>
              <span className="font-mono text-on-surface tabular-nums">₹{totals.subtotal}</span>
            </div>
            {totals.discount > 0 && (
              <div className="flex items-center justify-between text-xs text-tertiary">
                <span className="flex items-center gap-1">
                  <span className="material-symbols-outlined text-[14px]">loyalty</span>
                  {totals.discountLabel}
                </span>
                <span className="font-mono font-semibold tabular-nums">-₹{totals.discount}</span>
              </div>
            )}
            <div className="flex items-center justify-between text-base font-bold text-on-surface pt-1">
              <span>Total Payable</span>
              <span className="text-primary text-xl tracking-tight tabular-nums">
                ₹{totals.total}
              </span>
            </div>
          </div>

          {/* Payment Gateway Modes */}
          <div className="grid grid-cols-3 gap-2">
            {[
              { id: 'cash' as PaymentMode, label: 'Cash', icon: 'payments' },
              { id: 'upi' as PaymentMode, label: 'UPI (F7)', icon: 'qr_code_scanner' },
              { id: 'card' as PaymentMode, label: 'Card', icon: 'credit_card' },
            ].map((pm) => {
              const active = paymentMode === pm.id;
              return (
                <button
                  key={pm.id}
                  type="button"
                  onClick={() => onPaymentModeChange(pm.id)}
                  className={`flex flex-col items-center justify-center py-2.5 px-1 rounded-xl transition-all cursor-pointer ${
                    active
                      ? 'bg-secondary-container/30 text-primary font-bold shadow-[0_0_12px_rgba(245,158,11,0.2)]'
                      : 'bg-surface-container-high hover:bg-surface-container-highest text-on-surface'
                  }`}
                >
                  <span
                    className={`material-symbols-outlined text-[18px] mb-0.5 ${
                      active ? 'icon-filled text-primary' : 'text-on-surface-variant'
                    }`}
                  >
                    {pm.icon}
                  </span>
                  <span className="text-xs font-semibold">{pm.label}</span>
                </button>
              );
            })}
          </div>

          {paymentMode === 'upi' && posCart.length > 0 && (
            <div className="space-y-2 rounded-xl bg-surface-container p-2.5 border border-outline-variant/20">
              <div className="flex items-center justify-between">
                <span className="text-[10px] uppercase tracking-wider font-semibold text-on-surface-variant">
                  Customer UPI App
                </span>
                <span className="text-[10px] text-primary font-bold">YouPI-PG Ready</span>
              </div>
              <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar">
                {UPI_APP_OPTIONS.map((app) => (
                  <button
                    key={app.id}
                    type="button"
                    onClick={() => onPreferredUpiAppChange(app.id)}
                    className={`px-2.5 py-1 rounded-lg text-[11px] font-bold shrink-0 cursor-pointer transition-all ${
                      preferredUpiApp === app.id
                        ? 'bg-primary text-on-primary'
                        : 'bg-surface-container-lowest text-on-surface-variant hover:text-on-surface'
                    }`}
                  >
                    {app.shortLabel}
                  </button>
                ))}
              </div>
              <button
                type="button"
                onClick={() => setUpiQrOpen(true)}
                className="w-full py-2 rounded-lg bg-surface-container-high hover:bg-surface-bright text-primary text-xs font-semibold flex items-center justify-center gap-1.5 transition-colors cursor-pointer"
              >
                <span className="material-symbols-outlined text-[17px]">qr_code_2</span>
                <span>Show Dynamic UPI QR (₹{totals.total})</span>
              </button>
            </div>
          )}

          {paymentMode === 'card' && posCart.length > 0 && (
            <div className="space-y-2 rounded-xl bg-surface-container p-2.5 border border-outline-variant/20">
              <div className="flex items-center justify-between">
                <span className="text-[10px] uppercase tracking-wider font-semibold text-on-surface-variant">
                  Card EDC Terminal Slip
                </span>
                <span className="text-[10px] text-tertiary font-semibold">PCI-Safe (Last 4)</span>
              </div>
              <div className="grid grid-cols-4 gap-1">
                {(['Visa', 'Mastercard', 'RuPay', 'Amex'] as CardNetwork[]).map((net) => (
                  <button
                    key={net}
                    type="button"
                    onClick={() => setCardNetwork(net)}
                    className={`py-1 rounded-md text-[11px] font-bold cursor-pointer ${
                      cardNetwork === net
                        ? 'bg-primary text-on-primary'
                        : 'bg-surface-container-lowest text-on-surface-variant'
                    }`}
                  >
                    {net}
                  </button>
                ))}
              </div>
              <div className="grid grid-cols-2 gap-1.5">
                <input
                  type="text"
                  inputMode="numeric"
                  maxLength={4}
                  value={cardLast4}
                  onChange={(e) => setCardLast4(e.target.value.replace(/\D/g, '').slice(0, 4))}
                  placeholder="Last 4 digits (e.g. 4242)"
                  className="px-2.5 py-1.5 rounded-lg bg-surface-container-lowest text-xs font-mono text-on-surface focus:outline-none focus:ring-1 focus:ring-primary"
                />
                <input
                  type="text"
                  value={cardAuthCode}
                  onChange={(e) => setCardAuthCode(e.target.value.toUpperCase())}
                  placeholder="EDC Auth Code (optional)"
                  className="px-2.5 py-1.5 rounded-lg bg-surface-container-lowest text-xs font-mono text-on-surface focus:outline-none focus:ring-1 focus:ring-primary"
                />
              </div>
              <p className="text-[10px] text-on-surface-variant">
                Leave Auth Code blank to create a pending Card EDC bill; enter EDC slip code to mark Paid immediately.
              </p>
            </div>
          )}

          {/* Complete Order F9 Main Action Button */}
          <button
            type="button"
            data-testid="pos-complete-order-btn"
            disabled={posCart.length === 0 || isSubmitting}
            onClick={submitPosOrder}
            className="w-full h-12 bg-primary hover:bg-primary-fixed-dim disabled:opacity-40 text-on-primary text-sm font-bold rounded-xl shadow-[0_0_18px_rgba(245,158,11,0.35)] flex items-center justify-center gap-2 active:scale-[0.99] transition-all cursor-pointer disabled:cursor-not-allowed"
          >
            <span className="material-symbols-outlined icon-filled text-[20px]">check_circle</span>
            <span>{isSubmitting ? 'Processing Order...' : 'Complete Order (F9)'}</span>
            <span className="ml-1 px-1.5 py-0.5 bg-on-primary/20 rounded font-mono text-[11px] text-on-primary font-extrabold tabular-nums">
              ₹{totals.total}
            </span>
          </button>
        </div>
      </div>

      {/* Dynamic UPI Payment QR Modal */}
      <QrPreviewModal
        open={upiQrOpen}
        onOpenChange={setUpiQrOpen}
        title="Scan & Pay via UPI"
        subtitle={`Customer scans with GPay, PhonePe, or Paytm for exact bill ₹${totals.total}.`}
        badgeText={`NPCI UPI · ₹${totals.total}`}
        value={upiUri}
        downloadFileName={`upi-qr-${selectedTable}-${totals.total}.png`}
      />
    </div>
  );
};
