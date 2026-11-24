import type { NextFunction, Request, Response } from 'express';

/**
 * Escapes characters that have special meaning in HTML/scripts
 * to prevent Cross-Site Scripting (XSS) when embedding JSON into HTML.
 */
export function safeJsonForHtml(data: unknown): string {
  return JSON.stringify(data)
    .replace(/</g, '\\u003c')
    .replace(/>/g, '\\u003e')
    .replace(/&/g, '\\u0026')
    .replace(/\u2028/g, '\\u2028')
    .replace(/\u2029/g, '\\u2029');
}

/**
 * HTML encodes user-supplied plain text strings to prevent stored XSS.
 */
export function sanitizeHtml(input: string): string {
  return input
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#x27;');
}

/**
 * Recursively scans an object or array for NoSQL query injection vectors.
 * Keys beginning with '$' or containing '.' are rejected to prevent MongoDB operator injection.
 */
export function hasNoSqlInjection(obj: unknown): boolean {
  if (!obj || typeof obj !== 'object') return false;

  if (Array.isArray(obj)) {
    return obj.some((item) => hasNoSqlInjection(item));
  }

  for (const [key, value] of Object.entries(obj as Record<string, unknown>)) {
    if (key.startsWith('$') || key.includes('.')) {
      return true;
    }
    if (value && typeof value === 'object' && hasNoSqlInjection(value)) {
      return true;
    }
  }

  return false;
}

/**
 * Express middleware that rejects requests containing NoSQL operator keys ($ or .).
 */
export function noSqlInjectionSanitizer(req: Request, res: Response, next: NextFunction): void {
  if (hasNoSqlInjection(req.body) || hasNoSqlInjection(req.query) || hasNoSqlInjection(req.params)) {
    res.status(400).json({ error: 'Malicious query or operator injection detected.' });
    return;
  }
  next();
}

/**
 * Server-side CAPTCHA verification behind an environment flag.
 * If verification is enabled, missing credentials or provider failures fail closed.
 */
export async function verifyCaptchaToken(token?: string): Promise<{ valid: boolean; error?: string }> {
  const isEnabled = process.env.ENABLE_CAPTCHA_VERIFICATION === 'true';
  if (!isEnabled) {
    return { valid: true };
  }

  if (!token || typeof token !== 'string' || !token.trim()) {
    return { valid: false, error: 'CAPTCHA verification token is required.' };
  }

  const secretKey = process.env.CAPTCHA_SECRET_KEY;
  if (!secretKey) {
    return { valid: false, error: 'CAPTCHA verification is unavailable.' };
  }

  try {
    const verifyUrl = process.env.CAPTCHA_VERIFY_URL || 'https://challenges.cloudflare.com/turnstile/v0/siteverify';
    const response = await fetch(verifyUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        secret: secretKey,
        response: token.trim(),
      }),
    });
    if (!response.ok) {
      return { valid: false, error: 'Could not contact CAPTCHA verification service.' };
    }
    const result = (await response.json()) as { success?: boolean };
    return { valid: Boolean(result?.success), error: result?.success ? undefined : 'CAPTCHA verification failed.' };
  } catch {
    return { valid: false, error: 'Could not contact CAPTCHA verification service.' };
  }
}
