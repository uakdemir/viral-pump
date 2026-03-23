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

export const HEALTH_THRESHOLDS = {
  JOB_QUEUE: {
    PENDING_YELLOW: 10,
    PENDING_RED: 51,
    FAILED_HOUR_YELLOW: 1,
    FAILED_HOUR_RED: 6,
  },
  FAILURE_RATE: {
    YELLOW: 0.05,
    RED: 0.15,
  },
  DATA_SOURCE: {
    OVERDUE_YELLOW_MULTIPLIER: 2,
    OVERDUE_RED_MULTIPLIER: 5,
  },
  ACCOUNTS: {
    FAILED_COUNT_YELLOW: 1,
    FAILED_RATIO_RED: 0.5,
  },
} as const;
