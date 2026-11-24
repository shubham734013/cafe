import crypto from 'node:crypto';
import { generateSecret, verifySync, generateURI } from 'otplib';

export interface Admin2FaState {
  enabled: boolean;
  secret: string; // Base32
  hashedRecoveryCodes: string[];
  lastVerifiedAt?: number;
}

const admin2FaRegistry = new Map<string, Admin2FaState>();

function hashRecoveryCode(code: string): string {
  return crypto.createHash('sha256').update(code.trim().toUpperCase()).digest('hex');
}

export function setupAdmin2Fa(adminId = 'admin'): {
  secret: string;
  otpauthUri: string;
  plainRecoveryCodes: string[];
} {
  const secret = generateSecret();
  const plainRecoveryCodes: string[] = [];
  const hashedRecoveryCodes: string[] = [];

  for (let i = 0; i < 8; i++) {
    const raw = crypto.randomBytes(5).toString('hex').toUpperCase(); // 10 chars
    plainRecoveryCodes.push(raw);
    hashedRecoveryCodes.push(hashRecoveryCode(raw));
  }

  const otpauthUri = generateURI({
    secret,
    label: 'admin@cafeos',
    issuer: 'Seth Sawariya CafeOS',
  });

  admin2FaRegistry.set(adminId, {
    enabled: false, // will be marked true upon first successful token verification
    secret,
    hashedRecoveryCodes,
  });

  return { secret, otpauthUri, plainRecoveryCodes };
}

export function confirmAndEnableAdmin2Fa(adminId = 'admin', token: string): boolean {
  const state = admin2FaRegistry.get(adminId);
  if (!state) return false;

  const result = verifySync({ token: token.trim(), secret: state.secret });
  if (result.valid) {
    state.enabled = true;
    state.lastVerifiedAt = Date.now();
    admin2FaRegistry.set(adminId, state);
    return true;
  }
  return false;
}

export function verifyAdmin2Fa(
  adminId = 'admin',
  tokenOrRecoveryCode: string
): { valid: boolean; usedRecoveryCode: boolean } {
  const state = admin2FaRegistry.get(adminId);
  if (!state || !state.enabled) {
    // If not configured yet, allow setup
    return { valid: false, usedRecoveryCode: false };
  }

  const cleanInput = tokenOrRecoveryCode.trim();

  // 1. Try TOTP code if exactly 6 digits
  if (/^\d{6}$/.test(cleanInput)) {
    try {
      const result = verifySync({ token: cleanInput, secret: state.secret });
      if (result.valid) {
        state.lastVerifiedAt = Date.now();
        return { valid: true, usedRecoveryCode: false };
      }
    } catch {
      // Fall through to recovery code check
    }
  }

  // 2. Try recovery codes
  const hashedCandidate = hashRecoveryCode(cleanInput);
  const codeIndex = state.hashedRecoveryCodes.indexOf(hashedCandidate);
  if (codeIndex !== -1) {
    // Single-use: remove used recovery code
    state.hashedRecoveryCodes.splice(codeIndex, 1);
    state.lastVerifiedAt = Date.now();
    return { valid: true, usedRecoveryCode: true };
  }

  return { valid: false, usedRecoveryCode: false };
}

export function isAdmin2FaRequired(adminId = 'admin'): boolean {
  const state = admin2FaRegistry.get(adminId);
  return Boolean(state?.enabled);
}

export function isRecentAdminStepUpVerified(adminId = 'admin', windowMs = 5 * 60 * 1000): boolean {
  const state = admin2FaRegistry.get(adminId);
  if (!state?.enabled) return true; // If 2FA not enabled, skip step-up
  if (!state.lastVerifiedAt) return false;
  return Date.now() - state.lastVerifiedAt <= windowMs;
}
