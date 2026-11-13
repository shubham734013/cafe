import React from 'react';
import { MENU_ITEMS } from '../data/cafeSeedData';
import { MenuItem } from '../types/cafe';

interface CustomerRewardsScreenProps {
  points: number;
  onRedeemCoupon: (code: string) => void;
  onAddRewardItem: (item: MenuItem) => void;
}

export const CustomerRewardsScreen: React.FC<CustomerRewardsScreenProps> = ({
  points,
  onRedeemCoupon,
  onAddRewardItem,
}) => {
  const coldCoffee = MENU_ITEMS.find((i) => i.id === 'cold-coffee')!;

  return (
    <div className="flex flex-col w-full pb-8 gap-4">
      <div className="pt-1 flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-on-surface">Sawariya Rewards</h1>
          <p className="text-xs text-on-surface-variant">
            Earn 10 beans on every ₹100 brewed
          </p>
        </div>
        <span className="px-3 py-1 rounded-full bg-primary-container/20 text-primary text-xs font-bold">
          Gold Roaster Tier
        </span>
      </div>

      {/* Points Hero Card */}
      <div className="rounded-2xl bg-gradient-to-br from-surface-container-high to-surface-container-low p-5 shadow-lg relative overflow-hidden">
        <div className="absolute -right-8 -top-8 w-32 h-32 rounded-full bg-primary-container/15 blur-2xl pointer-events-none" />
        <div className="flex items-center justify-between">
          <div>
            <span className="text-xs text-on-surface-variant uppercase tracking-wider font-medium">
              Available Cafe Beans
            </span>
            <div className="text-3xl font-bold text-primary mt-1 tabular-nums">{points} Beans</div>
          </div>
          <div className="w-12 h-12 rounded-xl bg-primary-container/20 flex items-center justify-center text-primary">
            <span className="material-symbols-outlined icon-filled text-[28px]">loyalty</span>
          </div>
        </div>
        <div className="mt-4">
          <div className="flex justify-between text-[11px] text-on-surface-variant mb-1">
            <span>Progress to Free Artisanal Shake</span>
            <span className="text-tertiary font-semibold tabular-nums">{points} / 500</span>
          </div>
          <div className="w-full h-2 rounded-full bg-surface-container-highest overflow-hidden">
            <div
              className="h-full bg-gradient-to-r from-primary to-tertiary rounded-full transition-all"
              style={{ width: `${Math.min(100, Math.round((points / 500) * 100))}%` }}
            />
          </div>
        </div>
      </div>

      {/* Redeemable Perks */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div className="p-4 rounded-xl bg-surface-container flex items-center justify-between gap-3">
          <div>
            <span className="text-xs font-bold text-tertiary uppercase">Flat ₹50 Off</span>
            <h2 className="text-base font-bold text-on-surface mt-0.5">Code: CAFE50</h2>
            <p className="text-xs text-on-surface-variant mt-0.5">Valid on orders ₹200 &amp; above</p>
          </div>
          <button
            type="button"
            onClick={() => onRedeemCoupon('CAFE50')}
            className="px-3.5 py-2 rounded-lg bg-primary-container text-on-primary-container text-xs font-bold shrink-0 cursor-pointer"
          >
            Apply in Cart
          </button>
        </div>

        <div className="p-4 rounded-xl bg-surface-container flex items-center justify-between gap-3">
          <div>
            <span className="text-xs font-bold text-primary uppercase">Member Perk</span>
            <h2 className="text-base font-bold text-on-surface mt-0.5">10% Off (SAW10)</h2>
            <p className="text-xs text-on-surface-variant mt-0.5">Instant 10% discount on any item</p>
          </div>
          <button
            type="button"
            onClick={() => onRedeemCoupon('SAW10')}
            className="px-3.5 py-2 rounded-lg bg-surface-container-high hover:bg-surface-bright text-primary text-xs font-bold shrink-0 cursor-pointer"
          >
            Apply in Cart
          </button>
        </div>
      </div>

      <div className="p-4 rounded-xl bg-surface-container-low flex items-center justify-between">
        <div>
          <h3 className="text-sm font-bold text-on-surface">Quick Reorder Favorite</h3>
          <p className="text-xs text-on-surface-variant">Classic Cold Coffee · ₹129</p>
        </div>
        <button
          type="button"
          onClick={() => onAddRewardItem(coldCoffee)}
          className="px-4 py-2 rounded-lg bg-primary text-on-primary text-xs font-bold cursor-pointer"
        >
          Add to Cart
        </button>
      </div>
    </div>
  );
};
