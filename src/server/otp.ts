import crypto from 'node:crypto';
import { isBrevoConfigured, sendBrevoConfirmationEmail } from './brevo';

interface StoredOtp {
  hashedCode: string;
  identifier: string; // phone or email
  ip: string;
  attempts: number;
  expiresAt: number;
  used: boolean;
}

interface SendTracker {
  count: number;
  windowStart: number;
}

// In-memory store (scoped per server; can be backed by Redis in multi-instance)
const otpStore = new Map<string, StoredOtp>();
const sendRateLimits = new Map<string, SendTracker>();

function hashOtp(code: string, salt: string): string {
  return crypto.scryptSync(code, salt, 32).toString('hex');
}

function checkSendRateLimit(key: string, maxSends = 3, windowMs = 15 * 60 * 1000): { allowed: boolean; retryAfterSeconds: number } {
  const now = Date.now();
  const tracker = sendRateLimits.get(key) || { count: 0, windowStart: now };
  if (now - tracker.windowStart > windowMs) {
    tracker.count = 0;
    tracker.windowStart = now;
  }
  if (tracker.count >= maxSends) {
    const retryAfterSeconds = Math.ceil((tracker.windowStart + windowMs - now) / 1000);
    return { allowed: false, retryAfterSeconds };
  }
  tracker.count += 1;
  sendRateLimits.set(key, tracker);
  return { allowed: true, retryAfterSeconds: 0 };
}

export interface RequestOtpParams {
  identifier: string; // email or phone
  ip: string;
  name?: string;
  email?: string;
  phone?: string;
}

export interface RequestOtpResult {
  success: boolean;
  message: string;
  retryAfterSeconds?: number;
  unavailable?: boolean;
}

export async function requestOtp(params: RequestOtpParams): Promise<RequestOtpResult> {
  const { identifier, ip, name = 'Customer', email, phone } = params;
  const cleanId = identifier.trim().toLowerCase();
  const cleanIp = ip.trim();
  const isTestMode = process.env.NODE_ENV === 'test';
  if (!isTestMode && (!email || !isBrevoConfigured())) {
    return {
      success: false,
      unavailable: true,
      message: 'OTP delivery is unavailable because email is not configured.',
    };
  }

  // Rate limit: max 3 sends per 15 min per identifier AND per IP
  const idCheck = checkSendRateLimit(`id:${cleanId}`);
  if (!idCheck.allowed) {
    return {
      success: false,
      message: `Too many OTP requests for this account. Please wait ${idCheck.retryAfterSeconds} seconds.`,
      retryAfterSeconds: idCheck.retryAfterSeconds,
    };
  }
  const ipCheck = checkSendRateLimit(`ip:${cleanIp}`);
  if (!ipCheck.allowed) {
    return {
      success: false,
      message: `Too many OTP requests from this network. Please wait ${ipCheck.retryAfterSeconds} seconds.`,
      retryAfterSeconds: ipCheck.retryAfterSeconds,
    };
  }

  // Issue 3: 6 digits from a CSPRNG (crypto.randomInt)
  const code = crypto.randomInt(100000, 1000000).toString();
  const salt = crypto.randomBytes(16).toString('hex');
  const hashedCode = `${salt}:${hashOtp(code, salt)}`;
  const expiresAt = Date.now() + 5 * 60 * 1000; // 5 minutes TTL

  otpStore.set(cleanId, {
    hashedCode,
    identifier: cleanId,
    ip: cleanIp,
    attempts: 0,
    expiresAt,
    used: false,
  });

  // Dispatch email if email provided
  if (!isTestMode) {
    try {
      const delivery = await sendBrevoConfirmationEmail({
        toEmail: email!,
        toName: name,
        phone,
        verificationCode: code,
      });
      if (!delivery.success) {
        otpStore.delete(cleanId);
        return {
          success: false,
          unavailable: true,
          message: 'OTP delivery is currently unavailable.',
        };
      }
    } catch {
      otpStore.delete(cleanId);
      return {
        success: false,
        unavailable: true,
        message: 'OTP delivery is currently unavailable.',
      };
    }
  }

  // Issue 4: Generic response
  return {
    success: true,
    message: "If an account exists, we've sent a 6-digit verification code.",
  };
}

export interface VerifyOtpParams {
  identifier: string;
  ip: string;
  code: string;
}

export interface VerifyOtpResult {
  valid: boolean;
  error?: string;
}

export function verifyOtp(params: VerifyOtpParams): VerifyOtpResult {
  const { identifier, code } = params;
  const cleanId = identifier.trim().toLowerCase();
  const stored = otpStore.get(cleanId);

  if (!stored || stored.used) {
    return { valid: false, error: 'Invalid or expired verification code.' };
  }

  // Check expiry (5 minutes)
  if (Date.now() > stored.expiresAt) {
    otpStore.delete(cleanId);
    return { valid: false, error: 'Verification code has expired. Please request a new one.' };
  }

  // Issue 1: Max 5 verify attempts per OTP. After 5 wrong tries, invalidate the OTP.
  stored.attempts += 1;
  if (stored.attempts > 5) {
    otpStore.delete(cleanId);
    return {
      valid: false,
      error: 'Maximum verification attempts exceeded. This OTP has been invalidated.',
    };
  }

  const [salt, expectedHash] = stored.hashedCode.split(':');
  if (!salt || !expectedHash) {
    otpStore.delete(cleanId);
    return { valid: false, error: 'Invalid code verification state.' };
  }

  const candidateHash = hashOtp(code.trim(), salt);
  const candidateBuf = Buffer.from(candidateHash, 'hex');
  const expectedBuf = Buffer.from(expectedHash, 'hex');

  if (candidateBuf.length !== expectedBuf.length || !crypto.timingSafeEqual(candidateBuf, expectedBuf)) {
    if (stored.attempts >= 5) {
      otpStore.delete(cleanId);
      return {
        valid: false,
        error: 'Maximum verification attempts exceeded. This OTP has been invalidated.',
      };
    }
    return {
      valid: false,
      error: `Invalid verification code. ${5 - stored.attempts} attempts remaining.`,
    };
  }

  // Single-use: Mark used and purge
  stored.used = true;
  otpStore.delete(cleanId);
  return { valid: true };
}

// For test verification only
export function __testOnlyGetOtp(identifier: string): StoredOtp | undefined {
  return otpStore.get(identifier.trim().toLowerCase());
}

export function __testOnlyResetOtpStore(): void {
  otpStore.clear();
  sendRateLimits.clear();
}
