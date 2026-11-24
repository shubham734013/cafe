import React, { lazy, Suspense, useEffect, useMemo, useRef, useState } from 'react';
import {
  CartItem,
  CafeOrder,
  CustomerReview,
  MenuCategory,
  MenuItem,
} from '../types/cafe';
import { CafeImage } from './CafeImage';
import { CustomerFooter } from './CustomerFooter';
import type { CustomerFeedbackInput } from '../shared/schemas';
import { filterMenuItems } from '../utils/cafeLogic';
import { AnimatedMarqueeHero } from '@/components/ui/hero-3';
import { CAFE_GALLERY_PHOTOS } from '../data/cafePhotos';

const CustomerReviewsSection = lazy(() =>
  import('./CustomerReviewsSection').then((module) => ({ default: module.CustomerReviewsSection }))
);
const FoodDetailsModal = lazy(() =>
  import('./FoodDetailsModal').then((module) => ({ default: module.FoodDetailsModal }))
);

interface CustomerHomeScreenProps {
  cartCount: number;
  cart: CartItem[];
  orders?: CafeOrder[];
  customerReviews?: CustomerReview[];
  menuItems: MenuItem[];
  firstOrderEligible: boolean;
  showFirstOrderOffer: boolean;
  onNavigateMenu: (category?: MenuCategory) => void;
  onNavigateCart: () => void;
  onNavigateRewards: () => void;
  onAddToCart: (item: MenuItem, quantity?: number, size?: string) => void;
  onUpdateQty: (menuItemId: string, delta: number) => void;
  onSubmitFeedback: (feedback: CustomerFeedbackInput) => Promise<void>;
  onNotify: (msg: string) => void;
}

const CATEGORY_EMOJIS: Record<string, string> = {
  burgers: '🍔',
  burger: '🍔',
  pizza: '🍕',
  maggi: '🍜',
  sandwiches: '🥪',
  'special bread pizza': '🍕',
  'fries & momos': '🥟',
  'cold coffee': '🧋',
  shakes: '🥤',
  'hot beverages': '☕',
  combos: '🍱',
  beverages: '🧋',
  snacks: '🍟',
  meals: '🍽️',
  desserts: '🍰',
};
const CATEGORY_ORDER = [
  'Burgers',
  'Pizza',
  'Maggi',
  'Sandwiches',
  'Special Bread Pizza',
  'Fries & Momos',
  'Cold Coffee',
  'Shakes',
  'Hot Beverages',
  'Combos',
];
const PROMO_CARDS: {
  badge: string;
  title: string;
  subtitle: string;
  image: string;
  imageAlt: string;
  category: MenuCategory;
  icon: string;
}[] = [
  {
    badge: 'Buy 5 Get 1 Free',
    title: 'Cold Coffee Bonanza',
    subtitle: 'Buy 5 Medium Cold Coffees, Get 1 Small (₹30) Free!',
    image: 'https://images.unsplash.com/photo-1517701604599-bb29b565090c?w=600&auto=format&fit=crop&q=80',
    imageAlt: 'Frothy Cold Coffee with ice',
    category: 'Cold Coffee',
    icon: 'local_cafe',
  },
  {
    badge: 'Party Special',
    title: 'Birthday Celebration – ₹800',
    subtitle: 'Order ₹800+ & enjoy 1.5 Hours reserved seating for party!',
    image: 'https://images.unsplash.com/photo-1513104890138-7c749659a591?w=600&auto=format&fit=crop&q=80',
    imageAlt: 'Fresh Sawariya Pizzas & Combos',
    category: 'Combos',
    icon: 'cake',
  },
  {
    badge: 'Free Sweet Treat',
    title: 'Free Ice Cream Offer',
    subtitle: 'Follow @the_sawariya_cafe & drop a Google review to claim!',
    image: 'https://images.unsplash.com/photo-1501443762994-82bd5dace89a?w=600&auto=format&fit=crop&q=80',
    imageAlt: 'Free Cup of Ice Cream',
    category: 'Desserts',
    icon: 'icecream',
  },
  {
    badge: 'Free Delivery',
    title: 'Free Delivery Upto 1 KM',
    subtitle: 'On orders above ₹249 • Fresh & hot in 10–15 mins',
    image: 'https://images.unsplash.com/photo-1594212699903-ec8a3eca50f5?w=600&auto=format&fit=crop&q=80',
    imageAlt: 'TSC Special Burger & Pizzas',
    category: 'Burgers',
    icon: 'two_wheeler',
  },
];

export const CustomerHomeScreen: React.FC<CustomerHomeScreenProps> = ({
  cartCount,
  cart,
  orders = [],
  customerReviews = [],
  menuItems,
  firstOrderEligible,
  showFirstOrderOffer,
  onNavigateMenu,
  onNavigateCart,
  onNavigateRewards: _onNavigateRewards,
  onAddToCart,
  onUpdateQty,
  onSubmitFeedback,
  onNotify,
}) => {
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<MenuCategory | 'All'>('All');
  const [detailItem, setDetailItem] = useState<MenuItem | null>(null);
  const [favorites, setFavorites] = useState<Set<string>>(new Set());
  const [activePromo, setActivePromo] = useState(0);
  const [promoPaused, setPromoPaused] = useState(false);
  const [copiedWifi, setCopiedWifi] = useState(false);
  const promoTouchStartX = useRef<number | null>(null);
  const reviewsAnchorRef = useRef<HTMLDivElement | null>(null);
  const [shouldRenderReviews, setShouldRenderReviews] = useState(false);

  const handleCopyWifi = () => {
    if (typeof navigator !== 'undefined' && navigator.clipboard) {
      navigator.clipboard
        .writeText('Sawariya@1177')
        .then(() => {
          setCopiedWifi(true);
          onNotify?.('Wi-Fi Password "Sawariya@1177" copied! Network: Airtel_The sawariya cafe');
          window.setTimeout(() => setCopiedWifi(false), 3000);
        })
        .catch(() => {
          onNotify?.('Wi-Fi Password: Sawariya@1177');
        });
    } else {
      onNotify?.('Wi-Fi Password: Sawariya@1177');
    }
  };

  useEffect(() => {
    if (promoPaused || PROMO_CARDS.length < 2) return;
    const timer = window.setInterval(() => {
      setActivePromo((current) => (current + 1) % PROMO_CARDS.length);
    }, 2000);
    return () => window.clearInterval(timer);
  }, [promoPaused]);

  useEffect(() => {
    const anchor = reviewsAnchorRef.current;
    if (!anchor || !('IntersectionObserver' in window)) {
      setShouldRenderReviews(true);
      return;
    }

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (!entry.isIntersecting) return;
        setShouldRenderReviews(true);
        observer.disconnect();
      },
      { rootMargin: '400px 0px' }
    );
    observer.observe(anchor);
    return () => observer.disconnect();
  }, []);

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
    if (!detailItem) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setDetailItem(null);
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [detailItem]);

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

  const getQuantityInCart = (itemId: string): number =>
    cart.find((item) => item.menuItemId === itemId)?.quantity ?? 0;

  const hasSearchQuery = searchQuery.trim().length > 0;

  const popularDishes = useMemo(() => {
    return filterMenuItems(
      menuItems.filter(
        (item) => !item.id.startsWith('test-') && !item.name.toLowerCase().includes('test')
      ),
      selectedCategory,
      searchQuery
    );
  }, [menuItems, searchQuery, selectedCategory]);
  const visibleDishes = hasSearchQuery ? popularDishes : popularDishes.slice(0, 6);

  return (
    <div className="mx-auto flex w-full max-w-[1480px] flex-col pb-28 pt-1 sm:pb-16">
      <div className="grid gap-3 pb-4 sm:gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(20rem,0.82fr)] lg:items-end lg:pb-6">
        <div className="flex items-center gap-3.5 min-w-0">
          <div className="w-14 h-14 sm:w-16 sm:h-16 rounded-full overflow-hidden border-2 border-[#D4AF37]/60 shadow-md shrink-0 bg-black p-0.5">
            <img src="/images/tsc-logo.jpg" alt="The Sawariya Cafe" className="w-full h-full object-cover rounded-full" />
          </div>
          <div className="min-w-0">
            <span className="flex items-center gap-1.5 text-xs font-semibold text-on-surface-variant sm:text-sm">
              <span>Good Food • Good Mood</span>
              <span aria-hidden="true">☕</span>
            </span>
            <h1 className="mt-0.5 font-serif text-[clamp(1.5rem,5vw,2.2rem)] font-extrabold leading-tight tracking-tight text-on-surface lg:text-3xl 2xl:text-[2.6rem]">
              What are you craving today?
            </h1>
          </div>
        </div>

        <div className="relative flex items-center">
          <span className="material-symbols-outlined absolute left-3.5 text-on-surface-variant text-[20px] pointer-events-none">
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
            placeholder="Search for food, drinks, etc."
            aria-label="Search menu items"
            className="w-full pl-10 pr-10 py-3 bg-surface-container-low text-xs sm:text-sm text-on-surface placeholder:text-on-surface-variant rounded-2xl border border-outline-variant focus:outline-none focus:ring-2 focus:ring-primary/20 shadow-xs transition-all"
          />
          {searchQuery ? (
            <button
              type="button"
              onClick={() => setSearchQuery('')}
              className="absolute right-3 text-on-surface-variant hover:text-on-surface transition-colors cursor-pointer"
            >
              <span className="material-symbols-outlined text-[18px]">close</span>
            </button>
          ) : (
            <span className="material-symbols-outlined absolute right-3.5 text-on-surface-variant text-[20px] pointer-events-none">
              tune
            </span>
          )}
        </div>
      </div>

      {!hasSearchQuery && (
        <div className="pb-4 sm:pb-6">
          <div className="-mx-4 sm:mx-0">
            <div className="flex items-center gap-2 overflow-x-auto no-scrollbar scroll-smooth px-4 py-1 sm:gap-3 sm:px-0">
              {[
                { id: 'All', label: 'All', icon: 'apps' },
                { id: 'Drink', label: 'Coffee', icon: 'local_cafe' },
                { id: 'Burger', label: 'Snacks', icon: 'lunch_dining' },
                { id: 'Pizza', label: 'Pizzas', icon: 'local_pizza' },
                { id: 'Pasta', label: 'Meals', icon: 'dinner_dining' },
                { id: 'Dessert', label: 'Desserts', icon: 'cake' },
              ].map((cat) => {
                const isSelected = selectedCategory === cat.id;
                return (
                  <button
                    key={cat.id}
                    type="button"
                    onClick={() => setSelectedCategory(cat.id as MenuCategory | 'All')}
                    className={`inline-flex min-h-11 shrink-0 items-center gap-2 rounded-full px-3.5 py-2.5 text-xs font-bold transition-all cursor-pointer sm:px-4 ${
                      isSelected
                        ? 'bg-primary text-white shadow-xs'
                        : 'bg-surface-container-low text-on-surface border border-outline-variant hover:bg-surface-container-high'
                    }`}
                  >
                    <span className="material-symbols-outlined text-[17px]">
                      {cat.icon}
                    </span>
                    <span>{cat.label}</span>
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {!hasSearchQuery && (
        <section className="pb-6 sm:pb-8">
          <div
            className="relative overflow-hidden"
            role="region"
            aria-label="Featured menu"
            aria-roledescription="carousel"
            onMouseEnter={() => setPromoPaused(true)}
            onMouseLeave={() => setPromoPaused(false)}
            onFocusCapture={() => setPromoPaused(true)}
            onBlurCapture={(event) => {
              if (!event.currentTarget.contains(event.relatedTarget as Node | null)) {
                setPromoPaused(false);
              }
            }}
            onTouchStart={(event) => {
              promoTouchStartX.current = event.changedTouches[0]?.clientX ?? null;
            }}
            onTouchEnd={(event) => {
              const startX = promoTouchStartX.current;
              const endX = event.changedTouches[0]?.clientX;
              promoTouchStartX.current = null;
              if (startX === null || endX === undefined || Math.abs(endX - startX) < 40) return;
              setActivePromo((current) =>
                (current + (endX < startX ? 1 : PROMO_CARDS.length - 1)) % PROMO_CARDS.length
              );
            }}
          >
            <div
              className="customer-promo-track flex"
              style={{ transform: `translateX(-${activePromo * 100}%)` }}
            >
              {PROMO_CARDS.map((promo, index) => {
                const isActive = index === activePromo;
                return (
                  <button
                  key={promo.title}
                  type="button"
                  onClick={() => onNavigateMenu(promo.category)}
                  aria-label={`Browse ${promo.title}`}
                  aria-hidden={!isActive}
                  tabIndex={isActive ? 0 : -1}
                  className="group relative flex h-[230px] w-full shrink-0 basis-full items-center justify-between overflow-hidden rounded-3xl bg-gradient-to-r from-[#2D1D16] to-[#3E271D] p-4 text-left text-white shadow-md transition-transform active:scale-[0.99] sm:h-[280px] sm:p-7 lg:h-[360px] lg:rounded-[2rem] lg:p-10"
                >
                  <div className="relative z-10 max-w-[62%] space-y-1.5 sm:max-w-[48%] lg:space-y-3">
                    <span className="inline-block rounded-full border border-white/20 bg-white/15 px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wider text-[#FFE7C2]">
                      {promo.badge}
                    </span>
                    <h2 className="font-serif text-xl font-black leading-tight tracking-tight text-white sm:text-2xl lg:text-4xl">
                      {promo.title}
                    </h2>
                    <p className="text-xs font-medium text-[#D7C9BF] sm:text-sm lg:text-base">{promo.subtitle}</p>
                    <div className="flex items-center gap-2 pt-2 lg:pt-3">
                      <span className="flex h-8 w-8 items-center justify-center rounded-full bg-surface-container-low text-primary shadow-xs transition-transform group-hover:scale-105 lg:h-10 lg:w-10">
                        <span className="material-symbols-outlined text-[18px]">arrow_forward</span>
                      </span>
                      <span className="text-[10px] font-semibold text-white/75 lg:text-xs">Explore menu</span>
                    </div>
                  </div>

                  <div className="absolute inset-0 z-0 w-full">
                    {isActive ? (
                      <CafeImage
                        src={promo.image}
                        alt={promo.imageAlt}
                        loading="eager"
                        fetchPriority="high"
                        sizes="(min-width: 1024px) 960px, 100vw"
                        className="customer-promo-image h-full w-full object-cover opacity-100 drop-shadow-lg transition-transform duration-300 group-hover:scale-105"
                        fallbackIcon={promo.icon}
                      />
                    ) : null}
                  </div>
                  <div className="pointer-events-none absolute inset-0 z-[1] bg-gradient-to-r from-[#2D1D16]/87 via-[#2D1D16]/52 to-[#3E271D]/27" />
                  <div className="pointer-events-none absolute -bottom-8 -right-8 h-48 w-48 rounded-full bg-[#C67C4E]/20 blur-2xl" />
                  </button>
                );
              })}
            </div>

          </div>
        </section>
      )}

      {!hasSearchQuery && (
        <section className="pb-6">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <span className="material-symbols-outlined text-primary text-[20px]">stars</span>
              <h2 className="text-base sm:text-lg font-bold text-on-surface tracking-tight font-serif">
                Special Offers & Cafe Perks
              </h2>
            </div>
            <span className="text-[11px] font-semibold text-primary bg-primary/10 px-2.5 py-0.5 rounded-full">
              Exclusive
            </span>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
            {/* Offer 1: Birthday Celebration */}
            <div className="p-4 rounded-2xl bg-gradient-to-br from-amber-500/10 via-surface-container-low to-surface-container border border-amber-500/25 shadow-xs flex flex-col justify-between relative overflow-hidden group">
              <div className="space-y-1.5 relative z-10">
                <div className="flex items-center justify-between">
                  <span className="text-[10px] font-black uppercase tracking-wider text-amber-700 bg-amber-500/15 px-2 py-0.5 rounded-md">
                    Party Lounge
                  </span>
                  <span className="material-symbols-outlined text-amber-600 text-[20px]">cake</span>
                </div>
                <h3 className="font-bold text-sm text-on-surface">Birthday Party – ₹800</h3>
                <p className="text-xs text-on-surface-variant leading-relaxed">
                  Order ₹800+ and celebrate your birthday with 1.5 hours of reserved dining time!
                </p>
              </div>
              <div className="mt-3 pt-2 border-t border-outline-variant/30 flex items-center justify-between">
                <span className="text-[11px] font-bold text-amber-800">1.5 Hrs Seating</span>
                <a
                  href="https://wa.me/917300348070?text=Hi%20The%20Sawariya%20Cafe,%20I%20want%20to%20reserve%20for%20a%20Birthday%20Celebration!"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1 text-xs font-bold text-primary hover:underline"
                >
                  Book on WhatsApp <span className="material-symbols-outlined text-[14px]">open_in_new</span>
                </a>
              </div>
            </div>

            {/* Offer 2: Buy 5 Get 1 Free Cold Coffee */}
            <div className="p-4 rounded-2xl bg-gradient-to-br from-primary/10 via-surface-container-low to-surface-container border border-primary/25 shadow-xs flex flex-col justify-between relative overflow-hidden group">
              <div className="space-y-1.5 relative z-10">
                <div className="flex items-center justify-between">
                  <span className="text-[10px] font-black uppercase tracking-wider text-primary bg-primary/15 px-2 py-0.5 rounded-md">
                    Coffee Bonanza
                  </span>
                  <span className="material-symbols-outlined text-primary text-[20px]">local_cafe</span>
                </div>
                <h3 className="font-bold text-sm text-on-surface">Buy 5, Get 1 Free</h3>
                <p className="text-xs text-on-surface-variant leading-relaxed">
                  Purchase 5 medium Cold Coffees and get 1 small Cold Coffee (worth ₹30) 100% free!
                </p>
              </div>
              <div className="mt-3 pt-2 border-t border-outline-variant/30 flex items-center justify-between">
                <span className="text-[11px] font-bold text-primary">Save ₹30</span>
                <button
                  type="button"
                  onClick={() => onNavigateMenu('Cold Coffee')}
                  className="inline-flex items-center gap-1 text-xs font-bold text-primary hover:underline cursor-pointer"
                >
                  Order Coffee <span className="material-symbols-outlined text-[14px]">arrow_forward</span>
                </button>
              </div>
            </div>

            {/* Offer 3: Free Ice Cream on Social Review */}
            <div className="p-4 rounded-2xl bg-gradient-to-br from-rose-500/10 via-surface-container-low to-surface-container border border-rose-500/25 shadow-xs flex flex-col justify-between relative overflow-hidden group">
              <div className="space-y-1.5 relative z-10">
                <div className="flex items-center justify-between">
                  <span className="text-[10px] font-black uppercase tracking-wider text-rose-700 bg-rose-500/15 px-2 py-0.5 rounded-md">
                    Social Treat
                  </span>
                  <span className="material-symbols-outlined text-rose-600 text-[20px]">icecream</span>
                </div>
                <h3 className="font-bold text-sm text-on-surface">Free Cup of Ice Cream</h3>
                <p className="text-xs text-on-surface-variant leading-relaxed">
                  Follow <strong className="text-on-surface">@the_sawariya_cafe</strong> on Instagram & leave a Google review to claim your free cup!
                </p>
              </div>
              <div className="mt-3 pt-2 border-t border-outline-variant/30 flex items-center justify-between">
                <span className="text-[11px] font-bold text-rose-800">1 Free Scoop</span>
                <a
                  href="https://instagram.com/the_sawariya_cafe"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1 text-xs font-bold text-rose-700 hover:underline"
                >
                  Open Instagram <span className="material-symbols-outlined text-[14px]">open_in_new</span>
                </a>
              </div>
            </div>

            {/* Perk 4: High-Speed Free Wi-Fi with 1-click Copy */}
            <div className="p-4 rounded-2xl bg-gradient-to-br from-sky-500/10 via-surface-container-low to-surface-container border border-sky-500/25 shadow-xs flex flex-col justify-between relative overflow-hidden group">
              <div className="space-y-1.5 relative z-10">
                <div className="flex items-center justify-between">
                  <span className="text-[10px] font-black uppercase tracking-wider text-sky-700 bg-sky-500/15 px-2 py-0.5 rounded-md">
                    Free Wi-Fi
                  </span>
                  <span className="material-symbols-outlined text-sky-600 text-[20px]">wifi</span>
                </div>
                <h3 className="font-bold text-sm text-on-surface truncate">Airtel_The sawariya cafe</h3>
                <p className="text-xs text-on-surface-variant">
                  Password: <code className="font-mono font-bold text-on-surface bg-sky-500/10 px-1.5 py-0.5 rounded text-[11px]">Sawariya@1177</code>
                </p>
              </div>
              <div className="mt-3 pt-2 border-t border-outline-variant/30 flex items-center justify-between">
                <span className="text-[11px] font-medium text-sky-800">Unlimited Access</span>
                <button
                  type="button"
                  onClick={handleCopyWifi}
                  className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-sky-600 text-white text-xs font-bold hover:bg-sky-700 active:scale-95 transition-all cursor-pointer shadow-xs"
                >
                  <span className="material-symbols-outlined text-[14px]">
                    {copiedWifi ? 'check' : 'content_copy'}
                  </span>
                  <span>{copiedWifi ? 'Copied!' : 'Copy Wi-Fi'}</span>
                </button>
              </div>
            </div>
          </div>

          {/* Quick Facility Highlights Bar (Prep Time, Delivery, Table, Combos) */}
          <div className="mt-3 grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs">
            <div className="flex items-center gap-2 p-2.5 rounded-xl bg-surface-container-low border border-outline-variant/60">
              <span className="material-symbols-outlined text-primary text-[18px]">timer</span>
              <div className="min-w-0">
                <p className="font-bold text-on-surface text-[11px]">10–15m Prep</p>
                <p className="text-[10px] text-on-surface-variant truncate">15–20m for special</p>
              </div>
            </div>
            <div className="flex items-center gap-2 p-2.5 rounded-xl bg-surface-container-low border border-outline-variant/60">
              <span className="material-symbols-outlined text-emerald-600 text-[18px]">moped</span>
              <div className="min-w-0">
                <p className="font-bold text-on-surface text-[11px]">Free Delivery 1 KM</p>
                <p className="text-[10px] text-on-surface-variant truncate">Min. order ₹249</p>
              </div>
            </div>
            <div className="flex items-center gap-2 p-2.5 rounded-xl bg-surface-container-low border border-outline-variant/60">
              <span className="material-symbols-outlined text-indigo-600 text-[18px]">table_restaurant</span>
              <div className="min-w-0">
                <p className="font-bold text-on-surface text-[11px]">Table Number Service</p>
                <p className="text-[10px] text-on-surface-variant truncate">Direct seat delivery</p>
              </div>
            </div>
            <div className="flex items-center gap-2 p-2.5 rounded-xl bg-surface-container-low border border-outline-variant/60">
              <span className="material-symbols-outlined text-amber-600 text-[18px]">tune</span>
              <div className="min-w-0">
                <p className="font-bold text-on-surface text-[11px]">Customized Combos</p>
                <p className="text-[10px] text-on-surface-variant truncate">WhatsApp 7300348070</p>
              </div>
            </div>
          </div>
        </section>
      )}

      {/* Animated Marquee Showcase for Cafe Photos */}
      {!hasSearchQuery && (
        <section aria-label="Cafe Photos Showcase" className="mb-8 w-full">
          <AnimatedMarqueeHero
            tagline="✦ The Sawariya Cafe Atmosphere & Vibes"
            title={
              <>
                Good Food • Good Mood
                <br />
                <span className="text-transparent bg-clip-text bg-gradient-to-r from-[#D4AF37] via-amber-200 to-[#D4AF37]">
                  Great Moments in Jaipur
                </span>
              </>
            }
            description="Pure vegetarian culinary excellence, freshly brewed coffees, overloaded pizzas, and unforgettable cafe vibes. Explore our atmosphere below!"
            ctaText="Order from Menu"
            images={CAFE_GALLERY_PHOTOS}
            onCtaClick={() => onNavigateMenu('All')}
          />
        </section>
      )}

      {/* Popular Right Now Section (Matches Reference Image Screen 4) */}
      <div className="pb-4">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <h2
              className="text-base sm:text-lg font-bold text-on-surface tracking-tight font-serif"
              aria-live="polite"
            >
              {hasSearchQuery ? `Search Results (${popularDishes.length})` : 'Popular Right Now'}
            </h2>
            {selectedCategory !== 'All' && (
              <span className="px-2 py-0.5 rounded-full bg-primary/10 text-primary text-[10px] font-bold">
                {selectedCategory}
              </span>
            )}
          </div>
          {!hasSearchQuery && (
            <button
              type="button"
              onClick={() => onNavigateMenu(selectedCategory)}
              className="text-xs font-semibold text-on-surface-variant hover:text-primary cursor-pointer"
            >
              See All
            </button>
          )}
        </div>

        <div>
          {popularDishes.length === 0 ? (
            <div className="p-8 text-center bg-surface-container-low rounded-2xl border border-outline-variant text-on-surface-variant text-xs shadow-xs">
              No items match "{searchQuery.trim()}".
            </div>
          ) : (
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 sm:gap-4 lg:grid-cols-3 2xl:grid-cols-4">
              {visibleDishes.map((dish) => {
                const isFav = favorites.has(dish.id);
                const quantityInCart = getQuantityInCart(dish.id);
                return (
                  <div
                    key={`home-dish-${dish.id}`}
                    className="group relative flex min-w-0 flex-row rounded-2xl border border-outline-variant bg-surface-container-low p-2.5 shadow-xs transition-all hover:shadow-md sm:flex-col sm:rounded-3xl sm:p-3 lg:p-4"
                  >
                    <div
                      onClick={() => setDetailItem(dish)}
                      className="relative aspect-square w-20 min-[360px]:w-24 shrink-0 cursor-pointer overflow-hidden rounded-xl bg-surface-container sm:w-full sm:rounded-2xl"
                    >
                      <CafeImage
                        src={dish.imageUrl}
                        alt={dish.name}
                        productId={dish.id}
                        className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                        fallbackIcon="restaurant"
                      />

                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          toggleFavorite(dish.id);
                        }}
                        aria-label="Favorite"
                        className="absolute right-1.5 top-1.5 flex h-7 w-7 items-center justify-center rounded-full bg-surface-container-low/90 text-on-surface shadow-xs backdrop-blur-xs transition-all hover:text-red-500 sm:right-2.5 sm:top-2.5 sm:h-8 sm:w-8"
                      >
                        <span
                          className={`material-symbols-outlined text-[16px] ${
                            isFav ? 'text-red-500 fill-current' : 'text-on-surface-variant'
                          }`}
                          style={{ fontVariationSettings: isFav ? "'FILL' 1" : "'FILL' 0" }}
                        >
                          favorite
                        </span>
                      </button>
                    </div>

                    <div
                      className="flex min-w-0 flex-1 flex-col justify-center pl-2.5 min-[360px]:pl-3 sm:pt-3 sm:pl-0"
                    >
                      <div onClick={() => setDetailItem(dish)} className="min-w-0 flex-1 cursor-pointer">
                        <div className="flex items-center gap-1.5">
                          <span className="flex h-3 w-3 shrink-0 items-center justify-center rounded border border-emerald-600 p-0.5">
                            <span className="block h-1.5 w-1.5 rounded-full bg-emerald-600" />
                          </span>
                          {dish.isBestSeller && (
                            <span className="rounded border border-amber-500/25 bg-amber-500/10 px-1.5 py-0.5 text-[9px] font-bold text-amber-300">
                              Bestseller
                            </span>
                          )}
                        </div>

                        <h3 className="mt-1 line-clamp-2 text-sm font-bold leading-snug tracking-tight text-on-surface sm:line-clamp-1 sm:text-base lg:text-lg">
                          {dish.name}
                        </h3>

                        <p className="mt-0.5 line-clamp-2 text-[11px] leading-tight text-on-surface-variant sm:line-clamp-1 sm:text-xs">
                          {dish.description}
                        </p>
                      </div>

                      <div className="mt-2 flex items-center justify-between gap-2 border-t border-outline-variant/50 pt-2 sm:mt-3">
                        <span className="text-sm font-bold text-on-surface sm:text-base">
                          ₹{dish.price}
                        </span>

                        {quantityInCart === 0 ? (
                          <button
                            type="button"
                            onClick={() => setDetailItem(dish)}
                            className="flex shrink-0 items-center gap-1 whitespace-nowrap rounded-xl bg-primary px-3 py-1.5 text-xs font-bold text-white shadow-xs transition-all hover:brightness-90 active:scale-95 sm:px-4"
                          >
                            <span className="material-symbols-outlined text-[14px]">add</span>
                            <span>Add</span>
                          </button>
                        ) : (
                          <div className="flex shrink-0 items-center gap-1.5 rounded-xl bg-primary px-2 py-1 text-xs font-bold text-white shadow-xs">
                            <button
                              type="button"
                              onClick={() => onUpdateQty(dish.id, -1)}
                              className="flex h-5 w-5 items-center justify-center rounded text-white hover:bg-white/20"
                              aria-label={`Decrease ${dish.name} quantity`}
                            >
                              <span className="material-symbols-outlined text-[13px]">remove</span>
                            </button>
                            <span className="min-w-[12px] text-center tabular-nums">{quantityInCart}</span>
                            <button
                              type="button"
                              onClick={() => onUpdateQty(dish.id, 1)}
                              className="flex h-5 w-5 items-center justify-center rounded text-white hover:bg-white/20"
                              aria-label={`Increase ${dish.name} quantity`}
                            >
                              <span className="material-symbols-outlined text-[13px]">add</span>
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
        </div>
      </div>

      {!hasSearchQuery && (
        <>
          <div ref={reviewsAnchorRef} className="min-h-[240px]">
            {shouldRenderReviews && (
              <Suspense fallback={null}>
                <CustomerReviewsSection
                  orders={orders}
                  customerReviews={customerReviews}
                  menuItems={menuItems}
                  onSelectDish={(dish) => setDetailItem(dish)}
                  onSubmitFeedback={onSubmitFeedback}
                  onNotify={onNotify}
                />
              </Suspense>
            )}
          </div>

          <CustomerFooter />
        </>
      )}

      {/* Food Details Modal */}
      {detailItem && (
        <Suspense fallback={null}>
          <FoodDetailsModal
            item={detailItem}
            isOpen
            onClose={() => setDetailItem(null)}
            onAddToCart={(item, opts) => {
              onAddToCart(item, opts.quantity, opts.size);
            }}
            isFavorite={favorites.has(detailItem.id)}
            onToggleFavorite={toggleFavorite}
          />
        </Suspense>
      )}
    </div>
  );
};
