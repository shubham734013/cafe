import React from 'react';
import { PromoCampaign } from '../types/cafe';
import { CustomerCard, CustomerPage, CustomerText } from './CustomerMotion';

interface CustomerRewardsScreenProps {
  points: number;
  campaigns: PromoCampaign[];
  hasMatchedCustomerProfile: boolean;
  onRedeemCoupon: (code: string) => void;
}

export const CustomerRewardsScreen: React.FC<CustomerRewardsScreenProps> = ({
  points,
  campaigns,
  hasMatchedCustomerProfile,
  onRedeemCoupon,
}) => {
  const activeCampaigns = campaigns.filter((campaign) => campaign.status === 'active');
  const currentOffers = activeCampaigns.filter(
    (campaign) => !campaign.targetSegment || campaign.targetSegment === 'all'
  );
  const personalizedOffers = activeCampaigns.filter(
    (campaign) => campaign.targetSegment && campaign.targetSegment !== 'all'
  );

  const renderOffer = (campaign: PromoCampaign, personalized = false, delay = 0) => (
    <CustomerCard
      key={campaign.id}
      delay={delay}
      className="rounded-xl bg-surface-container p-4 flex items-center justify-between gap-3"
    >
      <div className="min-w-0">
        <h3 className="text-sm font-bold text-on-surface">{campaign.title}</h3>
        <p className="mt-1 text-xs text-on-surface-variant">{campaign.description}</p>
        <p className="mt-1 text-xs font-semibold text-primary">
          {campaign.code} · {campaign.validityLabel}
        </p>
        {personalized && (
          <span className="mt-2 inline-flex rounded-full bg-primary-container/10 px-2 py-0.5 text-[10px] font-semibold text-primary">
            For your customer group
          </span>
        )}
      </div>
      <button
        type="button"
        onClick={() => onRedeemCoupon(campaign.code)}
        className="shrink-0 rounded-lg bg-primary-container px-3.5 py-2 text-xs font-bold text-on-primary-container"
      >
        Apply
      </button>
    </CustomerCard>
  );

  return (
    <CustomerPage className="flex flex-col w-full pb-8 gap-4">
      <div className="pt-1 flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-on-surface">
            <CustomerText>Beans &amp; Offers</CustomerText>
          </h1>
          <p className="text-xs text-on-surface-variant">Earn Beans with order reviews and use them on future orders.</p>
        </div>
      </div>

      <CustomerCard className="rounded-2xl bg-gradient-to-br from-surface-container-high to-surface-container-low p-5 shadow-lg relative overflow-hidden">
        <div className="absolute -right-8 -top-8 w-32 h-32 rounded-full bg-primary-container/15 blur-2xl pointer-events-none" />
        <div>
          <span className="text-xs text-on-surface-variant uppercase tracking-wider font-medium">
            Available Beans
          </span>
          <div className="text-3xl font-bold text-primary mt-1 tabular-nums">{points}</div>
        </div>
      </CustomerCard>

      <CustomerCard delay={0.06} className="rounded-xl bg-surface-container p-4 text-sm text-on-surface-variant">
        Rate each served order to earn 25 Beans. Every 2 Beans gives ₹1 off, up to 50% of your
        order subtotal.
      </CustomerCard>

      <section className="space-y-3">
        <h2 className="text-base font-bold text-on-surface">Current offers</h2>
        {currentOffers.length === 0 ? (
          <p className="rounded-xl bg-surface-container p-4 text-sm text-on-surface-variant">
            No active offers right now.
          </p>
        ) : (
          <div className="space-y-2">
            {currentOffers.map((campaign, index) => renderOffer(campaign, false, index * 0.06))}
          </div>
        )}
      </section>

      <section className="space-y-3">
        <h2 className="text-base font-bold text-on-surface">Personalized offers</h2>
        {personalizedOffers.length === 0 ? (
          <p className="rounded-xl bg-surface-container p-4 text-sm text-on-surface-variant">
            {hasMatchedCustomerProfile
              ? 'No segment-specific offers are active for your customer group right now.'
              : 'Verify your phone in Account and match it with a cafe customer profile to see offers assigned to your group.'}
          </p>
        ) : (
          <div className="space-y-2">
            {personalizedOffers.map((campaign, index) =>
              renderOffer(campaign, true, index * 0.06)
            )}
          </div>
        )}
      </section>
    </CustomerPage>
  );
};
