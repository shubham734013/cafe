import React, { useMemo, useState } from 'react';
import type { CartItem, MenuCategory, MenuItem, ServiceMode } from '../types/cafe';
import { filterMenuItems } from '../utils/cafeLogic';
import { CafeImage } from './CafeImage';
import { FoodDetailsModal } from './FoodDetailsModal';

interface CustomerMenuScreenProps {
  items: MenuItem[];
  serviceMode: ServiceMode;
  selectedTable: string;
  activeCategory: MenuCategory;
  onCategoryChange: (cat: MenuCategory) => void;
  cart: CartItem[];
  cartTotal: number;
  cartCount: number;
  onAddToCart: (item: MenuItem, quantity?: number) => void;
  onUpdateQty: (menuItemId: string, delta: number) => void;
  onNavigateCart: () => void;
  onToggleServiceMode: () => void;
  onNavigateHome?: () => void;
}

const CATEGORY_TABS: MenuCategory[] = [
  'All',
  'Pizza',
  'Burger',
  'Pasta',
  'Salad',
  'Drink',
  'Dessert',
];

export const CustomerMenuScreen: React.FC<CustomerMenuScreenProps> = ({
  items,
  serviceMode: _serviceMode,
  selectedTable: _selectedTable,
  activeCategory,
  onCategoryChange,
  cart,
  cartTotal: _cartTotal,
  cartCount,
  onAddToCart,
  onUpdateQty,
  onNavigateCart,
  onToggleServiceMode: _onToggleServiceMode,
  onNavigateHome: _onNavigateHome,
}) => {
  const [searchQuery, setSearchQuery] = useState('');
  const [detailItem, setDetailItem] = useState<MenuItem | null>(null);
  const [favorites, setFavorites] = useState<Set<string>>(new Set());

  // Filter items based on activeCategory and search query
  const visibleItems = useMemo(() => {
    const filtered = filterMenuItems(items, activeCategory, searchQuery);
    // When "All" is active and no search query, ensure the 6 showcase items from the design are featured prominently on top
    if (activeCategory === 'All' && !searchQuery.trim()) {
      const showcaseOrder = [
        'margherita-pizza',
        'classic-cheeseburger',
        'creamy-alfredo-pasta',
        'mediterranean-salad',
        'citrus-sunrise-drink',
        'berry-cheesecake',
      ];
      return [...filtered].sort((a, b) => {
        const indexA = showcaseOrder.indexOf(a.id);
        const indexB = showcaseOrder.indexOf(b.id);
        if (indexA !== -1 && indexB !== -1) return indexA - indexB;
        if (indexA !== -1) return -1;
        if (indexB !== -1) return 1;
        return 0;
      });
    }
    return filtered;
  }, [items, activeCategory, searchQuery]);

  const toggleFavorite = (id: string) => {
    setFavorites((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const getQuantityInCart = (itemId: string): number => {
    const found = cart.find((c) => c.menuItemId === itemId);
    return found ? found.quantity : 0;
  };

  return (
    <div className="w-full max-w-7xl mx-auto space-y-6 pb-20 pt-1">
      {/* Top Header Row: "Menu" title on Left, "Cart" button on Right */}
      <div className="flex items-center justify-between gap-4">
        <h1 className="font-serif font-black text-3xl sm:text-4xl text-[#221A15] tracking-tight">
          Menu
        </h1>

        <button
          type="button"
          onClick={onNavigateCart}
          className="border border-[#DFD7CD] rounded-xl px-4 py-2 flex items-center gap-2 text-xs sm:text-sm font-semibold text-[#251F1A] bg-white/80 hover:bg-white shadow-xs transition-all cursor-pointer active:scale-95 shrink-0"
        >
          <span className="material-symbols-outlined text-[19px] text-[#251F1A]">
            shopping_bag
          </span>
          <span>Cart</span>
          {cartCount > 0 && (
            <span className="ml-0.5 px-1.5 py-0.2 rounded-full text-[10px] font-black bg-[#244130] text-white tabular-nums">
              {cartCount}
            </span>
          )}
        </button>
      </div>

      {/* Full-Width Search Input */}
      <div className="relative w-full">
        <span className="material-symbols-outlined absolute left-4 top-1/2 -translate-y-1/2 text-[#7C7268] text-[20px] pointer-events-none">
          search
        </span>
        <input
          type="text"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          placeholder="Search menu..."
          className="w-full pl-11 pr-10 py-3 bg-white text-sm text-[#251F1A] placeholder:text-[#9A9085] rounded-xl border border-[#E5DDD2] focus:outline-none focus:ring-1 focus:ring-[#244130] shadow-xs transition-all"
        />
        {searchQuery && (
          <button
            type="button"
            onClick={() => setSearchQuery('')}
            className="absolute right-3.5 top-1/2 -translate-y-1/2 text-[#9A9085] hover:text-[#251F1A] cursor-pointer"
          >
            <span className="material-symbols-outlined text-[18px]">close</span>
          </button>
        )}
      </div>

      {/* Horizontal Category Filter Pills: All, Pizza, Burger, Pasta, Salad, Drink, Dessert */}
      <div className="flex items-center gap-2.5 overflow-x-auto no-scrollbar py-1">
        {CATEGORY_TABS.map((cat) => {
          const isActive = activeCategory === cat;
          return (
            <button
              key={cat}
              type="button"
              onClick={() => onCategoryChange(cat)}
              className={`px-4 py-1.5 rounded-full text-xs sm:text-sm font-medium whitespace-nowrap transition-all cursor-pointer active:scale-95 ${
                isActive
                  ? 'bg-[#D5E2D0] text-[#1B3625] font-bold shadow-xs border border-transparent'
                  : 'bg-white/90 border border-[#E2DAD0] text-[#423A32] hover:bg-white hover:border-[#D5CDC2]'
              }`}
            >
              {cat}
            </button>
          );
        })}
      </div>

      {/* Food Cards Grid: 3-column layout matching reference design */}
      {visibleItems.length === 0 ? (
        <div className="p-12 text-center bg-white rounded-3xl border border-[#EDE4D9] text-[#7B7166] text-sm shadow-xs">
          <div className="w-16 h-16 rounded-full bg-[#FAF7F2] border border-[#EDE4D9] text-[#7B7166] mx-auto flex items-center justify-center mb-3">
            <span className="material-symbols-outlined text-[28px]">search_off</span>
          </div>
          <h3 className="font-serif font-bold text-base text-[#251E18]">No items found</h3>
          <p className="text-xs text-[#7B7166] mt-1">
            Try searching for another dish or select a different category.
          </p>
          <button
            type="button"
            onClick={() => {
              setSearchQuery('');
              onCategoryChange('All');
            }}
            className="mt-4 px-4 py-2 rounded-xl bg-[#D5E2D0] text-[#1B3625] font-bold text-xs hover:brightness-95 cursor-pointer shadow-xs"
          >
            View All Dishes
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5 sm:gap-6">
          {visibleItems.map((item) => {
            const isFav = favorites.has(item.id);
            const qtyInCart = getQuantityInCart(item.id);

            return (
              <div
                key={item.id}
                className="bg-white rounded-2xl overflow-hidden border border-[#EDE4D9] shadow-xs hover:shadow-md transition-all duration-200 flex flex-col group"
              >
                {/* Food Image Container */}
                <div
                  onClick={() => setDetailItem(item)}
                  className="relative w-full h-44 sm:h-48 overflow-hidden bg-[#F2EDE7] cursor-pointer"
                >
                  <CafeImage
                    src={item.imageUrl ?? ''}
                    alt={item.name}
                    className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                    fallbackIcon="restaurant"
                  />

                  {/* Heart Favorite Button */}
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      toggleFavorite(item.id);
                    }}
                    aria-label={`Mark ${item.name} as favorite`}
                    className="absolute top-3 right-3 w-8 h-8 rounded-full bg-white/95 shadow-md flex items-center justify-center text-[#3B332B] hover:text-red-500 hover:scale-110 transition-all cursor-pointer"
                  >
                    <span
                      className={`material-symbols-outlined text-[18px] transition-colors ${
                        isFav ? 'text-red-500 fill-current' : 'text-[#3B332B]'
                      }`}
                      style={{ fontVariationSettings: isFav ? "'FILL' 1" : "'FILL' 0" }}
                    >
                      favorite
                    </span>
                  </button>
                </div>

                {/* Food Card Body */}
                <div className="p-4 flex flex-col flex-1 justify-between">
                  <div
                    onClick={() => setDetailItem(item)}
                    className="cursor-pointer space-y-0.5"
                  >
                    <h3 className="font-serif font-bold text-base sm:text-lg text-[#201914] tracking-tight group-hover:text-[#244130] transition-colors">
                      {item.name}
                    </h3>
                    <p className="text-xs text-[#7B7166] line-clamp-1 leading-relaxed">
                      {item.description}
                    </p>
                  </div>

                  {/* Price & Add to Cart Bottom Action */}
                  <div className="mt-4 flex items-center justify-between pt-1">
                    <span className="font-serif font-bold text-lg sm:text-xl text-[#221A15]">
                      ₹{item.price}
                    </span>

                    {qtyInCart === 0 ? (
                      <button
                        type="button"
                        onClick={() => onAddToCart(item, 1)}
                        className="px-4 py-1.5 rounded-xl bg-[#D5E2D0] hover:bg-[#244130] text-[#1B3625] hover:text-white font-semibold text-xs sm:text-sm flex items-center gap-1 transition-all cursor-pointer active:scale-95 shadow-xs"
                      >
                        <span className="material-symbols-outlined text-[16px]">add</span>
                        <span>Add</span>
                      </button>
                    ) : (
                      <div className="flex items-center gap-2.5 bg-[#244130] text-white px-2.5 py-1 rounded-xl shadow-xs">
                        <button
                          type="button"
                          onClick={() => onUpdateQty(item.id, -1)}
                          className="w-5 h-5 flex items-center justify-center rounded-lg hover:bg-white/20 transition-colors text-white font-bold cursor-pointer"
                          aria-label="Decrease quantity"
                        >
                          <span className="material-symbols-outlined text-[14px]">remove</span>
                        </button>
                        <span className="text-xs sm:text-sm font-bold min-w-[14px] text-center tabular-nums">
                          {qtyInCart}
                        </span>
                        <button
                          type="button"
                          onClick={() => onUpdateQty(item.id, 1)}
                          className="w-5 h-5 flex items-center justify-center rounded-lg hover:bg-white/20 transition-colors text-white font-bold cursor-pointer"
                          aria-label="Increase quantity"
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
      )}

      {/* Modal for detailed food view */}
      {detailItem && (
        <FoodDetailsModal
          item={detailItem}
          isOpen={Boolean(detailItem)}
          onClose={() => setDetailItem(null)}
          onAddToCart={(item, options) => {
            onAddToCart(item, options.quantity);
            setDetailItem(null);
          }}
          isFavorite={favorites.has(detailItem.id)}
          onToggleFavorite={toggleFavorite}
        />
      )}
    </div>
  );
};
