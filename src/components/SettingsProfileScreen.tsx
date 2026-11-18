import React, { useEffect, useState } from 'react';
import { zodResolver } from '@hookform/resolvers/zod';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import { CAFE_ASSETS } from '../data/cafeSeedData';
import { cafeSettingsSchema } from '../shared/schemas';
import { CafeSettings } from '../types/cafe';
import { CafeImage } from './CafeImage';

export type SettingsTab =
  | 'Cafe Profile'
  | 'Taxes & Charges'
  | 'Roles'
  | 'Alerts'
  | 'Integrations';

interface SettingsProfileScreenProps {
  settings: CafeSettings;
  initialTab?: SettingsTab;
  onSaveSettings: (next: CafeSettings) => Promise<boolean> | boolean | void;
  onResetDefaults: () => Promise<boolean> | boolean | void;
  onNotify: (msg: string) => void;
}

const TABS: { id: SettingsTab; icon: string }[] = [
  { id: 'Cafe Profile', icon: 'storefront' },
  { id: 'Taxes & Charges', icon: 'percent' },
  { id: 'Roles', icon: 'badge' },
  { id: 'Alerts', icon: 'notifications' },
  { id: 'Integrations', icon: 'hub' },
];

type SettingsFormValues = z.input<typeof cafeSettingsSchema>;

type SavePhase =
  | { status: 'idle' }
  | { status: 'saving' }
  | { status: 'saved' }
  | { status: 'error'; message: string };

export const SettingsProfileScreen: React.FC<SettingsProfileScreenProps> = ({
  settings,
  initialTab = 'Cafe Profile',
  onSaveSettings,
  onResetDefaults,
  onNotify,
}) => {
  const [activeTab, setActiveTab] = useState<SettingsTab>(initialTab);
  const [savePhase, setSavePhase] = useState<SavePhase>({ status: 'idle' });

  useEffect(() => {
    setActiveTab(initialTab);
  }, [initialTab]);

  const form = useForm<SettingsFormValues>({
    resolver: zodResolver(cafeSettingsSchema),
    defaultValues: settings,
  });

  useEffect(() => {
    form.reset(settings);
  }, [form, settings]);

  const draft = form.watch();

  const handleSave = form.handleSubmit(async (values) => {
    if (savePhase.status === 'saving') return;
    const parsed = cafeSettingsSchema.parse(values);
    setSavePhase({ status: 'saving' });
    try {
      const result = await onSaveSettings(parsed);
      if (result === false) {
        setSavePhase({ status: 'error', message: 'Could not save settings. Check highlighted fields.' });
        return;
      }
      setSavePhase({ status: 'saved' });
    } catch (err) {
      setSavePhase({
        status: 'error',
        message: err instanceof Error ? err.message : 'Failed to save settings',
      });
    }
  });

  const handleReset = async () => {
    if (savePhase.status === 'saving') return;
    setSavePhase({ status: 'saving' });
    try {
      const ok = await onResetDefaults();
      if (ok === false) {
        setSavePhase({ status: 'error', message: 'Failed to restore default settings' });
        return;
      }
      setSavePhase({ status: 'idle' });
    } catch (err) {
      setSavePhase({
        status: 'error',
        message: err instanceof Error ? err.message : 'Failed to restore default settings',
      });
    }
  };

  return (
    <form onSubmit={handleSave} className="flex flex-col w-full pb-8 space-y-4">
      {/* Header Row */}
      <div className="flex items-center justify-between pt-1">
        <div>
          <h1 className="text-xl font-bold text-on-surface tracking-tight">Settings</h1>
          <p className="text-xs text-on-surface-variant">
            Cafe Profile &amp; System Configuration
          </p>
        </div>
        <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-surface-container-high text-tertiary">
          <span className="w-2 h-2 rounded-full bg-tertiary animate-pulse" />
          <span className="text-[11px] font-medium">All synced</span>
        </div>
      </div>

      {/* Category Tabs */}
      <div className="flex items-center gap-1.5 overflow-x-auto pb-1 no-scrollbar">
        {TABS.map((tab) => {
          const active = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              type="button"
              onClick={() => setActiveTab(tab.id)}
              className={`shrink-0 flex items-center gap-1.5 px-3.5 py-2 rounded-full text-xs transition-all cursor-pointer ${
                active
                  ? 'bg-primary-container text-on-primary-container font-bold shadow-sm'
                  : 'bg-surface-container-high text-on-surface-variant hover:text-on-surface font-medium'
              }`}
            >
              <span className={`material-symbols-outlined text-[17px] ${active ? 'icon-filled' : ''}`}>
                {tab.icon}
              </span>
              <span>{tab.id}</span>
            </button>
          );
        })}
      </div>

      {/* Main 2-column responsive layout */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 items-start">
        {/* Cafe Identity & Core Profile Card */}
        <div className="lg:col-span-7 rounded-xl bg-surface-container-low p-4 shadow-md space-y-4">
          <div className="flex items-center gap-3.5">
            <div className="relative shrink-0">
              <div className="w-16 h-16 rounded-full bg-surface-container-highest flex items-center justify-center shadow-inner overflow-hidden">
                <CafeImage
                  src={CAFE_ASSETS.loyaltySyncRef}
                  alt="Seth Sawariya Cafe Visual Emblem"
                  className="w-full h-full object-cover opacity-90"
                />
              </div>
              <button
                type="button"
                aria-label="Edit cafe avatar"
                onClick={() => onNotify('Brand emblem verified in CafeOS Media Library')}
                className="absolute -bottom-1 -right-1 w-6 h-6 rounded-full bg-primary-container text-on-primary-container flex items-center justify-center shadow-md cursor-pointer"
              >
                <span className="material-symbols-outlined text-[14px]">edit</span>
              </button>
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-1.5">
                <h2 className="text-base font-bold text-on-surface truncate">{draft.cafeName}</h2>
                <span className="material-symbols-outlined text-primary text-[18px] icon-filled">
                  verified
                </span>
              </div>
              <p className="text-xs text-secondary truncate">{draft.subCategory}</p>
              <span className="inline-flex items-center gap-1 mt-1 text-[11px] text-tertiary bg-surface-container px-2 py-0.5 rounded-full">
                <span className="w-1.5 h-1.5 rounded-full bg-tertiary" /> POS Terminal Active
              </span>
            </div>
          </div>

          <div className="space-y-3 pt-1">
            <div>
              <label className="block text-[11px] text-on-surface-variant mb-1 font-medium">
                Cafe / Brand Name
              </label>
              <div className="flex items-center px-3 py-2.5 rounded-lg bg-surface-container-high focus-within:bg-surface-container-highest transition-colors">
                <span className="material-symbols-outlined text-outline text-[18px] mr-2">
                  store
                </span>
                <input
                  type="text"
                  aria-label="Cafe Name"
                  {...form.register('cafeName')}
                  className="bg-transparent border-0 outline-none text-on-surface text-sm w-full"
                />
              </div>
              {form.formState.errors.cafeName && (
                <p className="text-[11px] text-error mt-1">
                  {form.formState.errors.cafeName.message}
                </p>
              )}
            </div>

            <div>
              <label className="block text-[11px] text-on-surface-variant mb-1 font-medium">
                Business Sub-category
              </label>
              <div className="flex items-center px-3 py-2.5 rounded-lg bg-surface-container-high focus-within:bg-surface-container-highest transition-colors">
                <span className="material-symbols-outlined text-outline text-[18px] mr-2">
                  coffee
                </span>
                <input
                  type="text"
                  aria-label="Business Sub-category"
                  {...form.register('subCategory')}
                  className="bg-transparent border-0 outline-none text-on-surface text-sm w-full"
                />
              </div>
              {form.formState.errors.subCategory && (
                <p className="text-[11px] text-error mt-1">
                  {form.formState.errors.subCategory.message}
                </p>
              )}
            </div>

            <div>
              <label className="block text-[11px] text-on-surface-variant mb-1 font-medium">
                Store Outlet Address
              </label>
              <div className="flex items-start px-3 py-2.5 rounded-lg bg-surface-container-high focus-within:bg-surface-container-highest transition-colors">
                <span className="material-symbols-outlined text-secondary text-[18px] mr-2 mt-0.5">
                  location_on
                </span>
                <textarea
                  rows={2}
                  aria-label="Store Outlet Address"
                  {...form.register('address')}
                  className="bg-transparent border-0 outline-none text-on-surface text-sm w-full resize-none"
                />
              </div>
              {form.formState.errors.address && (
                <p className="text-[11px] text-error mt-1">
                  {form.formState.errors.address.message}
                </p>
              )}
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block text-[11px] text-on-surface-variant mb-1 font-medium">
                  Primary Contact
                </label>
                <div className="flex items-center justify-between px-3 py-2.5 rounded-lg bg-surface-container-high">
                  <div className="flex items-center gap-2 min-w-0">
                    <span className="material-symbols-outlined text-outline text-[18px]">
                      call
                    </span>
                    <input
                      type="text"
                      aria-label="Primary Contact"
                      {...form.register('phone')}
                      className="bg-transparent border-0 outline-none text-on-surface text-sm w-full"
                    />
                  </div>
                  <span className="material-symbols-outlined text-tertiary text-[18px] icon-filled shrink-0">
                    check_circle
                  </span>
                </div>
                {form.formState.errors.phone && (
                  <p className="text-[11px] text-error mt-1">
                    {form.formState.errors.phone.message}
                  </p>
                )}
              </div>

              <div>
                <label className="block text-[11px] text-on-surface-variant mb-1 font-medium">
                  Official Email
                </label>
                <div className="flex items-center px-3 py-2.5 rounded-lg bg-surface-container-high">
                  <span className="material-symbols-outlined text-outline text-[18px] mr-2">
                    mail
                  </span>
                  <input
                    type="email"
                    aria-label="Official Email"
                    {...form.register('email')}
                    className="bg-transparent border-0 outline-none text-on-surface text-sm w-full"
                  />
                </div>
                {form.formState.errors.email && (
                  <p className="text-[11px] text-error mt-1">
                    {form.formState.errors.email.message}
                  </p>
                )}
              </div>
            </div>

            <div>
              <label className="block text-[11px] text-on-surface-variant mb-1 font-medium">
                Daily Operating Hours
              </label>
              <div className="flex items-center justify-between px-3 py-2.5 rounded-lg bg-surface-container-high">
                <div className="flex items-center gap-2 flex-1">
                  <span className="material-symbols-outlined text-primary text-[18px]">
                    schedule
                  </span>
                  <input
                    type="text"
                    aria-label="Daily Operating Hours"
                    {...form.register('operatingHours')}
                    className="bg-transparent border-0 outline-none text-on-surface text-sm w-full"
                  />
                </div>
                <span className="text-xs text-on-surface-variant shrink-0">Mon – Sun</span>
              </div>
              {form.formState.errors.operatingHours && (
                <p className="text-[11px] text-error mt-1">
                  {form.formState.errors.operatingHours.message}
                </p>
              )}
            </div>
          </div>
        </div>

        {/* Right Column: Operations, Tax, Hardware & Save Actions */}
        <div className="lg:col-span-5 space-y-4">
          <div className="rounded-xl bg-surface-container-low p-4 shadow-md space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="material-symbols-outlined text-primary text-[20px]">
                  receipt_long
                </span>
                <h3 className="text-sm font-bold text-on-surface">Store Operations &amp; Tax</h3>
              </div>
              <span className="text-xs text-primary font-medium">{activeTab}</span>
            </div>

            <div className="space-y-2.5">
              <div className="flex items-center justify-between p-3 rounded-lg bg-surface-container-high">
                <div>
                  <span className="block text-[11px] text-on-surface-variant">GSTIN Number</span>
                  <span className="text-sm font-semibold text-on-surface tracking-wider">
                    {draft.gstin}
                  </span>
                </div>
                <span className="px-2 py-0.5 rounded bg-surface-container-highest text-secondary text-xs">
                  5% Composite
                </span>
              </div>

                <div className="flex items-center justify-between p-3 rounded-lg bg-surface-container-high">
                  <div>
                    <span className="block text-[11px] text-on-surface-variant">
                      Service Charge (%)
                    </span>
                    <span className="text-sm font-medium text-on-surface">
                      {Number(draft.serviceChargePct ?? 0)}% (Optional)
                    </span>
                  </div>
                  <span className="text-xs text-on-surface-variant">Standard</span>
                </div>

                <div className="flex items-center justify-between p-3 rounded-lg bg-surface-container-high">
                  <div>
                    <span className="block text-[11px] text-on-surface-variant">
                      QR Table Dine-In Ordering
                    </span>
                    <span
                      className={`text-xs font-semibold flex items-center gap-1.5 mt-0.5 ${
                        draft.qrOrderingEnabled ? 'text-tertiary' : 'text-outline'
                      }`}
                    >
                      <span
                        className={`w-2 h-2 rounded-full ${
                          draft.qrOrderingEnabled ? 'bg-tertiary' : 'bg-outline'
                        }`}
                      />
                      {draft.qrOrderingEnabled ? 'Enabled (Live)' : 'Paused'}
                    </span>
                  </div>
                  <button
                    type="button"
                    role="switch"
                    aria-checked={draft.qrOrderingEnabled}
                    aria-label="Toggle Table Ordering"
                    onClick={() => form.setValue('qrOrderingEnabled', !draft.qrOrderingEnabled)}
                    className={`w-11 h-6 rounded-full flex items-center px-0.5 transition-colors cursor-pointer ${
                      draft.qrOrderingEnabled
                        ? 'bg-tertiary justify-end'
                        : 'bg-surface-variant justify-start'
                    }`}
                  >
                    <span className="w-5 h-5 rounded-full bg-on-tertiary shadow-sm" />
                  </button>
                </div>
            </div>
          </div>

          {/* Hardware & Printers */}
          <div className="rounded-xl bg-surface-container-low p-4 shadow-md space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="material-symbols-outlined text-primary text-[20px]">print</span>
                <h3 className="text-sm font-bold text-on-surface">Hardware &amp; Printers</h3>
              </div>
              <button
                type="button"
                onClick={() => onNotify('Test KOT slip printed on Epson TM-T82')}
                className="text-secondary text-xs flex items-center gap-0.5 font-semibold cursor-pointer"
              >
                <span className="material-symbols-outlined text-[14px]">refresh</span> Test
              </button>
            </div>

            <div className="space-y-2.5">
              <div className="flex items-center justify-between p-3 rounded-lg bg-surface-container-high">
                <div className="flex items-center gap-3 min-w-0">
                  <div className="w-9 h-9 rounded-lg bg-surface-container-highest flex items-center justify-center text-primary shrink-0">
                    <span className="material-symbols-outlined text-[20px]">soup_kitchen</span>
                  </div>
                  <div className="min-w-0">
                    <div className="flex items-center gap-1.5">
                      <span className="text-sm font-semibold text-on-surface truncate">
                        Epson TM-T82
                      </span>
                      <span className="px-1.5 py-0.5 rounded bg-tertiary/15 text-tertiary text-[10px]">
                        Thermal 80mm
                      </span>
                    </div>
                    <span className="text-xs text-tertiary flex items-center gap-1">
                      <span className="w-1.5 h-1.5 rounded-full bg-tertiary" /> Kitchen KOT
                      Connected
                    </span>
                  </div>
                </div>
                <button
                  type="button"
                  aria-label="Printer options"
                  onClick={() => onNotify('Epson TM-T82 USB/LAN port healthy (9600 bps)')}
                  className="p-1 text-on-surface-variant hover:text-on-surface cursor-pointer"
                >
                  <span className="material-symbols-outlined text-[18px]">more_vert</span>
                </button>
              </div>

              <div className="flex items-center justify-between p-3 rounded-lg bg-surface-container-high">
                <div className="flex items-center gap-3 min-w-0">
                  <div className="w-9 h-9 rounded-lg bg-surface-container-highest flex items-center justify-center text-secondary shrink-0">
                    <span className="material-symbols-outlined text-[20px]">point_of_sale</span>
                  </div>
                  <div className="min-w-0">
                    <span className="text-sm font-semibold text-on-surface truncate block">
                      Sunmi Bluetooth POS
                    </span>
                    <span className="text-xs text-tertiary flex items-center gap-1">
                      <span className="w-1.5 h-1.5 rounded-full bg-tertiary" /> Counter Printer
                      Paired
                    </span>
                  </div>
                </div>
                <button
                  type="button"
                  aria-label="Counter printer options"
                  onClick={() => onNotify('Sunmi Bluetooth POS paired on Counter 1')}
                  className="p-1 text-on-surface-variant hover:text-on-surface cursor-pointer"
                >
                  <span className="material-symbols-outlined text-[18px]">more_vert</span>
                </button>
              </div>
            </div>
          </div>

          {/* Primary Save / Reset Actions */}
          <div className="space-y-2.5">
            {savePhase.status === 'error' && (
              <div className="rounded-lg bg-error-container/25 border border-error/40 px-3 py-2 text-xs text-error">
                {savePhase.message}
              </div>
            )}

            <button
              type="submit"
              disabled={savePhase.status === 'saving'}
              className="w-full h-12 rounded-lg bg-primary-container hover:bg-primary text-on-primary-container text-sm font-bold flex items-center justify-center gap-2 shadow-lg transition-all active:scale-[0.99] cursor-pointer disabled:opacity-60"
            >
              <span
                className={`material-symbols-outlined text-[20px] ${
                  savePhase.status === 'saving' ? 'animate-spin' : ''
                }`}
              >
                {savePhase.status === 'saving'
                  ? 'sync'
                  : savePhase.status === 'saved'
                    ? 'done_all'
                    : savePhase.status === 'error'
                      ? 'error'
                      : 'check_circle'}
              </span>
              <span>
                {savePhase.status === 'saving'
                  ? 'Saving Profile...'
                  : savePhase.status === 'saved'
                    ? 'Profile Updated!'
                    : savePhase.status === 'error'
                      ? 'Retry Save'
                      : 'Save Changes'}
              </span>
            </button>

            <button
              type="button"
              disabled={savePhase.status === 'saving'}
              onClick={() => void handleReset()}
              className="w-full h-11 rounded-lg bg-surface-container text-on-surface-variant hover:text-on-surface text-sm font-semibold flex items-center justify-center gap-1.5 transition-colors cursor-pointer disabled:opacity-50"
            >
              <span className="material-symbols-outlined text-[18px]">restart_alt</span>
              <span>Reset Defaults</span>
            </button>
          </div>
        </div>
      </div>
    </form>
  );
};
