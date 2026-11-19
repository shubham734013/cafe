import React, { useEffect, useMemo, useRef, useState } from 'react';
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
import { CafeImage } from './CafeImage';

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
  onAddPosItem: (item: MenuItem) => void;
  onUpdatePosQty: (menuItemId: string, delta: number) => void;
  onClearPosCart: () => void;
  onCompletePosOrder: (paymentMode?: PaymentMode, customerId?: string) => void;
  onToggleItemAvailability?: (menuItemId: string) => void;
  onQuickAddCustomer?: (name: string, phone: string) => Promise<void>;
  onPrintReceipt?: (order: CafeOrder) => void;
}

const POS_CATEGORIES: { id: MenuCategory; label: string }[] = [
  { id: 'All', label: 'All Items' },
  { id: 'Beverages', label: 'Beverages' },
  { id: 'Snacks', label: 'Snacks' },
  { id: 'Meals', label: 'Meals' },
  { id: 'Combos', label: 'Combos' },
  { id: 'Desserts', label: 'Desserts' },
];

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
  const [searchQuery, setSearchQuery] = useState('');
  const [activeCategory, setActiveCategory] = useState<MenuCategory>('All');
  const [tenderType, setTenderType] = useState<PaymentMode>('cash');
  const [manageStockMode, setManageStockMode] = useState(false);

  // Customer Loyalty lookup state
  const [phoneQuery, setPhoneQuery] = useState('');
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

  // Auto-match customer as phone is entered
  useEffect(() => {
    const clean = phoneQuery.trim().replace(/\D/g, '');
    if (clean.length >= 4) {
      const match = customers.find((c) => c.phone.replace(/\D/g, '').includes(clean));
      setMatchedCustomer(match || null);
    } else {
      setMatchedCustomer(null);
    }
  }, [phoneQuery, customers]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'F3') {
        event.preventDefault();
        searchInputRef.current?.focus();
      } else if (event.key === 'F9') {
        event.preventDefault();
        if (posCart.length > 0 && !isSubmitting) {
          onCompletePosOrder(tenderType, matchedCustomer?.id);
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
    isSubmitting,
    lastCompletedOrder,
    matchedCustomer?.id,
    onCompletePosOrder,
    onPrintReceipt,
    posCart.length,
    tenderType,
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
      <div className="flex flex-wrap items-center justify-between gap-2 bg-surface-container-low p-2.5 rounded-xl shadow-md border border-outline-variant/20">
        <div className="flex items-center gap-2">
          {/* Service Mode Selector */}
          <div className="flex gap-1 bg-surface-container-high p-1 rounded-lg">
            {([
              ['dine-in', 'Dine-In'],
              ['takeaway', 'Takeaway'],
              ['delivery', 'Delivery'],
            ] as const).map(([mode, label]) => (
              <button
                key={mode}
                type="button"
                onClick={() => onServiceModeChange(mode)}
                className={`px-3 py-1.5 rounded-md text-xs font-bold transition-all cursor-pointer ${
                  serviceMode === mode
                    ? 'bg-primary text-on-primary shadow-sm'
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
              value={selectedTable}
              onChange={(event) => onTableChange(event.target.value)}
              className="rounded-lg bg-surface-container-high px-3 py-1.5 text-xs font-bold text-on-surface border border-outline-variant/30"
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
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5">
            {visibleItems.map((item) => {
              const isAvailable = item.isAvailable !== false;
              return (
                <div
                  key={item.id}
                  className={`relative overflow-hidden rounded-xl bg-surface-container text-left shadow-sm transition-all border ${
                    !isAvailable
                      ? 'border-red-500/40 opacity-75 grayscale-[20%]'
                      : 'border-outline-variant/20 hover:border-primary/50'
                  }`}
                >
                  <button
                    type="button"
                    disabled={!isAvailable && !manageStockMode}
                    onClick={() => {
                      if (manageStockMode && onToggleItemAvailability) {
                        onToggleItemAvailability(item.id);
                      } else if (isAvailable) {
                        onAddPosItem(item);
                      }
                    }}
                    className="w-full text-left cursor-pointer"
                  >
                    <div className="h-24 bg-surface-container-low relative">
                      <CafeImage src={item.imageUrl} alt={item.name} className="w-full h-full object-cover" />
                      {!isAvailable && (
                        <div className="absolute inset-0 bg-red-950/70 backdrop-blur-[1px] flex flex-col items-center justify-center p-1 text-center">
                          <span className="material-symbols-outlined text-red-300 text-lg">block</span>
                          <span className="text-[10px] font-black tracking-wider text-red-200 uppercase">
                            86 · SOLD OUT
                          </span>
                        </div>
                      )}
                      {item.isBestSeller && isAvailable && (
                        <div className="absolute top-1 left-1 px-1.5 py-0.5 rounded bg-amber-500 text-neutral-950 text-[9px] font-black uppercase">
                          Hot
                        </div>
                      )}
                    </div>
                    <div className="p-2.5 flex flex-col justify-between gap-1">
                      <span className="block truncate text-xs font-bold text-on-surface">
                        {item.name}
                      </span>
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-black text-primary">₹{item.price}</span>
                        <span className="text-[10px] text-on-surface-variant font-medium">
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
                      className={`w-full py-1 text-[10px] font-black uppercase border-t flex items-center justify-center gap-1 cursor-pointer transition-all ${
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
        <section className="lg:col-span-5 flex flex-col gap-3 rounded-xl bg-surface-container-low p-4 shadow-md border border-outline-variant/20">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-black uppercase tracking-wider text-on-surface flex items-center gap-1.5">
              <span className="material-symbols-outlined text-primary text-[18px]">shopping_cart</span>
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

          {/* Customer Loyalty Search Strip */}
          <div className="bg-surface-container rounded-xl p-2.5 flex flex-col gap-1.5 border border-outline-variant/30">
            <div className="flex items-center justify-between text-xs font-semibold">
              <span className="text-on-surface-variant flex items-center gap-1">
                <span className="material-symbols-outlined text-[15px] text-primary">person_search</span>
                Loyalty Customer Lookup
              </span>
              {matchedCustomer && (
                <span className="text-[10px] px-2 py-0.5 rounded-full bg-primary-container text-on-primary-container font-black uppercase tracking-wider">
                  {matchedCustomer.segment}
                </span>
              )}
            </div>

            <div className="flex items-center gap-1.5">
              <input
                type="tel"
                value={phoneQuery}
                onChange={(e) => setPhoneQuery(e.target.value)}
                placeholder="Phone number..."
                className="flex-1 bg-surface-container-high rounded-lg px-2.5 py-1.5 text-xs text-on-surface focus:outline-none focus:ring-1 focus:ring-primary font-mono"
              />
              {phoneQuery && (
                <button
                  type="button"
                  onClick={() => {
                    setPhoneQuery('');
                    setMatchedCustomer(null);
                  }}
                  className="text-[11px] text-on-surface-variant hover:text-error px-1.5 font-bold"
                >
                  ✕
                </button>
              )}
            </div>

            {matchedCustomer ? (
              <div className="flex items-center justify-between text-xs pt-1 border-t border-outline-variant/20">
                <div className="min-w-0">
                  <span className="font-bold text-on-surface truncate block">
                    {matchedCustomer.name}
                  </span>
                  <span className="text-[10px] text-on-surface-variant">
                    {matchedCustomer.visits} visits · Total spent: {formatINR(matchedCustomer.totalSpent)}
                  </span>
                </div>
                <div className="text-primary font-black whitespace-nowrap text-right">
                  <div>⭐ {matchedCustomer.loyaltyPoints || 0} pts</div>
                  <div className="text-[9px] text-emerald-600 font-bold">+10 pts on order</div>
                </div>
              </div>
            ) : phoneQuery.trim().length >= 8 ? (
              <div className="flex items-center justify-between text-xs pt-1 border-t border-outline-variant/20 text-on-surface-variant">
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
            <div className="py-8 text-center text-xs text-on-surface-variant bg-surface-container/50 rounded-xl border border-dashed border-outline-variant/30 flex flex-col items-center gap-1">
              <span className="material-symbols-outlined text-2xl text-outline">point_of_sale</span>
              <span>Tap menu items on the left to add to bill</span>
              <span className="text-[10px] text-outline">Supports Dine-In, Takeaway, and Delivery</span>
            </div>
          ) : (
            <div className="flex flex-col gap-1.5 max-h-56 overflow-y-auto pr-1">
              {posCart.map((item) => (
                <div
                  key={item.menuItemId}
                  className="flex items-center justify-between gap-2 p-2 rounded-lg bg-surface-container border border-outline-variant/20"
                >
                  <div className="min-w-0 flex-1">
                    <span className="block truncate text-xs font-bold text-on-surface">
                      {item.name}
                    </span>
                    <span className="text-[10px] text-primary font-bold">
                      ₹{item.price * item.quantity} (₹{item.price} ea)
                    </span>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <button
                      type="button"
                      aria-label={`Decrease ${item.name}`}
                      onClick={() => onUpdatePosQty(item.menuItemId, -1)}
                      className="grid h-6 w-6 place-items-center rounded bg-surface-container-high hover:bg-surface-bright text-xs font-bold cursor-pointer"
                    >
                      −
                    </button>
                    <span className="w-5 text-center text-xs font-black">{item.quantity}</span>
                    <button
                      type="button"
                      aria-label={`Increase ${item.name}`}
                      onClick={() => onUpdatePosQty(item.menuItemId, 1)}
                      className="grid h-6 w-6 place-items-center rounded bg-primary text-on-primary text-xs font-bold cursor-pointer"
                    >
                      +
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Pricing Totals Breakdown */}
          <div className="flex flex-col gap-1 border-t border-outline-variant/30 pt-2 text-xs">
            <div className="flex justify-between text-on-surface-variant">
              <span>Subtotal:</span>
              <span className="font-semibold text-on-surface">{formatINR(totals.subtotal)}</span>
            </div>
            {totals.discount > 0 && (
              <div className="flex justify-between text-emerald-600">
                <span>Dine-In POS Discount:</span>
                <span className="font-bold">- {formatINR(totals.discount)}</span>
              </div>
            )}
            <div className="flex justify-between text-on-surface-variant text-[11px]">
              <span>Taxes (5% GST):</span>
              <span>{formatINR(totals.tax)}</span>
            </div>
            <div className="flex items-center justify-between font-black text-on-surface pt-1 border-t border-outline-variant/20">
              <span className="text-sm">Payable Amount</span>
              <span className="text-xl text-primary font-black">{formatINR(totals.total)}</span>
            </div>
          </div>

          {/* Payment Method Selector */}
          <div className="flex flex-col gap-1.5 pt-1">
            <span className="text-[11px] font-bold text-on-surface-variant uppercase tracking-wider">
              Payment Mode:
            </span>
            <div className="grid grid-cols-3 gap-1.5">
              {(
                [
                  ['cash', '💵 Cash'],
                  ['card', '💳 Card Swipe'],
                  ['upi', '⚡ UPI QR'],
                ] as const
              ).map(([mode, label]) => (
                <button
                  key={mode}
                  type="button"
                  onClick={() => setTenderType(mode)}
                  className={`rounded-lg py-2 text-xs font-bold transition-all cursor-pointer ${
                    tenderType === mode
                      ? 'bg-primary text-on-primary shadow-sm ring-1 ring-primary'
                      : 'bg-surface-container-high text-on-surface hover:bg-surface-bright'
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
            onClick={() => onCompletePosOrder(tenderType, matchedCustomer?.id)}
            className="h-12 w-full mt-1 rounded-xl bg-primary hover:brightness-110 text-xs font-black text-on-primary disabled:opacity-40 flex items-center justify-center gap-2 shadow-lg cursor-pointer transition-all"
          >
            {isSubmitting ? (
              <span>Sending Order to Kitchen...</span>
            ) : (
              <span className="flex items-center gap-1.5">
                <span className="material-symbols-outlined text-[18px]">local_shipping</span>
                <span>
                  Send Order to Kitchen · {tenderType.toUpperCase()} (F9)
                </span>
              </span>
            )}
          </button>
        </section>
      </div>

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