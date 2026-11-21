import React, { useEffect, useState } from 'react';
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
  const [selectedSize, setSelectedSize] = useState<'Small' | 'Medium' | 'Large'>('Small');
  const [quantity, setQuantity] = useState(1);
  const [favorited, setFavorited] = useState(isFavorite);
  const [addedAnimation, setAddedAnimation] = useState(false);

  useEffect(() => {
    if (!isOpen) return;
    setSelectedSize('Small');
    setQuantity(1);
    setAddedAnimation(false);
  }, [isOpen, item?.id]);

  useEffect(() => {
    setFavorited(isFavorite);
  }, [isFavorite]);

  if (!isOpen || !item) return null;

  // Calculate dynamic price based on size
  const priceMultiplier = selectedSize === 'Small' ? 1 : selectedSize === 'Medium' ? 1.1 : 1.25;
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
        defaultNote:
          selectedSize === 'Small'
            ? 'Regular (250 ml)'
            : selectedSize === 'Medium'
              ? 'Large (350 ml)'
              : 'Extra Large (450 ml)',
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
        className="w-full max-w-md max-h-[92vh] overflow-y-auto rounded-3xl bg-[#FAF7F2] border border-[#EAE2D7] shadow-2xl flex flex-col justify-between"
      >
        {/* Top Floating Controls */}
        <div className="flex items-center justify-between px-4 pt-4 pb-2">
          <button
            type="button"
            onClick={onClose}
            aria-label="Back"
            className="w-9 h-9 rounded-full bg-white border border-[#EAE2D7] flex items-center justify-center text-[#1F1610] shadow-xs hover:bg-[#F5EFE8] transition-colors cursor-pointer"
          >
            <span className="material-symbols-outlined text-[20px]">arrow_back</span>
          </button>

          <button
            type="button"
            onClick={handleToggleFav}
            aria-label="Add to favorites"
            className="w-9 h-9 rounded-full bg-white border border-[#EAE2D7] flex items-center justify-center text-[#1F1610] shadow-xs hover:bg-[#F5EFE8] transition-colors cursor-pointer"
          >
            <span
              className={`material-symbols-outlined text-[20px] transition-colors ${
                favorited ? 'text-red-500 fill-current' : 'text-[#7A7067]'
              }`}
              style={{ fontVariationSettings: favorited ? "'FILL' 1" : "'FILL' 0" }}
            >
              favorite
            </span>
          </button>
        </div>

        {/* Hero Food Photography (Panel 6) */}
        <div className="px-4 py-1">
          <div className="relative w-full h-52 sm:h-60 rounded-2xl overflow-hidden bg-white border border-[#EAE2D7] shadow-xs">
            <CafeImage
              src={item.imageUrl ?? ''}
              alt={item.name}
              className="w-full h-full object-cover transition-transform duration-500 hover:scale-105"
              fallbackIcon="restaurant"
            />
          </div>
        </div>

        {/* Dish Info & Selectors */}
        <div className="p-5 space-y-4">
          <div>
            <h1 className="font-serif font-black text-xl sm:text-2xl text-[#1F1610] tracking-tight">
              {item.name}
            </h1>
            <p className="text-xs text-[#7A7067] mt-1.5 leading-relaxed">
              {item.description}
            </p>
          </div>

          {/* Price & Quantity Row (Panel 6) */}
          <div className="flex items-center justify-between pt-1">
            <span className="font-bold text-2xl text-[#1F1610]">
              ₹{unitPrice}
            </span>

            <div className="flex items-center gap-2 bg-white px-3 py-1 rounded-full border border-[#EAE2D7] shadow-xs">
              <button
                type="button"
                onClick={() => setQuantity((q) => Math.max(1, q - 1))}
                aria-label="Decrease quantity"
                className="w-6 h-6 rounded-full bg-[#FAF7F2] hover:bg-[#EAE2D7] flex items-center justify-center text-[#1F1610] font-bold text-xs cursor-pointer transition-colors"
              >
                –
              </button>
              <span className="text-sm font-bold text-[#1F1610] min-w-[20px] text-center tabular-nums">
                {quantity}
              </span>
              <button
                type="button"
                onClick={() => setQuantity((q) => q + 1)}
                aria-label="Increase quantity"
                className="w-6 h-6 rounded-full bg-[#FAF7F2] hover:bg-[#EAE2D7] flex items-center justify-center text-[#1F1610] font-bold text-xs cursor-pointer transition-colors"
              >
                +
              </button>
            </div>
          </div>

          {/* Size Selector (Panel 6: Regular 250ml, Large 350ml, Extra Large 450ml) */}
          <div>
            <label className="block text-xs font-bold text-[#1F1610] mb-2">
              Size
            </label>
            <div className="grid grid-cols-3 gap-2">
              {[
                { size: 'Small' as const, label: 'Regular', ml: '250 ml', iconSize: 16 },
                { size: 'Medium' as const, label: 'Large', ml: '350 ml', iconSize: 20 },
                { size: 'Large' as const, label: 'Extra Large', ml: '450 ml', iconSize: 24 },
              ].map(({ size, label, ml, iconSize }) => {
                const isSelected = selectedSize === size;
                return (
                  <button
                    key={size}
                    type="button"
                    onClick={() => setSelectedSize(size)}
                    className={`py-3 px-2 rounded-2xl flex flex-col items-center gap-1.5 transition-all cursor-pointer active:scale-95 ${
                      isSelected
                        ? 'bg-[#F8EFE6] border-2 border-[#382319] shadow-xs'
                        : 'bg-white border border-[#EAE2D7] hover:bg-[#FAF7F2]'
                    }`}
                  >
                    <span
                      className={`material-symbols-outlined ${
                        isSelected ? 'text-[#382319]' : 'text-[#8C7E74]'
                      }`}
                      style={{ fontSize: `${iconSize}px` }}
                    >
                      local_cafe
                    </span>
                    <span className={`text-xs font-bold ${
                      isSelected ? 'text-[#1F1610]' : 'text-[#7A7067]'
                    }`}>
                      {label}
                    </span>
                    <span className="text-[10px] text-[#8C7E74]">
                      {ml}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Add to Cart Full-Width Button (Panel 6) */}
          <div className="pt-2">
            <button
              type="button"
              onClick={handleAdd}
              className={`w-full py-3.5 rounded-2xl bg-[#382319] hover:bg-[#2B1B13] text-white text-sm font-bold tracking-wide shadow-md transition-all cursor-pointer active:scale-[0.98] flex items-center justify-center gap-2 ${
                addedAnimation ? 'scale-95 bg-emerald-700' : ''
              }`}
            >
              <span className="material-symbols-outlined text-[18px]">
                {addedAnimation ? 'check' : 'shopping_bag'}
              </span>
              <span>
                {addedAnimation ? 'Added to Cart ✓' : `Add to Cart - ₹${totalPrice}`}
              </span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
