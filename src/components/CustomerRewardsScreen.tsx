import React, { useState, useMemo } from 'react';
import { motion, AnimatePresence, MotionConfig } from 'motion/react';
import {
  Sparkles,
  Gift,
  Tag,
  Check,
  Copy,
  Clock,
  ArrowRight,
  Coffee,
  Coins,
  ShieldCheck,
  ShoppingBag,
  Info,
  BadgePercent,
  Flame,
  ArrowUpRight,
  Award,
  Zap,
  ChevronRight,
  Star,
  Percent,
} from 'lucide-react';
import type { PromoCampaign } from '../types/cafe';
import { BlurFade } from '@/components/ui/blur-fade';
import { NumberTicker } from '@/components/ui/number-ticker';
import { ShinyText } from '@/components/ui/shiny-text';
import { CardSpotlight } from '@/components/ui/card-spotlight';
import { ShimmerButton } from '@/components/ui/shimmer-button';
import { ShineBorder } from '@/components/ui/shine-border';

interface CustomerRewardsScreenProps {
  points: number;
  campaigns: PromoCampaign[];
  hasMatchedCustomerProfile: boolean;
  onRedeemCoupon: (code: string) => void;
  onNavigateProfile?: () => void;
  onBrowseMenu?: () => void;
  onNavigateCart?: () => void;
}

type OfferFilter = 'all' | 'beverage' | 'food' | 'exclusive';

const PERK_RULES = [
  {
    icon: Sparkles,
    badge: 'EARN',
    badgeClass: 'text-emerald-400 bg-emerald-500/10 border-emerald-500/25',
    spotlight: 'rgba(52, 211, 153, 0.12)',
    title: '+25 Beans',
    subtitle: 'Per Verified Review',
    desc: 'Rate any served order from tracking to immediately credit your wallet.',
  },
  {
    icon: Coins,
    badge: 'REDEEM',
    badgeClass: 'text-amber-400 bg-amber-500/10 border-amber-500/25',
    spotlight: 'rgba(251, 191, 36, 0.12)',
    title: '2 Beans = ₹1',
    subtitle: 'Instant Cash Credit',
    desc: 'Redeem stored balance for up to 50% off your active order total.',
  },
  {
    icon: Zap,
    badge: 'STACK',
    badgeClass: 'text-orange-400 bg-orange-500/10 border-orange-500/25',
    spotlight: 'rgba(255, 100, 34, 0.12)',
    title: 'Double Savings',
    subtitle: 'Coupons + Beans',
    desc: 'Apply promotional campaign codes alongside Beans at checkout.',
  },
];

export const CustomerRewardsScreen: React.FC<CustomerRewardsScreenProps> = ({
  points,
  campaigns,
  hasMatchedCustomerProfile,
  onRedeemCoupon,
  onNavigateProfile,
  onBrowseMenu,
  onNavigateCart,
}) => {
  const [copiedCode, setCopiedCode] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<OfferFilter>('all');
  const [expandedFaq, setExpandedFaq] = useState<number | null>(null);

  const activeCampaigns = useMemo(
    () => campaigns.filter((c) => c.status === 'active'),
    [campaigns]
  );

  const availableBeans = Number.isFinite(points) ? Math.max(0, points) : 0;
  const beanValue = Math.floor(availableBeans / 2);

  // Next milestone calculation (e.g. next tier at 200 beans)
  const nextMilestone = 200;
  const progressPercent = Math.min(100, Math.round((availableBeans / nextMilestone) * 100));
  const beansToNext = Math.max(0, nextMilestone - availableBeans);

  const filteredCampaigns = useMemo(() => {
    return activeCampaigns.filter((campaign) => {
      const isPersonalized = Boolean(campaign.targetSegment && campaign.targetSegment !== 'all');
      if (activeTab === 'exclusive') return isPersonalized;
      if (activeTab === 'beverage') {
        const text = `${campaign.title} ${campaign.description}`.toLowerCase();
        return text.includes('coffee') || text.includes('frappe') || text.includes('tea') || text.includes('bogo');
      }
      if (activeTab === 'food') {
        const text = `${campaign.title} ${campaign.description}`.toLowerCase();
        return text.includes('sandwich') || text.includes('snack') || text.includes('food');
      }
      return true;
    });
  }, [activeCampaigns, activeTab]);

  const handleCopy = (code: string) => {
    if (typeof navigator !== 'undefined' && navigator.clipboard) {
      navigator.clipboard.writeText(code).catch(() => {});
    }
    setCopiedCode(code);
    setTimeout(() => {
      setCopiedCode((curr) => (curr === code ? null : curr));
    }, 2500);
  };

  const scrollToOffers = () => {
    const el = document.getElementById('deal-vouchers');
    if (el) {
      el.scrollIntoView({ behavior: 'smooth' });
    }
  };

  return (
    <MotionConfig reducedMotion="user">
      <div className="mx-auto flex w-full max-w-5xl flex-col gap-6 sm:gap-8 px-4 py-4 sm:px-6 sm:py-6 pb-28 text-on-surface">
        {/* Header Bar */}
        <BlurFade delay={0.03} yOffset={6}>
          <header className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-2 border-b border-outline-variant/15">
            <div className="space-y-1.5">
              <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-widest bg-gradient-to-r from-amber-500/15 via-orange-500/10 to-transparent border border-amber-500/25">
                <Sparkles className="w-3.5 h-3.5 text-amber-400 animate-pulse" />
                <ShinyText text="Seth Sawariya Luxury Roastery Club" speed={3.2} className="text-amber-300 font-extrabold" />
              </div>
              <h1 className="text-2xl sm:text-3xl md:text-4xl font-black tracking-tight flex items-center gap-2">
                Beans <span className="text-primary font-serif italic">&amp;</span> Privileges
              </h1>
              <p className="text-xs sm:text-sm text-on-surface-variant max-w-xl leading-relaxed">
                Your artisanal coffee journey rewarded. Convert bean rewards directly to cash discounts and redeem exclusive chef specials.
              </p>
            </div>

            <div className="flex items-center gap-2.5 self-start sm:self-auto shrink-0">
              {onBrowseMenu && (
                <motion.button
                  whileHover={{ scale: 1.03 }}
                  whileTap={{ scale: 0.95 }}
                  type="button"
                  onClick={onBrowseMenu}
                  className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-surface-container-high hover:bg-surface-variant text-xs font-bold text-on-surface border border-outline-variant/20 transition-all cursor-pointer shadow-sm"
                >
                  <Coffee className="w-4 h-4 text-primary" />
                  <span>Menu</span>
                </motion.button>
              )}
              {onNavigateCart && (
                <motion.button
                  whileHover={{ scale: 1.03 }}
                  whileTap={{ scale: 0.95 }}
                  type="button"
                  onClick={onNavigateCart}
                  className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-primary/10 hover:bg-primary/20 text-xs font-bold text-primary border border-primary/25 transition-all cursor-pointer shadow-sm"
                >
                  <ShoppingBag className="w-4 h-4" />
                  <span>Cart</span>
                </motion.button>
              )}
            </div>
          </header>
        </BlurFade>

        {/* Bento Grid: Master Loyalty Dashboard */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 sm:gap-5">
          {/* Bento Tile 1: The Main Obsidian Glass Vault Card (Col 8) */}
          <div className="lg:col-span-8">
            <BlurFade delay={0.06} yOffset={10}>
              <ShineBorder
                borderRadius={28}
                borderWidth={1.5}
                color={['#FF6422', '#F5A638', '#E6A15C']}
                className="p-0 bg-transparent overflow-hidden shadow-2xl shadow-black/50"
              >
                <CardSpotlight
                  radius={360}
                  color="rgba(255, 100, 34, 0.16)"
                  className="relative isolate overflow-hidden rounded-[28px] bg-gradient-to-br from-[#26150E] via-[#1B0E08] to-[#0E0603] text-white p-6 sm:p-7 md:p-8 flex flex-col justify-between min-h-[320px]"
                >
                  {/* Atmospheric Glow Backdrops */}
                  <div className="pointer-events-none absolute -right-16 -top-16 h-72 w-72 rounded-full bg-primary/25 blur-3xl" />
                  <div className="pointer-events-none absolute -left-16 -bottom-16 h-72 w-72 rounded-full bg-amber-600/15 blur-3xl" />

                  {/* Card Top: Member Tier & Hologram Chip */}
                  <div className="relative flex items-center justify-between pb-4 border-b border-white/10">
                    <div className="flex items-center gap-2.5">
                      <div className="w-8 h-8 rounded-xl bg-amber-500/20 border border-amber-400/30 flex items-center justify-center">
                        <Award className="w-4 h-4 text-amber-300" />
                      </div>
                      <div>
                        <div className="text-[10px] font-black uppercase tracking-widest text-amber-300/80">
                          Roastery Pass
                        </div>
                        <div className="text-xs font-bold text-white flex items-center gap-1.5">
                          <span>Reserve Gold Tier</span>
                          <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                        </div>
                      </div>
                    </div>

                    <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-[10px] font-extrabold uppercase tracking-wider bg-white/[0.08] border border-white/15 text-neutral-200 backdrop-blur-md">
                      <ShieldCheck className="w-3.5 h-3.5 text-emerald-400" />
                      <span>Live Wallet</span>
                    </div>
                  </div>

                  {/* Card Middle: Main Balance & Numbers */}
                  <div className="relative py-4 space-y-3">
                    <div className="text-xs font-bold uppercase tracking-widest text-amber-200/70 flex items-center gap-1.5">
                      <Coins className="w-4 h-4 text-amber-400" />
                      <span>Available Beans Balance</span>
                    </div>

                    <div className="flex items-baseline gap-3 flex-wrap">
                      <NumberTicker
                        value={availableBeans}
                        className="text-5xl sm:text-6xl md:text-7xl font-black font-display tracking-tight text-white tabular-nums drop-shadow-md"
                      />
                      <span className="text-lg sm:text-xl font-black uppercase tracking-widest text-amber-300/90">
                        Beans
                      </span>
                    </div>

                    {/* Cash Conversion Pill */}
                    <div className="inline-flex flex-wrap items-center gap-2.5 px-4 py-2 rounded-2xl bg-white/[0.07] border border-white/15 backdrop-blur-md text-xs">
                      <span className="text-neutral-300 font-medium">Checkout Redemption Value:</span>
                      <span className="text-base font-black text-amber-400 flex items-center">
                        ₹<NumberTicker value={beanValue} className="text-amber-400 font-black" />
                      </span>
                      <span className="text-[11px] text-neutral-400 font-mono">(2 Beans = ₹1)</span>
                    </div>
                  </div>

                  {/* Card Bottom: Milestone Bar & Action CTAs */}
                  <div className="relative space-y-4 pt-3 border-t border-white/10">
                    <div className="space-y-1.5">
                      <div className="flex justify-between items-center text-xs">
                        <span className="text-neutral-300 font-semibold flex items-center gap-1.5">
                          <Star className="w-3.5 h-3.5 text-amber-400 fill-amber-400" />
                          Next Perk: Free Specialty Pour-Over
                        </span>
                        <span className="text-amber-300 font-mono font-bold">
                          {beansToNext > 0 ? `${beansToNext} Beans away` : 'Unlocked!'}
                        </span>
                      </div>
                      <div className="h-2 w-full rounded-full bg-white/10 overflow-hidden p-0.5 border border-white/10">
                        <motion.div
                          initial={{ width: 0 }}
                          animate={{ width: `${progressPercent}%` }}
                          transition={{ duration: 1.2, ease: 'easeOut', delay: 0.2 }}
                          className="h-full rounded-full bg-gradient-to-r from-amber-500 via-orange-400 to-[#FF6422]"
                        />
                      </div>
                    </div>

                    <div className="flex flex-wrap items-center gap-3">
                      <ShimmerButton
                        onClick={scrollToOffers}
                        background="radial-gradient(ellipse 80% 80% at 50% 120%, #ff6422, #c84610)"
                        shimmerColor="#ffd7b5"
                        className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl text-xs font-bold text-white shadow-lg cursor-pointer transition-transform active:scale-95"
                      >
                        <Tag className="w-3.5 h-3.5" />
                        <span>Explore Coupons</span>
                      </ShimmerButton>

                      {onNavigateCart && (
                        <motion.button
                          whileHover={{ scale: 1.03 }}
                          whileTap={{ scale: 0.95 }}
                          type="button"
                          onClick={onNavigateCart}
                          className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-white/10 hover:bg-white/15 text-white text-xs font-bold border border-white/15 transition-all cursor-pointer backdrop-blur-md"
                        >
                          <span>Use in Cart</span>
                          <ArrowRight className="w-3.5 h-3.5" />
                        </motion.button>
                      )}
                    </div>
                  </div>
                </CardSpotlight>
              </ShineBorder>
            </BlurFade>
          </div>

          {/* Bento Tile 2: Loyalty Tier Highlights (Col 4) */}
          <div className="lg:col-span-4 flex flex-col gap-4">
            <BlurFade delay={0.09} yOffset={10}>
              <div className="h-full rounded-[28px] border border-outline-variant/15 bg-surface-container-low/80 backdrop-blur-xl p-5 sm:p-6 flex flex-col justify-between space-y-4 shadow-lg hover:border-primary/30 transition-all">
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="text-[10px] font-black uppercase tracking-widest text-primary bg-primary/10 border border-primary/20 px-2.5 py-0.5 rounded-full">
                      Privileges
                    </span>
                    <Flame className="w-4 h-4 text-primary" />
                  </div>
                  <h3 className="text-base sm:text-lg font-bold text-on-surface">
                    Tier Benefits Unlocked
                  </h3>
                  <p className="text-xs text-on-surface-variant leading-relaxed">
                    Active on every order when you order via Table QR or counter POS.
                  </p>
                </div>

                <div className="space-y-2.5">
                  <div className="flex items-start gap-2.5 p-2.5 rounded-xl bg-surface-container/60 border border-outline-variant/10">
                    <div className="w-7 h-7 rounded-lg bg-emerald-500/15 text-emerald-400 flex items-center justify-center shrink-0 mt-0.5">
                      <Percent className="w-3.5 h-3.5" />
                    </div>
                    <div>
                      <div className="text-xs font-bold text-on-surface">50% Max Deduction</div>
                      <div className="text-[11px] text-on-surface-variant">Redeem Beans up to half your bill</div>
                    </div>
                  </div>

                  <div className="flex items-start gap-2.5 p-2.5 rounded-xl bg-surface-container/60 border border-outline-variant/10">
                    <div className="w-7 h-7 rounded-lg bg-amber-500/15 text-amber-400 flex items-center justify-center shrink-0 mt-0.5">
                      <Sparkles className="w-3.5 h-3.5" />
                    </div>
                    <div>
                      <div className="text-xs font-bold text-on-surface">+25 Beans Per Review</div>
                      <div className="text-[11px] text-on-surface-variant">Instant credit after dining</div>
                    </div>
                  </div>

                  <div className="flex items-start gap-2.5 p-2.5 rounded-xl bg-surface-container/60 border border-outline-variant/10">
                    <div className="w-7 h-7 rounded-lg bg-violet-500/15 text-violet-400 flex items-center justify-center shrink-0 mt-0.5">
                      <Gift className="w-3.5 h-3.5" />
                    </div>
                    <div>
                      <div className="text-xs font-bold text-on-surface">VIP Segment Deals</div>
                      <div className="text-[11px] text-on-surface-variant">Secret curated seasonal offers</div>
                    </div>
                  </div>
                </div>

                <div className="pt-2 border-t border-outline-variant/10 flex items-center justify-between text-xs text-on-surface-variant">
                  <span>Never expires</span>
                  <span className="font-semibold text-primary">No minimum balance</span>
                </div>
              </div>
            </BlurFade>
          </div>
        </div>

        {/* 3-Step Earn & Save Cards */}
        <section aria-label="How Beans Work" className="space-y-3.5">
          <BlurFade delay={0.12} yOffset={6}>
            <div className="flex items-center justify-between">
              <h2 className="text-sm sm:text-base font-extrabold text-on-surface flex items-center gap-2">
                <Info className="w-4 h-4 text-primary" />
                <span>The Three-Step Loop</span>
              </h2>
              <span className="text-xs text-on-surface-variant font-medium">Automatic & Effortless</span>
            </div>
          </BlurFade>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3.5">
            {PERK_RULES.map((rule, idx) => {
              const IconComp = rule.icon;
              return (
                <BlurFade key={rule.badge} delay={0.14 + idx * 0.05} yOffset={10}>
                  <motion.div
                    whileHover={{ y: -4, scale: 1.015 }}
                    transition={{ type: 'spring', stiffness: 350, damping: 22 }}
                    className="h-full rounded-2xl border border-outline-variant/15 bg-surface-container-low/70 hover:border-primary/30 transition-colors shadow-sm overflow-hidden"
                  >
                    <CardSpotlight radius={180} color={rule.spotlight} className="p-4 sm:p-5 space-y-3 bg-transparent h-full flex flex-col justify-between">
                      <div className="space-y-2.5">
                        <div className="flex items-center justify-between">
                          <span
                            className={`px-2.5 py-0.5 rounded-full text-[10px] font-black uppercase tracking-wider border ${rule.badgeClass}`}
                          >
                            {rule.badge}
                          </span>
                          <IconComp className="w-4 h-4 text-on-surface-variant/70" />
                        </div>
                        <div>
                          <h3 className="text-base font-black text-on-surface">{rule.title}</h3>
                          <p className="text-xs font-bold text-primary">{rule.subtitle}</p>
                        </div>
                      </div>
                      <p className="text-xs text-on-surface-variant leading-relaxed">
                        {rule.desc}
                      </p>
                    </CardSpotlight>
                  </motion.div>
                </BlurFade>
              );
            })}
          </div>
        </section>

        {/* Offers Section with Category Filter Tabs */}
        <section id="deal-vouchers" className="space-y-4 scroll-mt-24">
          <BlurFade delay={0.18} yOffset={6}>
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-2 border-b border-outline-variant/15">
              <div className="flex items-center gap-2">
                <Flame className="w-5 h-5 text-primary" />
                <h2 className="text-lg font-black text-on-surface">Active Cafe Vouchers</h2>
              </div>

              {/* Filter Tabs */}
              <div className="flex items-center gap-1.5 p-1 rounded-xl bg-surface-container-high border border-outline-variant/20 self-start sm:self-auto overflow-x-auto max-w-full">
                {(
                  [
                    { id: 'all', label: `All (${activeCampaigns.length})` },
                    { id: 'beverage', label: 'Brews & Frappes' },
                    { id: 'food', label: 'Food & Snacks' },
                    { id: 'exclusive', label: 'VIP Exclusive' },
                  ] as const
                ).map((tab) => (
                  <button
                    key={tab.id}
                    type="button"
                    onClick={() => setActiveTab(tab.id)}
                    className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all whitespace-nowrap cursor-pointer ${
                      activeTab === tab.id
                        ? 'bg-primary text-white shadow-sm'
                        : 'text-on-surface-variant hover:text-on-surface'
                    }`}
                  >
                    {tab.label}
                  </button>
                ))}
              </div>
            </div>
          </BlurFade>

          {/* Vouchers List */}
          <div className="space-y-3.5">
            <AnimatePresence mode="popLayout">
              {filteredCampaigns.length === 0 ? (
                <BlurFade delay={0.1} yOffset={8}>
                  <div className="p-8 rounded-2xl border border-outline-variant/15 bg-surface-container-low text-center space-y-2">
                    <Coffee className="w-8 h-8 text-on-surface-variant/50 mx-auto" />
                    <h3 className="text-sm font-bold text-on-surface">No vouchers in this category</h3>
                    <p className="text-xs text-on-surface-variant">
                      Try selecting &ldquo;All&rdquo; to explore all active cafe promotions.
                    </p>
                  </div>
                </BlurFade>
              ) : (
                filteredCampaigns.map((campaign, idx) => {
                  const isPersonalized = Boolean(campaign.targetSegment && campaign.targetSegment !== 'all');
                  const isCopied = copiedCode === campaign.code;

                  return (
                    <BlurFade key={campaign.id} delay={0.05 * idx} yOffset={12}>
                      <motion.article
                        layout
                        whileHover={{ y: -3, scale: 1.006 }}
                        transition={{ type: 'spring', stiffness: 350, damping: 25 }}
                        className={`group relative overflow-hidden rounded-2xl border transition-all duration-300 ${
                          isPersonalized
                            ? 'border-violet-500/35 bg-gradient-to-r from-violet-950/20 via-surface-container-low/80 to-surface-container-low hover:border-violet-400/50 shadow-violet-950/20'
                            : 'border-outline-variant/15 bg-surface-container-low/80 hover:border-primary/40 hover:bg-surface-container-low shadow-black/20'
                        } backdrop-blur-md shadow-md hover:shadow-xl`}
                      >
                        <CardSpotlight
                          radius={260}
                          color={isPersonalized ? 'rgba(168, 85, 247, 0.14)' : 'rgba(255, 100, 34, 0.12)'}
                          className="p-4 sm:p-5 flex flex-col md:flex-row md:items-center justify-between gap-4 pl-5 sm:pl-6 bg-transparent"
                        >
                          {/* Accent Bar */}
                          <div
                            className={`absolute top-0 bottom-0 left-0 w-1.5 ${
                              isPersonalized
                                ? 'bg-gradient-to-b from-violet-400 to-purple-600'
                                : 'bg-gradient-to-b from-[#FF6422] to-amber-500'
                            }`}
                          />

                          {/* Left: Info */}
                          <div className="flex-1 min-w-0 space-y-2">
                            <div className="flex flex-wrap items-center gap-2">
                              <span
                                className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-extrabold uppercase tracking-wider border ${
                                  isPersonalized
                                    ? 'bg-violet-500/15 text-violet-300 border-violet-500/30'
                                    : 'bg-primary/10 text-primary border-primary/20'
                                }`}
                              >
                                <Tag className="w-3 h-3" />
                                {isPersonalized ? 'VIP Member Exclusive' : 'Cafe Special'}
                              </span>

                              <h3 className="text-base sm:text-lg font-bold text-on-surface truncate">
                                {campaign.title}
                              </h3>
                            </div>

                            <p className="text-xs sm:text-sm text-on-surface-variant line-clamp-2 leading-relaxed">
                              {campaign.description}
                            </p>

                            <div className="flex flex-wrap items-center gap-3 pt-1 text-xs text-on-surface-variant">
                              <span className="inline-flex items-center gap-1 font-medium">
                                <Clock className="w-3.5 h-3.5 text-amber-400/80" />
                                {campaign.validityLabel}
                              </span>
                              {campaign.usedLabel && (
                                <>
                                  <span className="w-1 h-1 rounded-full bg-outline-variant/40" />
                                  <span className="text-[11px] text-on-surface-variant/80">
                                    {campaign.usedLabel}
                                  </span>
                                </>
                              )}
                            </div>
                          </div>

                          {/* Right: Actions */}
                          <div className="flex items-center gap-2 pt-2 md:pt-0 border-t md:border-t-0 border-outline-variant/15 shrink-0">
                            {/* Copy Code Pill */}
                            <motion.button
                              type="button"
                              whileHover={{ scale: 1.03 }}
                              whileTap={{ scale: 0.94 }}
                              onClick={() => handleCopy(campaign.code)}
                              title="Click to copy promo code"
                              className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl border border-dashed border-primary/40 bg-primary/5 hover:bg-primary/15 text-primary font-mono text-xs font-bold transition-colors cursor-pointer"
                            >
                              {isCopied ? (
                                <>
                                  <Check className="w-3.5 h-3.5 text-emerald-400 animate-in zoom-in-50 duration-200" />
                                  <span className="text-emerald-400 font-sans text-xs">Copied</span>
                                </>
                              ) : (
                                <>
                                  <Copy className="w-3.5 h-3.5 opacity-70" />
                                  <span>{campaign.code}</span>
                                </>
                              )}
                            </motion.button>

                            {/* Apply to Cart */}
                            <motion.button
                              type="button"
                              whileHover={{ scale: 1.03 }}
                              whileTap={{ scale: 0.94 }}
                              onClick={() => onRedeemCoupon(campaign.code)}
                              className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-primary hover:bg-[#E55518] text-white text-xs font-bold shadow-md shadow-primary/20 transition-all cursor-pointer"
                            >
                              <span>Apply Deal</span>
                              <ArrowUpRight className="w-3.5 h-3.5" />
                            </motion.button>
                          </div>
                        </CardSpotlight>
                      </motion.article>
                    </BlurFade>
                  );
                })
              )}
            </AnimatePresence>
          </div>
        </section>

        {/* Personalized VIP Member Banner */}
        <section>
          {hasMatchedCustomerProfile ? (
            <BlurFade delay={0.22} yOffset={10}>
              <div className="p-5 sm:p-6 rounded-2xl border border-violet-400/25 bg-gradient-to-r from-violet-950/25 via-neutral-900/60 to-neutral-900/40 backdrop-blur-md flex items-center gap-4">
                <div className="w-11 h-11 rounded-2xl bg-violet-500/15 border border-violet-500/30 flex items-center justify-center shrink-0">
                  <ShieldCheck className="w-6 h-6 text-violet-300" />
                </div>
                <div className="space-y-1">
                  <h3 className="text-sm sm:text-base font-bold text-on-surface">You&apos;re an Active VIP Member</h3>
                  <p className="text-xs text-on-surface-variant leading-relaxed">
                    Your phone number is linked with Seth Sawariya CRM. Segment discounts apply automatically during billing.
                  </p>
                </div>
              </div>
            </BlurFade>
          ) : (
            <BlurFade delay={0.22} yOffset={10}>
              <div className="p-5 sm:p-6 rounded-2xl border border-violet-400/25 bg-gradient-to-r from-violet-950/30 via-neutral-900/60 to-neutral-900/40 backdrop-blur-md flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
                <div className="space-y-1.5 max-w-lg">
                  <div className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[10px] font-extrabold uppercase tracking-wider bg-violet-500/20 text-violet-300 border border-violet-500/30">
                    <Sparkles className="w-3 h-3" />
                    Exclusive Member Access
                  </div>
                  <h3 className="text-base font-bold text-on-surface">Unlock Secret Roaster Privileges</h3>
                  <p className="text-xs text-on-surface-variant leading-relaxed">
                    Verify your phone in Customer Profile to link past dine-in visits, track beans history, and unlock invite-only seasonal discounts.
                  </p>
                </div>

                {onNavigateProfile && (
                  <motion.button
                    whileHover={{ scale: 1.03 }}
                    whileTap={{ scale: 0.95 }}
                    type="button"
                    onClick={onNavigateProfile}
                    className="inline-flex items-center gap-1.5 px-4 py-2.5 rounded-xl bg-violet-500 hover:bg-violet-600 text-white text-xs font-bold shadow-md shadow-violet-950/40 transition-all shrink-0 cursor-pointer"
                  >
                    <span>Verify Profile</span>
                    <ArrowRight className="w-3.5 h-3.5" />
                  </motion.button>
                )}
              </div>
            </BlurFade>
          )}
        </section>

        {/* Mini FAQ Accordion for Transparency */}
        <section className="space-y-3 pt-2">
          <BlurFade delay={0.25} yOffset={6}>
            <div className="flex items-center gap-2 pb-1 border-b border-outline-variant/15 text-xs font-bold uppercase tracking-wider text-on-surface-variant">
              <Info className="w-3.5 h-3.5 text-primary" />
              <span>Frequently Asked Questions</span>
            </div>
          </BlurFade>

          <div className="space-y-2">
            {[
              {
                q: 'How do I earn Beans?',
                a: 'Whenever your table order transitions to Served, navigate to Order Status tracking to leave a 1-5 star review. You will immediately be awarded +25 Beans!',
              },
              {
                q: 'Can I combine Beans with promo codes?',
                a: 'Yes! Beans are cash credits (2 Beans = ₹1) that stack on top of promotional coupon discounts in your cart up to 50% of your bill total.',
              },
              {
                q: 'Do my Beans expire?',
                a: 'No, your earned Beans remain in your account across all dining sessions as long as your profile is active.',
              },
            ].map((faq, idx) => (
              <div
                key={idx}
                className="rounded-xl border border-outline-variant/15 bg-surface-container-low/60 overflow-hidden"
              >
                <button
                  type="button"
                  onClick={() => setExpandedFaq((curr) => (curr === idx ? null : idx))}
                  className="w-full p-3.5 flex items-center justify-between text-left text-xs font-bold text-on-surface hover:text-primary transition-colors cursor-pointer"
                >
                  <span>{faq.q}</span>
                  <ChevronRight
                    className={`w-4 h-4 text-on-surface-variant transition-transform ${
                      expandedFaq === idx ? 'rotate-90 text-primary' : ''
                    }`}
                  />
                </button>
                {expandedFaq === idx && (
                  <div className="px-3.5 pb-3.5 text-xs text-on-surface-variant leading-relaxed border-t border-outline-variant/10 pt-2">
                    {faq.a}
                  </div>
                )}
              </div>
            ))}
          </div>
        </section>
      </div>
    </MotionConfig>
  );
};
