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
import { isCampaignAutomaticallyRedeemable } from '../utils/cafeLogic';
import { BlurFade } from '@/components/ui/blur-fade';
import { NumberTicker } from '@/components/ui/number-ticker';
import { ShimmerButton } from '@/components/ui/shimmer-button';
import { CardSpotlight } from '@/components/ui/card-spotlight';

export interface CustomerRewardsScreenProps {
  points: number;
  campaigns: PromoCampaign[];
  initialTab?: 'offers' | 'rewards';
  hasMatchedCustomerProfile?: boolean;
  onRedeemCoupon: (code: string) => void;
  onNavigateProfile?: () => void;
  onBrowseMenu?: () => void;
  onNavigateCart?: () => void;
  onNotify?: (message: string) => void;
}

type OfferFilter = 'all' | 'beverage' | 'food' | 'exclusive';

const PERK_RULES = [
  {
    icon: Sparkles,
    badge: 'EARN',
    badgeClass: 'text-emerald-400 bg-emerald-500/100/10 border-emerald-500/25',
    spotlight: 'rgba(52, 211, 153, 0.12)',
    title: '+25 Beans',
    subtitle: 'Per Verified Review',
    desc: 'Rate any served order from tracking to immediately credit your wallet.',
  },
  {
    icon: Coins,
    badge: 'REDEEM',
    badgeClass: 'text-amber-400 bg-amber-500/100/10 border-amber-500/25',
    spotlight: 'rgba(251, 191, 36, 0.12)',
    title: '2 Beans = ₹1',
    subtitle: 'Instant Cash Credit',
    desc: 'Redeem stored balance for up to 50% off your active order total.',
  },
  {
    icon: Zap,
    badge: 'STACK',
    badgeClass: 'text-orange-400 bg-primary/100/10 border-orange-500/25',
    spotlight: 'rgba(255, 100, 34, 0.12)',
    title: 'Double Savings',
    subtitle: 'Coupons + Beans',
    desc: 'Apply promotional campaign codes alongside Beans at checkout.',
  },
];

export const CustomerRewardsScreen: React.FC<CustomerRewardsScreenProps> = ({
  points,
  campaigns,
  initialTab = 'offers',
  hasMatchedCustomerProfile,
  onRedeemCoupon,
  onNavigateProfile,
  onBrowseMenu,
  onNavigateCart,
  onNotify,
}) => {
  const [copiedCode, setCopiedCode] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<OfferFilter>('all');
  const [mainTab, setMainTab] = useState<'offers' | 'rewards'>(initialTab);
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
    if (typeof navigator === 'undefined' || !navigator.clipboard) {
      onNotify?.('Coupon copying is not available in this browser.');
      return;
    }
    void navigator.clipboard.writeText(code).then(
      () => {
        setCopiedCode(code);
        window.setTimeout(() => {
          setCopiedCode((curr) => (curr === code ? null : curr));
        }, 2500);
      },
      (error: unknown) => {
        console.error('Could not copy coupon code:', error);
        onNotify?.('Could not copy coupon code.');
      }
    );
  };

  const scrollToOffers = () => {
    const el = document.getElementById('available-offers');
    if (el) {
      el.scrollIntoView({ behavior: 'smooth' });
    }
  };

  return (
    <MotionConfig reducedMotion="user">
      <div className="mx-auto flex w-full max-w-2xl flex-col gap-4 px-3 py-3 sm:px-6 sm:py-5 pb-28 text-on-surface">
        {/* Navigation Bar / Page Header (Panels 12 & 13) */}
        <div className="flex items-center justify-between pb-1">
          {onBrowseMenu ? (
            <button
              type="button"
              onClick={onBrowseMenu}
              aria-label="Back"
              className="w-9 h-9 rounded-full bg-surface-container-low border border-outline-variant flex items-center justify-center text-on-surface shadow-xs hover:bg-surface-container-high transition-colors cursor-pointer"
            >
              <span className="material-symbols-outlined text-[20px]">arrow_back</span>
            </button>
          ) : (
            <div className="w-9" />
          )}

          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-full overflow-hidden border border-[#D4AF37]/60 shadow-xs bg-black p-0.5 shrink-0">
              <img src="/images/tsc-logo.jpg" alt="The Sawariya Cafe" className="w-full h-full object-cover rounded-full" />
            </div>
            <h1 className="text-base sm:text-lg font-bold text-on-surface tracking-tight font-serif">
              {mainTab === 'offers' ? 'Offers & Rewards' : 'My Rewards'}
            </h1>
          </div>

          <div className="w-9" />
        </div>

        {/* Segmented Switcher (Offers | Rewards) */}
        <div className="w-full max-w-xs mx-auto p-1 rounded-2xl bg-surface-container-low border border-outline-variant shadow-xs flex">
          <button
            type="button"
            onClick={() => setMainTab('offers')}
            className={`flex-1 py-2 rounded-xl text-xs font-bold transition-all cursor-pointer ${
              mainTab === 'offers'
                ? 'bg-primary text-white shadow-xs'
                : 'text-on-surface-variant hover:text-on-surface'
            }`}
          >
            Offers
          </button>
          <button
            type="button"
            onClick={() => setMainTab('rewards')}
            className={`flex-1 py-2 rounded-xl text-xs font-bold transition-all cursor-pointer ${
              mainTab === 'rewards'
                ? 'bg-primary text-white shadow-xs'
                : 'text-on-surface-variant hover:text-on-surface'
            }`}
          >
            Rewards
          </button>
        </div>

        {mainTab === 'offers' ? (
          /* ========================================================
             PANEL 12: OFFERS VIEW
             ======================================================== */
          <div className="space-y-3 pt-1">
            {/* Featured Offer 1: Birthday Party – ₹800 */}
            <div
              onClick={() => {
                const campaign = activeCampaigns.find((item) =>
                  /BDAY800|birthday/i.test(`${item.code} ${item.title}`)
                );
                if (campaign) onRedeemCoupon(campaign.code);
                else onRedeemCoupon('BDAY800');
              }}
              className="p-4 rounded-2xl bg-surface-container-low border border-amber-500/25 shadow-xs flex items-center justify-between gap-3 cursor-pointer hover:shadow-sm transition-all group"
            >
              <div className="flex items-center gap-3">
                <div className="w-12 h-12 rounded-full bg-amber-500/10 border border-amber-500/25 flex items-center justify-center text-amber-600 font-black text-xl shrink-0">
                  <span className="material-symbols-outlined text-[24px]">cake</span>
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <h3 className="font-bold text-sm text-on-surface">Birthday Party – ₹800</h3>
                    <span className="text-[10px] font-bold text-amber-700 bg-amber-500/15 px-2 py-0.5 rounded-full">
                      1.5h Dining
                    </span>
                  </div>
                  <p className="text-xs text-on-surface-variant mt-0.5">
                    Order ₹800+ and celebrate with 90 mins reserved seating
                  </p>
                </div>
              </div>
              <span className="material-symbols-outlined text-[20px] text-on-surface-variant group-hover:text-primary group-hover:translate-x-0.5 transition-all">
                chevron_right
              </span>
            </div>

            {/* Featured Offer 2: Buy 5, Get 1 Free Cold Coffee */}
            <div
              onClick={() => {
                const campaign = activeCampaigns.find((item) =>
                  /BUY5GET1|coffee/i.test(`${item.code} ${item.title}`)
                );
                if (campaign) onRedeemCoupon(campaign.code);
                else onRedeemCoupon('BUY5GET1');
              }}
              className="p-4 rounded-2xl bg-surface-container-low border border-primary/25 shadow-xs flex items-center justify-between gap-3 cursor-pointer hover:shadow-sm transition-all group"
            >
              <div className="flex items-center gap-3">
                <div className="w-12 h-12 rounded-full bg-primary/10 border border-primary/25 flex items-center justify-center text-primary shrink-0">
                  <span className="material-symbols-outlined text-[24px]">local_cafe</span>
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <h3 className="font-bold text-sm text-on-surface">Buy 5, Get 1 Free</h3>
                    <span className="text-[10px] font-bold text-primary bg-primary/15 px-2 py-0.5 rounded-full">
                      ₹30 Free
                    </span>
                  </div>
                  <p className="text-xs text-on-surface-variant mt-0.5">
                    Buy 5 Med Cold Coffees, get 1 Small Cold Coffee free
                  </p>
                </div>
              </div>
              <span className="material-symbols-outlined text-[20px] text-on-surface-variant group-hover:text-primary group-hover:translate-x-0.5 transition-all">
                chevron_right
              </span>
            </div>

            {/* Featured Offer 3: Free Ice Cream on Social Review */}
            <div
              onClick={() => {
                const campaign = activeCampaigns.find((item) =>
                  /FREEICECREAM|icecream/i.test(`${item.code} ${item.title}`)
                );
                if (campaign) onRedeemCoupon(campaign.code);
                else onRedeemCoupon('FREEICECREAM');
              }}
              className="p-4 rounded-2xl bg-surface-container-low border border-rose-500/25 shadow-xs flex items-center justify-between gap-3 cursor-pointer hover:shadow-sm transition-all group"
            >
              <div className="flex items-center gap-3">
                <div className="w-12 h-12 rounded-full bg-rose-500/10 border border-rose-500/25 flex items-center justify-center text-rose-600 shrink-0">
                  <span className="material-symbols-outlined text-[24px]">icecream</span>
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <h3 className="font-bold text-sm text-on-surface">Free Cup of Ice Cream</h3>
                    <span className="text-[10px] font-bold text-rose-700 bg-rose-500/15 px-2 py-0.5 rounded-full">
                      Instagram & Review
                    </span>
                  </div>
                  <p className="text-xs text-on-surface-variant mt-0.5">
                    Follow @the_sawariya_cafe & drop a review to claim!
                  </p>
                </div>
              </div>
              <span className="material-symbols-outlined text-[20px] text-on-surface-variant group-hover:text-primary group-hover:translate-x-0.5 transition-all">
                chevron_right
              </span>
            </div>

            {/* Featured Offer 4: Free Delivery Up to 1 KM */}
            <div
              onClick={() => {
                const campaign = activeCampaigns.find((item) =>
                  /FREEDEL249|free.?del/i.test(`${item.code} ${item.title}`)
                );
                if (campaign) onRedeemCoupon(campaign.code);
                else onRedeemCoupon('FREEDEL249');
              }}
              className="p-4 rounded-2xl bg-surface-container-low border border-emerald-500/25 shadow-xs flex items-center justify-between gap-3 cursor-pointer hover:shadow-sm transition-all group"
            >
              <div className="flex items-center gap-3">
                <div className="w-12 h-12 rounded-full bg-emerald-500/10 border border-emerald-500/25 flex items-center justify-center text-emerald-600 shrink-0">
                  <span className="material-symbols-outlined text-[24px]">two_wheeler</span>
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <h3 className="font-bold text-sm text-on-surface">Free Delivery (Up to 1 KM)</h3>
                    <span className="text-[10px] font-bold text-emerald-700 bg-emerald-500/15 px-2 py-0.5 rounded-full">
                      Orders ₹249+
                    </span>
                  </div>
                  <p className="text-xs text-on-surface-variant mt-0.5">
                    Prepared fresh in 10–15 mins and delivered fast
                  </p>
                </div>
              </div>
              <span className="material-symbols-outlined text-[20px] text-on-surface-variant group-hover:text-primary group-hover:translate-x-0.5 transition-all">
                chevron_right
              </span>
            </div>

            {/* Featured Offer 5: Customized Combos */}
            <div
              onClick={onBrowseMenu}
              className="p-4 rounded-2xl bg-surface-container-low border border-indigo-500/25 shadow-xs flex items-center justify-between gap-3 cursor-pointer hover:shadow-sm transition-all group"
            >
              <div className="flex items-center gap-3">
                <div className="w-12 h-12 rounded-full bg-indigo-500/10 border border-indigo-500/25 flex items-center justify-center text-indigo-600 shrink-0">
                  <span className="material-symbols-outlined text-[24px]">tune</span>
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <h3 className="font-bold text-sm text-on-surface">Customized Combos</h3>
                    <span className="text-[10px] font-bold text-indigo-700 bg-indigo-500/15 px-2 py-0.5 rounded-full">
                      On Request
                    </span>
                  </div>
                  <p className="text-xs text-on-surface-variant mt-0.5">
                    Ask reception/server or WhatsApp 7300348070 for custom party combos
                  </p>
                </div>
              </div>
              <span className="material-symbols-outlined text-[20px] text-on-surface-variant group-hover:text-primary group-hover:translate-x-0.5 transition-all">
                chevron_right
              </span>
            </div>

            {/* Available Vouchers / Promo Codes Header */}
            {activeCampaigns.length > 0 && (
              <div className="pt-3 space-y-2.5">
                <h2 className="text-xs font-bold uppercase tracking-wider text-on-surface-variant">
                  All Available Coupons ({activeCampaigns.length})
                </h2>
                {activeCampaigns.map((camp) => (
                  <div
                    key={camp.id}
                    className="p-3.5 rounded-2xl bg-surface-container-low border border-outline-variant shadow-xs flex items-center justify-between gap-3"
                  >
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="px-2 py-0.5 rounded-md bg-primary/10 text-primary font-mono text-xs font-black">
                          {camp.code}
                        </span>
                        <span className="text-xs font-bold text-on-surface">
                          {camp.title}
                        </span>
                      </div>
                      <p className="text-[11px] text-on-surface-variant mt-1">
                        {camp.description || 'Valid on all orders'}
                      </p>
                      {camp.minimumOrderAmount ? (
                        <p className="text-[10px] font-semibold text-on-surface-variant mt-1">
                          Minimum order ₹{camp.minimumOrderAmount.toLocaleString('en-IN')}
                        </p>
                      ) : null}
                    </div>

                    <button
                      type="button"
                      onClick={() => {
                        if (isCampaignAutomaticallyRedeemable(camp)) onRedeemCoupon(camp.code);
                      }}
                      disabled={!isCampaignAutomaticallyRedeemable(camp)}
                      className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all shrink-0 ${
                        isCampaignAutomaticallyRedeemable(camp)
                          ? 'bg-primary text-white hover:brightness-90 active:scale-95 cursor-pointer'
                          : 'bg-surface-container text-on-surface-variant cursor-default'
                      }`}
                    >
                      {isCampaignAutomaticallyRedeemable(camp) ? 'Apply' : 'At cafe'}
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        ) : (
          /* ========================================================
             PANEL 13: REWARDS VIEW
             ======================================================== */
          <div className="space-y-4 pt-1">
            {/* The Sawariya Club Card */}
            <div className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-[#FDF8F3] via-[#FAF3EC] to-[#F5EBE1] border border-outline-variant p-6 text-center shadow-xs">
              <span className="material-symbols-outlined absolute -right-4 -bottom-4 text-[130px] text-primary/5 pointer-events-none select-none">
                crown
              </span>

              <h2 className="font-serif font-black text-lg text-on-surface">
                The Sawariya Club
              </h2>
              <p className="text-xs text-on-surface-variant mt-0.5">
                Dine • Order • Earn • Redeem
              </p>

              <div className="py-4">
                <span className="font-serif font-black text-5xl text-on-surface tracking-tight block">
                  {availableBeans}
                </span>
                <span className="text-xs font-bold text-on-surface-variant tracking-wider uppercase mt-1 block">
                  Reward Points
                </span>
              </div>
            </div>

            {/* 3 Action Pills (Panel 13) */}
            <div className="grid grid-cols-3 gap-1.5 sm:gap-2">
              <button
                type="button"
                onClick={onBrowseMenu}
                className="p-2 sm:p-3 rounded-2xl bg-surface-container-low border border-outline-variant shadow-xs flex flex-col items-center gap-1 sm:gap-1.5 hover:bg-surface-container transition-colors cursor-pointer min-w-0"
              >
                <div className="w-7 h-7 sm:w-8 sm:h-8 rounded-full bg-surface-container-high flex items-center justify-center text-primary shrink-0">
                  <span className="material-symbols-outlined text-[16px] sm:text-[18px]">add_circle</span>
                </div>
                <span className="text-[10px] sm:text-[11px] font-bold text-on-surface truncate max-w-full">Earn Points</span>
              </button>

              <button
                type="button"
                onClick={onNavigateCart}
                className="p-2 sm:p-3 rounded-2xl bg-surface-container-low border border-outline-variant shadow-xs flex flex-col items-center gap-1 sm:gap-1.5 hover:bg-surface-container transition-colors cursor-pointer min-w-0"
              >
                <div className="w-7 h-7 sm:w-8 sm:h-8 rounded-full bg-surface-container-high flex items-center justify-center text-primary shrink-0">
                  <span className="material-symbols-outlined text-[16px] sm:text-[18px]">shopping_bag</span>
                </div>
                <span className="text-[10px] sm:text-[11px] font-bold text-on-surface truncate max-w-full">Redeem</span>
              </button>

              <button
                type="button"
                onClick={() => setMainTab('offers')}
                className="p-2 sm:p-3 rounded-2xl bg-surface-container-low border border-outline-variant shadow-xs flex flex-col items-center gap-1 sm:gap-1.5 hover:bg-surface-container transition-colors cursor-pointer min-w-0"
              >
                <div className="w-7 h-7 sm:w-8 sm:h-8 rounded-full bg-surface-container-high flex items-center justify-center text-primary shrink-0">
                  <span className="material-symbols-outlined text-[16px] sm:text-[18px]">stars</span>
                </div>
                <span className="text-[10px] sm:text-[11px] font-bold text-on-surface truncate max-w-full">Benefits</span>
              </button>
            </div>

            {/* Next Reward Card (Panel 13) */}
            <div className="p-4 rounded-2xl bg-surface-container-low border border-outline-variant shadow-xs space-y-2">
              <span className="text-xs font-bold text-on-surface block">Next Reward</span>
              <p className="text-xs text-on-surface-variant">
                Get ₹100 off at 1,000 points
              </p>

              <div className="h-2 w-full rounded-full bg-surface-container-high overflow-hidden">
                <div
                  className="h-full rounded-full bg-[#C67C4E]"
                  style={{
                    width: `${Math.min(100, Math.round((availableBeans / 1000) * 100))}%`,
                  }}
                />
              </div>

              <div className="flex justify-end text-[10px] font-bold text-on-surface-variant">
                <span>{availableBeans} / 1,000</span>
              </div>
            </div>

            {/* How Beans Work */}
            <div className="p-4 rounded-2xl bg-surface-container-low border border-outline-variant shadow-xs space-y-2">
              <h3 className="text-xs font-bold text-on-surface">How Loyalty Points Work</h3>
              <ul className="text-xs text-on-surface-variant space-y-1.5">
                <li className="flex items-center gap-2">
                  <span className="w-1.5 h-1.5 rounded-full bg-primary" />
                  <span>Earn 25 points on every verified order review</span>
                </li>
                <li className="flex items-center gap-2">
                  <span className="w-1.5 h-1.5 rounded-full bg-primary" />
                  <span>2 Points = ₹1 instant discount at checkout</span>
                </li>
                <li className="flex items-center gap-2">
                  <span className="w-1.5 h-1.5 rounded-full bg-primary" />
                  <span>Stack coupons and reward points together anytime</span>
                </li>
              </ul>
            </div>
          </div>
        )}
      </div>
    </MotionConfig>
  );
};
