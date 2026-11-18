import type { NextFunction, Request, Response } from 'express';

interface RateLimitOptions {
  windowMs: number;
  maxRequests: number;
  keyPrefix: string;
}

export function createRateLimiter(options: RateLimitOptions) {
  const hits = new Map<string, number[]>();

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
    // Express derives req.ip from the socket peer unless trust proxy is explicitly
    // configured. Never trust a client-supplied X-Forwarded-For value directly.
    const ip = req.ip || req.socket.remoteAddress || 'unknown';
    const key = `${options.keyPrefix}:${ip}`;
    const now = Date.now();
    const cutoff = now - options.windowMs;

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
