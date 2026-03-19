import Anthropic from '@anthropic-ai/sdk';
import type { ContentGenerator, ContentGeneratorInput, ContentGeneratorOutput } from './types.js';
import { fillPromptTemplate } from '../../shared/template-filler.js';
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

    const { text, tags } = parseResponse(rawText);

    return {
      text,
      tags,
      tokensUsed: response.usage.input_tokens + response.usage.output_tokens,
      model: this.model,
      durationMs: Date.now() - start,
    };
  }
}

function parseResponse(raw: string): { text: string; tags: string[] } {
  // Split on "Tags:" (case-insensitive)
  const tagsMatch = raw.match(/tags:\s*(.*)/i);

  let text: string;
  let tags: string[] = [];

  if (tagsMatch) {
    // Everything before "Tags:" is the tweet text
    const tagsIndex = raw.toLowerCase().lastIndexOf('tags:');
    text = raw.substring(0, tagsIndex).trim();

    // Parse comma-separated tags
    tags = tagsMatch[1]
      .split(',')
      .map(t => t.trim().toLowerCase())
      .filter(t => t.length > 0);
  } else {
    text = raw.trim();
  }

  // Strip "Tweet:" prefix if present
  if (text.toLowerCase().startsWith('tweet:')) {
    text = text.substring(6).trim();
  }

  return { text, tags };
}
