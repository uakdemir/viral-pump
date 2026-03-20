import 'dotenv/config';
import { config } from '../shared/config.js';
import { createDb } from '../shared/db.js';
import { createChildLogger } from '../shared/logger.js';
import { PostgresJobQueue } from '../plugins/job-queue/postgres-queue.js';
import { PuppeteerHtmlVisualGenerator } from '../plugins/visual-generators/puppeteer-html.js';
import { LocalVolumeAssetStore } from '../plugins/asset-store/local-volume.js';
import { TwitterApiPostingStrategy } from '../plugins/posting-strategies/twitter-api.js';
import { DryRunPostingStrategy } from '../plugins/posting-strategies/dry-run.js';
import { InstagramApiPostingStrategy } from '../plugins/posting-strategies/instagram-api.js';
import { LinkedInApiPostingStrategy } from '../plugins/posting-strategies/linkedin-api.js';
import { PinterestApiPostingStrategy } from '../plugins/posting-strategies/pinterest-api.js';
import { TelegramApiPostingStrategy } from '../plugins/posting-strategies/telegram-api.js';
import { NewsletterStubPostingStrategy } from '../plugins/posting-strategies/newsletter-stub.js';
import { TikTokStubPostingStrategy } from '../plugins/posting-strategies/tiktok-stub.js';
import { YouTubeStubPostingStrategy } from '../plugins/posting-strategies/youtube-stub.js';
import { RedditStubPostingStrategy } from '../plugins/posting-strategies/reddit-stub.js';
import { BlogStubPostingStrategy } from '../plugins/posting-strategies/blog-stub.js';
import { ClaudeContentGenerator } from '../plugins/content-generators/claude.js';
import { OpenAIContentGenerator } from '../plugins/content-generators/openai.js';
import { createRegistry } from '../plugins/registry.js';
import type { ContentGenerator } from '../plugins/content-generators/types.js';
import type { PostingStrategy } from '../plugins/posting-strategies/types.js';
import { Scheduler, createDataSourceRegistry } from './scheduler.js';
import { EventDetector, createTriggerEvaluatorRegistry } from './event-detector.js';
import { handleGenerateContent } from './handlers/generate-content.js';
import { handleGenerateVisual } from './handlers/generate-visual.js';
import { handlePostToPlatform } from './handlers/post-to-platform.js';
import { JobReaper } from './job-reaper.js';
import { JOB_TYPES, DEFAULT_LLM_MODEL } from '../shared/constants.js';

const logger = createChildLogger({ process: 'worker', workerId: config.WORKER_ID });
const db = createDb(config.VIRAL_DATABASE_URL);
const jobQueue = new PostgresJobQueue(db);
const assetStore = new LocalVolumeAssetStore(config.ASSET_DIR, config.PUBLIC_ASSET_BASE_URL);
const visualGenerator = new PuppeteerHtmlVisualGenerator();

// Content generator registry
const contentGeneratorRegistry = createRegistry<ContentGenerator>();
if (config.ANTHROPIC_API_KEY) {
  contentGeneratorRegistry.register('claude', (cfg) =>
    new ClaudeContentGenerator({ apiKey: config.ANTHROPIC_API_KEY!, model: cfg.model ?? config.LLM_MODEL ?? DEFAULT_LLM_MODEL })
  );
}
if (config.OPENAI_API_KEY) {
  contentGeneratorRegistry.register('openai', (cfg) =>
    new OpenAIContentGenerator({ apiKey: config.OPENAI_API_KEY!, model: cfg.model ?? 'gpt-4o-mini' })
  );
}

// Posting strategy registry — each strategy gets full merged config, picks what it needs
const postingStrategyRegistry = createRegistry<PostingStrategy>();
postingStrategyRegistry.register('twitter-api', (cfg) => new TwitterApiPostingStrategy(cfg));
postingStrategyRegistry.register('instagram-api', (cfg) => new InstagramApiPostingStrategy(cfg));
postingStrategyRegistry.register('linkedin-api', (cfg) => new LinkedInApiPostingStrategy(cfg));
postingStrategyRegistry.register('pinterest-api', (cfg) => new PinterestApiPostingStrategy(cfg));
postingStrategyRegistry.register('telegram-api', (cfg) => new TelegramApiPostingStrategy(cfg));
postingStrategyRegistry.register('newsletter', (cfg) => new NewsletterStubPostingStrategy(cfg));
postingStrategyRegistry.register('tiktok-api', (cfg) => new TikTokStubPostingStrategy(cfg));
postingStrategyRegistry.register('youtube-api', (cfg) => new YouTubeStubPostingStrategy(cfg));
postingStrategyRegistry.register('reddit-api', (cfg) => new RedditStubPostingStrategy(cfg));
postingStrategyRegistry.register('blog', (cfg) => new BlogStubPostingStrategy(cfg));
postingStrategyRegistry.register('dry-run', (cfg) => new DryRunPostingStrategy({ outputDir: cfg.outputDir ?? config.ASSET_DIR + '/dry-run' }));

const appCredentials = {
  apiKey: config.TWITTER_API_KEY ?? '',
  apiSecret: config.TWITTER_API_SECRET ?? '',
};

// Trigger evaluator registry
const evaluatorRegistry = createTriggerEvaluatorRegistry();

// Event detector
const eventDetector = new EventDetector({ db, jobQueue, evaluatorRegistry, logger });

// Scheduler
const dataSourceRegistry = createDataSourceRegistry();
const scheduler = new Scheduler({
  db,
  registry: dataSourceRegistry,
  onEvents: (events, verticalId) => eventDetector.processEvents(events, verticalId),
  logger,
});

// Job reaper
const reaper = new JobReaper(db, logger);

// Lease durations per job type (ms)
const leaseDurations: Record<string, number> = {
  [JOB_TYPES.GENERATE_CONTENT]: 5 * 60 * 1000,
  [JOB_TYPES.GENERATE_VISUAL]: 5 * 60 * 1000,
  [JOB_TYPES.POST_TO_PLATFORM]: 2 * 60 * 1000,
};

// Job processing loop
async function processJobs(): Promise<void> {
  while (true) {
    try {
      const job = await jobQueue.dequeue(config.WORKER_ID, 60000);
      if (!job) {
        await new Promise(resolve => setTimeout(resolve, 1000));
        continue;
      }

      const lease = leaseDurations[job.type] ?? 60000;
      // Extend lease to the proper duration for this job type
      await jobQueue.extendLease(job.id, lease);

      logger.info({ jobId: job.id, type: job.type, attempt: job.attempts + 1 }, 'Processing job');

      try {
        switch (job.type) {
          case JOB_TYPES.GENERATE_CONTENT:
            await handleGenerateContent(job, { db, jobQueue, contentGeneratorRegistry, logger });
            break;
          case JOB_TYPES.GENERATE_VISUAL:
            await handleGenerateVisual(job, { db, visualGenerator, assetStore, logger });
            break;
          case JOB_TYPES.POST_TO_PLATFORM:
            await handlePostToPlatform(job, { db, postingStrategyRegistry, appCredentials, assetStore, assetDir: config.ASSET_DIR, logger });
            break;
          default:
            logger.warn({ type: job.type }, 'Unknown job type');
        }
        await jobQueue.complete(job.id);
      } catch (err) {
        logger.error({ err, jobId: job.id }, 'Job failed');
        await jobQueue.fail(job.id, err);
      }
    } catch (err) {
      logger.error({ err }, 'Job loop error');
      await new Promise(resolve => setTimeout(resolve, 5000));
    }
  }
}

// Start everything
logger.info('Worker starting...');
scheduler.start();
reaper.start(60000);
processJobs();

// Graceful shutdown
process.on('SIGTERM', () => {
  logger.info('Shutting down...');
  scheduler.stop();
  reaper.stop();
  process.exit(0);
});

process.on('SIGINT', () => {
  logger.info('Shutting down...');
  scheduler.stop();
  reaper.stop();
  process.exit(0);
});
