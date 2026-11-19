import { createClient, type User as SupabaseUser } from '@supabase/supabase-js';

// Environment credentials for Supabase
const envUrl = (
  (typeof import.meta !== 'undefined' && import.meta.env?.VITE_SUPABASE_URL) ||
  (typeof process !== 'undefined' && (process.env?.VITE_SUPABASE_URL || process.env?.SUPABASE_URL)) ||
  ''
).trim();

const envKey = (
  (typeof import.meta !== 'undefined' && import.meta.env?.VITE_SUPABASE_ANON_KEY) ||
  (typeof process !== 'undefined' && (process.env?.VITE_SUPABASE_ANON_KEY || process.env?.SUPABASE_ANON_KEY)) ||
  ''
).trim();

export const isLiveSupabase = Boolean(
  envUrl &&
  envKey &&
  envUrl.startsWith('https://') &&
  !envUrl.includes('placeholder') &&
  !envUrl.includes('xyzcompany')
);

const fallbackUrl = isLiveSupabase ? envUrl : 'https://placeholder.supabase.co';
const fallbackKey = isLiveSupabase ? envKey : 'placeholder-anon-key-seth-sawariya';

export const supabase = createClient(fallbackUrl, fallbackKey);

export interface CustomerAuthSession {
  id: string;
  name: string;
  email: string;
  phone: string;
  provider: 'email' | 'google';
  confirmed: boolean;
  avatarUrl?: string;
  createdAt: string;
}

const CUSTOMER_SESSION_STORAGE_KEY = 'cafeos_supabase_customer_session';

export function getLocalCustomerSession(): CustomerAuthSession | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = window.localStorage.getItem(CUSTOMER_SESSION_STORAGE_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

export function saveLocalCustomerSession(session: CustomerAuthSession): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(CUSTOMER_SESSION_STORAGE_KEY, JSON.stringify(session));
    // Also sync to personal customer profile
    const existing = window.localStorage.getItem('cafeos_customer_profile');
    const prev = existing ? JSON.parse(existing) : {};
    window.localStorage.setItem(
      'cafeos_customer_profile',
      JSON.stringify({
        ...prev,
        name: session.name || prev.name,
        email: session.email || prev.email,
        phone: session.phone || prev.phone,
      })
    );
  } catch (err) {
    console.error('Failed to persist customer session:', err);
  }
}

export function clearLocalCustomerSession(): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.removeItem(CUSTOMER_SESSION_STORAGE_KEY);
  } catch (err) {
    console.error('Failed to clear customer session:', err);
  }
}

/**
 * Register a customer via Supabase Auth + Trigger Brevo confirmation
 */
export async function registerCustomer(params: {
  name: string;
  phone: string;
  email: string;
  password?: string;
}): Promise<{ session: CustomerAuthSession; emailSent: boolean; message: string }> {
  const { name, phone, email, password = 'CustomerPassword@123' } = params;

  let authUserId = `cust_${Date.now()}`;

  if (isLiveSupabase) {
    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: {
          name,
          phone,
          full_name: name,
        },
      },
    });
    if (error) {
      throw new Error(error.message);
    }
    if (data.user) {
      authUserId = data.user.id;
    }
  }

  // Trigger Brevo confirmation email via our backend route
  let emailSent = false;
  try {
    const res = await fetch('/api/auth/brevo-confirmation', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name,
        phone,
        email,
      }),
    });
    const resJson = await res.json().catch(() => ({}));
    if (res.ok && resJson.ok) {
      emailSent = true;
    }
  } catch (err) {
    console.warn('Brevo confirmation request failed:', err);
  }

  const session: CustomerAuthSession = {
    id: authUserId,
    name,
    email,
    phone,
    provider: 'email',
    confirmed: true,
    createdAt: new Date().toISOString(),
  };

  saveLocalCustomerSession(session);

  return {
    session,
    emailSent,
    message: emailSent
      ? `Account created! Brevo confirmation email dispatched to ${email}.`
      : 'Account created and confirmed.',
  };
}

/**
 * Sign in existing customer with email and password
 */
export async function loginCustomer(params: {
  email: string;
  password?: string;
}): Promise<{ session: CustomerAuthSession }> {
  const { email, password = 'CustomerPassword@123' } = params;

  if (isLiveSupabase) {
    const { data, error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });
    if (error) {
      throw new Error(error.message);
    }
    const user = data.user;
    const session: CustomerAuthSession = {
      id: user.id,
      name: (user.user_metadata?.name || user.user_metadata?.full_name || email.split('@')[0]) as string,
      email: user.email || email,
      phone: (user.user_metadata?.phone || '') as string,
      provider: 'email',
      confirmed: Boolean(user.email_confirmed_at || user.confirmed_at),
      createdAt: user.created_at,
    };
    saveLocalCustomerSession(session);
    return { session };
  }

  // Local fallback mode
  const local = getLocalCustomerSession();
  const session: CustomerAuthSession = {
    id: local?.id || `cust_${Date.now()}`,
    name: local?.email === email ? local.name : email.split('@')[0] || 'Customer',
    email,
    phone: local?.email === email ? local.phone : '',
    provider: 'email',
    confirmed: true,
    createdAt: new Date().toISOString(),
  };
  saveLocalCustomerSession(session);
  return { session };
}

/**
 * Sign in with Google (Supabase OAuth or local simulated fallback)
 */
export async function loginWithGoogle(): Promise<{ session?: CustomerAuthSession; redirecting?: boolean }> {
  if (isLiveSupabase) {
    const redirectUrl =
      typeof window !== 'undefined'
        ? `${window.location.origin}/customer/login`
        : undefined;

    const { error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: {
        redirectTo: redirectUrl,
      },
    });
    if (error) {
      throw new Error(error.message);
    }
    return { redirecting: true };
  }

  // Local simulated Google OAuth for development / tests
  const session: CustomerAuthSession = {
    id: `google_${Date.now()}`,
    name: 'Google Customer',
    email: 'customer.google@gmail.com',
    phone: '+91 98765 43210',
    provider: 'google',
    confirmed: true,
    avatarUrl: 'https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?auto=format&fit=crop&w=150&q=80',
    createdAt: new Date().toISOString(),
  };

  saveLocalCustomerSession(session);
  return { session };
}

/**
 * Logout customer
 */
export async function logoutCustomer(): Promise<void> {
  if (isLiveSupabase) {
    try {
      await supabase.auth.signOut();
    } catch (err) {
      console.warn('Supabase signOut error:', err);
    }
  }
  clearLocalCustomerSession();
}
