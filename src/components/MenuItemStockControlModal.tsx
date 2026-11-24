import React, { useState, useMemo } from 'react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { CafeImage } from './CafeImage';
import type { MenuItem } from '../types/cafe';

interface MenuItemStockControlModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  menuItems: MenuItem[];
  onToggleAvailability: (menuItemId: string) => Promise<void> | void;
  onEditItem?: (item: MenuItem) => void;
  title?: string;
  roleLabel?: string;
}

export const MenuItemStockControlModal: React.FC<MenuItemStockControlModalProps> = ({
  open,
  onOpenChange,
  menuItems = [],
  onToggleAvailability,
  onEditItem,
  title = 'Menu Item Stock Control (86 / In Stock)',
  roleLabel = 'Kitchen & Admin',
}) => {
  const [search, setSearch] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<string>('All');
  const [stockFilter, setStockFilter] = useState<'all' | 'out_of_stock' | 'in_stock'>('all');
  const [togglingId, setTogglingId] = useState<string | null>(null);

  const categories = useMemo(() => {
    const set = new Set<string>();
    for (const item of menuItems) {
      if (item.category) set.add(item.category);
    }
    return ['All', ...Array.from(set).sort()];
  }, [menuItems]);

  const outOfStockCount = useMemo(
    () => menuItems.filter((i) => i.isAvailable === false).length,
    [menuItems]
  );
  const inStockCount = useMemo(
    () => menuItems.filter((i) => i.isAvailable !== false).length,
    [menuItems]
  );

  const filteredItems = useMemo(() => {
    const q = search.toLowerCase().trim();
    return menuItems.filter((item) => {
      // Stock filter
      if (stockFilter === 'out_of_stock' && item.isAvailable !== false) return false;
      if (stockFilter === 'in_stock' && item.isAvailable === false) return false;

      // Category filter
      if (selectedCategory !== 'All' && item.category !== selectedCategory) return false;

      // Search query
      if (q) {
        const matchesName = item.name.toLowerCase().includes(q);
        const matchesCat = item.category.toLowerCase().includes(q);
        const matchesStation = (item.station || '').toLowerCase().includes(q);
        if (!matchesName && !matchesCat && !matchesStation) return false;
      }
      return true;
    });
  }, [menuItems, search, selectedCategory, stockFilter]);

  const handleToggle = async (item: MenuItem) => {
    if (togglingId) return;
    setTogglingId(item.id);
    try {
      await onToggleAvailability(item.id);
    } finally {
      setTogglingId(null);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="stock-modal-panel w-[calc(100%-1.5rem)] max-w-[calc(100%-1.5rem)] sm:w-full sm:max-w-2xl p-0 rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[88vh]">
        {/* Header */}
        <DialogHeader className="stock-modal-header p-3.5 sm:p-5 pb-3 shrink-0">
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-2.5">
              <div className="stock-modal-icon w-10 h-10 rounded-xl flex items-center justify-center">
                <span className="material-symbols-outlined text-[22px]">remove_shopping_cart</span>
              </div>
              <div>
                <DialogTitle className="stock-modal-title text-base sm:text-lg font-bold">
                  {title}
                </DialogTitle>
                <DialogDescription className="sr-only">
                  Menu item stock control
                </DialogDescription>
              </div>
            </div>
          </div>

          {/* Quick Stats Pill */}
          <div className="flex flex-wrap items-center gap-1.5 mt-3 pt-3 border-t border-slate-800/80 text-[10px]">
            <button
              type="button"
              onClick={() => setStockFilter('all')}
              className={`px-2 py-1 rounded-md text-[10px] font-bold transition-all cursor-pointer ${
                stockFilter === 'all'
                  ? 'bg-slate-700 text-white shadow-xs'
                  : 'bg-slate-800/80 text-slate-400 hover:text-white'
              }`}
            >
              All ({menuItems.length})
            </button>
            <button
              type="button"
              onClick={() => setStockFilter('out_of_stock')}
              className={`px-2 py-1 rounded-md text-[10px] font-bold transition-all cursor-pointer flex items-center gap-1 ${
                stockFilter === 'out_of_stock'
                  ? 'bg-rose-500 text-white shadow-xs'
                  : 'bg-rose-500/15 text-rose-300 hover:bg-rose-500/25 border border-rose-500/30'
              }`}
            >
              <span className="w-2 h-2 rounded-full bg-rose-400 animate-pulse" />
              <span>Out of Stock ({outOfStockCount})</span>
            </button>
            <button
              type="button"
              onClick={() => setStockFilter('in_stock')}
              className={`px-2 py-1 rounded-md text-[10px] font-bold transition-all cursor-pointer flex items-center gap-1 ${
                stockFilter === 'in_stock'
                  ? 'bg-emerald-600 text-white shadow-xs'
                  : 'bg-emerald-500/15 text-emerald-300 hover:bg-emerald-500/25 border border-emerald-500/30'
              }`}
            >
              <span className="w-2 h-2 rounded-full bg-emerald-400" />
              <span>Stock ({inStockCount})</span>
            </button>
          </div>
        </DialogHeader>

        {/* Filter & Search Bar */}
        <div className="stock-modal-filters p-4 pb-2 space-y-3 shrink-0">
          <div className="relative">
            <span className="material-symbols-outlined absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 text-[18px]">
              search
            </span>
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search item name, station, or category..."
              className="stock-modal-search w-full pl-9 pr-9 py-2 rounded-xl text-xs focus:outline-none focus:ring-1 focus:ring-rose-400"
            />
            {search && (
              <button
                type="button"
                onClick={() => setSearch('')}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-white"
              >
                <span className="material-symbols-outlined text-[16px]">close</span>
              </button>
            )}
          </div>

          {/* Category Chips */}
          <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar py-0.5">
            {categories.map((cat) => (
              <button
                key={cat}
                type="button"
                onClick={() => setSelectedCategory(cat)}
                className={`px-3 py-1 rounded-full text-[11px] font-bold whitespace-nowrap transition-all cursor-pointer ${
                  selectedCategory === cat
                    ? 'bg-[#FF6422] text-white shadow-xs'
                    : 'bg-slate-800 text-slate-400 hover:bg-slate-700 hover:text-white'
                }`}
              >
                {cat}
              </button>
            ))}
          </div>
        </div>

        {/* Items List */}
        <div className="stock-modal-list flex-1 overflow-y-auto p-4 space-y-2.5 min-h-[260px]">
          {filteredItems.length === 0 ? (
            <div className="stock-modal-empty flex flex-col items-center justify-center py-12 text-center">
              <span className="material-symbols-outlined text-4xl mb-2">search_off</span>
              <p className="text-sm font-semibold">No menu items match your criteria.</p>
            </div>
          ) : (
            filteredItems.map((item) => {
              const isAvailable = item.isAvailable !== false;
              const isBusy = togglingId === item.id;

              return (
                <div
                  key={item.id}
                  className={`stock-modal-row pt-2.5 first:pt-0 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 p-2.5 rounded-xl transition-all ${
                    !isAvailable
                      ? 'bg-rose-950/20 border border-rose-900/30'
                      : 'hover:bg-slate-800/40'
                  }`}
                >
                  {/* Left: Item Info */}
                  <div className="flex items-center gap-3 min-w-0 flex-1">
                    <CafeImage
                      src={item.imageUrl}
                      alt={item.name}
                      productId={item.id}
                      className="stock-modal-image w-12 h-12 rounded-xl object-cover shrink-0"
                    />
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <h4 className="stock-modal-item-name text-xs sm:text-sm font-bold truncate">
                          {item.name}
                        </h4>
                        <span
                          className={`w-3 h-3 rounded flex items-center justify-center border text-[7px] font-bold shrink-0 ${
                            item.isVeg
                              ? 'border-emerald-500 text-emerald-500'
                              : 'border-rose-500 text-rose-500'
                          }`}
                        >
                          ●
                        </span>
                      </div>
                      <div className="stock-modal-meta flex items-center gap-2 mt-0.5 text-[11px]">
                        <span className="text-[#FF6422] font-bold tabular-nums">₹{item.price}</span>
                        <span>·</span>
                        <span>{item.category}</span>
                        {item.station && (
                          <>
                            <span>·</span>
                            <span className="font-mono text-[10px]">{item.station}</span>
                          </>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* Right: Availability Status & Toggle Button */}
                  <div className="flex w-full sm:w-auto items-center justify-between sm:justify-end gap-2.5 shrink-0">
                    <span
                      className={`px-2 py-1 rounded-md text-[9.5px] font-black uppercase tracking-wide flex items-center gap-1 ${
                        isAvailable
                          ? 'bg-emerald-500/15 text-emerald-300 border border-emerald-500/30'
                          : 'bg-rose-500/20 text-rose-300 border border-rose-500/40 animate-pulse'
                      }`}
                    >
                      <span
                        className={`w-1.5 h-1.5 rounded-full ${
                          isAvailable ? 'bg-emerald-400' : 'bg-rose-400'
                        }`}
                      />
                      {isAvailable ? 'In Stock' : "86'd Out"}
                    </span>

                    {onEditItem && (
                      <button
                        type="button"
                        onClick={() => onEditItem(item)}
                        title="Edit Product Details & Photo"
                        className="h-7 sm:h-8 px-2 sm:px-2.5 rounded-lg border border-slate-700 bg-slate-800 hover:bg-slate-700 font-bold text-[10px] sm:text-[11px] text-slate-200 flex items-center justify-center gap-1 transition-all cursor-pointer"
                      >
                        <span className="material-symbols-outlined text-[14px] text-[#FF6422]">edit</span>
                        <span>Edit</span>
                      </button>
                    )}

                    <button
                      type="button"
                      disabled={isBusy}
                      onClick={() => handleToggle(item)}
                      aria-label={isAvailable ? 'Tag Out of Stock (86)' : 'Tag In Stock'}
                      title={isAvailable ? 'Tag Out of Stock (86)' : 'Tag In Stock'}
                      className={`h-7 sm:h-8 px-2 sm:px-2.5 rounded-lg border font-bold text-[10px] sm:text-[11px] flex items-center justify-center gap-1 transition-all cursor-pointer active:scale-95 disabled:cursor-not-allowed disabled:opacity-50 ${
                        isAvailable
                          ? 'bg-rose-500/10 hover:bg-rose-500/20 border-rose-500/35 text-rose-300'
                          : 'bg-emerald-500/10 hover:bg-emerald-500/20 border-emerald-500/35 text-emerald-300'
                      }`}
                    >
                      {isBusy ? (
                        <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-white border-t-transparent" />
                      ) : (
                        <span className="material-symbols-outlined text-[15px]">
                          {isAvailable ? 'remove_shopping_cart' : 'check_circle'}
                        </span>
                      )}
                      <span>{isAvailable ? 'Tag Out of Stock (86)' : 'Tag In Stock'}</span>
                    </button>
                  </div>
                </div>
              );
            })
          )}
        </div>

        {/* Modal Footer */}
        <div className="stock-modal-footer p-3 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2 text-xs shrink-0">
          <button
            type="button"
            onClick={() => onOpenChange(false)}
            className="stock-modal-done ml-auto px-4 py-1.5 rounded-xl font-bold transition-colors cursor-pointer"
          >
            Done
          </button>
        </div>
      </DialogContent>
    </Dialog>
  );
};
