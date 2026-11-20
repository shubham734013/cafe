import crypto from 'node:crypto';
import type { Request, Response } from 'express';
import type { StaffRole } from '../types/cafe';

const STAFF_SESSION_COOKIE = 'cafeos_staff_session';
const CUSTOMER_SESSION_COOKIE = 'cafeos_customer_session';
const PIN_SALT = 'cafeos-pin-salt-v1';
const configuredSuperAdminPin = process.env.CAFE_SUPER_ADMIN_PIN?.trim();
const isProduction = process.env.NODE_ENV === 'production';

const STAFF_PIN_ENV_VARS = [
  'CAFE_SUPER_ADMIN_PIN',
  'CAFE_OWNER_PIN',
  'CAFE_MANAGER_PIN',
  'CAFE_CASHIER_PIN',
  'CAFE_BARISTA_PIN',
  'CAFE_SERVER_PIN',
] as const;

function getAuthSecret(): string {
  const configured = process.env.CAFE_AUTH_SECRET?.trim();
  if (configured) return configured;
  if (process.env.NODE_ENV === 'production') {
    throw new Error('CAFE_AUTH_SECRET must be set in production.');
  }
  return crypto.createHash('sha256').update('seth-sawariya-cafeos-dev-secret').digest('hex');
}

export function assertAuthSecretConfigured(): void {
  const secret = getAuthSecret();
  if (isProduction && secret.length < 32) {
    throw new Error('CAFE_AUTH_SECRET must be at least 32 characters in production.');
  }
  if (isProduction) {
    const missingPins = STAFF_PIN_ENV_VARS.filter((name) => !process.env[name]?.trim());
    if (missingPins.length) {
      throw new Error(`Set all production staff PIN variables: ${missingPins.join(', ')}.`);
    }
  }
  const pins = ROLE_CONFIGS.map(({ role, pin }) => ({ role, pin }));
  for (const { role, pin } of pins) {
    if (!/^\d{4}$/.test(pin)) {
      throw new Error(`The configured ${role} PIN must be exactly 4 digits.`);
    }
    if (pins.some((other) => other.role !== role && other.pin === pin)) {
      throw new Error(`The configured ${role} PIN must be unique across staff roles.`);
    }
  }
}

const ROLE_CONFIGS: Array<{ role: StaffRole; staffName: string; pin: string }> = [
  ...(configuredSuperAdminPin
    ? [{ role: 'super-admin' as const, staffName: 'CafeOS Super Admin', pin: configuredSuperAdminPin }]
    : process.env.NODE_ENV === 'production'
      ? []
      : [{ role: 'super-admin' as const, staffName: 'CafeOS Super Admin', pin: '9999' }]),
  {
    role: 'owner',
    staffName: 'Seth Sawariya Owner',
    pin: process.env.CAFE_OWNER_PIN?.trim() || '7777',
  },
  {
    role: 'manager',
    staffName: 'Seth Sawariya Manager',
    pin: process.env.CAFE_MANAGER_PIN?.trim() || process.env.CAFE_STAFF_PIN?.trim() || '1234',
  },
  {
    role: 'cashier',
    staffName: 'Aarav S. (Cashier)',
    pin: process.env.CAFE_CASHIER_PIN?.trim() || '2345',
  },
  {
    role: 'barista',
    staffName: 'Neha Verma (Barista)',
    pin: process.env.CAFE_BARISTA_PIN?.trim() || '3456',
  },
  {
    role: 'server',
    staffName: 'Vikas Joshi (Server)',
    pin: process.env.CAFE_SERVER_PIN?.trim() || '4567',
  },
];

function getRoleSalt(role: StaffRole): string {
  return crypto
    .createHmac('sha256', getAuthSecret())
    .update(`cafeos-staff-role-salt-v2:${role}`)
    .digest('hex');
}

const STORED_ROLE_HASHES = ROLE_CONFIGS.map((cfg) => ({
  role: cfg.role,
  staffName: cfg.staffName,
  hash: crypto.scryptSync(cfg.pin, getRoleSalt(cfg.role), 32),
}));

export interface StaffSessionPayload {
  staffId?: string;
  role: StaffRole;
  staffName: string;
  issuedAt: number;
  exp: number;
}

export interface CustomerSessionPayload {
  customerId?: string;
  crmCustomerId?: string;
  orderIds: string[];
  issuedAt: number;
  exp: number;
}

export function authenticateStaffPin(
  pin: string,
  staffId?: string
): { role: StaffRole; staffName: string; staffId?: string } | null {
  let matched: { role: StaffRole; staffName: string; staffId?: string } | null = null;
  for (const entry of ROLE_CONFIGS) {
    const salt = getRoleSalt(entry.role);
    const candidate = crypto.scryptSync(pin, salt, 32);
    const targetHash = crypto.scryptSync(entry.pin, salt, 32);
    if (crypto.timingSafeEqual(candidate, targetHash)) {
      matched = { role: entry.role, staffName: entry.staffName, staffId };
    }
  }
  return matched;
}

export function verifyStaffPin(pin: string): boolean {
  return authenticateStaffPin(pin) !== null;
}

export function hasStaffRole(
  session: StaffSessionPayload | null,
  allowedRoles: readonly StaffRole[]
): boolean {
  if (!session) return false;
  return session.role === 'super-admin' || allowedRoles.includes(session.role);
}

function signToken(payload: object): string {
  const secret = getAuthSecret();
  const body = Buffer.from(JSON.stringify(payload), 'utf8').toString('base64url');
  const sig = crypto.createHmac('sha256', secret).update(body).digest('base64url');
  return `${body}.${sig}`;
}

function verifySignedToken<T extends { exp?: number }>(token: string | undefined): T | null {
  if (!token || !token.includes('.')) return null;
  const parts = token.split('.');
  if (parts.length !== 2) return null;
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
    const parsed = JSON.parse(Buffer.from(body, 'base64url').toString('utf8')) as T;
    if (typeof parsed.exp !== 'number' || Date.now() > parsed.exp) return null;
    return parsed;
  } catch {
    return null;
  }
}

export function signStaffSession(payload: StaffSessionPayload): string {
  return signToken(payload);
}

export function verifyStaffSessionToken(token: string | undefined): StaffSessionPayload | null {
  const parsed = verifySignedToken<StaffSessionPayload>(token);
  if (!parsed || typeof parsed.role !== 'string' || typeof parsed.staffName !== 'string') {
    return null;
  }
  return parsed;
}

export function verifyCustomerSessionToken(
  token: string | undefined
): CustomerSessionPayload | null {
  const parsed = verifySignedToken<CustomerSessionPayload>(token);
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

export function setStaffSessionCookie(res: Response, payload: StaffSessionPayload): void {
  const token = signStaffSession(payload);
  res.cookie(STAFF_SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    maxAge: 12 * 60 * 60 * 1000,
  });
}

export function clearStaffSessionCookie(res: Response): void {
  res.clearCookie(STAFF_SESSION_COOKIE, {
    path: '/',
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
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
  const token = signToken(nextPayload);
  res.cookie(CUSTOMER_SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
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
  const token = signToken({
    customerId,
    crmCustomerId,
    orderIds: existing?.orderIds ?? [],
    issuedAt: existing?.issuedAt ?? Date.now(),
    exp: Date.now() + 24 * 60 * 60 * 1000,
  } satisfies CustomerSessionPayload);
  res.cookie(CUSTOMER_SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    maxAge: 24 * 60 * 60 * 1000,
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
