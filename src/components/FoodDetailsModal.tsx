import React, { useState } from 'react';
import type { MenuItem } from '../types/cafe';
import { CafeImage } from './CafeImage';

interface FoodDetailsModalProps {
  item: MenuItem | null;
  isOpen: boolean;
  onClose: () => void;
  onAddToCart: (item: MenuItem, options: { size: 'Small' | 'Medium' | 'Large'; quantity: number }) => void;
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
  const [selectedSize, setSelectedSize] = useState<'Small' | 'Medium' | 'Large'>('Medium');
  const [quantity, setQuantity] = useState(1);
  const [favorited, setFavorited] = useState(isFavorite);
  const [addedAnimation, setAddedAnimation] = useState(false);

  if (!isOpen || !item) return null;

  // Calculate dynamic price based on size
  const priceMultiplier = selectedSize === 'Small' ? 0.85 : selectedSize === 'Large' ? 1.25 : 1.0;
  const unitPrice = Math.round(item.price * priceMultiplier);
  const totalPrice = unitPrice * quantity;

  const handleToggleFav = (e: React.MouseEvent) => {
    e.stopPropagation();
    const next = !favorited;
    setFavorited(next);
    onToggleFavorite?.(item.id);
  };

  const handleAdd = () => {
    setAddedAnimation(true);
    onAddToCart(
      {
        ...item,
        price: unitPrice,
        defaultNote: `${selectedSize} Size`,
      },
      { size: selectedSize, quantity }
    );
    setTimeout(() => {
      setAddedAnimation(false);
      onClose();
    }, 350);
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-black/60 backdrop-blur-sm animate-fade-in"
      onClick={onClose}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-lg max-h-[92vh] overflow-y-auto rounded-3xl bg-surface-container-low border border-outline-variant/20 shadow-2xl flex flex-col justify-between"
      >
        {/* Top Header */}
        <div className="flex items-center justify-between px-5 pt-4 pb-3 border-b border-outline-variant/15 bg-surface-container">
          <button
            type="button"
            onClick={onClose}
            aria-label="Back"
            className="w-9 h-9 rounded-full bg-surface-container-high hover:bg-surface-bright border border-outline-variant/15 flex items-center justify-center text-on-surface transition-colors cursor-pointer"
          >
            <span className="material-symbols-outlined text-[20px]">arrow_back</span>
          </button>

          <h2 className="font-sans font-bold text-base text-on-surface tracking-tight">
            Dish Details
          </h2>

          <button
            type="button"
            onClick={handleToggleFav}
            aria-label="Add to favorites"
            className="w-9 h-9 rounded-full bg-surface-container-high hover:bg-surface-bright border border-outline-variant/15 flex items-center justify-center transition-colors cursor-pointer"
          >
            <span
              className={`material-symbols-outlined text-[20px] transition-colors ${
                favorited ? 'text-red-500 fill-current' : 'text-on-surface'
              }`}
              style={{ fontVariationSettings: favorited ? "'FILL' 1" : "'FILL' 0" }}
            >
              favorite
            </span>
          </button>
        </div>

        {/* Hero Food Photography (matches dish card aesthetic) */}
        <div className="relative w-full h-56 sm:h-64 overflow-hidden bg-surface-container">
          <CafeImage
            src={item.imageUrl ?? ''}
            alt={item.name}
            className="w-full h-full object-cover transition-transform duration-500 hover:scale-105"
            fallbackIcon="restaurant"
          />

          {/* Floating Heart Icon Button */}
          <button
            type="button"
            onClick={handleToggleFav}
            aria-label="Favorite"
            className="absolute top-3 right-3 w-8 h-8 rounded-full bg-surface-container-high/90 shadow-md flex items-center justify-center text-on-surface hover:text-red-500 hover:scale-110 transition-all cursor-pointer"
          >
            <span
              className={`material-symbols-outlined text-[18px] transition-colors ${
                favorited ? 'text-red-500 fill-current' : 'text-on-surface'
              }`}
              style={{ fontVariationSettings: favorited ? "'FILL' 1" : "'FILL' 0" }}
            >
              favorite
            </span>
          </button>

          {item.category && (
            <span className="absolute bottom-3 left-3 px-3 py-1 rounded-full text-[11px] font-bold bg-surface-container-high/90 backdrop-blur-xs text-primary border border-outline-variant/20 shadow-xs">
              {item.category}
            </span>
          )}
        </div>

        {/* Dish Info & Selectors */}
        <div className="p-5 sm:p-6 space-y-5 bg-surface-container-low">
          <div>
            <div className="flex items-baseline justify-between gap-3">
              <h1 className="font-sans font-black text-xl sm:text-2xl text-on-surface tracking-tight">
                {item.name}
              </h1>
              <span className="font-sans font-black text-2xl text-primary shrink-0">
                ₹{unitPrice}
              </span>
            </div>

            <p className="text-xs sm:text-sm text-on-surface-variant mt-1.5 leading-relaxed">
              {item.description}
            </p>
          </div>

          {/* Size Selector */}
          <div>
            <label className="block text-xs font-bold text-on-surface-variant uppercase tracking-wider mb-2">
              Select Portion / Size
            </label>
            <div className="grid grid-cols-3 gap-2.5">
              {(['Small', 'Medium', 'Large'] as const).map((size) => {
                const isSelected = selectedSize === size;
                return (
                  <button
                    key={size}
                    type="button"
                    onClick={() => setSelectedSize(size)}
                    className={`py-2 px-3 rounded-xl text-xs font-bold transition-all cursor-pointer active:scale-95 ${
                      isSelected
                        ? 'bg-primary text-on-primary border border-primary shadow-xs'
                        : 'bg-surface-container border border-outline-variant/15 text-on-surface hover:bg-surface-container-high'
                    }`}
                  >
                    {size}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Quantity Selector */}
          <div className="flex items-center justify-between pt-1">
            <label className="text-xs font-bold text-on-surface-variant uppercase tracking-wider">
              Quantity
            </label>
            <div className="flex items-center gap-3 bg-surface-container px-3 py-1.5 rounded-full border border-outline-variant/20">
              <button
                type="button"
                onClick={() => setQuantity((q) => Math.max(1, q - 1))}
                aria-label="Decrease quantity"
                className="w-7 h-7 rounded-full bg-surface-container-high hover:bg-surface-bright border border-outline-variant/15 flex items-center justify-center text-on-surface font-bold text-sm cursor-pointer transition-colors active:scale-90"
              >
                –
              </button>
              <span className="text-sm font-black text-on-surface min-w-[20px] text-center tabular-nums">
                {quantity}
              </span>
              <button
                type="button"
                onClick={() => setQuantity((q) => q + 1)}
                aria-label="Increase quantity"
                className="w-7 h-7 rounded-full bg-surface-container-high hover:bg-surface-bright border border-outline-variant/15 flex items-center justify-center text-on-surface font-bold text-sm cursor-pointer transition-colors active:scale-90"
              >
                +
              </button>
            </div>
          </div>

          {/* Add to Cart Button */}
          <div className="pt-2">
            <button
              type="button"
              onClick={handleAdd}
              className={`w-full py-3.5 rounded-2xl bg-primary hover:brightness-110 text-on-primary text-sm font-black tracking-wide shadow-md transition-all cursor-pointer active:scale-[0.98] flex items-center justify-center gap-2 ${
                addedAnimation ? 'scale-95 bg-emerald-600' : ''
              }`}
            >
              <span className="material-symbols-outlined text-[18px]">
                {addedAnimation ? 'check' : 'shopping_bag'}
              </span>
              <span>{addedAnimation ? 'Added to Cart ✓' : `Add to Cart • ₹${totalPrice}`}</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
