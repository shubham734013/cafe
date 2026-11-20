import React, { useEffect, useMemo, useState } from 'react';
import {
  CartItem,
  CafeOrder,
  CustomerReview,
  MenuCategory,
  MenuItem,
} from '../types/cafe';
import { CAFE_ASSETS } from '../data/cafeSeedData';
import { CafeImage } from './CafeImage';
import { CustomerReviewsSection } from './CustomerReviewsSection';
import { FoodDetailsModal } from './FoodDetailsModal';
import type { CustomerFeedbackInput } from '../shared/schemas';
import { filterMenuItems } from '../utils/cafeLogic';

interface CustomerHomeScreenProps {
  cartCount: number;
  cart: CartItem[];
  orders?: CafeOrder[];
  customerReviews?: CustomerReview[];
  menuItems: MenuItem[];
  firstOrderEligible: boolean;
  showFirstOrderOffer: boolean;
  onNavigateMenu: (category?: MenuCategory) => void;
  onNavigateCart: () => void;
  onNavigateRewards: () => void;
  onAddToCart: (item: MenuItem, quantity?: number) => void;
  onUpdateQty: (menuItemId: string, delta: number) => void;
  onSubmitFeedback: (feedback: CustomerFeedbackInput) => Promise<void>;
  onNotify: (msg: string) => void;
}

const CATEGORY_EMOJIS: Record<string, string> = {
  pizza: '🍕',
  burger: '🍔',
  pasta: '🍝',
  salad: '🥗',
  drink: '🥤',
  beverages: '🧋',
  dessert: '🍰',
  desserts: '🍰',
  snacks: '🍟',
  meals: '🍽️',
  combos: '🍱',
};
const CATEGORY_ORDER = ['Pizza', 'Burger', 'Pasta', 'Drink', 'Dessert'];

export const CustomerHomeScreen: React.FC<CustomerHomeScreenProps> = ({
  cartCount,
  cart,
  orders = [],
  customerReviews = [],
  menuItems,
  firstOrderEligible,
  showFirstOrderOffer,
  onNavigateMenu,
  onNavigateCart,
  onNavigateRewards: _onNavigateRewards,
  onAddToCart,
  onUpdateQty,
  onSubmitFeedback,
  onNotify,
}) => {
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<MenuCategory | 'All'>('All');
  const [detailItem, setDetailItem] = useState<MenuItem | null>(null);
  const [favorites, setFavorites] = useState<Set<string>>(new Set());

  const categoryItems = useMemo(
    () =>
      [...new Set(menuItems.map((item) => item.category))]
        .map((category) => ({
          id: category as MenuCategory,
          name: category,
        }))
        .sort((a, b) => {
          const aOrder = CATEGORY_ORDER.indexOf(a.name);
          const bOrder = CATEGORY_ORDER.indexOf(b.name);
          return (
            (aOrder === -1 ? CATEGORY_ORDER.length : aOrder) -
            (bOrder === -1 ? CATEGORY_ORDER.length : bOrder)
          );
        }),
    [menuItems]
  );

  // Keyboard shortcut listener for modals
  useEffect(() => {
    if (!detailItem) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setDetailItem(null);
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [detailItem]);

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

  const getQuantityInCart = (itemId: string): number =>
    cart.find((item) => item.menuItemId === itemId)?.quantity ?? 0;

  const hasSearchQuery = searchQuery.trim().length > 0;

  const popularDishes = useMemo(() => {
    return filterMenuItems(
      menuItems.filter((item) => !item.id.startsWith('test-')),
      selectedCategory,
      searchQuery
    );
  }, [menuItems, searchQuery, selectedCategory]);
  const visibleDishes = hasSearchQuery ? popularDishes : popularDishes.slice(0, 6);

  return (
    <div className="flex flex-col w-full pb-28 pt-1">
      {/* Top Header Bar */}
      <div className="flex items-center justify-between gap-2 pb-3">
        <div className="inline-flex min-w-0 items-center gap-1.5 rounded-full border border-outline-variant/15 bg-surface-container/70 px-3 py-2 text-xs font-semibold text-on-surface-variant">
          <span className="material-symbols-outlined text-[16px] text-primary">
            local_cafe
          </span>
          <span className="truncate">Freshly prepared</span>
        </div>

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

      {!hasSearchQuery && showFirstOrderOffer && (
        <section className="pb-6">
          <div className="relative min-h-[148px] overflow-hidden rounded-3xl border border-[#F6D6B8]/60 bg-[#F5E6D6] shadow-md sm:min-h-[168px]">
            <CafeImage
              src={CAFE_ASSETS.pizzaBanner}
              alt="Pizza featured in the first-order offer"
              className="absolute inset-y-0 right-0 h-full w-[58%] object-cover object-center"
            />
            <div className="absolute inset-0 bg-gradient-to-r from-[#F5E6D6] via-[#F5E6D6]/95 to-[#F5E6D6]/10" />
            <div className="relative z-10 flex min-h-[148px] w-[72%] flex-col items-start justify-center p-4 sm:min-h-[168px] sm:p-6">
              <h2 className="text-xl font-black leading-tight text-[#24180F] sm:text-2xl">
                Get 20% OFF
              </h2>
              <p className="mt-1 text-xs font-semibold text-[#5D4635] sm:text-sm">
                {firstOrderEligible
                  ? 'on your first order'
                  : 'Sign in to confirm your first-order offer'}
              </p>
              <button
                type="button"
                onClick={() => onNavigateMenu()}
                className="mt-3 inline-flex items-center gap-1.5 rounded-full bg-white px-4 py-2 text-xs font-bold text-[#C45E32] shadow-sm transition-transform hover:scale-[1.02] active:scale-95"
              >
                Order Now
                <span className="material-symbols-outlined text-[16px]">arrow_forward</span>
              </button>
            </div>
          </div>
        </section>
      )}

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

        <div className="flex items-start gap-4 sm:gap-6 overflow-x-auto no-scrollbar py-1">
          {categoryItems.map((cat) => {
            const isSelected = selectedCategory === cat.id;
            return (
              <button
                key={cat.id}
                type="button"
                onClick={() => {
                  setSelectedCategory(isSelected ? 'All' : cat.id);
                }}
                className="flex w-[88px] shrink-0 flex-col items-center gap-1.5 group cursor-pointer"
              >
                <div
                  className={`w-16 h-16 rounded-2xl p-1 transition-all flex items-center justify-center ${
                    isSelected
                      ? 'ring-1 ring-[#FF6422]/40 bg-[#FF6422]/10'
                      : 'hover:bg-surface-container/60'
                  }`}
                >
                  <span
                    aria-hidden="true"
                    className="text-[40px] leading-none transition-transform duration-300 group-hover:scale-110"
                  >
                    {CATEGORY_EMOJIS[cat.name.toLowerCase()] ?? '🍽️'}
                  </span>
                </div>
                <span
                  className={`whitespace-nowrap text-xs font-bold tracking-tight transition-colors ${
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
                  const quantityInCart = getQuantityInCart(dish.id);
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

                        <div className="absolute -bottom-1 left-1/2 -translate-x-1/2">
                          {quantityInCart === 0 ? (
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                onAddToCart(dish, 1);
                              }}
                              className="px-3.5 py-1 rounded-xl bg-primary hover:brightness-110 text-on-primary font-bold text-xs flex items-center gap-1 shadow-sm transition-all active:scale-95 cursor-pointer whitespace-nowrap"
                            >
                              <span className="material-symbols-outlined text-[14px]">add</span>
                              <span>Add</span>
                            </button>
                          ) : (
                            <div className="flex items-center gap-2 bg-primary text-on-primary px-2 py-0.5 rounded-xl shadow-md text-xs font-bold">
                              <button
                                type="button"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  onUpdateQty(dish.id, -1);
                                }}
                                className="w-5 h-5 flex items-center justify-center text-on-primary cursor-pointer"
                                aria-label={`Decrease ${dish.name} quantity`}
                              >
                                <span className="material-symbols-outlined text-[14px]">remove</span>
                              </button>
                              <span className="tabular-nums min-w-[12px] text-center">
                                {quantityInCart}
                              </span>
                              <button
                                type="button"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  onUpdateQty(dish.id, 1);
                                }}
                                className="w-5 h-5 flex items-center justify-center text-on-primary cursor-pointer"
                                aria-label={`Increase ${dish.name} quantity`}
                              >
                                <span className="material-symbols-outlined text-[14px]">add</span>
                              </button>
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* DESKTOP/TABLET 3-COLUMN GRID (>= 640px) */}
              <div className="hidden sm:grid sm:grid-cols-2 lg:grid-cols-3 gap-5">
                {visibleDishes.map((dish) => {
                  const isFav = favorites.has(dish.id);
                  const quantityInCart = getQuantityInCart(dish.id);
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

                          {quantityInCart === 0 ? (
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                onAddToCart(dish, 1);
                              }}
                              className="px-4 py-1.5 rounded-xl bg-primary hover:brightness-110 text-on-primary font-semibold text-xs sm:text-sm flex items-center gap-1 transition-all cursor-pointer active:scale-95 shadow-xs"
                            >
                              <span className="material-symbols-outlined text-[16px]">add</span>
                              <span>Add</span>
                            </button>
                          ) : (
                            <div className="flex items-center gap-2.5 bg-primary text-on-primary px-2.5 py-1 rounded-xl shadow-xs">
                              <button
                                type="button"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  onUpdateQty(dish.id, -1);
                                }}
                                className="w-5 h-5 flex items-center justify-center rounded-lg hover:bg-black/20 text-on-primary font-bold cursor-pointer"
                                aria-label={`Decrease ${dish.name} quantity`}
                              >
                                <span className="material-symbols-outlined text-[14px]">remove</span>
                              </button>
                              <span className="text-xs sm:text-sm font-bold min-w-[14px] text-center tabular-nums">
                                {quantityInCart}
                              </span>
                              <button
                                type="button"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  onUpdateQty(dish.id, 1);
                                }}
                                className="w-5 h-5 flex items-center justify-center rounded-lg hover:bg-black/20 text-on-primary font-bold cursor-pointer"
                                aria-label={`Increase ${dish.name} quantity`}
                              >
                                <span className="material-symbols-outlined text-[14px]">add</span>
                              </button>
                            </div>
                          )}
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

      {/* Food Details Modal */}
      <FoodDetailsModal
        item={detailItem}
        isOpen={Boolean(detailItem)}
        onClose={() => setDetailItem(null)}
        onAddToCart={(item, opts) => {
          onAddToCart(item, opts.quantity);
        }}
        isFavorite={detailItem ? favorites.has(detailItem.id) : false}
        onToggleFavorite={toggleFavorite}
      />
    </div>
  );
};
