import Anthropic from '@anthropic-ai/sdk';
import type { ContentGenerator, ContentGeneratorInput, ContentGeneratorOutput } from './types.js';
import { fillPromptTemplate } from '../../shared/template-filler.js';
import { parseLlmResponse } from '../../shared/parse-llm-response.js';
import { logger } from '../../shared/logger.js';

interface ClaudeConfig {
  apiKey: string;
  model: string;
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
    const prompt = fillPromptTemplate(input.promptTemplate, input.context);
    const temperature = (input.generationConfig?.temperature as number) ?? 0.7;

    const response = await this.client.messages.create({
      model: this.model,
      max_tokens: 512,
      temperature,
      messages: [{ role: 'user', content: prompt }],
    });

    const rawText = response.content
      .filter((b) => b.type === 'text')
      .map((b) => b.text)
      .join('');

    const { text, tags } = parseLlmResponse(rawText);

    return {
      text,
      tags,
      tokensUsed: response.usage.input_tokens + response.usage.output_tokens,
      model: this.model,
      durationMs: Date.now() - start,
    };
  }
}

