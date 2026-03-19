import type { DetectedEvent } from '../../domain/detected-event.js';

export interface ContentGeneratorInput {
  event: DetectedEvent;
  promptTemplate: string;
  generationConfig: Record<string, unknown>;
  context: Record<string, unknown>;  // pre-assembled context for template filling
}

export interface ContentGeneratorOutput {
  text: string;
  tags: string[];
  tokensUsed: number;
  model: string;
  durationMs: number;
}

export interface ContentGenerator {
  generate(input: ContentGeneratorInput): Promise<ContentGeneratorOutput>;
}
