import Anthropic from '@anthropic-ai/sdk';
import type { ContentGenerator, ContentGeneratorInput, ContentGeneratorOutput } from './types.js';

interface ClaudeConfig {
  apiKey: string;
  model: string;
}

function fillTemplate(template: string, event: Record<string, unknown>): string {
  return template.replace(/\{\{(\w+)\}\}/g, (_, key) => {
    if (key === 'lookbackMinutes') return '5';
    if (key === 'direction') {
      return (event.changePct as number) >= 0 ? 'up' : 'down';
    }
    return String(event[key] ?? '');
  });
}

export class ClaudeContentGenerator implements ContentGenerator {
  private client: Anthropic;
  private model: string;

  constructor(config: ClaudeConfig) {
    this.client = new Anthropic({ apiKey: config.apiKey });
    this.model = config.model;
  }

  async generate(input: ContentGeneratorInput): Promise<ContentGeneratorOutput> {
    const start = Date.now();
    const prompt = fillTemplate(input.promptTemplate, input.event as unknown as Record<string, unknown>);
    const temperature = (input.generationConfig?.temperature as number) ?? 0.7;

    const response = await this.client.messages.create({
      model: this.model,
      max_tokens: 512,
      temperature,
      messages: [{ role: 'user', content: prompt }],
    });

    const text = response.content
      .filter((b): b is Anthropic.TextBlock => b.type === 'text')
      .map((b) => b.text)
      .join('');

    return {
      text,
      tokensUsed: response.usage.input_tokens + response.usage.output_tokens,
      model: this.model,
      durationMs: Date.now() - start,
    };
  }
}
