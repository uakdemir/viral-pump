import { verticals } from '../../src/shared/schema/verticals.js';
import { accounts } from '../../src/shared/schema/accounts.js';
import { dataSources } from '../../src/shared/schema/data-sources.js';
import { triggerRules } from '../../src/shared/schema/trigger-rules.js';
import { contentTemplates } from '../../src/shared/schema/content-templates.js';
import type { DB } from '../../src/shared/db.js';

export async function seed(db: DB) {
  // 1 vertical
  const [vertical] = await db
    .insert(verticals)
    .values({
      name: 'Test Vertical',
      slug: 'test-vertical',
      config: {
        defaults: {
          triggerEvaluator: 'default',
          contentGenerator: { provider: 'claude', model: 'test-model' },
        },
      },
    })
    .returning();

  // 2 accounts (both dryRun)
  const [twitterAccount] = await db
    .insert(accounts)
    .values({
      verticalId: vertical.id,
      name: 'Test Twitter',
      platform: 'twitter',
      language: 'en',
      market: 'us',
      credentials: {},
      config: { postingStrategy: 'twitter-api', dryRun: true },
    })
    .returning();

  const [instagramAccount] = await db
    .insert(accounts)
    .values({
      verticalId: vertical.id,
      name: 'Test Instagram',
      platform: 'instagram',
      language: 'en',
      market: 'us',
      credentials: {},
      config: { postingStrategy: 'instagram-api', dryRun: true },
    })
    .returning();

  // 1 data source
  const [dataSource] = await db
    .insert(dataSources)
    .values({
      verticalId: vertical.id,
      provider: 'coingecko',
      config: { coinId: 'bitcoin' },
    })
    .returning();

  // 1 trigger rule
  const [rule] = await db
    .insert(triggerRules)
    .values({
      verticalId: vertical.id,
      name: 'Test BTC Rule',
      fireMode: 'threshold_cross',
      condition: {
        match: { source: 'coingecko', type: 'price_update' },
        predicates: [{ field: 'changePct', operator: 'gte', value: 0.001 }],
        logic: 'AND',
      },
      contentConfig: {
        templateNames: ['test-generic-template'],
        templateSelection: 'named',
      },
      cooldownMs: 0, // No cooldown for testing
    })
    .returning();

  // 2 content templates
  const [genericTemplate] = await db
    .insert(contentTemplates)
    .values({
      verticalId: vertical.id,
      name: 'test-generic-template',
      category: 'alert',
      contentLayer: 'text+image',
      platform: null, // Generic — compatible with all platforms
      promptTemplate: 'Write about {{eventData}}',
    })
    .returning();

  const [instagramTemplate] = await db
    .insert(contentTemplates)
    .values({
      verticalId: vertical.id,
      name: 'test-instagram-template',
      category: 'alert',
      contentLayer: 'text+image',
      platform: 'instagram',
      promptTemplate: 'Write an Instagram post about {{eventData}}',
    })
    .returning();

  return {
    vertical,
    twitterAccount,
    instagramAccount,
    dataSource,
    rule,
    genericTemplate,
    instagramTemplate,
  };
}
