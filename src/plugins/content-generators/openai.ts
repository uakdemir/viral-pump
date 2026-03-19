import OpenAI from 'openai';
import type { ContentGenerator, ContentGeneratorInput, ContentGeneratorOutput } from './types.js';
import { fillPromptTemplate } from '../../shared/template-filler.js';
import { parseLlmResponse } from '../../shared/parse-llm-response.js';

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
    const { text, tags } = parseLlmResponse(rawText);

    return {
      text,
      tags,
      tokensUsed: response.usage?.total_tokens ?? 0,
      model: this.model,
      durationMs: Date.now() - start,
    };
  }
}

