import React, { useEffect, useRef, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { CAFE_ASSETS } from '../data/cafeSeedData';
import { CafeImage } from './CafeImage';
import { CafeAssistantChat } from './CafeAssistantChat';
import { useCustomerTheme } from './CustomerThemeContext';
import type { CafeAssistantContext } from '../utils/cafeAssistant';
import type { CafeBootstrapState } from '../server/store';
import {
  getLocalCustomerSession,
  logoutCustomer,
  clearLocalCustomerSession,
  type CustomerAuthSession,
} from '../lib/supabaseClient';

interface CustomerProfileScreenProps {
  onNotify: (message: string) => void;
  onBrowseMenu: () => void;
  onNavigateOrders?: () => void;
  onNavigateRewards?: () => void;
  onNavigateOffers?: () => void;
  onNavigateLogin?: () => void;
  onNavigatePrivacyPolicy?: () => void;
  onNavigateTerms?: () => void;
  onSessionChange?: (session: CustomerAuthSession | null) => void;
  assistantContext?: CafeAssistantContext;
}

interface CustomerProfile {
  name: string;
  avatarImage: string;
  email: string;
  phone: string;
  dateOfBirth: string;
  address: string;
  notes: string;
  promotionalMessages: boolean;
  orderUpdates: boolean;
}

const STORAGE_KEY = 'cafeos_customer_profile';

const DEFAULT_PROFILE: CustomerProfile = {
  name: '',
  avatarImage: '',
  email: '',
  phone: '',
  dateOfBirth: '',
  address: '',
  notes: '',
  promotionalMessages: true,
  orderUpdates: true,
};

function loadProfile(): CustomerProfile {
  if (typeof window === 'undefined') return DEFAULT_PROFILE;
  try {
    const saved = window.localStorage.getItem(STORAGE_KEY);
    return saved ? { ...DEFAULT_PROFILE, ...JSON.parse(saved) } : DEFAULT_PROFILE;
  } catch {
    return DEFAULT_PROFILE;
  }
}

export const CustomerProfileScreen: React.FC<CustomerProfileScreenProps> = ({
  onNotify,
  onBrowseMenu,
  onNavigateOrders,
  onNavigateRewards,
  onNavigateOffers,
  onNavigateLogin,
  onNavigatePrivacyPolicy,
  onNavigateTerms,
  onSessionChange,
  assistantContext,
}) => {
  const [profile, setProfile] = useState<CustomerProfile>(loadProfile);
  const [savedProfile, setSavedProfile] = useState<CustomerProfile>(loadProfile);
  const [authSession, setAuthSession] = useState(getLocalCustomerSession);
  const [saving, setSaving] = useState(false);
  const [view, setView] = useState<'menu' | 'edit-info'>('menu');
  const [supportChatOpen, setSupportChatOpen] = useState(false);
  const [errors, setErrors] = useState<{ email?: string; phone?: string }>({});
  const [exporting, setExporting] = useState(false);
  const [deletingAccount, setDeletingAccount] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const avatarInputRef = useRef<HTMLInputElement>(null);
  const { isLightTheme, toggleTheme } = useCustomerTheme();
  const supportAssistantQuery = useQuery<CafeBootstrapState>({
    queryKey: ['cafeos', 'profile-support-assistant', authSession?.id ?? profile.phone ?? 'guest'],
    queryFn: async () => {
      const response = await fetch('/api/bootstrap?screen=tracking&scope=main');
      if (!response.ok) {
        throw new Error(`Could not load assistant context (${response.status}).`);
      }
      return (await response.json()) as CafeBootstrapState;
    },
    enabled: supportChatOpen,
    staleTime: 30_000,
  });

  useEffect(() => {
    setSavedProfile(loadProfile());
    setAuthSession(getLocalCustomerSession());
  }, []);

  const initials = profile.name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join('') || 'G';

  const updateField = <K extends keyof CustomerProfile>(field: K, value: CustomerProfile[K]) => {
    setProfile((current) => ({ ...current, [field]: value }));
  };

  const handleAvatarChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.currentTarget.files?.[0];
    event.currentTarget.value = '';
    if (!file) return;
    if (!file.type.startsWith('image/')) {
      onNotify('Choose a valid image file.');
      return;
    }
    if (file.size > 2 * 1024 * 1024) {
      onNotify('Profile images must be 2 MB or smaller.');
      return;
    }

    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result !== 'string') {
        onNotify('Could not read the selected profile image.');
        return;
      }
      updateField('avatarImage', reader.result);
      onNotify('Profile image selected. Save your profile to keep it.');
    };
    reader.onerror = () => onNotify('Could not read the selected profile image.');
    reader.readAsDataURL(file);
  };

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    const nextErrors: { email?: string; phone?: string } = {};
    if (profile.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(profile.email)) {
      nextErrors.email = 'Enter a valid email address.';
    }
    if (profile.phone && !/^[+\d][\d\s()-]{7,15}$/.test(profile.phone)) {
      nextErrors.phone = 'Enter a valid phone number.';
    }
    setErrors(nextErrors);
    if (Object.keys(nextErrors).length > 0) return;

    setSaving(true);
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(profile));
      setSavedProfile(profile);

      // Persist to Cafe CRM in real time
      if (authSession?.id) {
        await fetch('/api/customer/profile', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            customerId: authSession.id,
            name: profile.name,
            phone: profile.phone,
            email: profile.email,
            note: profile.notes,
          }),
        }).catch((err) => console.warn('Failed to sync profile to CRM:', err));
      }

      onNotify('Personal profile saved');
    } finally {
      setSaving(false);
    }
  };

  const hasChanges = JSON.stringify(profile) !== JSON.stringify(savedProfile);

  const handleLogOut = async () => {
    try {
      if (authSession?.isLocalTestAccount) {
        clearLocalCustomerSession();
      } else {
        await logoutCustomer();
      }
      onNotify('Logged out from account');
    } catch (error) {
      onNotify(error instanceof Error ? error.message : 'Could not complete sign out.');
    } finally {
      setAuthSession(null);
      onSessionChange?.(null);
    }
  };

  const handleExportData = async () => {
    setExporting(true);
    try {
      let data: any = null;
      if (authSession?.id) {
        const res = await fetch(`/api/customers/${authSession.id}/export`);
        if (res.ok) {
          data = await res.json();
        }
      }
      if (!data) {
        const res = await fetch('/api/customer/export');
        if (res.ok) {
          data = await res.json();
        }
      }
      if (!data) {
        data = {
          exportedAt: new Date().toISOString(),
          dpdpNotice: 'Right to Access & Data Portability export under DPDP Act 2023 Sec 11',
          profile: {
            ...profile,
            authSession: authSession ? { id: authSession.id, phone: authSession.phone, email: authSession.email } : null,
          },
        };
      }
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `cafeos-personal-data-${new Date().toISOString().slice(0, 10)}.json`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
      onNotify('Personal data export downloaded successfully');
    } catch {
      onNotify('Failed to export data. Please try again.');
    } finally {
      setExporting(false);
    }
  };

  const handleDeleteAccount = async () => {
    setDeletingAccount(true);
    try {
      if (authSession?.id) {
        await fetch(`/api/customers/${authSession.id}`, { method: 'DELETE' }).catch(() => {});
      }
      await fetch('/api/customer/account', { method: 'DELETE' }).catch(() => {});

      window.localStorage.removeItem(STORAGE_KEY);
      clearLocalCustomerSession();
      if (!authSession?.isLocalTestAccount) {
        await logoutCustomer().catch(() => {});
      }
      setProfile(DEFAULT_PROFILE);
      setSavedProfile(DEFAULT_PROFILE);
      setAuthSession(null);
      onSessionChange?.(null);
      setShowDeleteConfirm(false);
      onNotify('Account & personal data permanently erased (DPDP Act 2023 Sec 12)');
      setView('menu');
    } catch (err) {
      onNotify('Error erasing data: ' + (err instanceof Error ? err.message : String(err)));
    } finally {
      setDeletingAccount(false);
    }
  };

  const displayName = profile.name || authSession?.name || 'Shubham Vaishnav';
  const displayPhone = profile.phone || authSession?.phone || '+91 98765 43210';

  if (view === 'menu') {
    return (
      <div className="mx-auto flex w-full max-w-lg flex-col gap-4 px-3 py-2 pb-28 text-on-surface">
        {/* Top Header (Panel 14) */}
        <div className="flex items-center justify-between pb-1">
          <button
            type="button"
            onClick={onBrowseMenu}
            aria-label="Back"
            className="w-9 h-9 rounded-full bg-surface-container-low border border-outline-variant flex items-center justify-center text-on-surface shadow-xs hover:bg-surface-container-high transition-colors cursor-pointer"
          >
            <span className="material-symbols-outlined text-[20px]">arrow_back</span>
          </button>

          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-full overflow-hidden border border-[#D4AF37]/60 shadow-xs bg-black p-0.5 shrink-0">
              <img src="/images/tsc-logo.jpg" alt="The Sawariya Cafe" className="w-full h-full object-cover rounded-full" />
            </div>
            <h1 className="text-base sm:text-lg font-bold text-on-surface tracking-tight font-serif">
              My Profile
            </h1>
          </div>

          <div className="w-9" />
        </div>

        {/* User Card (Panel 14) */}
        <div
          onClick={() => setView('edit-info')}
          className="p-4 rounded-2xl bg-surface-container-low border border-outline-variant shadow-xs flex items-center gap-3.5 cursor-pointer hover:bg-surface-container transition-colors"
        >
          <div className="w-14 h-14 rounded-full bg-primary text-white flex items-center justify-center text-xl font-bold shrink-0 shadow-xs">
            {initials || <span className="material-symbols-outlined text-[28px]">person</span>}
          </div>
          <div className="flex-1 min-w-0">
            <h2 className="font-bold text-base text-on-surface tracking-tight truncate">
              {displayName}
            </h2>
            <p className="text-xs text-on-surface-variant mt-0.5 truncate">
              {displayPhone}
            </p>
          </div>
          <span className="material-symbols-outlined text-[18px] text-on-surface-variant">
            chevron_right
          </span>
        </div>

        {/* Grouped Menu List (Panel 14) */}
        <div className="rounded-2xl bg-surface-container-low border border-outline-variant shadow-xs divide-y divide-outline-variant/50 overflow-hidden">
          {[
            { label: 'My Orders', icon: 'receipt_long', action: onNavigateOrders ?? onBrowseMenu },
            { label: 'Addresses', icon: 'location_on', action: () => setView('edit-info') },
            {
              label: 'Payment Methods',
              icon: 'credit_card',
              action: () => onNotify('UPI and Cash on Counter active'),
            },
            { label: 'My Rewards', icon: 'stars', action: onNavigateRewards ?? onBrowseMenu },
            { label: 'Offers & Coupons', icon: 'local_offer', action: onNavigateOffers ?? onBrowseMenu },
            {
              label: 'Notifications',
              icon: 'notifications',
              action: () => onNotify('Order and table notifications enabled'),
            },
            {
              label: 'Help & Support',
              icon: 'help',
              action: () => setSupportChatOpen(true),
            },
            { label: 'Settings', icon: 'settings', action: () => setView('edit-info') },
          ].map((item) => (
            <button
              key={item.label}
              type="button"
              onClick={item.action}
              className="w-full px-4 py-3.5 flex items-center justify-between text-left hover:bg-surface-container transition-colors cursor-pointer group"
            >
              <div className="flex items-center gap-3">
                <span className="material-symbols-outlined text-[20px] text-on-surface-variant group-hover:text-primary transition-colors">
                  {item.icon}
                </span>
                <span className="text-xs sm:text-sm font-semibold text-on-surface">
                  {item.label}
                </span>
              </div>
              <span className="material-symbols-outlined text-[18px] text-on-surface-variant group-hover:text-on-surface group-hover:translate-x-0.5 transition-all">
                chevron_right
              </span>
            </button>
          ))}

          <button
            type="button"
            aria-label={isLightTheme ? 'Switch to dark mode' : 'Switch to light mode'}
            onClick={toggleTheme}
            className="w-full px-4 py-3.5 flex items-center justify-between text-left hover:bg-surface-container transition-colors cursor-pointer group"
          >
            <div className="flex items-center gap-3">
              <span className="material-symbols-outlined text-[20px] text-on-surface-variant group-hover:text-primary transition-colors">
                {isLightTheme ? 'dark_mode' : 'light_mode'}
              </span>
              <span className="text-xs sm:text-sm font-semibold text-on-surface">
                {isLightTheme ? 'Dark mode' : 'Light mode'}
              </span>
            </div>
            <span className="material-symbols-outlined text-[18px] text-on-surface-variant group-hover:text-on-surface group-hover:translate-x-0.5 transition-all">
              chevron_right
            </span>
          </button>

          {/* Log Out Button */}
          <button
            type="button"
            onClick={handleLogOut}
            className="w-full px-4 py-3.5 flex items-center justify-between text-left hover:bg-error-container/30 transition-colors cursor-pointer text-error"
          >
            <div className="flex items-center gap-3">
              <span className="material-symbols-outlined text-[20px] text-error">logout</span>
              <span className="text-xs sm:text-sm font-bold text-error">Log Out</span>
            </div>
            <span className="material-symbols-outlined text-[18px] text-error">
              chevron_right
            </span>
          </button>
        </div>

        {/* The Sawariya Cafe Contact & Facilities Info */}
        <div className="rounded-2xl bg-surface-container-low border border-outline-variant p-4 shadow-xs space-y-3">
          <div className="flex items-center justify-between">
            <span className="font-serif font-black text-xs text-on-surface">The Sawariya Cafe</span>
            <span className="text-[10px] font-bold text-primary bg-primary/10 px-2 py-0.5 rounded-full">
              Hospitality Info
            </span>
          </div>

          <div className="grid grid-cols-2 gap-2 text-xs">
            <a
              href="tel:01414611071"
              className="flex items-center gap-2 p-2.5 rounded-xl bg-surface-container hover:bg-surface-container-high transition-colors text-on-surface"
            >
              <span className="material-symbols-outlined text-[18px] text-primary">call</span>
              <div className="min-w-0">
                <p className="font-bold text-[11px]">01414611071</p>
                <p className="text-[9px] text-on-surface-variant">Phone Support</p>
              </div>
            </a>

            <a
              href="https://wa.me/917300348070"
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-2 p-2.5 rounded-xl bg-surface-container hover:bg-surface-container-high transition-colors text-on-surface"
            >
              <span className="material-symbols-outlined text-[18px] text-emerald-600">chat</span>
              <div className="min-w-0">
                <p className="font-bold text-[11px]">7300348070</p>
                <p className="text-[9px] text-on-surface-variant">WhatsApp Orders</p>
              </div>
            </a>

            <a
              href="https://instagram.com/the_sawariya_cafe"
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-2 p-2.5 rounded-xl bg-surface-container hover:bg-surface-container-high transition-colors text-on-surface"
            >
              <span className="material-symbols-outlined text-[18px] text-rose-600">photo_camera</span>
              <div className="min-w-0">
                <p className="font-bold text-[11px]">@the_sawariya_cafe</p>
                <p className="text-[9px] text-on-surface-variant">Instagram & Offers</p>
              </div>
            </a>

            <div className="flex items-center gap-2 p-2.5 rounded-xl bg-surface-container text-on-surface">
              <span className="material-symbols-outlined text-[18px] text-sky-600">wifi</span>
              <div className="min-w-0">
                <p className="font-bold text-[11px]">Free Guest Wi-Fi</p>
                <p className="text-[9px] text-on-surface-variant">Sawariya@1177</p>
              </div>
            </div>
          </div>
        </div>

        {/* Legal links */}
        <div className="flex items-center justify-center gap-4 pt-2 text-[11px] text-on-surface-variant">
          {onNavigatePrivacyPolicy && (
            <button
              type="button"
              onClick={onNavigatePrivacyPolicy}
              className="hover:underline cursor-pointer"
            >
              Privacy Policy
            </button>
          )}
          <span>•</span>
          {onNavigateTerms && (
            <button
              type="button"
              onClick={onNavigateTerms}
              className="hover:underline cursor-pointer"
            >
              Terms &amp; Conditions
            </button>
          )}
        </div>

        {showDeleteConfirm && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs">
            <div className="w-full max-w-sm rounded-2xl bg-surface-container p-5 border border-outline-variant shadow-xl">
              <div className="flex items-center gap-3 text-error mb-3">
                <span className="material-symbols-outlined text-2xl">warning</span>
                <h3 className="font-bold text-base text-on-surface">Erase Personal Data?</h3>
              </div>
              <p className="text-xs text-on-surface-variant leading-relaxed mb-4">
                Under Section 12 of India&apos;s DPDP Act 2023, you have the right to erase your customer profile and personal records. Past tax invoices are archived anonymously for mandatory compliance (GST Act 2017). This cannot be undone.
              </p>
              <div className="flex justify-end gap-2.5">
                <button
                  type="button"
                  onClick={() => setShowDeleteConfirm(false)}
                  disabled={deletingAccount}
                  className="px-4 py-2 rounded-xl bg-surface-container-high hover:bg-surface-container text-xs font-semibold text-on-surface cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={handleDeleteAccount}
                  disabled={deletingAccount}
                  className="px-4 py-2 rounded-xl bg-error hover:bg-error/90 text-xs font-bold text-white shadow-sm cursor-pointer flex items-center gap-1.5"
                >
                  <span className="material-symbols-outlined text-[15px]">delete_forever</span>
                  <span>{deletingAccount ? 'Erasing...' : 'Confirm Erasure'}</span>
                </button>
              </div>
            </div>
          </div>
        )}
      {supportChatOpen && (
        <CafeAssistantChat
          context={{
            activeOrder: supportAssistantQuery.data?.orders[0] ?? assistantContext?.activeOrder,
            menuItems: supportAssistantQuery.data?.menuItems ?? assistantContext?.menuItems ?? [],
            availableBeans:
              supportAssistantQuery.data?.rewardPoints ?? assistantContext?.availableBeans ?? 0,
            cafeSettings:
              supportAssistantQuery.data?.cafeSettings ?? assistantContext?.cafeSettings,
            campaigns: supportAssistantQuery.data?.campaigns ?? assistantContext?.campaigns,
          }}
          mode="dialog"
          isLoading={supportAssistantQuery.isLoading}
          contextError={
            supportAssistantQuery.isError
              ? 'Order and menu details could not be loaded.'
              : undefined
          }
          onRetryContext={() => void supportAssistantQuery.refetch()}
          onClose={() => setSupportChatOpen(false)}
        />
      )}
      </div>
    );
  }

  return (
    <div className="flex flex-col w-full pb-8 gap-4">
      <div className="flex items-center justify-between pt-1">
        <button
          type="button"
          onClick={() => setView('menu')}
          aria-label="Back"
          className="w-9 h-9 rounded-full bg-surface-container-low border border-outline-variant flex items-center justify-center text-on-surface shadow-xs hover:bg-surface-container-high transition-colors cursor-pointer"
        >
          <span className="material-symbols-outlined text-[20px]">arrow_back</span>
        </button>
        <div>
          <h1 className="text-lg font-bold text-on-surface tracking-tight">Edit Profile</h1>
          <p className="text-xs text-on-surface-variant mt-0.5">Manage your customer details</p>
        </div>
        <button
          type="button"
          onClick={onBrowseMenu}
          className="h-9 px-3 rounded-lg bg-surface-container-high text-primary text-xs font-bold flex items-center gap-1.5 cursor-pointer"
        >
          <span className="material-symbols-outlined text-[17px]">restaurant_menu</span>
          Browse Menu
        </button>
      </div>

      <form onSubmit={handleSubmit} className="grid grid-cols-1 lg:grid-cols-12 gap-4 items-start">
        <section className="lg:col-span-4 rounded-xl bg-surface-container-low p-5 shadow-md border border-outline-variant/20">
          <div className="flex flex-col items-center text-center">
            <div className="relative h-24 w-24 rounded-full bg-primary/20 p-1">
              <div className="h-full w-full overflow-hidden rounded-full">
                {profile.avatarImage || authSession?.avatarUrl ? (
                  <img
                    src={profile.avatarImage || authSession?.avatarUrl}
                    alt="Profile"
                    className="h-full w-full rounded-full object-cover"
                  />
                ) : profile.name ? (
                <div className="w-full h-full rounded-full bg-primary-container text-on-primary-container flex items-center justify-center text-2xl font-black">
                  {initials}
                </div>
              ) : (
                <CafeImage
                  src={CAFE_ASSETS.avatar}
                  alt="Guest profile"
                  className="w-full h-full rounded-full object-cover"
                />
              )}
              </div>
              <input
                ref={avatarInputRef}
                type="file"
                accept="image/*"
                onChange={handleAvatarChange}
                className="sr-only"
                aria-label="Choose profile image"
              />
              <button
                type="button"
                onClick={() => avatarInputRef.current?.click()}
                aria-label="Edit profile image"
                className="absolute bottom-0 right-0 flex h-8 w-8 items-center justify-center rounded-full border-2 border-surface-container-low bg-primary text-white shadow-md transition-transform hover:scale-105 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
              >
                <span className="material-symbols-outlined text-[16px]">edit</span>
              </button>
            </div>
            <h2 className="mt-3 text-base font-bold text-on-surface">{profile.name || 'Guest Customer'}</h2>
            {profile.email && (
              <p className="text-xs text-on-surface-variant">{profile.email}</p>
            )}
            {authSession ? (
              <div className="mt-3 space-y-2 w-full">
                <span className={`inline-flex items-center gap-1 text-[11px] px-2.5 py-1 rounded-full border font-semibold ${
                  authSession.isLocalTestAccount
                    ? 'bg-primary/10 border-primary/30 text-primary'
                    : 'bg-emerald-500/100/15 border-emerald-500/30 text-emerald-300'
                }`}>
                  <span className="material-symbols-outlined text-[13px]">
                    {authSession.isLocalTestAccount ? 'science' : 'verified'}
                  </span>
                  {authSession.isLocalTestAccount
                    ? 'Local test account (development only)'
                    : 'Account connected'}
                </span>
                <button
                  type="button"
                  onClick={async () => {
                    try {
                      if (authSession.isLocalTestAccount) {
                        clearLocalCustomerSession();
                      } else {
                        await logoutCustomer();
                      }
                      onNotify('Logged out from account');
                    } catch (error) {
                      onNotify(error instanceof Error ? error.message : 'Could not complete sign out.');
                    } finally {
                      setAuthSession(null);
                      onSessionChange?.(null);
                    }
                  }}
                  className="block w-full py-1.5 rounded-lg bg-surface-container-high hover:bg-surface-container text-xs text-on-surface font-semibold cursor-pointer transition-colors"
                >
                  Log Out
                </button>
              </div>
            ) : (
              <div className="mt-3 w-full space-y-2">
                {onNavigateLogin && (
                  <button
                    type="button"
                    onClick={onNavigateLogin}
                    className="w-full py-2 rounded-xl bg-primary hover:brightness-90 text-white text-xs font-bold shadow-sm cursor-pointer transition-all flex items-center justify-center gap-1.5"
                  >
                    <span className="material-symbols-outlined text-[15px]">login</span>
                    <span>Sign In / Create Account</span>
                  </button>
                )}
              </div>
            )}
          </div>
        </section>

        <section className="lg:col-span-8 rounded-xl bg-surface-container-low p-4 shadow-md border border-outline-variant/20">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-sm font-bold text-on-surface">Personal Information</h2>
            {hasChanges && (
              <span className="text-[10px] font-semibold text-amber-400">Unsaved changes</span>
            )}
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <label className="flex flex-col gap-1 text-xs font-semibold text-on-surface-variant">
              Full Name
              <input
                type="text"
                value={profile.name}
                onChange={(event) => updateField('name', event.target.value)}
                placeholder="Enter full name"
                className="h-10 px-3 rounded-lg bg-surface-container-lowest border border-outline-variant/30 text-sm font-normal text-on-surface focus:outline-none focus:ring-1 focus:ring-primary"
              />
            </label>

            <label className="flex flex-col gap-1 text-xs font-semibold text-on-surface-variant">
              Email Address
              <input
                type="email"
                value={profile.email}
                onChange={(event) => updateField('email', event.target.value)}
                placeholder="name@example.com"
                className="h-10 px-3 rounded-lg bg-surface-container-lowest border border-outline-variant/30 text-sm font-normal text-on-surface focus:outline-none focus:ring-1 focus:ring-primary"
              />
              {errors.email && <span className="text-[11px] text-error">{errors.email}</span>}
            </label>

            <label className="flex flex-col gap-1 text-xs font-semibold text-on-surface-variant">
              Phone Number
              <input
                type="tel"
                value={profile.phone}
                onChange={(event) => updateField('phone', event.target.value)}
                placeholder="+91 98765 43210"
                className="h-10 px-3 rounded-lg bg-surface-container-lowest border border-outline-variant/30 text-sm font-normal text-on-surface focus:outline-none focus:ring-1 focus:ring-primary"
              />
              {errors.phone && <span className="text-[11px] text-error">{errors.phone}</span>}
            </label>

            <label className="flex flex-col gap-1 text-xs font-semibold text-on-surface-variant">
              Date of Birth
              <input
                type="date"
                value={profile.dateOfBirth}
                onChange={(event) => updateField('dateOfBirth', event.target.value)}
                className="h-10 px-3 rounded-lg bg-surface-container-lowest border border-outline-variant/30 text-sm font-normal text-on-surface focus:outline-none focus:ring-1 focus:ring-primary"
              />
            </label>

            <label className="sm:col-span-2 flex flex-col gap-1 text-xs font-semibold text-on-surface-variant">
              Address
              <textarea
                value={profile.address}
                onChange={(event) => updateField('address', event.target.value)}
                placeholder="House, street, area, city"
                rows={3}
                className="px-3 py-2.5 rounded-lg bg-surface-container-lowest border border-outline-variant/30 text-sm font-normal text-on-surface resize-none focus:outline-none focus:ring-1 focus:ring-primary"
              />
            </label>

            <label className="sm:col-span-2 flex flex-col gap-1 text-xs font-semibold text-on-surface-variant">
              Dietary or Service Notes
              <textarea
                value={profile.notes}
                onChange={(event) => updateField('notes', event.target.value)}
                placeholder="Allergies, preferences, or special requests"
                rows={2}
                className="px-3 py-2.5 rounded-lg bg-surface-container-lowest border border-outline-variant/30 text-sm font-normal text-on-surface resize-none focus:outline-none focus:ring-1 focus:ring-primary"
              />
            </label>
          </div>

          <div className="mt-4 pt-4 border-t border-outline-variant/20 space-y-2">
            <label className="flex items-center justify-between gap-3 text-xs text-on-surface cursor-pointer">
              <span>
                <span className="font-semibold block">Order updates</span>
              </span>
              <input
                type="checkbox"
                checked={profile.orderUpdates}
                onChange={(event) => updateField('orderUpdates', event.target.checked)}
                className="w-4 h-4 accent-primary"
              />
            </label>
            <label className="flex items-center justify-between gap-3 text-xs text-on-surface cursor-pointer">
              <span>
                <span className="font-semibold block">Promotional messages</span>
              </span>
              <input
                type="checkbox"
                checked={profile.promotionalMessages}
                onChange={(event) => updateField('promotionalMessages', event.target.checked)}
                className="w-4 h-4 accent-primary"
              />
            </label>
          </div>

          <div className="mt-5 flex justify-end gap-2">
            <button
              type="button"
              onClick={() => setProfile(savedProfile)}
              disabled={!hasChanges || saving}
              className="h-10 px-4 rounded-lg bg-surface-container-high text-on-surface text-xs font-bold disabled:opacity-50 cursor-pointer"
            >
              Discard
            </button>
            <button
              type="submit"
              disabled={saving}
              className="h-10 px-5 rounded-lg bg-primary text-on-primary text-xs font-bold shadow-md disabled:opacity-50 cursor-pointer"
            >
              {saving ? 'Saving...' : 'Save Profile'}
            </button>
          </div>

          {/* DPDP Act 2023 Controls in Edit View */}
          <div className="mt-4 pt-4 border-t border-outline-variant/20 flex flex-wrap items-center justify-between gap-2">
            <button
              type="button"
              onClick={handleExportData}
              disabled={exporting}
              className="text-xs font-semibold text-primary hover:underline flex items-center gap-1 cursor-pointer"
            >
              <span className="material-symbols-outlined text-[16px]">download</span>
              <span>{exporting ? 'Exporting...' : 'Export Personal Data (JSON)'}</span>
            </button>

            <button
              type="button"
              onClick={() => setShowDeleteConfirm(true)}
              className="text-xs font-bold text-error hover:underline flex items-center gap-1 cursor-pointer"
            >
              <span className="material-symbols-outlined text-[16px]">person_remove</span>
              <span>Erase Profile &amp; Data</span>
            </button>
          </div>
        </section>

        <div className="pt-4 border-t border-outline-variant/20 flex flex-wrap items-center justify-between gap-3 text-xs text-on-surface-variant">
          <span>&copy; {new Date().getFullYear()} Seth Sawariya CafeOS</span>
          <div className="flex gap-4">
            <button
              type="button"
              onClick={onNavigatePrivacyPolicy}
              className="hover:text-primary transition-colors cursor-pointer underline"
            >
              Privacy Policy
            </button>
            <button
              type="button"
              onClick={onNavigateTerms}
              className="hover:text-primary transition-colors cursor-pointer underline"
            >
              Terms & Conditions
            </button>
          </div>
        </div>
      </form>

      {showDeleteConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs">
          <div className="w-full max-w-sm rounded-2xl bg-surface-container p-5 border border-outline-variant shadow-xl">
            <div className="flex items-center gap-3 text-error mb-3">
              <span className="material-symbols-outlined text-2xl">warning</span>
              <h3 className="font-bold text-base text-on-surface">Erase Personal Data?</h3>
            </div>
            <p className="text-xs text-on-surface-variant leading-relaxed mb-4">
              Under Section 12 of India&apos;s DPDP Act 2023, you have the right to erase your customer profile and personal records. Past tax invoices are archived anonymously for mandatory compliance (GST Act 2017). This cannot be undone.
            </p>
            <div className="flex justify-end gap-2.5">
              <button
                type="button"
                onClick={() => setShowDeleteConfirm(false)}
                disabled={deletingAccount}
                className="px-4 py-2 rounded-xl bg-surface-container-high hover:bg-surface-container text-xs font-semibold text-on-surface cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleDeleteAccount}
                disabled={deletingAccount}
                className="px-4 py-2 rounded-xl bg-error hover:bg-error/90 text-xs font-bold text-white shadow-sm cursor-pointer flex items-center gap-1.5"
              >
                <span className="material-symbols-outlined text-[15px]">delete_forever</span>
                <span>{deletingAccount ? 'Erasing...' : 'Confirm Erasure'}</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
