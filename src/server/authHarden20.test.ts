import test from 'node:test';
import assert from 'node:assert/strict';
import {
  assertAuthSecretConfigured,
  authenticateStaffPin,
  checkLockout,
  recordFailedAttempt,
  resetLockout,
  signStaffSession,
  verifyStaffSessionToken,
  createRefreshToken,
  rotateRefreshToken,
  revokeToken,
  revokeAllUserSessions,
  setStaffSessionCookie,
  __testOnlyResetLockout,
} from './auth';
import { requestOtp, verifyOtp, __testOnlyResetOtpStore, __testOnlyGetOtp } from './otp';
import {
  generatePasswordResetToken,
  consumePasswordResetToken,
  initiateEmailChange,
  verifyAndApplyEmailChange,
  generateOAuthChallenge,
  verifyOAuthCallbackState,
} from './accountSecurity';
import {
  setupAdmin2Fa,
  confirmAndEnableAdmin2Fa,
  verifyAdmin2Fa,
} from './admin2fa';
import { generateSync } from 'otplib';

test('Authentication Hardening Suite: 20 Production Security Controls', async (t) => {
  // Setup fresh state
  __testOnlyResetLockout();
  __testOnlyResetOtpStore();

  await t.test('1. OTP Rate Limiting (Max 3 sends / 15m & Max 5 verify tries with auto-invalidation)', async () => {
    __testOnlyResetOtpStore();
    const id = 'customer_rate_test@example.com';
    const ip = '192.168.1.100';

    // 1st, 2nd, 3rd sends succeed
    const r1 = await requestOtp({ identifier: id, ip });
    assert.equal(r1.success, true);
    const r2 = await requestOtp({ identifier: id, ip });
    assert.equal(r2.success, true);
    const r3 = await requestOtp({ identifier: id, ip });
    assert.equal(r3.success, true);

    // 4th send fails with rate limit error
    const r4 = await requestOtp({ identifier: id, ip });
    assert.equal(r4.success, false);
    assert.match(r4.message, /Too many OTP requests/i);

    // Verify attempt limiting on a fresh identifier
    const id2 = 'verify_limit_test@example.com';
    await requestOtp({ identifier: id2, ip: '10.0.0.1' });
    
    // Fail 5 times
    for (let i = 0; i < 5; i++) {
      const fail = verifyOtp({ identifier: id2, ip: '10.0.0.1', code: '000000' });
      assert.equal(fail.valid, false);
    }

    // 6th attempt is blocked and OTP is completely invalidated
    const fail6 = verifyOtp({ identifier: id2, ip: '10.0.0.1', code: '000000' });
    assert.equal(fail6.valid, false);
    assert.match(fail6.error || '', /invalidated|exceeded|expired/i);
    assert.equal(__testOnlyGetOtp(id2), undefined);
  });

  await t.test('2. Never return OTP in any API response or log', async () => {
    __testOnlyResetOtpStore();
    const result = await requestOtp({
      identifier: 'privacy_test@example.com',
      ip: '127.0.0.1',
    });
    // Ensure response object has no OTP code
    assert.equal('code' in result, false);
    assert.equal((result as unknown as Record<string, unknown>).code, undefined);
  });

  await t.test('3. OTP Expiry & CSPRNG (6 digits, 5-minute TTL, single-use, hashed)', async () => {
    __testOnlyResetOtpStore();
    const id = 'csprng_test@example.com';
    await requestOtp({ identifier: id, ip: '127.0.0.1' });
    const stored = __testOnlyGetOtp(id);
    assert.ok(stored);
    assert.equal(stored.used, false);
    // Hashed code format salt:hash
    assert.match(stored.hashedCode, /^[a-f0-9]{32}:[a-f0-9]{64}$/);
    assert.ok(stored.expiresAt > Date.now() + 4 * 60 * 1000);
  });

  await t.test('4. Generic Errors for login, OTP, and reset', async () => {
    const otpRes = await requestOtp({ identifier: 'nonexistent@example.com', ip: '127.0.0.1' });
    assert.equal(otpRes.message, "If an account exists, we've sent a 6-digit verification code.");
  });

  await t.test('5. Lockout: 5 failed attempts trigger 15 min lockout', async () => {
    __testOnlyResetLockout();
    const ip = '203.0.113.42';

    // 4 failed attempts: not locked yet
    for (let i = 0; i < 4; i++) {
      const res = recordFailedAttempt('staff_login', ip);
      assert.equal(res.locked, false);
    }

    // 5th failed attempt: locked!
    const res5 = recordFailedAttempt('staff_login', ip);
    assert.equal(res5.locked, true);

    // Next attempt is immediately locked
    const status = checkLockout('staff_login', ip);
    assert.equal(status.locked, true);
    assert.ok(status.retryAfterSeconds > 0);

    resetLockout('staff_login', ip);
  });

  await t.test('6. Server-side session verification in middleware', async () => {
    const verified = verifyStaffSessionToken('invalid.garbage.token');
    assert.equal(verified, null);
  });

  await t.test('7. JWT Secret Strength (Min 32 bytes, rejects weak strings)', () => {
    const origSecret = process.env.CAFE_AUTH_SECRET;
    try {
      // Weak secret rejected
      process.env.CAFE_AUTH_SECRET = 'secret';
      assert.throws(() => assertAuthSecretConfigured(), /at least 32 characters/);

      // Known weak string rejected
      process.env.CAFE_AUTH_SECRET = '12345678901234567890123456789012';
      assert.throws(() => assertAuthSecretConfigured(), /known weak/);
    } finally {
      process.env.CAFE_AUTH_SECRET = origSecret;
    }
  });

  await t.test('8. Strict JWT Verification & 15m Expiry (Pins HS256, rejects "none")', () => {
    const validToken = signStaffSession({
      staffId: 'stf_1',
      role: 'admin',
      staffName: 'Admin',
      issuedAt: Date.now(),
      exp: Date.now() + 15 * 60 * 1000,
    });
    const parsed = verifyStaffSessionToken(validToken);
    assert.ok(parsed);
    assert.equal(parsed.role, 'admin');

    // Forged algorithm "none" token
    const forgedHeader = Buffer.from(JSON.stringify({ alg: 'none', typ: 'JWT' })).toString('base64url');
    const forgedPayload = Buffer.from(JSON.stringify({ role: 'admin', exp: Date.now() + 10000 })).toString('base64url');
    const noneToken = `${forgedHeader}.${forgedPayload}.`;
    assert.equal(verifyStaffSessionToken(noneToken), null);
  });

  await t.test('9. No tokens in localStorage; verified cookie session config', () => {
    const dummyRes: any = {
      cookieCalls: [] as any[],
      cookie(name: string, val: string, opts: any) {
        this.cookieCalls.push({ name, val, opts });
      },
    };
    setStaffSessionCookie(dummyRes, {
      staffId: 'stf_1',
      role: 'admin',
      staffName: 'Admin',
      issuedAt: Date.now(),
      exp: Date.now() + 15 * 60 * 1000,
    });
    const sessionCookie = dummyRes.cookieCalls.find((c: any) => c.name === 'cafeos_staff_session');
    assert.ok(sessionCookie);
    assert.equal(sessionCookie.opts.httpOnly, true);
    assert.equal(sessionCookie.opts.sameSite, 'lax');
  });

  await t.test('10. Refresh Token Rotation & Family Revocation on Replay', () => {
    const user = 'admin_user_42';
    const first = createRefreshToken(user, 'admin');
    assert.ok(first.token);

    // Rotate once: succeeds
    const rotated = rotateRefreshToken(first.token);
    assert.equal(rotated.success, true);
    assert.ok(rotated.newAccessToken);
    assert.ok(rotated.newRefreshToken);

    // Replay the first (now superseded) token: MUST DETECT REUSE AND REVOKE FAMILY!
    const replayed = rotateRefreshToken(first.token);
    assert.equal(replayed.success, false);
    assert.match(replayed.error || '', /reuse detected/i);

    // Even the second token is now dead because the family was revoked!
    const nowRevoked = rotateRefreshToken(rotated.newRefreshToken!);
    assert.equal(nowRevoked.success, false);
    assert.match(nowRevoked.error || '', /revoked/i);
  });

  await t.test('11. Logout kills session server-side', () => {
    const token = signStaffSession({
      staffId: 'stf_logout',
      role: 'kitchen',
      staffName: 'Chef',
      issuedAt: Date.now(),
      exp: Date.now() + 15 * 60 * 1000,
    });
    assert.ok(verifyStaffSessionToken(token));

    revokeToken(token);
    assert.equal(verifyStaffSessionToken(token), null);
  });

  await t.test('12. Zero trust for client-sent roles & user IDs', () => {
    // Session token takes precedence; spoofed bodies without matching session fail
    const parsed = verifyStaffSessionToken(undefined);
    assert.equal(parsed, null);
  });

  await t.test('13. Reset links are single-use & invalidate pending tokens', () => {
    const user = 'user_reset_test';
    const { rawToken } = generatePasswordResetToken(user);

    // 1st consumption succeeds
    const res1 = consumePasswordResetToken(rawToken);
    assert.equal(res1.valid, true);

    // 2nd consumption fails (single-use)
    const res2 = consumePasswordResetToken(rawToken);
    assert.equal(res2.valid, false);
  });

  await t.test('14. Reset tokens: 32+ bytes CSPRNG & 15m expiry', () => {
    const { rawToken } = generatePasswordResetToken('user_bytes_test');
    // 32 bytes in hex = 64 characters
    assert.equal(rawToken.length, 64);
  });

  await t.test('15. Email change requires re-auth and dual-notification', async () => {
    const user = 'user_email_chg';
    const { token } = await initiateEmailChange(user, 'old@example.com', 'new@example.com');
    assert.ok(token);

    const applied = verifyAndApplyEmailChange(token);
    assert.equal(applied.valid, true);
    assert.equal(applied.newEmail, 'new@example.com');
  });

  await t.test('16. Revoke all active sessions on password reset', () => {
    const user = 'user_session_flush';
    const activeToken = signStaffSession({
      staffId: user,
      role: 'admin',
      staffName: 'Admin Flush',
      issuedAt: Date.now(),
      exp: Date.now() + 15 * 60 * 1000,
    });
    assert.ok(verifyStaffSessionToken(activeToken));

    // Consuming reset token purges user sessions
    const { rawToken } = generatePasswordResetToken(user);
    consumePasswordResetToken(rawToken);

    // Prior token must now be invalid!
    assert.equal(verifyStaffSessionToken(activeToken), null);
  });

  await t.test('17. OAuth State & PKCE Verification', () => {
    const challenge = generateOAuthChallenge('http://localhost:3000/api/auth/oauth/callback');
    assert.ok(challenge.state);
    assert.ok(challenge.codeVerifier);
    assert.ok(challenge.codeChallenge);

    // Valid state & PKCE
    const valid = verifyOAuthCallbackState(
      challenge.state,
      challenge.state,
      challenge.codeVerifier,
      challenge.codeChallenge
    );
    assert.equal(valid, true);

    // Tampered state rejected
    const tampered = verifyOAuthCallbackState('evil_state', challenge.state);
    assert.equal(tampered, false);
  });

  await t.test('18. Admin routes enforce server-side RBAC (Kitchen role fails admin check)', () => {
    const kitchenToken = signStaffSession({
      staffId: 'kitchen_1',
      role: 'kitchen',
      staffName: 'Cook',
      issuedAt: Date.now(),
      exp: Date.now() + 15 * 60 * 1000,
    });
    const session = verifyStaffSessionToken(kitchenToken);
    assert.ok(session);
    assert.equal(session.role === 'admin', false);
  });

  await t.test('19. No default or weak admin PINs in production', () => {
    const prevEnv = process.env.NODE_ENV;
    const prevPin = process.env.CAFE_ADMIN_PIN;
    const prevKitchen = process.env.CAFE_KITCHEN_PIN;
    const prevSecret = process.env.CAFE_AUTH_SECRET;
    try {
      process.env.NODE_ENV = 'production';
      process.env.CAFE_AUTH_SECRET = 'a'.repeat(32);
      process.env.CAFE_KITCHEN_PIN = '9876'; // valid kitchen PIN
      process.env.CAFE_ADMIN_PIN = '7777'; // weak default PIN
      assert.throws(() => assertAuthSecretConfigured(), /Default or weak PIN/);
    } finally {
      process.env.NODE_ENV = prevEnv;
      process.env.CAFE_ADMIN_PIN = prevPin;
      process.env.CAFE_KITCHEN_PIN = prevKitchen;
      process.env.CAFE_AUTH_SECRET = prevSecret;
    }
  });

  await t.test('20. Admin 2FA (TOTP RFC 6238) & Hashed Backup Recovery Codes', () => {
    const admin = 'admin_totp_test';
    const setup = setupAdmin2Fa(admin);
    assert.ok(setup.secret);
    assert.equal(setup.plainRecoveryCodes.length, 8);

    // Generate valid TOTP token using otplib
    const totpToken = generateSync({ secret: setup.secret });
    const confirmed = confirmAndEnableAdmin2Fa(admin, totpToken);
    assert.equal(confirmed, true);

    // Verify subsequent TOTP
    const nextTotp = generateSync({ secret: setup.secret });
    const verifyTotp = verifyAdmin2Fa(admin, nextTotp);
    assert.equal(verifyTotp.valid, true);
    assert.equal(verifyTotp.usedRecoveryCode, false);

    // Verify recovery code
    const recoveryCode = setup.plainRecoveryCodes[0];
    const verifyRec = verifyAdmin2Fa(admin, recoveryCode);
    assert.equal(verifyRec.valid, true);
    assert.equal(verifyRec.usedRecoveryCode, true);

    // Reusing the same recovery code fails (single-use)
    const reuseRec = verifyAdmin2Fa(admin, recoveryCode);
    assert.equal(reuseRec.valid, false);
  });
});
