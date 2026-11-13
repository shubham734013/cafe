import React, { useState } from 'react';
import { MENU_ITEMS } from '../data/cafeSeedData';
import { CartItem, MenuCategory, MenuItem, ServiceMode } from '../types/cafe';
import { filterMenuItems } from '../utils/cafeLogic';
import { CafeImage } from './CafeImage';

interface CustomerMenuScreenProps {
  serviceMode: ServiceMode;
  selectedTable: string;
  activeCategory: MenuCategory;
  onCategoryChange: (cat: MenuCategory) => void;
  cart: CartItem[];
  cartTotal: number;
  cartCount: number;
  onAddToCart: (item: MenuItem) => void;
  onUpdateQty: (menuItemId: string, delta: number) => void;
  onNavigateCart: () => void;
  onToggleServiceMode: () => void;
}

const CATEGORIES: { id: MenuCategory; label: string; icon: string }[] = [
  { id: 'Best Sellers', label: 'Best Sellers', icon: 'local_fire_department' },
  { id: 'Beverages', label: 'Beverages (12)', icon: 'coffee' },
  { id: 'Snacks', label: 'Snacks', icon: 'bakery_dining' },
  { id: 'Meals', label: 'Meals', icon: 'lunch_dining' },
  { id: 'Desserts', label: 'Desserts', icon: 'icecream' },
  { id: 'Combos', label: 'Combos', icon: 'fastfood' },
  { id: 'All', label: 'All Items', icon: 'restaurant_menu' },
];

export const CustomerMenuScreen: React.FC<CustomerMenuScreenProps> = ({
  serviceMode,
  selectedTable,
  activeCategory,
  onCategoryChange,
  cart,
  cartTotal,
  cartCount,
  onAddToCart,
  onUpdateQty,
  onNavigateCart,
  onToggleServiceMode,
}) => {
  const [searchQuery, setSearchQuery] = useState('');
  const [justAddedId, setJustAddedId] = useState<string | null>(null);

  const visibleItems = filterMenuItems(MENU_ITEMS, activeCategory, searchQuery);

  const handleAdd = (item: MenuItem) => {
    onAddToCart(item);
    setJustAddedId(item.id);
    setTimeout(() => setJustAddedId((curr) => (curr === item.id ? null : curr)), 350);
  };

  return (
    <div className="flex flex-col w-full pb-28">
      {/* Controls & Location Bar */}
      <div className="pt-1 pb-2 flex flex-col gap-2.5">
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={onToggleServiceMode}
            className="flex items-center gap-1.5 px-3 py-2.5 rounded-xl bg-surface-container-high text-on-surface hover:bg-surface-variant transition-colors shrink-0 shadow-sm active:scale-95 cursor-pointer"
          >
            <span className="material-symbols-outlined icon-filled text-primary text-[18px]">
              table_restaurant
            </span>
            <span className="text-xs tracking-tight font-semibold whitespace-nowrap">
              {serviceMode === 'dine-in'
                ? `Dine-In (Table ${selectedTable.replace('T', '')})`
                : serviceMode === 'takeaway'
                  ? 'Takeaway'
                  : 'Delivery'}
            </span>
            <span className="material-symbols-outlined text-[16px] text-on-surface-variant">
              arrow_drop_down
            </span>
          </button>

          <div className="relative flex-1">
            <span className="material-symbols-outlined absolute left-3 top-1/2 -translate-y-1/2 text-outline text-[18px]">
              search
            </span>
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              aria-label="Search menu items"
              placeholder="Search items..."
              className="w-full pl-9 pr-8 py-2.5 bg-surface-container-lowest text-on-surface text-xs sm:text-sm rounded-xl placeholder:text-outline focus:outline-none focus:ring-1 focus:ring-primary shadow-inner"
            />
            {searchQuery && (
              <button
                type="button"
                aria-label="Clear menu search"
                onClick={() => setSearchQuery('')}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-outline hover:text-on-surface cursor-pointer"
              >
                <span className="material-symbols-outlined text-[16px]">close</span>
              </button>
            )}
          </div>
        </div>

        {/* Category Pills */}
        <div className="flex items-center gap-2 overflow-x-auto py-1 no-scrollbar">
          {CATEGORIES.map((cat) => {
            const active = activeCategory === cat.id;
            return (
              <button
                key={cat.id}
                type="button"
                onClick={() => onCategoryChange(cat.id)}
                className={`flex items-center gap-1.5 px-3.5 py-2 rounded-full text-xs whitespace-nowrap shrink-0 active:scale-95 transition-all cursor-pointer ${
                  active
                    ? 'bg-primary-container text-on-primary-container font-bold shadow-[0_2px_10px_rgba(245,158,11,0.25)]'
                    : 'bg-surface-container text-on-surface-variant hover:text-on-surface font-medium'
                }`}
              >
                <span className={`material-symbols-outlined text-[15px] ${active ? 'icon-filled' : ''}`}>
                  {cat.icon}
                </span>
                <span>{cat.label}</span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Menu Item Grid */}
      {visibleItems.length === 0 ? (
        <div className="bg-surface-container-low rounded-xl p-8 text-center my-4">
          <span className="material-symbols-outlined text-4xl text-outline mb-2">coffee_maker</span>
          <p className="text-base font-semibold text-on-surface">No menu items matched</p>
          <p className="text-xs text-on-surface-variant mt-1">
            Try clearing your search or switching to All Items.
          </p>
          <button
            type="button"
            onClick={() => {
              setSearchQuery('');
              onCategoryChange('All');
            }}
            className="mt-4 px-4 py-2 rounded-lg bg-primary text-on-primary text-xs font-bold cursor-pointer"
          >
            Reset Filters
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3 pt-1">
          {visibleItems.map((item) => {
            const inCart = cart.find((c) => c.menuItemId === item.id);
            const isFlashing = justAddedId === item.id;
            return (
              <div
                key={item.id}
                className="bg-surface-container-high rounded-xl overflow-hidden shadow-md flex flex-col group"
              >
                <div className="relative w-full aspect-square bg-surface-container-lowest overflow-hidden">
                  <CafeImage
                    src={item.imageUrl}
                    alt={item.name}
                    className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                  />
                  <div className="absolute inset-0 bg-gradient-to-t from-surface-container-high via-transparent to-transparent opacity-60" />
                  <div className="absolute top-2 right-2 px-2 py-0.5 rounded-full bg-surface-container-lowest/85 backdrop-blur-md flex items-center gap-1 shadow-sm">
                    <span className="material-symbols-outlined icon-filled text-primary text-[13px]">
                      star
                    </span>
                    <span className="text-[11px] text-on-surface font-semibold tabular-nums">
                      {item.rating}
                    </span>
                  </div>
                </div>

                <div className="p-3 flex flex-col flex-1 justify-between gap-2">
                  <div>
                    <h3 className="text-sm sm:text-base text-on-surface font-semibold tracking-tight truncate leading-tight">
                      {item.name}
                    </h3>
                    <p className="text-xs text-on-surface-variant mt-0.5 line-clamp-1">
                      {item.description}
                    </p>
                  </div>

                  <div className="flex items-center justify-between mt-1">
                    <span className="text-lg text-primary font-bold tabular-nums">₹{item.price}</span>

                    {inCart ? (
                      <div className="flex items-center gap-1.5 bg-surface-container-lowest rounded-lg p-0.5">
                        <button
                          type="button"
                          aria-label={`Decrease ${item.name} quantity`}
                          onClick={() => onUpdateQty(item.id, -1)}
                          className="w-7 h-7 flex items-center justify-center rounded text-on-surface-variant hover:text-primary cursor-pointer"
                        >
                          <span className="material-symbols-outlined text-[15px]">remove</span>
                        </button>
                        <span className="text-xs font-bold text-on-surface w-4 text-center tabular-nums">
                          {inCart.quantity}
                        </span>
                        <button
                          type="button"
                          aria-label={`Increase ${item.name} quantity`}
                          onClick={() => onUpdateQty(item.id, 1)}
                          className="w-7 h-7 flex items-center justify-center rounded text-primary hover:bg-surface-container cursor-pointer"
                        >
                          <span className="material-symbols-outlined text-[15px]">add</span>
                        </button>
                      </div>
                    ) : (
                      <button
                        type="button"
                        aria-label={`Add ${item.name}`}
                        onClick={() => handleAdd(item)}
                        className={`w-9 h-9 rounded-lg flex items-center justify-center shadow-md active:scale-90 transition-all cursor-pointer ${
                          isFlashing
                            ? 'bg-tertiary-container text-on-tertiary-container scale-110'
                            : 'bg-primary text-on-primary hover:brightness-110'
                        }`}
                      >
                        <span className="material-symbols-outlined text-[18px]">
                          {isFlashing ? 'check' : 'add'}
                        </span>
                      </button>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Floating Sticky Cart Banner */}
      {cartCount > 0 && (
        <div className="fixed bottom-18 md:bottom-6 inset-x-0 md:left-64 px-4 z-40 pointer-events-none flex justify-center">
          <div className="w-full max-w-2xl pointer-events-auto bg-surface-container-highest/95 backdrop-blur-md rounded-2xl p-2.5 pl-4 flex items-center justify-between shadow-[0_8px_24px_rgba(0,0,0,0.5)]">
            <div className="flex items-center gap-2.5 min-w-0">
              <div className="w-9 h-9 rounded-full bg-primary/20 text-primary flex items-center justify-center shrink-0">
                <span className="material-symbols-outlined icon-filled text-[18px]">
                  shopping_bag
                </span>
              </div>
              <div className="flex flex-col truncate">
                <span className="text-sm text-on-surface font-semibold tracking-tight truncate tabular-nums">
                  {cartCount} {cartCount === 1 ? 'item' : 'items'} in cart
                </span>
                <span className="text-xs text-primary font-bold tabular-nums">₹{cartTotal}</span>
              </div>
            </div>
            <button
              type="button"
              onClick={onNavigateCart}
              className="flex items-center gap-1.5 px-4 py-2.5 rounded-xl bg-primary-container text-on-primary-container text-sm font-bold shadow-md hover:brightness-110 active:scale-95 transition-all cursor-pointer"
            >
              <span>View Cart</span>
              <span className="material-symbols-outlined text-[18px]">arrow_forward</span>
            </button>
          </div>
        </div>
      )}
    </div>
  );
};
