import React, { useState } from 'react';
import { motion, MotionConfig } from 'motion/react';
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
} from 'lucide-react';
import type { PromoCampaign } from '../types/cafe';

interface CustomerRewardsScreenProps {
  points: number;
  campaigns: PromoCampaign[];
  hasMatchedCustomerProfile: boolean;
  onRedeemCoupon: (code: string) => void;
  onNavigateProfile: () => void;
  onBrowseMenu?: () => void;
  onNavigateCart?: () => void;
}

const EARNING_RULES = [
  {
    icon: Sparkles,
    badge: 'EARN',
    badgeColor: 'text-emerald-400 bg-emerald-500/10 border-emerald-500/20',
    title: '+25 Beans',
    subtitle: 'Per Verified Review',
    detail: 'Rate any served order from tracking to immediately earn Beans in your wallet.',
  },
  {
    icon: Coins,
    badge: 'REDEEM',
    badgeColor: 'text-amber-400 bg-amber-500/10 border-amber-500/20',
    title: '2 Beans = ₹1',
    subtitle: 'Direct Cash Value',
    detail: 'Beans convert to instant cash deductions in your cart at checkout.',
  },
  {
    icon: BadgePercent,
    badge: 'MAX SAVE',
    badgeColor: 'text-orange-400 bg-orange-500/10 border-orange-500/20',
    title: 'Up to 50% Off',
    subtitle: 'On Order Subtotal',
    detail: 'Stack your Beans balance with promotional campaign coupons for maximum savings.',
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

  const activeCampaigns = campaigns.filter((c) => c.status === 'active');
  const currentOffers = activeCampaigns.filter(
    (c) => !c.targetSegment || c.targetSegment === 'all'
  );
  const personalizedOffers = activeCampaigns.filter(
    (c) => c.targetSegment && c.targetSegment !== 'all'
  );

  const availableBeans = Number.isFinite(points) ? Math.max(0, points) : 0;
  const beanValue = Math.floor(availableBeans / 2);

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

  const renderOfferCard = (campaign: PromoCampaign, index: number, isPersonalized = false) => {
    const isCopied = copiedCode === campaign.code;

    return (
      <motion.article
        key={campaign.id}
        initial={{ opacity: 0, y: 16 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true, amount: 0.1 }}
        transition={{ duration: 0.35, delay: Math.min(index, 4) * 0.05 }}
        className={`group relative overflow-hidden rounded-2xl border transition-all duration-300 ${
          isPersonalized
            ? 'border-violet-500/30 bg-gradient-to-r from-violet-950/25 via-neutral-900/60 to-neutral-900/40 hover:border-violet-400/50'
            : 'border-outline-variant/15 bg-surface-container-low/80 hover:border-primary/40 hover:bg-surface-container-low'
        } backdrop-blur-md shadow-md hover:shadow-xl`}
      >
        {/* Accent Bar */}
        <div
          className={`absolute top-0 bottom-0 left-0 w-1.5 ${
            isPersonalized ? 'bg-gradient-to-b from-violet-400 to-purple-600' : 'bg-gradient-to-b from-[#FF6422] to-amber-500'
          }`}
        />

        <div className="p-4 sm:p-5 flex flex-col md:flex-row md:items-center justify-between gap-4 pl-5 sm:pl-6">
          {/* Main Info */}
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
                {isPersonalized ? 'Member Exclusive' : 'Cafe Special'}
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

          {/* Action Row */}
          <div className="flex items-center gap-2 pt-2 md:pt-0 border-t md:border-t-0 border-outline-variant/15 shrink-0">
            {/* Coupon Code Pill & Copy Button */}
            <button
              type="button"
              onClick={() => handleCopy(campaign.code)}
              title="Click to copy promo code"
              className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl border border-dashed border-primary/30 bg-primary/5 hover:bg-primary/10 text-primary font-mono text-xs font-bold transition-all active:scale-95 cursor-pointer"
            >
              {isCopied ? (
                <>
                  <Check className="w-3.5 h-3.5 text-emerald-400" />
                  <span className="text-emerald-400 font-sans text-xs">Copied</span>
                </>
              ) : (
                <>
                  <Copy className="w-3.5 h-3.5 opacity-70" />
                  <span>{campaign.code}</span>
                </>
              )}
            </button>

            {/* Apply to Cart Button */}
            <button
              type="button"
              onClick={() => onRedeemCoupon(campaign.code)}
              className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-primary hover:bg-[#E55518] text-white text-xs font-bold shadow-md shadow-primary/20 transition-all active:scale-95 cursor-pointer"
            >
              <span>Apply</span>
              <ArrowUpRight className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      </motion.article>
    );
  };

  return (
    <MotionConfig reducedMotion="user">
      <div className="mx-auto flex w-full max-w-4xl flex-col gap-6 px-4 py-4 sm:px-6 sm:py-6 md:gap-8 pb-24 text-on-surface">
        {/* Page Top Header */}
        <motion.header
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.35 }}
          className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-2 border-b border-outline-variant/15"
        >
          <div className="space-y-1">
            <div className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider bg-primary/10 text-primary border border-primary/20">
              <Sparkles className="w-3 h-3" />
              Seth Sawariya Rewards Club
            </div>
            <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight">
              Beans <span className="text-primary">&amp;</span> Offers
            </h1>
            <p className="text-xs sm:text-sm text-on-surface-variant max-w-lg leading-relaxed">
              Every review earns Beans. Redeem them for direct rupee discounts on handcrafted brews and treats.
            </p>
          </div>

          <div className="flex items-center gap-2 self-start sm:self-auto">
            {onBrowseMenu && (
              <button
                type="button"
                onClick={onBrowseMenu}
                className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-surface-container-high hover:bg-surface-variant text-xs font-bold text-on-surface border border-outline-variant/20 transition-all cursor-pointer"
              >
                <Coffee className="w-3.5 h-3.5 text-primary" />
                <span>Explore Menu</span>
              </button>
            )}
            {onNavigateCart && (
              <button
                type="button"
                onClick={onNavigateCart}
                className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-primary/10 hover:bg-primary/20 text-xs font-bold text-primary border border-primary/20 transition-all cursor-pointer"
              >
                <ShoppingBag className="w-3.5 h-3.5" />
                <span>View Cart</span>
              </button>
            )}
          </div>
        </motion.header>

        {/* Hero Bean Wallet Card */}
        <motion.section
          initial={{ opacity: 0, y: 18 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.45, delay: 0.05 }}
          className="relative isolate overflow-hidden rounded-3xl border border-amber-500/25 bg-gradient-to-br from-[#24150E] via-[#1A0E08] to-[#100704] text-white shadow-2xl p-5 sm:p-7 md:p-8"
        >
          {/* Ambient Lighting Layers */}
          <div className="pointer-events-none absolute -right-20 -top-20 h-64 w-64 rounded-full bg-primary/20 blur-3xl" />
          <div className="pointer-events-none absolute -left-20 -bottom-20 h-64 w-64 rounded-full bg-amber-600/15 blur-3xl" />

          <div className="relative grid grid-cols-1 md:grid-cols-[1fr_auto] gap-6 items-center">
            {/* Left Balance & Details */}
            <div className="space-y-4">
              <div className="flex flex-wrap items-center gap-2">
                <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-extrabold uppercase tracking-wider bg-amber-500/15 text-amber-300 border border-amber-500/30">
                  <Coins className="w-3.5 h-3.5 text-amber-400" />
                  Your Active Balance
                </span>
                <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-emerald-400 bg-emerald-500/10 border border-emerald-500/20 px-2 py-0.5 rounded-full">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                  Ready to redeem
                </span>
              </div>

              {/* Number and Units */}
              <div className="flex items-baseline gap-3">
                <span className="text-5xl sm:text-6xl font-black font-display tracking-tight text-amber-100 tabular-nums">
                  {availableBeans.toLocaleString('en-IN')}
                </span>
                <span className="text-base sm:text-lg font-bold uppercase tracking-wider text-amber-300/80">
                  Beans
                </span>
              </div>

              {/* Cash Equivalent Pill */}
              <div className="inline-flex flex-wrap items-center gap-2 px-3.5 py-1.5 rounded-xl bg-white/[0.06] border border-white/10 text-xs text-neutral-200">
                <span className="text-neutral-400">Equivalent to:</span>
                <span className="text-base font-extrabold text-amber-400">
                  ₹{beanValue.toLocaleString('en-IN')}
                </span>
                <span className="text-[11px] text-neutral-400 font-medium">
                  (2 Beans = ₹1 discount)
                </span>
              </div>

              <p className="text-xs text-neutral-300/80 max-w-md leading-relaxed">
                Apply your Beans balance in the cart to pay for up to 50% of your beverage and food bill.
              </p>

              {/* Action Buttons */}
              <div className="flex flex-wrap items-center gap-3 pt-2">
                <button
                  type="button"
                  onClick={scrollToOffers}
                  className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-[#FF6422] hover:bg-[#FF7840] text-white text-xs font-bold shadow-lg shadow-orange-950/40 transition-all active:scale-95 cursor-pointer"
                >
                  <Tag className="w-3.5 h-3.5" />
                  <span>View Available Coupons</span>
                </button>

                {onNavigateCart && (
                  <button
                    type="button"
                    onClick={onNavigateCart}
                    className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-white/10 hover:bg-white/15 text-white text-xs font-bold border border-white/15 transition-all active:scale-95 cursor-pointer"
                  >
                    <span>Redeem at Cart</span>
                    <ArrowRight className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>
            </div>

            {/* Right Emblem Medallion (Decorative) */}
            <div className="hidden md:flex flex-col items-center justify-center p-4">
              <div className="relative flex items-center justify-center w-36 h-36 rounded-full bg-gradient-to-tr from-amber-950 via-[#351D13] to-amber-700/40 border-2 border-amber-400/40 shadow-2xl shadow-black/60">
                <div className="absolute inset-2 rounded-full border border-amber-400/20 border-dashed animate-[spin_24s_linear_infinite]" />
                <div className="flex flex-col items-center justify-center text-center space-y-1">
                  <Coffee className="w-10 h-10 text-amber-300 drop-shadow-md" />
                  <span className="text-[10px] font-black uppercase tracking-widest text-amber-200">
                    Club Member
                  </span>
                </div>
              </div>
            </div>
          </div>

          {/* Bottom Strip */}
          <div className="mt-6 pt-4 border-t border-white/10 flex flex-wrap items-center justify-between gap-3 text-xs text-neutral-300/80">
            <span className="inline-flex items-center gap-1.5">
              <ShieldCheck className="w-4 h-4 text-emerald-400" />
              100% verified order rewards
            </span>
            <span className="hidden sm:inline w-1 h-1 rounded-full bg-white/20" />
            <span>Earn +25 Beans after every completed order review</span>
          </div>
        </motion.section>

        {/* 3-Card Earning & Redemption Guide */}
        <section aria-label="Earning and Redemption Rules" className="space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="text-sm sm:text-base font-bold text-on-surface flex items-center gap-2">
              <Info className="w-4 h-4 text-primary" />
              How Beans Work
            </h2>
            <span className="text-xs text-on-surface-variant font-medium">Simple & Transparent</span>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3.5">
            {EARNING_RULES.map((rule, idx) => {
              const IconComp = rule.icon;
              return (
                <motion.div
                  key={rule.badge}
                  initial={{ opacity: 0, y: 12 }}
                  whileInView={{ opacity: 1, y: 0 }}
                  viewport={{ once: true }}
                  transition={{ duration: 0.35, delay: idx * 0.08 }}
                  className="rounded-2xl border border-outline-variant/15 bg-surface-container-low/80 p-4 space-y-3 hover:border-primary/30 transition-all hover:-translate-y-0.5 shadow-sm"
                >
                  <div className="flex items-center justify-between">
                    <span
                      className={`px-2.5 py-0.5 rounded-full text-[10px] font-black uppercase tracking-wider border ${rule.badgeColor}`}
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
                    {rule.detail}
                  </p>
                </motion.div>
              );
            })}
          </div>
        </section>

        {/* Current Public Offers */}
        <section id="available-offers" className="space-y-4 scroll-mt-24">
          <div className="flex items-center justify-between pb-1 border-b border-outline-variant/15">
            <div className="flex items-center gap-2">
              <Flame className="w-5 h-5 text-primary" />
              <h2 className="text-lg font-extrabold text-on-surface">Active Cafe Offers</h2>
            </div>
            <span className="px-2.5 py-0.5 rounded-full bg-surface-container-high border border-outline-variant/20 text-xs font-bold text-on-surface-variant">
              {currentOffers.length} Deals Active
            </span>
          </div>

          {currentOffers.length === 0 ? (
            <div className="p-8 rounded-2xl border border-outline-variant/15 bg-surface-container-low text-center space-y-2">
              <Coffee className="w-8 h-8 text-on-surface-variant/50 mx-auto" />
              <h3 className="text-sm font-bold text-on-surface">No active public offers right now</h3>
              <p className="text-xs text-on-surface-variant">
                Our baristas are brewing fresh seasonal deals. Check back soon!
              </p>
            </div>
          ) : (
            <div className="space-y-3">
              {currentOffers.map((campaign, idx) => renderOfferCard(campaign, idx, false))}
            </div>
          )}
        </section>

        {/* Personalized & Member Offers */}
        <section className="space-y-4">
          <div className="flex items-center justify-between pb-1 border-b border-outline-variant/15">
            <div className="flex items-center gap-2">
              <Gift className="w-5 h-5 text-violet-400" />
              <h2 className="text-lg font-extrabold text-on-surface">Member Special Offers</h2>
            </div>
            {personalizedOffers.length > 0 && (
              <span className="px-2.5 py-0.5 rounded-full bg-violet-500/10 border border-violet-500/25 text-xs font-bold text-violet-300">
                {personalizedOffers.length} Exclusive
              </span>
            )}
          </div>

          {personalizedOffers.length > 0 ? (
            <div className="space-y-3">
              {personalizedOffers.map((campaign, idx) => renderOfferCard(campaign, idx, true))}
            </div>
          ) : hasMatchedCustomerProfile ? (
            <div className="p-6 rounded-2xl border border-violet-400/20 bg-violet-950/20 backdrop-blur-md flex items-center gap-4">
              <div className="w-10 h-10 rounded-xl bg-violet-500/15 border border-violet-500/30 flex items-center justify-center shrink-0">
                <ShieldCheck className="w-5 h-5 text-violet-300" />
              </div>
              <div className="space-y-1">
                <h3 className="text-sm font-bold text-on-surface">You're an Active Club Member</h3>
                <p className="text-xs text-on-surface-variant leading-relaxed">
                  Your account is verified! Tailored segment promotions will appear right here when your frequent visit threshold is reached.
                </p>
              </div>
            </div>
          ) : (
            <div className="p-5 sm:p-6 rounded-2xl border border-violet-400/25 bg-gradient-to-r from-violet-950/30 via-neutral-900/60 to-neutral-900/40 backdrop-blur-md flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
              <div className="space-y-1.5 max-w-lg">
                <div className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[10px] font-extrabold uppercase tracking-wider bg-violet-500/20 text-violet-300 border border-violet-500/30">
                  VIP Club Access
                </div>
                <h3 className="text-base font-bold text-on-surface">Unlock Your Custom Member Mix</h3>
                <p className="text-xs text-on-surface-variant leading-relaxed">
                  Verify your mobile number in your Customer Profile to link past visits, track loyalty tiers, and unlock exclusive discounts.
                </p>
              </div>

              <button
                type="button"
                onClick={onNavigateProfile}
                className="inline-flex items-center gap-1.5 px-4 py-2.5 rounded-xl bg-violet-500 hover:bg-violet-600 text-white text-xs font-bold shadow-md shadow-violet-950/40 transition-all active:scale-95 shrink-0 cursor-pointer"
              >
                <span>Verify Profile</span>
                <ArrowRight className="w-3.5 h-3.5" />
              </button>
            </div>
          )}
        </section>
      </div>
    </MotionConfig>
  );
};
