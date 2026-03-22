import type {
  ContentGenerator,
  ContentGeneratorInput,
  ContentGeneratorOutput,
} from '../../src/plugins/content-generators/types.js';
import type {
  VisualGenerator,
  VisualGeneratorInput,
} from '../../src/plugins/visual-generators/types.js';
import type { AssetStore } from '../../src/plugins/asset-store/types.js';
import type {
  PostingStrategy,
  PostInput,
  PostResult,
} from '../../src/plugins/posting-strategies/types.js';
import type { JobQueue } from '../../src/plugins/job-queue/types.js';
import type { DB } from '../../src/shared/db.js';
import type { LoggerLike } from '../../src/shared/logger.js';
import { createRegistry } from '../../src/plugins/registry.js';
import { DryRunPostingStrategy } from '../../src/plugins/posting-strategies/dry-run.js';
import { randomUUID } from 'crypto';

// ── Fake Content Generator ──────────────────────────

export class FakeContentGenerator implements ContentGenerator {
  private shouldFail: boolean;

  constructor(opts: { shouldFail?: boolean } = {}) {
    this.shouldFail = opts.shouldFail ?? false;
  }

  async generate(_input: ContentGeneratorInput): Promise<ContentGeneratorOutput> {
    if (this.shouldFail) {
      throw new Error('FakeContentGenerator: simulated LLM failure');
    }
    return {
      text: 'Test content about price movement',
      tags: ['test', 'automated'],
      tokensUsed: 42,
      model: 'fake-model',
      durationMs: 10,
    };
  }
}

// ── Fake Visual Generator ──────────────────────────

export class FakeVisualGenerator implements VisualGenerator {
  private shouldFail: boolean;

  constructor(opts: { shouldFail?: boolean } = {}) {
    this.shouldFail = opts.shouldFail ?? false;
  }

  async generate(_input: VisualGeneratorInput): Promise<Buffer> {
    if (this.shouldFail) {
      throw new Error('FakeVisualGenerator: simulated visual generation failure');
    }
    // Return a minimal valid PNG (1x1 pixel)
    return Buffer.from(
      'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
      'base64',
    );
  }
}

// ── Fake Asset Store ──────────────────────────

export class FakeAssetStore implements AssetStore {
  async store(id: string, _buffer: Buffer, extension: string): Promise<string> {
    return `/fake-assets/${id}.${extension}`;
  }

  resolve(url: string): string {
    return `/tmp/fake-resolve${url}`;
  }

  getPublicUrl(url: string): string {
    return `http://localhost:3001/assets${url}`;
  }
}

// ── Fake Posting Strategy ──────────────────────────

export class FakePostingStrategy implements PostingStrategy {
  validateInput(_input: PostInput): void {
    // Always passes
  }

  async post(_input: PostInput): Promise<PostResult> {
    return {
      platformPostId: `fake-post-${randomUUID().slice(0, 8)}`,
      postedAt: new Date(),
      url: 'https://fake-platform.test/post/123',
    };
  }
}

// ── Silent Logger ──────────────────────────

export const silentLogger: LoggerLike = {
  info: (..._args: unknown[]) => {},
  warn: (..._args: unknown[]) => {},
  error: (..._args: unknown[]) => {},
  debug: (..._args: unknown[]) => {},
};

// ── Handler Dependency Factories ──────────────────────────

export function createGenerateContentDeps(
  db: DB,
  jobQueue: JobQueue,
  overrides?: { failGenerator?: boolean },
) {
  const contentGeneratorRegistry = createRegistry<ContentGenerator>();
  contentGeneratorRegistry.register(
    'claude',
    () => new FakeContentGenerator({ shouldFail: overrides?.failGenerator }),
  );
  contentGeneratorRegistry.register(
    'openai',
    () => new FakeContentGenerator({ shouldFail: overrides?.failGenerator }),
  );

  return {
    db,
    jobQueue,
    contentGeneratorRegistry,
    logger: silentLogger,
  };
}

export function createGenerateVisualDeps(db: DB, overrides?: { failGenerator?: boolean }) {
  return {
    db,
    visualGenerator: new FakeVisualGenerator({ shouldFail: overrides?.failGenerator }),
    assetStore: new FakeAssetStore(),
    logger: silentLogger,
  };
}

export function createPostToPlatformDeps(db: DB, overrides?: { assetDir?: string }) {
  const postingStrategyRegistry = createRegistry<PostingStrategy>();
  postingStrategyRegistry.register('twitter-api', () => new FakePostingStrategy());
  postingStrategyRegistry.register('instagram-api', () => new FakePostingStrategy());
  postingStrategyRegistry.register(
    'dry-run',
    cfg => new DryRunPostingStrategy({ outputDir: cfg.outputDir ?? '/tmp/viral-test/dry-run' }),
  );

  return {
    db,
    postingStrategyRegistry,
    appCredentials: { apiKey: 'test-key', apiSecret: 'test-secret' },
    assetStore: new FakeAssetStore(),
    assetDir: overrides?.assetDir ?? '/tmp/viral-test',
    logger: silentLogger,
  };
}
