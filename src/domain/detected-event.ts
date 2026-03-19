import { z } from 'zod';

export const DetectedEventSchema = z.object({
  source: z.string(),
  type: z.string(),
  verticalId: z.string(),
  observedAt: z.date(),
  data: z.record(z.string(), z.unknown()),
  rawPayload: z.record(z.string(), z.unknown()),
});

export type DetectedEvent = z.infer<typeof DetectedEventSchema>;
