import test from 'node:test';
import assert from 'node:assert/strict';
import {
  isLiveSupabase,
  registerCustomer,
  loginCustomer,
  loginWithGoogle,
  getLocalCustomerSession,
  saveLocalCustomerSession,
  clearLocalCustomerSession,
  type CustomerAuthSession,
} from './supabaseClient';

test('supabaseClient enforces real credentials and rejects fake fallback logins', async () => {
  // If not configured with live credentials in this test env, it MUST reject rather than faking an auth session
  if (!isLiveSupabase) {
    await assert.rejects(
      async () => {
        await registerCustomer({
          name: 'Real User',
          phone: '+91 99999 88888',
          email: 'real@example.com',
          password: 'Password123!',
        });
      },
      (err: Error) => {
        assert.match(err.message, /Supabase Auth is not configured/i);
        return true;
      }
    );

    await assert.rejects(
      async () => {
        await loginCustomer({
          email: 'real@example.com',
          password: 'Password123!',
        });
      },
      (err: Error) => {
        assert.match(err.message, /Supabase Auth is not configured/i);
        return true;
      }
    );

    await assert.rejects(
      async () => {
        await loginWithGoogle();
      },
      (err: Error) => {
        assert.match(err.message, /Supabase Auth is not configured/i);
        return true;
      }
    );
  }
});

test('local customer session management saves and clears valid session data', () => {
  const dummySession: CustomerAuthSession = {
    id: 'user_supabase_real_uuid',
    name: 'Rohan Sharma',
    email: 'rohan.sharma@example.com',
    phone: '+91 98765 43210',
    provider: 'email',
    confirmed: true,
    createdAt: new Date().toISOString(),
  };

  saveLocalCustomerSession(dummySession);
  const loaded = getLocalCustomerSession();
  assert.equal(loaded?.name, 'Rohan Sharma');
  assert.equal(loaded?.email, 'rohan.sharma@example.com');
  assert.equal(loaded?.id, 'user_supabase_real_uuid');

  clearLocalCustomerSession();
  const afterClear = getLocalCustomerSession();
  assert.equal(afterClear, null);
});
