export interface DecayPhase {
  durationMs: number;
  intervalMs: number;
}

export interface MetricsSchedule {
  phases: DecayPhase[];
  maxAgeMs: number;
}

export const METRICS_SCHEDULES: Record<string, MetricsSchedule> = {
  twitter: {
    phases: [
      { durationMs: 2 * 60 * 60_000, intervalMs: 5 * 60_000 },
      { durationMs: 22 * 60 * 60_000, intervalMs: 30 * 60_000 },
      { durationMs: 6 * 24 * 60 * 60_000, intervalMs: 6 * 60 * 60_000 },
    ],
    maxAgeMs: 7 * 24 * 60 * 60_000,
  },
  instagram: {
    phases: [
      { durationMs: 6 * 60 * 60_000, intervalMs: 15 * 60_000 },
      { durationMs: 42 * 60 * 60_000, intervalMs: 60 * 60_000 },
      { durationMs: 12 * 24 * 60 * 60_000, intervalMs: 6 * 60 * 60_000 },
    ],
    maxAgeMs: 30 * 24 * 60 * 60_000,
  },
};

export const PLATFORM_HOURLY_BUDGETS: Record<string, { budget: number; callsPerPost: number }> = {
  twitter: { budget: 1200, callsPerPost: 1 },
  instagram: { budget: 200, callsPerPost: 2 },
};

export function getPollingInterval(platform: string, postAgeMs: number): number | null {
  const schedule = METRICS_SCHEDULES[platform];
  if (!schedule) return null;
  if (postAgeMs >= schedule.maxAgeMs) return null;

  let elapsed = 0;
  for (const phase of schedule.phases) {
    if (postAgeMs < elapsed + phase.durationMs) {
      return phase.intervalMs;
    }
    elapsed += phase.durationMs;
  }
  return null;
}

export function shouldPoll(
  platform: string,
  postAgeMs: number,
  msSinceLastPoll: number | null,
): boolean {
  const interval = getPollingInterval(platform, postAgeMs);
  if (interval === null) return false;
  if (msSinceLastPoll === null) return true;
  return msSinceLastPoll >= interval;
}
