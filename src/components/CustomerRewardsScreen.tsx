import React, { useState, useMemo } from 'react';
import { motion, AnimatePresence, MotionConfig } from 'motion/react';
import {
  Sparkles,
  Gift,
  Tag,
  Coins,
  ArrowRight,
  Info,
  Check,
  Copy,
  Coffee,
  ShoppingBag,
  ShieldCheck,
  Flame,
  ArrowUpRight,
  Zap,
  ChevronDown,
  Star,
  Percent,
} from 'lucide-react';
import type { PromoCampaign } from '../types/cafe';
import { BlurFade } from '@/components/ui/blur-fade';
import { NumberTicker } from '@/components/ui/number-ticker';
import { ShimmerButton } from '@/components/ui/shimmer-button';
import { CardSpotlight } from '@/components/ui/card-spotlight';

export interface CustomerRewardsScreenProps {
  points: number;
  campaigns: PromoCampaign[];
  hasMatchedCustomerProfile?: boolean;
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

  // Next milestone calculation (tier reward at 200 beans)
  const nextMilestone = 200;
  const progressPercent = Math.min(100, Math.round((availableBeans / nextMilestone) * 100));
  const beansToNext = Math.max(0, nextMilestone - availableBeans);

  const filteredCampaigns = useMemo(() => {
    return activeCampaigns.filter((c) => {
      if (activeTab === 'exclusive') {
        return c.targetSegment && c.targetSegment !== 'all';
      }
      if (activeTab === 'beverage') {
        const text = (c.title + ' ' + (c.description || '')).toLowerCase();
        return text.includes('coffee') || text.includes('brew') || text.includes('drink') || text.includes('latte') || text.includes('tea');
      }
      if (activeTab === 'food') {
        const text = (c.title + ' ' + (c.description || '')).toLowerCase();
        return text.includes('pizza') || text.includes('burger') || text.includes('snack') || text.includes('bite') || text.includes('meal');
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
    const el = document.getElementById('available-offers');
    if (el) {
      el.scrollIntoView({ behavior: 'smooth' });
    }
  };

  return (
    <MotionConfig reducedMotion="user">
      <div className="mx-auto flex w-full max-w-5xl flex-col gap-6 px-4 py-5 sm:px-6 sm:py-7 md:gap-8 pb-28 text-on-surface">
        {/* Navigation Bar / Page Header */}
        <BlurFade delay={0.03} yOffset={6}>
          <header className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-3 border-b border-outline-variant/15">
            <div className="space-y-1">
              <div className="flex items-center gap-2">
                <span className="p-1.5 rounded-lg bg-primary/10 border border-primary/20 text-primary">
                  <Coins className="w-4 h-4" />
                </span>
                <span className="text-[11px] font-extrabold uppercase tracking-widest text-primary">
                  CafeOS Loyalty Club
                </span>
              </div>
              <h1 className="text-2xl sm:text-3xl font-black tracking-tight font-display text-on-surface">
                Beans <span className="text-primary">&amp;</span> Exclusive Offers
              </h1>
            </div>

            <div className="flex items-center gap-2 self-start sm:self-auto">
              {onBrowseMenu && (
                <motion.button
                  whileHover={{ scale: 1.03 }}
                  whileTap={{ scale: 0.95 }}
                  type="button"
                  onClick={onBrowseMenu}
                  className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-surface-container-high hover:bg-surface-variant text-xs font-bold text-on-surface border border-outline-variant/20 transition-all cursor-pointer shadow-sm"
                >
                  <Coffee className="w-3.5 h-3.5 text-primary" />
                  <span>Menu</span>
                </motion.button>
              )}
              {onNavigateCart && (
                <motion.button
                  whileHover={{ scale: 1.03 }}
                  whileTap={{ scale: 0.95 }}
                  type="button"
                  onClick={onNavigateCart}
                  className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-primary/15 hover:bg-primary/25 text-xs font-bold text-primary border border-primary/30 transition-all cursor-pointer shadow-sm"
                >
                  <ShoppingBag className="w-3.5 h-3.5" />
                  <span>View Cart</span>
                </motion.button>
              )}
            </div>
          </header>
        </BlurFade>

        {/* Bento Grid: Vault Card (Col 8) + Tier Milestone (Col 4) */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 items-stretch">
          {/* Main Vault Tile */}
          <BlurFade delay={0.06} yOffset={10} className="lg:col-span-8 flex">
            <section
              aria-label="Bean Vault"
              className="relative w-full overflow-hidden rounded-3xl border border-amber-500/25 bg-gradient-to-br from-[#20120B] via-[#140B07] to-[#0A0503] p-5 sm:p-7 md:p-8 text-white shadow-2xl flex flex-col justify-between"
            >
              {/* Specular ambient lighting */}
              <div className="pointer-events-none absolute -top-24 -left-24 w-72 h-72 rounded-full bg-primary/15 blur-3xl" />
              <div className="pointer-events-none absolute -bottom-24 -right-24 w-72 h-72 rounded-full bg-amber-500/10 blur-3xl" />
              <div className="pointer-events-none absolute inset-y-0 left-0 w-1 bg-gradient-to-b from-primary via-amber-400 to-transparent" />

              <div>
                {/* Status Badges */}
                <div className="flex flex-wrap items-center gap-2">
                  <span className="inline-flex items-center gap-1.5 rounded-full border border-amber-400/30 bg-amber-400/10 px-3 py-1 text-[11px] font-extrabold uppercase tracking-wider text-amber-200">
                    <Coins className="h-3.5 w-3.5 text-amber-400" />
                    Vault Balance
                  </span>
                  <span className="inline-flex items-center gap-1.5 rounded-full border border-emerald-400/25 bg-emerald-400/10 px-2.5 py-1 text-[11px] font-bold text-emerald-300">
                    <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 animate-pulse" />
                    Available Instantly
                  </span>
                </div>

                {/* Big Balance Display */}
                <div className="mt-5 flex items-baseline gap-3">
                  <NumberTicker
                    value={availableBeans}
                    className="text-5xl sm:text-6xl md:text-7xl font-black font-display tracking-tight text-amber-50 tabular-nums"
                  />
                  <span className="text-base sm:text-lg font-bold uppercase tracking-widest text-amber-300/80">
                    Beans
                  </span>
                </div>

                {/* Conversion Equivalent */}
                <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-neutral-300">
                  <span className="text-xs font-medium text-neutral-400">Cash Value:</span>
                  <span className="inline-flex items-center text-lg sm:text-xl font-black text-amber-300">
                    ₹<NumberTicker value={beanValue} className="text-amber-300 font-black ml-0.5" />
                  </span>
                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-white/5 border border-white/10 text-[11px] text-neutral-300 font-medium">
                    <Percent className="w-3 h-3 text-amber-400" /> 2 Beans = ₹1 discount
                  </span>
                </div>
              </div>

              {/* Action Buttons & Security Guarantee */}
              <div className="mt-7 pt-5 border-t border-white/10 flex flex-wrap items-center justify-between gap-4">
                <div className="flex flex-wrap items-center gap-3">
                  <ShimmerButton
                    onClick={scrollToOffers}
                    background="radial-gradient(ellipse 80% 80% at 50% 120%, #ff6422, #c84610)"
                    shimmerColor="#ffd7b5"
                    className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl text-xs font-bold text-white shadow-lg cursor-pointer transition-transform active:scale-95"
                  >
                    <Tag className="h-3.5 w-3.5" />
                    <span>Explore Vouchers</span>
                  </ShimmerButton>

                  {onNavigateCart && (
                    <motion.button
                      whileHover={{ scale: 1.03 }}
                      whileTap={{ scale: 0.95 }}
                      type="button"
                      onClick={onNavigateCart}
                      className="inline-flex items-center gap-2 rounded-xl border border-white/20 bg-white/10 px-4 py-2.5 text-xs font-bold text-white hover:bg-white/15 transition-all cursor-pointer shadow-sm"
                    >
                      <span>Redeem in Cart</span>
                      <ArrowRight className="h-3.5 w-3.5" />
                    </motion.button>
                  )}
                </div>

                <div className="inline-flex items-center gap-1.5 text-[11px] text-neutral-400 font-medium">
                  <ShieldCheck className="h-4 w-4 text-emerald-400 shrink-0" />
                  <span>Dine-in verified credits</span>
                </div>
              </div>
            </section>
          </BlurFade>

          {/* Tier Milestone Card (Col 4) */}
          <BlurFade delay={0.09} yOffset={10} className="lg:col-span-4 flex">
            <section
              aria-label="Tier Milestone"
              className="w-full rounded-3xl border border-outline-variant/20 bg-surface-container-low/90 backdrop-blur-md p-5 sm:p-6 flex flex-col justify-between shadow-xl"
            >
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[10px] font-extrabold uppercase tracking-wider bg-primary/10 border border-primary/25 text-primary">
                    <Star className="w-3 h-3 fill-primary" />
                    Tier Level
                  </span>
                  <span className="text-xs font-bold text-on-surface">
                    {availableBeans >= nextMilestone ? 'Gold Member' : 'Silver Tier'}
                  </span>
                </div>

                <div>
                  <h3 className="text-base font-extrabold text-on-surface">VIP Roastery Club</h3>
                  <p className="text-xs text-on-surface-variant mt-1 leading-relaxed">
                    {beansToNext > 0
                      ? `Collect ${beansToNext} more Beans to unlock 15% bonus redemption privileges.`
                      : 'You have achieved Gold Tier VIP status! Enjoy complimentary priority tables.'}
                  </p>
                </div>

                {/* Milestone Progress Bar */}
                <div className="space-y-1.5 pt-1">
                  <div className="flex items-center justify-between text-[11px] font-bold text-on-surface-variant">
                    <span>Progress</span>
                    <span>{progressPercent}%</span>
                  </div>
                  <div className="h-2 w-full rounded-full bg-surface-container-highest overflow-hidden">
                    <motion.div
                      initial={{ width: 0 }}
                      animate={{ width: `${progressPercent}%` }}
                      transition={{ duration: 1.2, ease: 'easeOut' }}
                      className="h-full rounded-full bg-gradient-to-r from-primary to-amber-400"
                    />
                  </div>
                  <div className="flex justify-between text-[10px] text-on-surface-variant/70">
                    <span>0 Beans</span>
                    <span>{nextMilestone} Beans (Gold)</span>
                  </div>
                </div>
              </div>

              {/* Review Prompt Reminder */}
              <div className="mt-5 p-3 rounded-2xl border border-emerald-500/20 bg-emerald-500/5 flex items-center gap-2.5">
                <div className="p-2 rounded-xl bg-emerald-500/15 border border-emerald-500/25 text-emerald-400 shrink-0">
                  <Sparkles className="w-4 h-4" />
                </div>
                <div className="text-[11px] text-on-surface leading-snug">
                  <strong className="text-emerald-400 font-extrabold">+25 Beans</strong> awarded on every verified table review.
                </div>
              </div>
            </section>
          </BlurFade>
        </div>

        {/* 3 Interactive Perk Rule Cards */}
        <section aria-label="Earning and Redemption Rules" className="space-y-3">
          <BlurFade delay={0.12} yOffset={8}>
            <div className="flex items-center justify-between">
              <h2 className="text-sm sm:text-base font-bold text-on-surface flex items-center gap-2">
                <Info className="w-4 h-4 text-primary" />
                <span>How Beans Work</span>
              </h2>
              <span className="text-xs text-on-surface-variant font-medium">Clear &amp; Transparent</span>
            </div>
          </BlurFade>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3.5">
            {PERK_RULES.map((rule, idx) => {
              const IconComp = rule.icon;
              return (
                <BlurFade key={rule.badge} delay={0.14 + idx * 0.04} yOffset={10}>
                  <motion.div
                    whileHover={{ y: -4, scale: 1.01 }}
                    transition={{ type: 'spring', stiffness: 350, damping: 24 }}
                    className="h-full rounded-2xl border border-outline-variant/15 bg-surface-container-low/80 hover:border-primary/40 transition-colors shadow-sm overflow-hidden"
                  >
                    <CardSpotlight radius={160} color={rule.spotlight} className="p-4 space-y-2.5 bg-transparent h-full">
                      <div className="flex items-center justify-between">
                        <span
                          className={`px-2.5 py-0.5 rounded-full text-[10px] font-extrabold uppercase tracking-wider border ${rule.badgeClass}`}
                        >
                          {rule.badge}
                        </span>
                        <IconComp className="w-4 h-4 text-on-surface-variant/70" />
                      </div>

                      <div>
                        <h3 className="text-base font-extrabold text-on-surface">{rule.title}</h3>
                        <p className="text-xs font-semibold text-primary">{rule.subtitle}</p>
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

        {/* Available Offers Section with Category Filter Tabs */}
        <section id="available-offers" className="space-y-4 scroll-mt-24">
          <BlurFade delay={0.18} yOffset={8}>
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-2 border-b border-outline-variant/15">
              <div className="flex items-center gap-2">
                <Flame className="w-5 h-5 text-primary" />
                <h2 className="text-lg font-extrabold text-on-surface">Active Cafe Vouchers</h2>
                <span className="px-2 py-0.5 rounded-full bg-surface-container-high border border-outline-variant/20 text-xs font-bold text-on-surface-variant">
                  {filteredCampaigns.length}
                </span>
              </div>

              {/* Filter Tabs */}
              <div className="flex items-center gap-1.5 overflow-x-auto pb-1 sm:pb-0 scrollbar-none">
                {(
                  [
                    { id: 'all', label: 'All Deals' },
                    { id: 'beverage', label: 'Brews & Frappes' },
                    { id: 'food', label: 'Food & Snacks' },
                    { id: 'exclusive', label: 'VIP Exclusives' },
                  ] as const
                ).map((tab) => (
                  <button
                    key={tab.id}
                    type="button"
                    onClick={() => setActiveTab(tab.id)}
                    className={`px-3 py-1.5 rounded-xl text-xs font-bold whitespace-nowrap transition-all cursor-pointer ${
                      activeTab === tab.id
                        ? 'bg-primary text-white shadow-sm shadow-primary/30'
                        : 'bg-surface-container-high hover:bg-surface-variant text-on-surface-variant border border-outline-variant/15'
                    }`}
                  >
                    {tab.label}
                  </button>
                ))}
              </div>
            </div>
          </BlurFade>

          {/* Cards List or Empty State */}
          <AnimatePresence mode="wait">
            {filteredCampaigns.length === 0 ? (
              <motion.div
                key="empty"
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
                className="p-8 rounded-2xl border border-outline-variant/15 bg-surface-container-low text-center space-y-2"
              >
                <Coffee className="w-8 h-8 text-on-surface-variant/40 mx-auto" />
                <h3 className="text-sm font-bold text-on-surface">No vouchers in this category</h3>
                <p className="text-xs text-on-surface-variant">
                  Try switching tabs or check back soon as our barista team launches new seasonal specials.
                </p>
              </motion.div>
            ) : (
              <motion.div
                key="list"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="space-y-3.5"
              >
                {filteredCampaigns.map((campaign, idx) => {
                  const isPersonalized = Boolean(campaign.targetSegment && campaign.targetSegment !== 'all');
                  const isCopied = copiedCode === campaign.code;

                  return (
                    <BlurFade key={campaign.id} delay={0.04 * idx} yOffset={10}>
                      <motion.article
                        whileHover={{ y: -2 }}
                        className={`group relative overflow-hidden rounded-2xl border transition-all duration-300 ${
                          isPersonalized
                            ? 'border-violet-500/35 bg-gradient-to-r from-violet-950/20 via-surface-container-low/90 to-surface-container-low/70 hover:border-violet-400/50'
                            : 'border-outline-variant/20 bg-surface-container-low/85 hover:border-primary/40'
                        } backdrop-blur-md shadow-md hover:shadow-xl`}
                      >
                        <CardSpotlight
                          radius={240}
                          color={isPersonalized ? 'rgba(168, 85, 247, 0.12)' : 'rgba(255, 100, 34, 0.10)'}
                          className="p-4 sm:p-5 flex flex-col md:flex-row md:items-center justify-between gap-4 pl-5 sm:pl-6 bg-transparent"
                        >
                          {/* Left Accent Bar */}
                          <div
                            className={`absolute top-0 bottom-0 left-0 w-1.5 ${
                              isPersonalized
                                ? 'bg-gradient-to-b from-violet-400 to-purple-600'
                                : 'bg-gradient-to-b from-primary to-amber-500'
                            }`}
                          />

                          {/* Info Column */}
                          <div className="flex-1 min-w-0 space-y-2">
                            <div className="flex flex-wrap items-center gap-2">
                              <span
                                className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-extrabold uppercase tracking-wider border ${
                                  isPersonalized
                                    ? 'bg-violet-500/15 text-violet-300 border-violet-500/30'
                                    : 'bg-primary/10 text-primary border-primary/25'
                                }`}
                              >
                                {isPersonalized ? (
                                  <>
                                    <Sparkles className="w-3 h-3" />
                                    <span>Member Tier Deal</span>
                                  </>
                                ) : (
                                  <>
                                    <Tag className="w-3 h-3" />
                                    <span>Cafe Voucher</span>
                                  </>
                                )}
                              </span>

                              {campaign.validityLabel && (
                                <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-extrabold bg-emerald-500/10 text-emerald-400 border border-emerald-500/25">
                                  {campaign.validityLabel}
                                </span>
                              )}
                            </div>

                            <div>
                              <h3 className="text-base font-extrabold text-on-surface group-hover:text-primary transition-colors">
                                {campaign.title}
                              </h3>
                              {campaign.description && (
                                <p className="text-xs text-on-surface-variant line-clamp-2 mt-0.5 leading-relaxed">
                                  {campaign.description}
                                </p>
                              )}
                            </div>

                            {/* Eligibility / usage stats */}
                            <div className="flex flex-wrap items-center gap-3 text-[11px] text-on-surface-variant font-medium pt-1">
                              {campaign.usedLabel && (
                                <span>{campaign.usedLabel}</span>
                              )}
                              {campaign.revenueLabel && (
                                <span>• {campaign.revenueLabel}</span>
                              )}
                            </div>
                          </div>

                          {/* Voucher Code Stub & Action CTA */}
                          <div className="flex flex-wrap sm:flex-nowrap items-center gap-2.5 shrink-0 pt-2 md:pt-0 border-t md:border-t-0 border-outline-variant/15">
                            {/* Copyable Promo Code Badge */}
                            <button
                              type="button"
                              onClick={() => handleCopy(campaign.code)}
                              className={`group/btn flex items-center gap-2 px-3 py-2 rounded-xl border text-xs font-mono font-bold tracking-wider transition-all cursor-pointer ${
                                isCopied
                                  ? 'bg-emerald-500/15 border-emerald-500/40 text-emerald-300'
                                  : 'bg-surface-container-high hover:bg-surface-variant border-outline-variant/25 text-on-surface'
                              }`}
                              title="Click to copy promo code"
                            >
                              <span>{campaign.code}</span>
                              {isCopied ? (
                                <Check className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                              ) : (
                                <Copy className="w-3.5 h-3.5 text-on-surface-variant group-hover/btn:text-on-surface shrink-0" />
                              )}
                            </button>

                            {/* Direct Apply Button */}
                            <motion.button
                              whileHover={{ scale: 1.03 }}
                              whileTap={{ scale: 0.94 }}
                              type="button"
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
                })}
              </motion.div>
            )}
          </AnimatePresence>
        </section>

        {/* Member Tier VIP Banner */}
        <section className="space-y-4">
          {hasMatchedCustomerProfile ? (
            <BlurFade delay={0.22} yOffset={8}>
              <div className="p-5 sm:p-6 rounded-2xl border border-violet-400/25 bg-gradient-to-r from-violet-950/25 via-surface-container-low/80 to-surface-container-low/60 backdrop-blur-md flex items-center gap-4">
                <div className="w-11 h-11 rounded-2xl bg-violet-500/15 border border-violet-500/30 flex items-center justify-center shrink-0">
                  <ShieldCheck className="w-5 h-5 text-violet-300" />
                </div>
                <div className="space-y-1">
                  <h3 className="text-sm font-bold text-on-surface">Verified Member Account Active</h3>
                  <p className="text-xs text-on-surface-variant leading-relaxed">
                    Your dine-in profile is verified. Your visit points and exclusive discounts are automatically credited to your phone number.
                  </p>
                </div>
              </div>
            </BlurFade>
          ) : (
            <BlurFade delay={0.22} yOffset={8}>
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
                  <ChevronDown
                    className={`w-4 h-4 text-on-surface-variant transition-transform ${
                      expandedFaq === idx ? 'rotate-180 text-primary' : ''
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
