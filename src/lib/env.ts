import { z } from 'zod';

const envSchema = z.object({
  MONGODB_URI: z.string().min(1, 'MONGODB_URI required'),
  MONGODB_DB: z.string().default('vedryx'),
  PREVIEW_MODE: z
    .string()
    .optional()
    .transform((v) => v === 'true'),
  AUTH_SECRET: z.string().min(1, 'AUTH_SECRET required'),
  AUTH_URL: z.string().url().optional(),
  GOOGLE_CLIENT_ID: z.string().min(1, 'GOOGLE_CLIENT_ID required'),
  GOOGLE_CLIENT_SECRET: z.string().min(1, 'GOOGLE_CLIENT_SECRET required'),
  ALLOWED_EMAIL_DOMAINS: z
    .string()
    .default('vedryxtech.com')
    .transform((v) =>
      v
        .split(',')
        .map((s) => s.trim().toLowerCase())
        .filter(Boolean),
    ),
  LOG_LEVEL: z.string().default('info'),
});

// During `next build` env may not be set yet for some imports; tolerate partial.
const parsed = envSchema.safeParse(process.env);

if (!parsed.success && process.env.NODE_ENV !== 'production') {
  // soft warn in dev; throw lazily on use
  // eslint-disable-next-line no-console
  console.warn('[env] partial parse:', parsed.error.flatten().fieldErrors);
}

export const env = (parsed.success
  ? parsed.data
  : (process.env as unknown)) as z.infer<typeof envSchema>;

export const isPreview = env.PREVIEW_MODE === true;
