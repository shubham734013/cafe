import React, { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import type { MenuItem } from '../types/cafe';
import { getItemVariants } from '../utils/menuVariants';
import { CafeImage } from './CafeImage';

interface FoodDetailsModalProps {
  item: MenuItem | null;
  isOpen: boolean;
  onClose: () => void;
  onAddToCart: (item: MenuItem, options: { size: string; quantity: number }) => void;
  isFavorite?: boolean;
  onToggleFavorite?: (itemId: string) => void;
}

export const FoodDetailsModal: React.FC<FoodDetailsModalProps> = ({
  item,
  isOpen,
  onClose,
  onAddToCart,
  isFavorite = false,
  onToggleFavorite,
}) => {
  const [selectedSize, setSelectedSize] = useState('Regular');
  const [quantity, setQuantity] = useState(1);
  const [favorited, setFavorited] = useState(isFavorite);
  const [addedAnimation, setAddedAnimation] = useState(false);

  useEffect(() => {
    if (!isOpen || !item) return;
    setSelectedSize(getItemVariants(item)[0]?.size ?? 'Regular');
    setQuantity(1);
    setAddedAnimation(false);
  }, [isOpen, item?.id]);

  useEffect(() => {
    setFavorited(isFavorite);
  }, [isFavorite]);

  useEffect(() => {
    if (!isOpen) return;
    const bodyOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = bodyOverflow || '';
      document.documentElement.style.overflow = '';
    };
  }, [isOpen]);

  if (!isOpen || !item || typeof document === 'undefined') return null;

  const sizeOptions = getItemVariants(item);
  const selectedVariant =
    sizeOptions.find((variant) => variant.size === selectedSize) ?? sizeOptions[0];
  const unitPrice = selectedVariant?.price ?? item.price;
  const totalPrice = unitPrice * quantity;

  const handleToggleFav = (e: React.MouseEvent) => {
    e.stopPropagation();
    const next = !favorited;
    setFavorited(next);
    onToggleFavorite?.(item.id);
  };

  const handleAdd = () => {
    setAddedAnimation(true);
    onAddToCart(item, { size: selectedSize, quantity });
    setTimeout(() => {
      setAddedAnimation(false);
      onClose();
    }, 350);
  };

  return createPortal(
    <div
      role="dialog"
      aria-modal="true"
      className="fixed inset-0 z-50 flex items-center justify-center overflow-hidden bg-black/25 p-3 backdrop-blur-[2px] animate-fade-in sm:p-4"
      onClick={onClose}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-md max-h-[90dvh] overflow-hidden rounded-3xl bg-surface-container border border-outline-variant shadow-2xl flex flex-col"
      >
        {/* Top Floating Controls */}
        <div className="flex items-center justify-between px-4 pt-4 pb-2">
          <button
            type="button"
            onClick={onClose}
            aria-label="Back"
            className="w-9 h-9 rounded-full bg-surface-container-low border border-outline-variant flex items-center justify-center text-on-surface shadow-xs hover:bg-surface-container-high transition-colors cursor-pointer"
          >
            <span className="material-symbols-outlined text-[20px]">arrow_back</span>
          </button>

          <button
            type="button"
            onClick={handleToggleFav}
            aria-label="Add to favorites"
            className="w-9 h-9 rounded-full bg-surface-container-low border border-outline-variant flex items-center justify-center text-on-surface shadow-xs hover:bg-surface-container-high transition-colors cursor-pointer"
          >
            <span
              className={`material-symbols-outlined text-[20px] transition-colors ${
                favorited ? 'text-red-500 fill-current' : 'text-on-surface-variant'
              }`}
              style={{ fontVariationSettings: favorited ? "'FILL' 1" : "'FILL' 0" }}
            >
              favorite
            </span>
          </button>
        </div>

        {/* Hero Food Photography (Panel 6) */}
        <div className="px-4 py-1">
          <div className="relative w-full h-[clamp(120px,22dvh,240px)] rounded-2xl overflow-hidden bg-surface-container-low border border-outline-variant shadow-xs">
            <CafeImage
              src={item.imageUrl ?? ''}
              alt={item.name}
              productId={item.id}
              className={`w-full h-full object-cover transition-transform duration-500 hover:scale-105 ${
                item.isAvailable === false ? 'grayscale opacity-60' : ''
              }`}
              fallbackIcon="restaurant"
            />
            {item.isAvailable === false && (
              <div className="absolute inset-0 bg-black/60 backdrop-blur-[1px] flex flex-col items-center justify-center p-3 text-center">
                <span className="text-xs font-black uppercase tracking-wider text-rose-300 bg-rose-950/85 px-3 py-1 rounded-full border border-rose-500/40 shadow-sm">
                  Currently Sold Out
                </span>
                <span className="text-[11px] text-slate-300 mt-1 font-medium">
                  This item is temporarily unavailable from the kitchen
                </span>
              </div>
            )}
          </div>
        </div>

        {/* Dish Info & Selectors (Scrollable) */}
        <div className="overflow-y-auto flex-1 p-4 sm:p-5 space-y-3.5 sm:space-y-4 no-scrollbar">
          <div>
            <h1 className="font-serif font-black text-xl sm:text-2xl text-on-surface tracking-tight">
              {item.name}
            </h1>
            <p className="text-xs text-on-surface-variant mt-1.5 leading-relaxed">
              {item.description}
            </p>
          </div>

          {/* Price & Quantity Row (Panel 6) */}
          <div className="flex items-center justify-between pt-1">
            <span className="font-bold text-2xl text-on-surface">
              ₹{unitPrice}
            </span>

            <div className="flex items-center gap-2 bg-surface-container-low px-3 py-1 rounded-full border border-outline-variant shadow-xs">
              <button
                type="button"
                onClick={() => setQuantity((q) => Math.max(1, q - 1))}
                aria-label="Decrease quantity"
                className="w-6 h-6 rounded-full bg-surface-container hover:bg-outline-variant flex items-center justify-center text-on-surface font-bold text-xs cursor-pointer transition-colors"
              >
                –
              </button>
              <span className="text-sm font-bold text-on-surface min-w-[20px] text-center tabular-nums">
                {quantity}
              </span>
              <button
                type="button"
                onClick={() => setQuantity((q) => q + 1)}
                aria-label="Increase quantity"
                className="w-6 h-6 rounded-full bg-surface-container hover:bg-outline-variant flex items-center justify-center text-on-surface font-bold text-xs cursor-pointer transition-colors"
              >
                +
              </button>
            </div>
          </div>

          {/* Size Selector (Panel 6: Regular 250ml, Large 350ml, Extra Large 450ml) */}
          <div>
            <label className="block text-xs font-bold text-on-surface mb-2">
              Size
            </label>
            <div
              className={`grid gap-2 ${
                sizeOptions.length === 1
                  ? 'grid-cols-1'
                  : sizeOptions.length === 2
                    ? 'grid-cols-2'
                    : 'grid-cols-3'
              }`}
            >
              {sizeOptions.map(({ size, label }, index) => {
                const isSelected = selectedSize === size;
                return (
                  <button
                    key={size}
                    type="button"
                    onClick={() => setSelectedSize(size)}
                    className={`py-2.5 sm:py-3 px-1.5 sm:px-2 rounded-2xl flex flex-col items-center gap-1 transition-all cursor-pointer active:scale-95 ${
                      isSelected
                        ? 'bg-primary/10 border-2 border-primary shadow-xs'
                        : 'bg-surface-container-low border border-outline-variant hover:bg-surface-container'
                    }`}
                  >
                    <span
                      className={`material-symbols-outlined ${
                        isSelected ? 'text-primary' : 'text-on-surface-variant'
                      }`}
                      style={{ fontSize: `${16 + index * 4}px` }}
                    >
                      local_cafe
                    </span>
                    <span className={`text-[11px] sm:text-xs font-bold ${
                      isSelected ? 'text-on-surface' : 'text-on-surface-variant'
                    }`}>
                      {label ?? size}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>
        </div>

        {/* Add to Cart Full-Width Button (Docked Bottom on Mobile) */}
        <div className="p-3 sm:p-4 border-t border-outline-variant/30 bg-surface-container-low shrink-0">
          <button
            type="button"
            onClick={item.isAvailable === false ? undefined : handleAdd}
            disabled={item.isAvailable === false}
            className={`w-full py-3 sm:py-3.5 rounded-2xl text-xs sm:text-sm font-bold tracking-wide shadow-md transition-all flex items-center justify-center gap-2 ${
              item.isAvailable === false
                ? 'bg-slate-800 text-slate-400 border border-slate-700 cursor-not-allowed opacity-90'
                : addedAnimation
                ? 'scale-95 bg-emerald-700 text-white cursor-pointer active:scale-[0.98]'
                : 'bg-primary hover:brightness-90 text-white cursor-pointer active:scale-[0.98]'
            }`}
          >
            <span className="material-symbols-outlined text-[18px]">
              {item.isAvailable === false ? 'block' : addedAnimation ? 'check' : 'shopping_bag'}
            </span>
            <span className="truncate">
              {item.isAvailable === false
                ? 'Currently Sold Out (Out of Stock)'
                : addedAnimation
                ? 'Added to Cart ✓'
                : `Add to Cart - ₹${totalPrice}`}
            </span>
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
};
