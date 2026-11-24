import React, { useEffect, useState } from 'react';
import { 
  Search, 
  User, 
  ShoppingBag, 
  Heart, 
  ChevronRight, 
  ChevronDown, 
  Star, 
  Check, 
  Sparkles, 
  ShieldCheck, 
  Box, 
  Sprout, 
  Flame, 
  X, 
  Plus, 
  Minus,
  ArrowRight
} from 'lucide-react';
import { toast } from 'sonner';

const AKSHAT_FONT_STYLESHEET_ID = 'akshat-font-stylesheet';
const AKSHAT_FONT_STYLESHEET =
  'https://fonts.googleapis.com/css2?family=Cinzel:wght@400;500;600;700;800;900&family=Cormorant+Garamond:ital,wght@0,400;0,500;0,600;0,700;1,400;1,600&family=Rozha+One&family=Noto+Serif+Devanagari:wght@400;500;600;700;800&family=Tiro+Devanagari+Hindi:ital@0;1&display=swap';

// Symmetrical Traditional Lotus SVG Icon matching Akshat Logo
export function AkshatLotusIcon({ className = "w-9 h-7 text-[#8B2635]" }: { className?: string }) {
  return (
    <svg viewBox="0 0 100 70" fill="currentColor" className={className} xmlns="http://www.w3.org/2000/svg">
      {/* Central petal */}
      <path d="M50 8 C46 22 43 38 50 58 C57 38 54 22 50 8 Z" fill="currentColor" opacity="0.95" />
      {/* Inner left petal */}
      <path d="M50 20 C40 26 31 38 35 56 C41 46 47 36 50 20 Z" fill="currentColor" opacity="0.85" />
      {/* Inner right petal */}
      <path d="M50 20 C60 26 69 38 65 56 C59 46 53 36 50 20 Z" fill="currentColor" opacity="0.85" />
      {/* Outer left petal */}
      <path d="M46 32 C30 38 18 48 20 62 C30 58 40 50 46 32 Z" fill="currentColor" opacity="0.75" />
      {/* Outer right petal */}
      <path d="M54 32 C70 38 82 48 80 62 C70 58 60 50 54 32 Z" fill="currentColor" opacity="0.75" />
      {/* Far outer left flare */}
      <path d="M42 46 C24 50 10 56 12 66 C22 65 34 60 42 46 Z" fill="currentColor" opacity="0.65" />
      {/* Far outer right flare */}
      <path d="M58 46 C76 50 90 56 88 66 C78 65 66 60 58 46 Z" fill="currentColor" opacity="0.65" />
      {/* Base pod / calyx */}
      <path d="M38 62 C44 65 56 65 62 62 C58 67 42 67 38 62 Z" fill="currentColor" />
    </svg>
  );
}

// Ornate Indian Floral Motif Flourish
export function OrnamentalFlourish({ className = "w-28 text-[#A87B4F]" }: { className?: string }) {
  return (
    <div className={`flex items-center justify-center gap-2 ${className}`}>
      <span className="h-[1px] w-10 bg-gradient-to-r from-transparent to-[#C5A880]"></span>
      <svg width="24" height="16" viewBox="0 0 24 16" fill="currentColor" className="text-[#8B2635]">
        <path d="M12 1 C10 5 9 9 12 14 C15 9 14 5 12 1 Z" />
        <path d="M12 6 C8 7 5 10 6 13 C8 11 11 9 12 6 Z" opacity="0.8" />
        <path d="M12 6 C16 7 19 10 18 13 C16 11 13 9 12 6 Z" opacity="0.8" />
        <circle cx="12" cy="15" r="1.2" />
        <circle cx="3" cy="11" r="1" />
        <circle cx="21" cy="11" r="1" />
      </svg>
      <span className="h-[1px] w-10 bg-gradient-to-l from-transparent to-[#C5A880]"></span>
    </div>
  );
}

// Small Lotus separator
export function MiniLotus({ className = "text-[#8B2635] w-5 h-5 inline-block" }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" className={className}>
      <path d="M12 3C10.5 7 10 11 12 18C14 11 13.5 7 12 3Z" />
      <path d="M12 7C9 9 7 12 8 17C10 15 11.5 12 12 7Z" opacity="0.85" />
      <path d="M12 7C15 9 17 12 16 17C14 15 12.5 12 12 7Z" opacity="0.85" />
      <path d="M11 11C7 12 4 15 5 19C7.5 18 10 16 11 11Z" opacity="0.7" />
      <path d="M13 11C17 12 20 15 19 19C16.5 18 14 16 13 11Z" opacity="0.7" />
    </svg>
  );
}

interface ProductItem {
  id: string;
  title: string;
  subtitle: string;
  rating: number;
  reviews: string;
  price: number;
  image: string;
  tag?: string;
  description?: string;
}

const PRODUCTS: ProductItem[] = [
  {
    id: 'prod-1',
    title: 'Kumkum Haldi Chandan Trio',
    subtitle: 'Pure • Traditional • Ritual Grade',
    rating: 4.9,
    reviews: '1.2k+',
    price: 249,
    image: '/akshat/assets/prod_kumkum_trio_2x.jpg',
    description: 'Triple sacred offerings containing pure organic Haldi from Salem, Roli Kumkum from Varanasi, and fragrant white Chandan.'
  },
  {
    id: 'prod-2',
    title: 'Satyanarayan Pooja Kit',
    subtitle: 'Complete kit with pooja samagri & vidhi',
    rating: 4.8,
    reviews: '856+',
    price: 1299,
    image: '/akshat/assets/prod_satyanarayan_2x.jpg',
    description: 'All-inclusive 36-item Vedic Satyanarayan samagri kit complete with illustrated Sanskrit-Hindi Vidhi Katha booklet.'
  },
  {
    id: 'prod-3',
    title: 'Brass Lotus Diya',
    subtitle: 'Handcrafted • Pure Brass • Long Lasting',
    rating: 4.9,
    reviews: '2.4k+',
    price: 599,
    image: '/akshat/assets/prod_lotus_diya_2x.jpg',
    description: 'Heavy gauge pure brass lotus diya cast by hereditary artisans of Moradabad. Sustains 8+ hours of uninterrupted akhand flame.'
  },
  {
    id: 'prod-4',
    title: 'Akshat (Pooja Rice)',
    subtitle: 'Unbroken • Pure • Ritual Use',
    rating: 4.8,
    reviews: '1.6k+',
    price: 149,
    image: '/akshat/assets/prod_akshat_rice_2x.jpg',
    description: '100% whole, unbroken sacred rice grains handpicked for Vedic rituals, yagnas, and consecrations.'
  }
];

const CATEGORIES = [
  {
    id: 'cat-1',
    title: 'Daily Essentials',
    description: 'Dhoop, Agarbatti, Ghee, Chandan & more',
    image: '/akshat/assets/cat_daily_essentials_2x.jpg'
  },
  {
    id: 'cat-2',
    title: 'Complete Pooja Kits',
    description: 'Ready-to-use kits for all major poojas',
    image: '/akshat/assets/cat_pooja_kits_2x.jpg'
  },
  {
    id: 'cat-3',
    title: 'Brass & Copper',
    description: 'Pooja utensils, diyas, kalash & more',
    image: '/akshat/assets/cat_brass_copper_2x.jpg'
  },
  {
    id: 'cat-4',
    title: 'Festival Collections',
    description: 'Special kits for Janmashtami, Diwali, Shivratri & more',
    image: '/akshat/assets/cat_festival_2x.jpg'
  }
];

export function AkshatRitualUI({ onSwitchToCafe }: { onSwitchToCafe?: () => void }) {
  useEffect(() => {
    if (document.getElementById(AKSHAT_FONT_STYLESHEET_ID)) return;
    const stylesheet = document.createElement('link');
    stylesheet.id = AKSHAT_FONT_STYLESHEET_ID;
    stylesheet.rel = 'stylesheet';
    stylesheet.href = AKSHAT_FONT_STYLESHEET;
    document.head.appendChild(stylesheet);
  }, []);

  const [cart, setCart] = useState<{ [id: string]: number }>({
    'prod-1': 1,
    'prod-2': 1,
    'prod-3': 1
  });
  const [wishlist, setWishlist] = useState<Set<string>>(new Set());
  const [isCartOpen, setIsCartOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedProduct, setSelectedProduct] = useState<ProductItem | null>(null);

  const cartItemCount = Object.values(cart).reduce((a, b) => a + b, 0);

  const cartTotal = Object.entries(cart).reduce((total, [id, qty]) => {
    const p = PRODUCTS.find((item) => item.id === id);
    return total + (p ? p.price * qty : 0);
  }, 0);

  const toggleWishlist = (id: string, name: string) => {
    setWishlist((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
        toast.info(`Removed ${name} from your sacred wishlist`);
      } else {
        next.add(id);
        toast.success(`Added ${name} to your wishlist 🪷`);
      }
      return next;
    });
  };

  const addToCart = (product: ProductItem) => {
    setCart((prev) => ({
      ...prev,
      [product.id]: (prev[product.id] || 0) + 1
    }));
    toast.success(`Added ${product.title} to Pooja Cart`, {
      description: `₹${product.price} • Ready for your rituals`
    });
  };

  const updateCartQty = (id: string, delta: number) => {
    setCart((prev) => {
      const current = prev[id] || 0;
      const next = current + delta;
      if (next <= 0) {
        const copy = { ...prev };
        delete copy[id];
        return copy;
      }
      return { ...prev, [id]: next };
    });
  };

  return (
    <div className="min-h-screen bg-[#FAF6F0] text-[#2C241E] font-sans selection:bg-[#73131B] selection:text-[#FAF6F0] relative overflow-x-hidden antialiased">
      
      {/* 1. TOP ANNOUNCEMENT BAR */}
      <div className="bg-[#6E1318] text-[#FAF6F0] text-[11px] sm:text-xs font-medium py-1.5 px-4 tracking-wide relative flex items-center justify-between border-b border-[#872027] shadow-inner">
        {/* Left corner motif */}
        <div className="hidden md:flex items-center gap-1.5 opacity-80">
          <svg width="22" height="14" viewBox="0 0 22 14" fill="none" stroke="#F6D59B" strokeWidth="1">
            <path d="M1 7 C6 2 10 2 11 7 C12 2 16 2 21 7 C16 12 12 12 11 7 C10 12 6 12 1 7 Z" />
            <circle cx="11" cy="7" r="1.5" fill="#F6D59B" />
          </svg>
        </div>

        {/* Center announcements */}
        <div className="mx-auto flex flex-wrap items-center justify-center gap-2 sm:gap-4 md:gap-8 text-center text-[#F9EFE2]">
          <span className="flex items-center gap-1.5 font-normal">
            <span className="text-[#F8DA9A] text-sm">🛕</span>
            <span>Free Shipping on Orders Above ₹999</span>
          </span>
          <span className="text-[#C88A8E] hidden sm:inline">|</span>
          <span className="font-normal">Authentic Pooja Products</span>
          <span className="text-[#C88A8E] hidden sm:inline">|</span>
          <span className="font-normal">Pan India Delivery</span>
        </div>

        {/* Right corner motif */}
        <div className="hidden md:flex items-center gap-1.5 opacity-80">
          <svg width="22" height="14" viewBox="0 0 22 14" fill="none" stroke="#F6D59B" strokeWidth="1">
            <path d="M1 7 C6 2 10 2 11 7 C12 2 16 2 21 7 C16 12 12 12 11 7 C10 12 6 12 1 7 Z" />
            <circle cx="11" cy="7" r="1.5" fill="#F6D59B" />
          </svg>
        </div>
      </div>

      {/* 2. HEADER / NAVBAR */}
      <header className="sticky top-0 z-40 bg-[#FAF6F0]/95 backdrop-blur-md border-b border-[#EBDDCF] transition-all">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-20 sm:h-22 flex items-center justify-between gap-4">
          
          {/* Logo Branding */}
          <div className="flex items-center gap-2.5 sm:gap-3 cursor-pointer group">
            <AkshatLotusIcon className="w-9 h-7 sm:w-10 sm:h-8 text-[#73131B] transition-transform group-hover:scale-105 duration-300" />
            <div className="flex flex-col text-left">
              <span className="font-cinzel text-xl sm:text-2xl font-bold tracking-[0.22em] text-[#63161C] leading-none">
                AKSHAT
              </span>
              <div className="flex items-center justify-center gap-1 text-[11px] sm:text-xs font-hindi text-[#8E5A44] font-medium tracking-[0.2em] mt-0.5">
                <span className="w-2.5 h-[1px] bg-[#CBB5A1]"></span>
                <span>अक्षत</span>
                <span className="w-2.5 h-[1px] bg-[#CBB5A1]"></span>
              </div>
            </div>
          </div>

          {/* Navigation Links */}
          <nav className="hidden lg:flex items-center space-x-7 text-[13.5px] font-medium text-[#46382F]">
            <div className="relative group cursor-pointer flex items-center gap-1 hover:text-[#73131B] transition-colors py-2">
              <span>Shop All</span>
              <ChevronDown className="w-3.5 h-3.5 text-[#88786D] group-hover:text-[#73131B] group-hover:rotate-180 transition-transform duration-200" />
            </div>

            <div className="relative group cursor-pointer flex items-center gap-1 hover:text-[#73131B] transition-colors py-2">
              <span>Pooja Kits</span>
              <ChevronDown className="w-3.5 h-3.5 text-[#88786D] group-hover:text-[#73131B] group-hover:rotate-180 transition-transform duration-200" />
            </div>

            <div className="relative group cursor-pointer flex items-center gap-1 hover:text-[#73131B] transition-colors py-2">
              <span>Festivals</span>
              <ChevronDown className="w-3.5 h-3.5 text-[#88786D] group-hover:text-[#73131B] group-hover:rotate-180 transition-transform duration-200" />
            </div>

            <a href="#our-craft" className="hover:text-[#73131B] transition-colors">
              Our Craft
            </a>

            <a href="#ritual-guides" className="hover:text-[#73131B] transition-colors">
              Ritual Guides
            </a>
          </nav>

          {/* Right Action Icons & Search */}
          <div className="flex items-center gap-3 sm:gap-4">
            
            {/* Search Pill Input */}
            <div className="relative hidden md:block w-56 lg:w-64">
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search for pooja items, kits..."
                className="w-full bg-[#F3EDE3] border border-[#E0D3C2] text-xs rounded-full py-2 pl-8 pr-3 text-[#3A2D24] placeholder-[#8A796B] focus:outline-none focus:ring-1 focus:ring-[#73131B] focus:border-[#73131B] transition-all"
              />
              <Search className="w-3.5 h-3.5 text-[#8A796B] absolute left-3 top-1/2 -translate-y-1/2" />
            </div>

            {/* Mobile search toggle */}
            <button 
              type="button" 
              className="md:hidden p-2 text-[#46382F] hover:text-[#73131B] transition-colors"
              onClick={() => toast.info("Search pooja items: Satyanarayan, Kumkum, Brass Diya...")}
            >
              <Search className="w-5 h-5" />
            </button>

            {/* Profile User Icon */}
            <button
              type="button"
              className="p-1.5 text-[#46382F] hover:text-[#73131B] transition-colors rounded-full hover:bg-[#F2EAE0]"
              title="My Account"
              onClick={() => toast("Namaste! Signed in as Devotee Guest")}
            >
              <User className="w-5 h-5 stroke-[1.7]" />
            </button>

            {/* Cart Icon with badge "3" */}
            <button
              type="button"
              onClick={() => setIsCartOpen(true)}
              className="relative p-1.5 text-[#46382F] hover:text-[#73131B] transition-colors rounded-full hover:bg-[#F2EAE0]"
              title="Sacred Cart"
            >
              <ShoppingBag className="w-5 h-5 stroke-[1.7]" />
              {cartItemCount > 0 && (
                <span className="absolute -top-0.5 -right-0.5 bg-[#73131B] text-[#FAF6F0] font-bold text-[10px] w-4 h-4 rounded-full flex items-center justify-center shadow-sm">
                  {cartItemCount}
                </span>
              )}
            </button>
          </div>
        </div>
      </header>

      {/* 3. HERO SECTION */}
      <section className="relative overflow-hidden bg-gradient-to-b from-[#FAF6F0] to-[#F5ECE0] border-b border-[#EADBCE]">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pt-6 pb-12 sm:pb-16 lg:py-16">
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 lg:gap-6 items-center">
            
            {/* Left Hero Content */}
            <div className="lg:col-span-5 relative z-10 flex flex-col items-start text-left pt-2 lg:pt-0">
              
              {/* Floral Branch Illustration top-left corner */}
              <div className="w-24 h-20 -ml-4 -mt-6 sm:-mt-8 opacity-90 pointer-events-none">
                <img 
                  src="/akshat/assets/hero_floral_left_2x.jpg" 
                  alt="Floral motif" 
                  className="w-full h-full object-contain mix-blend-multiply drop-shadow-sm"
                />
              </div>

              {/* Main Heading */}
              <div className="mt-1">
                <h1 className="font-cormorant font-bold text-[#6E1318] text-4xl sm:text-5xl lg:text-[54px] tracking-tight leading-[1.08]">
                  Rooted in tradition.
                </h1>
                <h1 className="font-cormorant font-bold text-[#234234] text-4xl sm:text-5xl lg:text-[54px] tracking-tight leading-[1.08] mt-1 sm:mt-1.5">
                  Made for your rituals.
                </h1>
              </div>

              {/* Symmetrical Ornamental Flourish */}
              <div className="my-4 sm:my-5">
                <OrnamentalFlourish className="text-[#A07044]" />
              </div>

              {/* Hindi Subtitle */}
              <p className="font-hindi text-[#3C271E] text-lg sm:text-[21px] font-medium tracking-wide">
                हर पूजा में, अपनापन और परंपरा।
              </p>

              {/* Dual CTA Buttons */}
              <div className="mt-7 flex flex-wrap items-center gap-3.5">
                {/* Primary Button */}
                <button
                  type="button"
                  onClick={() => {
                    const el = document.getElementById('everyday-favourites');
                    el?.scrollIntoView({ behavior: 'smooth' });
                  }}
                  className="bg-[#6E1318] hover:bg-[#560E12] text-[#FAF6F0] font-sans font-medium text-sm sm:text-[14.5px] px-6 py-2.5 sm:py-3 rounded-md transition-all duration-200 shadow-md hover:shadow-lg flex items-center gap-2 group cursor-pointer"
                >
                  <span>Explore Pooja Kits</span>
                  <ChevronRight className="w-4 h-4 text-[#F6D59B] transition-transform group-hover:translate-x-1" />
                </button>

                {/* Secondary Button */}
                <button
                  type="button"
                  onClick={() => {
                    const el = document.getElementById('sacred-categories');
                    el?.scrollIntoView({ behavior: 'smooth' });
                  }}
                  className="bg-transparent hover:bg-[#EFE4D6]/70 text-[#543827] border border-[#917157] font-sans font-medium text-sm sm:text-[14.5px] px-6 py-2.5 sm:py-3 rounded-md transition-all duration-200 cursor-pointer"
                >
                  Shop Essentials
                </button>
              </div>

            </div>

            {/* Right Hero Visual (Sandstone Temple Jharokha, Glowing Diya, Akshat Signature Box, Brass Kalash, Marigolds) */}
            <div className="lg:col-span-7 relative flex justify-center lg:justify-end">
              <div className="relative w-full max-w-[620px] rounded-2xl overflow-hidden shadow-2xl border border-[#D9C4AB] group">
                
                {/* Background Hero Scene Image */}
                <img 
                  src="/akshat/assets/hero_scene_clean_2x.jpg" 
                  alt="Vedic Pooja Samagri Sanctuary with glowing Diya and Akshat signature artisan gift box" 
                  className="w-full h-auto object-cover transform transition-transform duration-700 group-hover:scale-[1.015]"
                />

                {/* Subtle soft warm candlelight ambient aura */}
                <div className="absolute inset-0 pointer-events-none bg-gradient-to-t from-black/20 via-transparent to-transparent"></div>
                <div className="absolute top-[32%] left-[48%] -translate-x-1/2 -translate-y-1/2 w-32 h-32 rounded-full bg-amber-400/20 blur-2xl pointer-events-none animate-pulse"></div>
              </div>
            </div>

          </div>
        </div>
      </section>

      {/* 4. TRUST & AUTHENTICITY 4-PILLAR BAR */}
      <section className="bg-[#FAF6F0] border-b border-[#EADBCE] py-5 sm:py-6">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-6 sm:gap-4 divide-y sm:divide-y-0 sm:divide-x divide-[#E5DACB]">
            
            {/* 1. 100% Authentic */}
            <div className="flex items-center gap-3.5 px-2 sm:px-4 pt-3 sm:pt-0">
              <div className="w-10 h-10 rounded-full bg-[#F3EDE3] border border-[#DFCEBA] flex items-center justify-center shrink-0 text-[#8B2635]">
                <AkshatLotusIcon className="w-6 h-5" />
              </div>
              <div className="text-left">
                <h4 className="font-sans font-bold text-xs sm:text-[13px] text-[#34241B] tracking-wide">
                  100% Authentic
                </h4>
                <p className="text-[11px] sm:text-xs text-[#7B6C60] font-normal mt-0.5 leading-tight">
                  Ritual-grade, trusted quality
                </p>
              </div>
            </div>

            {/* 2. Naturally Sourced */}
            <div className="flex items-center gap-3.5 px-2 sm:px-4 pt-3 sm:pt-0">
              <div className="w-10 h-10 rounded-full bg-[#F3EDE3] border border-[#DFCEBA] flex items-center justify-center shrink-0 text-[#8B2635]">
                <Sprout className="w-5 h-5 text-[#8B2635] stroke-[1.7]" />
              </div>
              <div className="text-left">
                <h4 className="font-sans font-bold text-xs sm:text-[13px] text-[#34241B] tracking-wide">
                  Naturally Sourced
                </h4>
                <p className="text-[11px] sm:text-xs text-[#7B6C60] font-normal mt-0.5 leading-tight">
                  Pure and traditional ingredients
                </p>
              </div>
            </div>

            {/* 3. Thoughtful Packaging */}
            <div className="flex items-center gap-3.5 px-2 sm:px-4 pt-3 sm:pt-0">
              <div className="w-10 h-10 rounded-full bg-[#F3EDE3] border border-[#DFCEBA] flex items-center justify-center shrink-0 text-[#8B2635]">
                <Box className="w-5 h-5 text-[#8B2635] stroke-[1.7]" />
              </div>
              <div className="text-left">
                <h4 className="font-sans font-bold text-xs sm:text-[13px] text-[#34241B] tracking-wide">
                  Thoughtful Packaging
                </h4>
                <p className="text-[11px] sm:text-xs text-[#7B6C60] font-normal mt-0.5 leading-tight">
                  Safe, elegant & gift-ready
                </p>
              </div>
            </div>

            {/* 4. Pan India Delivery */}
            <div className="flex items-center gap-3.5 px-2 sm:px-4 pt-3 sm:pt-0">
              <div className="w-10 h-10 rounded-full bg-[#F3EDE3] border border-[#DFCEBA] flex items-center justify-center shrink-0 text-[#8B2635]">
                <ShieldCheck className="w-5 h-5 text-[#8B2635] stroke-[1.7]" />
              </div>
              <div className="text-left">
                <h4 className="font-sans font-bold text-xs sm:text-[13px] text-[#34241B] tracking-wide">
                  Pan India Delivery
                </h4>
                <p className="text-[11px] sm:text-xs text-[#7B6C60] font-normal mt-0.5 leading-tight">
                  To your home, with care
                </p>
              </div>
            </div>

          </div>
        </div>
      </section>

      {/* 5. "MADE FOR EVERY SACRED MOMENT" (CURATED JHAROKHA ARCH CATEGORIES) */}
      <section id="sacred-categories" className="py-12 sm:py-16 px-4 sm:px-6 lg:px-8 max-w-7xl mx-auto">
        
        {/* Section Header */}
        <div className="text-center max-w-2xl mx-auto mb-10 sm:mb-12">
          <div className="flex justify-center mb-2">
            <MiniLotus className="w-6 h-6 text-[#8B2635]" />
          </div>
          <div className="flex items-center justify-center gap-3">
            <span className="w-10 sm:w-16 h-[1px] bg-[#C5A880]"></span>
            <h2 className="font-cormorant font-bold text-[#6E1318] text-2xl sm:text-3xl md:text-[34px] tracking-tight">
              Made for every sacred moment
            </h2>
            <span className="w-10 sm:w-16 h-[1px] bg-[#C5A880]"></span>
          </div>
          <p className="text-xs sm:text-sm text-[#736357] mt-2">
            From daily rituals to life's special celebrations, find everything you need in one place.
          </p>
        </div>

        {/* 4 Category Arch Cards Grid */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5 sm:gap-6">
          {CATEGORIES.map((cat) => (
            <div
              key={cat.id}
              className="bg-[#FDFBF7] rounded-xl border border-[#E8DFD1] p-4 text-center group cursor-pointer transition-all duration-300 hover:shadow-lg hover:border-[#CBB49E] hover:-translate-y-1"
              onClick={() => toast.info(`Viewing all ${cat.title}`)}
            >
              {/* Jharokha Arch Shape for Miniature Painting */}
              <div className="relative mx-auto w-full aspect-[4/3] rounded-t-[100px] rounded-b-md overflow-hidden border-2 border-[#D8C7B0] bg-[#FAF5EC] shadow-sm mb-3">
                <img
                  src={cat.image}
                  alt={cat.title}
                  className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-105"
                />
                {/* Golden inner trim */}
                <div className="absolute inset-0 rounded-t-[98px] rounded-b-md border border-[#F6D59B]/40 pointer-events-none"></div>
              </div>

              {/* Title & Description */}
              <h3 className="font-sans font-bold text-sm sm:text-[15px] text-[#34241B] group-hover:text-[#73131B] transition-colors flex items-center justify-center gap-1">
                <span>{cat.title}</span>
              </h3>
              <div className="flex items-center justify-center gap-1.5 mt-1 text-[#78675B] text-xs">
                <span>{cat.description}</span>
                <ChevronRight className="w-3.5 h-3.5 text-[#8B2635] shrink-0 transition-transform group-hover:translate-x-1" />
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* 6. "EVERYDAY FAVOURITES" (FEATURED PRODUCTS) */}
      <section id="everyday-favourites" className="py-12 sm:py-16 px-4 sm:px-6 lg:px-8 max-w-7xl mx-auto border-t border-[#EADBCE]">
        
        {/* Section Header with View All Link */}
        <div className="flex flex-col sm:flex-row items-center justify-between mb-10 gap-4">
          <div className="text-center sm:text-left">
            <div className="flex items-center justify-center sm:justify-start gap-1 mb-1">
              <MiniLotus className="w-5 h-5 text-[#8B2635]" />
            </div>
            <div className="flex items-center justify-center sm:justify-start gap-3">
              <span className="w-6 sm:w-10 h-[1px] bg-[#C5A880]"></span>
              <h2 className="font-cormorant font-bold text-[#6E1318] text-2xl sm:text-3xl md:text-[32px] tracking-tight">
                Everyday favourites
              </h2>
              <span className="w-6 sm:w-10 h-[1px] bg-[#C5A880]"></span>
            </div>
            <p className="text-xs sm:text-sm text-[#736357] mt-1">
              Our most loved pooja essentials, chosen by thousands of families.
            </p>
          </div>

          <a 
            href="#all-products" 
            onClick={(e) => { e.preventDefault(); toast.info("Opening full Akshat Rituals catalogue (180+ items)"); }}
            className="font-cormorant font-semibold text-sm sm:text-base text-[#6E1318] hover:text-[#4A0D10] flex items-center gap-1 group border-b border-[#6E1318]/40 pb-0.5"
          >
            <span>View All Products</span>
            <ChevronRight className="w-4 h-4 transition-transform group-hover:translate-x-1" />
          </a>
        </div>

        {/* 4 Product Cards Grid */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5 sm:gap-6">
          {PRODUCTS.map((prod) => {
            const isWishlisted = wishlist.has(prod.id);
            return (
              <div
                key={prod.id}
                className="bg-[#FDFBF7] rounded-xl border border-[#E8DFD1] p-3.5 flex flex-col justify-between group transition-all duration-300 hover:shadow-lg hover:border-[#D4C0AA]"
              >
                <div>
                  {/* Product Image Box with Wishlist Button */}
                  <div className="relative aspect-square rounded-lg overflow-hidden bg-[#FAF5EB] border border-[#E4D8C7] mb-3">
                    <img
                      src={prod.image}
                      alt={prod.title}
                      className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-105"
                    />

                    {/* Circular Floating Wishlist Heart */}
                    <button
                      type="button"
                      onClick={() => toggleWishlist(prod.id, prod.title)}
                      className="absolute top-2.5 right-2.5 w-7 h-7 sm:w-8 sm:h-8 rounded-full bg-white/90 backdrop-blur-sm border border-[#E0D2C2] flex items-center justify-center text-[#73131B] shadow-sm hover:scale-110 active:scale-95 transition-all"
                      title="Save to Wishlist"
                    >
                      <Heart 
                        className={`w-4 h-4 ${isWishlisted ? 'fill-[#73131B] text-[#73131B]' : 'text-[#7A6455]'}`} 
                      />
                    </button>
                  </div>

                  {/* Title */}
                  <h3 className="font-sans font-bold text-sm sm:text-[14.5px] text-[#2E2018] group-hover:text-[#73131B] transition-colors line-clamp-1">
                    {prod.title}
                  </h3>

                  {/* Subtitle / Attributes */}
                  <p className="text-[11.5px] text-[#7A6B5F] mt-0.5 line-clamp-1 font-normal">
                    {prod.subtitle}
                  </p>

                  {/* Rating Stars */}
                  <div className="flex items-center gap-1.5 mt-2">
                    <div className="flex text-[#D99A26]">
                      {[...Array(5)].map((_, i) => (
                        <Star key={i} className="w-3 h-3 fill-current" />
                      ))}
                    </div>
                    <span className="text-[11px] font-semibold text-[#48372D]">
                      {prod.rating}
                    </span>
                    <span className="text-[11px] text-[#8C7D73]">
                      ({prod.reviews})
                    </span>
                  </div>
                </div>

                {/* Price and Add Button */}
                <div className="flex items-center justify-between mt-4 pt-2 border-t border-[#EFE5D9]">
                  <span className="font-sans font-bold text-base sm:text-lg text-[#261912]">
                    ₹{prod.price}
                  </span>

                  <button
                    type="button"
                    onClick={() => addToCart(prod)}
                    className="bg-[#6E1318] hover:bg-[#520D11] text-[#FAF6F0] text-xs font-medium px-3.5 py-1.5 rounded-md flex items-center gap-1.5 transition-all shadow-sm hover:shadow active:scale-95 cursor-pointer"
                  >
                    <ShoppingBag className="w-3.5 h-3.5" />
                    <span>Add</span>
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      </section>

      {/* 7. "THE AKSHAT PROMISE" BOTTOM LUXURY BANNER */}
      <section className="mt-8 mb-12 sm:mb-16 max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="relative rounded-2xl overflow-hidden border border-[#D9C4AB] bg-[#FAF5EB] shadow-md">
          
          {/* Top Traditional Rajasthani/Pichwai Border Ribbon */}
          <div className="w-full h-3.5 sm:h-4 overflow-hidden border-b border-[#DFD0BE]">
            <img 
              src="/akshat/assets/ornate_border_strip_2x.jpg" 
              alt="Ornate Border" 
              className="w-full h-full object-cover object-center"
            />
          </div>

          <div className="py-8 sm:py-10 px-4 sm:px-8 lg:px-12 grid grid-cols-1 md:grid-cols-12 gap-6 items-center">
            
            {/* Left Indian Lady with Aarti Diya miniature art */}
            <div className="hidden md:flex md:col-span-3 justify-center items-center">
              <div className="w-36 h-36 lg:w-44 lg:h-44 rounded-xl overflow-hidden border border-[#D5C2AB] shadow-sm bg-[#FAF4E8]">
                <img 
                  src="/akshat/assets/promise_lady_2x.jpg" 
                  alt="Devotion illustration" 
                  className="w-full h-full object-cover"
                />
              </div>
            </div>

            {/* Center Content: The Akshat Promise & 3 Pillars */}
            <div className="md:col-span-6 text-center flex flex-col items-center">
              <h2 className="font-cormorant font-bold text-[#6E1318] text-2xl sm:text-3xl md:text-[34px] tracking-tight">
                The Akshat Promise
              </h2>

              <div className="my-2">
                <MiniLotus className="w-5 h-5 text-[#8B2635]" />
              </div>

              <p className="text-xs sm:text-sm text-[#5B483B] max-w-md mx-auto leading-relaxed font-normal">
                Inspired by India's timeless traditions, we bring to you pure, authentic and thoughtfully crafted pooja essentials that make every ritual more meaningful.
              </p>

              {/* 3 Value Pillars */}
              <div className="mt-6 flex items-center justify-center gap-6 sm:gap-10">
                {/* 1. Tradition */}
                <div className="flex flex-col items-center gap-1.5">
                  <div className="w-8 h-8 rounded-full bg-[#EFE4D6] flex items-center justify-center text-[#8B2635]">
                    <AkshatLotusIcon className="w-5 h-4" />
                  </div>
                  <span className="text-xs font-semibold text-[#3C2A1F] tracking-wide">
                    Tradition
                  </span>
                </div>

                <span className="w-px h-7 bg-[#DAC8B4]"></span>

                {/* 2. Purity */}
                <div className="flex flex-col items-center gap-1.5">
                  <div className="w-8 h-8 rounded-full bg-[#EFE4D6] flex items-center justify-center text-[#8B2635]">
                    <Sprout className="w-4 h-4 stroke-[1.8]" />
                  </div>
                  <span className="text-xs font-semibold text-[#3C2A1F] tracking-wide">
                    Purity
                  </span>
                </div>

                <span className="w-px h-7 bg-[#DAC8B4]"></span>

                {/* 3. Devotion */}
                <div className="flex flex-col items-center gap-1.5">
                  <div className="w-8 h-8 rounded-full bg-[#EFE4D6] flex items-center justify-center text-[#8B2635]">
                    <Heart className="w-4 h-4 stroke-[1.8]" />
                  </div>
                  <span className="text-xs font-semibold text-[#3C2A1F] tracking-wide">
                    Devotion
                  </span>
                </div>
              </div>
            </div>

            {/* Right Royal Peacock miniature art */}
            <div className="hidden md:flex md:col-span-3 justify-center items-center">
              <div className="w-36 h-36 lg:w-44 lg:h-44 rounded-xl overflow-hidden border border-[#D5C2AB] shadow-sm bg-[#FAF4E8]">
                <img 
                  src="/akshat/assets/promise_peacock_2x.jpg" 
                  alt="Peacock illustration" 
                  className="w-full h-full object-cover"
                />
              </div>
            </div>

          </div>

          {/* Bottom Traditional Border Ribbon */}
          <div className="w-full h-3.5 sm:h-4 overflow-hidden border-t border-[#DFD0BE]">
            <img 
              src="/akshat/assets/ornate_border_bottom_2x.jpg" 
              alt="Ornate Border" 
              className="w-full h-full object-cover object-center"
            />
          </div>

        </div>
      </section>

      {/* 8. FOOTER */}
      <footer className="bg-[#211612] text-[#DFD0C5] text-xs py-10 px-4 sm:px-6 lg:px-8 border-t-2 border-[#8B2635]">
        <div className="max-w-7xl mx-auto flex flex-col md:flex-row items-center justify-between gap-6 text-center md:text-left">
          <div className="flex items-center gap-3">
            <AkshatLotusIcon className="w-8 h-6 text-[#E6C291]" />
            <div>
              <span className="font-cinzel tracking-widest font-bold text-base text-[#F4EBE2]">AKSHAT</span>
              <p className="text-[11px] text-[#A69485] font-hindi">हर पूजा में, अपनापन और परंपरा।</p>
            </div>
          </div>
          <div className="text-[11.5px] text-[#A08E80]">
            © {new Date().getFullYear()} AKSHAT Rituals Pvt Ltd. Handcrafted with devotion in India.
          </div>
          {onSwitchToCafe && (
            <button
              type="button"
              onClick={onSwitchToCafe}
              className="text-xs bg-[#3B2922] hover:bg-[#4E372E] text-[#F3E8DF] px-3.5 py-1.5 rounded border border-[#61493E] transition-all"
            >
              Back to Seth Sawariya CafeOS
            </button>
          )}
        </div>
      </footer>

      {/* 9. CART SLIDE-OVER DRAWER */}
      {isCartOpen && (
        <div className="fixed inset-0 z-50 overflow-hidden">
          <div 
            className="absolute inset-0 bg-black/40 backdrop-blur-xs transition-opacity"
            onClick={() => setIsCartOpen(false)}
          />
          <div className="fixed inset-y-0 right-0 max-w-full flex pl-10">
            <div className="w-screen max-w-md bg-[#FAF6F0] text-[#2C241E] shadow-2xl flex flex-col border-l border-[#E5DACB]">
              
              {/* Header */}
              <div className="p-4 sm:p-5 bg-[#6E1318] text-[#FAF6F0] flex items-center justify-between border-b border-[#872027]">
                <div className="flex items-center gap-2">
                  <ShoppingBag className="w-5 h-5 text-[#F6D59B]" />
                  <h3 className="font-cormorant font-bold text-xl tracking-tight">Your Pooja Basket</h3>
                  <span className="bg-[#8A2127] text-xs px-2 py-0.5 rounded-full text-[#F9EFE2]">
                    {cartItemCount} items
                  </span>
                </div>
                <button 
                  type="button" 
                  onClick={() => setIsCartOpen(false)} 
                  className="p-1 rounded-md text-[#F9EFE2] hover:bg-white/10"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              {/* Items List */}
              <div className="flex-1 overflow-y-auto p-4 space-y-3.5 divide-y divide-[#EADDCF]">
                {Object.entries(cart).map(([id, qty]) => {
                  const item = PRODUCTS.find((p) => p.id === id);
                  if (!item) return null;
                  return (
                    <div key={id} className="pt-3.5 first:pt-0 flex gap-3.5 items-center">
                      <img 
                        src={item.image} 
                        alt={item.title} 
                        className="w-16 h-16 rounded-md object-cover border border-[#D9C4AB] shrink-0"
                      />
                      <div className="flex-1 min-w-0">
                        <h4 className="font-sans font-semibold text-xs sm:text-sm text-[#2D1F17] truncate">
                          {item.title}
                        </h4>
                        <p className="text-[11px] text-[#78695E] truncate">{item.subtitle}</p>
                        <div className="font-bold text-sm text-[#6E1318] mt-1">₹{item.price}</div>
                      </div>
                      <div className="flex items-center gap-2 border border-[#D8C7B2] rounded-md bg-[#F4EDE2] px-2 py-1">
                        <button 
                          type="button" 
                          onClick={() => updateCartQty(id, -1)}
                          className="text-[#594639] hover:text-[#73131B]"
                        >
                          <Minus className="w-3 h-3" />
                        </button>
                        <span className="text-xs font-bold w-4 text-center">{qty}</span>
                        <button 
                          type="button" 
                          onClick={() => updateCartQty(id, 1)}
                          className="text-[#594639] hover:text-[#73131B]"
                        >
                          <Plus className="w-3 h-3" />
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* Footer Checkout */}
              <div className="p-4 sm:p-5 bg-[#F4ECE0] border-t border-[#E3D4C2] space-y-3">
                <div className="flex justify-between text-xs text-[#6F5F53]">
                  <span>Subtotal</span>
                  <span>₹{cartTotal}</span>
                </div>
                <div className="flex justify-between text-xs text-[#2A7240] font-medium">
                  <span>Ritual Delivery</span>
                  <span>FREE</span>
                </div>
                <div className="flex justify-between text-base font-bold text-[#2A1D15] pt-2 border-t border-[#E0D0BE]">
                  <span>Total Payable</span>
                  <span className="text-[#6E1318]">₹{cartTotal}</span>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    toast.success("Order Placed Successfully! 🪷", {
                      description: `Thank you for choosing Akshat. Your ritual box will be dispatched with care.`
                    });
                    setIsCartOpen(false);
                  }}
                  className="w-full bg-[#6E1318] hover:bg-[#520D11] text-[#FAF6F0] font-sans font-medium py-3 rounded-md text-sm transition-all shadow-md flex items-center justify-center gap-2"
                >
                  <span>Proceed to Sacred Checkout</span>
                  <ArrowRight className="w-4 h-4 text-[#F6D59B]" />
                </button>
              </div>

            </div>
          </div>
        </div>
      )}

      {/* FLOATING QUICK BRAND SWITCHER PILL */}
      {onSwitchToCafe && (
        <div className="fixed bottom-5 right-5 z-40">
          <button
            type="button"
            onClick={onSwitchToCafe}
            className="bg-[#211612]/90 hover:bg-[#211612] text-[#F5EDE4] text-xs font-medium px-4 py-2 rounded-full shadow-xl border border-[#D9C4AB]/30 flex items-center gap-2 backdrop-blur-md transition-all hover:scale-105"
          >
            <span>☕ Switch to CafeOS</span>
          </button>
        </div>
      )}

    </div>
  );
}
