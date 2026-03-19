export interface VisualGeneratorInput {
  contentItemId: string;
  templateConfig: Record<string, unknown>;
  context: Record<string, unknown>;  // pre-assembled context with generatedText, event.data, etc.
}

export interface VisualGenerator {
  generate(input: VisualGeneratorInput): Promise<Buffer>;
}
