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
            <span className="text-on-surface-variant text-[11px]">• Live on POS &amp; QR</span>
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
                className="flex flex-col justify-between p-4 rounded-xl bg-surface-container-low shadow-md relative overflow-hidden"
              >
                <div>
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex items-center gap-2.5 min-w-0">
                      <div
                        className={`w-10 h-10 rounded-lg bg-surface-container-high flex items-center justify-center shrink-0 ${iconColor}`}
                      >
                        <span className="material-symbols-outlined text-[22px]">{camp.icon}</span>
                      </div>
                      <div className="flex flex-col min-w-0">
                        <h2 className="text-sm font-bold text-on-surface truncate">{camp.title}</h2>
                        <div className="flex items-center gap-1.5 mt-0.5 flex-wrap">
                          <span
                            className={`px-1.5 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider ${statusMeta.badgeClass}`}
                          >
                            {camp.status}
                          </span>
                          <span className="text-on-surface-variant text-xs">
                            • {camp.validityLabel}
                          </span>
                        </div>
                      </div>
                    </div>

                    <div className="flex items-center gap-1 px-2.5 py-1 rounded-lg bg-surface-container-highest text-primary font-mono text-xs font-bold tracking-wider shrink-0">
                      <span className="material-symbols-outlined text-[13px]">sell</span>
                      <span>{camp.code}</span>
                    </div>
                  </div>

                  <p className="mt-2.5 text-xs text-on-surface-variant leading-relaxed">
                    {camp.description}
                  </p>
                </div>

                <div className="mt-4 pt-2.5 flex items-center justify-between bg-surface-container/60 -mx-4 -mb-4 px-4 py-2.5">
                  <div className="flex items-center gap-2.5 text-xs">
                    <span className="text-on-surface font-semibold flex items-center gap-1">
                      <span
                        className={`material-symbols-outlined text-[15px] ${statusMeta.metricColor}`}
                      >
                        {statusMeta.metricIcon}
                      </span>
                      {camp.usedLabel}
                    </span>
                    {camp.revenueLabel && (
                      <>
                        <span className="text-on-surface-variant">•</span>
                        <span className={`${iconColor} font-semibold tabular-nums`}>
                          {camp.revenueLabel}
                        </span>
                      </>
                    )}
                  </div>

                  <div className="flex items-center gap-1">
                    <button
                      type="button"
                      aria-label={`Share ${camp.title}`}
                      onClick={() => onNotify(`Copied promo ${camp.code} share link`)}
                      className="w-8 h-8 rounded flex items-center justify-center text-on-surface-variant hover:text-on-surface hover:bg-surface-container-high cursor-pointer"
                    >
                      <span className="material-symbols-outlined text-[16px]">share</span>
                    </button>
                    <button
                      type="button"
                      aria-label={`Toggle ${camp.title}`}
                      onClick={() => onToggleCampaignStatus(camp.id)}
                      className="px-2 py-1 rounded text-[11px] font-semibold text-primary hover:bg-surface-container-high cursor-pointer"
                    >
                      {statusMeta.actionLabel}
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Marketing Channels */}
      <div className="space-y-2.5 pt-1">
        <div className="flex items-center justify-between">
          <span className="text-base text-on-surface font-bold">Marketing Channels</span>
          <span className="text-xs text-on-surface-variant">Instant Blast</span>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-2.5">
          <div className="flex items-center justify-between p-3.5 rounded-xl bg-surface-container hover:bg-surface-container-high transition-colors">
            <div className="flex items-center gap-3 min-w-0">
              <div className="w-10 h-10 rounded-lg bg-tertiary-container/20 text-tertiary flex items-center justify-center shrink-0">
                <span className="material-symbols-outlined text-[22px]">chat</span>
              </div>
              <div className="flex flex-col min-w-0">
                <span className="text-sm font-bold text-on-surface truncate">
                  Send WhatsApp Broadcast
                </span>
                <span className="text-xs text-on-surface-variant truncate">
                  Reach 1,240 opt-in cafe patrons
                </span>
              </div>
            </div>
            <button
              type="button"
              onClick={() => onNotify('WhatsApp campaign queued for 1,240 patrons')}
              className="shrink-0 px-3.5 py-2 rounded-lg bg-tertiary-container/30 text-tertiary text-xs font-bold hover:bg-tertiary-container/50 active:scale-95 transition-all cursor-pointer"
            >
              Send
            </button>
          </div>

          <div className="flex items-center justify-between p-3.5 rounded-xl bg-surface-container hover:bg-surface-container-high transition-colors">
            <div className="flex items-center gap-3 min-w-0">
              <div className="w-10 h-10 rounded-lg bg-primary-container/20 text-primary-container flex items-center justify-center shrink-0">
                <span className="material-symbols-outlined text-[22px]">aspect_ratio</span>
              </div>
              <div className="flex flex-col min-w-0">
                <span className="text-sm font-bold text-on-surface truncate">
                  Banner Promotion Preview
                </span>
                <span className="text-xs text-on-surface-variant truncate">
                  Customer App &amp; Table QR Header
                </span>
              </div>
            </div>
            <button
              type="button"
              onClick={() => onNotify('Banner promo active on Customer Home & Table QR header')}
              className="shrink-0 px-3.5 py-2 rounded-lg bg-surface-container-highest text-on-surface text-xs font-semibold hover:bg-surface-bright active:scale-95 transition-all cursor-pointer"
            >
              Preview
            </button>
          </div>
        </div>
      </div>

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
