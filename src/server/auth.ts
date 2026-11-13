import crypto from 'node:crypto';
import type { Request, Response } from 'express';

const SESSION_COOKIE = 'cafeos_staff_session';
const SECRET =
  process.env.CAFE_AUTH_SECRET || crypto.createHash('sha256').update('seth-sawariya-cafeos-dev-secret').digest('hex');

const DEFAULT_STAFF_PIN = process.env.CAFE_STAFF_PIN || '1234';
const PIN_SALT = 'cafeos-pin-salt-v1';
const STORED_PIN_HASH = crypto.scryptSync(DEFAULT_STAFF_PIN, PIN_SALT, 32);

export interface StaffSessionPayload {
  role: 'manager';
  staffName: string;
  issuedAt: number;
  exp: number;
}

export function verifyStaffPin(pin: string): boolean {
  const candidate = crypto.scryptSync(pin, PIN_SALT, 32);
  return crypto.timingSafeEqual(candidate, STORED_PIN_HASH);
}

export function signStaffSession(payload: StaffSessionPayload): string {
  const body = Buffer.from(JSON.stringify(payload), 'utf8').toString('base64url');
  const sig = crypto.createHmac('sha256', SECRET).update(body).digest('base64url');
  return `${body}.${sig}`;
}

export function verifyStaffSessionToken(token: string | undefined): StaffSessionPayload | null {
  if (!token || !token.includes('.')) return null;
  const [body, sig] = token.split('.');
  if (!body || !sig) return null;
  const expectedSig = crypto.createHmac('sha256', SECRET).update(body).digest('base64url');
  const sigBuf = Buffer.from(sig);
  const expectedBuf = Buffer.from(expectedSig);
  if (sigBuf.length !== expectedBuf.length || !crypto.timingSafeEqual(sigBuf, expectedBuf)) {
    return null;
  }
  try {
    const parsed = JSON.parse(Buffer.from(body, 'base64url').toString('utf8')) as StaffSessionPayload;
    if (typeof parsed.exp !== 'number' || Date.now() > parsed.exp) return null;
    return parsed;
  } catch {
    return null;
  }
}

export function parseCookies(cookieHeader: string | undefined): Record<string, string> {
  if (!cookieHeader) return {};
  const out: Record<string, string> = {};
  for (const part of cookieHeader.split(';')) {
    const idx = part.indexOf('=');
    if (idx === -1) continue;
    const key = part.slice(0, idx).trim();
    const val = part.slice(idx + 1).trim();
    if (key) out[key] = decodeURIComponent(val);
  }
  return out;
}

export function getStaffSession(req: Request): StaffSessionPayload | null {
  const cookies = parseCookies(req.headers.cookie);
  return verifyStaffSessionToken(cookies[SESSION_COOKIE]);
}

export function setStaffSessionCookie(res: Response, payload: StaffSessionPayload): void {
  const token = signStaffSession(payload);
  res.cookie(SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: 'lax',
    path: '/',
    maxAge: 12 * 60 * 60 * 1000,
  });
}

export function clearStaffSessionCookie(res: Response): void {
  res.clearCookie(SESSION_COOKIE, { path: '/' });
}
