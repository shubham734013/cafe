import crypto from 'node:crypto';
import type { Request, Response } from 'express';
import type { StaffRole } from '../types/cafe';

const STAFF_SESSION_COOKIE = 'cafeos_staff_session';
const CUSTOMER_SESSION_COOKIE = 'cafeos_customer_session';
const PIN_SALT = 'cafeos-pin-salt-v1';

function getAuthSecret(): string {
  const configured = process.env.CAFE_AUTH_SECRET?.trim();
  if (configured) return configured;
  if (process.env.NODE_ENV === 'production') {
    throw new Error('CAFE_AUTH_SECRET must be set in production.');
  }
  return crypto.createHash('sha256').update('seth-sawariya-cafeos-dev-secret').digest('hex');
}

export function assertAuthSecretConfigured(): void {
  void getAuthSecret();
}

const ROLE_CONFIGS: Array<{ role: StaffRole; staffName: string; pin: string }> = [
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

const STORED_ROLE_HASHES = ROLE_CONFIGS.map((cfg) => ({
  role: cfg.role,
  staffName: cfg.staffName,
  hash: crypto.scryptSync(cfg.pin, PIN_SALT, 32),
}));

export interface StaffSessionPayload {
  role: StaffRole;
  staffName: string;
  issuedAt: number;
  exp: number;
}

export interface CustomerSessionPayload {
  customerId?: string;
  orderIds: string[];
  issuedAt: number;
  exp: number;
}

export function authenticateStaffPin(
  pin: string
): { role: StaffRole; staffName: string } | null {
  const candidate = crypto.scryptSync(pin, PIN_SALT, 32);
  let matched: { role: StaffRole; staffName: string } | null = null;
  for (const entry of STORED_ROLE_HASHES) {
    if (crypto.timingSafeEqual(candidate, entry.hash)) {
      matched = { role: entry.role, staffName: entry.staffName };
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
  return allowedRoles.includes(session.role);
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
