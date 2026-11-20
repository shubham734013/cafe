import React, { useMemo, useState } from 'react';
import { zodResolver } from '@hookform/resolvers/zod';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { CAFE_ASSETS } from '../data/cafeSeedData';
import { createCampaignSchema } from '../shared/schemas';
import { CampaignFilter, PromoCampaign } from '../types/cafe';
import { filterCampaigns, formatINR } from '../utils/cafeLogic';
import { CafeImage } from './CafeImage';

function parseMetricInt(value?: string): number {
  if (!value) return 0;
  const match = value.replace(/,/g, '').match(/\d+/);
  return match ? Number.parseInt(match[0], 10) : 0;
}

interface OffersCampaignsScreenProps {
  campaigns: PromoCampaign[];
  onCreateCampaign: (campaign: Omit<PromoCampaign, 'id'>) => void;
  onToggleCampaignStatus: (id: string) => void;
  onNotify: (msg: string) => void;
}

type CreateCampaignValues = z.input<typeof createCampaignSchema>;

export const OffersCampaignsScreen: React.FC<OffersCampaignsScreenProps> = ({
  campaigns,
  onCreateCampaign,
  onToggleCampaignStatus,
  onNotify,
}) => {
  const [filter, setFilter] = useState<CampaignFilter>('all');
  const [modalOpen, setModalOpen] = useState(false);

  const form = useForm<CreateCampaignValues>({
    resolver: zodResolver(createCampaignSchema),
    defaultValues: {
      title: '',
      code: '',
      validityLabel: 'Till 28 Feb',
      description: 'Live across POS billing terminal and customer QR menu checkout.',
      targetSegment: 'all',
    },
  });

  const counts = useMemo(() => {
    const active = campaigns.filter((c) => c.status === 'active').length;
    const paused = campaigns.filter((c) => c.status === 'paused').length;
    const scheduled = campaigns.filter((c) => c.status === 'scheduled').length;
    const expired = campaigns.filter((c) => c.status === 'expired').length;
    const totalRevenue = campaigns.reduce((s, c) => s + parseMetricInt(c.revenueLabel), 0);
    const totalClaims = campaigns.reduce((s, c) => s + parseMetricInt(c.usedLabel), 0);
    return {
      all: campaigns.length,
      active,
      paused,
      scheduled,
      expired,
      totalRevenue,
      totalClaims,
    };
  }, [campaigns]);

  const visibleCampaigns = useMemo(
    () => filterCampaigns(campaigns, filter),
    [campaigns, filter]
  );

  const handleOpenCreate = () => {
    form.reset({
      title: '',
      code: '',
      validityLabel: 'Till 28 Feb',
      description: 'Live across POS billing terminal and customer QR menu checkout.',
      targetSegment: 'all',
    });
    setModalOpen(true);
  };

  const handleCreate = form.handleSubmit((values) => {
    const parsed = createCampaignSchema.parse(values);
    onCreateCampaign({
      title: parsed.title,
      code: parsed.code,
      status: 'active',
      validityLabel: parsed.validityLabel,
      description: parsed.description,
      targetSegment: parsed.targetSegment,
      usedLabel: '0 used',
      revenueLabel: '₹0 revenue',
      icon: 'sell',
      tone: 'primary',
    });
    setModalOpen(false);
  });

  return (
    <div className="flex flex-col w-full pb-6 space-y-4">
      {/* Header Action & Overview Bar */}
      <div className="flex items-center justify-between gap-2 pt-1">
        <div className="flex flex-col min-w-0">
          <h1 className="text-xl font-bold text-on-surface tracking-tight truncate">
            Offers &amp; Campaigns
          </h1>
          <div className="flex items-center gap-1.5 mt-0.5 flex-wrap">
            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-tertiary-container/20 text-tertiary text-[11px] font-semibold">
              <span className="w-1.5 h-1.5 rounded-full bg-tertiary animate-pulse" />
              {counts.active} Active Promos
            </span>
          </div>
        </div>

        <button
          type="button"
          onClick={handleOpenCreate}
          className="shrink-0 flex items-center justify-center gap-1.5 px-3.5 py-2.5 rounded-lg bg-primary-container text-on-primary-container text-xs font-bold shadow-md shadow-primary-container/20 active:scale-95 transition-transform cursor-pointer"
        >
          <span className="material-symbols-outlined text-[18px]">add_circle</span>
          <span>Create</span>
        </button>
      </div>

      {/* Performance Highlights + Visual Anchor */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-3 items-stretch">
        <div className="lg:col-span-7 grid grid-cols-2 gap-2.5">
          <div className="flex flex-col justify-between p-3.5 rounded-xl bg-surface-container shadow-sm relative overflow-hidden">
            <div className="absolute -right-3 -bottom-3 w-16 h-16 rounded-full bg-primary-container/10 blur-xl pointer-events-none" />
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs text-on-surface-variant">Campaign Revenue</span>
              <div className="w-7 h-7 rounded-lg bg-surface-container-high flex items-center justify-center text-primary">
                <span className="material-symbols-outlined text-[16px]">currency_rupee</span>
              </div>
            </div>
            <div className="text-2xl font-bold text-on-surface tracking-tight tabular-nums">
              {formatINR(counts.totalRevenue)}
            </div>
            <div className="flex items-center gap-1 mt-1 text-tertiary text-xs font-medium">
              <span className="material-symbols-outlined text-[14px]">trending_up</span>
              <span>{counts.active} active promos</span>
            </div>
          </div>

          <div className="flex flex-col justify-between p-3.5 rounded-xl bg-surface-container shadow-sm relative overflow-hidden">
            <div className="absolute -right-3 -bottom-3 w-16 h-16 rounded-full bg-secondary-container/10 blur-xl pointer-events-none" />
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs text-on-surface-variant">Total Claims</span>
              <div className="w-7 h-7 rounded-lg bg-surface-container-high flex items-center justify-center text-secondary">
                <span className="material-symbols-outlined text-[16px]">confirmation_number</span>
              </div>
            </div>
            <div className="text-2xl font-bold text-on-surface tracking-tight tabular-nums">
              {counts.totalClaims.toLocaleString('en-IN')}
            </div>
            <div className="flex items-center gap-1 mt-1 text-on-surface-variant text-xs">
              <span className="material-symbols-outlined text-[14px]">check_circle</span>
              <span>Redemptions</span>
            </div>
          </div>
        </div>

        {/* Evening Rush Booster Banner */}
        <div className="lg:col-span-5 rounded-xl overflow-hidden bg-surface-container-low shadow-sm relative min-h-[112px]">
          <CafeImage
            src={CAFE_ASSETS.campaignBanner}
            alt="Seth Sawariya Cafe evening espresso bar mood"
            className="absolute inset-0 w-full h-full object-cover"
          />
          <div className="absolute inset-0 bg-gradient-to-t from-surface-container-low via-surface-container-low/65 to-transparent" />
          <div className="relative h-full flex items-end justify-between p-3.5 gap-2">
            <div className="flex items-center gap-2">
              <span className="material-symbols-outlined text-primary text-[20px]">storefront</span>
              <span className="text-xs font-bold text-on-surface">Evening Rush Booster</span>
            </div>
            <span className="text-[11px] text-primary-fixed-dim bg-surface-container-lowest/85 px-2 py-0.5 rounded font-medium">
              Smart Auto-Apply
            </span>
          </div>
        </div>
      </div>

      {/* Filter Pills */}
      <div className="flex items-center gap-2 overflow-x-auto pb-0.5 no-scrollbar">
        {(
          [
            { id: 'all', label: `All (${counts.all})` },
            { id: 'active', label: `Active (${counts.active})` },
            { id: 'paused', label: `Paused (${counts.paused})` },
            { id: 'scheduled', label: `Scheduled (${counts.scheduled})` },
            { id: 'expired', label: `Expired (${counts.expired})` },
          ] as { id: CampaignFilter; label: string }[]
        ).map((pill) => {
          const active = filter === pill.id;
          return (
            <button
              key={pill.id}
              type="button"
              onClick={() => setFilter(pill.id)}
              className={`px-3.5 py-1.5 rounded-full text-xs shrink-0 transition-colors cursor-pointer ${
                active
                  ? 'bg-primary-container text-on-primary-container font-bold shadow-sm'
                  : 'bg-surface-container-high text-on-surface-variant hover:text-on-surface hover:bg-surface-variant font-medium'
              }`}
            >
              {pill.label}
            </button>
          );
        })}
      </div>

      {/* Live Promotions Header */}
      <div className="flex items-center justify-between">
        <span className="text-base text-on-surface font-bold">Live Promotions</span>
        <button
          type="button"
          onClick={() => onNotify('All offers active on billing counter & table QR codes')}
          className="text-xs text-primary flex items-center gap-1 font-medium cursor-pointer"
        >
          <span>Auto-sync enabled</span>
          <span className="material-symbols-outlined text-[14px]">sync</span>
        </button>
      </div>

      {/* Campaign Cards Grid */}
      {visibleCampaigns.length === 0 ? (
        <div className="p-8 rounded-xl bg-surface-container-low text-center space-y-2">
          <span className="material-symbols-outlined text-[28px] text-outline">campaign</span>
          <p className="text-sm font-semibold text-on-surface">
            No {filter} campaigns right now
          </p>
          <p className="text-xs text-on-surface-variant">
            Switch filter pills or create a new promotional offer.
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {visibleCampaigns.map((camp) => {
            const statusMeta = {
              active: {
                badgeClass: 'bg-tertiary-container/20 text-tertiary',
                metricIcon: 'check_circle',
                metricColor: 'text-tertiary',
                actionLabel: 'Pause',
              },
              paused: {
                badgeClass: 'bg-amber-500/20 text-amber-400 border border-amber-500/30',
                metricIcon: 'pause_circle',
                metricColor: 'text-amber-400',
                actionLabel: 'Resume',
              },
              scheduled: {
                badgeClass: 'bg-primary-container/20 text-primary-container',
                metricIcon: 'event',
                metricColor: 'text-primary-container',
                actionLabel: 'Activate',
              },
              expired: {
                badgeClass: 'bg-surface-container-highest text-outline',
                metricIcon: 'history',
                metricColor: 'text-outline',
                actionLabel: 'Reactivate',
              },
            }[camp.status];
            const iconColor =
              camp.tone === 'tertiary'
                ? 'text-tertiary'
                : camp.tone === 'secondary'
                  ? 'text-secondary'
                  : 'text-primary';

            return (
              <div
                key={camp.id}
                className="relative overflow-hidden flex flex-col justify-between p-4 sm:p-5 rounded-3xl liquid-glass-card shadow-2xl transition-all space-y-4 border border-white/[0.08]"
              >
                {camp.status === 'active' && (
                  <div className="absolute -right-8 -top-8 w-24 h-24 bg-primary/15 rounded-full blur-xl pointer-events-none" />
                )}

                {/* Header Row: Avatar + Title & Promo Code + Action Buttons */}
                <div className="flex items-center justify-between gap-2.5 relative">
                  <div className="flex items-center gap-3 min-w-0 flex-1">
                    <div
                      className={`relative w-12 h-12 rounded-full flex items-center justify-center text-sm font-black shrink-0 shadow-md ${
                        camp.tone === 'tertiary'
                          ? 'bg-gradient-to-tr from-tertiary/30 to-tertiary/10 text-tertiary border border-tertiary/40'
                          : camp.tone === 'secondary'
                            ? 'bg-gradient-to-tr from-secondary/30 to-secondary/10 text-secondary border border-secondary/40'
                            : 'bg-gradient-to-tr from-primary/30 to-primary/10 text-primary border border-primary/40'
                      }`}
                    >
                      <span className="material-symbols-outlined text-[22px]">{camp.icon}</span>
                      {camp.status === 'active' && (
                        <span className="absolute -bottom-0.5 -right-0.5 w-3.5 h-3.5 rounded-full border-2 border-background flex items-center justify-center bg-emerald-500" />
                      )}
                    </div>

                    <div className="flex flex-col min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="text-sm sm:text-base text-on-surface font-extrabold truncate tracking-tight">
                          {camp.title}
                        </span>
                        <span
                          className={`px-2.5 py-0.5 rounded-full text-[10px] font-black tracking-wider uppercase shrink-0 ${statusMeta.badgeClass}`}
                        >
                          {camp.status}
                        </span>
                      </div>
                      <div className="flex items-center gap-1.5 text-on-surface-variant/80 text-xs sm:text-sm mt-0.5 font-mono font-bold tracking-wider text-primary">
                        <span className="material-symbols-outlined text-[15px] shrink-0">
                          sell
                        </span>
                        <span>{camp.code}</span>
                      </div>
                    </div>
                  </div>

                  {/* Action Icon Buttons */}
                  <div className="flex items-center gap-2 shrink-0">
                    <button
                      type="button"
                      aria-label={`Share ${camp.title}`}
                      onClick={() => onNotify(`Copied promo ${camp.code} share link`)}
                      className="w-10 h-10 rounded-2xl bg-surface-container-high/80 border border-white/[0.08] flex items-center justify-center text-on-surface-variant hover:text-primary active:scale-95 transition-all cursor-pointer shadow-sm hover:border-primary/40"
                      title="Share Promo Code"
                    >
                      <span className="material-symbols-outlined text-[18px]">share</span>
                    </button>
                    <button
                      type="button"
                      aria-label={`Toggle ${camp.title}`}
                      onClick={() => onToggleCampaignStatus(camp.id)}
                      className={`w-10 h-10 rounded-2xl border flex items-center justify-center active:scale-95 transition-all cursor-pointer shadow-sm ${
                        camp.status === 'active'
                          ? 'bg-amber-500/15 border-amber-500/30 text-amber-300 hover:bg-amber-500/25'
                          : 'bg-emerald-500/15 border-emerald-500/30 text-emerald-400 hover:bg-emerald-500/25'
                      }`}
                      title={statusMeta.actionLabel}
                    >
                      <span className="material-symbols-outlined text-[18px]">
                        {camp.status === 'active' ? 'pause' : 'play_arrow'}
                      </span>
                    </button>
                  </div>
                </div>

                {/* Middle Metrics Inset Card */}
                <div className="grid grid-cols-3 gap-2 py-3 px-4 rounded-2xl bg-black/40 backdrop-blur-md border border-white/[0.05] text-center items-center shadow-inner">
                  <div className="flex flex-col">
                    <span className="text-[11px] text-on-surface-variant/70 font-semibold mb-0.5">Redemptions</span>
                    <span className="text-xs sm:text-sm md:text-base text-on-surface font-black tabular-nums tracking-tight">
                      {camp.usedLabel}
                    </span>
                  </div>
                  <div className="flex flex-col">
                    <span className="text-[11px] text-on-surface-variant/70 font-semibold mb-0.5">Impact</span>
                    <span className="text-xs sm:text-sm md:text-base text-[#f59e0b] dark:text-[#fbbf24] font-black tabular-nums tracking-tight">
                      {camp.revenueLabel || 'Active Promo'}
                    </span>
                  </div>
                  <div className="flex flex-col">
                    <span className="text-[11px] text-on-surface-variant/70 font-semibold mb-0.5">Target</span>
                    <span className="text-xs sm:text-sm md:text-base text-on-surface font-black tabular-nums tracking-tight uppercase">
                      {camp.targetSegment && camp.targetSegment !== 'all' ? camp.targetSegment : 'ALL'}
                    </span>
                  </div>
                </div>

                {/* Campaign Description Note */}
                <p className="text-xs text-on-surface-variant/80 leading-relaxed line-clamp-2 px-0.5">
                  {camp.description}
                </p>

                {/* Footer Row: Validity & Status */}
                <div className="flex items-center justify-between gap-3 text-xs sm:text-sm pt-0.5">
                  <div className="flex items-center gap-1.5 min-w-0">
                    <span className="material-symbols-outlined text-[18px] text-primary shrink-0">
                      verified
                    </span>
                    <span className="text-xs text-on-surface-variant/80 font-medium truncate">
                      {camp.validityLabel}
                    </span>
                  </div>
                  <div className="flex items-center gap-1 text-on-surface-variant/70 text-xs shrink-0 font-medium">
                    <span className="material-symbols-outlined text-[15px]">schedule</span>
                    <span>{camp.status === 'active' ? 'Active' : 'Inactive'}</span>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}


      {/* Create Campaign Dialog */}
      <Dialog open={modalOpen} onOpenChange={setModalOpen}>
        <DialogContent className="bg-surface-container border border-outline-variant/30 text-on-surface sm:max-w-md rounded-2xl p-5">
          <DialogHeader>
            <DialogTitle className="text-lg font-bold text-on-surface">
              Create Promo Campaign
            </DialogTitle>
            <DialogDescription className="text-xs text-on-surface-variant">
              Launch an offer across POS counter checkout and QR table ordering.
            </DialogDescription>
          </DialogHeader>

          <form onSubmit={handleCreate} className="space-y-4">
            <div className="space-y-3">
              <div>
                <label className="block text-xs font-semibold text-on-surface-variant mb-1">
                  Campaign Title
                </label>
                <input
                  type="text"
                  {...form.register('title')}
                  placeholder="Campaign title"
                  className="w-full px-3 py-2.5 rounded-lg bg-surface-container-low text-on-surface text-sm focus:outline-none focus:ring-1 focus:ring-primary"
                />
                {form.formState.errors.title && (
                  <p className="text-[11px] text-error mt-1">
                    {form.formState.errors.title.message}
                  </p>
                )}
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block text-xs font-semibold text-on-surface-variant mb-1">
                    Promo Code
                  </label>
                  <input
                    type="text"
                    {...form.register('code')}
                    placeholder="LATTE20"
                    className="w-full px-3 py-2.5 rounded-lg bg-surface-container-low text-on-surface text-sm uppercase focus:outline-none focus:ring-1 focus:ring-primary"
                  />
                  {form.formState.errors.code && (
                    <p className="text-[11px] text-error mt-1">
                      {form.formState.errors.code.message}
                    </p>
                  )}
                </div>
                <div>
                  <label className="block text-xs font-semibold text-on-surface-variant mb-1">
                    Validity Window
                  </label>
                  <input
                    type="text"
                    {...form.register('validityLabel')}
                    className="w-full px-3 py-2.5 rounded-lg bg-surface-container-low text-on-surface text-sm focus:outline-none focus:ring-1 focus:ring-primary"
                  />
                  {form.formState.errors.validityLabel && (
                    <p className="text-[11px] text-error mt-1">
                      {form.formState.errors.validityLabel.message}
                    </p>
                  )}
                </div>
              </div>
              <div>
                <label className="block text-xs font-semibold text-on-surface-variant mb-1">
                  Offer Rule Summary
                </label>
                <input
                  type="text"
                  {...form.register('description')}
                  placeholder="Offer description"
                  className="w-full px-3 py-2.5 rounded-lg bg-surface-container-low text-on-surface text-sm focus:outline-none focus:ring-1 focus:ring-primary"
                />
                {form.formState.errors.description && (
                  <p className="text-[11px] text-error mt-1">
                    {form.formState.errors.description.message}
                  </p>
                )}
              </div>
              <div>
                <label className="block text-xs font-semibold text-on-surface-variant mb-1">
                  Customer Group
                </label>
                <select
                  {...form.register('targetSegment')}
                  className="w-full px-3 py-2.5 rounded-lg bg-surface-container-low text-on-surface text-sm focus:outline-none focus:ring-1 focus:ring-primary"
                >
                  <option value="all">All customers</option>
                  <option value="vip">VIP</option>
                  <option value="loyal">Loyal</option>
                  <option value="regular">Regular</option>
                  <option value="new">New</option>
                  <option value="risk">At Risk</option>
                </select>
                <p className="mt-1 text-[11px] text-on-surface-variant">
                  Segment offers appear only to customers whose verified phone matches a CRM profile.
                </p>
              </div>
            </div>

            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => setModalOpen(false)}
                className="flex-1 py-2.5 rounded-lg bg-surface-container-high text-on-surface text-sm font-semibold cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="submit"
                className="flex-1 py-2.5 rounded-lg bg-primary-container text-on-primary text-sm font-bold cursor-pointer"
              >
                Launch Promo
              </button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
};
