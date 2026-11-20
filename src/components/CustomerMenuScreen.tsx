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
    <div className="w-full max-w-7xl mx-auto space-y-5 sm:space-y-6 pb-20 pt-1">
      {/* Top Header Row: "Menu" title on Left, "Cart" button on Right */}
      <div className="flex items-center justify-between gap-4">
        <h1 className="font-sans font-black text-2xl sm:text-4xl text-on-surface tracking-tight">
          Menu
        </h1>

        <button
          type="button"
          onClick={onNavigateCart}
          className="liquid-glass-pill rounded-xl px-3.5 sm:px-4 py-2 flex items-center gap-2 text-xs sm:text-sm font-semibold text-on-surface shadow-xs transition-all cursor-pointer active:scale-95 shrink-0 hover:border-primary/40"
        >
          <span className="material-symbols-outlined text-[19px] text-primary">
            shopping_bag
          </span>
          <span>Cart</span>
          {cartCount > 0 && (
            <span className="ml-0.5 px-1.5 py-0.2 rounded-full text-[10px] font-black bg-primary text-on-primary tabular-nums shadow-sm">
              {cartCount}
            </span>
          )}
        </button>
      </div>

      {/* Full-Width Search Input */}
      <div className="relative w-full">
        <span className="material-symbols-outlined absolute left-4 top-1/2 -translate-y-1/2 text-outline text-[20px] pointer-events-none">
          search
        </span>
        <input
          type="text"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          placeholder="Search menu..."
          className="w-full pl-11 pr-10 py-2.5 sm:py-3 bg-surface-container-low text-xs sm:text-sm text-on-surface placeholder:text-outline rounded-xl border border-outline-variant/20 focus:outline-none focus:ring-1 focus:ring-primary shadow-xs transition-all"
        />
        {searchQuery && (
          <button
            type="button"
            onClick={() => setSearchQuery('')}
            className="absolute right-3.5 top-1/2 -translate-y-1/2 text-outline hover:text-on-surface cursor-pointer"
          >
            <span className="material-symbols-outlined text-[18px]">close</span>
          </button>
        )}
      </div>

      {/* Horizontal Category Filter Pills */}
      <div className="flex items-center gap-2 sm:gap-2.5 overflow-x-auto no-scrollbar py-1">
        {CATEGORY_TABS.map((cat) => {
          const isActive = activeCategory === cat;
          return (
            <button
              key={cat}
              type="button"
              onClick={() => onCategoryChange(cat)}
              className={`px-4 py-1.5 rounded-full text-xs sm:text-sm font-semibold whitespace-nowrap transition-all cursor-pointer active:scale-95 ${
                isActive
                  ? 'bg-primary text-on-primary font-bold shadow-lg border border-primary/50'
                  : 'liquid-glass-pill text-on-surface-variant hover:text-on-surface hover:border-white/20'
              }`}
            >
              {cat}
            </button>
          );
        })}
      </div>

      {/* Empty State */}
      {visibleItems.length === 0 ? (
        <div className="p-10 sm:p-12 text-center liquid-glass rounded-3xl border border-white/[0.08] text-on-surface-variant text-sm shadow-xl">
          <div className="w-16 h-16 rounded-full bg-surface-container/70 border border-white/[0.08] text-outline mx-auto flex items-center justify-center mb-3">
            <span className="material-symbols-outlined text-[28px]">search_off</span>
          </div>
          <h3 className="font-sans font-bold text-base text-on-surface">No items found</h3>
          <p className="text-xs text-on-surface-variant mt-1">
            Try searching for another dish or select a different category.
          </p>
          <button
            type="button"
            onClick={() => {
              setSearchQuery('');
              onCategoryChange('All');
            }}
            className="mt-4 px-4 py-2 rounded-xl bg-primary text-on-primary font-bold text-xs hover:brightness-110 cursor-pointer shadow-md"
          >
            View All Dishes
          </button>
        </div>
      ) : (
        <>
          {/* MOBILE DEDICATED DISH CARD DESIGN (< 640px) */}
          <div className="sm:hidden space-y-3">
            {visibleItems.map((item) => {
              const isFav = favorites.has(item.id);
              const qtyInCart = getQuantityInCart(item.id);

              return (
                <div
                  key={`mobile-${item.id}`}
                  className="liquid-glass-card rounded-2xl p-3.5 shadow-lg transition-all flex items-start justify-between gap-3 relative"
                >
                  {/* Left Column: Veg badge, Title, Price, Description */}
                  <div
                    onClick={() => setDetailItem(item)}
                    className="flex-1 min-w-0 pr-1 cursor-pointer"
                  >
                    <div className="flex items-center gap-1.5 mb-1">
                      <span className="w-3.5 h-3.5 border border-emerald-500 p-0.5 rounded flex items-center justify-center shrink-0">
                        <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 block" />
                      </span>
                      {item.isBestSeller && (
                        <span className="text-[10px] font-bold text-amber-400 bg-amber-500/15 px-1.5 py-0.2 rounded">
                          Bestseller
                        </span>
                      )}
                    </div>

                    <h3 className="font-sans font-bold text-base text-on-surface tracking-tight leading-snug">
                      {item.name}
                    </h3>

                    <div className="font-sans font-bold text-base text-primary mt-1">
                      ₹{item.price}
                    </div>

                    <p className="text-xs text-on-surface-variant line-clamp-2 mt-1 leading-relaxed">
                      {item.description}
                    </p>
                  </div>

                  {/* Right Column: Square Photo with Overlapping + Add CTA & Heart */}
                  <div className="relative shrink-0 flex flex-col items-center pb-2.5">
                    <div
                      onClick={() => setDetailItem(item)}
                      className="w-28 h-24 rounded-2xl overflow-hidden bg-surface-container border border-outline-variant/15 cursor-pointer"
                    >
                      <CafeImage
                        src={item.imageUrl ?? ''}
                        alt={item.name}
                        className="w-full h-full object-cover"
                        fallbackIcon="restaurant"
                      />
                    </div>

                    {/* Heart Favorite Button */}
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        toggleFavorite(item.id);
                      }}
                      aria-label={`Favorite ${item.name}`}
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

                    {/* + Add CTA or Quantity Stepper at the bottom of the photo */}
                    <div className="absolute -bottom-1 left-1/2 -translate-x-1/2">
                      {qtyInCart === 0 ? (
                        <button
                          type="button"
                          onClick={() => onAddToCart(item, 1)}
                          className="px-3.5 py-1 rounded-xl bg-primary hover:brightness-110 text-on-primary font-bold text-xs flex items-center gap-1 shadow-sm transition-all active:scale-95 cursor-pointer"
                        >
                          <span className="material-symbols-outlined text-[14px]">add</span>
                          <span>Add</span>
                        </button>
                      ) : (
                        <div className="flex items-center gap-2 bg-primary text-on-primary px-2 py-0.5 rounded-xl shadow-md text-xs font-bold">
                          <button
                            type="button"
                            onClick={() => onUpdateQty(item.id, -1)}
                            className="w-4 h-4 flex items-center justify-center text-on-primary cursor-pointer"
                            aria-label="Decrease quantity"
                          >
                            <span className="material-symbols-outlined text-[12px]">remove</span>
                          </button>
                          <span className="tabular-nums min-w-[12px] text-center">{qtyInCart}</span>
                          <button
                            type="button"
                            onClick={() => onUpdateQty(item.id, 1)}
                            className="w-4 h-4 flex items-center justify-center text-on-primary cursor-pointer"
                            aria-label="Increase quantity"
                          >
                            <span className="material-symbols-outlined text-[12px]">add</span>
                          </button>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>

          {/* TABLET & DESKTOP 3-COLUMN GRID DESIGN (>= 640px) */}
          <div className="hidden sm:grid sm:grid-cols-2 lg:grid-cols-3 gap-5 sm:gap-6">
            {visibleItems.map((item) => {
              const isFav = favorites.has(item.id);
              const qtyInCart = getQuantityInCart(item.id);

              return (
                <div
                  key={`desktop-${item.id}`}
                  className="liquid-glass-card rounded-2xl overflow-hidden shadow-lg transition-all duration-300 flex flex-col group"
                >
                  {/* Food Image Container */}
                  <div
                    onClick={() => setDetailItem(item)}
                    className="relative w-full h-44 sm:h-48 overflow-hidden bg-surface-container cursor-pointer"
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

                  {/* Food Card Body */}
                  <div className="p-4 flex flex-col flex-1 justify-between">
                    <div
                      onClick={() => setDetailItem(item)}
                      className="cursor-pointer space-y-0.5"
                    >
                      <h3 className="font-sans font-bold text-base sm:text-lg text-on-surface tracking-tight group-hover:text-primary transition-colors">
                        {item.name}
                      </h3>
                      <p className="text-xs text-on-surface-variant line-clamp-1 leading-relaxed">
                        {item.description}
                      </p>
                    </div>

                    {/* Price & Add to Cart Bottom Action */}
                    <div className="mt-4 flex items-center justify-between pt-1">
                      <span className="font-sans font-bold text-lg sm:text-xl text-primary">
                        ₹{item.price}
                      </span>

                      {qtyInCart === 0 ? (
                        <button
                          type="button"
                          onClick={() => onAddToCart(item, 1)}
                          className="px-4 py-1.5 rounded-xl bg-primary hover:brightness-110 text-on-primary font-semibold text-xs sm:text-sm flex items-center gap-1 transition-all cursor-pointer active:scale-95 shadow-xs"
                        >
                          <span className="material-symbols-outlined text-[16px]">add</span>
                          <span>Add</span>
                        </button>
                      ) : (
                        <div className="flex items-center gap-2.5 bg-primary text-on-primary px-2.5 py-1 rounded-xl shadow-xs">
                          <button
                            type="button"
                            onClick={() => onUpdateQty(item.id, -1)}
                            className="w-5 h-5 flex items-center justify-center rounded-lg hover:bg-black/20 transition-colors text-on-primary font-bold cursor-pointer"
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
                            className="w-5 h-5 flex items-center justify-center rounded-lg hover:bg-black/20 transition-colors text-on-primary font-bold cursor-pointer"
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
        </>
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
