// Centralized constants — no magic strings scattered across files

export const FIRE_MODES = {
  THRESHOLD_CROSS: 'threshold_cross',
  STATEFUL_TRUE: 'stateful_true',
  EVERY_POLL: 'every_poll',
  SCHEDULED: 'scheduled',
} as const;

export type FireMode = (typeof FIRE_MODES)[keyof typeof FIRE_MODES];

export const GENERATION_STATUS = {
  GENERATING: 'generating',
  READY: 'ready',
  FAILED: 'failed',
} as const;

export const REVIEW_STATUS = {
  DRAFT: 'draft',
  PENDING: 'pending',
  APPROVED: 'approved',
  REJECTED: 'rejected',
} as const;

export const POST_STATUS = {
  READY: 'ready',
  POSTED: 'posted',
  FAILED: 'failed',
  SKIPPED: 'skipped',
} as const;

export const JOB_TYPES = {
  GENERATE_CONTENT: 'generate-content',
  GENERATE_VISUAL: 'generate-visual',
  POST_TO_PLATFORM: 'post-to-platform',
} as const;

export const TEMPLATE_SELECTION = {
  NAMED: 'named',
  RANDOM: 'random',
} as const;

export const DEFAULT_LLM_MODEL = 'claude-haiku-4-5-20251001';
