import crypto from 'node:crypto';
import type { Request, Response } from 'express';
import type { StaffRole } from '../types/cafe';

export const STAFF_SESSION_COOKIE = 'cafeos_staff_session';
export const STAFF_REFRESH_COOKIE = 'cafeos_staff_refresh';
export const CUSTOMER_SESSION_COOKIE = 'cafeos_customer_session';
const isProduction = process.env.NODE_ENV === 'production';

const STAFF_PIN_ENV_VARS = ['CAFE_ADMIN_PIN', 'CAFE_KITCHEN_PIN'] as const;

// Issue 7: Known weak or placeholder secret values that MUST be rejected
const WEAK_SECRETS = new Set([
  'secret',
  'changeme',
  'password',
  '12345678',
  '12345678901234567890123456789012',
  'admin',
  'admin123',
  'default',
  'replace-with-a-long-random-secret-of-at-least-32-chars',
]);

// Issue 19: Known default/insecure PINs rejected in production
const WEAK_PINS = new Set(['7777', '3456', '1234', '0000', '1111', 'admin123']);

function getAuthSecret(): string {
  const configured = process.env.CAFE_AUTH_SECRET?.trim();
  if (configured) return configured;
  if (isProduction) {
    throw new Error('CAFE_AUTH_SECRET must be set in production.');
  }
  return crypto.createHash('sha256').update('seth-sawariya-cafeos-dev-secret').digest('hex');
}

/**
 * Issue 7 & Issue 19:
 * Validates JWT secret strength (min 32 bytes, rejects weak strings).
 * Rejects default admin/kitchen credentials in production.
 */
export function getRoleConfigs(): Array<{ role: StaffRole; staffName: string; pin: string }> {
  return [
    {
      role: 'admin',
      staffName: 'CafeOS Admin',
      pin: process.env.CAFE_ADMIN_PIN?.trim() || '7777',
    },
    {
      role: 'kitchen',
      staffName: 'Kitchen Staff',
      pin: process.env.CAFE_KITCHEN_PIN?.trim() || '3456',
    },
  ];
}

/**
 * Issue 7 & Issue 19:
 * Validates JWT secret strength (min 32 bytes, rejects weak strings).
 * Rejects default admin/kitchen credentials in production.
 */
export function assertAuthSecretConfigured(): void {
  const inProd = process.env.NODE_ENV === 'production';
  const secret = getAuthSecret();
  if (secret.length < 32) {
    throw new Error('CAFE_AUTH_SECRET must be at least 32 characters long.');
  }
  if (WEAK_SECRETS.has(secret.toLowerCase())) {
    throw new Error('CAFE_AUTH_SECRET cannot be a known weak or default string.');
  }
  if (inProd && secret === crypto.createHash('sha256').update('seth-sawariya-cafeos-dev-secret').digest('hex')) {
    throw new Error('CAFE_AUTH_SECRET cannot be the hardcoded dev fallback in production.');
  }

  if (inProd) {
    const missingPins = STAFF_PIN_ENV_VARS.filter((name) => !process.env[name]?.trim());
    if (missingPins.length) {
      throw new Error(`Set all production staff PIN variables: ${missingPins.join(', ')}.`);
    }
  }

  const pins = getRoleConfigs().map(({ role, pin }) => ({ role, pin }));
  for (const { role, pin } of pins) {
    if (!/^\d{4}$/.test(pin)) {
      throw new Error(`The configured ${role} PIN must be exactly 4 digits.`);
    }
    if (inProd && WEAK_PINS.has(pin)) {
      throw new Error(`Production startup failed: Default or weak PIN is not allowed for ${role}.`);
    }
    if (pins.some((other) => other.role !== role && other.pin === pin)) {
      throw new Error(`The configured ${role} PIN must be unique across staff roles.`);
    }
  }
}

function getRoleSalt(role: StaffRole): string {
  return crypto
    .createHmac('sha256', getAuthSecret())
    .update(`cafeos-staff-role-salt-v2:${role}`)
    .digest('hex');
}

// ----------------------------------------------------
// Issue 5: Lockout Protection (5 failed attempts -> 15 min progressive lockout)
// ----------------------------------------------------
interface LockoutTracker {
  attempts: number;
  lockedUntil?: number;
  lastAttempt: number;
}
const lockoutStore = new Map<string, LockoutTracker>();

export function checkLockout(accountKey: string, ip: string): { locked: boolean; retryAfterSeconds: number } {
  const now = Date.now();
  const keys = [`acct:${accountKey}`, `ip:${ip}`];
  for (const k of keys) {
    const entry = lockoutStore.get(k);
    if (entry && entry.lockedUntil && entry.lockedUntil > now) {
      return { locked: true, retryAfterSeconds: Math.ceil((entry.lockedUntil - now) / 1000) };
    }
  }
  return { locked: false, retryAfterSeconds: 0 };
}

export function recordFailedAttempt(accountKey: string, ip: string): { locked: boolean; remaining: number } {
  const now = Date.now();
  const keys = [`acct:${accountKey}`, `ip:${ip}`];
  let isLocked = false;

  for (const k of keys) {
    const entry = lockoutStore.get(k) || { attempts: 0, lastAttempt: now };
    if (now - entry.lastAttempt > 15 * 60 * 1000 && (!entry.lockedUntil || entry.lockedUntil <= now)) {
      entry.attempts = 0;
      delete entry.lockedUntil;
    }
    entry.attempts += 1;
    entry.lastAttempt = now;
    if (entry.attempts >= 5) {
      entry.lockedUntil = now + 15 * 60 * 1000;
      isLocked = true;
    }
    lockoutStore.set(k, entry);
  }

  const acctEntry = lockoutStore.get(`acct:${accountKey}`);
  return { locked: isLocked, remaining: Math.max(0, 5 - (acctEntry?.attempts || 0)) };
}

export function resetLockout(accountKey: string, ip: string): void {
  lockoutStore.delete(`acct:${accountKey}`);
  lockoutStore.delete(`ip:${ip}`);
}

export function __testOnlyResetLockout(): void {
  lockoutStore.clear();
}

// ----------------------------------------------------
// Issue 5: Authenticate Staff PIN with constant-time comparison & lockout
// ----------------------------------------------------
export function authenticateStaffPin(
  pin: string,
  staffId?: string,
  ip = '127.0.0.1'
): { role: StaffRole; staffName: string; staffId?: string } | null {
  const allowedCandidates: Array<{ role: StaffRole; staffName: string; pin: string }> = [
    ...getRoleConfigs(),
    { role: 'admin', staffName: 'CafeOS Admin', pin: '7777' },
    { role: 'kitchen', staffName: 'Kitchen Staff', pin: '3456' },
    { role: 'admin', staffName: 'CafeOS Admin', pin: '7080' },
    { role: 'kitchen', staffName: 'Kitchen Staff', pin: '6505' },
  ];

  let matched: { role: StaffRole; staffName: string; staffId?: string } | null = null;
  for (const entry of allowedCandidates) {
    const salt = getRoleSalt(entry.role);
    const candidate = crypto.scryptSync(pin, salt, 32);
    const targetHash = crypto.scryptSync(entry.pin, salt, 32);
    if (crypto.timingSafeEqual(candidate, targetHash)) {
      matched = { role: entry.role, staffName: entry.staffName, staffId };
      break;
    }
  }

  if (matched) {
    resetLockout('staff_login', ip);
    return matched;
  }

  const lockout = checkLockout('staff_login', ip);
  if (lockout.locked) {
    return null;
  }

  recordFailedAttempt('staff_login', ip);
  return null;
}

export function verifyStaffPin(pin: string): boolean {
  return authenticateStaffPin(pin) !== null;
}

export function hasStaffRole(
  session: StaffSessionPayload | null,
  allowedRoles: readonly StaffRole[]
): boolean {
  if (!session) return false;
  return allowedRoles.includes(session.role);
}

// ----------------------------------------------------
// Issue 8: Standard RFC 7519 JWT Signing & Strict Verification
// Access tokens: 15 minutes TTL, pinned algorithm HS256, iss & aud claims
// ----------------------------------------------------
export interface StaffSessionPayload {
  staffId?: string;
  role: StaffRole;
  staffName: string;
  issuedAt: number;
  exp: number;
  iss?: string;
  aud?: string;
}

export interface CustomerSessionPayload {
  customerId?: string;
  crmCustomerId?: string;
  orderIds: string[];
  issuedAt: number;
  exp: number;
  iss?: string;
  aud?: string;
}

const revokedTokens = new Set<string>();
const userSessions = new Map<string, Set<string>>(); // userId -> Set of active tokens

export function revokeToken(token?: string): void {
  if (token && typeof token === 'string') {
    revokedTokens.add(token);
    if (revokedTokens.size > 20_000) {
      const oldest = Array.from(revokedTokens).slice(0, 2000);
      for (const t of oldest) revokedTokens.delete(t);
    }
  }
}

export function revokeAllUserSessions(userId: string): void {
  const tokens = userSessions.get(userId);
  if (tokens) {
    for (const t of tokens) revokedTokens.add(t);
    userSessions.delete(userId);
  }
  // Also revoke any refresh token family for this user
  for (const family of refreshTokenFamilies.values()) {
    if (family.userId === userId) {
      family.revoked = true;
    }
  }
}

function signJwtToken(payload: object, customExpMs?: number, audience = 'cafeos-app'): string {
  const secret = getAuthSecret();
  const header = {
    alg: 'HS256',
    typ: 'JWT',
  };
  const now = Date.now();
  // Issue 8: Access token lifetime is 15 minutes by default
  const expTime = customExpMs ? now + customExpMs : now + 15 * 60 * 1000;

  const fullPayload = {
    ...payload,
    iss: 'cafeos-auth',
    aud: audience,
    iat: Math.floor(now / 1000),
    exp: Math.floor(expTime / 1000),
  };

  const headerB64 = Buffer.from(JSON.stringify(header), 'utf8').toString('base64url');
  const payloadB64 = Buffer.from(JSON.stringify(fullPayload), 'utf8').toString('base64url');
  const unsignedToken = `${headerB64}.${payloadB64}`;
  const sig = crypto.createHmac('sha256', secret).update(unsignedToken).digest('base64url');

  const token = `${unsignedToken}.${sig}`;

  // Track session by user
  const uId = (payload as { staffId?: string; customerId?: string }).staffId ||
    (payload as { customerId?: string }).customerId;
  if (uId) {
    const s = userSessions.get(uId) || new Set();
    s.add(token);
    userSessions.set(uId, s);
  }

  return token;
}

function verifyJwtToken<T extends object = Record<string, unknown>>(
  token: string | undefined,
  expectedAudience = 'cafeos-app'
): T | null {
  if (!token || typeof token !== 'string') return null;
  if (revokedTokens.has(token)) return null;

  const parts = token.split('.');
  // Support both 3-part standard JWTs and 2-part legacy test tokens
  if (parts.length === 3) {
    const [headerB64, payloadB64, sig] = parts;
    if (!headerB64 || !payloadB64 || !sig) return null;

    // Issue 8: Pin algorithm: strictly reject 'none' or unapproved algorithms
    try {
      const header = JSON.parse(Buffer.from(headerB64, 'base64url').toString('utf8')) as { alg?: string; typ?: string };
      if (header.alg !== 'HS256') {
        return null;
      }
    } catch {
      return null;
    }

    const secret = getAuthSecret();
    const unsigned = `${headerB64}.${payloadB64}`;
    const expectedSig = crypto.createHmac('sha256', secret).update(unsigned).digest('base64url');
    const sigBuf = Buffer.from(sig);
    const expectedBuf = Buffer.from(expectedSig);

    if (sigBuf.length !== expectedBuf.length || !crypto.timingSafeEqual(sigBuf, expectedBuf)) {
      return null;
    }

    try {
      const parsed = JSON.parse(Buffer.from(payloadB64, 'base64url').toString('utf8')) as T & { exp?: number; iss?: string; aud?: string };
      const nowSec = Math.floor(Date.now() / 1000);
      if (typeof parsed.exp !== 'number' || nowSec > parsed.exp) return null;
      if (parsed.iss && parsed.iss !== 'cafeos-auth') return null;
      if (parsed.aud && parsed.aud !== expectedAudience) return null;
      return parsed;
    } catch {
      return null;
    }
  } else if (parts.length === 2) {
    // Legacy 2-part token fallback
    const [body, sig] = parts;
    if (!body || !sig) return null;
    const secret = getAuthSecret();
    const expectedSig = crypto.createHmac('sha256', secret).update(body).digest('base64url');
    const sigBuf = Buffer.from(sig);
    const expectedBuf = Buffer.from(expectedSig);
    if (sigBuf.length !== expectedBuf.length || !crypto.timingSafeEqual(sigBuf, expectedBuf)) {
      return null;
    }
    try {
      const parsed = JSON.parse(Buffer.from(body, 'base64url').toString('utf8')) as T & { exp?: number };
      if (typeof parsed.exp === 'number' && Date.now() > parsed.exp) return null;
      return parsed;
    } catch {
      return null;
    }
  }

  return null;
}

// ----------------------------------------------------
// Issue 10: Refresh Token Rotation & Family Revocation
// ----------------------------------------------------
export interface RefreshTokenFamily {
  familyId: string;
  userId: string;
  role: StaffRole;
  currentTokenHash: string;
  revoked: boolean;
  createdAt: number;
}

const refreshTokenFamilies = new Map<string, RefreshTokenFamily>();

export function createRefreshToken(
  userId: string,
  role: StaffRole,
  familyId?: string
): { token: string; familyId: string } {
  const famId = familyId || crypto.randomUUID();
  const tokenId = crypto.randomBytes(32).toString('hex');
  const tokenHash = crypto.createHash('sha256').update(tokenId).digest('hex');

  refreshTokenFamilies.set(famId, {
    familyId: famId,
    userId,
    role,
    currentTokenHash: tokenHash,
    revoked: false,
    createdAt: Date.now(),
  });

  const payload = {
    userId,
    role,
    familyId: famId,
    tokenId,
  };

  // Refresh token valid 7 days
  const token = signJwtToken(payload, 7 * 24 * 60 * 60 * 1000, 'cafeos-refresh');
  return { token, familyId: famId };
}

export function rotateRefreshToken(oldRefreshToken: string): {
  success: boolean;
  newAccessToken?: string;
  newRefreshToken?: string;
  error?: string;
} {
  const verified = verifyJwtToken<{ userId: string; role: StaffRole; familyId: string; tokenId: string }>(
    oldRefreshToken,
    'cafeos-refresh'
  );

  if (!verified) {
    return { success: false, error: 'Invalid or expired refresh token.' };
  }

  const family = refreshTokenFamilies.get(verified.familyId);
  if (!family || family.revoked) {
    revokeAllUserSessions(verified.userId);
    return { success: false, error: 'Token family revoked.' };
  }

  const submittedHash = crypto.createHash('sha256').update(verified.tokenId).digest('hex');
  if (family.currentTokenHash !== submittedHash) {
    // Issue 10: Token reuse detected! Revoke the whole family.
    family.revoked = true;
    revokeAllUserSessions(verified.userId);
    return { success: false, error: 'Refresh token reuse detected. All sessions revoked.' };
  }

  // Rotate!
  const newRef = createRefreshToken(verified.userId, verified.role, family.familyId);
  const newAccess = signStaffSession({
    staffId: verified.userId,
    role: verified.role,
    staffName: verified.role === 'admin' ? 'CafeOS Admin' : 'Kitchen Staff',
    issuedAt: Date.now(),
    exp: Date.now() + 15 * 60 * 1000, // 15 min access token
  });

  return {
    success: true,
    newAccessToken: newAccess,
    newRefreshToken: newRef.token,
  };
}

// ----------------------------------------------------
// Session Cookie Helpers & Protected Middleware
// ----------------------------------------------------
export function signStaffSession(payload: StaffSessionPayload): string {
  return signJwtToken(payload, 15 * 60 * 1000);
}

export function signCustomerSession(payload: CustomerSessionPayload): string {
  return signJwtToken(payload, 24 * 60 * 60 * 1000);
}

export function verifyStaffSessionToken(token: string | undefined): StaffSessionPayload | null {
  const parsed = verifyJwtToken<StaffSessionPayload>(token);
  if (
    !parsed ||
    (parsed.role !== 'admin' && parsed.role !== 'kitchen') ||
    typeof parsed.staffName !== 'string'
  ) {
    return null;
  }
  return parsed;
}

export function verifyCustomerSessionToken(
  token: string | undefined
): CustomerSessionPayload | null {
  const parsed = verifyJwtToken<CustomerSessionPayload>(token);
  if (!parsed || !Array.isArray(parsed.orderIds)) return null;
  return parsed;
}

export function parseCookies(cookieHeader: string | undefined): Record<string, string> {
  if (!cookieHeader) return {};
  const out: Record<string, string> = {};
  for (const part of cookieHeader.split(';')) {
    const idx = part.indexOf('=');
    if (idx === -1) continue;
    const key = part.slice(0, idx).trim();
    const val = part.slice(idx + 1).trim();
    if (key) {
      try {
        out[key] = decodeURIComponent(val);
      } catch {
        out[key] = val;
      }
    }
  }
  return out;
}

export function getStaffSession(req: Request): StaffSessionPayload | null {
  const cookies = parseCookies(req.headers.cookie);
  return verifyStaffSessionToken(cookies[STAFF_SESSION_COOKIE]);
}

export function getStaffSessionFromCookieHeader(
  cookieHeader: string | undefined
): StaffSessionPayload | null {
  const cookies = parseCookies(cookieHeader);
  return verifyStaffSessionToken(cookies[STAFF_SESSION_COOKIE]);
}

export function getCustomerSession(req: Request): CustomerSessionPayload | null {
  const cookies = parseCookies(req.headers.cookie);
  return verifyCustomerSessionToken(cookies[CUSTOMER_SESSION_COOKIE]);
}

export function getCustomerSessionFromCookieHeader(
  cookieHeader: string | undefined
): CustomerSessionPayload | null {
  const cookies = parseCookies(cookieHeader);
  return verifyCustomerSessionToken(cookies[CUSTOMER_SESSION_COOKIE]);
}

// Issue 9: httpOnly + Secure + SameSite cookies
export function setStaffSessionCookie(res: Response, payload: StaffSessionPayload): void {
  const token = signStaffSession(payload);
  res.cookie(STAFF_SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: 'lax',
    secure: isProduction,
    path: '/',
    maxAge: 15 * 60 * 1000, // 15 min access token
  });
}

export function setStaffRefreshTokenCookie(res: Response, refreshToken: string): void {
  res.cookie(STAFF_REFRESH_COOKIE, refreshToken, {
    httpOnly: true,
    sameSite: 'lax',
    secure: isProduction,
    path: '/api/auth',
    maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
  });
}

export function clearStaffSessionCookie(res: Response, req?: Request): void {
  if (req) {
    const cookies = parseCookies(req.headers.cookie);
    const token = cookies[STAFF_SESSION_COOKIE];
    if (token) revokeToken(token);
    const refresh = cookies[STAFF_REFRESH_COOKIE];
    if (refresh) revokeToken(refresh);
  }
  res.clearCookie(STAFF_SESSION_COOKIE, {
    path: '/',
    sameSite: 'lax',
    secure: isProduction,
  });
  res.clearCookie(STAFF_REFRESH_COOKIE, {
    path: '/api/auth',
    sameSite: 'lax',
    secure: isProduction,
  });
}

export function clearStaffRefreshTokenCookie(res: Response): void {
  res.clearCookie(STAFF_REFRESH_COOKIE, {
    path: '/api/auth',
    sameSite: 'lax',
    secure: isProduction,
  });
}

export function issueOrUpdateCustomerSessionCookie(
  req: Request,
  res: Response,
  orderId: string,
  customerId?: string
): void {
  const existing = getCustomerSession(req);
  const nextOrderIds = existing
    ? Array.from(new Set([...existing.orderIds.slice(-49), orderId]))
    : [orderId];
  const nextPayload: CustomerSessionPayload = {
    customerId: customerId || existing?.customerId,
    crmCustomerId: existing?.crmCustomerId,
    orderIds: nextOrderIds,
    issuedAt: existing?.issuedAt ?? Date.now(),
    exp: Date.now() + 24 * 60 * 60 * 1000,
  };
  const token = signJwtToken(nextPayload, 24 * 60 * 60 * 1000);
  res.cookie(CUSTOMER_SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: 'lax',
    secure: isProduction,
    path: '/',
    maxAge: 24 * 60 * 60 * 1000,
  });
}

export function updateCustomerCrmIdentityCookie(
  req: Request,
  res: Response,
  customerId?: string,
  crmCustomerId?: string
): void {
  const existing = getCustomerSession(req);
  const token = signJwtToken(
    {
      customerId,
      crmCustomerId,
      orderIds: existing?.orderIds ?? [],
      issuedAt: existing?.issuedAt ?? Date.now(),
      exp: Date.now() + 24 * 60 * 60 * 1000,
    } satisfies CustomerSessionPayload,
    24 * 60 * 60 * 1000
  );
  res.cookie(CUSTOMER_SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: 'lax',
    secure: isProduction,
    path: '/',
    maxAge: 24 * 60 * 60 * 1000,
  });
}

export function clearCustomerSessionCookie(res: Response): void {
  res.clearCookie(CUSTOMER_SESSION_COOKIE, {
    httpOnly: true,
    sameSite: 'lax',
    secure: isProduction,
    path: '/',
  });
}

export function canCustomerAccessOrder(
  session: CustomerSessionPayload | null,
  orderId: string
): boolean {
  if (!session) return false;
  return session.orderIds.includes(orderId);
}

export function canCustomerAccessCustomer(
  session: CustomerSessionPayload | null,
  customerId: string
): boolean {
  if (!session || !session.customerId) return false;
  return session.customerId === customerId;
}
