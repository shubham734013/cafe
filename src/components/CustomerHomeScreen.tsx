import React, { useEffect, useMemo, useState } from 'react';
import { CAFE_ASSETS, MENU_ITEMS } from '../data/cafeSeedData';
import { CafeOrder, CafeTable, MenuCategory, MenuItem, ServiceMode } from '../types/cafe';
import { CafeImage } from './CafeImage';
import { CustomerReviewsSection } from './CustomerReviewsSection';
import { FoodDetailsModal } from './FoodDetailsModal';
import type { CustomerFeedbackInput } from '../shared/schemas';
import { filterMenuItems } from '../utils/cafeLogic';

export interface TableReservationInput {
  guestName: string;
  guestPhone?: string;
  partySize: number;
  timeSlot: string;
}

interface CustomerHomeScreenProps {
  serviceMode: ServiceMode;
  selectedTable: string;
  tables: CafeTable[];
  cartCount: number;
  orders?: CafeOrder[];
  menuItems?: MenuItem[];
  onSelectServiceAndTable: (mode: ServiceMode, table: string) => void;
  onNavigateMenu: (category?: MenuCategory) => void;
  onNavigateCart: () => void;
  onNavigateRewards: () => void;
  onNavigateAdmin?: () => void;
  onAddToCart: (item: MenuItem, quantity?: number) => void;
  onSubmitFeedback: (feedback: CustomerFeedbackInput) => Promise<void>;
  onReserveTable?: (input: TableReservationInput) => Promise<CafeTable | void>;
  onNotify: (msg: string) => void;
}

const CATEGORY_ITEMS: Array<{
  id: MenuCategory;
  name: string;
  image: string;
  countLabel: string;
}> = [
  {
    id: 'Pizza',
    name: 'Pizza',
    image: CAFE_ASSETS.pizzaMargherita,
    countLabel: '36 Items',
  },
  {
    id: 'Burger',
    name: 'Burger',
    image: CAFE_ASSETS.burgerClassic,
    countLabel: '24 Items',
  },
  {
    id: 'Pasta',
    name: 'Pasta',
    image: CAFE_ASSETS.pastaAlfredo,
    countLabel: '18 Items',
  },
  {
    id: 'Salad',
    name: 'Salad',
    image: CAFE_ASSETS.saladGarden,
    countLabel: '16 Items',
  },
  {
    id: 'Drink',
    name: 'Drink',
    image: CAFE_ASSETS.drinkCitrus,
    countLabel: '20 Items',
  },
  {
    id: 'Dessert',
    name: 'Dessert',
    image: CAFE_ASSETS.dessertCheesecake,
    countLabel: '14 Items',
  },
];

export const CustomerHomeScreen: React.FC<CustomerHomeScreenProps> = ({
  serviceMode,
  selectedTable,
  tables,
  cartCount,
  orders = [],
  menuItems = MENU_ITEMS,
  onSelectServiceAndTable,
  onNavigateMenu,
  onNavigateCart,
  onNavigateRewards: _onNavigateRewards,
  onNavigateAdmin,
  onAddToCart,
  onSubmitFeedback,
  onReserveTable,
  onNotify,
}) => {
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<MenuCategory | 'All'>('All');
  const [detailItem, setDetailItem] = useState<MenuItem | null>(null);
  const [favorites, setFavorites] = useState<Set<string>>(new Set(['margherita-pizza']));
  const [tableModalOpen, setTableModalOpen] = useState(false);
  const [bookingModalOpen, setBookingModalOpen] = useState(false);
  const [bookingGuests, setBookingGuests] = useState('2 Guests');
  const [bookingTime, setBookingTime] = useState('7:30 PM');
  const [bookingName, setBookingName] = useState('');
  const [bookingPhone, setBookingPhone] = useState('');
  const [bookingError, setBookingError] = useState<string | null>(null);
  const [bookingSubmitting, setBookingSubmitting] = useState(false);

  // Keyboard shortcut listener for modals
  useEffect(() => {
    if (!tableModalOpen && !bookingModalOpen && !detailItem) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setTableModalOpen(false);
        setDetailItem(null);
        if (!bookingSubmitting) setBookingModalOpen(false);
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [bookingModalOpen, bookingSubmitting, detailItem, tableModalOpen]);

  const toggleFavorite = (id: string) => {
    setFavorites((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
        onNotify('Removed from favorites');
      } else {
        next.add(id);
        onNotify('Added to favorites ❤️');
      }
      return next;
    });
  };

  const handleBookingSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!bookingName.trim()) {
      setBookingError('Please enter your name.');
      return;
    }
    setBookingSubmitting(true);
    setBookingError(null);
    try {
      const partySizeNum = parseInt(bookingGuests, 10) || 2;
      await onReserveTable?.({
        guestName: bookingName.trim(),
        guestPhone: bookingPhone.trim() || undefined,
        partySize: partySizeNum,
        timeSlot: bookingTime,
      });
      onNotify(`Table reserved for ${bookingName.trim()} (${bookingGuests}) at ${bookingTime}`);
      setBookingModalOpen(false);
      setBookingName('');
      setBookingPhone('');
    } catch (err) {
      setBookingError(err instanceof Error ? err.message : 'Failed to book table. Please try again.');
    } finally {
      setBookingSubmitting(false);
    }
  };

  const hasSearchQuery = searchQuery.trim().length > 0;

  const popularDishes = useMemo(() => {
    return filterMenuItems(
      menuItems.filter((item) => !item.id.startsWith('test-')),
      selectedCategory,
      searchQuery
    );
  }, [menuItems, searchQuery, selectedCategory]);
  const visibleDishes = hasSearchQuery ? popularDishes : popularDishes.slice(0, 6);

  const modeLabel =
    serviceMode === 'dine-in'
      ? `Table ${selectedTable.replace('T', '')}`
      : serviceMode === 'takeaway'
        ? 'Takeaway'
        : 'Delivery';

  return (
    <div className="flex flex-col w-full pb-28 pt-1">
      {/* Top Header Bar */}
      <div className="flex items-center justify-between gap-2 pb-3">
        {/* Left Hamburger / Side Nav Button */}
        <button
          type="button"
          onClick={() => setTableModalOpen(true)}
          aria-label="Table and Service Settings"
          className="w-10 h-10 rounded-full bg-surface-container hover:bg-surface-container-high flex items-center justify-center text-on-surface transition-colors cursor-pointer shrink-0"
        >
          <span className="material-symbols-outlined text-[22px]">menu</span>
        </button>

        {/* Center Dine-In / Table Pill */}
        <button
          type="button"
          onClick={() => setTableModalOpen(true)}
          className="inline-flex items-center gap-1.5 bg-surface-container hover:bg-surface-container-high px-3 py-1.5 rounded-full border border-outline-variant/15 transition-colors cursor-pointer text-xs font-semibold text-on-surface"
        >
          <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse shrink-0" />
          <span className="material-symbols-outlined text-[16px] text-[#FF6422]">
            {serviceMode === 'dine-in'
              ? 'table_restaurant'
              : serviceMode === 'takeaway'
                ? 'takeout_dining'
                : 'moped'}
          </span>
          <span className="tracking-tight">{modeLabel}</span>
          <span className="material-symbols-outlined text-[16px] text-on-surface-variant">
            expand_more
          </span>
        </button>

        {/* Right Action Buttons */}
        <div className="flex items-center gap-1.5 shrink-0">
          <button
            type="button"
            onClick={onNavigateCart}
            aria-label="Cart"
            className="relative w-10 h-10 rounded-full bg-surface-container hover:bg-surface-container-high flex items-center justify-center text-on-surface transition-colors cursor-pointer"
          >
            <span className="material-symbols-outlined text-[20px] text-on-surface">
              shopping_bag
            </span>
            {cartCount > 0 && (
              <span className="absolute -top-1 -right-1 w-5 h-5 bg-[#FF6422] text-white text-[10px] font-black rounded-full flex items-center justify-center shadow-md">
                {cartCount}
              </span>
            )}
          </button>
        </div>
      </div>

      {/* Greeting Headline */}
      <div className="pt-2 pb-4">
        <span className="text-[#FF6422] font-black text-2xl sm:text-3xl tracking-tight block leading-tight">
          Delicious
        </span>
        <h1 className="text-on-surface font-extrabold text-2xl sm:text-3xl tracking-tight mt-0.5 leading-tight">
          Food for you
        </h1>
        <p className="text-on-surface-variant text-xs sm:text-sm mt-1">
          Discover and get great food from our restaurant
        </p>
      </div>

      {/* Search Input Bar */}
      <div className="pb-5">
        <div className="relative flex items-center">
          <span className="material-symbols-outlined absolute left-3.5 text-outline text-[20px] pointer-events-none">
            search
          </span>
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => {
              const query = e.target.value;
              setSearchQuery(query);
              if (query.trim()) setSelectedCategory('All');
            }}
            placeholder="Search for food..."
            aria-label="Search menu items"
            className="w-full pl-10 pr-10 py-3 bg-surface-container text-xs sm:text-sm text-on-surface placeholder:text-outline rounded-2xl border border-outline-variant/15 focus:outline-none focus:ring-2 focus:ring-[#FF6422]/50 shadow-inner transition-all"
          />
          {searchQuery ? (
            <button
              type="button"
              onClick={() => setSearchQuery('')}
              className="absolute right-3 text-outline hover:text-on-surface transition-colors cursor-pointer"
            >
              <span className="material-symbols-outlined text-[18px]">close</span>
            </button>
          ) : (
            <span className="material-symbols-outlined absolute right-3.5 text-outline text-[20px] pointer-events-none">
              tune
            </span>
          )}
        </div>
      </div>

      {!hasSearchQuery && (
        <>
      {/* Promo Banner Card (Exact style from reference screenshot) */}
      <div className="pb-6">
        <div className="relative w-full rounded-3xl overflow-hidden bg-gradient-to-r from-amber-600/25 via-orange-500/20 to-amber-900/10 border border-[#FF6422]/20 p-5 sm:p-6 shadow-xl flex items-center justify-between min-h-[140px]">
          <div className="relative z-10 max-w-[62%] sm:max-w-[65%] space-y-2">
            <h2 className="text-base sm:text-lg font-black text-on-surface leading-snug tracking-tight">
              Get 20% OFF <br />
              <span className="text-xs sm:text-sm font-semibold text-on-surface-variant">
                on your first order
              </span>
            </h2>
            <button
              type="button"
              onClick={() => {
                onNavigateMenu('Pizza');
                onNotify('Applied 20% promo on menu items!');
              }}
              className="mt-1 px-4 py-1.5 rounded-full bg-[#FF6422] hover:bg-[#E55518] text-white text-xs font-bold shadow-[0_4px_14px_rgba(255,100,34,0.35)] transition-all active:scale-95 cursor-pointer inline-flex items-center gap-1"
            >
              <span>Order Now</span>
            </button>
          </div>

          {/* Protruding Pizza Image */}
          <div className="absolute -right-5 -bottom-5 w-36 h-36 sm:w-44 sm:h-44 rounded-full overflow-hidden shadow-[0_12px_28px_rgba(0,0,0,0.5)] border-4 border-surface-container/60 transform rotate-12 transition-transform duration-500 hover:rotate-0">
            <CafeImage
              src={CAFE_ASSETS.pizzaBanner}
              alt="Promo Pizza"
              className="w-full h-full object-cover"
              fallbackIcon="local_pizza"
            />
          </div>
        </div>
      </div>

      {/* Categories Section */}
      <div className="pb-6">
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-base font-extrabold text-on-surface tracking-tight">Categories</h2>
          <button
            type="button"
            onClick={() => onNavigateMenu()}
            className="text-xs font-bold text-[#FF6422] hover:underline cursor-pointer"
          >
            View All
          </button>
        </div>

        {/* Circular Category Buttons */}
        <div className="flex items-center gap-3.5 overflow-x-auto no-scrollbar py-1">
          {CATEGORY_ITEMS.map((cat) => {
            const isSelected = selectedCategory === cat.id;
            return (
              <button
                key={cat.id}
                type="button"
                onClick={() => {
                  setSelectedCategory(isSelected ? 'All' : cat.id);
                }}
                className="flex flex-col items-center gap-1.5 shrink-0 group cursor-pointer"
              >
                <div
                  className={`w-14 h-14 sm:w-16 sm:h-16 rounded-full p-1 transition-all flex items-center justify-center ${
                    isSelected
                      ? 'ring-2 ring-[#FF6422] bg-[#FF6422]/15 shadow-md scale-105'
                      : 'bg-surface-container hover:bg-surface-container-high border border-outline-variant/15'
                  }`}
                >
                  <div className="w-full h-full rounded-full overflow-hidden shadow-sm">
                    <CafeImage
                      src={cat.image}
                      alt={cat.name}
                      className="w-full h-full object-cover group-hover:scale-110 transition-transform duration-300"
                      fallbackIcon="restaurant"
                    />
                  </div>
                </div>
                <span
                  className={`text-[11px] font-bold tracking-tight transition-colors ${
                    isSelected ? 'text-[#FF6422]' : 'text-on-surface'
                  }`}
                >
                  {cat.name}
                </span>
              </button>
            );
          })}
        </div>
      </div>
        </>
      )}

      {/* Popular Dishes Section */}
      <div className="pb-4">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <h2
              className="text-base font-extrabold text-on-surface tracking-tight"
              aria-live="polite"
            >
              {hasSearchQuery ? `Search Results (${popularDishes.length})` : 'Popular Dishes'}
            </h2>
            {selectedCategory !== 'All' && (
              <span className="px-2 py-0.5 rounded-full bg-[#FF6422]/15 text-[#FF6422] text-[10px] font-black">
                {selectedCategory}
              </span>
            )}
          </div>
          {!hasSearchQuery && (
            <button
              type="button"
              onClick={() =>
                onNavigateMenu(selectedCategory === 'All' ? undefined : selectedCategory)
              }
              className="text-xs font-bold text-[#FF6422] hover:underline cursor-pointer"
            >
              View All
            </button>
          )}
        </div>

        {/* Dish Cards List */}
        <div className="space-y-3">
          {popularDishes.length === 0 ? (
            <div className="p-8 text-center bg-surface-container rounded-2xl text-on-surface-variant text-xs">
              No items match "{searchQuery.trim()}".
            </div>
          ) : (
            visibleDishes.map((dish) => {
              const isFav = favorites.has(dish.id);
              return (
                <div
                  key={dish.id}
                  onClick={() => setDetailItem(dish)}
                  className="group flex items-center justify-between gap-3 p-3 rounded-2xl bg-surface-container hover:bg-surface-container-high border border-outline-variant/15 shadow-sm transition-all cursor-pointer hover:shadow-md"
                >
                  {/* Left Dish Photo */}
                  <div className="w-14 h-14 sm:w-16 sm:h-16 rounded-full overflow-hidden shrink-0 shadow-md ring-2 ring-outline-variant/10">
                    <CafeImage
                      src={dish.imageUrl}
                      alt={dish.name}
                      className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                      fallbackIcon="restaurant"
                    />
                  </div>

                  {/* Middle Info */}
                  <div className="flex-1 min-w-0">
                    <h3 className="text-xs sm:text-sm font-bold text-on-surface truncate group-hover:text-[#FF6422] transition-colors">
                      {dish.name}
                    </h3>
                    <div className="flex items-center gap-2 mt-1">
                      <span className="text-xs sm:text-sm font-black text-on-surface">
                        ₹{dish.price}
                      </span>
                      <span className="text-[11px] text-on-surface-variant">·</span>
                      <div className="flex items-center gap-0.5">
                        <span className="material-symbols-outlined text-amber-400 icon-filled text-[14px]">
                          star
                        </span>
                        <span className="text-[11px] font-bold text-on-surface">
                          {dish.rating?.toFixed(1) || '4.8'}
                        </span>
                      </div>
                    </div>
                  </div>

                  {/* Right Actions: Favorite & Quick Add */}
                  <div className="flex items-center gap-1.5 shrink-0">
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        toggleFavorite(dish.id);
                      }}
                      aria-label="Favorite"
                      className="w-8 h-8 rounded-full bg-surface hover:bg-surface-variant flex items-center justify-center transition-colors cursor-pointer"
                    >
                      <span
                        className={`material-symbols-outlined text-[18px] transition-colors ${
                          isFav ? 'text-red-500 icon-filled' : 'text-on-surface-variant'
                        }`}
                      >
                        favorite
                      </span>
                    </button>

                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        onAddToCart(dish);
                        onNotify(`Added ${dish.name} to cart`);
                      }}
                      aria-label="Add to cart"
                      className="w-8 h-8 rounded-full bg-[#FF6422] hover:bg-[#E55518] text-white flex items-center justify-center shadow-md active:scale-95 transition-all cursor-pointer font-bold"
                    >
                      <span className="material-symbols-outlined text-[18px]">add</span>
                    </button>
                  </div>
                </div>
              );
            })
          )}
        </div>
      </div>

      {!hasSearchQuery && (
        <CustomerReviewsSection
          orders={orders}
          onSelectDish={(dish) => setDetailItem(dish)}
          onSubmitFeedback={onSubmitFeedback}
          onNotify={onNotify}
        />
      )}

      {/* Table Selector Modal */}
      {tableModalOpen && (
        <div
          role="dialog"
          aria-modal="true"
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-sm animate-fade-in"
          onClick={() => setTableModalOpen(false)}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-sm rounded-3xl bg-surface-container border border-outline-variant/20 p-5 shadow-2xl space-y-4"
          >
            <div className="flex items-center justify-between pb-2 border-b border-outline-variant/15">
              <h3 className="text-sm font-bold text-on-surface">Select Order Service Mode</h3>
              <button
                type="button"
                onClick={() => setTableModalOpen(false)}
                className="w-8 h-8 rounded-full bg-surface-container-high flex items-center justify-center text-on-surface cursor-pointer"
              >
                <span className="material-symbols-outlined text-[18px]">close</span>
              </button>
            </div>

            <div className="grid grid-cols-3 gap-2">
              {(['dine-in', 'takeaway', 'delivery'] as const).map((mode) => (
                <button
                  key={mode}
                  type="button"
                  onClick={() => {
                    onSelectServiceAndTable(mode, selectedTable);
                    onNotify(`Switched to ${mode}`);
                  }}
                  className={`py-2 px-1 rounded-xl text-xs font-bold capitalize transition-all cursor-pointer ${
                    serviceMode === mode
                      ? 'bg-[#FF6422] text-white shadow-md'
                      : 'bg-surface-container-high text-on-surface-variant hover:text-on-surface'
                  }`}
                >
                  {mode}
                </button>
              ))}
            </div>

            {serviceMode === 'dine-in' && (
              <div>
                <label className="block text-xs font-bold text-on-surface mb-2">
                  Select Dine-In Table
                </label>
                <div className="grid grid-cols-4 gap-2">
                  {(tables.length > 0 ? tables : [{ id: 'T1' }, { id: 'T2' }, { id: 'T3' }, { id: 'T4' }]).map((t) => {
                    const tableId = t.id;
                    const isSelected = selectedTable === tableId;
                    return (
                      <button
                        key={tableId}
                        type="button"
                        onClick={() => {
                          onSelectServiceAndTable('dine-in', tableId);
                          onNotify(`Table set to ${tableId}`);
                          setTableModalOpen(false);
                        }}
                        className={`py-2 rounded-xl text-xs font-bold transition-all cursor-pointer ${
                          isSelected
                            ? 'bg-[#FF6422] text-white shadow-md'
                            : 'bg-surface-container-high text-on-surface hover:bg-surface-variant'
                        }`}
                      >
                        {tableId}
                      </button>
                    );
                  })}
                </div>
              </div>
            )}

            <div className="pt-2 space-y-2">
              <button
                type="button"
                onClick={() => {
                  setTableModalOpen(false);
                  setBookingModalOpen(true);
                }}
                className="w-full py-2.5 rounded-full bg-surface-container-high text-xs font-bold text-on-surface flex items-center justify-center gap-1.5 cursor-pointer hover:bg-surface-variant transition-colors"
              >
                <span className="material-symbols-outlined text-[16px]">calendar_today</span>
                <span>Book a Table in Advance</span>
              </button>

              {onNavigateAdmin && (
                <button
                  type="button"
                  onClick={() => {
                    setTableModalOpen(false);
                    onNavigateAdmin();
                  }}
                  className="w-full py-2.5 rounded-full bg-[#FF6422]/15 hover:bg-[#FF6422]/25 border border-[#FF6422]/25 text-xs font-bold text-[#FF6422] flex items-center justify-center gap-1.5 cursor-pointer transition-colors"
                >
                  <span className="material-symbols-outlined text-[16px]">shield_person</span>
                  <span>Open Admin & Staff Panel</span>
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Booking Modal */}
      {bookingModalOpen && (
        <div
          role="dialog"
          aria-modal="true"
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-sm animate-fade-in"
          onClick={() => setBookingModalOpen(false)}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-sm rounded-3xl bg-surface-container border border-outline-variant/20 p-5 shadow-2xl space-y-4"
          >
            <div className="flex items-center justify-between pb-2 border-b border-outline-variant/15">
              <h3 className="text-sm font-bold text-on-surface">Book a Table</h3>
              <button
                type="button"
                onClick={() => setBookingModalOpen(false)}
                className="w-8 h-8 rounded-full bg-surface-container-high flex items-center justify-center text-on-surface cursor-pointer"
              >
                <span className="material-symbols-outlined text-[18px]">close</span>
              </button>
            </div>

            {bookingError && (
              <p className="text-xs text-red-400 bg-red-950/40 p-2 rounded-lg">{bookingError}</p>
            )}

            <form onSubmit={handleBookingSubmit} className="space-y-3">
              <div>
                <label className="block text-xs font-semibold text-on-surface mb-1">Your Name</label>
                <input
                  type="text"
                  required
                  value={bookingName}
                  onChange={(e) => setBookingName(e.target.value)}
                  placeholder="e.g. John Doe"
                  className="w-full px-3 py-2 bg-surface text-xs rounded-xl border border-outline-variant/20 text-on-surface focus:outline-none focus:ring-1 focus:ring-[#FF6422]"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-on-surface mb-1">Phone (Optional)</label>
                <input
                  type="tel"
                  value={bookingPhone}
                  onChange={(e) => setBookingPhone(e.target.value)}
                  placeholder="e.g. 9876543210"
                  className="w-full px-3 py-2 bg-surface text-xs rounded-xl border border-outline-variant/20 text-on-surface focus:outline-none focus:ring-1 focus:ring-[#FF6422]"
                />
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block text-xs font-semibold text-on-surface mb-1">Guests</label>
                  <select
                    value={bookingGuests}
                    onChange={(e) => setBookingGuests(e.target.value)}
                    className="w-full px-2 py-2 bg-surface text-xs rounded-xl border border-outline-variant/20 text-on-surface"
                  >
                    <option value="1 Guest">1 Guest</option>
                    <option value="2 Guests">2 Guests</option>
                    <option value="4 Guests">4 Guests</option>
                    <option value="6 Guests">6 Guests</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-semibold text-on-surface mb-1">Time</label>
                  <select
                    value={bookingTime}
                    onChange={(e) => setBookingTime(e.target.value)}
                    className="w-full px-2 py-2 bg-surface text-xs rounded-xl border border-outline-variant/20 text-on-surface"
                  >
                    <option value="1:00 PM">1:00 PM</option>
                    <option value="7:30 PM">7:30 PM</option>
                    <option value="8:30 PM">8:30 PM</option>
                    <option value="9:15 PM">9:15 PM</option>
                  </select>
                </div>
              </div>

              <button
                type="submit"
                disabled={bookingSubmitting}
                className="w-full mt-2 py-3 rounded-full bg-[#FF6422] hover:bg-[#E55518] text-white text-xs font-bold transition-all shadow-md active:scale-95 cursor-pointer"
              >
                {bookingSubmitting ? 'Confirming...' : 'Confirm Reservation'}
              </button>
            </form>
          </div>
        </div>
      )}

      {/* Food Details Modal */}
      <FoodDetailsModal
        item={detailItem}
        isOpen={Boolean(detailItem)}
        onClose={() => setDetailItem(null)}
        onAddToCart={(item, opts) => {
          onAddToCart(item, opts.quantity);
          onNotify(`Added ${opts.quantity}x ${item.name} (${opts.size}) to cart`);
        }}
        isFavorite={detailItem ? favorites.has(detailItem.id) : false}
        onToggleFavorite={toggleFavorite}
      />
    </div>
  );
};
