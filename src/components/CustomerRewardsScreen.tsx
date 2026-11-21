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
      <div className="mx-auto flex w-full max-w-2xl flex-col gap-4 px-3 py-3 sm:px-6 sm:py-5 pb-28 text-[#1F1610]">
        {/* Navigation Bar / Page Header (Panels 12 & 13) */}
        <div className="flex items-center justify-between pb-1">
          {onBrowseMenu ? (
            <button
              type="button"
              onClick={onBrowseMenu}
              aria-label="Back"
              className="w-9 h-9 rounded-full bg-white border border-[#EAE2D7] flex items-center justify-center text-[#1F1610] shadow-xs hover:bg-[#F5EFE8] transition-colors cursor-pointer"
            >
              <span className="material-symbols-outlined text-[20px]">arrow_back</span>
            </button>
          ) : (
            <div className="w-9" />
          )}

          <h1 className="text-base sm:text-lg font-bold text-[#1F1610] tracking-tight font-serif">
            {mainTab === 'offers' ? 'Offers & Rewards' : 'My Rewards'}
          </h1>

          <div className="w-9" />
        </div>

        {/* Segmented Switcher (Offers | Rewards) */}
        <div className="w-full max-w-xs mx-auto p-1 rounded-2xl bg-white border border-[#EAE2D7] shadow-xs flex">
          <button
            type="button"
            onClick={() => setMainTab('offers')}
            className={`flex-1 py-2 rounded-xl text-xs font-bold transition-all cursor-pointer ${
              mainTab === 'offers'
                ? 'bg-[#382319] text-white shadow-xs'
                : 'text-[#7A7067] hover:text-[#1F1610]'
            }`}
          >
            Offers
          </button>
          <button
            type="button"
            onClick={() => setMainTab('rewards')}
            className={`flex-1 py-2 rounded-xl text-xs font-bold transition-all cursor-pointer ${
              mainTab === 'rewards'
                ? 'bg-[#382319] text-white shadow-xs'
                : 'text-[#7A7067] hover:text-[#1F1610]'
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
            {/* Featured Offer 1: Flat 20% Off */}
            <div
              onClick={() => {
                const campaign = activeCampaigns.find((item) =>
                  /20|welcome|first/i.test(`${item.code} ${item.title}`)
                );
                if (campaign) onRedeemCoupon(campaign.code);
                else onNotify?.('No 20% off offer is active right now.');
              }}
              className="p-4 rounded-2xl bg-white border border-[#EAE2D7] shadow-xs flex items-center justify-between gap-3 cursor-pointer hover:shadow-sm transition-all group"
            >
              <div className="flex items-center gap-3">
                <div className="w-12 h-12 rounded-full bg-amber-50 border border-amber-200 flex items-center justify-center text-amber-700 font-black text-xl shrink-0">
                  %
                </div>
                <div>
                  <h3 className="font-bold text-sm text-[#1F1610]">Flat 20% Off</h3>
                  <p className="text-xs text-[#7A7067] mt-0.5">On orders above ₹399</p>
                </div>
              </div>
              <span className="material-symbols-outlined text-[20px] text-[#8C7E74] group-hover:text-[#382319] group-hover:translate-x-0.5 transition-all">
                chevron_right
              </span>
            </div>

            {/* Featured Offer 2: Free Delivery */}
            <div
              onClick={() => {
                const campaign = activeCampaigns.find((item) =>
                  /free.?delivery/i.test(`${item.code} ${item.title} ${item.description || ''}`)
                );
                if (campaign) onRedeemCoupon(campaign.code);
                else onNotify?.('No free delivery offer is active right now.');
              }}
              className="p-4 rounded-2xl bg-white border border-[#EAE2D7] shadow-xs flex items-center justify-between gap-3 cursor-pointer hover:shadow-sm transition-all group"
            >
              <div className="flex items-center gap-3">
                <div className="w-12 h-12 rounded-full bg-orange-50 border border-orange-200 flex items-center justify-center text-orange-700 shrink-0">
                  <span className="material-symbols-outlined text-[24px]">two_wheeler</span>
                </div>
                <div>
                  <h3 className="font-bold text-sm text-[#1F1610]">Free Delivery</h3>
                  <p className="text-xs text-[#7A7067] mt-0.5">On your first 3 orders</p>
                </div>
              </div>
              <span className="material-symbols-outlined text-[20px] text-[#8C7E74] group-hover:text-[#382319] group-hover:translate-x-0.5 transition-all">
                chevron_right
              </span>
            </div>

            {/* Featured Offer 3: Combo Offers */}
            <div
              onClick={onBrowseMenu}
              className="p-4 rounded-2xl bg-white border border-[#EAE2D7] shadow-xs flex items-center justify-between gap-3 cursor-pointer hover:shadow-sm transition-all group"
            >
              <div className="flex items-center gap-3">
                <div className="w-12 h-12 rounded-full bg-rose-50 border border-rose-200 flex items-center justify-center text-rose-700 shrink-0">
                  <span className="material-symbols-outlined text-[24px]">lunch_dining</span>
                </div>
                <div>
                  <h3 className="font-bold text-sm text-[#1F1610]">Combo Offers</h3>
                  <p className="text-xs text-[#7A7067] mt-0.5">Save up to 30%</p>
                </div>
              </div>
              <span className="material-symbols-outlined text-[20px] text-[#8C7E74] group-hover:text-[#382319] group-hover:translate-x-0.5 transition-all">
                chevron_right
              </span>
            </div>

            {/* Available Vouchers / Promo Codes Header */}
            {activeCampaigns.length > 0 && (
              <div className="pt-3 space-y-2.5">
                <h2 className="text-xs font-bold uppercase tracking-wider text-[#7A7067]">
                  All Available Coupons ({activeCampaigns.length})
                </h2>
                {activeCampaigns.map((camp) => (
                  <div
                    key={camp.id}
                    className="p-3.5 rounded-2xl bg-white border border-[#EAE2D7] shadow-xs flex items-center justify-between gap-3"
                  >
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="px-2 py-0.5 rounded-md bg-[#382319]/10 text-[#382319] font-mono text-xs font-black">
                          {camp.code}
                        </span>
                        <span className="text-xs font-bold text-[#1F1610]">
                          {camp.title}
                        </span>
                      </div>
                      <p className="text-[11px] text-[#7A7067] mt-1">
                        {camp.description || 'Valid on all orders'}
                      </p>
                    </div>

                    <button
                      type="button"
                      onClick={() => onRedeemCoupon(camp.code)}
                      className="px-3 py-1.5 rounded-xl bg-[#382319] text-white text-xs font-bold hover:bg-[#2B1B13] active:scale-95 transition-all cursor-pointer shrink-0"
                    >
                      Apply
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
            <div className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-[#FDF8F3] via-[#FAF3EC] to-[#F5EBE1] border border-[#EAE2D7] p-6 text-center shadow-xs">
              <span className="material-symbols-outlined absolute -right-4 -bottom-4 text-[130px] text-[#382319]/5 pointer-events-none select-none">
                crown
              </span>

              <h2 className="font-serif font-black text-lg text-[#1F1610]">
                The Sawariya Club
              </h2>
              <p className="text-xs text-[#7A7067] mt-0.5">
                Dine • Order • Earn • Redeem
              </p>

              <div className="py-4">
                <span className="font-serif font-black text-5xl text-[#1F1610] tracking-tight block">
                  {availableBeans}
                </span>
                <span className="text-xs font-bold text-[#7A7067] tracking-wider uppercase mt-1 block">
                  Reward Points
                </span>
              </div>
            </div>

            {/* 3 Action Pills (Panel 13) */}
            <div className="grid grid-cols-3 gap-2">
              <button
                type="button"
                onClick={onBrowseMenu}
                className="p-3 rounded-2xl bg-white border border-[#EAE2D7] shadow-xs flex flex-col items-center gap-1.5 hover:bg-[#FAF7F2] transition-colors cursor-pointer"
              >
                <div className="w-8 h-8 rounded-full bg-[#F5EFE8] flex items-center justify-center text-[#382319]">
                  <span className="material-symbols-outlined text-[18px]">add_circle</span>
                </div>
                <span className="text-[11px] font-bold text-[#1F1610]">Earn Points</span>
              </button>

              <button
                type="button"
                onClick={onNavigateCart}
                className="p-3 rounded-2xl bg-white border border-[#EAE2D7] shadow-xs flex flex-col items-center gap-1.5 hover:bg-[#FAF7F2] transition-colors cursor-pointer"
              >
                <div className="w-8 h-8 rounded-full bg-[#F5EFE8] flex items-center justify-center text-[#382319]">
                  <span className="material-symbols-outlined text-[18px]">shopping_bag</span>
                </div>
                <span className="text-[11px] font-bold text-[#1F1610]">Redeem Rewards</span>
              </button>

              <button
                type="button"
                onClick={() => setMainTab('offers')}
                className="p-3 rounded-2xl bg-white border border-[#EAE2D7] shadow-xs flex flex-col items-center gap-1.5 hover:bg-[#FAF7F2] transition-colors cursor-pointer"
              >
                <div className="w-8 h-8 rounded-full bg-[#F5EFE8] flex items-center justify-center text-[#382319]">
                  <span className="material-symbols-outlined text-[18px]">stars</span>
                </div>
                <span className="text-[11px] font-bold text-[#1F1610]">My Benefits</span>
              </button>
            </div>

            {/* Next Reward Card (Panel 13) */}
            <div className="p-4 rounded-2xl bg-white border border-[#EAE2D7] shadow-xs space-y-2">
              <span className="text-xs font-bold text-[#1F1610] block">Next Reward</span>
              <p className="text-xs text-[#7A7067]">
                Get ₹100 off at 1,000 points
              </p>

              <div className="h-2 w-full rounded-full bg-[#F5EFE8] overflow-hidden">
                <div
                  className="h-full rounded-full bg-[#C67C4E]"
                  style={{
                    width: `${Math.min(100, Math.round((availableBeans / 1000) * 100))}%`,
                  }}
                />
              </div>

              <div className="flex justify-end text-[10px] font-bold text-[#8C7E74]">
                <span>{availableBeans} / 1,000</span>
              </div>
            </div>

            {/* How Beans Work */}
            <div className="p-4 rounded-2xl bg-white border border-[#EAE2D7] shadow-xs space-y-2">
              <h3 className="text-xs font-bold text-[#1F1610]">How Loyalty Points Work</h3>
              <ul className="text-xs text-[#7A7067] space-y-1.5">
                <li className="flex items-center gap-2">
                  <span className="w-1.5 h-1.5 rounded-full bg-[#382319]" />
                  <span>Earn 25 points on every verified order review</span>
                </li>
                <li className="flex items-center gap-2">
                  <span className="w-1.5 h-1.5 rounded-full bg-[#382319]" />
                  <span>2 Points = ₹1 instant discount at checkout</span>
                </li>
                <li className="flex items-center gap-2">
                  <span className="w-1.5 h-1.5 rounded-full bg-[#382319]" />
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
