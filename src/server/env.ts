import { z } from 'zod';

const optionalString = z.preprocess(
  (value) => (typeof value === 'string' && value.trim() === '' ? undefined : value),
  z.string().trim().optional()
);

const envSchema = z
  .object({
    NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
    PORT: z.coerce.number().int().positive().default(3000),
    MONGODB_URI: optionalString,
    MONGODB_DB_NAME: optionalString,
    MONGODB_MAX_POOL_SIZE: z.coerce.number().int().positive().default(20),
    MONGODB_MIN_POOL_SIZE: z.coerce.number().int().min(0).default(5),
    CAFE_AUTH_SECRET: optionalString,
    CAFE_ADMIN_PIN: optionalString,
    CAFE_KITCHEN_PIN: optionalString,
    CORS_ORIGIN: optionalString,
    APP_PUBLIC_URL: optionalString,
    APP_URL: optionalString,
    TRUST_PROXY_HOPS: z.coerce.number().int().min(0).default(0),
    TRUST_PROXY: optionalString,
    DATABASE_URL: optionalString,
    POSTGRES_URL: optionalString,
    PG_MAX_POOL: z.coerce.number().int().positive().optional(),
    ENABLE_CAPTCHA_VERIFICATION: z.enum(['true', 'false']).default('false'),
    CAPTCHA_SECRET_KEY: optionalString,
    CAPTCHA_VERIFY_URL: optionalString,
    BREVO_API_KEY: optionalString,
    BREVO_SENDER_EMAIL: optionalString,
    BREVO_SENDER_NAME: optionalString,
    CASHFREE_APP_ID: optionalString,
    CASHFREE_SECRET_KEY: optionalString,
    CASHFREE_WEBHOOK_SECRET: optionalString,
    CASHFREE_API_VERSION: optionalString,
    CASHFREE_ENVIRONMENT: z.enum(['SANDBOX', 'PRODUCTION']).optional(),
    UPI_GATEWAY_API_URL: optionalString,
    UPI_GATEWAY_API_KEY: optionalString,
    UPI_GATEWAY_API_SECRET: optionalString,
    UPI_GATEWAY_WEBHOOK_SECRET: optionalString,
    SUPABASE_URL: optionalString,
    SUPABASE_ANON_KEY: optionalString,
    VITE_SUPABASE_URL: optionalString,
    VITE_SUPABASE_ANON_KEY: optionalString,
    VITE_GOOGLE_CLIENT_ID: optionalString,
    GOOGLE_CLIENT_ID: optionalString,
  })
  .superRefine((env, context) => {
    if (env.NODE_ENV !== 'production') return;

    const required = [
      ['MONGODB_URI', env.MONGODB_URI],
      ['MONGODB_DB_NAME', env.MONGODB_DB_NAME],
      ['CAFE_AUTH_SECRET', env.CAFE_AUTH_SECRET],
      ['CAFE_ADMIN_PIN', env.CAFE_ADMIN_PIN],
      ['CAFE_KITCHEN_PIN', env.CAFE_KITCHEN_PIN],
      ['APP_PUBLIC_URL or APP_URL', env.APP_PUBLIC_URL || env.APP_URL],
      ['CORS_ORIGIN', env.CORS_ORIGIN],
    ] as const;
    for (const [name, value] of required) {
      if (!value?.trim()) {
        context.addIssue({
          code: 'custom',
          message: `Required in production: ${name}.`,
          path: [name.split(' ')[0]],
        });
      }
    }

    if (env.CAFE_AUTH_SECRET && env.CAFE_AUTH_SECRET.length < 32) {
      context.addIssue({
        code: 'custom',
        message: 'Must contain at least 32 characters in production.',
        path: ['CAFE_AUTH_SECRET'],
      });
    }

    const weakPins = new Set(['7777', '3456', '1234', '0000', '1111']);
    const pins = [env.CAFE_ADMIN_PIN, env.CAFE_KITCHEN_PIN].filter(
      (pin): pin is string => Boolean(pin)
    );
    for (const [name, pin] of [
      ['CAFE_ADMIN_PIN', env.CAFE_ADMIN_PIN],
      ['CAFE_KITCHEN_PIN', env.CAFE_KITCHEN_PIN],
    ] as const) {
      if (pin && (!/^\d{4}$/.test(pin) || weakPins.has(pin))) {
        context.addIssue({
          code: 'custom',
          message: 'Must be a unique, non-default 4-digit PIN in production.',
          path: [name],
        });
      }
    }
    if (new Set(pins).size !== pins.length) {
      context.addIssue({
        code: 'custom',
        message: 'Staff PINs must be unique in production.',
        path: ['CAFE_KITCHEN_PIN'],
      });
    }

    const appUrl = env.APP_PUBLIC_URL || env.APP_URL;
    if (appUrl) {
      try {
        if (new URL(appUrl).protocol !== 'https:') throw new Error();
      } catch {
        context.addIssue({
          code: 'custom',
          message: 'Must be a valid HTTPS URL in production.',
          path: ['APP_PUBLIC_URL'],
        });
      }
    }

    if (env.CORS_ORIGIN) {
      const origins = env.CORS_ORIGIN.split(',').map((origin) => origin.trim());
      let hasPublicOrigin = false;
      for (const origin of origins) {
        try {
          const parsed = new URL(origin);
          if (parsed.protocol !== 'https:') throw new Error();
          if (appUrl && parsed.origin === new URL(appUrl).origin) hasPublicOrigin = true;
        } catch {
          context.addIssue({
            code: 'custom',
            message: 'Each production origin must be a valid HTTPS origin.',
            path: ['CORS_ORIGIN'],
          });
        }
      }
      if (appUrl && !hasPublicOrigin) {
        context.addIssue({
          code: 'custom',
          message: 'Must include the origin configured by APP_PUBLIC_URL or APP_URL.',
          path: ['CORS_ORIGIN'],
        });
      }
    }

    if (
      env.ENABLE_CAPTCHA_VERIFICATION === 'true' &&
      !env.CAPTCHA_SECRET_KEY
    ) {
      context.addIssue({
        code: 'custom',
        message: 'CAPTCHA_SECRET_KEY is required when CAPTCHA verification is enabled.',
        path: ['CAPTCHA_SECRET_KEY'],
      });
    }
  });

export type ValidatedEnv = z.infer<typeof envSchema>;

export function validateEnv(
  customEnv: Record<string, string | undefined> = process.env
): ValidatedEnv {
  const result = envSchema.safeParse(customEnv);
  if (!result.success) {
    const details = result.error.issues
      .map((issue) => `${issue.path.join('.') || 'environment'}: ${issue.message}`)
      .join('; ');
    throw new Error(`Invalid environment configuration: ${details}`);
  }
  return result.data;
}
