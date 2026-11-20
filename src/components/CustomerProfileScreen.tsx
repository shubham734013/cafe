import React, { useEffect, useState } from 'react';
import { CAFE_ASSETS } from '../data/cafeSeedData';
import { CafeImage } from './CafeImage';
import {
  getLocalCustomerSession,
  isLiveSupabase,
  logoutCustomer,
  clearLocalCustomerSession,
  requestCustomerPhoneOtp,
  syncCustomerIdentityWithCafe,
  verifyCustomerPhoneOtp,
  type CustomerAuthSession,
} from '../lib/supabaseClient';

interface CustomerProfileScreenProps {
  onNotify: (message: string) => void;
  onBrowseMenu: () => void;
  onNavigateLogin?: () => void;
  onIdentityUpdated?: () => void;
  onSessionChange?: (session: CustomerAuthSession | null) => void;
}

interface CustomerProfile {
  name: string;
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
  onNavigateLogin,
  onIdentityUpdated,
  onSessionChange,
}) => {
  const [profile, setProfile] = useState<CustomerProfile>(loadProfile);
  const [savedProfile, setSavedProfile] = useState<CustomerProfile>(loadProfile);
  const [authSession, setAuthSession] = useState(getLocalCustomerSession);
  const [saving, setSaving] = useState(false);
  const [errors, setErrors] = useState<{ email?: string; phone?: string }>({});
  const [phoneOtp, setPhoneOtp] = useState('');
  const [phoneOtpSent, setPhoneOtpSent] = useState(false);
  const [phoneVerificationBusy, setPhoneVerificationBusy] = useState(false);
  const [phoneVerificationMessage, setPhoneVerificationMessage] = useState('');
  const [phoneVerificationError, setPhoneVerificationError] = useState('');

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

  const handleSubmit = (event: React.FormEvent) => {
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
      onNotify('Personal profile saved');
    } finally {
      setSaving(false);
    }
  };

  const hasChanges = JSON.stringify(profile) !== JSON.stringify(savedProfile);

  const handleSendPhoneOtp = async () => {
    setPhoneVerificationBusy(true);
    setPhoneVerificationError('');
    setPhoneVerificationMessage('');
    try {
      await requestCustomerPhoneOtp(profile.phone.trim());
      setPhoneOtpSent(true);
      setPhoneVerificationMessage('Verification code sent by SMS.');
    } catch (error) {
      setPhoneVerificationError(
        error instanceof Error ? error.message : 'Could not send phone verification code.'
      );
    } finally {
      setPhoneVerificationBusy(false);
    }
  };

  const handleVerifyPhoneOtp = async () => {
    setPhoneVerificationBusy(true);
    setPhoneVerificationError('');
    setPhoneVerificationMessage('');
    try {
      const verifiedSession = await verifyCustomerPhoneOtp(profile.phone.trim(), phoneOtp);
      setAuthSession(verifiedSession);
      const identity = await syncCustomerIdentityWithCafe();
      onIdentityUpdated?.();
      setPhoneVerificationMessage(
        identity?.matched
          ? 'Phone verified. Personalized offers for your customer group are now available.'
          : 'Phone verified. No matching CRM profile was found for this number yet.'
      );
    } catch (error) {
      setPhoneVerificationError(
        error instanceof Error ? error.message : 'Could not verify this phone number.'
      );
    } finally {
      setPhoneVerificationBusy(false);
    }
  };

  return (
    <div className="flex flex-col w-full pb-8 gap-4">
      <div className="flex items-center justify-between pt-1">
        <div>
          <h1 className="text-xl font-bold text-on-surface tracking-tight">Personal Profile</h1>
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
            <div className="relative w-24 h-24 rounded-full p-1 bg-primary/20">
              {profile.name ? (
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
            <h2 className="mt-3 text-base font-bold text-on-surface">{profile.name || 'Guest Customer'}</h2>
            <p className="text-xs text-on-surface-variant">{profile.email || 'Email not added'}</p>
            {authSession ? (
              <div className="mt-3 space-y-2 w-full">
                <span className={`inline-flex items-center gap-1 text-[11px] px-2.5 py-1 rounded-full border font-semibold ${
                  authSession.isLocalTestAccount
                    ? 'bg-primary/10 border-primary/30 text-primary'
                    : 'bg-emerald-500/15 border-emerald-500/30 text-emerald-300'
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
                      setPhoneVerificationError(
                        error instanceof Error ? error.message : 'Could not complete sign out.'
                      );
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
                <p className="text-[11px] text-on-surface-variant">
                  Sign in to sync your orders &amp; reward points!
                </p>
                {onNavigateLogin && (
                  <button
                    type="button"
                    onClick={onNavigateLogin}
                    className="w-full py-2 rounded-xl bg-[#FF6422] hover:bg-[#E55518] text-white text-xs font-bold shadow-sm cursor-pointer transition-all flex items-center justify-center gap-1.5"
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

            <div className="sm:col-span-2 rounded-xl border border-outline-variant/20 bg-surface-container p-3 space-y-2">
              <div className="flex items-center justify-between gap-2">
                <div>
                  <p className="text-xs font-semibold text-on-surface">Personalized offers</p>
                  <p className="mt-0.5 text-[11px] text-on-surface-variant">
                    Verify your phone to match your cafe customer group.
                  </p>
                </div>
                {authSession?.phoneVerified && (
                  <span className="shrink-0 rounded-full bg-emerald-500/10 px-2 py-1 text-[10px] font-semibold text-emerald-700">
                    Phone verified
                  </span>
                )}
              </div>
              {!authSession?.phoneVerified && (
                <div className="flex flex-wrap items-center gap-2">
                  {phoneOtpSent && (
                    <input
                      type="text"
                      inputMode="numeric"
                      autoComplete="one-time-code"
                      maxLength={8}
                      value={phoneOtp}
                      onChange={(event) => setPhoneOtp(event.target.value)}
                      placeholder="SMS code"
                      aria-label="Phone verification code"
                      className="h-9 w-32 rounded-lg border border-outline-variant/30 bg-surface-container-lowest px-3 text-sm text-on-surface"
                    />
                  )}
                  <button
                    type="button"
                    disabled={
                      phoneVerificationBusy ||
                      !authSession ||
                      !isLiveSupabase ||
                      !profile.phone.trim()
                    }
                    onClick={() =>
                      phoneOtpSent ? void handleVerifyPhoneOtp() : void handleSendPhoneOtp()
                    }
                    className="h-9 rounded-lg bg-surface-container-high px-3 text-xs font-semibold text-on-surface disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    {phoneVerificationBusy
                      ? 'Please wait...'
                      : phoneOtpSent
                        ? 'Verify phone'
                        : 'Send SMS code'}
                  </button>
                </div>
              )}
              {phoneVerificationMessage && (
                <p role="status" className="text-[11px] text-emerald-700">
                  {phoneVerificationMessage}
                </p>
              )}
              {phoneVerificationError && (
                <p role="alert" className="text-[11px] text-error">
                  {phoneVerificationError}
                </p>
              )}
              {!authSession && (
                <button
                  type="button"
                  onClick={onNavigateLogin}
                  className="text-[11px] font-semibold text-primary"
                >
                  Sign in to verify your phone
                </button>
              )}
              {authSession && !isLiveSupabase && (
                <p className="text-[11px] text-on-surface-variant">
                  Supabase phone OTP is not configured in this environment.
                </p>
              )}
            </div>

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
                <span className="text-on-surface-variant">Receive updates about active orders</span>
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
                <span className="text-on-surface-variant">Receive offers and cafe announcements</span>
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
        </section>
      </form>
    </div>
  );
};
