import { z } from 'zod';

export const DetectedEventSchema = z.object({
  source: z.string(),
  instrument: z.string(),
  baseCurrency: z.string(),
  quoteCurrency: z.string(),
  price: z.number(),
  previousPrice: z.number(),
  changePct: z.number(),
  observedAt: z.date(),
  rawPayload: z.record(z.string(), z.unknown()),
});

export type DetectedEvent = z.infer<typeof DetectedEventSchema>;
