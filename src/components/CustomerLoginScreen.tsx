import React, { useState, useEffect } from 'react';
import {
  registerCustomer,
  loginCustomer,
  loginWithGoogle,
  getLocalCustomerSession,
  syncSupabaseCustomerSession,
  subscribeToSupabaseAuth,
  logoutCustomer,
  isLiveSupabase,
  type CustomerAuthSession,
} from '../lib/supabaseClient';

interface CustomerLoginScreenProps {
  onNotify: (message: string) => void;
  onSuccess?: () => void;
  onBrowseMenu: () => void;
  hasCartItems?: boolean;
  onReturnToCart?: () => void;
}

export const CustomerLoginScreen: React.FC<CustomerLoginScreenProps> = ({
  onNotify,
  onSuccess,
  onBrowseMenu,
  hasCartItems = false,
  onReturnToCart,
}) => {
  const [activeTab, setActiveTab] = useState<'register' | 'login'>('register');
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [isGoogleLoading, setIsGoogleLoading] = useState(false);
  const [currentSession, setCurrentSession] = useState<CustomerAuthSession | null>(getLocalCustomerSession);
  const [statusBanner, setStatusBanner] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

  useEffect(() => {
    // Check if user session already exists or returning from Supabase OAuth
    void syncSupabaseCustomerSession().then((session) => {
      if (session) {
        setCurrentSession(session);
      }
    });
    const unsubscribe = subscribeToSupabaseAuth((session) => {
      setCurrentSession(session);
      if (session) {
        setStatusBanner({
          type: 'success',
          message: `Signed in as ${session.name}!`,
        });
      }
    });
    return () => {
      unsubscribe();
    };
  }, []);

  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) {
      setStatusBanner({ type: 'error', message: 'Please enter your full name.' });
      return;
    }
    if (!email.trim() || !email.includes('@')) {
      setStatusBanner({ type: 'error', message: 'Please enter a valid email address.' });
      return;
    }
    if (!phone.trim() || phone.trim().length < 8) {
      setStatusBanner({ type: 'error', message: 'Please enter a valid mobile number.' });
      return;
    }
    if (!password || password.length < 6) {
      setStatusBanner({ type: 'error', message: 'Password must be at least 6 characters.' });
      return;
    }

    setIsLoading(true);
    setStatusBanner(null);
    try {
      const result = await registerCustomer({
        name: name.trim(),
        phone: phone.trim(),
        email: email.trim(),
        password,
      });

      setCurrentSession(result.session);
      setStatusBanner({
        type: 'success',
        message: result.emailSent
          ? `Account created! Brevo confirmation email sent to ${email.trim()}.`
          : 'Account created! Welcome to Seth Sawariya Cafe.',
      });
      onNotify(`Welcome, ${name.trim()}! Your account is ready.`);
      setTimeout(() => {
        onSuccess?.();
      }, 1200);
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Registration failed';
      setStatusBanner({ type: 'error', message: msg });
      onNotify(`Registration error: ${msg}`);
    } finally {
      setIsLoading(false);
    }
  };

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email.trim() || !email.includes('@')) {
      setStatusBanner({ type: 'error', message: 'Please enter a valid email address.' });
      return;
    }
    if (!password) {
      setStatusBanner({ type: 'error', message: 'Please enter your password.' });
      return;
    }

    setIsLoading(true);
    setStatusBanner(null);
    try {
      const result = await loginCustomer({
        email: email.trim(),
        password,
      });
      setCurrentSession(result.session);
      setStatusBanner({
        type: 'success',
        message: `Welcome back, ${result.session.name}!`,
      });
      onNotify(`Welcome back, ${result.session.name}!`);
      setTimeout(() => {
        onSuccess?.();
      }, 800);
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Login failed';
      setStatusBanner({ type: 'error', message: msg });
      onNotify(`Login error: ${msg}`);
    } finally {
      setIsLoading(false);
    }
  };

  const handleGoogleSignIn = async () => {
    setIsGoogleLoading(true);
    setStatusBanner(null);
    try {
      const result = await loginWithGoogle();
      if (result.redirecting) {
        setStatusBanner({
          type: 'success',
          message: 'Redirecting to Google Sign-In with Supabase...',
        });
      } else if (result.session) {
        setCurrentSession(result.session);
        setStatusBanner({
          type: 'success',
          message: `Signed in with Google as ${result.session.name}!`,
        });
        onNotify(`Welcome, ${result.session.name}!`);
        setTimeout(() => {
          onSuccess?.();
        }, 800);
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Google sign in failed';
      setStatusBanner({ type: 'error', message: msg });
      onNotify(`Google auth error: ${msg}`);
    } finally {
      setIsGoogleLoading(false);
    }
  };

  const handleLogout = async () => {
    try {
      await logoutCustomer();
      setStatusBanner({ type: 'success', message: 'You have logged out successfully.' });
      onNotify('Logged out from customer account');
    } catch (error) {
      setStatusBanner({
        type: 'error',
        message: error instanceof Error ? error.message : 'Could not complete sign out.',
      });
    } finally {
      setCurrentSession(getLocalCustomerSession());
    }
  };

  // If already logged in
  if (currentSession) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[65vh] p-4">
        <div className="w-full max-w-md bg-surface-container-low border border-outline-variant/30 rounded-3xl p-6 shadow-2xl text-center space-y-5">
          <div className="w-16 h-16 rounded-full bg-emerald-500/15 border border-emerald-500/30 text-emerald-400 mx-auto flex items-center justify-center">
            <span className="material-symbols-outlined text-[32px]">check_circle</span>
          </div>

          <div>
            <span className="inline-block px-3 py-1 rounded-full bg-primary/10 border border-primary/20 text-primary text-[11px] font-bold uppercase tracking-wider mb-2">
              Customer Account
            </span>
            <h2 className="text-xl font-bold text-on-surface">
              Welcome, {currentSession.name}
            </h2>
            <p className="text-xs text-on-surface-variant mt-1">
              Signed in via {currentSession.provider === 'google' ? 'Google' : 'Supabase Auth'}
            </p>
          </div>

          <div className="p-3.5 rounded-2xl bg-surface-container-lowest border border-outline-variant/20 text-left text-xs space-y-2">
            <div className="flex justify-between">
              <span className="text-on-surface-variant">Email:</span>
              <span className="font-semibold text-on-surface truncate max-w-[200px]">
                {currentSession.email}
              </span>
            </div>
            {currentSession.phone && (
              <div className="flex justify-between">
                <span className="text-on-surface-variant">Mobile:</span>
                <span className="font-semibold text-on-surface">{currentSession.phone}</span>
              </div>
            )}
            <div className="flex justify-between">
              <span className="text-on-surface-variant">Brevo Confirmation:</span>
              <span className="font-bold text-emerald-400 flex items-center gap-1">
                <span className="material-symbols-outlined text-[14px]">verified</span>
                Delivered
              </span>
            </div>
          </div>

          <div className="space-y-2 pt-2">
            {hasCartItems && onReturnToCart && (
              <button
                type="button"
                onClick={onReturnToCart}
                className="w-full h-11 rounded-xl bg-[#FF6422] hover:bg-[#E55518] text-white font-bold text-xs shadow-lg transition-all flex items-center justify-center gap-2 cursor-pointer active:scale-[0.98]"
              >
                <span className="material-symbols-outlined text-[18px]">shopping_bag</span>
                <span>Return to Cart &amp; Place Order</span>
              </button>
            )}

            <button
              type="button"
              onClick={onBrowseMenu}
              className="w-full h-11 rounded-xl bg-primary hover:brightness-110 text-on-primary font-bold text-xs shadow-lg transition-all flex items-center justify-center gap-2 cursor-pointer"
            >
              <span className="material-symbols-outlined text-[18px]">restaurant_menu</span>
              <span>Browse Cafe Menu &amp; Order</span>
            </button>

            <button
              type="button"
              onClick={handleLogout}
              className="w-full h-10 rounded-xl bg-surface-container hover:bg-surface-container-high text-on-surface text-xs font-semibold transition-all cursor-pointer"
            >
              Log Out of Account
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col items-center justify-center min-h-[70vh] py-6 px-4">
      <div className="w-full max-w-md bg-surface-container-low border border-outline-variant/30 rounded-3xl p-6 sm:p-8 shadow-2xl space-y-6">
        {/* Brand Header */}
        <div className="text-center space-y-1.5">
          <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-[#C59B67]/15 border border-[#C59B67]/30 text-[#C59B67] text-[10px] font-bold tracking-widest uppercase">
            <span>Seth Sawariya Cafe</span>
          </div>
          <h1 className="text-xl sm:text-2xl font-black text-on-surface tracking-tight font-sans">
            {activeTab === 'register' ? 'Join Our Cafe Club' : 'Welcome Back'}
          </h1>
          <p className="text-xs text-on-surface-variant">
            {activeTab === 'register'
              ? 'Enter your name, mobile & email to unlock free reward points.'
              : 'Sign in to access your orders, points, and saved profile.'}
          </p>
        </div>

        {/* Tab Switcher (Register vs Login) */}
        <div className="grid grid-cols-2 gap-1 p-1 bg-surface-container-lowest border border-outline-variant/20 rounded-2xl text-xs font-bold">
          <button
            type="button"
            onClick={() => {
              setActiveTab('register');
              setStatusBanner(null);
            }}
            className={`py-2 rounded-xl transition-all cursor-pointer flex items-center justify-center gap-1.5 ${
              activeTab === 'register'
                ? 'bg-[#FF6422] text-white shadow-md'
                : 'text-on-surface-variant hover:text-on-surface'
            }`}
          >
            <span className="material-symbols-outlined text-[16px]">person_add</span>
            <span>Create Account</span>
          </button>

          <button
            type="button"
            onClick={() => {
              setActiveTab('login');
              setStatusBanner(null);
            }}
            className={`py-2 rounded-xl transition-all cursor-pointer flex items-center justify-center gap-1.5 ${
              activeTab === 'login'
                ? 'bg-[#FF6422] text-white shadow-md'
                : 'text-on-surface-variant hover:text-on-surface'
            }`}
          >
            <span className="material-symbols-outlined text-[16px]">login</span>
            <span>Sign In</span>
          </button>
        </div>

        {/* Status / Alert Banner */}
        {statusBanner && (
          <div
            className={`p-3 rounded-2xl text-xs font-medium flex items-center gap-2.5 transition-all ${
              statusBanner.type === 'success'
                ? 'bg-emerald-500/15 border border-emerald-500/30 text-emerald-300'
                : 'bg-rose-500/15 border border-rose-500/30 text-rose-300'
            }`}
          >
            <span className="material-symbols-outlined text-[18px] shrink-0">
              {statusBanner.type === 'success' ? 'check_circle' : 'error'}
            </span>
            <span className="flex-1 leading-relaxed">{statusBanner.message}</span>
          </div>
        )}

        {/* Google One-Click Sign In */}
        <button
          type="button"
          onClick={handleGoogleSignIn}
          disabled={isGoogleLoading || isLoading}
          className="w-full h-11 rounded-2xl bg-white hover:bg-slate-100 text-slate-800 border border-slate-300 font-bold text-xs shadow-sm transition-all flex items-center justify-center gap-2.5 cursor-pointer disabled:opacity-50"
        >
          {isGoogleLoading ? (
            <span>Connecting Google...</span>
          ) : (
            <>
              <svg className="w-4 h-4 shrink-0" viewBox="0 0 24 24">
                <path
                  fill="#4285F4"
                  d="M23.745 12.27c0-.7-.06-1.4-.19-2.07H12v4.51h6.6c-.29 1.52-1.14 2.8-2.4 3.66v3.05h3.9c2.27-2.09 3.64-5.17 3.64-9.15z"
                />
                <path
                  fill="#34A853"
                  d="M12 24c3.24 0 5.95-1.08 7.93-2.91l-3.9-3.05c-1.08.72-2.45 1.16-4.03 1.16-3.13 0-5.78-2.11-6.73-4.96H1.21v3.15C3.25 21.4 7.33 24 12 24z"
                />
                <path
                  fill="#FBBC05"
                  d="M5.27 14.24c-.25-.72-.38-1.49-.38-2.24s.13-1.52.38-2.24V6.61H1.21C.44 8.14 0 9.99 0 12s.44 3.86 1.21 5.39l4.06-3.15z"
                />
                <path
                  fill="#EA4335"
                  d="M12 4.75c1.77 0 3.35.61 4.6 1.8l3.42-3.42C17.95 1.19 15.24 0 12 0 7.33 0 3.25 2.6 1.21 6.61l4.06 3.15c.95-2.85 3.6-4.96 6.73-4.96z"
                />
              </svg>
              <span>Continue with Google</span>
            </>
          )}
        </button>

        <div className="relative flex items-center justify-center">
          <div className="border-t border-outline-variant/30 w-full" />
          <span className="bg-surface-container-low px-3 text-[10px] font-bold text-on-surface-variant uppercase tracking-wider shrink-0">
            Or with Name, Mobile &amp; Email
          </span>
        </div>

        {/* Forms */}
        {activeTab === 'register' ? (
          <form onSubmit={handleRegister} className="space-y-3.5">
            {/* Full Name */}
            <div>
              <label className="text-[11px] font-bold text-on-surface-variant uppercase tracking-wider block mb-1">
                Full Name
              </label>
              <div className="relative">
                <span className="material-symbols-outlined text-[18px] text-on-surface-variant absolute left-3 top-2.5 pointer-events-none">
                  badge
                </span>
                <input
                  type="text"
                  required
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="e.g. Rahul Sharma"
                  className="w-full pl-9 pr-3 py-2 rounded-xl bg-surface-container-lowest border border-outline-variant/30 text-xs text-on-surface placeholder:text-outline focus:outline-none focus:ring-1 focus:ring-primary"
                />
              </div>
            </div>

            {/* Mobile Number */}
            <div>
              <label className="text-[11px] font-bold text-on-surface-variant uppercase tracking-wider block mb-1">
                Mobile Number
              </label>
              <div className="relative">
                <span className="material-symbols-outlined text-[18px] text-on-surface-variant absolute left-3 top-2.5 pointer-events-none">
                  phone_android
                </span>
                <input
                  type="tel"
                  required
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  placeholder="e.g. 9876543210"
                  className="w-full pl-9 pr-3 py-2 rounded-xl bg-surface-container-lowest border border-outline-variant/30 text-xs text-on-surface placeholder:text-outline focus:outline-none focus:ring-1 focus:ring-primary"
                />
              </div>
            </div>

            {/* Email Address */}
            <div>
              <label className="text-[11px] font-bold text-on-surface-variant uppercase tracking-wider block mb-1">
                Email Address
              </label>
              <div className="relative">
                <span className="material-symbols-outlined text-[18px] text-on-surface-variant absolute left-3 top-2.5 pointer-events-none">
                  mail
                </span>
                <input
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="name@example.com"
                  className="w-full pl-9 pr-3 py-2 rounded-xl bg-surface-container-lowest border border-outline-variant/30 text-xs text-on-surface placeholder:text-outline focus:outline-none focus:ring-1 focus:ring-primary"
                />
              </div>
            </div>

            {/* Password */}
            <div>
              <label className="text-[11px] font-bold text-on-surface-variant uppercase tracking-wider block mb-1">
                Password
              </label>
              <div className="relative">
                <span className="material-symbols-outlined text-[18px] text-on-surface-variant absolute left-3 top-2.5 pointer-events-none">
                  lock
                </span>
                <input
                  type={showPassword ? 'text' : 'password'}
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Min. 6 characters"
                  className="w-full pl-9 pr-10 py-2 rounded-xl bg-surface-container-lowest border border-outline-variant/30 text-xs text-on-surface placeholder:text-outline focus:outline-none focus:ring-1 focus:ring-primary"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-2.5 text-on-surface-variant hover:text-on-surface cursor-pointer"
                >
                  <span className="material-symbols-outlined text-[18px]">
                    {showPassword ? 'visibility_off' : 'visibility'}
                  </span>
                </button>
              </div>
            </div>

            {/* Brevo Confirmation Badge */}
            <div className="p-2.5 rounded-xl bg-surface-container-lowest border border-outline-variant/20 flex items-center gap-2 text-[11px] text-on-surface-variant">
              <span className="material-symbols-outlined text-[16px] text-[#C59B67] shrink-0">
                mark_email_read
              </span>
              <span>
                Instant confirmation email sent via <strong>Brevo's Free Plan</strong>.
              </span>
            </div>

            <button
              type="submit"
              disabled={isLoading}
              className="w-full h-11 rounded-xl bg-[#FF6422] hover:bg-[#E55518] text-white font-bold text-xs sm:text-sm shadow-lg transition-all flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50"
            >
              {isLoading ? (
                <span>Creating Account &amp; Sending Confirmation...</span>
              ) : (
                <>
                  <span className="material-symbols-outlined text-[18px]">how_to_reg</span>
                  <span>Create Account &amp; Get 50 Reward Points</span>
                </>
              )}
            </button>
          </form>
        ) : (
          <form onSubmit={handleLogin} className="space-y-3.5">
            {/* Email Address */}
            <div>
              <label className="text-[11px] font-bold text-on-surface-variant uppercase tracking-wider block mb-1">
                Email Address
              </label>
              <div className="relative">
                <span className="material-symbols-outlined text-[18px] text-on-surface-variant absolute left-3 top-2.5 pointer-events-none">
                  mail
                </span>
                <input
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="name@example.com"
                  className="w-full pl-9 pr-3 py-2 rounded-xl bg-surface-container-lowest border border-outline-variant/30 text-xs text-on-surface placeholder:text-outline focus:outline-none focus:ring-1 focus:ring-primary"
                />
              </div>
            </div>

            {/* Password */}
            <div>
              <label className="text-[11px] font-bold text-on-surface-variant uppercase tracking-wider block mb-1">
                Password
              </label>
              <div className="relative">
                <span className="material-symbols-outlined text-[18px] text-on-surface-variant absolute left-3 top-2.5 pointer-events-none">
                  lock
                </span>
                <input
                  type={showPassword ? 'text' : 'password'}
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Enter your password"
                  className="w-full pl-9 pr-10 py-2 rounded-xl bg-surface-container-lowest border border-outline-variant/30 text-xs text-on-surface placeholder:text-outline focus:outline-none focus:ring-1 focus:ring-primary"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-2.5 text-on-surface-variant hover:text-on-surface cursor-pointer"
                >
                  <span className="material-symbols-outlined text-[18px]">
                    {showPassword ? 'visibility_off' : 'visibility'}
                  </span>
                </button>
              </div>
            </div>

            <button
              type="submit"
              disabled={isLoading}
              className="w-full h-11 rounded-xl bg-[#FF6422] hover:bg-[#E55518] text-white font-bold text-xs sm:text-sm shadow-lg transition-all flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50"
            >
              {isLoading ? (
                <span>Signing In...</span>
              ) : (
                <>
                  <span className="material-symbols-outlined text-[18px]">login</span>
                  <span>Sign In</span>
                </>
              )}
            </button>
          </form>
        )}

        {/* Real Supabase Auth Status Notice */}
        {!isLiveSupabase && (
          <div className="p-3 rounded-2xl bg-surface-container border border-outline-variant/20 text-on-surface-variant text-[11px] leading-relaxed flex items-start gap-2">
            <span className="material-symbols-outlined text-[16px] text-primary shrink-0 mt-0.5">verified_user</span>
            <div>
              <span className="font-bold text-on-surface">Real Supabase Auth:</span> Live authentication requires <code className="px-1 py-0.5 bg-surface-container-highest rounded text-[10px] text-primary font-mono">VITE_SUPABASE_URL</code> and <code className="px-1 py-0.5 bg-surface-container-highest rounded text-[10px] text-primary font-mono">VITE_SUPABASE_ANON_KEY</code> in <code className="px-1 py-0.5 bg-surface-container-highest rounded text-[10px] text-primary font-mono">.env</code>.
            </div>
          </div>
        )}

        {/* Continue as Guest */}
        <div className="pt-2 text-center">
          <button
            type="button"
            onClick={onBrowseMenu}
            className="text-xs text-on-surface-variant hover:text-primary transition-colors cursor-pointer flex items-center justify-center gap-1 mx-auto"
          >
            <span>Continue as Guest &amp; Browse Menu</span>
            <span className="material-symbols-outlined text-[16px]">arrow_forward</span>
          </button>
        </div>
      </div>
    </div>
  );
};
