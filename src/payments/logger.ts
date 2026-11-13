const SENSITIVE_KEYS = new Set([
  'apikey',
  'api_key',
  'secret',
  'webhooksecret',
  'webhook_secret',
  'signature',
  'x-merchant-key',
  'x-gateway-signature',
  'x-gateway-signature-v2',
  'authorization',
  'password',
  'pin',
  'token',
]);

export function maskVpa(vpa?: string): string | undefined {
  if (!vpa) return undefined;
  const trimmed = vpa.trim();
  const atIndex = trimmed.indexOf('@');
  if (atIndex <= 0) return '***';
  const local = trimmed.slice(0, atIndex);
  const handle = trimmed.slice(atIndex);
  if (local.length <= 2) return `${local[0] ?? '*'}***${handle}`;
  return `${local.slice(0, 2)}***${handle}`;
}

export function maskPhone(phone?: string): string | undefined {
  if (!phone) return undefined;
  const digits = phone.replace(/\D/g, '');
  if (digits.length < 4) return '****';
  return `${digits.slice(0, 2)}****${digits.slice(-4)}`;
}

function sanitizeMeta(value: unknown, keyHint = ''): unknown {
  if (value === null || value === undefined) return value;
  const lowerKey = keyHint.toLowerCase();
  if (SENSITIVE_KEYS.has(lowerKey)) return '[REDACTED]';
  if (lowerKey.includes('vpa') && typeof value === 'string') return maskVpa(value);
  if ((lowerKey.includes('phone') || lowerKey.includes('mobile')) && typeof value === 'string') {
    return maskPhone(value);
  }
  if (Array.isArray(value)) return value.map((item) => sanitizeMeta(item));
  if (typeof value === 'object') {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      out[k] = sanitizeMeta(v, k);
    }
    return out;
  }
  return value;
}

function emit(level: 'info' | 'warn' | 'error', event: string, meta?: Record<string, unknown>): void {
  if (process.env.NODE_ENV === 'test' && level === 'info') {
    // Keep structured logs quiet during test runs unless warn/error
  }
  const entry = {
    ts: new Date().toISOString(),
    module: 'youpi-payments',
    level,
    event,
    ...(meta ? { meta: sanitizeMeta(meta) } : {}),
  };
  const line = JSON.stringify(entry);
  if (level === 'error') {
    console.error(line);
  } else if (level === 'warn') {
    console.warn(line);
  } else {
    console.log(line);
  }
}

export const paymentLogger = {
  info: (event: string, meta?: Record<string, unknown>) => emit('info', event, meta),
  warn: (event: string, meta?: Record<string, unknown>) => emit('warn', event, meta),
  error: (event: string, meta?: Record<string, unknown>) => emit('error', event, meta),
};
