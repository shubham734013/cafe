import { z } from 'zod';

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  PORT: z.coerce.number().int().positive().default(3000),
  MONGODB_URI: z.string().default('mongodb://127.0.0.1:27017'),
  MONGODB_DB_NAME: z.string().default('cafeos'),
  MONGODB_MAX_POOL_SIZE: z.coerce.number().int().positive().default(20),
  MONGODB_MIN_POOL_SIZE: z.coerce.number().int().min(0).default(5),
  CAFE_AUTH_SECRET: z.string().min(16).default('development_insecure_cafe_auth_secret_minimum_32_characters_long_1234'),
  CAFE_REFRESH_SECRET: z.string().min(16).default('development_insecure_cafe_refresh_secret_minimum_32_characters_1234'),
  STAFF_ADMIN_PIN: z.string().default('7777'),
  STAFF_KITCHEN_PIN: z.string().default('1234'),
  DATABASE_URL: z.string().optional(),
  REDIS_URL: z.string().optional(),
  BREVO_API_KEY: z.string().optional(),
  CASHFREE_APP_ID: z.string().optional(),
  CASHFREE_SECRET_KEY: z.string().optional(),
});

export type ValidatedEnv = z.infer<typeof envSchema>;

let cachedEnv: ValidatedEnv | null = null;

export function validateEnv(customEnv: Record<string, string | undefined> = process.env): ValidatedEnv {
  if (cachedEnv && customEnv === process.env) {
    return cachedEnv;
  }

  const result = envSchema.safeParse(customEnv);
  if (!result.success) {
    const formatted = result.error.format();
    const errorDetails = JSON.stringify(formatted, null, 2);
    console.error('[Startup Env Validation Failed]:', errorDetails);
    if (customEnv.NODE_ENV === 'production') {
      throw new Error(`Fatal: Invalid environment configuration for production startup: ${errorDetails}`);
    }
  }

  const validated = result.success ? result.data : (customEnv as unknown as ValidatedEnv);
  if (customEnv === process.env) {
    cachedEnv = validated;
  }
  return validated;
}
