import React from 'react';
import { PromoCampaign } from '../types/cafe';

interface CustomerRewardsScreenProps {
  points: number;
  campaigns: PromoCampaign[];
  onRedeemCoupon: (code: string) => void;
}

export const CustomerRewardsScreen: React.FC<CustomerRewardsScreenProps> = ({
  points,
  campaigns,
  onRedeemCoupon,
}) => {
  const activeCampaigns = campaigns.filter((campaign) => campaign.status === 'active');

  return (
    <div className="flex flex-col w-full pb-8 gap-4">
      <div className="pt-1 flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-on-surface">Rewards</h1>
          <p className="text-xs text-on-surface-variant">Your available loyalty points and current offers</p>
        </div>
      </div>

      {/* Points Hero Card */}
      <div className="rounded-2xl bg-gradient-to-br from-surface-container-high to-surface-container-low p-5 shadow-lg relative overflow-hidden">
        <div className="absolute -right-8 -top-8 w-32 h-32 rounded-full bg-primary-container/15 blur-2xl pointer-events-none" />
        <div>
          <span className="text-xs text-on-surface-variant uppercase tracking-wider font-medium">
            Available points
          </span>
          <div className="text-3xl font-bold text-primary mt-1 tabular-nums">{points}</div>
        </div>
      </div>

      <section className="space-y-3">
        <h2 className="text-base font-bold text-on-surface">Active offers</h2>
        {activeCampaigns.length === 0 ? (
          <p className="rounded-xl bg-surface-container p-4 text-sm text-on-surface-variant">
            No active offers right now.
          </p>
        ) : activeCampaigns.map((campaign) => (
          <div key={campaign.id} className="p-4 rounded-xl bg-surface-container flex items-center justify-between gap-3">
            <div className="min-w-0">
              <h3 className="text-sm font-bold text-on-surface">{campaign.title}</h3>
              <p className="mt-1 text-xs text-on-surface-variant">{campaign.description}</p>
              <p className="mt-1 text-xs font-semibold text-primary">
                {campaign.code} · {campaign.validityLabel}
              </p>
            </div>
            <button
              type="button"
              onClick={() => onRedeemCoupon(campaign.code)}
              className="px-3.5 py-2 rounded-lg bg-primary-container text-on-primary-container text-xs font-bold shrink-0 cursor-pointer"
            >
              Apply
            </button>
          </div>
        ))}
      </section>
    </div>
  );
};
