export interface VisualGeneratorInput {
  contentItemId: string;
  generatedText: string;
  eventData: Record<string, unknown>;
  templateConfig: Record<string, unknown>;
}

export interface VisualGenerator {
  generate(input: VisualGeneratorInput): Promise<Buffer>;
}
