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

// Safe client instantiation
const supabaseUrl = isLiveSupabase ? envUrl : 'https://placeholder.supabase.co';
const supabaseKey = isLiveSupabase ? envKey : 'placeholder-anon-key-seth-sawariya';

export const supabase = createClient(supabaseUrl, supabaseKey);

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
let memoryCustomerSession: CustomerAuthSession | null = null;

export function getLocalCustomerSession(): CustomerAuthSession | null {
  if (typeof window === 'undefined') return memoryCustomerSession;
  try {
    const raw = window.localStorage.getItem(CUSTOMER_SESSION_STORAGE_KEY);
    return raw ? JSON.parse(raw) : memoryCustomerSession;
  } catch {
    return memoryCustomerSession;
  }
}

export function saveLocalCustomerSession(session: CustomerAuthSession): void {
  memoryCustomerSession = session;
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(CUSTOMER_SESSION_STORAGE_KEY, JSON.stringify(session));
    // Also sync to customer profile
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
  memoryCustomerSession = null;
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.removeItem(CUSTOMER_SESSION_STORAGE_KEY);
  } catch (err) {
    console.error('Failed to clear customer session:', err);
  }
}

function extractCustomerSessionFromUser(user: SupabaseUser, defaultProvider: 'email' | 'google' = 'email'): CustomerAuthSession {
  const metadata = user.user_metadata || {};
  const name =
    metadata.full_name ||
    metadata.name ||
    user.email?.split('@')[0] ||
    'Customer';
  const phone = metadata.phone || '';
  const provider =
    (user.app_metadata?.provider as 'email' | 'google') || defaultProvider;
  const avatarUrl = metadata.avatar_url || metadata.picture;

  return {
    id: user.id,
    name,
    email: user.email || '',
    phone,
    provider,
    confirmed: Boolean(user.email_confirmed_at || user.confirmed_at),
    avatarUrl,
    createdAt: user.created_at || new Date().toISOString(),
  };
}

/**
 * Register customer via real Supabase Auth + Trigger Brevo confirmation email
 */
export async function registerCustomer(params: {
  name: string;
  phone: string;
  email: string;
  password?: string;
}): Promise<{ session: CustomerAuthSession; emailSent: boolean; message: string }> {
  if (!isLiveSupabase) {
    throw new Error(
      'Supabase Auth is not configured. Please add VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY to your .env file to enable real customer accounts.'
    );
  }

  const { name, phone, email, password = 'CustomerPassword@123' } = params;

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

  if (!data.user) {
    throw new Error('Registration failed: No user returned from Supabase Auth.');
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

  const session = extractCustomerSessionFromUser(data.user, 'email');
  // Ensure the explicitly provided name & phone are persisted even if user metadata is deferred
  session.name = name;
  session.phone = phone;

  saveLocalCustomerSession(session);

  return {
    session,
    emailSent,
    message: emailSent
      ? `Account created! Brevo confirmation email dispatched to ${email}.`
      : 'Account created with Supabase Auth.',
  };
}

/**
 * Sign in existing customer with email and password via real Supabase Auth
 */
export async function loginCustomer(params: {
  email: string;
  password?: string;
}): Promise<{ session: CustomerAuthSession }> {
  if (!isLiveSupabase) {
    throw new Error(
      'Supabase Auth is not configured. Please add VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY to your .env file to enable real customer login.'
    );
  }

  const { email, password = 'CustomerPassword@123' } = params;

  const { data, error } = await supabase.auth.signInWithPassword({
    email,
    password,
  });

  if (error) {
    throw new Error(error.message);
  }

  if (!data.user) {
    throw new Error('Login failed: No user returned from Supabase Auth.');
  }

  const session = extractCustomerSessionFromUser(data.user, 'email');
  saveLocalCustomerSession(session);
  return { session };
}

/**
 * Sign in with Google via real Supabase OAuth (redirects to Google)
 */
export async function loginWithGoogle(): Promise<{ session?: CustomerAuthSession; redirecting?: boolean }> {
  if (!isLiveSupabase) {
    throw new Error(
      'Supabase Auth is not configured. Please add VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY to your .env file to enable real Google authentication.'
    );
  }

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

/**
 * Synchronize Supabase active session on page boot or OAuth redirect
 */
export async function syncSupabaseCustomerSession(): Promise<CustomerAuthSession | null> {
  if (!isLiveSupabase) return getLocalCustomerSession();

  try {
    const { data, error } = await supabase.auth.getSession();
    if (!error && data.session?.user) {
      const session = extractCustomerSessionFromUser(
        data.session.user,
        (data.session.user.app_metadata?.provider as 'email' | 'google') || 'email'
      );
      saveLocalCustomerSession(session);
      return session;
    }
  } catch (err) {
    console.warn('Failed to sync Supabase session:', err);
  }

  return getLocalCustomerSession();
}

/**
 * Subscribe to Supabase Auth state changes
 */
export function subscribeToSupabaseAuth(
  callback: (session: CustomerAuthSession | null) => void
): () => void {
  if (!isLiveSupabase) {
    return () => {};
  }

  try {
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event, session) => {
      if (session?.user && (event === 'SIGNED_IN' || event === 'TOKEN_REFRESHED' || event === 'USER_UPDATED')) {
        const customerSession = extractCustomerSessionFromUser(
          session.user,
          (session.user.app_metadata?.provider as 'email' | 'google') || 'email'
        );
        saveLocalCustomerSession(customerSession);
        callback(customerSession);
      } else if (event === 'SIGNED_OUT') {
        clearLocalCustomerSession();
        callback(null);
      }
    });

    return () => {
      subscription.unsubscribe();
    };
  } catch (err) {
    console.warn('Could not register Supabase auth subscription:', err);
    return () => {};
  }
}

/**
 * Logout customer from Supabase Auth & purge local storage
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
