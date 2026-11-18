import React, { useMemo, useState } from 'react';
import { CAFE_ASSETS, MENU_ITEMS } from '../data/cafeSeedData';
import { CartItem, MenuCategory, MenuItem, ServiceMode } from '../types/cafe';
import { filterMenuItems } from '../utils/cafeLogic';
import { CafeImage } from './CafeImage';
import { FoodDetailsModal } from './FoodDetailsModal';

interface CustomerMenuScreenProps {
  items?: MenuItem[];
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

interface CategoryCardMeta {
  id: MenuCategory;
  name: string;
  countLabel: string;
  image: string;
}

const CATEGORY_CARDS: CategoryCardMeta[] = [
  {
    id: 'Pizza',
    name: 'Pizza',
    countLabel: '36 Items',
    image: CAFE_ASSETS.pizzaMargherita,
  },
  {
    id: 'Burger',
    name: 'Burger',
    countLabel: '24 Items',
    image: CAFE_ASSETS.burgerClassic,
  },
  {
    id: 'Pasta',
    name: 'Pasta',
    countLabel: '18 Items',
    image: CAFE_ASSETS.pastaAlfredo,
  },
  {
    id: 'Salad',
    name: 'Salad',
    countLabel: '16 Items',
    image: CAFE_ASSETS.saladGarden,
  },
  {
    id: 'Drink',
    name: 'Drink',
    countLabel: '20 Items',
    image: CAFE_ASSETS.drinkCitrus,
  },
  {
    id: 'Dessert',
    name: 'Dessert',
    countLabel: '14 Items',
    image: CAFE_ASSETS.dessertCheesecake,
  },
];

export const CustomerMenuScreen: React.FC<CustomerMenuScreenProps> = ({
  items = MENU_ITEMS,
  serviceMode: _serviceMode,
  selectedTable: _selectedTable,
  activeCategory,
  onCategoryChange,
  cart: _cart,
  cartTotal: _cartTotal,
  cartCount,
  onAddToCart,
  onUpdateQty: _onUpdateQty,
  onNavigateCart,
  onToggleServiceMode: _onToggleServiceMode,
  onNavigateHome,
}) => {
  const [viewMode, setViewMode] = useState<'categories' | 'dishes'>('categories');
  const [searchQuery, setSearchQuery] = useState('');
  const [detailItem, setDetailItem] = useState<MenuItem | null>(null);
  const [favorites, setFavorites] = useState<Set<string>>(new Set(['margherita-pizza']));

  const visibleItems = useMemo(
    () => filterMenuItems(items, activeCategory, searchQuery),
    [items, activeCategory, searchQuery]
  );

  const toggleFavorite = (id: string) => {
    setFavorites((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const handleSelectCategory = (catId: MenuCategory) => {
    onCategoryChange(catId);
    setViewMode('dishes');
  };

  return (
    <div className="flex flex-col w-full pb-28 pt-1">
      {/* Top Header Bar (Exact match to Screen 2 in reference image) */}
      <div className="flex items-center justify-between gap-3 pb-4">
        {/* Left Back Button */}
        <button
          type="button"
          onClick={() => {
            if (viewMode === 'dishes') {
              setViewMode('categories');
            } else if (onNavigateHome) {
              onNavigateHome();
            } else {
              window.history.back();
            }
          }}
          aria-label="Go back"
          className="w-10 h-10 rounded-full bg-surface-container hover:bg-surface-container-high flex items-center justify-center text-on-surface transition-colors cursor-pointer shrink-0"
        >
          <span className="material-symbols-outlined text-[22px]">arrow_back</span>
        </button>

        {/* Screen Title */}
        <div className="flex items-center gap-2">
          <h1 className="text-lg font-black text-on-surface tracking-tight">
            {viewMode === 'categories' ? 'Categories' : activeCategory}
          </h1>
          {viewMode === 'dishes' && (
            <button
              type="button"
              onClick={() => setViewMode('categories')}
              className="text-xs text-[#FF6422] font-bold hover:underline cursor-pointer"
            >
              (All)
            </button>
          )}
        </div>

        {/* Right Cart Shortcut with Badge */}
        <button
          type="button"
          onClick={onNavigateCart}
          aria-label="Cart"
          className="relative w-10 h-10 rounded-full bg-surface-container hover:bg-surface-container-high flex items-center justify-center text-on-surface transition-colors cursor-pointer shrink-0"
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

      {/* Screen 2: Categories 2-Column Grid */}
      {viewMode === 'categories' ? (
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-3.5 sm:gap-4">
            {CATEGORY_CARDS.map((cat) => (
              <div
                key={cat.id}
                onClick={() => handleSelectCategory(cat.id)}
                className="group relative flex flex-col items-center text-center p-4 rounded-3xl bg-surface-container hover:bg-surface-container-high border border-outline-variant/15 shadow-sm hover:shadow-lg transition-all duration-300 cursor-pointer active:scale-[0.98]"
              >
                {/* Circular Category Photo */}
                <div className="w-24 h-24 sm:w-28 sm:h-28 rounded-full overflow-hidden p-1 shadow-md bg-surface ring-2 ring-outline-variant/10 mb-3 group-hover:scale-105 transition-transform duration-300">
                  <CafeImage
                    src={cat.image}
                    alt={cat.name}
                    className="w-full h-full object-cover rounded-full"
                    fallbackIcon="restaurant"
                  />
                </div>

                {/* Category Name */}
                <h3 className="text-sm sm:text-base font-extrabold text-on-surface tracking-tight group-hover:text-[#FF6422] transition-colors">
                  {cat.name}
                </h3>

                {/* Item Count Label */}
                <p className="text-[11px] text-on-surface-variant mt-0.5 font-medium">
                  {cat.countLabel}
                </p>
              </div>
            ))}
          </div>

          <div className="pt-2 text-center">
            <button
              type="button"
              onClick={() => {
                onCategoryChange('All');
                setViewMode('dishes');
              }}
              className="px-6 py-3 rounded-full bg-surface-container hover:bg-surface-container-high border border-outline-variant/20 text-xs font-bold text-on-surface inline-flex items-center gap-2 cursor-pointer transition-colors shadow-sm"
            >
              <span className="material-symbols-outlined text-[18px] text-[#FF6422]">
                restaurant_menu
              </span>
              <span>Browse All Menu Items</span>
            </button>
          </div>
        </div>
      ) : (
        /* Dishes List View for Selected Category */
        <div className="space-y-4">
          {/* Category Filter Pills */}
          <div className="flex items-center gap-2 overflow-x-auto no-scrollbar py-1">
            {(['All', 'Pizza', 'Burger', 'Pasta', 'Salad', 'Drink', 'Dessert'] as MenuCategory[]).map(
              (cat) => {
                const isActive = activeCategory === cat;
                return (
                  <button
                    key={cat}
                    type="button"
                    onClick={() => onCategoryChange(cat)}
                    className={`px-3.5 py-1.5 rounded-full text-xs font-bold whitespace-nowrap transition-all cursor-pointer ${
                      isActive
                        ? 'bg-[#FF6422] text-white shadow-md'
                        : 'bg-surface-container text-on-surface hover:bg-surface-container-high border border-outline-variant/15'
                    }`}
                  >
                    {cat}
                  </button>
                );
              }
            )}
          </div>

          {/* Search in Category */}
          <div className="relative">
            <span className="material-symbols-outlined absolute left-3 top-1/2 -translate-y-1/2 text-outline text-[18px]">
              search
            </span>
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder={`Search in ${activeCategory}...`}
              className="w-full pl-9 pr-9 py-2.5 bg-surface-container text-xs text-on-surface rounded-2xl border border-outline-variant/15 focus:outline-none focus:ring-1 focus:ring-[#FF6422]"
            />
            {searchQuery && (
              <button
                type="button"
                onClick={() => setSearchQuery('')}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-outline hover:text-on-surface"
              >
                <span className="material-symbols-outlined text-[16px]">close</span>
              </button>
            )}
          </div>

          {/* Dishes List */}
          <div className="space-y-3">
            {visibleItems.length === 0 ? (
              <div className="p-8 text-center bg-surface-container rounded-3xl text-on-surface-variant text-xs">
                No items found for &quot;{activeCategory}&quot;.
              </div>
            ) : (
              visibleItems.map((item) => {
                const isFav = favorites.has(item.id);
                return (
                  <div
                    key={item.id}
                    onClick={() => setDetailItem(item)}
                    className="group flex items-center justify-between gap-3 p-3.5 rounded-2xl bg-surface-container hover:bg-surface-container-high border border-outline-variant/15 shadow-sm hover:shadow-md transition-all cursor-pointer"
                  >
                    {/* Dish Photo */}
                    <div className="w-16 h-16 rounded-full overflow-hidden shrink-0 shadow-md ring-2 ring-outline-variant/10">
                      <CafeImage
                        src={item.imageUrl}
                        alt={item.name}
                        className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                        fallbackIcon="restaurant"
                      />
                    </div>

                    {/* Dish Info */}
                    <div className="flex-1 min-w-0">
                      <h3 className="text-xs sm:text-sm font-bold text-on-surface truncate group-hover:text-[#FF6422] transition-colors">
                        {item.name}
                      </h3>
                      <p className="text-[11px] text-on-surface-variant line-clamp-1 mt-0.5">
                        {item.description}
                      </p>
                      <div className="flex items-center gap-2 mt-1">
                        <span className="text-xs sm:text-sm font-black text-on-surface">
                          ₹{item.price}
                        </span>
                        <span className="text-[11px] text-on-surface-variant">·</span>
                        <div className="flex items-center gap-0.5">
                          <span className="material-symbols-outlined text-amber-400 icon-filled text-[14px]">
                            star
                          </span>
                          <span className="text-[11px] font-bold text-on-surface">
                            {item.rating?.toFixed(1) || '4.8'}
                          </span>
                        </div>
                      </div>
                    </div>

                    {/* Actions */}
                    <div className="flex items-center gap-1.5 shrink-0">
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          toggleFavorite(item.id);
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
                          onAddToCart(item);
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
