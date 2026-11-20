import type { NextFunction, Request, Response } from 'express';

interface RateLimitOptions {
  windowMs: number;
  maxRequests: number;
  keyPrefix: string;
}

/**
 * Extracts client IP securely without allowing spoofed X-Forwarded-For headers
 * from untrusted upstream connections.
 */
export function getTrustedClientIp(req: Request): string {
  // If Express trust proxy is enabled, req.ip resolves via configured trusted proxies
  if (req.ip && req.ip !== '::1' && req.ip !== '127.0.0.1') {
    return req.ip;
  }

  // If behind a trusted reverse proxy (explicitly configured via TRUSTED_PROXY)
  const isTrustedProxy = Boolean(process.env.TRUST_PROXY || process.env.TRUSTED_PROXY);
  if (isTrustedProxy) {
    const xff = req.headers['x-forwarded-for'];
    if (typeof xff === 'string' && xff.trim()) {
      const parts = xff.split(',').map((p) => p.trim()).filter(Boolean);
      // Rightmost entry is appended by the immediate trusted proxy, preventing client header spoofing
      if (parts.length > 0) {
        return parts[parts.length - 1];
      }
    }
  }

  return req.ip || req.socket.remoteAddress || '127.0.0.1';
}

export function createRateLimiter(options: RateLimitOptions) {
  const hits = new Map<string, number[]>();
  const MAX_TRACKED_KEYS = 10_000;

  const sweepInterval = setInterval(() => {
    const cutoff = Date.now() - options.windowMs;
    for (const [key, timestamps] of hits.entries()) {
      const recent = timestamps.filter((t) => t > cutoff);
      if (recent.length === 0) {
        hits.delete(key);
      } else {
        hits.set(key, recent);
      }
    }
  }, Math.max(30_000, options.windowMs));
  sweepInterval.unref();

  return (req: Request, res: Response, next: NextFunction): void => {
    const clientIp = getTrustedClientIp(req);
    const key = `${options.keyPrefix}:${clientIp}`;
    const now = Date.now();
    const cutoff = now - options.windowMs;

    // Guard against memory exhaustion from random IP spoofing
    if (hits.size >= MAX_TRACKED_KEYS && !hits.has(key)) {
      // Evict oldest keys
      const keys = Array.from(hits.keys()).slice(0, 500);
      for (const k of keys) hits.delete(k);
    }

    const existing = (hits.get(key) ?? []).filter((t) => t > cutoff);
    if (existing.length >= options.maxRequests) {
      const oldest = existing[0] ?? now;
      const retryAfterSec = Math.max(1, Math.ceil((oldest + options.windowMs - now) / 1000));
      res.setHeader('Retry-After', String(retryAfterSec));
      res.status(429).json({
        error: 'Too many requests. Please wait a few seconds and try again.',
      });
      return;
    }

    existing.push(now);
    hits.set(key, existing);
    next();
  };
}

export function createTableRateLimiter(options: { windowMs: number; maxRequests: number }) {
  const hits = new Map<string, number[]>();

  return (req: Request, res: Response, next: NextFunction): void => {
    const tableId = req.body?.tableNumber || req.query?.table || req.query?.token;
    if (!tableId || typeof tableId !== 'string') {
      next();
      return;
    }

    const key = `table:${tableId.trim().toUpperCase()}`;
    const now = Date.now();
    const cutoff = now - options.windowMs;

    const existing = (hits.get(key) ?? []).filter((t) => t > cutoff);
    if (existing.length >= options.maxRequests) {
      const oldest = existing[0] ?? now;
      const retryAfterSec = Math.max(1, Math.ceil((oldest + options.windowMs - now) / 1000));
      res.setHeader('Retry-After', String(retryAfterSec));
      res.status(429).json({
        error: `Too many orders placed for ${tableId}. Please wait ${retryAfterSec}s before submitting again.`,
      });
      return;
    }

    existing.push(now);
    hits.set(key, existing);
    next();
  };
}
