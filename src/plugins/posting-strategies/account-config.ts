export interface AccountConfig {
  postingStrategy?: string;
  dryRun?: boolean;
  platformMeta?: Record<string, unknown>;
  [key: string]: unknown;
}

export function asAccountConfig(raw: unknown): AccountConfig {
  return (raw ?? {}) as AccountConfig;
}
