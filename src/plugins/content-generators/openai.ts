import OpenAI from 'openai';
import type { ContentGenerator, ContentGeneratorInput, ContentGeneratorOutput } from './types.js';
import { fillPromptTemplate } from '../../shared/template-filler.js';

interface OpenAIConfig {
  apiKey: string;
  model: string;
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
    const prompt = fillPromptTemplate(input.promptTemplate, input.context);
    const temperature = (input.generationConfig?.temperature as number) ?? 0.7;

    const response = await this.client.chat.completions.create({
      model: this.model,
      max_tokens: 512,
      temperature,
      messages: [{ role: 'user', content: prompt }],
    });

    const rawText = response.choices[0]?.message?.content ?? '';
    const { text, tags } = parseResponse(rawText);

    return {
      text,
      tags,
      tokensUsed: response.usage?.total_tokens ?? 0,
      model: this.model,
      durationMs: Date.now() - start,
    };
  }
}

function parseResponse(raw: string): { text: string; tags: string[] } {
  const tagsMatch = raw.match(/tags:\s*(.*)/i);

  let text: string;
  let tags: string[] = [];

  if (tagsMatch) {
    const tagsIndex = raw.toLowerCase().lastIndexOf('tags:');
    text = raw.substring(0, tagsIndex).trim();
    tags = tagsMatch[1]
      .split(',')
      .map(t => t.trim().toLowerCase())
      .filter(t => t.length > 0);
  } else {
    text = raw.trim();
  }

  if (text.toLowerCase().startsWith('tweet:')) {
    text = text.substring(6).trim();
  }

  return { text, tags };
}
