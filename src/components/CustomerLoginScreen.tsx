import React, { useState, useEffect, useCallback, memo } from 'react';
import { CAFE_ASSETS } from '../data/cafeSeedData';
import {
  loginWithGoogle,
  loginWithGoogleDemo,
  clearLocalCustomerSession,
  getLocalCustomerSession,
  saveLocalCustomerSession,
  logoutCustomer,
  isGoogleIdentityConfigured,
  loadGoogleIdentityScript,
  type CustomerAuthSession,
} from '../lib/supabaseClient';

interface CustomerLoginScreenProps {
  onNotify: (message: string) => void;
  onSuccess?: () => void;
  onBrowseMenu: () => void;
  hasCartItems?: boolean;
  onReturnToCart?: () => void;
  onLocalTestSessionChange?: (session: CustomerAuthSession | null) => void;
  initialTab?: 'register' | 'login';
}

const FormingTitleLine = memo<{ text: string; startIndex: number }>(({ text, startIndex }) => (
  <span className="block">
    {Array.from(text).map((character, index) => (
      <span
        aria-hidden="true"
        className="forming-title-letter"
        key={`${startIndex}-${index}-${character}`}
        style={{ '--letter-index': startIndex + index } as React.CSSProperties}
      >
        {character === ' ' ? '\u00a0' : character}
      </span>
    ))}
  </span>
));
FormingTitleLine.displayName = 'FormingTitleLine';

export const CustomerLoginScreen: React.FC<CustomerLoginScreenProps> = ({
  onNotify,
  onSuccess,
  onBrowseMenu,
  hasCartItems = false,
  onReturnToCart,
  onLocalTestSessionChange,
}) => {
  const [isGoogleLoading, setIsGoogleLoading] = useState(false);
  const [isGoogleSdkReady, setIsGoogleSdkReady] = useState(!isGoogleIdentityConfigured);
  const [isGoogleSdkLoadError, setIsGoogleSdkLoadError] = useState(false);
  const [currentSession, setCurrentSession] = useState<CustomerAuthSession | null>(getLocalCustomerSession);
  const [statusBanner, setStatusBanner] = useState<{ type: 'success' | 'error'; message: string } | null>(null);
  const [isLoggingOut, setIsLoggingOut] = useState(false);
  const [phoneDraft, setPhoneDraft] = useState('');
  const [isSavingPhone, setIsSavingPhone] = useState(false);

  // Smooth client-side SPA navigation without full page reload flash
  const navigateSmooth = useCallback((path: string) => {
    if (typeof window !== 'undefined') {
      window.history.pushState({}, '', path);
      window.dispatchEvent(new PopStateEvent('popstate'));
    }
  }, []);

  useEffect(() => {
    // Check initial local or cookie customer session
    const existing = getLocalCustomerSession();
    if (existing) {
      setCurrentSession(existing);
    }
  }, []);

  useEffect(() => {
    if (!isGoogleIdentityConfigured) return;
    let isCancelled = false;
    void loadGoogleIdentityScript()
      .then(() => {
        if (!isCancelled) setIsGoogleSdkReady(true);
      })
      .catch((error: unknown) => {
        if (isCancelled) return;
        setIsGoogleSdkLoadError(true);
        const message =
          error instanceof Error ? error.message : 'Google Sign-In could not be loaded.';
        setStatusBanner({ type: 'error', message });
      });
    return () => {
      isCancelled = true;
    };
  }, []);

  const handleSavePhone = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    const digits = phoneDraft.replace(/\D/g, '');
    const cleanPhone =
      digits.length === 12 && digits.startsWith('91')
        ? digits.slice(2)
        : digits.length === 11 && digits.startsWith('0')
          ? digits.slice(1)
          : digits;
    if (!/^\d{10}$/.test(cleanPhone)) {
      onNotify('Please enter a valid 10-digit mobile number.');
      return;
    }
    if (!currentSession) return;
    setIsSavingPhone(true);
    try {
      const res = await fetch('/api/customer/profile', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          customerId: currentSession.id,
          name: currentSession.name,
          email: currentSession.email,
          phone: cleanPhone,
        }),
      });
      if (!res.ok) throw new Error('Could not save mobile number.');
      const updatedSession: CustomerAuthSession = {
        ...currentSession,
        phone: cleanPhone,
        phoneVerified: false,
      };
      saveLocalCustomerSession(updatedSession);
      setCurrentSession(updatedSession);
      onLocalTestSessionChange?.(updatedSession);
      setPhoneDraft('');
      setStatusBanner({
        type: 'success',
        message: `Mobile number +91 ${cleanPhone} saved & synced to your Cafe CRM account!`,
      });
      onNotify(`Mobile number updated to +91 ${cleanPhone}`);
      setTimeout(() => onSuccess?.(), 800);
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Failed to update phone number.';
      setStatusBanner({ type: 'error', message: msg });
    } finally {
      setIsSavingPhone(false);
    }
  };

  const handleGoogleSignIn = async () => {
    setIsGoogleLoading(true);
    setStatusBanner(null);
    try {
      const result = await loginWithGoogle();
      if (result.session) {
        setCurrentSession(result.session);
        onLocalTestSessionChange?.(result.session);
        setStatusBanner({
          type: 'success',
          message: `Signed in with Google as ${result.session.name}!`,
        });
        onNotify(`Welcome, ${result.session.name}!`);
        setTimeout(() => {
          onSuccess?.();
        }, 700);
      }
    } catch (err) {
      const rawMsg = err instanceof Error ? err.message : 'Google sign-in failed.';
      const isOriginMismatch =
        rawMsg.toLowerCase().includes('origin') ||
        rawMsg.toLowerCase().includes('client id') ||
        rawMsg.toLowerCase().includes('not allowed');

      if (isOriginMismatch) {
        const originUrl = typeof window !== 'undefined' ? window.location.origin : 'http://localhost:3002';
        setStatusBanner({
          type: 'error',
          message: `Google Cloud Origin Setup: To enable Google Popup for this URL, add "${originUrl}" under "Authorized JavaScript origins" in Google Cloud Console.`,
        });
        onNotify(`Google sign-in: Origin "${originUrl}" must be authorized in Google Cloud Console.`);
      } else {
        setStatusBanner({ type: 'error', message: rawMsg });
        onNotify(`Google auth: ${rawMsg}`);
      }
    } finally {
      setIsGoogleLoading(false);
    }
  };

  const handleDemoGoogleLogin = async () => {
    setIsGoogleLoading(true);
    setStatusBanner(null);
    try {
      const session = await loginWithGoogleDemo();
      setCurrentSession(session);
      onLocalTestSessionChange?.(session);
      setStatusBanner({
        type: 'success',
        message: `Signed in as ${session.name} (Demo Google Account)!`,
      });
      onNotify(`Welcome, ${session.name}!`);
      setTimeout(() => onSuccess?.(), 700);
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Demo sign-in failed.';
      setStatusBanner({ type: 'error', message: msg });
    } finally {
      setIsGoogleLoading(false);
    }
  };

  const handleLogout = async () => {
    setIsLoggingOut(true);
    try {
      if (currentSession?.isLocalTestAccount) {
        clearLocalCustomerSession();
        setCurrentSession(null);
        onLocalTestSessionChange?.(null);
        setStatusBanner({ type: 'success', message: 'Local test session cleared.' });
        onNotify('Logged out from local customer account.');
        return;
      }
      await logoutCustomer();
      clearLocalCustomerSession();
      setCurrentSession(null);
      onLocalTestSessionChange?.(null);
      setStatusBanner({ type: 'success', message: 'You have logged out successfully.' });
      onNotify('Logged out from customer account');
    } catch (error) {
      setStatusBanner({
        type: 'error',
        message: error instanceof Error ? error.message : 'Could not complete sign out.',
      });
    } finally {
      setIsLoggingOut(false);
    }
  };

  // If already logged in
  if (currentSession) {
    return (
      <div className="customer-screen-enter flex min-h-[calc(100vh-4rem)] items-center justify-center px-4 py-8 sm:px-6">
        <div className="w-full max-w-lg overflow-hidden rounded-[28px] border border-outline-variant/30 bg-surface-container-low shadow-[0_24px_70px_rgba(56,35,25,0.14)] transition-all duration-300">
          <div className="relative h-32 overflow-hidden bg-[#382319]">
            <img
              src={CAFE_ASSETS.heroInterior}
              alt=""
              className="h-full w-full object-cover opacity-65 transition-transform duration-700 hover:scale-105"
            />
            <div className="absolute inset-0 bg-gradient-to-t from-[#20130f]/90 via-[#20130f]/30 to-transparent" />
            <div className="absolute bottom-4 left-6 flex items-center gap-3">
              <div className="relative group">
                {currentSession.avatarUrl ? (
                  <img
                    src={currentSession.avatarUrl}
                    alt={currentSession.name}
                    className="h-14 w-14 rounded-full border-2 border-[#C59B67] object-cover shadow-lg transition-transform duration-300 group-hover:scale-105"
                  />
                ) : (
                  <div className="flex h-14 w-14 items-center justify-center rounded-full border-2 border-[#C59B67] bg-[#C67C4E] text-xl font-black text-white shadow-lg transition-transform duration-300 group-hover:scale-105">
                    {currentSession.name.charAt(0).toUpperCase()}
                  </div>
                )}
                <span className="absolute bottom-0 right-0 h-3.5 w-3.5 rounded-full border-2 border-white bg-emerald-500 shadow-xs" />
              </div>
              <div className="text-white">
                <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-[#C59B67]">
                  {currentSession.isLocalTestAccount ? 'Local test member' : 'Roastery Club Member'}
                </p>
                <h2 className="text-xl font-black tracking-tight">{currentSession.name}</h2>
              </div>
            </div>
          </div>

          <div className="space-y-5 p-6 sm:p-7">
            {statusBanner && (
              <div
                className={`animate-in fade-in slide-in-from-top-1 flex items-center justify-between rounded-xl border p-3 text-xs duration-200 ${
                  statusBanner.type === 'success'
                    ? 'border-emerald-300 bg-emerald-50 text-emerald-800'
                    : 'border-rose-300 bg-rose-50 text-rose-800'
                }`}
              >
                <div className="flex items-center gap-2">
                  <span className="material-symbols-outlined text-[17px]">
                    {statusBanner.type === 'success' ? 'check_circle' : 'error'}
                  </span>
                  <span>{statusBanner.message}</span>
                </div>
                <button
                  type="button"
                  onClick={() => setStatusBanner(null)}
                  className="cursor-pointer text-current opacity-60 hover:opacity-100"
                >
                  <span className="material-symbols-outlined text-[15px]">close</span>
                </button>
              </div>
            )}

            <div className="grid grid-cols-2 gap-3">
              <div className="group rounded-2xl border border-outline-variant/25 bg-surface-container-lowest/70 p-3.5 transition-all duration-200 hover:-translate-y-0.5 hover:shadow-xs">
                <p className="text-[10px] font-bold uppercase tracking-wider text-on-surface-variant">Membership</p>
                <p className="mt-1 flex items-center gap-1.5 text-sm font-bold text-on-surface">
                  <span className="material-symbols-outlined text-[17px] text-primary transition-transform duration-200 group-hover:scale-115">
                    verified
                  </span>
                  {currentSession.isLocalTestAccount ? 'Local Dev' : 'Google Verified'}
                </p>
              </div>
              <div className="group rounded-2xl border border-outline-variant/25 bg-surface-container-lowest/70 p-3.5 transition-all duration-200 hover:-translate-y-0.5 hover:shadow-xs">
                <p className="text-[10px] font-bold uppercase tracking-wider text-on-surface-variant">Digital Invoices</p>
                <p className="mt-1 flex items-center gap-1.5 text-sm font-bold text-emerald-600">
                  <span className="material-symbols-outlined text-[17px] transition-transform duration-200 group-hover:scale-115">
                    mark_email_read
                  </span>
                  Live via Brevo
                </p>
              </div>
            </div>

            <div className="rounded-2xl border border-outline-variant/20 bg-surface-container px-4 py-3">
              <p className="text-[10px] font-bold uppercase tracking-wider text-on-surface-variant">Active Email</p>
              <p className="mt-1 truncate text-sm font-semibold text-on-surface">{currentSession.email}</p>
            </div>

            <div className="rounded-2xl border border-outline-variant/20 bg-surface-container px-4 py-3">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-[10px] font-bold uppercase tracking-wider text-on-surface-variant">
                    WhatsApp &amp; Contact Number
                  </p>
                  <p className="mt-1 text-sm font-semibold text-on-surface">
                    {currentSession.phone ? `+91 ${currentSession.phone}` : 'Not linked yet'}
                  </p>
                </div>
                {!currentSession.phone ? (
                  <form onSubmit={handleSavePhone} className="flex items-center gap-1.5">
                    <input
                      type="tel"
                      inputMode="tel"
                      autoComplete="tel"
                      aria-label="Mobile number"
                      value={phoneDraft}
                      onChange={(event) => setPhoneDraft(event.target.value)}
                      placeholder="Mobile number"
                      className="w-32 rounded-lg border border-outline-variant bg-surface-container px-2 py-1.5 text-xs text-on-surface"
                    />
                    <button
                      type="submit"
                      disabled={isSavingPhone || !phoneDraft.trim()}
                      className="flex cursor-pointer items-center gap-1 rounded-xl bg-gradient-to-r from-[#C67C4E] to-[#B65B2A] px-3 py-1.5 text-xs font-bold text-white shadow-sm hover:brightness-105 active:scale-95 disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      {isSavingPhone ? 'Saving…' : 'Save'}
                    </button>
                  </form>
                ) : (
                  <span className="flex items-center gap-1 text-xs font-bold text-emerald-600">
                    <span className="material-symbols-outlined text-[15px]">verified</span>
                    Linked
                  </span>
                )}
              </div>
            </div>

            <div className="space-y-2.5 pt-1">
              {hasCartItems && onReturnToCart && (
                <button
                  type="button"
                  onClick={onReturnToCart}
                  className="group flex h-12 w-full cursor-pointer items-center justify-center gap-2 rounded-2xl bg-[#382319] text-sm font-bold text-white shadow-lg transition-all duration-200 hover:bg-[#4A3023] hover:shadow-xl hover:-translate-y-0.5 active:translate-y-0 active:scale-[0.985]"
                >
                  <span className="material-symbols-outlined text-[19px] transition-transform duration-200 group-hover:scale-110">
                    shopping_bag
                  </span>
                  Return to Cart &amp; Place Order
                </button>
              )}

              <button
                type="button"
                onClick={onBrowseMenu}
                className="group flex h-12 w-full cursor-pointer items-center justify-center gap-2 rounded-2xl bg-primary text-sm font-bold text-on-primary shadow-lg transition-all duration-200 hover:brightness-105 hover:shadow-xl hover:-translate-y-0.5 active:translate-y-0 active:scale-[0.985]"
              >
                <span className="material-symbols-outlined text-[19px] transition-transform duration-200 group-hover:rotate-12">
                  restaurant_menu
                </span>
                Browse the Cafe Menu
              </button>

              <button
                type="button"
                onClick={handleLogout}
                disabled={isLoggingOut}
                className="flex h-11 w-full cursor-pointer items-center justify-center gap-2 rounded-2xl border border-outline-variant/30 text-sm font-semibold text-on-surface-variant transition-all duration-200 hover:border-rose-300 hover:bg-rose-50 hover:text-rose-700 active:scale-[0.985] disabled:cursor-not-allowed disabled:opacity-50"
              >
                {isLoggingOut ? (
                  <span className="h-4 w-4 animate-spin rounded-full border-2 border-rose-600 border-t-transparent" />
                ) : (
                  <span className="material-symbols-outlined text-[18px]">logout</span>
                )}
                {isLoggingOut ? 'Logging out...' : 'Log Out'}
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="relative min-h-screen w-full overflow-x-clip overflow-y-auto bg-[#fffaf2] text-[#321d14]">
      <header className="relative z-20 flex h-[86px] items-center justify-between px-6 sm:px-10 lg:px-[58px]">
        <button
          type="button"
          onClick={() => navigateSmooth('/customer')}
          className="group flex cursor-pointer items-center gap-3 text-left transition-transform duration-200 hover:scale-[1.02] active:scale-95"
        >
          <div className="h-[52px] w-[52px] rounded-full overflow-hidden border-2 border-[#D4AF37]/60 shadow-md shrink-0 bg-black p-0.5">
            <img src="/images/tsc-logo.jpg" alt="The Sawariya Cafe Logo" className="w-full h-full object-cover rounded-full" />
          </div>
          <div>
            <div className="font-serif text-[22px] font-bold leading-[0.95] tracking-[-0.02em] text-[#3B1D12] sm:text-[26px] group-hover:text-[#A85C36] transition-colors">
              The Sawariya Cafe
            </div>
            <div className="mt-1 text-left text-[9px] font-black tracking-[0.2em] text-[#A85C36]">GOOD FOOD • GOOD MOOD</div>
          </div>
        </button>

        <nav className="hidden items-center gap-10 text-[13px] font-bold text-[#321d14] md:flex">
          <button
            type="button"
            onClick={onBrowseMenu}
            className="group relative py-1 cursor-pointer transition-colors hover:text-[#A44F28]"
          >
            <span>Menu</span>
            <span className="absolute bottom-0 left-0 h-0.5 w-0 bg-[#A44F28] transition-all duration-200 group-hover:w-full" />
          </button>
          <button
            type="button"
            onClick={() => navigateSmooth('/customer/rewards')}
            className="group relative py-1 cursor-pointer transition-colors hover:text-[#A44F28]"
          >
            <span>Rewards</span>
            <span className="absolute bottom-0 left-0 h-0.5 w-0 bg-[#A44F28] transition-all duration-200 group-hover:w-full" />
          </button>
          <button
            type="button"
            onClick={() => navigateSmooth('/customer/tracking')}
            className="group relative py-1 cursor-pointer transition-colors hover:text-[#A44F28]"
          >
            <span>Track Order</span>
            <span className="absolute bottom-0 left-0 h-0.5 w-0 bg-[#A44F28] transition-all duration-200 group-hover:w-full" />
          </button>
        </nav>

        <div className="flex items-center gap-2.5">
          <button
            type="button"
            onClick={onBrowseMenu}
            className="hidden sm:flex h-[42px] cursor-pointer items-center justify-center gap-1.5 rounded-[12px] border border-[#5A321F]/20 px-3.5 text-[12px] font-bold text-[#5A321F] transition-all duration-200 hover:border-[#5A321F] hover:bg-[#5A321F]/5 active:scale-95"
          >
            <span className="material-symbols-outlined text-[17px]">storefront</span>
            Cafe Home
          </button>
          <span className="flex h-[42px] min-w-[100px] items-center justify-center gap-1.5 rounded-[12px] bg-[#5A321F] px-3.5 text-[12px] font-bold text-white shadow-[0_4px_14px_rgba(90,50,31,0.18)]">
            <span className="material-symbols-outlined text-[18px]">lock</span>
            Secure Portal
          </span>
        </div>
      </header>

      {/* Left cafe line-art scene */}
      <div className="pointer-events-none absolute bottom-0 left-0 hidden h-[620px] w-[300px] overflow-hidden lg:block opacity-90 transition-opacity duration-500 hover:opacity-100" aria-hidden="true">
        <svg className="absolute bottom-0 left-0 h-[570px] w-[300px]" viewBox="0 0 300 570" fill="none">
          <defs>
            <linearGradient id="awning" x1="0" y1="0" x2="300" y2="0">
              <stop stopColor="#B56B43" />
              <stop offset=".5" stopColor="#FFF1DD" />
              <stop offset="1" stopColor="#B56B43" />
            </linearGradient>
          </defs>
          <path d="M0 226h210l90 74H0v-74Z" fill="url(#awning)" />
          <path d="M0 226h210l90 74H0v-74Z" fill="#FFF7E9" opacity=".35" />
          <path d="M0 226h210l90 74H0v-74Z" stroke="#B56B43" strokeWidth="2" />
          {[18, 48, 78, 108, 138, 168, 198, 228, 258, 288].map((x, i) => (
            <path key={x} d={`M${x} 226l${i % 2 ? 28 : -26} 74`} stroke="#B56B43" strokeWidth="18" opacity={i % 2 ? ".95" : ".12"} />
          ))}
          <path d="M18 280h232v290H18z" fill="#FFF3DF" stroke="#B56B43" strokeWidth="3" />
          <path d="M42 332h184v238H42z" fill="#6B3B2A" opacity=".78" />
          <path d="M52 348h164v222H52z" fill="#B85B36" opacity=".28" />
          <rect x="135" y="332" width="10" height="238" fill="#E7C49D" />
          <rect x="52" y="424" width="164" height="8" fill="#E7C49D" />
          <path d="M34 570V274" stroke="#5A321F" strokeWidth="6" />
          <path d="M34 326h72" stroke="#5A321F" strokeWidth="5" />
          <circle cx="106" cy="326" r="6" fill="#5A321F" />
          <circle cx="106" cy="326" r="3" fill="#FFF1D7" />
          <circle cx="106" cy="362" r="42" fill="#FFF0CE" stroke="#5A321F" strokeWidth="5" />
          <path d="M106 332c-14 8-18 24-12 38h24c6-14 2-30-12-38Z" fill="#7A452E" />
          <g fill="#E0A84E" opacity=".9">
            <circle cx="78" cy="455" r="14" /><circle cx="165" cy="392" r="12" /><circle cx="188" cy="470" r="10" />
          </g>
          <g stroke="#5A321F" strokeWidth="5">
            <path d="M190 570c-10-48 8-94 18-132" />
            <path d="M188 570c18-44 42-72 61-91" />
            <path d="M205 438c-11-14-15-30-10-47M205 438c18-12 31-25 38-42M206 470c18-8 33-17 44-31M198 520c22-5 40-15 54-29" />
          </g>
          <g fill="#C9A66A">
            <ellipse cx="190" cy="394" rx="10" ry="24" transform="rotate(-24 190 394)" />
            <ellipse cx="238" cy="400" rx="9" ry="21" transform="rotate(42 238 400)" />
            <ellipse cx="246" cy="443" rx="9" ry="20" transform="rotate(55 246 443)" />
            <ellipse cx="250" cy="493" rx="8" ry="18" transform="rotate(58 250 493)" />
          </g>
          <path d="M244 570h-88l-8-43h104l-8 43Z" fill="#FFF8ED" stroke="#B56B43" strokeWidth="3" />
          <g stroke="#5A321F" strokeWidth="4" strokeLinecap="round">
            <path d="M96 500v70M78 570l18-70 18 70M72 544h48" />
            <path d="M48 508c18-10 36-10 54 0M48 508v62M102 508v62" />
          </g>
        </svg>

        {/* hanging vines */}
        <svg className="absolute left-[-10px] top-[-15px] h-[270px] w-[230px]" viewBox="0 0 230 270" fill="none" aria-hidden="true">
          <path d="M4 0c34 48 92 60 145 48 44-10 71-31 81-53" stroke="#6E7A3B" strokeWidth="3" />
          {[
            [24,45,-30],[44,58,-18],[68,68,20],[92,77,-30],[118,82,24],[145,80,-18],[168,65,28],
            [38,82,35],[70,110,18],[98,116,-25],[128,118,38],[155,106,-20],[178,96,32],
            [54,145,22],[88,154,-32],[118,158,24],[150,150,-18],
          ].map(([x,y,r], i) => (
            <ellipse key={i} cx={x} cy={y} rx="12" ry="7" transform={`rotate(${r} ${x} ${y})`} fill={i % 3 === 0 ? "#A8A35A" : "#7F8A49"} stroke="#69753A" strokeWidth="1" />
          ))}
        </svg>
      </div>

      {/* Right botanical and latte illustration */}
      <div className="pointer-events-none absolute right-[-10px] bottom-[-10px] hidden h-[590px] w-[260px] lg:block opacity-90 transition-opacity duration-500 hover:opacity-100" aria-hidden="true">
        <svg className="absolute right-[-10px] top-[-100px] h-[330px] w-[230px]" viewBox="0 0 230 330" fill="none">
          <path d="M80 280c30-78 66-145 130-220M100 230c-22-38-42-66-68-86M132 174c42-14 71-38 92-71M153 125c-8-38-5-70 7-98" stroke="#B56B43" strokeWidth="2" />
          {[
            [44,144,-40],[54,158,22],[75,188,-35],[87,207,28],[112,230,-30],[130,177,35],[145,155,-28],[177,112,34],
            [195,93,-30],[205,76,25],[163,69,-25],[169,38,38],[194,53,-25],
          ].map(([x,y,r], i) => (
            <path key={i} d={`M${x} ${y}c-23-14-29-31-16-47 20 4 33 18 16 47Z`} fill="#FFF9EF" stroke="#B56B43" strokeWidth="2" transform={`rotate(${r} ${x} ${y})`} />
          ))}
        </svg>

        <svg className="absolute bottom-[-4px] right-[5px] h-[330px] w-[250px]" viewBox="0 0 250 330" fill="none">
          <ellipse cx="137" cy="278" rx="112" ry="24" fill="#C78B56" opacity=".28" />
          <ellipse cx="137" cy="256" rx="104" ry="28" fill="#FFF8EC" stroke="#9A6038" strokeWidth="3" />
          <ellipse cx="137" cy="249" rx="82" ry="20" fill="#E2B17C" stroke="#9A6038" strokeWidth="2" />
          <path d="M63 128h148l-14 120c-4 36-28 57-60 57s-56-21-60-57L63 128Z" fill="#FFF7EA" stroke="#B56B43" strokeWidth="4" />
          <ellipse cx="137" cy="130" rx="74" ry="28" fill="#F4B75E" stroke="#9A6038" strokeWidth="4" />
          <ellipse cx="137" cy="131" rx="60" ry="20" fill="#C47A3A" />
          <path d="M104 136c11-18 27-25 38-10 9-15 23-12 31 2-20 10-44 16-69 8Z" fill="#FFF1D2" />
          <path d="M132 145c-3-25 10-43 31-58M132 145c-18-18-26-31-25-48M132 145c16-14 29-23 43-27" stroke="#FFF8E8" strokeWidth="5" strokeLinecap="round" />
          <path d="M132 145c-15-8-22-15-27-26M132 145c12-11 21-20 24-34" stroke="#A86A3D" strokeWidth="2" strokeLinecap="round" />
        </svg>
      </div>

      <main className="relative z-10 flex min-h-[calc(100%-86px)] justify-center px-4 pb-10 pt-4 sm:px-6 lg:pt-2">
        <div className="w-full max-w-[520px] text-center">
          <div className="mx-auto mb-2 flex h-14 w-14 items-center justify-center text-[#A85C36] transition-transform duration-300 hover:scale-110">
            <svg className="h-12 w-12" viewBox="0 0 48 48" fill="none" aria-hidden="true">
              <path d="M13 17h22v9c0 7.18-5.82 13-13 13h-1c-4.42 0-8-3.58-8-8V17Z" stroke="currentColor" strokeWidth="2" />
              <path d="M35 21h3.5c3 0 5.5 2.47 5.5 5.5S41.5 32 38.5 32H35" stroke="currentColor" strokeWidth="2" />
              <path d="M22 13c-3-3.5.8-5.6 0-8M29 13c-3-3.5.8-5.6 0-8" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
            </svg>
          </div>

          <h1
            aria-label="Welcome to Seth Sawariya Cafe"
            className="font-cursive text-[32px] min-[360px]:text-[40px] font-normal leading-[1.05] text-[#321D14] sm:text-[54px] sm:leading-[0.92]"
          >
            <FormingTitleLine text="Welcome to" startIndex={0} />
            <FormingTitleLine text="Seth Sawariya Cafe" startIndex={11} />
          </h1>

          {statusBanner && (
            <div className={`mx-auto mt-4 max-w-[520px] rounded-2xl border p-3.5 sm:p-4 text-left text-xs shadow-xs animate-in fade-in slide-in-from-top-2 duration-200 ${
              statusBanner.type === 'success'
                ? 'border-emerald-300 bg-emerald-50 text-emerald-800'
                : 'border-rose-300 bg-rose-50 text-rose-800'
            }`}>
              <div className="flex items-start gap-2.5">
                <span className="material-symbols-outlined text-[19px] shrink-0 mt-0.5">
                  {statusBanner.type === 'success' ? 'check_circle' : 'error'}
                </span>
                <div className="flex-1 min-w-0">
                  <p className="font-semibold leading-relaxed">{statusBanner.message}</p>
                  {statusBanner.type === 'error' && (
                    <div className="mt-2.5 pt-2 border-t border-rose-200 flex flex-wrap gap-2">
                      <button
                        type="button"
                        onClick={handleDemoGoogleLogin}
                        className="px-3 py-1.5 rounded-lg bg-rose-700 text-white font-bold text-[11px] hover:bg-rose-800 cursor-pointer shadow-xs active:scale-95 transition-all"
                      >
                        ⚡ Bypass with Demo Account &rarr;
                      </button>
                    </div>
                  )}
                </div>
                <button
                  type="button"
                  onClick={() => setStatusBanner(null)}
                  className="cursor-pointer text-current opacity-60 hover:opacity-100"
                >
                  <span className="material-symbols-outlined text-[16px]">close</span>
                </button>
              </div>
            </div>
          )}

          <div className="mx-auto mt-5 sm:mt-6 w-full max-w-[520px] rounded-[24px] border border-[#E9D9C6] bg-[#FFFDF9] px-4 py-5 min-[380px]:px-6 sm:px-8 sm:py-6 shadow-[0_18px_40px_rgba(91,55,35,0.08)]">
            <button
              type="button"
              onClick={handleGoogleSignIn}
              disabled={
                isGoogleLoading ||
                (isGoogleIdentityConfigured && !isGoogleSdkReady) ||
                !isGoogleIdentityConfigured
              }
              className="group relative flex h-[54px] w-full cursor-pointer items-center justify-center gap-3 rounded-full bg-[#5A321F] px-5 text-[14px] font-bold text-white shadow-[0_8px_20px_rgba(90,50,31,0.18)] transition-all duration-200 hover:bg-[#493025] hover:shadow-[0_12px_28px_rgba(90,50,31,0.25)] hover:-translate-y-0.5 active:translate-y-0 active:scale-[0.985] disabled:cursor-not-allowed disabled:opacity-55 overflow-hidden"
            >
              {isGoogleLoading || (isGoogleIdentityConfigured && !isGoogleSdkReady && !isGoogleSdkLoadError) ? (
                <span className="flex items-center gap-2">
                  <span className="h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent" />
                  {isGoogleSdkReady ? 'Connecting securely...' : 'Initializing Google Sign-In...'}
                </span>
              ) : (
                <>
                  <svg className="h-7 w-7 rounded-full bg-white p-1 transition-transform duration-200 group-hover:scale-105" viewBox="0 0 24 24" aria-hidden="true">
                    <path fill="#4285F4" d="M23.745 12.27c0-.7-.06-1.4-.19-2.07H12v4.51h6.6c-.29 1.52-1.14 2.8-2.4 3.66v3.05h3.9c2.27-2.09 3.64-5.17 3.64-9.15z" />
                    <path fill="#34A853" d="M12 24c3.24 0 5.95-1.08 7.93-2.91l-3.9-3.05c-1.08.72-2.45 1.16-4.03 1.16-3.13 0-5.78-2.11-6.73-4.96H1.21v3.15C3.25 21.4 7.33 24 12 24z" />
                    <path fill="#FBBC05" d="M5.27 14.24c-.25-.72-.38-1.49-.38-2.24s.13-1.52.38-2.24V6.61H1.21C.44 8.14 0 9.99 0 12s.44 3.86 1.21 5.39l4.06-3.15z" />
                    <path fill="#EA4335" d="M12 4.75c1.77 0 3.35.61 4.6 1.8l3.42-3.42C17.95 1.19 15.24 0 12 0 7.33 0 3.25 2.6 1.21 6.61l4.06 3.15c.95-2.85 3.6-4.96 6.73-4.96z" />
                  </svg>
                  <span>Continue with Google</span>
                </>
              )}
            </button>

            {/* Quick 1-click test button for instant friction-free development and sandbox testing */}
            <div className="relative my-4 flex items-center justify-center">
              <div className="absolute inset-0 flex items-center">
                <div className="w-full border-t border-[#F0E6DA]" />
              </div>
              <span className="relative bg-[#FFFDF9] px-3 text-[10.5px] font-bold text-[#8C7A70] uppercase tracking-wider">
                or instant access
              </span>
            </div>

            <button
              type="button"
              onClick={handleDemoGoogleLogin}
              disabled={isGoogleLoading}
              className="group flex h-[46px] w-full cursor-pointer items-center justify-center gap-2.5 rounded-full border border-[#D9C4B0] bg-[#FFF9F2] px-4 text-[13px] font-bold text-[#5A321F] shadow-xs transition-all duration-200 hover:border-[#5A321F] hover:bg-[#F5ECE0] hover:-translate-y-0.5 active:translate-y-0 active:scale-[0.985] disabled:cursor-not-allowed disabled:opacity-55"
            >
              <span className="material-symbols-outlined text-[19px] text-[#A85C36] transition-transform duration-200 group-hover:rotate-12">
                bolt
              </span>
              <span>One-Click Demo Google Sign-In</span>
            </button>

            {!isGoogleIdentityConfigured && (
              <p className="mt-3 text-[11px] text-amber-700 bg-amber-50 rounded-xl p-2.5 border border-amber-200">
                Google Client ID is not configured. Use the One-Click Demo button above for local testing.
              </p>
            )}

            {/* DPDP Act 2023 Statutory Consent & Privacy Notice */}
            <div className="mt-4 pt-3 border-t border-[#F0E6DA] text-center">
              <p className="text-[11px] leading-relaxed text-[#7B675A]">
                By signing in, you consent to the processing of your personal information (name, email) for food order preparation, digital invoicing, and loyalty beans under India&apos;s{' '}
                <strong className="text-[#4A2D1B]">Digital Personal Data Protection Act, 2023</strong>. You may withdraw consent or request data erasure at any time. Review our{' '}
                <button
                  type="button"
                  onClick={() => navigateSmooth('/customer/privacy-policy')}
                  className="font-bold text-[#A85C36] underline hover:text-[#5A321F] cursor-pointer"
                >
                  Privacy Policy
                </button>{' '}
                and{' '}
                <button
                  type="button"
                  onClick={() => navigateSmooth('/customer/terms-and-conditions')}
                  className="font-bold text-[#A85C36] underline hover:text-[#5A321F] cursor-pointer"
                >
                  Terms of Service
                </button>.
              </p>
            </div>

            {/* Interactive Feature Pills */}
            <div className="mt-5 grid grid-cols-3 gap-2.5 border-t border-[#F0E6DA] pt-4">
              {[
                {
                  icon: 'card_giftcard',
                  title: 'Reward Beans',
                  subtitle: '25 per feedback',
                  onClick: () => navigateSmooth('/customer/rewards'),
                },
                {
                  icon: 'receipt_long',
                  title: 'Digital Invoices',
                  subtitle: 'Direct on email',
                  onClick: () => onNotify('Digital invoices are sent directly via Brevo on payment!'),
                },
                {
                  icon: 'location_on',
                  title: 'Live Tracking',
                  subtitle: 'Real-time KOT',
                  onClick: () => navigateSmooth('/customer/tracking'),
                },
              ].map((feature) => (
                <button
                  key={feature.title}
                  type="button"
                  onClick={feature.onClick}
                  className="group flex min-w-0 flex-col items-center rounded-xl p-2.5 text-center transition-all duration-200 hover:-translate-y-1 hover:bg-[#F9F3EA] hover:shadow-xs active:scale-95 cursor-pointer border border-transparent hover:border-[#E8DACB]"
                >
                  <span className="material-symbols-outlined mb-1 text-[26px] text-[#5A321F] transition-transform duration-200 group-hover:scale-115 group-hover:text-[#A85C36]">
                    {feature.icon}
                  </span>
                  <p className="text-[11.5px] font-bold leading-tight text-[#321D14] group-hover:text-[#A85C36] transition-colors">
                    {feature.title}
                  </p>
                  <p className="mt-0.5 text-[9.5px] font-medium text-[#7C6E66]">
                    {feature.subtitle}
                  </p>
                </button>
              ))}
            </div>
          </div>

          <button
            type="button"
            onClick={onBrowseMenu}
            className="group mt-5 inline-flex cursor-pointer items-center justify-center gap-2 rounded-full border border-transparent px-5 py-2.5 text-[13px] font-bold text-[#321D14] transition-all duration-200 hover:border-[#E9D9C6] hover:bg-white/80 hover:text-[#A44F28] hover:shadow-xs active:scale-95"
          >
            <span>Continue as Guest &amp; Browse Menu</span>
            <span className="material-symbols-outlined text-[19px] transition-transform duration-200 group-hover:translate-x-1.5">
              arrow_forward
            </span>
          </button>
        </div>
      </main>
    </div>
  );
};
