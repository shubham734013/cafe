import React, { useEffect, useMemo, useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import {
  CafeOrder,
  CafeTable,
  CustomerReview,
  MenuCategory,
  MenuItem,
  ServiceMode,
} from '../types/cafe';
import { CAFE_ASSETS } from '../data/cafeSeedData';
import { CafeImage } from './CafeImage';
import { CustomerCard, CustomerPage, CustomerText } from './CustomerMotion';
import { CustomerReviewsSection } from './CustomerReviewsSection';
import { FoodDetailsModal } from './FoodDetailsModal';
import type { CustomerFeedbackInput } from '../shared/schemas';
import { filterMenuItems } from '../utils/cafeLogic';

// Magic UI, Aceternity UI, React Bits & 21st.dev Design System Components
import { BlurFade } from '@/components/ui/blur-fade';
import { WordRotate } from '@/components/ui/word-rotate';
import { ShinyText } from '@/components/ui/shiny-text';
import { NumberTicker } from '@/components/ui/number-ticker';
import { Marquee } from '@/components/ui/marquee';
import { CardSpotlight } from '@/components/ui/card-spotlight';
import { ShineBorder } from '@/components/ui/shine-border';
import { ShimmerButton } from '@/components/ui/shimmer-button';
import { HoverBorderGradient } from '@/components/ui/hover-border-gradient';

export interface TableReservationInput {
  guestName: string;
  guestPhone?: string;
  partySize: number;
  timeSlot: string;
}

interface CustomerHomeScreenProps {
  serviceMode: ServiceMode;
  selectedTable: string;
  tables: CafeTable[];
  cartCount: number;
  orders?: CafeOrder[];
  customerReviews?: CustomerReview[];
  menuItems: MenuItem[];
  firstOrderEligible: boolean;
  onSelectServiceAndTable: (mode: ServiceMode, table: string) => void;
  onNavigateMenu: (category?: MenuCategory) => void;
  onNavigateCart: () => void;
  onNavigateRewards: () => void;
  onNavigateAdmin?: () => void;
  onAddToCart: (item: MenuItem, quantity?: number) => void;
  onSubmitFeedback: (feedback: CustomerFeedbackInput) => Promise<void>;
  onReserveTable?: (input: TableReservationInput) => Promise<CafeTable | void>;
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
  serviceMode,
  selectedTable,
  tables,
  cartCount,
  orders = [],
  customerReviews = [],
  menuItems,
  firstOrderEligible,
  onSelectServiceAndTable,
  onNavigateMenu,
  onNavigateCart,
  onNavigateRewards: _onNavigateRewards,
  onNavigateAdmin,
  onAddToCart,
  onSubmitFeedback,
  onReserveTable,
  onNotify,
}) => {
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<MenuCategory | 'All'>('All');
  const [detailItem, setDetailItem] = useState<MenuItem | null>(null);
  const [favorites, setFavorites] = useState<Set<string>>(new Set());
  const [tableModalOpen, setTableModalOpen] = useState(false);
  const [bookingModalOpen, setBookingModalOpen] = useState(false);
  const [bookingGuests, setBookingGuests] = useState('2 Guests');
  const [bookingTime, setBookingTime] = useState('7:30 PM');
  const [bookingName, setBookingName] = useState('');
  const [bookingPhone, setBookingPhone] = useState('');
  const [bookingError, setBookingError] = useState<string | null>(null);
  const [bookingSubmitting, setBookingSubmitting] = useState(false);

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
    if (!tableModalOpen && !bookingModalOpen && !detailItem) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setTableModalOpen(false);
        setDetailItem(null);
        if (!bookingSubmitting) setBookingModalOpen(false);
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [bookingModalOpen, bookingSubmitting, detailItem, tableModalOpen]);

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

  const handleBookingSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!bookingName.trim()) {
      setBookingError('Please enter your name.');
      return;
    }
    setBookingSubmitting(true);
    setBookingError(null);
    try {
      const partySizeNum = parseInt(bookingGuests, 10) || 2;
      await onReserveTable?.({
        guestName: bookingName.trim(),
        guestPhone: bookingPhone.trim() || undefined,
        partySize: partySizeNum,
        timeSlot: bookingTime,
      });
      onNotify(`Table reserved for ${bookingName.trim()} (${bookingGuests}) at ${bookingTime}`);
      setBookingModalOpen(false);
      setBookingName('');
      setBookingPhone('');
    } catch (err) {
      setBookingError(err instanceof Error ? err.message : 'Failed to book table. Please try again.');
    } finally {
      setBookingSubmitting(false);
    }
  };

  const hasSearchQuery = searchQuery.trim().length > 0;

  const popularDishes = useMemo(() => {
    return filterMenuItems(
      menuItems.filter((item) => !item.id.startsWith('test-')),
      selectedCategory,
      searchQuery
    );
  }, [menuItems, searchQuery, selectedCategory]);
  const visibleDishes = hasSearchQuery ? popularDishes : popularDishes.slice(0, 6);

  const modeLabel =
    serviceMode === 'dine-in'
      ? `Table ${selectedTable.replace('T', '')}`
      : serviceMode === 'takeaway'
        ? 'Takeaway'
        : 'Delivery';

  return (
    <CustomerPage className="flex flex-col w-full pb-32 pt-1 relative">
      {/* 1. TOP HEADER BAR WITH ACETERNITY HOVER BORDER GRADIENT & SHADCN BADGES */}
      <BlurFade delay={0.02} yOffset={-8} className="flex items-center justify-between gap-2 pb-3">
        {/* Left Hamburger / Service Switch Button */}
        <motion.button
          whileHover={{ scale: 1.05 }}
          whileTap={{ scale: 0.95 }}
          type="button"
          onClick={() => setTableModalOpen(true)}
          aria-label="Table and Service Settings"
          className="w-10 h-10 rounded-full bg-surface-container hover:bg-surface-container-high flex items-center justify-center text-on-surface transition-colors cursor-pointer shrink-0 border border-outline-variant/15 shadow-sm"
        >
          <span className="material-symbols-outlined text-[22px]">menu</span>
        </motion.button>

        {/* Center Dine-In / Table Pill with Aceternity HoverBorderGradient */}
        <HoverBorderGradient
          onClick={() => setTableModalOpen(true)}
          as="button"
          containerClassName="rounded-full bg-surface-container shadow-sm hover:scale-105 transition-transform"
          className="py-1 px-3.5 flex items-center gap-1.5 text-xs font-bold text-on-surface"
        >
          <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse shrink-0" />
          <span className="material-symbols-outlined text-[16px] text-[#FF6422]">
            {serviceMode === 'dine-in'
              ? 'table_restaurant'
              : serviceMode === 'takeaway'
                ? 'takeout_dining'
                : 'moped'}
          </span>
          <span className="tracking-tight">{modeLabel}</span>
          <span className="material-symbols-outlined text-[16px] text-on-surface-variant">
            expand_more
          </span>
        </HoverBorderGradient>

        {/* Right Cart Action with Micro-Bounce & Animated NumberTicker */}
        <div className="flex items-center gap-1.5 shrink-0">
          <motion.button
            whileHover={{ scale: 1.08 }}
            whileTap={{ scale: 0.92 }}
            type="button"
            onClick={onNavigateCart}
            aria-label="Cart"
            className="relative w-10 h-10 rounded-full bg-surface-container hover:bg-surface-container-high flex items-center justify-center text-on-surface transition-colors cursor-pointer border border-outline-variant/15 shadow-sm"
          >
            <span className="material-symbols-outlined text-[20px] text-on-surface">
              shopping_bag
            </span>
            {cartCount > 0 && (
              <motion.span
                initial={{ scale: 0 }}
                animate={{ scale: 1 }}
                transition={{ type: 'spring', stiffness: 500, damping: 15 }}
                className="absolute -top-1 -right-1 w-5 h-5 bg-[#FF6422] text-white text-[10px] font-black rounded-full flex items-center justify-center shadow-md tabular-nums"
              >
                <NumberTicker value={cartCount} />
              </motion.span>
            )}
          </motion.button>
        </div>
      </BlurFade>

      {/* 2. GREETING HEADLINE WITH MAGIC UI WORD ROTATE & REACT BITS SHINY TEXT */}
      <BlurFade delay={0.06} className="pt-2 pb-3">
        <div className="flex items-center gap-2">
          <WordRotate
            words={['Delicious', 'Handcrafted', 'Oven Fresh', 'Artisan', 'Aromatic']}
            className="text-[#FF6422] font-black text-2xl sm:text-3xl tracking-tight block leading-tight font-heading"
          />
        </div>
        <h1 className="text-on-surface font-extrabold text-2xl sm:text-3xl tracking-tight mt-0.5 leading-tight flex items-center gap-2">
          <ShinyText text="Food for you" className="font-extrabold text-on-surface tracking-tight" />
        </h1>
        <p className="text-on-surface-variant text-xs sm:text-sm mt-1">
          Discover and savor handcrafted recipes from our kitchen
        </p>
      </BlurFade>

      {/* 3. MAGIC UI CONTINUOUS MARQUEE ANNOUNCEMENT TICKER */}
      <BlurFade delay={0.09} className="pb-4">
        <div className="rounded-full bg-surface-container/50 border border-outline-variant/15 py-1 px-3 overflow-hidden shadow-xs backdrop-blur-md">
          <Marquee pauseOnHover className="[--duration:30s] text-[11px] font-semibold text-on-surface-variant flex items-center gap-6">
            <span className="flex items-center gap-1.5 shrink-0">
              <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
              <span className="text-on-surface font-bold">100% Arabica Beans Freshly Brewed</span>
            </span>
            <span className="text-outline">·</span>
            <span className="flex items-center gap-1.5 shrink-0">
              <span className="text-[#FF6422]">🔥</span>
              <span className="font-bold text-[#FF6422]">20% OFF on First Order (Code: NEW20)</span>
            </span>
            <span className="text-outline">·</span>
            <span className="flex items-center gap-1.5 shrink-0">
              <span className="text-amber-400">★</span>
              <span>Rated 4.9 by 1,200+ Foodies</span>
            </span>
            <span className="text-outline">·</span>
            <span className="flex items-center gap-1.5 shrink-0">
              <span className="text-emerald-400">⚡</span>
              <span>Average Kitchen Time: 12 Mins</span>
            </span>
          </Marquee>
        </div>
      </BlurFade>

      {/* 4. SEARCH INPUT BAR WITH SPECULAR BORDER */}
      <BlurFade delay={0.12} className="pb-5">
        <div className="relative flex items-center group">
          <span className="material-symbols-outlined absolute left-3.5 text-outline text-[20px] pointer-events-none group-focus-within:text-[#FF6422] transition-colors">
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
            placeholder="Search for pizzas, burgers, shakes..."
            aria-label="Search menu items"
            className="w-full pl-10 pr-10 py-3 bg-surface-container/70 dark:bg-slate-900/60 backdrop-blur-xl text-xs sm:text-sm text-on-surface placeholder:text-outline rounded-2xl border border-outline-variant/15 focus:outline-none focus:ring-2 focus:ring-[#FF6422]/50 shadow-inner transition-all"
          />
          {searchQuery ? (
            <button
              type="button"
              onClick={() => setSearchQuery('')}
              className="absolute right-3 text-outline hover:text-on-surface transition-colors cursor-pointer"
            >
              <span className="material-symbols-outlined text-[18px]">close</span>
            </button>
          ) : (
            <span className="material-symbols-outlined absolute right-3.5 text-outline text-[20px] pointer-events-none">
              tune
            </span>
          )}
        </div>
      </BlurFade>

      {/* 5. FIRST ORDER PROMO HERO WITH MAGIC UI SHINE BORDER & 21ST SHIMMER BUTTON */}
      {!hasSearchQuery && firstOrderEligible && (
        <BlurFade delay={0.15} className="pb-6">
          <ShineBorder
            borderRadius={24}
            borderWidth={1.5}
            color={['#FF6422', '#F5A638', '#10B98C']}
            className="p-0 overflow-hidden shadow-xl"
          >
            <div className="relative min-h-[150px] overflow-hidden rounded-3xl border border-[#F6D6B8]/40 bg-[#F5E6D6] dark:bg-slate-900/90 shadow-md sm:min-h-[170px]">
              <CafeImage
                src={CAFE_ASSETS.pizzaBanner}
                alt="Pizza featured in the first-order offer"
                className="absolute inset-y-0 right-0 h-full w-[58%] object-cover object-center"
              />
              <div className="absolute inset-0 bg-gradient-to-r from-[#F5E6D6] dark:from-[#0B0F17] via-[#F5E6D6]/95 dark:via-[#0B0F17]/90 to-transparent" />
              <div className="relative z-10 flex min-h-[150px] w-[72%] flex-col items-start justify-center p-4 sm:min-h-[170px] sm:p-6">
                <span className="px-2.5 py-0.5 rounded-full bg-[#FF6422]/15 text-[#FF6422] text-[10px] font-black uppercase tracking-wider mb-1">
                  Welcome Offer
                </span>
                <h2 className="text-xl sm:text-2xl font-black leading-tight text-[#24180F] dark:text-white">
                  <ShinyText text="Get 20% OFF" className="text-xl sm:text-2xl font-black" />
                </h2>
                <p className="mt-0.5 text-xs font-semibold text-[#5D4635] dark:text-slate-300 sm:text-sm">
                  on your first Seth Sawariya order
                </p>
                <div className="mt-3">
                  <ShimmerButton
                    onClick={() => onNavigateMenu()}
                    className="py-2 px-4 text-xs font-extrabold cursor-pointer"
                  >
                    <span>Order Now</span>
                    <span className="material-symbols-outlined text-[16px] ml-1">arrow_forward</span>
                  </ShimmerButton>
                </div>
              </div>
            </div>
          </ShineBorder>
        </BlurFade>
      )}

      {/* 6. CATEGORIES BAR WITH ANIMATED SPRING PILLS */}
      {!hasSearchQuery && (
        <BlurFade delay={0.18} className="pb-6">
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-base font-extrabold text-on-surface tracking-tight">Categories</h2>
            <button
              type="button"
              onClick={() => onNavigateMenu()}
              className="text-xs font-bold text-[#FF6422] hover:underline cursor-pointer flex items-center gap-0.5"
            >
              <span>View All</span>
              <span className="material-symbols-outlined text-[14px]">arrow_forward</span>
            </button>
          </div>

          <div className="flex items-start gap-3 sm:gap-5 overflow-x-auto no-scrollbar py-1">
            {categoryItems.map((cat, idx) => {
              const isSelected = selectedCategory === cat.id;
              return (
                <motion.div
                  key={cat.id}
                  initial={{ opacity: 0, y: 12 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.1 + idx * 0.03, duration: 0.3 }}
                >
                  <button
                    type="button"
                    onClick={() => {
                      setSelectedCategory(isSelected ? 'All' : cat.id);
                    }}
                    className="flex w-[84px] shrink-0 flex-col items-center gap-1.5 group cursor-pointer"
                  >
                    <div
                      className={`w-16 h-16 rounded-2xl p-1 transition-all flex items-center justify-center relative overflow-hidden ${
                        isSelected
                          ? 'ring-2 ring-[#FF6422] bg-[#FF6422]/15 shadow-md shadow-[#FF6422]/20'
                          : 'bg-surface-container/60 hover:bg-surface-container-high/80 border border-outline-variant/15'
                      }`}
                    >
                      <span
                        aria-hidden="true"
                        className="text-[38px] leading-none transition-transform duration-300 group-hover:scale-115"
                      >
                        {CATEGORY_EMOJIS[cat.name.toLowerCase()] ?? '🍽️'}
                      </span>
                    </div>
                    <span
                      className={`whitespace-nowrap text-xs font-bold tracking-tight transition-colors ${
                        isSelected ? 'text-[#FF6422] font-black' : 'text-on-surface'
                      }`}
                    >
                      {cat.name}
                    </span>
                  </button>
                </motion.div>
              );
            })}
          </div>
        </BlurFade>
      )}

      {/* 7. POPULAR DISHES SECTION WITH ACETERNITY CARD SPOTLIGHT & LIQUID GLASS */}
      <BlurFade delay={0.22} className="pb-4">
        <div className="flex items-center justify-between mb-3.5">
          <div className="flex items-center gap-2">
            <h2
              className="text-base font-extrabold text-on-surface tracking-tight"
              aria-live="polite"
            >
              {hasSearchQuery ? `Search Results (${popularDishes.length})` : 'Popular Dishes'}
            </h2>
            {selectedCategory !== 'All' && (
              <span className="px-2.5 py-0.5 rounded-full bg-[#FF6422]/15 text-[#FF6422] text-[10px] font-black border border-[#FF6422]/30">
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
              className="text-xs font-bold text-[#FF6422] hover:underline cursor-pointer"
            >
              View All
            </button>
          )}
        </div>

        {/* Dish Cards Container */}
        <div>
          {popularDishes.length === 0 ? (
            <div className="p-8 text-center bg-surface-container-low rounded-2xl border border-outline-variant/15 text-on-surface-variant text-xs">
              No items match &quot;{searchQuery.trim()}&quot;.
            </div>
          ) : (
            <>
              {/* MOBILE COMPACT HORIZONTAL DISH CARDS (< 640px) */}
              <div className="sm:hidden space-y-3">
                {visibleDishes.map((dish, idx) => {
                  const isFav = favorites.has(dish.id);
                  return (
                    <BlurFade key={`mobile-home-${dish.id}`} delay={idx * 0.04}>
                      <CardSpotlight
                        radius={260}
                        color="rgba(255, 100, 34, 0.14)"
                        className="liquid-glass-card rounded-2xl p-3.5 shadow-lg transition-all flex items-start justify-between gap-3 relative border border-outline-variant/15"
                      >
                        {/* Left: Info */}
                        <div
                          onClick={() => setDetailItem(dish)}
                          className="flex-1 min-w-0 pr-1 cursor-pointer"
                        >
                          <div className="flex items-center gap-1.5 mb-1">
                            <span className="w-3.5 h-3.5 border border-emerald-500 p-0.5 rounded flex items-center justify-center shrink-0">
                              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 block" />
                            </span>
                            {dish.isBestSeller && (
                              <span className="text-[10px] font-bold text-amber-400 bg-amber-500/15 px-1.5 py-0.2 rounded border border-amber-500/25">
                                Bestseller
                              </span>
                            )}
                          </div>

                          <h3 className="font-sans font-bold text-base text-on-surface tracking-tight leading-snug">
                            {dish.name}
                          </h3>

                          <div className="font-sans font-bold text-base text-primary mt-1">
                            ₹<NumberTicker value={dish.price} />
                          </div>

                          <p className="text-xs text-on-surface-variant line-clamp-2 mt-1 leading-relaxed">
                            {dish.description}
                          </p>
                        </div>

                        {/* Right: Square Photo with Overlapping + Add CTA & Heart */}
                        <div className="relative shrink-0 flex flex-col items-center pb-2.5">
                          <div
                            onClick={() => setDetailItem(dish)}
                            className="w-28 h-24 rounded-2xl overflow-hidden bg-surface-container border border-outline-variant/15 cursor-pointer"
                          >
                            <CafeImage
                              src={dish.imageUrl}
                              alt={dish.name}
                              className="w-full h-full object-cover"
                              fallbackIcon="restaurant"
                            />
                          </div>

                          {/* Heart Favorite Button */}
                          <motion.button
                            whileHover={{ scale: 1.15 }}
                            whileTap={{ scale: 0.85 }}
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              toggleFavorite(dish.id);
                            }}
                            aria-label="Favorite"
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
                          </motion.button>

                          {/* Add Button */}
                          <motion.button
                            whileHover={{ scale: 1.05 }}
                            whileTap={{ scale: 0.95 }}
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              onAddToCart(dish);
                              onNotify(`Added ${dish.name} to cart`);
                            }}
                            className="absolute -bottom-1 left-1/2 -translate-x-1/2 px-3.5 py-1 rounded-xl bg-primary hover:brightness-110 text-on-primary font-bold text-xs flex items-center gap-1 shadow-sm transition-all cursor-pointer whitespace-nowrap"
                          >
                            <span className="material-symbols-outlined text-[14px]">add</span>
                            <span>Add</span>
                          </motion.button>
                        </div>
                      </CardSpotlight>
                    </BlurFade>
                  );
                })}
              </div>

              {/* DESKTOP/TABLET 3-COLUMN GRID (>= 640px) */}
              <div className="hidden sm:grid sm:grid-cols-2 lg:grid-cols-3 gap-5">
                {visibleDishes.map((dish, idx) => {
                  const isFav = favorites.has(dish.id);
                  return (
                    <BlurFade key={`desktop-home-${dish.id}`} delay={idx * 0.05} className="h-full">
                      <motion.div
                        whileHover={{ y: -6, transition: { duration: 0.2 } }}
                        className="h-full"
                      >
                        <CardSpotlight
                          radius={300}
                          color="rgba(255, 100, 34, 0.16)"
                          className="liquid-glass-card rounded-2xl overflow-hidden shadow-lg transition-all duration-300 flex flex-col group h-full border border-outline-variant/15"
                        >
                          {/* Dish Photo */}
                          <div
                            onClick={() => setDetailItem(dish)}
                            className="relative w-full h-44 sm:h-48 overflow-hidden bg-surface-container cursor-pointer"
                          >
                            <CafeImage
                              src={dish.imageUrl}
                              alt={dish.name}
                              className="w-full h-full object-cover group-hover:scale-108 transition-transform duration-500"
                              fallbackIcon="restaurant"
                            />

                            {/* Floating Heart Button */}
                            <motion.button
                              whileHover={{ scale: 1.2 }}
                              whileTap={{ scale: 0.8 }}
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                toggleFavorite(dish.id);
                              }}
                              aria-label="Favorite"
                              className="absolute top-3 right-3 w-8 h-8 rounded-full bg-surface-container-high/90 shadow-md flex items-center justify-center text-on-surface hover:text-red-500 transition-all cursor-pointer"
                            >
                              <span
                                className={`material-symbols-outlined text-[18px] transition-colors ${
                                  isFav ? 'text-red-500 fill-current' : 'text-on-surface'
                                }`}
                                style={{ fontVariationSettings: isFav ? "'FILL' 1" : "'FILL' 0" }}
                              >
                                favorite
                              </span>
                            </motion.button>
                          </div>

                          {/* Middle Info */}
                          <div className="p-4 flex flex-col flex-1 justify-between">
                            <div
                              onClick={() => setDetailItem(dish)}
                              className="cursor-pointer space-y-0.5"
                            >
                              <div className="flex items-center gap-1.5 mb-1">
                                <span className="w-3.5 h-3.5 border border-emerald-500 p-0.5 rounded flex items-center justify-center shrink-0">
                                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 block" />
                                </span>
                                {dish.isBestSeller && (
                                  <span className="text-[10px] font-bold text-amber-400 bg-amber-500/15 px-1.5 py-0.2 rounded border border-amber-500/25">
                                    Bestseller
                                  </span>
                                )}
                              </div>
                              <h3 className="font-sans font-bold text-base sm:text-lg text-on-surface tracking-tight group-hover:text-primary transition-colors">
                                {dish.name}
                              </h3>
                              <p className="text-xs text-on-surface-variant line-clamp-1 leading-relaxed">
                                {dish.description}
                              </p>
                            </div>

                            {/* Bottom Row */}
                            <div className="mt-4 flex items-center justify-between pt-1">
                              <span className="font-sans font-bold text-lg sm:text-xl text-primary">
                                ₹<NumberTicker value={dish.price} />
                              </span>

                              <motion.button
                                whileHover={{ scale: 1.05 }}
                                whileTap={{ scale: 0.95 }}
                                type="button"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  onAddToCart(dish);
                                  onNotify(`Added ${dish.name} to cart`);
                                }}
                                className="px-4 py-1.5 rounded-xl bg-primary hover:brightness-110 text-on-primary font-semibold text-xs sm:text-sm flex items-center gap-1 transition-all cursor-pointer active:scale-95 shadow-md"
                              >
                                <span className="material-symbols-outlined text-[16px]">add</span>
                                <span>Add</span>
                              </motion.button>
                            </div>
                          </div>
                        </CardSpotlight>
                      </motion.div>
                    </BlurFade>
                  );
                })}
              </div>
            </>
          )}
        </div>
      </BlurFade>

      {/* 8. CUSTOMER REVIEWS & FEEDBACK SECTION (WITH MARQUEE & CARD SPOTLIGHT) */}
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

      {/* 9. 21ST.DEV STYLE DYNAMIC FLOATING CART DOCK */}
      <AnimatePresence>
        {cartCount > 0 && (
          <motion.div
            initial={{ y: 60, opacity: 0, scale: 0.94 }}
            animate={{ y: 0, opacity: 1, scale: 1 }}
            exit={{ y: 60, opacity: 0, scale: 0.94 }}
            transition={{ type: 'spring', damping: 22, stiffness: 350 }}
            className="fixed bottom-20 md:bottom-6 left-1/2 -translate-x-1/2 z-40 w-[92%] max-w-md"
          >
            <div className="p-2 sm:p-2.5 rounded-full bg-slate-900/90 dark:bg-slate-950/90 backdrop-blur-2xl border border-white/20 shadow-[0_20px_50px_rgba(0,0,0,0.65)] flex items-center justify-between gap-3 text-white">
              <div className="flex items-center gap-2.5 pl-3">
                <div className="w-8 h-8 rounded-full bg-[#FF6422] flex items-center justify-center font-black text-xs text-white shadow-md">
                  <NumberTicker value={cartCount} />
                </div>
                <div className="flex flex-col">
                  <span className="text-xs font-bold leading-tight">Order in progress</span>
                  <span className="text-[10px] text-zinc-300">Tap to review &amp; pay</span>
                </div>
              </div>

              <ShimmerButton
                onClick={onNavigateCart}
                className="py-2 px-5 text-xs font-extrabold shadow-md cursor-pointer flex items-center gap-1.5"
              >
                <span>View Cart</span>
                <span className="material-symbols-outlined text-[16px]">arrow_forward</span>
              </ShimmerButton>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* 10. TABLE SELECTOR MODAL (LIQUID GLASS CONTAINER) */}
      {tableModalOpen && (
        <div
          role="dialog"
          aria-modal="true"
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-md animate-fade-in"
          onClick={() => setTableModalOpen(false)}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-sm rounded-3xl bg-surface-container dark:bg-slate-900/90 backdrop-blur-2xl border border-outline-variant/20 p-5 shadow-2xl space-y-4 liquid-glass-card"
          >
            <div className="flex items-center justify-between pb-2 border-b border-outline-variant/15">
              <h3 className="text-sm font-bold text-on-surface">Select Order Service Mode</h3>
              <button
                type="button"
                onClick={() => setTableModalOpen(false)}
                className="w-8 h-8 rounded-full bg-surface-container-high flex items-center justify-center text-on-surface cursor-pointer"
              >
                <span className="material-symbols-outlined text-[18px]">close</span>
              </button>
            </div>

            <div className="grid grid-cols-3 gap-2">
              {(['dine-in', 'takeaway', 'delivery'] as const).map((mode) => (
                <button
                  key={mode}
                  type="button"
                  onClick={() => {
                    onSelectServiceAndTable(mode, selectedTable);
                    onNotify(`Switched to ${mode}`);
                  }}
                  className={`py-2 px-1 rounded-xl text-xs font-bold capitalize transition-all cursor-pointer ${
                    serviceMode === mode
                      ? 'bg-[#FF6422] text-white shadow-md'
                      : 'bg-surface-container-high text-on-surface-variant hover:text-on-surface'
                  }`}
                >
                  {mode}
                </button>
              ))}
            </div>

            {serviceMode === 'dine-in' && (
              <div>
                <label className="block text-xs font-bold text-on-surface mb-2">
                  Select Dine-In Table
                </label>
                {tables.length > 0 ? (
                  <div className="grid grid-cols-4 gap-2">
                    {tables.map((t) => {
                      const tableId = t.id;
                      const isSelected = selectedTable === tableId;
                      return (
                        <button
                          key={tableId}
                          type="button"
                          onClick={() => {
                            onSelectServiceAndTable('dine-in', tableId);
                            onNotify(`Table set to ${tableId}`);
                            setTableModalOpen(false);
                          }}
                          className={`py-2 rounded-xl text-xs font-bold transition-all cursor-pointer ${
                            isSelected
                              ? 'bg-[#FF6422] text-white shadow-md'
                              : 'bg-surface-container-high text-on-surface hover:bg-surface-variant'
                          }`}
                        >
                          {tableId}
                        </button>
                      );
                    })}
                  </div>
                ) : (
                  <p className="rounded-xl bg-surface-container-low p-3 text-xs text-on-surface-variant">
                    Dine-in tables are not configured yet.
                  </p>
                )}
              </div>
            )}

            <div className="pt-2 space-y-2">
              <button
                type="button"
                onClick={() => {
                  setTableModalOpen(false);
                  setBookingModalOpen(true);
                }}
                className="w-full py-2.5 rounded-full bg-surface-container-high text-xs font-bold text-on-surface flex items-center justify-center gap-1.5 cursor-pointer hover:bg-surface-variant transition-colors"
              >
                <span className="material-symbols-outlined text-[16px]">calendar_today</span>
                <span>Book a Table in Advance</span>
              </button>

              {onNavigateAdmin && (
                <button
                  type="button"
                  onClick={() => {
                    setTableModalOpen(false);
                    onNavigateAdmin();
                  }}
                  className="w-full py-2.5 rounded-full bg-[#FF6422]/15 hover:bg-[#FF6422]/25 border border-[#FF6422]/25 text-xs font-bold text-[#FF6422] flex items-center justify-center gap-1.5 cursor-pointer transition-colors"
                >
                  <span className="material-symbols-outlined text-[16px]">shield_person</span>
                  <span>Open Admin & Staff Panel</span>
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {/* 11. TABLE RESERVATION MODAL */}
      {bookingModalOpen && (
        <div
          role="dialog"
          aria-modal="true"
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-md animate-fade-in"
          onClick={() => setBookingModalOpen(false)}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-sm rounded-3xl bg-surface-container dark:bg-slate-900/90 backdrop-blur-2xl border border-outline-variant/20 p-5 shadow-2xl space-y-4 liquid-glass-card"
          >
            <div className="flex items-center justify-between pb-2 border-b border-outline-variant/15">
              <h3 className="text-sm font-bold text-on-surface">Book a Table</h3>
              <button
                type="button"
                onClick={() => setBookingModalOpen(false)}
                className="w-8 h-8 rounded-full bg-surface-container-high flex items-center justify-center text-on-surface cursor-pointer"
              >
                <span className="material-symbols-outlined text-[18px]">close</span>
              </button>
            </div>

            {bookingError && (
              <p className="text-xs text-red-400 bg-red-950/40 p-2 rounded-lg">{bookingError}</p>
            )}

            <form onSubmit={handleBookingSubmit} className="space-y-3">
              <div>
                <label className="block text-xs font-semibold text-on-surface mb-1">Your Name</label>
                <input
                  type="text"
                  required
                  value={bookingName}
                  onChange={(e) => setBookingName(e.target.value)}
                  placeholder="e.g. John Doe"
                  className="w-full px-3 py-2 bg-surface text-xs rounded-xl border border-outline-variant/20 text-on-surface focus:outline-none focus:ring-1 focus:ring-[#FF6422]"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-on-surface mb-1">Phone (Optional)</label>
                <input
                  type="tel"
                  value={bookingPhone}
                  onChange={(e) => setBookingPhone(e.target.value)}
                  placeholder="e.g. 9876543210"
                  className="w-full px-3 py-2 bg-surface text-xs rounded-xl border border-outline-variant/20 text-on-surface focus:outline-none focus:ring-1 focus:ring-[#FF6422]"
                />
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block text-xs font-semibold text-on-surface mb-1">Guests</label>
                  <select
                    value={bookingGuests}
                    onChange={(e) => setBookingGuests(e.target.value)}
                    className="w-full px-2 py-2 bg-surface text-xs rounded-xl border border-outline-variant/20 text-on-surface"
                  >
                    <option value="1 Guest">1 Guest</option>
                    <option value="2 Guests">2 Guests</option>
                    <option value="4 Guests">4 Guests</option>
                    <option value="6 Guests">6 Guests</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-semibold text-on-surface mb-1">Time</label>
                  <select
                    value={bookingTime}
                    onChange={(e) => setBookingTime(e.target.value)}
                    className="w-full px-2 py-2 bg-surface text-xs rounded-xl border border-outline-variant/20 text-on-surface"
                  >
                    <option value="1:00 PM">1:00 PM</option>
                    <option value="7:30 PM">7:30 PM</option>
                    <option value="8:30 PM">8:30 PM</option>
                    <option value="9:15 PM">9:15 PM</option>
                  </select>
                </div>
              </div>

              <button
                type="submit"
                disabled={bookingSubmitting}
                className="w-full mt-2 py-3 rounded-full bg-[#FF6422] hover:bg-[#E55518] text-white text-xs font-bold transition-all shadow-md active:scale-95 cursor-pointer"
              >
                {bookingSubmitting ? 'Confirming...' : 'Confirm Reservation'}
              </button>
            </form>
          </div>
        </div>
      )}

      {/* 12. FOOD DETAILS MODAL */}
      <FoodDetailsModal
        item={detailItem}
        isOpen={Boolean(detailItem)}
        onClose={() => setDetailItem(null)}
        onAddToCart={(item, opts) => {
          onAddToCart(item, opts.quantity);
          onNotify(`Added ${opts.quantity}x ${item.name} (${opts.size}) to cart`);
        }}
        isFavorite={detailItem ? favorites.has(detailItem.id) : false}
        onToggleFavorite={toggleFavorite}
      />
    </CustomerPage>
  );
};
