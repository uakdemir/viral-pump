import type { DetectedEvent } from '../../domain/detected-event.js';

export interface ContentGeneratorInput {
  event: DetectedEvent;
  promptTemplate: string;
  generationConfig: Record<string, unknown>;
}

export interface ContentGeneratorOutput {
  text: string;
  tokensUsed: number;
  model: string;
  durationMs: number;
}

export interface ContentGenerator {
  generate(input: ContentGeneratorInput): Promise<ContentGeneratorOutput>;
}
