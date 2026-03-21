import { describe, it, expect, vi, beforeEach } from 'vitest';
import { MetricsPoller } from '../../src/worker/metrics-poller.js';
import { createRegistry } from '../../src/plugins/registry.js';
import type { MetricsCollector } from '../../src/plugins/metrics-collectors/types.js';

// --- Mock DB builder ---
// The poller chains: db.select().from().innerJoin().where().orderBy()
// Plus: db.insert().values() and db.update().set().where()
function createMockDb(eligiblePosts: any[] = []) {
  const insertCalls: any[] = [];
  const setCalls: any[] = [];

  const db = {
    select: vi.fn().mockReturnValue({
      from: vi.fn().mockReturnValue({
        innerJoin: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            orderBy: vi.fn().mockResolvedValue(eligiblePosts),
          }),
        }),
      }),
    }),
    insert: vi.fn().mockReturnValue({
      values: vi.fn().mockImplementation((val: any) => {
        insertCalls.push(val);
        return Promise.resolve();
      }),
    }),
    update: vi.fn().mockReturnValue({
      set: vi.fn().mockImplementation((val: any) => {
        setCalls.push(val);
        return { where: vi.fn().mockResolvedValue(undefined) };
      }),
    }),
    _insertCalls: insertCalls,
    _setCalls: setCalls,
  };
  return db;
}

function createLogger() {
  return {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  };
}

function makePost(
  overrides: Partial<{
    postId: string;
    platformPostId: string;
    postedAt: Date;
    lastMetricsCollectedAt: Date | null;
    currentMetrics: Record<string, unknown>;
    accountId: string;
    accountPlatform: string;
    accountCredentials: Record<string, unknown>;
  }> = {},
) {
  return {
    postId: 'post-1',
    platformPostId: '123456789',
    postedAt: new Date(Date.now() - 30 * 60_000), // 30 min old — in Twitter phase 1
    lastMetricsCollectedAt: null, // never collected → shouldPoll returns true
    currentMetrics: {},
    accountId: 'acc-1',
    accountPlatform: 'twitter',
    accountCredentials: {},
    ...overrides,
  };
}

describe('MetricsPoller — poll cycle behavior', () => {
  let registry: ReturnType<typeof createRegistry<MetricsCollector>>;
  let config: any;

  beforeEach(() => {
    registry = createRegistry<MetricsCollector>();
    config = { TWITTER_BEARER_TOKEN: 'bt-test' } as any;
  });

  it('successful collection inserts snapshot and updates post', async () => {
    const post = makePost();
    const db = createMockDb([post]);
    const logger = createLogger();

    registry.register('twitter', () => ({
      collect: vi.fn().mockResolvedValue({ likes: 42, shares: 7 }),
    }));

    const poller = new MetricsPoller({
      db: db as any,
      metricsCollectorRegistry: registry,
      config,
      logger,
    });
    await (poller as any).doPollCycle();

    // Snapshot inserted with merged metrics
    expect(db._insertCalls).toHaveLength(1);
    expect(db._insertCalls[0].metrics).toEqual({ likes: 42, shares: 7 });

    // Post updated with merged metrics + timestamp
    expect(db._setCalls).toHaveLength(1);
    expect(db._setCalls[0].metrics).toEqual({ likes: 42, shares: 7 });
    expect(db._setCalls[0].lastMetricsCollectedAt).toBeInstanceOf(Date);

    // Logger reports
    expect(logger.info).toHaveBeenCalledWith(
      expect.objectContaining({ postsPolled: 1, errors: 0 }),
      expect.any(String),
    );
  });

  it('merges collected metrics with existing post metrics', async () => {
    const post = makePost({ currentMetrics: { views: 100, likes: 5 } });
    const db = createMockDb([post]);
    const logger = createLogger();

    registry.register('twitter', () => ({
      collect: vi.fn().mockResolvedValue({ likes: 15, shares: 3 }),
    }));

    const poller = new MetricsPoller({
      db: db as any,
      metricsCollectorRegistry: registry,
      config,
      logger,
    });
    await (poller as any).doPollCycle();

    expect(db._insertCalls[0].metrics).toEqual({ views: 100, likes: 15, shares: 3 });
  });

  it('unrecoverable error (404) disables metrics for that post', async () => {
    const post = makePost();
    const db = createMockDb([post]);
    const logger = createLogger();

    const err404 = Object.assign(new Error('Not found'), { unrecoverable: true });
    registry.register('twitter', () => ({
      collect: vi.fn().mockRejectedValue(err404),
    }));

    const poller = new MetricsPoller({
      db: db as any,
      metricsCollectorRegistry: registry,
      config,
      logger,
    });
    await (poller as any).doPollCycle();

    // No snapshot inserted
    expect(db._insertCalls).toHaveLength(0);
    // Post updated with metricsDisabled: true
    expect(db._setCalls).toHaveLength(1);
    expect(db._setCalls[0]).toEqual({ metricsDisabled: true });
    expect(logger.warn).toHaveBeenCalledWith(
      expect.objectContaining({ postId: 'post-1' }),
      expect.stringContaining('disabling'),
    );
  });

  it('rate-limited (429) skips remaining posts for that platform', async () => {
    const post1 = makePost({ postId: 'post-1', platformPostId: '111' });
    const post2 = makePost({ postId: 'post-2', platformPostId: '222' });
    const db = createMockDb([post1, post2]);
    const logger = createLogger();

    const err429 = Object.assign(new Error('Too many requests'), { rateLimited: true });
    let callCount = 0;
    registry.register('twitter', () => ({
      collect: vi.fn().mockImplementation(() => {
        callCount++;
        if (callCount === 1) return Promise.reject(err429);
        return Promise.resolve({ likes: 1 }); // should never reach
      }),
    }));

    const poller = new MetricsPoller({
      db: db as any,
      metricsCollectorRegistry: registry,
      config,
      logger,
    });
    await (poller as any).doPollCycle();

    // Only 1 API call made — second post skipped due to platform-level rate limit
    expect(callCount).toBe(1);
    expect(db._insertCalls).toHaveLength(0);
    expect(logger.warn).toHaveBeenCalledWith(
      expect.objectContaining({ platform: 'twitter' }),
      expect.stringContaining('Rate limited'),
    );
  });

  it('skips posts with missing credentials', async () => {
    const post = makePost({ accountPlatform: 'twitter' });
    const db = createMockDb([post]);
    const logger = createLogger();

    // No bearer token in config
    const configNoToken = {} as any;

    registry.register('twitter', () => ({
      collect: vi.fn().mockResolvedValue({ likes: 1 }),
    }));

    const poller = new MetricsPoller({
      db: db as any,
      metricsCollectorRegistry: registry,
      config: configNoToken,
      logger,
    });
    await (poller as any).doPollCycle();

    expect(db._insertCalls).toHaveLength(0);
    expect(logger.debug).toHaveBeenCalledWith(
      expect.objectContaining({ platform: 'twitter' }),
      expect.stringContaining('Missing credentials'),
    );
  });

  it('skips posts for platforms with no registered collector', async () => {
    const post = makePost({ accountPlatform: 'linkedin' });
    const db = createMockDb([post]);
    const logger = createLogger();

    // Only twitter registered, not linkedin
    registry.register('twitter', () => ({
      collect: vi.fn().mockResolvedValue({ likes: 1 }),
    }));

    const poller = new MetricsPoller({
      db: db as any,
      metricsCollectorRegistry: registry,
      config,
      logger,
    });
    await (poller as any).doPollCycle();

    expect(db._insertCalls).toHaveLength(0);
  });

  it('reentrancy guard prevents overlapping poll cycles', async () => {
    const post = makePost();
    let resolveCollect: (v: any) => void;
    const collectPromise = new Promise(r => {
      resolveCollect = r;
    });

    const db = createMockDb([post]);
    const logger = createLogger();

    registry.register('twitter', () => ({
      collect: vi.fn().mockReturnValue(collectPromise),
    }));

    const poller = new MetricsPoller({
      db: db as any,
      metricsCollectorRegistry: registry,
      config,
      logger,
    });

    // Start first cycle — will block on collectPromise
    const cycle1 = (poller as any).pollCycle();

    // Immediately try a second cycle — should be rejected by guard
    const cycle2 = (poller as any).pollCycle();
    await cycle2; // resolves immediately (guard triggers)

    // First cycle should still be in progress
    expect((poller as any).running).toBe(true);

    // Complete first cycle
    resolveCollect!({ likes: 1 });
    await cycle1;

    expect((poller as any).running).toBe(false);
    // Only one DB insert (from cycle1)
    expect(db._insertCalls).toHaveLength(1);
  });

  it('rolling budget tracks API calls within 1-hour window', async () => {
    // Create enough posts to potentially exceed budget
    const posts = Array.from({ length: 3 }, (_, i) =>
      makePost({
        postId: `post-${i}`,
        platformPostId: `${1000 + i}`,
      }),
    );
    const db = createMockDb(posts);
    const logger = createLogger();

    registry.register('twitter', () => ({
      collect: vi.fn().mockResolvedValue({ likes: 1 }),
    }));

    const poller = new MetricsPoller({
      db: db as any,
      metricsCollectorRegistry: registry,
      config,
      logger,
    });

    // Run a cycle — all 3 should succeed (Twitter budget is 1200)
    await (poller as any).doPollCycle();
    expect(db._insertCalls).toHaveLength(3);

    // The internal callTimestamps should have 3 entries for twitter (1 call per post)
    const timestamps = (poller as any).callTimestamps.get('twitter');
    expect(timestamps).toHaveLength(3);
  });

  it('transient error does not disable collection, logs and continues', async () => {
    const post1 = makePost({ postId: 'post-1', platformPostId: '111' });
    const post2 = makePost({ postId: 'post-2', platformPostId: '222' });
    const db = createMockDb([post1, post2]);
    const logger = createLogger();

    let callCount = 0;
    registry.register('twitter', () => ({
      collect: vi.fn().mockImplementation(() => {
        callCount++;
        if (callCount === 1) return Promise.reject(new Error('Temporary failure'));
        return Promise.resolve({ likes: 5 });
      }),
    }));

    const poller = new MetricsPoller({
      db: db as any,
      metricsCollectorRegistry: registry,
      config,
      logger,
    });
    await (poller as any).doPollCycle();

    // First post errored, second succeeded
    expect(callCount).toBe(2);
    expect(db._insertCalls).toHaveLength(1); // only post-2
    expect(logger.warn).toHaveBeenCalledWith(
      expect.objectContaining({ postId: 'post-1' }),
      expect.stringContaining('will retry'),
    );
    expect(logger.info).toHaveBeenCalledWith(
      expect.objectContaining({ postsPolled: 1, errors: 1 }),
      expect.any(String),
    );
  });

  it('empty eligible posts results in no work and no log', async () => {
    const db = createMockDb([]);
    const logger = createLogger();

    const poller = new MetricsPoller({
      db: db as any,
      metricsCollectorRegistry: registry,
      config,
      logger,
    });
    await (poller as any).doPollCycle();

    expect(db._insertCalls).toHaveLength(0);
    expect(logger.info).not.toHaveBeenCalled();
  });
});
