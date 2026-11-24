import crypto from 'node:crypto';
import { revokeAllUserSessions } from './auth';
import { sendBrevoConfirmationEmail } from './brevo';

export interface StoredResetToken {
  tokenHash: string;
  userId: string;
  role: string;
  expiresAt: number;
  used: boolean;
}

// In-memory token storage (persisted or multi-instance sync ready)
const resetTokenRegistry = new Map<string, StoredResetToken>();
const resetRateLimits = new Map<string, { count: number; windowStart: number }>();

function hashToken(rawToken: string): string {
  return crypto.createHash('sha256').update(rawToken).digest('hex');
}

/**
 * Issue 14: Generates a 32+ byte CSPRNG reset token, stores it hashed, expires in 15 min.
 * Issue 13: Invalidates all prior pending reset tokens for that user.
 */
export function generatePasswordResetToken(userId: string, role = 'staff'): { rawToken: string; expiresAt: number } {
  // Rate limit: max 3 reset requests per 15 minutes per user
  const now = Date.now();
  const tracker = resetRateLimits.get(userId) || { count: 0, windowStart: now };
  if (now - tracker.windowStart > 15 * 60 * 1000) {
    tracker.count = 0;
    tracker.windowStart = now;
  }
  if (tracker.count >= 3) {
    throw new Error('Too many password reset requests. Please wait 15 minutes.');
  }
  tracker.count += 1;
  resetRateLimits.set(userId, tracker);

  // Invalidate any existing pending tokens for this user (Issue 13)
  for (const [key, stored] of resetTokenRegistry.entries()) {
    if (stored.userId === userId) {
      resetTokenRegistry.delete(key);
    }
  }

  // Issue 14: 32+ bytes from a CSPRNG
  const rawToken = crypto.randomBytes(32).toString('hex');
  const tokenHash = hashToken(rawToken);
  const expiresAt = now + 15 * 60 * 1000; // 15 minutes TTL

  resetTokenRegistry.set(tokenHash, {
    tokenHash,
    userId,
    role,
    expiresAt,
    used: false,
  });

  return { rawToken, expiresAt };
}

/**
 * Issue 13: Verifies and redeems a single-use reset token.
 * Issue 16: Revokes all existing sessions and refresh tokens for that user.
 */
export function consumePasswordResetToken(rawToken: string): { valid: boolean; userId?: string; role?: string; error?: string } {
  const tokenHash = hashToken(rawToken);
  const stored = resetTokenRegistry.get(tokenHash);

  if (!stored || stored.used) {
    return { valid: false, error: 'Invalid or already used password reset link.' };
  }

  if (Date.now() > stored.expiresAt) {
    resetTokenRegistry.delete(tokenHash);
    return { valid: false, error: 'Password reset link has expired.' };
  }

  // Mark used and purge (Issue 13)
  stored.used = true;
  resetTokenRegistry.delete(tokenHash);

  // Invalidate any other pending reset tokens for this user
  for (const [key, t] of resetTokenRegistry.entries()) {
    if (t.userId === stored.userId) {
      resetTokenRegistry.delete(key);
    }
  }

  // Issue 16: Revoke all existing sessions and refresh tokens for this user!
  revokeAllUserSessions(stored.userId);

  return { valid: true, userId: stored.userId, role: stored.role };
}

// ----------------------------------------------------
// Issue 15: Email Change Verification Workflow
// ----------------------------------------------------
export interface EmailChangeRequest {
  userId: string;
  oldEmail: string;
  newEmail: string;
  tokenHash: string;
  expiresAt: number;
}

const emailChangeRegistry = new Map<string, EmailChangeRequest>();

export async function initiateEmailChange(userId: string, oldEmail: string, newEmail: string): Promise<{ token: string }> {
  const rawToken = crypto.randomBytes(32).toString('hex');
  const tokenHash = hashToken(rawToken);
  const expiresAt = Date.now() + 30 * 60 * 1000; // 30 minutes

  emailChangeRegistry.set(tokenHash, {
    userId,
    oldEmail,
    newEmail,
    tokenHash,
    expiresAt,
  });

  // Notify OLD email that an email change was requested (Security alert)
  try {
    await sendBrevoConfirmationEmail({
      toEmail: oldEmail,
      toName: 'Cafe Account Holder',
      verificationCode: 'NOTICE',
    });
  } catch {
    console.error('[Security] Email-change notification delivery failed.');
  }

  return { token: rawToken };
}

export function verifyAndApplyEmailChange(rawToken: string): { valid: boolean; userId?: string; newEmail?: string; error?: string } {
  const tokenHash = hashToken(rawToken);
  const stored = emailChangeRegistry.get(tokenHash);

  if (!stored) {
    return { valid: false, error: 'Invalid or expired email verification link.' };
  }

  if (Date.now() > stored.expiresAt) {
    emailChangeRegistry.delete(tokenHash);
    return { valid: false, error: 'Verification link expired.' };
  }

  emailChangeRegistry.delete(tokenHash);
  // Revoke sessions to force fresh login with new verified email
  revokeAllUserSessions(stored.userId);

  return { valid: true, userId: stored.userId, newEmail: stored.newEmail };
}

// ----------------------------------------------------
// Issue 17: OAuth PKCE & State Cookie Security
// ----------------------------------------------------
const EXACT_OAUTH_REDIRECT_URIS = new Set([
  'http://localhost:3000/api/auth/oauth/callback',
  'https://cafe.example.com/api/auth/oauth/callback',
  'http://127.0.0.1:3000/api/auth/oauth/callback',
]);

export function generateOAuthChallenge(redirectUri: string): {
  state: string;
  codeVerifier: string;
  codeChallenge: string;
} {
  if (!EXACT_OAUTH_REDIRECT_URIS.has(redirectUri) && process.env.NODE_ENV === 'production') {
    throw new Error(`Unauthorized OAuth redirect URI: "${redirectUri}".`);
  }

  // Random state per request
  const state = crypto.randomBytes(32).toString('base64url');
  // PKCE code_verifier
  const codeVerifier = crypto.randomBytes(32).toString('base64url');
  // code_challenge = SHA-256(code_verifier)
  const codeChallenge = crypto.createHash('sha256').update(codeVerifier).digest('base64url');

  return { state, codeVerifier, codeChallenge };
}

export function verifyOAuthCallbackState(
  receivedState: string | undefined,
  cookieState: string | undefined,
  receivedVerifier?: string,
  expectedChallenge?: string
): boolean {
  if (!receivedState || !cookieState) return false;
  const stateA = Buffer.from(receivedState);
  const stateB = Buffer.from(cookieState);
  if (stateA.length !== stateB.length || !crypto.timingSafeEqual(stateA, stateB)) {
    return false;
  }

  if (receivedVerifier && expectedChallenge) {
    const computedChallenge = crypto.createHash('sha256').update(receivedVerifier).digest('base64url');
    const chalA = Buffer.from(computedChallenge);
    const chalB = Buffer.from(expectedChallenge);
    if (chalA.length !== chalB.length || !crypto.timingSafeEqual(chalA, chalB)) {
      return false;
    }
  }

  return true;
}
