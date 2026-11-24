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
import { addLoyaltyRuleSchema } from '../shared/schemas';
import { LoyaltyRule, PointLedgerEntry } from '../types/cafe';
import { formatINR } from '../utils/cafeLogic';

interface LoyaltyRewardsAdminScreenProps {
  rules: LoyaltyRule[];
  ledger: PointLedgerEntry[];
  customersCount?: number;
  rewardPoints?: number;
  onAddRule: (rule: Omit<LoyaltyRule, 'id'>) => void;
  onExportLedger: () => void;
  onNotify: (msg: string) => void;
}

type AddRuleValues = z.input<typeof addLoyaltyRuleSchema>;

export const LoyaltyRewardsAdminScreen: React.FC<LoyaltyRewardsAdminScreenProps> = ({
  rules,
  ledger,
  customersCount,
  rewardPoints,
  onAddRule,
  onExportLedger,
  onNotify,
}) => {
  const [ruleModalOpen, setRuleModalOpen] = useState(false);

  const loyaltyKpis = useMemo(() => {
    const pointsIssued = ledger
      .filter((l) => l.pointsDelta > 0)
      .reduce((s, l) => s + l.pointsDelta, 0);
    const redemptions = ledger
      .filter((l) => l.pointsDelta < 0)
      .reduce((s, l) => s + Math.abs(l.pointsDelta), 0);
    const activePointsPool = Math.max(0, rewardPoints ?? pointsIssued - redemptions);
    const totalMembers = customersCount ?? new Set(ledger.map((l) => l.customerName)).size;
    return {
      totalMembers,
      pointsIssued,
      redemptions,
      activeCreditPoolInr: Math.round(activePointsPool * 0.1),
    };
  }, [customersCount, ledger, rewardPoints]);

  const form = useForm<AddRuleValues>({
    resolver: zodResolver(addLoyaltyRuleSchema),
    defaultValues: {
      title: '',
      headline: '',
      badge: '+150 Pts',
      description: 'Valid on orders placed at counter or table QR.',
    },
  });

  const handleOpenModal = () => {
    form.reset({
      title: '',
      headline: '',
      badge: '+150 Pts',
      description: 'Valid on orders placed at counter or table QR.',
    });
    setRuleModalOpen(true);
  };

  const handleSaveRule = form.handleSubmit((values) => {
    const parsed = addLoyaltyRuleSchema.parse(values);
    onAddRule({
      title: parsed.title,
      headline: parsed.headline,
      badge: parsed.badge,
      description: parsed.description,
      icon: 'stars',
      tone: 'primary',
    });
    setRuleModalOpen(false);
  });

  return (
    <div className="flex flex-col w-full pb-6 space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between pt-1">
        <div className="flex flex-col min-w-0 pr-2">
          <h1 className="text-xl font-bold text-on-surface tracking-tight truncate">
            Loyalty &amp; Rewards
          </h1>
          <p className="text-xs text-on-surface-variant truncate">
            Points program, tier benefits &amp; redemptions
          </p>
        </div>
        <button
          type="button"
          onClick={handleOpenModal}
          className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg bg-primary-container text-on-primary text-xs font-bold shadow-md active:scale-95 transition-transform shrink-0 cursor-pointer"
        >
          <span className="material-symbols-outlined text-[18px]">add_circle</span>
          <span>New Rule</span>
        </button>
      </div>

      {/* KPI Strip (2x2 on mobile, 4-col on desktop) */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-2.5">
        <div className="p-3.5 rounded-xl bg-surface-container shadow-sm flex flex-col justify-between min-w-0">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs text-on-surface-variant font-medium">Total Members</span>
            <span className="w-7 h-7 rounded-lg bg-surface-container-high flex items-center justify-center text-primary shrink-0">
              <span className="material-symbols-outlined text-[16px]">groups</span>
            </span>
          </div>
          <div className="flex items-baseline justify-between gap-1">
            <span className="text-2xl font-bold text-on-surface tabular-nums">
              {loyaltyKpis.totalMembers.toLocaleString('en-IN')}
            </span>
            <span className="inline-flex items-center text-[11px] font-semibold text-tertiary shrink-0">
              <span className="material-symbols-outlined text-[13px] mr-0.5">trending_up</span>Active
            </span>
          </div>
        </div>

        <div className="p-3.5 rounded-xl bg-surface-container shadow-sm flex flex-col justify-between min-w-0">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs text-on-surface-variant font-medium">Points Issued</span>
            <span className="w-7 h-7 rounded-lg bg-surface-container-high flex items-center justify-center text-primary-fixed-dim shrink-0">
              <span className="material-symbols-outlined text-[16px] icon-filled">stars</span>
            </span>
          </div>
          <div className="flex items-baseline justify-between gap-1">
            <span className="text-2xl font-bold text-primary-fixed-dim tabular-nums">
              {loyaltyKpis.pointsIssued.toLocaleString('en-IN')}
            </span>
            <span className="text-[11px] text-on-surface-variant">Total given</span>
          </div>
        </div>

        <div className="p-3.5 rounded-xl bg-surface-container shadow-sm flex flex-col justify-between min-w-0">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs text-on-surface-variant font-medium">Redemptions</span>
            <span className="w-7 h-7 rounded-lg bg-surface-container-high flex items-center justify-center text-secondary shrink-0">
              <span className="material-symbols-outlined text-[16px]">redeem</span>
            </span>
          </div>
          <div className="flex items-baseline justify-between gap-1">
            <span className="text-2xl font-bold text-on-surface tabular-nums">
              {loyaltyKpis.redemptions.toLocaleString('en-IN')}
            </span>
            <span className="text-[11px] text-on-surface-variant">pts used</span>
          </div>
        </div>

        <div className="p-3.5 rounded-xl bg-surface-container shadow-sm flex flex-col justify-between min-w-0">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs text-on-surface-variant font-medium">Active Value</span>
            <span className="w-7 h-7 rounded-lg bg-surface-container-high flex items-center justify-center text-tertiary shrink-0">
              <span className="material-symbols-outlined text-[16px]">
                account_balance_wallet
              </span>
            </span>
          </div>
          <div className="flex items-baseline justify-between gap-1">
            <span className="text-2xl font-bold text-tertiary tabular-nums">
              {formatINR(loyaltyKpis.activeCreditPoolInr)}
            </span>
            <span className="text-[11px] text-on-surface-variant">points value</span>
          </div>
        </div>
      </div>

      {/* Program Rules + Tiers */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 items-start">
        {/* Program Rules */}
        <div className="lg:col-span-7 flex flex-col space-y-2.5">
          <div className="flex items-center justify-between px-0.5">
            <div className="flex items-center gap-1.5">
              <span className="material-symbols-outlined text-primary text-[18px]">
                rule_settings
              </span>
              <h2 className="text-base text-on-surface font-semibold">Program Rules</h2>
            </div>
            <button
              type="button"
              onClick={() => setRuleModalOpen(true)}
              className="text-primary text-xs font-semibold hover:underline cursor-pointer"
            >
              Add / Edit Rules
            </button>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
            {rules.map((rule) => {
              const toneStyle =
                rule.tone === 'tertiary'
                  ? { icon: 'text-tertiary', badge: 'bg-tertiary-container/20 text-tertiary' }
                  : rule.tone === 'secondary'
                    ? { icon: 'text-secondary', badge: 'bg-secondary-container/20 text-secondary' }
                    : rule.tone === 'amber'
                      ? { icon: 'text-primary-fixed-dim', badge: 'bg-primary/20 text-primary' }
                      : {
                          icon: 'text-primary-container',
                          badge: 'bg-primary-container/20 text-primary-container',
                        };
              return (
                <div key={rule.id} className="p-3.5 rounded-xl bg-surface-container flex items-start gap-3">
                  <div
                    className={`w-9 h-9 rounded-lg bg-surface-container-high flex items-center justify-center shrink-0 mt-0.5 ${toneStyle.icon}`}
                  >
                    <span className="material-symbols-outlined text-[20px]">{rule.icon}</span>
                  </div>
                  <div className="flex flex-col min-w-0 flex-1">
                    <div className="flex items-center justify-between gap-1">
                      <span className="text-sm text-on-surface font-semibold truncate">
                        {rule.title}
                      </span>
                      <span
                        className={`px-2 py-0.5 rounded-full text-[10px] font-bold shrink-0 ${toneStyle.badge}`}
                      >
                        {rule.badge}
                      </span>
                    </div>
                    <span className="mt-1 text-sm font-bold text-primary">{rule.headline}</span>
                    <p className="text-xs text-on-surface-variant mt-0.5">{rule.description}</p>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Tiers & Recent Ledger */}
        <div className="lg:col-span-5 flex flex-col space-y-4">
          <div className="space-y-2.5">
            <div className="flex items-center justify-between px-0.5">
              <div className="flex items-center gap-1.5">
                <span className="material-symbols-outlined text-primary-container text-[18px]">
                  workspace_premium
                </span>
                <h2 className="text-base text-on-surface font-semibold">
                  Tiers &amp; Member Benefits
                </h2>
              </div>
              <span className="text-[11px] text-on-surface-variant">3 Active Tiers</span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
              <div className="p-2.5 rounded-xl bg-surface-container flex flex-col justify-between">
                <div>
                  <div className="w-6 h-6 rounded-md bg-surface-container-high flex items-center justify-center text-outline mb-1.5">
                    <span className="material-symbols-outlined text-[14px]">shield</span>
                  </div>
                  <span className="text-xs text-on-surface font-semibold block">Bronze</span>
                  <span className="text-[10px] text-on-surface-variant block mt-0.5 tabular-nums">
                    0 - 999 pts
                  </span>
                </div>
                <div className="mt-2.5 bg-surface-container-high/40 rounded-lg p-1.5">
                  <p className="text-[10px] text-on-surface-variant leading-tight">
                    Standard earn rate &amp; digital card
                  </p>
                </div>
              </div>

              <div className="p-2.5 rounded-xl bg-surface-container flex flex-col justify-between">
                <div>
                  <div className="w-6 h-6 rounded-md bg-surface-container-high flex items-center justify-center text-inverse-surface mb-1.5">
                    <span className="material-symbols-outlined text-[14px]">verified</span>
                  </div>
                  <span className="text-xs text-on-surface font-semibold block">Silver</span>
                  <span className="text-[10px] text-on-surface-variant block mt-0.5 tabular-nums">
                    1k - 2,999 pts
                  </span>
                </div>
                <div className="mt-2.5 bg-surface-container-high/40 rounded-lg p-1.5">
                  <p className="text-[10px] text-on-surface-variant leading-tight">
                    +5% extra bonus points on dine-in
                  </p>
                </div>
              </div>

              <div className="p-2.5 rounded-xl bg-surface-container-high shadow-md flex flex-col justify-between relative overflow-hidden">
                <div className="absolute -right-2 -top-2 w-10 h-10 rounded-full bg-primary/10 blur-sm pointer-events-none" />
                <div>
                  <div className="w-6 h-6 rounded-md bg-primary-container/20 flex items-center justify-center text-primary-container mb-1.5">
                    <span className="material-symbols-outlined text-[14px] icon-filled">
                      military_tech
                    </span>
                  </div>
                  <span className="text-xs text-primary font-bold block">Gold VIP</span>
                  <span className="text-[10px] text-primary-fixed-dim block mt-0.5 tabular-nums">
                    3,000+ pts
                  </span>
                </div>
                <div className="mt-2.5 bg-surface-container-lowest/80 rounded-lg p-1.5">
                  <p className="text-[10px] text-on-surface leading-tight font-medium">
                    Free monthly coffee &amp; priority table
                  </p>
                </div>
              </div>
            </div>
          </div>

          {/* Recent Point Ledger */}
          <div className="space-y-2.5">
            <div className="flex items-center justify-between px-0.5">
              <div className="flex items-center gap-1.5">
                <span className="material-symbols-outlined text-secondary text-[18px]">
                  receipt_long
                </span>
                <h2 className="text-base text-on-surface font-semibold">Recent Point Ledger</h2>
              </div>
              <button
                type="button"
                onClick={() => onNotify(`Showing latest ${ledger.length} wallet transactions`)}
                className="text-primary text-xs font-semibold hover:underline cursor-pointer"
              >
                View All
              </button>
            </div>

            <div className="rounded-xl bg-surface-container space-y-1.5 p-1.5">
              {ledger.length === 0 ? (
                <div className="p-6 text-center text-xs text-on-surface-variant">
                  No point ledger transactions recorded yet.
                </div>
              ) : (
                ledger.map((txn) => (
                  <div
                    key={txn.id}
                    className="p-2.5 rounded-lg bg-surface-container-low flex items-center justify-between gap-2.5"
                  >
                    <div className="flex items-center gap-2.5 min-w-0">
                      <div className="w-8 h-8 rounded-full bg-surface-container-high flex items-center justify-center text-primary text-xs font-bold shrink-0">
                        {txn.initials}
                      </div>
                      <div className="flex flex-col min-w-0">
                        <span className="text-xs text-on-surface font-semibold truncate">
                          {txn.customerName}
                        </span>
                        <span className="text-[11px] text-on-surface-variant truncate">
                          {txn.context}
                        </span>
                      </div>
                    </div>
                    <div className="flex flex-col items-end shrink-0">
                      <span
                        className={`text-xs font-bold tabular-nums ${
                          txn.pointsDelta >= 0 ? 'text-tertiary' : 'text-error'
                        }`}
                      >
                        {txn.pointsDelta >= 0 ? `+${txn.pointsDelta}` : txn.pointsDelta} pts
                      </span>
                      <span className="text-[10px] text-on-surface-variant">{txn.note}</span>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Bottom Administrative Actions */}
      <div className="grid grid-cols-2 gap-2.5 pt-1">
        <button
          type="button"
          onClick={() => onNotify('Bronze / Silver / Gold VIP thresholds saved')}
          className="flex items-center justify-center gap-1.5 h-11 px-3 rounded-lg bg-surface-container-high text-on-surface text-xs font-semibold hover:bg-surface-bright transition-colors active:scale-95 cursor-pointer"
        >
          <span className="material-symbols-outlined text-[18px] text-primary">tune</span>
          <span>Configure Tiers</span>
        </button>
        <button
          type="button"
          onClick={onExportLedger}
          className="flex items-center justify-center gap-1.5 h-11 px-3 rounded-lg bg-surface-container-high text-on-surface text-xs font-semibold hover:bg-surface-bright transition-colors active:scale-95 cursor-pointer"
        >
          <span className="material-symbols-outlined text-[18px] text-secondary">file_download</span>
          <span>Export Ledger</span>
        </button>
      </div>

      {/* Add Rule Dialog */}
      <Dialog open={ruleModalOpen} onOpenChange={setRuleModalOpen}>
        <DialogContent className="bg-surface-container border border-outline-variant/30 text-on-surface sm:max-w-md rounded-2xl p-5">
          <DialogHeader>
            <DialogTitle className="text-lg font-bold text-on-surface">
              Create Loyalty Rule
            </DialogTitle>
            <DialogDescription className="text-xs text-on-surface-variant">
              Configure automated point accrual or redemption bonus rules.
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={handleSaveRule} className="space-y-4">
            <div className="space-y-3">
              <div>
                <label className="block text-xs font-semibold text-on-surface-variant mb-1">
                  Rule Name
                </label>
                <input
                  type="text"
                  {...form.register('title')}
                  placeholder="e.g. Morning Espresso Bonus"
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
                    Reward Formula
                  </label>
                  <input
                    type="text"
                    {...form.register('headline')}
                    placeholder="e.g. +25 Bonus Pts"
                    className="w-full px-3 py-2.5 rounded-lg bg-surface-container-low text-on-surface text-sm focus:outline-none focus:ring-1 focus:ring-primary"
                  />
                  {form.formState.errors.headline && (
                    <p className="text-[11px] text-error mt-1">
                      {form.formState.errors.headline.message}
                    </p>
                  )}
                </div>
                <div>
                  <label className="block text-xs font-semibold text-on-surface-variant mb-1">
                    Badge Text
                  </label>
                  <input
                    type="text"
                    {...form.register('badge')}
                    className="w-full px-3 py-2.5 rounded-lg bg-surface-container-low text-on-surface text-sm focus:outline-none focus:ring-1 focus:ring-primary"
                  />
                  {form.formState.errors.badge && (
                    <p className="text-[11px] text-error mt-1">
                      {form.formState.errors.badge.message}
                    </p>
                  )}
                </div>
              </div>
              <div>
                <label className="block text-xs font-semibold text-on-surface-variant mb-1">
                  Description
                </label>
                <input
                  type="text"
                  {...form.register('description')}
                  placeholder="Valid on orders placed before 11 AM"
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
                onClick={() => setRuleModalOpen(false)}
                className="flex-1 py-2.5 rounded-lg bg-surface-container-high text-on-surface text-sm font-semibold cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="submit"
                className="flex-1 py-2.5 rounded-lg bg-primary-container text-on-primary text-sm font-bold cursor-pointer"
              >
                Save Rule
              </button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
};
