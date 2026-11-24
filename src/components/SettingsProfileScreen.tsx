import React, { useEffect, useRef, useState } from 'react';
import { zodResolver } from '@hookform/resolvers/zod';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import { cafeSettingsSchema } from '../shared/schemas';
import { CafeSettings } from '../types/cafe';

interface SettingsProfileScreenProps {
  settings: CafeSettings;
  onSaveSettings: (next: CafeSettings) => Promise<boolean> | boolean | void;
  onResetDefaults: () => Promise<boolean> | boolean | void;
  onNotify: (msg: string) => void;
}

type SettingsFormValues = z.input<typeof cafeSettingsSchema>;

type SavePhase =
  | { status: 'idle' }
  | { status: 'saving' }
  | { status: 'saved' }
  | { status: 'error'; message: string };

export const SettingsProfileScreen: React.FC<SettingsProfileScreenProps> = ({
  settings,
  onSaveSettings,
  onResetDefaults,
  onNotify,
}) => {
  const [savePhase, setSavePhase] = useState<SavePhase>({ status: 'idle' });
  const [logoUploading, setLogoUploading] = useState(false);
  const logoInputRef = useRef<HTMLInputElement>(null);

  const form = useForm<SettingsFormValues>({
    resolver: zodResolver(cafeSettingsSchema),
    defaultValues: { ...settings, logoUrl: settings.logoUrl || '/images/tsc-logo.jpg' },
  });

  useEffect(() => {
    form.reset({ ...settings, logoUrl: settings.logoUrl || '/images/tsc-logo.jpg' });
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
    if (savePhase.status === 'saving' || logoUploading) return;
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

  const handleLogoChange = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.currentTarget.files?.[0];
    event.currentTarget.value = '';
    if (!file) return;
    if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) {
      onNotify('Choose a JPG, PNG, or WebP image for the cafe logo.');
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      onNotify('Cafe logos must be 5 MB or smaller.');
      return;
    }

    setLogoUploading(true);
    try {
      const data = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => {
          if (typeof reader.result === 'string') resolve(reader.result);
          else reject(new Error('Could not read the selected logo image.'));
        };
        reader.onerror = () => reject(new Error('Could not read the selected logo image.'));
        reader.readAsDataURL(file);
      });
      const response = await fetch('/api/menu/upload-image', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ data, fileName: file.name }),
      });
      const result = (await response.json()) as { imageUrl?: string; error?: string };
      if (!response.ok || !result.imageUrl) {
        throw new Error(result.error || 'Could not upload the cafe logo.');
      }

      form.setValue('logoUrl', result.imageUrl, { shouldDirty: true, shouldValidate: true });
      setSavePhase({ status: 'idle' });
      onNotify('Logo uploaded. Save Changes to apply it.');
    } catch (error) {
      onNotify(error instanceof Error ? error.message : 'Could not upload the cafe logo.');
    } finally {
      setLogoUploading(false);
    }
  };

  return (
    <form onSubmit={handleSave} className="flex flex-col w-full pb-8 space-y-4">
      {/* Header Row */}
      <div className="pt-1">
        <h1 className="text-xl font-bold text-on-surface tracking-tight">Settings</h1>
      </div>

      <div className="w-full max-w-3xl mx-auto space-y-4">
        {/* Cafe Identity & Core Profile Card */}
        <div className="rounded-xl bg-surface-container-low p-4 shadow-md space-y-4">
          <div className="flex items-center gap-3.5">
            <div className="relative shrink-0">
              <div className="w-16 h-16 rounded-full bg-black flex items-center justify-center shadow-md overflow-hidden border-2 border-[#D4AF37]/60 p-0.5">
                <img
                  src={draft.logoUrl || '/images/tsc-logo.jpg'}
                  alt="The Sawariya Cafe Logo"
                  className="w-full h-full object-cover rounded-full"
                />
              </div>
              <input
                ref={logoInputRef}
                type="file"
                accept="image/jpeg,image/png,image/webp"
                aria-label="Upload cafe logo"
                onChange={(event) => void handleLogoChange(event)}
                className="sr-only"
              />
              <button
                type="button"
                aria-label="Change cafe logo"
                title="Change cafe logo"
                disabled={logoUploading || savePhase.status === 'saving'}
                onClick={() => logoInputRef.current?.click()}
                className="absolute -bottom-1 -right-1 w-6 h-6 rounded-full bg-primary-container text-on-primary-container flex items-center justify-center shadow-md cursor-pointer disabled:cursor-wait disabled:opacity-60"
              >
                <span className="material-symbols-outlined text-[14px]">
                  {logoUploading ? 'progress_activity' : 'edit'}
                </span>
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
          <p className="pl-[78px] text-[11px] text-on-surface-variant">
            Upload a JPG, PNG, or WebP (max 5 MB), then save changes.
          </p>

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

        {/* Primary Save / Reset Actions */}
        <div className="space-y-2.5">
          {savePhase.status === 'error' && (
            <div className="rounded-lg bg-error-container/25 border border-error/40 px-3 py-2 text-xs text-error">
              {savePhase.message}
            </div>
          )}

          <button
            type="submit"
            disabled={savePhase.status === 'saving' || logoUploading}
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
    </form>
  );
};
