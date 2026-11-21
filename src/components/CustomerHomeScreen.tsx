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
      {/* Greeting Headline (Matches Reference Image Screen 4) */}
      <div className="pt-1 pb-3">
        <span className="text-xs sm:text-sm font-semibold text-[#7A7067] flex items-center gap-1.5">
          <span>Good Morning</span>
          <span aria-hidden="true">👋</span>
        </span>
        <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight text-[#1F1610] mt-1 leading-tight font-serif">
          What are you craving today?
        </h1>
      </div>

      {/* Search Input Bar */}
      <div className="pb-4">
        <div className="relative flex items-center">
          <span className="material-symbols-outlined absolute left-3.5 text-[#8C7E74] text-[20px] pointer-events-none">
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
            placeholder="Search for food, drinks, etc."
            aria-label="Search menu items"
            className="w-full pl-10 pr-10 py-3 bg-white text-xs sm:text-sm text-[#1F1610] placeholder:text-[#8C7E74] rounded-2xl border border-[#EAE2D7] focus:outline-none focus:ring-2 focus:ring-[#382319]/20 shadow-xs transition-all"
          />
          {searchQuery ? (
            <button
              type="button"
              onClick={() => setSearchQuery('')}
              className="absolute right-3 text-[#8C7E74] hover:text-[#1F1610] transition-colors cursor-pointer"
            >
              <span className="material-symbols-outlined text-[18px]">close</span>
            </button>
          ) : (
            <span className="material-symbols-outlined absolute right-3.5 text-[#8C7E74] text-[20px] pointer-events-none">
              tune
            </span>
          )}
        </div>
      </div>

      {/* Category Horizontal Pills (Panel 4) */}
      {!hasSearchQuery && (
        <div className="pb-4">
          <div className="flex items-center gap-2 overflow-x-auto no-scrollbar py-1">
            {[
              { id: 'All', label: 'All', icon: 'apps' },
              { id: 'Drink', label: 'Coffee', icon: 'local_cafe' },
              { id: 'Burger', label: 'Snacks', icon: 'lunch_dining' },
              { id: 'Pizza', label: 'Pizzas', icon: 'local_pizza' },
              { id: 'Pasta', label: 'Meals', icon: 'dinner_dining' },
              { id: 'Dessert', label: 'Desserts', icon: 'cake' },
            ].map((cat) => {
              const isSelected = selectedCategory === cat.id;
              return (
                <button
                  key={cat.id}
                  type="button"
                  onClick={() => setSelectedCategory(cat.id as MenuCategory | 'All')}
                  className={`inline-flex items-center gap-2 px-4 py-2.5 rounded-full text-xs font-bold transition-all shrink-0 cursor-pointer ${
                    isSelected
                      ? 'bg-[#382319] text-white shadow-xs'
                      : 'bg-white text-[#1F1610] border border-[#EAE2D7] hover:bg-[#F5EFE8]'
                  }`}
                >
                  <span className="material-symbols-outlined text-[17px]">
                    {cat.icon}
                  </span>
                  <span>{cat.label}</span>
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* New Winter Menu Banner (Panel 4) */}
      {!hasSearchQuery && (
        <section className="pb-5">
          <div
            onClick={() => onNavigateMenu('Drink')}
            className="relative min-h-[140px] sm:min-h-[155px] rounded-3xl bg-gradient-to-r from-[#2D1D16] to-[#3E271D] text-white p-5 sm:p-6 shadow-md overflow-hidden flex items-center justify-between cursor-pointer group"
          >
            <div className="relative z-10 max-w-[65%] space-y-1.5">
              <span className="inline-block px-2.5 py-0.5 rounded-full text-[10px] font-bold tracking-wider uppercase bg-white/15 text-amber-200 border border-white/20">
                New
              </span>
              <h2 className="text-xl sm:text-2xl font-serif font-black tracking-tight leading-tight text-white">
                Winter Menu
              </h2>
              <p className="text-xs sm:text-sm text-[#D7C9BF] font-medium">
                Hot Brews, Warm Bites
              </p>
              <div className="pt-2 flex items-center gap-2">
                <span className="w-8 h-8 rounded-full bg-white text-[#382319] flex items-center justify-center shadow-xs group-hover:scale-105 transition-transform">
                  <span className="material-symbols-outlined text-[18px]">arrow_forward</span>
                </span>
                <div className="flex items-center gap-1.5 ml-2">
                  <span className="w-1.5 h-1.5 rounded-full bg-white" />
                  <span className="w-1.5 h-1.5 rounded-full bg-white/40" />
                  <span className="w-1.5 h-1.5 rounded-full bg-white/40" />
                </div>
              </div>
            </div>

            <div className="relative z-10 w-28 h-28 sm:w-36 sm:h-36 shrink-0 flex items-center justify-center">
              <CafeImage
                src={CAFE_ASSETS.cappuccino || CAFE_ASSETS.coldCoffee}
                alt="Winter Menu Coffee"
                className="w-full h-full object-contain filter drop-shadow-lg group-hover:scale-105 transition-transform duration-300"
                fallbackIcon="local_cafe"
              />
            </div>
            {/* Ambient Background Warm Glow */}
            <div className="absolute -right-8 -bottom-8 w-48 h-48 rounded-full bg-[#C67C4E]/20 blur-2xl pointer-events-none" />
          </div>
        </section>
      )}
      {/* Popular Right Now Section (Matches Reference Image Screen 4) */}
      <div className="pb-4">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <h2
              className="text-base sm:text-lg font-bold text-[#1F1610] tracking-tight font-serif"
              aria-live="polite"
            >
              {hasSearchQuery ? `Search Results (${popularDishes.length})` : 'Popular Right Now'}
            </h2>
            {selectedCategory !== 'All' && (
              <span className="px-2 py-0.5 rounded-full bg-[#382319]/10 text-[#382319] text-[10px] font-bold">
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
              className="text-xs font-semibold text-[#8C7E74] hover:text-[#382319] cursor-pointer"
            >
              See All
            </button>
          )}
        </div>

        {/* Dish Cards Grid (Responsive: 2-Col Mobile, 3-Col Tablet, 4-Col Desktop) */}
        <div>
          {popularDishes.length === 0 ? (
            <div className="p-8 text-center bg-white rounded-2xl border border-[#EAE2D7] text-[#7A7067] text-xs shadow-xs">
              No items match "{searchQuery.trim()}".
            </div>
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3 sm:gap-4">
              {visibleDishes.map((dish) => {
                const isFav = favorites.has(dish.id);
                const quantityInCart = getQuantityInCart(dish.id);
                return (
                  <div
                    key={`home-dish-${dish.id}`}
                    className="bg-white rounded-2xl p-2.5 sm:p-3 border border-[#EAE2D7] shadow-xs flex flex-col justify-between hover:shadow-md transition-all relative group"
                  >
                    {/* Top: Square Rounded Photo */}
                    <div
                      onClick={() => setDetailItem(dish)}
                      className="aspect-square w-full rounded-xl overflow-hidden bg-[#FAF7F2] relative cursor-pointer"
                    >
                      <CafeImage
                        src={dish.imageUrl}
                        alt={dish.name}
                        className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                        fallbackIcon="restaurant"
                      />

                      {/* Favorite Heart Button */}
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          toggleFavorite(dish.id);
                        }}
                        aria-label="Favorite"
                        className="absolute top-1.5 right-1.5 w-7 h-7 rounded-full bg-white/90 backdrop-blur-xs shadow-xs flex items-center justify-center text-[#1F1610] hover:text-red-500 transition-all cursor-pointer"
                      >
                        <span
                          className={`material-symbols-outlined text-[16px] ${
                            isFav ? 'text-red-500 fill-current' : 'text-[#7A7067]'
                          }`}
                          style={{ fontVariationSettings: isFav ? "'FILL' 1" : "'FILL' 0" }}
                        >
                          favorite
                        </span>
                      </button>
                    </div>

                    {/* Info */}
                    <div
                      onClick={() => setDetailItem(dish)}
                      className="pt-2 flex-1 cursor-pointer"
                    >
                      <div className="flex items-center gap-1.5">
                        <span className="w-3 h-3 border border-emerald-600 p-0.5 rounded flex items-center justify-center shrink-0">
                          <span className="w-1.5 h-1.5 rounded-full bg-emerald-600 block" />
                        </span>
                        {dish.isBestSeller && (
                          <span className="text-[9px] font-bold text-amber-700 bg-amber-50 px-1.5 py-0.2 rounded border border-amber-200">
                            Bestseller
                          </span>
                        )}
                      </div>

                      <h3 className="font-bold text-xs sm:text-sm text-[#1F1610] tracking-tight leading-snug mt-1 line-clamp-1">
                        {dish.name}
                      </h3>

                      <p className="text-[10px] sm:text-[11px] text-[#7A7067] line-clamp-1 mt-0.5 leading-tight">
                        {dish.description}
                      </p>
                    </div>

                    {/* Bottom Row: Price & Quantity */}
                    <div className="mt-2.5 pt-2 border-t border-[#F5EFE8] flex items-center justify-between gap-1">
                      <span className="font-bold text-xs sm:text-sm text-[#1F1610]">
                        ₹{dish.price}
                      </span>

                      {quantityInCart === 0 ? (
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            onAddToCart(dish, 1);
                          }}
                          className="px-3 py-1 rounded-xl bg-[#382319] hover:bg-[#2B1B13] text-white font-bold text-xs flex items-center gap-1 shadow-xs transition-all active:scale-95 cursor-pointer whitespace-nowrap"
                        >
                          <span className="material-symbols-outlined text-[14px]">add</span>
                          <span>Add</span>
                        </button>
                      ) : (
                        <div className="flex items-center gap-1.5 bg-[#382319] text-white px-2 py-0.5 rounded-xl shadow-xs text-xs font-bold">
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              onUpdateQty(dish.id, -1);
                            }}
                            className="w-5 h-5 flex items-center justify-center text-white cursor-pointer hover:bg-white/20 rounded"
                            aria-label={`Decrease ${dish.name} quantity`}
                          >
                            <span className="material-symbols-outlined text-[13px]">remove</span>
                          </button>
                          <span className="tabular-nums min-w-[12px] text-center text-xs">
                            {quantityInCart}
                          </span>
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              onUpdateQty(dish.id, 1);
                            }}
                            className="w-5 h-5 flex items-center justify-center text-white cursor-pointer hover:bg-white/20 rounded"
                            aria-label={`Increase ${dish.name} quantity`}
                          >
                            <span className="material-symbols-outlined text-[13px]">add</span>
                          </button>
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
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
