import { z } from 'zod';
import 'dotenv/config';

const envSchema = z.object({
  VIRAL_DATABASE_URL: z.string().url(),
  ANTHROPIC_API_KEY: z.string().optional(),
  OPENAI_API_KEY: z.string().optional(),
  LLM_PROVIDER: z.enum(['claude', 'openai']).default('claude'),
  LLM_MODEL: z.string().default('claude-haiku-4-5-20251001'),
  TWITTER_API_KEY: z.string().optional(),    // app-level key (shared across all accounts)
  TWITTER_API_SECRET: z.string().optional(), // app-level secret (shared across all accounts)
  TWITTER_BEARER_TOKEN: z.string().optional(),
  // Per-account access tokens are stored in accounts.credentials JSONB, not in env
  WORKER_ID: z.string().default(`worker-${process.pid}`),
  ASSET_DIR: z.string().default('./assets'),
  PUBLIC_ASSET_BASE_URL: z.string().default('http://localhost:3001/assets'), // public URL base for platform APIs (Instagram, Pinterest)
  PORT: z.coerce.number().default(3001),
  AUTH_SECRET: z.string().default('dev-secret'),
});

export const config = envSchema.parse(process.env);
export type Config = z.infer<typeof envSchema>;
