import OpenAI from 'openai';
import type { ContentGenerator, ContentGeneratorInput, ContentGeneratorOutput } from './types.js';

interface OpenAIConfig {
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

export class OpenAIContentGenerator implements ContentGenerator {
  private client: OpenAI;
  private model: string;

  constructor(config: OpenAIConfig) {
    this.client = new OpenAI({ apiKey: config.apiKey });
    this.model = config.model;
  }

  async generate(input: ContentGeneratorInput): Promise<ContentGeneratorOutput> {
    const start = Date.now();
    const prompt = fillTemplate(input.promptTemplate, input.event as unknown as Record<string, unknown>);
    const temperature = (input.generationConfig?.temperature as number) ?? 0.7;

    const response = await this.client.chat.completions.create({
      model: this.model,
      max_tokens: 512,
      temperature,
      messages: [{ role: 'user', content: prompt }],
    });

    return {
      text: response.choices[0]?.message?.content ?? '',
      tokensUsed: response.usage?.total_tokens ?? 0,
      model: this.model,
      durationMs: Date.now() - start,
    };
  }
}
