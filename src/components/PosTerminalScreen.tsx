import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type {
  CafeOrder,
  CafeTable,
  CartItem,
  CustomerProfile,
  MenuCategory,
  MenuItem,
  PaymentMode,
  ServiceMode,
} from '../types/cafe';
import { calculateCartTotals, filterMenuItems, formatINR } from '../utils/cafeLogic';
import { getItemVariants } from '../utils/menuVariants';
import { useCustomerTheme } from './CustomerThemeContext';
import { CafeImage } from './CafeImage';
export { getItemVariants };

interface PosTerminalScreenProps {
  posCart: CartItem[];
  serviceMode: ServiceMode;
  selectedTable: string;
  tables: CafeTable[];
  menuItems: MenuItem[];
  customers?: CustomerProfile[];
  isSubmitting?: boolean;
  lastCompletedOrder?: CafeOrder | null;
  onServiceModeChange: (mode: ServiceMode) => void;
  onTableChange: (table: string) => void;
  onAddPosItem: (item: MenuItem, variant?: NonNullable<MenuItem['variants']>[number]) => void;
  onUpdatePosQty: (menuItemId: string, delta: number, size?: string) => void;
  onClearPosCart: () => void;
  onCompletePosOrder: (
    paymentMode?: PaymentMode,
    customerId?: string,
    cookingNote?: string,
    customerEmail?: string,
    customerPhone?: string
  ) => void;
  onToggleItemAvailability?: (menuItemId: string) => void;
  onQuickAddCustomer?: (name: string, phone: string) => Promise<void>;
  onPrintReceipt?: (order: CafeOrder) => void;
}

const POS_CATEGORIES: { id: MenuCategory; label: string }[] = [
  { id: 'All', label: 'All Items' },
  { id: 'Burgers', label: 'Burgers' },
  { id: 'Pizza', label: 'Pizza' },
  { id: 'Maggi', label: 'Maggi' },
  { id: 'Sandwiches', label: 'Sandwiches' },
  { id: 'Special Bread Pizza', label: 'Bread Pizza' },
  { id: 'Fries & Momos', label: 'Fries & Momos' },
  { id: 'Cold Coffee', label: 'Cold Coffee' },
  { id: 'Shakes', label: 'Shakes' },
  { id: 'Hot Beverages', label: 'Hot Beverages' },
  { id: 'Combos', label: 'Combos' },
];

function normalizeCustomerPhone(phone: string): string {
  const digits = phone.replace(/\D/g, '');
  if (digits.length === 12 && digits.startsWith('91')) return digits.slice(2);
  if (digits.length === 11 && digits.startsWith('0')) return digits.slice(1);
  return digits;
}

export const PosTerminalScreen: React.FC<PosTerminalScreenProps> = ({
  posCart,
  serviceMode,
  selectedTable,
  tables,
  menuItems,
  customers = [],
  isSubmitting = false,
  lastCompletedOrder,
  onServiceModeChange,
  onTableChange,
  onAddPosItem,
  onUpdatePosQty,
  onClearPosCart,
  onCompletePosOrder,
  onToggleItemAvailability,
  onQuickAddCustomer,
  onPrintReceipt,
}) => {
  const { isLightTheme } = useCustomerTheme();
  const [searchQuery, setSearchQuery] = useState('');
  const [activeCategory, setActiveCategory] = useState<MenuCategory>('All');
  const [tenderType, setTenderType] = useState<PaymentMode>('cash');
  const [cookingNote, setCookingNote] = useState('');
  const [manageStockMode, setManageStockMode] = useState(false);
  const [variantItem, setVariantItem] = useState<MenuItem | null>(null);

  // Customer Loyalty lookup state
  const [phoneQuery, setPhoneQuery] = useState('');
  const [customerEmail, setCustomerEmail] = useState('');
  const [contactInfoError, setContactInfoError] = useState('');
  const [matchedCustomer, setMatchedCustomer] = useState<CustomerProfile | null>(null);
  const [newCustName, setNewCustName] = useState('');
  const [isAddingCustomer, setIsAddingCustomer] = useState(false);
  const [showAddCustomerModal, setShowAddCustomerModal] = useState(false);

  const searchInputRef = useRef<HTMLInputElement>(null);

  const visibleItems = useMemo(
    () => filterMenuItems(menuItems, activeCategory, searchQuery),
    [menuItems, activeCategory, searchQuery]
  );
  const totals = calculateCartTotals(posCart, '', serviceMode, true);
  const phoneDigits = phoneQuery.replace(/\D/g, '');
  const isPhoneValid = phoneDigits.length >= 10 && phoneDigits.length <= 15;
  const isEmailValid = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(customerEmail.trim());

  const handleCompleteOrder = useCallback(() => {
    if (!isEmailValid || !isPhoneValid) {
      setContactInfoError(
        !customerEmail.trim()
          ? 'Enter the customer email.'
          : !isEmailValid
            ? 'Enter a valid email address.'
            : 'Enter a valid mobile number (10–15 digits).'
      );
      return;
    }

    setContactInfoError('');
    onCompletePosOrder(
      tenderType,
      matchedCustomer?.id,
      cookingNote,
      customerEmail.trim(),
      phoneQuery.trim()
    );
    setCookingNote('');
  }, [
    cookingNote,
    customerEmail,
    isEmailValid,
    isPhoneValid,
    matchedCustomer?.id,
    onCompletePosOrder,
    phoneQuery,
    tenderType,
  ]);

  // Auto-match customer as phone is entered
  useEffect(() => {
    const normalizedQuery = normalizeCustomerPhone(phoneQuery);
    if (normalizedQuery.length < 10 || normalizedQuery.length > 15) {
      setMatchedCustomer(null);
      return;
    }

    const matches = customers.filter(
      (customer) => normalizeCustomerPhone(customer.phone) === normalizedQuery
    );
    setMatchedCustomer(matches.length === 1 ? matches[0] : null);
  }, [phoneQuery, customers]);

  useEffect(() => {
    if (matchedCustomer?.email) {
      setCustomerEmail((current) => current.trim() || matchedCustomer.email || '');
    }
  }, [matchedCustomer]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'F3') {
        event.preventDefault();
        searchInputRef.current?.focus();
      } else if (event.key === 'F9') {
        event.preventDefault();
        if (posCart.length > 0 && !isSubmitting) {
          handleCompleteOrder();
        }
      } else if (event.key === 'F8') {
        event.preventDefault();
        if (lastCompletedOrder && onPrintReceipt) {
          onPrintReceipt(lastCompletedOrder);
        }
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [
    handleCompleteOrder,
    isSubmitting,
    lastCompletedOrder,
    onPrintReceipt,
    posCart.length,
  ]);

  const handleSaveNewCustomer = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newCustName.trim() || !phoneQuery.trim() || !onQuickAddCustomer) return;
    try {
      setIsAddingCustomer(true);
      await onQuickAddCustomer(newCustName.trim(), phoneQuery.trim());
      setShowAddCustomerModal(false);
      setNewCustName('');
    } finally {
      setIsAddingCustomer(false);
    }
  };

  return (
    <div className="flex flex-col w-full pb-6 gap-4">
      {/* Top Banner & Fast Actions */}
      <div className="flex flex-wrap items-center justify-between gap-2 liquid-glass p-3 rounded-2xl shadow-xl border border-white/[0.08]">
        <div className="flex items-center gap-2.5">
          <div className="w-9 h-9 rounded-full overflow-hidden border border-[#D4AF37]/60 shadow-xs shrink-0 bg-black p-0.5">
            <img src="/images/tsc-logo.jpg" alt="The Sawariya Cafe" className="w-full h-full object-cover rounded-full" />
          </div>
          {/* Service Mode Selector */}
          <div className="flex gap-1 bg-surface-container-high/60 backdrop-blur-md p-1 rounded-xl border border-white/[0.06]">
            {([
              ['dine-in', 'Dine-In'],
              ['takeaway', 'Takeaway'],
              ['delivery', 'Delivery'],
            ] as const).map(([mode, label]) => (
              <button
                key={mode}
                type="button"
                onClick={() => onServiceModeChange(mode)}
                className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                  serviceMode === mode
                    ? 'bg-primary text-on-primary shadow-md'
                    : 'text-on-surface-variant hover:text-on-surface'
                }`}
              >
                {label}
              </button>
            ))}
          </div>

          {serviceMode === 'dine-in' && (
            <select
              aria-label="Select table"
              value={selectedTable || 'T1'}
              onChange={(event) => onTableChange(event.target.value)}
              className="rounded-xl bg-surface-container-high/60 backdrop-blur-md px-3 py-1.5 text-xs font-bold text-on-surface border border-white/[0.08] focus:ring-1 focus:ring-primary"
            >
              {tables.map((table) => (
                <option key={table.id} value={table.id}>
                  {table.label} ({table.seats} seats · {table.status.toUpperCase()})
                </option>
              ))}
            </select>
          )}
        </div>

        <div className="flex items-center gap-2">
          {/* Stock Availability Toggle */}
          <button
            type="button"
            onClick={() => setManageStockMode(!manageStockMode)}
            className={`px-3 py-1.5 rounded-lg text-xs font-bold flex items-center gap-1.5 transition-all cursor-pointer ${
              manageStockMode
                ? 'bg-amber-600 text-white shadow-md ring-2 ring-amber-400'
                : 'bg-surface-container-high text-on-surface-variant hover:text-on-surface'
            }`}
          >
            <span className="material-symbols-outlined text-[15px]">inventory</span>
            <span>{manageStockMode ? 'Done Editing' : 'Mark In/Out of Stock'}</span>
          </button>

          {/* Last Receipt Quick Print */}
          {lastCompletedOrder && onPrintReceipt && (
            <button
              type="button"
              onClick={() => onPrintReceipt(lastCompletedOrder)}
              className="px-3 py-1.5 rounded-lg bg-surface-container-high hover:bg-surface-bright text-primary text-xs font-bold flex items-center gap-1.5 cursor-pointer"
            >
              <span className="material-symbols-outlined text-[15px]">print</span>
              <span>Print Last Bill #{lastCompletedOrder.kotNumber} (F8)</span>
            </button>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 items-start">
        {/* Left Column: Menu Catalog (7 Cols) */}
        <section className="lg:col-span-7 flex flex-col gap-3">
          {/* Search bar & Category filters */}
          <div className="relative">
            <span className="material-symbols-outlined absolute left-3.5 top-3 text-outline text-[18px]">
              search
            </span>
            <input
              ref={searchInputRef}
              type="search"
              value={searchQuery}
              onChange={(event) => setSearchQuery(event.target.value)}
              placeholder="Search menu..."
              aria-label="Search menu"
              className="w-full rounded-xl bg-surface-container-low pl-10 pr-4 py-2.5 text-xs text-on-surface focus:outline-none focus:ring-1 focus:ring-primary shadow-sm"
            />
          </div>

          <div className="flex gap-1.5 overflow-x-auto no-scrollbar py-0.5">
            {POS_CATEGORIES.map((category) => (
              <button
                key={category.id}
                type="button"
                onClick={() => setActiveCategory(category.id)}
                className={`shrink-0 rounded-full px-3 py-1 text-xs font-bold transition-all cursor-pointer ${
                  activeCategory === category.id
                    ? 'bg-primary text-on-primary shadow-sm'
                    : 'bg-surface-container-high text-on-surface-variant hover:text-on-surface'
                }`}
              >
                {category.label}
              </button>
            ))}
          </div>

          {/* Menu Items Grid */}
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
            {visibleItems.map((item) => {
              const isAvailable = item.isAvailable !== false;
              return (
                <div
                  key={item.id}
                  className={`group relative overflow-hidden rounded-2xl liquid-glass-card text-left transition-all border flex flex-col justify-between ${
                    !isAvailable
                      ? 'border-error/40 opacity-75 grayscale-[20%]'
                      : 'border-white/[0.08] hover:border-primary/50'
                  }`}
                >
                  <button
                    type="button"
                    disabled={!isAvailable && !manageStockMode}
                    onClick={() => {
                      if (manageStockMode && onToggleItemAvailability) {
                        onToggleItemAvailability(item.id);
                      } else if (isAvailable) {
                        setVariantItem(item);
                      }
                    }}
                    className="w-full text-left cursor-pointer flex flex-col flex-1"
                  >
                    <div className="h-28 bg-surface-container relative overflow-hidden">
                      <CafeImage
                        src={item.imageUrl}
                        alt={item.name}
                        productId={item.id}
                        className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                      />
                      {!isAvailable && (
                        <div className="absolute inset-0 bg-red-950/75 backdrop-blur-[1px] flex flex-col items-center justify-center p-1 text-center">
                          <span className="material-symbols-outlined text-red-300 text-xl">block</span>
                          <span className="text-[10px] font-black tracking-wider text-red-200 uppercase mt-0.5">
                            86 · SOLD OUT
                          </span>
                        </div>
                      )}
                      {item.isBestSeller && isAvailable && (
                        <div className="absolute top-2 left-2 px-2 py-0.5 rounded-md bg-amber-500 text-neutral-950 text-[10px] font-black uppercase shadow-sm">
                          Hot
                        </div>
                      )}
                    </div>
                    <div className="p-3 flex flex-col justify-between flex-1 gap-2">
                      <div>
                        <span className="block truncate text-xs sm:text-sm font-bold text-on-surface">
                          {item.name}
                        </span>
                        <span className="text-[10px] text-primary/80 font-semibold block mt-0.5">
                          Tap to select size
                        </span>
                      </div>
                      <div className="flex items-center justify-between rounded-xl liquid-glass-subcard px-2.5 py-1.5">
                        <span className="text-xs sm:text-sm font-black text-primary">From ₹{item.price}</span>
                        <span className="text-[10px] text-on-surface-variant font-semibold uppercase tracking-wider">
                          {item.station}
                        </span>
                      </div>
                    </div>
                  </button>

                  {/* Stock Toggle Action when in Manage Stock mode */}
                  {manageStockMode && onToggleItemAvailability && (
                    <button
                      type="button"
                      onClick={() => onToggleItemAvailability(item.id)}
                      className={`w-full py-1.5 text-[10px] font-black uppercase border-t flex items-center justify-center gap-1 cursor-pointer transition-all ${
                        isAvailable
                          ? 'bg-red-500/10 text-red-600 hover:bg-red-500/20 border-red-500/30'
                          : 'bg-emerald-500/10 text-emerald-600 hover:bg-emerald-500/20 border-emerald-500/30'
                      }`}
                    >
                      <span className="material-symbols-outlined text-[13px]">
                        {isAvailable ? 'remove_shopping_cart' : 'check_circle'}
                      </span>
                      <span>{isAvailable ? 'Mark Sold Out (86)' : 'Mark In Stock'}</span>
                    </button>
                  )}
                </div>
              );
            })}
          </div>
        </section>

        {/* Right Column: Order Bill & Tender Panel (5 Cols) */}
        <section className="lg:col-span-5 flex flex-col gap-3.5 rounded-2xl liquid-glass p-4 sm:p-5 shadow-2xl border border-white/[0.08]">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-black uppercase tracking-wider text-on-surface flex items-center gap-2">
              <span className="material-symbols-outlined text-primary text-[20px]">shopping_cart</span>
              Current Order
            </h2>
            {posCart.length > 0 && (
              <button
                type="button"
                onClick={onClearPosCart}
                className="text-xs font-bold text-error hover:underline cursor-pointer"
              >
                Clear Cart
              </button>
            )}
          </div>

          {/* Customer Contact and Loyalty Search Strip */}
          <div className="bg-surface-container rounded-xl p-2.5 flex flex-col gap-1.5 border border-outline-variant/30">
            <div className="flex items-center justify-between text-xs font-semibold">
              <span className="text-on-surface-variant flex items-center gap-1">
                <span className="material-symbols-outlined text-[15px] text-primary">person_search</span>
                Customer Contact &amp; Loyalty
              </span>
              {matchedCustomer && (
                <span className="text-[10px] px-2 py-0.5 rounded-full bg-primary-container text-on-primary-container font-black uppercase tracking-wider">
                  {matchedCustomer.segment}
                </span>
              )}
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5">
              <label className="min-w-0">
                <span className="mb-1 block text-[10px] font-semibold text-on-surface-variant">
                  Mobile number *
                </span>
                <span className="flex items-center gap-1.5">
                  <input
                    type="tel"
                    inputMode="tel"
                    autoComplete="tel"
                    required
                    aria-label="Customer mobile number"
                    aria-invalid={Boolean(contactInfoError && !isPhoneValid)}
                    value={phoneQuery}
                    onChange={(event) => {
                      setPhoneQuery(event.target.value);
                      setContactInfoError('');
                    }}
                    placeholder="10-digit mobile number"
                    className="min-w-0 flex-1 bg-surface-container-high rounded-lg px-2.5 py-1.5 text-xs text-on-surface focus:outline-none focus:ring-1 focus:ring-primary font-mono"
                  />
                  {phoneQuery && (
                    <button
                      type="button"
                      aria-label="Clear mobile number"
                      onClick={() => {
                        setPhoneQuery('');
                        setMatchedCustomer(null);
                        setContactInfoError('');
                      }}
                      className="text-[11px] text-on-surface-variant hover:text-error px-1.5 font-bold"
                    >
                      ✕
                    </button>
                  )}
                </span>
              </label>
              <label className="min-w-0">
                <span className="mb-1 block text-[10px] font-semibold text-on-surface-variant">
                  Email address *
                </span>
                <input
                  type="email"
                  autoComplete="email"
                  required
                  aria-label="Customer email address"
                  aria-invalid={Boolean(contactInfoError && !isEmailValid)}
                  value={customerEmail}
                  onChange={(event) => {
                    setCustomerEmail(event.target.value);
                    setContactInfoError('');
                  }}
                  placeholder="customer@example.com"
                  className="w-full min-w-0 bg-surface-container-high rounded-lg px-2.5 py-1.5 text-xs text-on-surface focus:outline-none focus:ring-1 focus:ring-primary"
                />
              </label>
            </div>
            {contactInfoError && (
              <p role="alert" className="text-[11px] font-semibold text-error">
                {contactInfoError}
              </p>
            )}

            {matchedCustomer ? (
              <div className="flex items-center justify-between text-xs pt-2 mt-2 border-t border-outline-variant/15">
                <div className="min-w-0">
                  <span className="font-bold text-on-surface truncate block text-xs sm:text-sm">
                    {matchedCustomer.name}
                  </span>
                  <span className="text-[11px] text-on-surface-variant">
                    {matchedCustomer.visits} visits · Total: {formatINR(matchedCustomer.totalSpent)}
                  </span>
                </div>
                <div className="text-primary font-black whitespace-nowrap text-right">
                  <div className="text-xs">⭐ {matchedCustomer.loyaltyPoints || 0} pts</div>
                  <div className="text-[9px] text-emerald-400 font-bold">+10 pts on order</div>
                </div>
              </div>
            ) : phoneQuery.trim().length >= 8 ? (
              <div className="flex items-center justify-between text-xs pt-2 mt-2 border-t border-outline-variant/15 text-on-surface-variant">
                <span className="text-[11px]">Unregistered Mobile</span>
                {onQuickAddCustomer && (
                  <button
                    type="button"
                    onClick={() => setShowAddCustomerModal(true)}
                    className="text-primary font-bold text-xs hover:underline cursor-pointer flex items-center gap-0.5"
                  >
                    <span className="material-symbols-outlined text-[14px]">person_add</span>
                    Quick Register
                  </button>
                )}
              </div>
            ) : null}
          </div>

          {/* Cart Items List */}
          {posCart.length === 0 ? (
            <div className="py-8 text-center text-xs text-on-surface-variant bg-surface-container-lowest/60 rounded-2xl border border-dashed border-outline-variant/30 flex flex-col items-center gap-1.5">
              <span className="material-symbols-outlined text-2xl text-outline">point_of_sale</span>
              <span className="font-semibold text-on-surface">Tap menu items on the left to add to bill</span>
            </div>
          ) : (
            <div className="flex flex-col gap-2 max-h-56 overflow-y-auto pr-1">
              {posCart.map((item) => (
                <div
                  key={`${item.menuItemId}-${item.size ?? 'default'}`}
                  className="flex items-center justify-between gap-2 p-2.5 rounded-xl liquid-glass-subcard transition-all"
                >
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-1.5 flex-wrap">
                      <span className="block truncate text-xs font-bold text-on-surface">
                        {item.name}
                      </span>
                      {item.size && (
                        <span className="px-1.5 py-0.5 rounded-md bg-[#FF6422]/20 text-[#FF6422] text-[10px] font-black uppercase tracking-wider">
                          {item.size}
                        </span>
                      )}
                    </div>
                    <span className="text-[11px] text-primary font-bold tabular-nums">
                      ₹{item.price * item.quantity} <span className="text-outline font-normal">({formatINR(item.price)} ea)</span>
                    </span>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <button
                      type="button"
                      aria-label={`Decrease ${item.name}${item.size ? ` ${item.size}` : ''}`}
                      onClick={() => onUpdatePosQty(item.menuItemId, -1, item.size)}
                      className="grid h-7 w-7 place-items-center rounded-lg bg-surface-container-high/80 hover:bg-surface-bright text-xs font-bold cursor-pointer transition-colors border border-white/[0.06]"
                    >
                      −
                    </button>
                    <span className="w-5 text-center text-xs font-black tabular-nums">{item.quantity}</span>
                    <button
                      type="button"
                      aria-label={`Increase ${item.name}${item.size ? ` ${item.size}` : ''}`}
                      onClick={() => onUpdatePosQty(item.menuItemId, 1, item.size)}
                      className="grid h-7 w-7 place-items-center rounded-lg bg-primary text-on-primary text-xs font-bold cursor-pointer hover:brightness-110 shadow-sm transition-all"
                    >
                      +
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Pricing Totals Breakdown Inset Sub-Card */}
          <div className="flex flex-col gap-1.5 rounded-xl liquid-glass-subcard p-3.5 text-xs">
            <div className="flex justify-between text-on-surface-variant">
              <span>Subtotal:</span>
              <span className="font-semibold text-on-surface tabular-nums">{formatINR(totals.subtotal)}</span>
            </div>
            {totals.discount > 0 && (
              <div className="flex justify-between text-emerald-400">
                <span>Dine-In POS Discount:</span>
                <span className="font-bold tabular-nums">- {formatINR(totals.discount)}</span>
              </div>
            )}
            <div className="flex justify-between text-on-surface-variant text-[11px]">
              <span>Taxes (5% GST):</span>
              <span className="tabular-nums">{formatINR(totals.tax)}</span>
            </div>
            <div className="flex items-center justify-between font-black text-on-surface pt-1.5 border-t border-white/[0.08]">
              <span className="text-sm font-bold">Payable Amount</span>
              <span className="text-xl text-primary font-black tabular-nums">{formatINR(totals.total)}</span>
            </div>
          </div>

          {/* Cooking Instructions */}
          <div className="pt-1">
            <input
              type="text"
              value={cookingNote}
              onChange={(e) => setCookingNote(e.target.value)}
              placeholder="Cooking note (e.g. Less spicy, extra hot)..."
              className="w-full bg-surface-container-high rounded-lg px-2.5 py-1.5 text-xs text-on-surface placeholder:text-outline focus:outline-none focus:ring-1 focus:ring-primary"
            />
          </div>

          {/* Payment Method Selector (Paid By) */}
          <div className="flex flex-col gap-1.5 pt-1">
            <span className="text-[11px] font-bold text-on-surface-variant uppercase tracking-wider">
              Paid By (Payment Mode):
            </span>
            <div className="grid grid-cols-3 gap-1.5">
              {(
                [
                  ['cash', '💵 Cash'],
                  ['upi', '⚡ UPI QR'],
                  ['card', '💳 Card Swipe'],
                ] as const
              ).map(([mode, label]) => (
                <button
                  key={mode}
                  type="button"
                  onClick={() => setTenderType(mode)}
                  className={`rounded-lg py-2 px-1 text-center text-xs font-bold transition-all cursor-pointer ${
                    tenderType === mode
                      ? 'bg-primary text-on-primary shadow-sm ring-1 ring-primary'
                      : 'bg-surface-container-high text-on-surface hover:bg-primary/10 hover:text-primary hover:ring-1 hover:ring-primary/30'
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>

          {/* Order Completion Dispatch Button */}
          <button
            type="button"
            data-testid="pos-complete-order-btn"
            disabled={posCart.length === 0 || isSubmitting}
            onClick={() => {
              onCompletePosOrder(tenderType, matchedCustomer?.id, cookingNote);
              setCookingNote('');
            }}
            className="h-12 w-full mt-1 rounded-xl bg-primary hover:brightness-110 text-xs font-black text-on-primary disabled:opacity-40 flex items-center justify-center gap-2 shadow-lg cursor-pointer transition-all"
          >
            {isSubmitting ? (
              <span>Sending Order to Kitchen...</span>
            ) : (
              <span className="flex items-center gap-1.5">
                <span className="material-symbols-outlined text-[18px]">local_shipping</span>
                <span>
                  Punch Order · PAID ({tenderType.toUpperCase()}) (F9)
                </span>
              </span>
            )}
          </button>
        </section>
      </div>

      {variantItem && (() => {
        const variants = getItemVariants(variantItem);
        const dialogTheme = isLightTheme
          ? {
              overlay: 'bg-black/35',
              panel: 'border-outline-variant bg-surface-container-low text-on-surface',
              sectionBorder: 'border-outline-variant',
              thumbnail: 'bg-surface-container-high border-outline-variant',
              title: 'text-on-surface',
              muted: 'text-on-surface-variant',
              close: 'bg-surface-container-high hover:bg-surface-variant text-on-surface-variant hover:text-on-surface',
              label: 'text-on-surface',
              option: 'border-outline-variant bg-surface-container-lowest hover:bg-secondary-container hover:border-primary',
              optionTitle: 'text-on-surface group-hover:text-primary',
              optionSubtitle: 'text-on-surface-variant',
              price: 'text-primary bg-surface-container-high border-outline-variant',
              cancel: 'bg-surface-container-high hover:bg-surface-variant text-on-surface-variant',
            }
          : {
              overlay: 'bg-black/70',
              panel: 'border-slate-700 bg-slate-900 text-slate-100',
              sectionBorder: 'border-slate-800',
              thumbnail: 'bg-slate-800 border-slate-700',
              title: 'text-slate-100',
              muted: 'text-slate-400',
              close: 'bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-slate-100',
              label: 'text-slate-300',
              option: 'border-slate-700 bg-slate-800 hover:bg-primary/15 hover:border-primary',
              optionTitle: 'text-slate-100 group-hover:text-primary',
              optionSubtitle: 'text-slate-400',
              price: 'text-primary bg-slate-900 border-slate-700',
              cancel: 'bg-slate-800 hover:bg-slate-700 text-slate-300',
            };
        return (
          <div
            className={`fixed inset-0 z-[60] flex items-center justify-center ${dialogTheme.overlay} p-4 backdrop-blur-sm`}
            onClick={() => setVariantItem(null)}
          >
            <div
              role="dialog"
              aria-modal="true"
              aria-labelledby="pos-size-dialog-title"
              className={`w-full max-w-sm rounded-3xl border ${dialogTheme.panel} p-6 shadow-2xl space-y-4`}
              onClick={(event) => event.stopPropagation()}
            >
              <div className={`flex items-start justify-between gap-3 border-b ${dialogTheme.sectionBorder} pb-3`}>
                <div className="flex items-center gap-3">
                  <div className={`w-12 h-12 rounded-2xl overflow-hidden ${dialogTheme.thumbnail} shrink-0 border`}>
                    <CafeImage
                      src={variantItem.imageUrl}
                      alt={variantItem.name}
                      productId={variantItem.id}
                      className="w-full h-full object-cover"
                    />
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <h2 id="pos-size-dialog-title" className={`text-base font-bold ${dialogTheme.title}`}>
                        {variantItem.name}
                      </h2>
                      <span className={`px-1.5 py-0.5 rounded text-[10px] font-bold ${
                        variantItem.isVeg !== false ? 'bg-emerald-500/20 text-emerald-400' : 'bg-rose-500/20 text-rose-400'
                      }`}>
                        {variantItem.isVeg !== false ? 'Veg' : 'Non-Veg'}
                      </span>
                    </div>
                    <p className={`text-xs ${dialogTheme.muted} mt-0.5`}>{variantItem.category} • Base {formatINR(variantItem.price)}</p>
                  </div>
                </div>
                <button
                  type="button"
                  aria-label="Close size selection"
                  onClick={() => setVariantItem(null)}
                  className={`w-8 h-8 rounded-full ${dialogTheme.close} flex items-center justify-center transition-colors cursor-pointer`}
                >
                  <span className="material-symbols-outlined text-[18px]">close</span>
                </button>
              </div>

              <div>
                <label className={`text-xs font-semibold ${dialogTheme.label} block mb-2`}>
                  Select Size / Portion:
                </label>
                <div className="grid gap-2">
                  {variants.map((variant) => (
                    <button
                      key={variant.size}
                      type="button"
                      aria-label={`Add ${variantItem.name}, ${variant.size}, ${formatINR(variant.price)}`}
                      onClick={() => {
                        onAddPosItem(variantItem, variant);
                        setVariantItem(null);
                      }}
                      className={`flex items-center justify-between p-3 rounded-2xl border ${dialogTheme.option} transition-all cursor-pointer group text-left active:scale-[0.98]`}
                    >
                      <div className="min-w-0 pr-2">
                        <span className={`block text-sm font-bold ${dialogTheme.optionTitle} transition-colors truncate`}>
                          {variant.size}
                        </span>
                        {variant.label && (
                          <span className={`text-[11px] ${dialogTheme.optionSubtitle} block truncate`}>
                            {variant.label}
                          </span>
                        )}
                      </div>
                      <span className={`text-sm font-black ${dialogTheme.price} whitespace-nowrap px-2.5 py-1 rounded-xl border`}>
                        {formatINR(variant.price)}
                      </span>
                    </button>
                  ))}
                </div>
              </div>

              <div className={`pt-2 border-t ${dialogTheme.sectionBorder} flex items-center justify-between`}>
                <span className={`text-xs ${dialogTheme.muted}`}>Tap size to add to bill</span>
                <button
                  type="button"
                  onClick={() => setVariantItem(null)}
                  className={`px-4 py-2 rounded-xl ${dialogTheme.cancel} text-xs font-semibold transition-colors cursor-pointer`}
                >
                  Cancel
                </button>
              </div>
            </div>
          </div>
        );
      })()}

      {/* Quick Add Customer Modal */}
      {showAddCustomerModal && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-surface-container-low border border-outline-variant/30 rounded-2xl p-5 w-full max-w-sm text-on-surface shadow-2xl flex flex-col gap-3">
            <h3 className="text-base font-bold text-primary flex items-center gap-1.5">
              <span className="material-symbols-outlined text-[20px]">person_add</span>
              Quick Register Customer
            </h3>
            <p className="text-xs text-on-surface-variant">
              Save customer details for loyalty points and automatic phone lookup on future visits.
            </p>
            <form onSubmit={handleSaveNewCustomer} className="flex flex-col gap-3 pt-1">
              <div>
                <label className="text-[11px] font-bold text-on-surface-variant block mb-1">
                  Customer Mobile
                </label>
                <input
                  type="tel"
                  disabled
                  value={phoneQuery}
                  className="w-full bg-surface-container-high rounded-lg px-3 py-2 text-xs font-mono text-on-surface-variant"
                />
              </div>
              <div>
                <label className="text-[11px] font-bold text-on-surface-variant block mb-1">
                  Full Name *
                </label>
                <input
                  type="text"
                  required
                  autoFocus
                  value={newCustName}
                  onChange={(e) => setNewCustName(e.target.value)}
                  placeholder="Full name"
                  className="w-full bg-surface-container-high rounded-lg px-3 py-2 text-xs text-on-surface focus:outline-none focus:ring-1 focus:ring-primary"
                />
              </div>
              <div className="flex gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setShowAddCustomerModal(false)}
                  className="flex-1 py-2 rounded-xl bg-surface-container-high text-xs font-bold cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isAddingCustomer || !newCustName.trim()}
                  className="flex-1 py-2 rounded-xl bg-primary text-on-primary text-xs font-bold cursor-pointer disabled:opacity-50"
                >
                  {isAddingCustomer ? 'Saving...' : 'Register'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};