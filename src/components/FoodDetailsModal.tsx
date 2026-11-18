import React, { useState } from 'react';
import { MenuItem } from '../types/cafe';
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
      className="fixed inset-0 z-50 flex items-center justify-center p-0 sm:p-4 bg-black/75 backdrop-blur-md animate-fade-in"
      onClick={onClose}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-md h-full sm:h-auto sm:max-h-[92vh] overflow-y-auto rounded-none sm:rounded-3xl bg-surface-container border border-outline-variant/20 shadow-2xl flex flex-col justify-between"
      >
        {/* Top Bar */}
        <div className="flex items-center justify-between px-5 pt-5 pb-3">
          <button
            type="button"
            onClick={onClose}
            aria-label="Back"
            className="w-10 h-10 rounded-full bg-surface-container-high hover:bg-surface-variant flex items-center justify-center text-on-surface transition-colors cursor-pointer"
          >
            <span className="material-symbols-outlined text-[22px]">arrow_back</span>
          </button>

          <h2 className="text-base font-bold text-on-surface tracking-tight">Food Details</h2>

          <button
            type="button"
            onClick={handleToggleFav}
            aria-label="Add to favorites"
            className="w-10 h-10 rounded-full bg-surface-container-high hover:bg-surface-variant flex items-center justify-center transition-colors cursor-pointer"
          >
            <span
              className={`material-symbols-outlined text-[22px] transition-colors ${
                favorited ? 'text-red-500 icon-filled' : 'text-on-surface-variant'
              }`}
            >
              favorite
            </span>
          </button>
        </div>

        {/* Hero Circular Dish Presentation */}
        <div className="flex flex-col items-center justify-center px-6 py-4">
          <div className="relative w-52 h-52 sm:w-60 sm:h-60 rounded-full p-2 bg-gradient-to-b from-primary/20 via-transparent to-transparent flex items-center justify-center">
            <div className="w-full h-full rounded-full overflow-hidden shadow-[0_16px_36px_rgba(0,0,0,0.45)] ring-4 ring-outline/10">
              <CafeImage
                src={item.imageUrl}
                alt={item.name}
                className="w-full h-full object-cover transition-transform duration-500 hover:scale-105"
                fallbackIcon="restaurant"
              />
            </div>
          </div>
        </div>

        {/* Dish Info & Selectors */}
        <div className="px-6 pb-6 space-y-4">
          <div>
            <div className="flex items-start justify-between gap-2">
              <h1 className="text-xl sm:text-2xl font-black text-on-surface tracking-tight">
                {item.name}
              </h1>
              <span className="text-2xl font-black text-[#FF6422] shrink-0">
                ₹{unitPrice}
              </span>
            </div>

            {/* Rating & Reviews */}
            <div className="flex items-center gap-1.5 mt-1.5">
              <span className="material-symbols-outlined text-amber-400 icon-filled text-[18px]">
                star
              </span>
              <span className="text-xs font-bold text-on-surface">
                {item.rating?.toFixed(1) || '4.8'}
              </span>
              <span className="text-xs text-on-surface-variant">
                ({item.reviewsCount || 124} Reviews)
              </span>
            </div>

            <p className="text-xs sm:text-sm text-on-surface-variant mt-2.5 leading-relaxed">
              {item.description}
            </p>
          </div>

          {/* Size Selector */}
          <div>
            <label className="block text-xs font-bold text-on-surface uppercase tracking-wider mb-2">
              Size
            </label>
            <div className="grid grid-cols-3 gap-2.5">
              {(['Small', 'Medium', 'Large'] as const).map((size) => {
                const isSelected = selectedSize === size;
                return (
                  <button
                    key={size}
                    type="button"
                    onClick={() => setSelectedSize(size)}
                    className={`py-2 px-3 rounded-full text-xs font-bold transition-all cursor-pointer ${
                      isSelected
                        ? 'bg-[#FF6422]/15 text-[#FF6422] border-2 border-[#FF6422] shadow-sm'
                        : 'bg-surface-container-high text-on-surface-variant border border-transparent hover:text-on-surface'
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
            <label className="text-xs font-bold text-on-surface uppercase tracking-wider">
              Quantity
            </label>
            <div className="flex items-center gap-3 bg-surface-container-high px-3 py-1.5 rounded-full border border-outline-variant/20">
              <button
                type="button"
                onClick={() => setQuantity((q) => Math.max(1, q - 1))}
                aria-label="Decrease quantity"
                className="w-7 h-7 rounded-full bg-surface hover:bg-surface-variant flex items-center justify-center text-on-surface font-bold text-sm cursor-pointer transition-colors"
              >
                –
              </button>
              <span className="text-sm font-extrabold text-on-surface min-w-[20px] text-center tabular-nums">
                {quantity}
              </span>
              <button
                type="button"
                onClick={() => setQuantity((q) => q + 1)}
                aria-label="Increase quantity"
                className="w-7 h-7 rounded-full bg-surface hover:bg-surface-variant flex items-center justify-center text-on-surface font-bold text-sm cursor-pointer transition-colors"
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
              className={`w-full py-4 rounded-full bg-[#FF6422] hover:bg-[#E55518] text-white text-sm font-black tracking-wide shadow-[0_8px_24px_rgba(255,100,34,0.35)] transition-all cursor-pointer active:scale-[0.98] flex items-center justify-center gap-2 ${
                addedAnimation ? 'scale-95 bg-emerald-600 shadow-emerald-600/30' : ''
              }`}
            >
              <span className="material-symbols-outlined text-[20px]">
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
