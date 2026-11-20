import React, { useEffect, useMemo, useState } from 'react';
import {
  CafeOrder,
  CafeTable,
  CustomerReview,
  MenuCategory,
  MenuItem,
  ServiceMode,
} from '../types/cafe';
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
  customerReviews?: CustomerReview[];
  menuItems: MenuItem[];
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

export const CustomerHomeScreen: React.FC<CustomerHomeScreenProps> = ({
  serviceMode,
  selectedTable,
  tables,
  cartCount,
  orders = [],
  customerReviews = [],
  menuItems,
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
  const [favorites, setFavorites] = useState<Set<string>>(new Set());
  const [tableModalOpen, setTableModalOpen] = useState(false);
  const [bookingModalOpen, setBookingModalOpen] = useState(false);
  const [bookingGuests, setBookingGuests] = useState('2 Guests');
  const [bookingTime, setBookingTime] = useState('7:30 PM');
  const [bookingName, setBookingName] = useState('');
  const [bookingPhone, setBookingPhone] = useState('');
  const [bookingError, setBookingError] = useState<string | null>(null);
  const [bookingSubmitting, setBookingSubmitting] = useState(false);

  const getCategoryCount = (catId: MenuCategory): number => {
    if (catId === 'Drink') {
      return menuItems.filter((m) => m.category === 'Drink' || m.category === 'Beverages').length;
    }
    if (catId === 'Dessert') {
      return menuItems.filter((m) => m.category === 'Dessert' || m.category === 'Desserts').length;
    }
    return menuItems.filter((m) => m.category === catId).length;
  };
  const categoryItems = useMemo(
    () =>
      [...new Set(menuItems.map((item) => item.category))].map((category) => {
        const categoryItems = menuItems.filter((item) => item.category === category);
        return {
          id: category as MenuCategory,
          name: category,
          image: categoryItems[0]?.imageUrl ?? '',
        };
      }),
    [menuItems]
  );

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
          {categoryItems.map((cat) => {
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
                <span className="text-[9px] text-on-surface-variant font-medium">
                  {getCategoryCount(cat.id)} items
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

        {/* Dish Cards (Responsive: Mobile Ergonomic Horizontal vs Desktop 3-Col Grid) */}
        <div>
          {popularDishes.length === 0 ? (
            <div className="p-8 text-center bg-surface-container-low rounded-2xl border border-outline-variant/15 text-on-surface-variant text-xs">
              No items match "{searchQuery.trim()}".
            </div>
          ) : (
            <>
              {/* MOBILE COMPACT HORIZONTAL DISH CARDS (< 640px) */}
              <div className="sm:hidden space-y-3">
                {visibleDishes.map((dish) => {
                  const isFav = favorites.has(dish.id);
                  return (
                    <div
                      key={`mobile-home-${dish.id}`}
                      className="liquid-glass-card rounded-2xl p-3.5 shadow-lg transition-all flex items-start justify-between gap-3 relative"
                    >
                      {/* Left: Info */}
                      <div
                        onClick={() => setDetailItem(dish)}
                        className="flex-1 min-w-0 pr-1 cursor-pointer"
                      >
                        <div className="flex items-center gap-1.5 mb-1">
                          <span className="w-3.5 h-3.5 border border-emerald-500 p-0.5 rounded flex items-center justify-center shrink-0">
                            <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 block" />
                          </span>
                          {dish.isBestSeller && (
                            <span className="text-[10px] font-bold text-amber-400 bg-amber-500/15 px-1.5 py-0.2 rounded">
                              Bestseller
                            </span>
                          )}
                        </div>

                        <h3 className="font-sans font-bold text-base text-on-surface tracking-tight leading-snug">
                          {dish.name}
                        </h3>

                        <div className="font-sans font-bold text-base text-primary mt-1">
                          ₹{dish.price}
                        </div>

                        <p className="text-xs text-on-surface-variant line-clamp-2 mt-1 leading-relaxed">
                          {dish.description}
                        </p>
                      </div>

                      {/* Right: Square Photo with Overlapping + Add CTA & Heart */}
                      <div className="relative shrink-0 flex flex-col items-center pb-2.5">
                        <div
                          onClick={() => setDetailItem(dish)}
                          className="w-28 h-24 rounded-2xl overflow-hidden bg-surface-container border border-outline-variant/15 cursor-pointer"
                        >
                          <CafeImage
                            src={dish.imageUrl}
                            alt={dish.name}
                            className="w-full h-full object-cover"
                            fallbackIcon="restaurant"
                          />
                        </div>

                        {/* Heart Favorite Button */}
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            toggleFavorite(dish.id);
                          }}
                          aria-label="Favorite"
                          className="absolute top-1.5 right-1.5 w-7 h-7 rounded-full bg-surface-container-high/90 shadow-sm flex items-center justify-center text-on-surface hover:text-red-500 transition-all cursor-pointer"
                        >
                          <span
                            className={`material-symbols-outlined text-[16px] ${
                              isFav ? 'text-red-500 fill-current' : 'text-on-surface'
                            }`}
                            style={{ fontVariationSettings: isFav ? "'FILL' 1" : "'FILL' 0" }}
                          >
                            favorite
                          </span>
                        </button>

                        {/* Add Button */}
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            onAddToCart(dish);
                            onNotify(`Added ${dish.name} to cart`);
                          }}
                          className="absolute -bottom-1 left-1/2 -translate-x-1/2 px-3.5 py-1 rounded-xl bg-primary hover:brightness-110 text-on-primary font-bold text-xs flex items-center gap-1 shadow-sm transition-all active:scale-95 cursor-pointer whitespace-nowrap"
                        >
                          <span className="material-symbols-outlined text-[14px]">add</span>
                          <span>Add</span>
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* DESKTOP/TABLET 3-COLUMN GRID (>= 640px) */}
              <div className="hidden sm:grid sm:grid-cols-2 lg:grid-cols-3 gap-5">
                {visibleDishes.map((dish) => {
                  const isFav = favorites.has(dish.id);
                  return (
                    <div
                      key={`desktop-home-${dish.id}`}
                      className="liquid-glass-card rounded-2xl overflow-hidden shadow-lg transition-all duration-300 flex flex-col group"
                    >
                      {/* Left Dish Photo */}
                      <div
                        onClick={() => setDetailItem(dish)}
                        className="relative w-full h-44 sm:h-48 overflow-hidden bg-surface-container cursor-pointer"
                      >
                        <CafeImage
                          src={dish.imageUrl}
                          alt={dish.name}
                          className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                          fallbackIcon="restaurant"
                        />

                        {/* Floating Heart Button */}
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            toggleFavorite(dish.id);
                          }}
                          aria-label="Favorite"
                          className="absolute top-3 right-3 w-8 h-8 rounded-full bg-surface-container-high/90 shadow-md flex items-center justify-center text-on-surface hover:text-red-500 hover:scale-110 transition-all cursor-pointer"
                        >
                          <span
                            className={`material-symbols-outlined text-[18px] transition-colors ${
                              isFav ? 'text-red-500 fill-current' : 'text-on-surface'
                            }`}
                            style={{ fontVariationSettings: isFav ? "'FILL' 1" : "'FILL' 0" }}
                          >
                            favorite
                          </span>
                        </button>
                      </div>

                      {/* Middle Info */}
                      <div className="p-4 flex flex-col flex-1 justify-between">
                        <div
                          onClick={() => setDetailItem(dish)}
                          className="cursor-pointer space-y-0.5"
                        >
                          <h3 className="font-sans font-bold text-base sm:text-lg text-on-surface tracking-tight group-hover:text-primary transition-colors">
                            {dish.name}
                          </h3>
                          <p className="text-xs text-on-surface-variant line-clamp-1 leading-relaxed">
                            {dish.description}
                          </p>
                        </div>

                        {/* Bottom Row */}
                        <div className="mt-4 flex items-center justify-between pt-1">
                          <span className="font-sans font-bold text-lg sm:text-xl text-primary">
                            ₹{dish.price}
                          </span>

                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              onAddToCart(dish);
                              onNotify(`Added ${dish.name} to cart`);
                            }}
                            className="px-4 py-1.5 rounded-xl bg-primary hover:brightness-110 text-on-primary font-semibold text-xs sm:text-sm flex items-center gap-1 transition-all cursor-pointer active:scale-95 shadow-xs"
                          >
                            <span className="material-symbols-outlined text-[16px]">add</span>
                            <span>Add</span>
                          </button>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </>
          )}
        </div>
      </div>

      {!hasSearchQuery && (
        <CustomerReviewsSection
          orders={orders}
          customerReviews={customerReviews}
          menuItems={menuItems}
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
                {tables.length > 0 ? (
                  <div className="grid grid-cols-4 gap-2">
                  {tables.map((t) => {
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
                ) : (
                  <p className="rounded-xl bg-surface-container-low p-3 text-xs text-on-surface-variant">
                    Dine-in tables are not configured yet.
                  </p>
                )}
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
