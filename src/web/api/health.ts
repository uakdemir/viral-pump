import type { FastifyInstance } from 'fastify';
import { eq, sql, and, inArray, desc } from 'drizzle-orm';
import { jobQueue } from '../../shared/schema/job-queue.js';
import { posts } from '../../shared/schema/posts.js';
import { dataSources } from '../../shared/schema/data-sources.js';
import { accounts } from '../../shared/schema/accounts.js';
import { HEALTH_THRESHOLDS } from '../../shared/constants.js';
import type { DB } from '../../shared/db.js';

type Status = 'green' | 'yellow' | 'red';

function worstStatus(...statuses: Status[]): Status {
  if (statuses.includes('red')) return 'red';
  if (statuses.includes('yellow')) return 'yellow';
  return 'green';
}

function computeJobQueueStatus(pending: number, processing: number, failedLastHour: number) {
  const t = HEALTH_THRESHOLDS.JOB_QUEUE;
  let status: Status = 'green';
  if (pending >= t.PENDING_RED || failedLastHour >= t.FAILED_HOUR_RED) status = 'red';
  else if (pending >= t.PENDING_YELLOW || failedLastHour >= t.FAILED_HOUR_YELLOW) status = 'yellow';
  return { status, pending, processing, failedLastHour };
}

function computeFailureRateStatus(total24h: number, failed24h: number) {
  const rate = total24h === 0 ? 0 : failed24h / total24h;
  const t = HEALTH_THRESHOLDS.FAILURE_RATE;
  let status: Status = 'green';
  if (rate >= t.RED) status = 'red';
  else if (rate >= t.YELLOW) status = 'yellow';
  return { status, total24h, failed24h, rate };
}

function computeDataSourceStatus(
  sources: Array<{
    id: string;
    provider: string;
    lastPolledAt: Date | null;
    pollIntervalMs: number;
  }>,
) {
  const t = HEALTH_THRESHOLDS.DATA_SOURCE;
  const now = Date.now();
  const mapped = sources.map(s => {
    let itemStatus: Status = 'green';
    if (!s.lastPolledAt) {
      itemStatus = 'red';
    } else {
      const overdueMs = now - s.lastPolledAt.getTime();
      if (overdueMs >= s.pollIntervalMs * t.OVERDUE_RED_MULTIPLIER) itemStatus = 'red';
      else if (overdueMs >= s.pollIntervalMs * t.OVERDUE_YELLOW_MULTIPLIER) itemStatus = 'yellow';
    }
    return {
      id: s.id,
      provider: s.provider,
      status: itemStatus,
      lastPolledAt: s.lastPolledAt?.toISOString() ?? null,
      pollIntervalMs: s.pollIntervalMs,
    };
  });
  return {
    status: mapped.length === 0 ? ('green' as Status) : worstStatus(...mapped.map(s => s.status)),
    sources: mapped,
  };
}

function computeAccountStatus(
  accts: Array<{
    id: string;
    name: string;
    platform: string;
    lastPostStatus: string | null;
    lastPostAt: Date | null;
  }>,
) {
  const t = HEALTH_THRESHOLDS.ACCOUNTS;
  const failedCount = accts.filter(a => a.lastPostStatus === 'failed').length;
  const mapped = accts.map(a => ({
    id: a.id,
    name: a.name,
    platform: a.platform,
    status: (a.lastPostStatus === 'failed' ? 'red' : 'green') as Status,
    lastPostStatus: a.lastPostStatus,
    lastPostAt: a.lastPostAt?.toISOString() ?? null,
  }));
  let status: Status = 'green';
  if (accts.length > 0 && failedCount / accts.length >= t.FAILED_RATIO_RED) status = 'red';
  else if (failedCount >= t.FAILED_COUNT_YELLOW) status = 'yellow';
  return { status, accounts: mapped };
}

export function registerHealthRoutes(app: FastifyInstance, db: DB) {
  app.get('/api/health/status', async () => {
    // Job Queue
    const oneHourAgo = new Date(Date.now() - 3_600_000);
    const pendingProcessing = await db
      .select({ status: jobQueue.status, cnt: sql<number>`count(*)` })
      .from(jobQueue)
      .where(inArray(jobQueue.status, ['pending', 'processing']))
      .groupBy(jobQueue.status);

    const [failedRow] = await db
      .select({ cnt: sql<number>`count(*)` })
      .from(jobQueue)
      .where(and(eq(jobQueue.status, 'failed'), sql`${jobQueue.updatedAt} > ${oneHourAgo}`));

    const pending = pendingProcessing.find(r => r.status === 'pending')?.cnt ?? 0;
    const processing = pendingProcessing.find(r => r.status === 'processing')?.cnt ?? 0;
    const failedLastHour = failedRow?.cnt ?? 0;
    const jq = computeJobQueueStatus(Number(pending), Number(processing), Number(failedLastHour));

    // Failure Rate
    const twentyFourHoursAgo = new Date(Date.now() - 86_400_000);
    const postCounts = await db
      .select({ status: posts.status, cnt: sql<number>`count(*)` })
      .from(posts)
      .where(
        and(
          inArray(posts.status, ['posted', 'failed']),
          sql`${posts.createdAt} > ${twentyFourHoursAgo}`,
        ),
      )
      .groupBy(posts.status);

    const postedCount = Number(postCounts.find(r => r.status === 'posted')?.cnt ?? 0);
    const failedPostCount = Number(postCounts.find(r => r.status === 'failed')?.cnt ?? 0);
    const fr = computeFailureRateStatus(postedCount + failedPostCount, failedPostCount);

    // Data Sources
    const activeSources = await db
      .select({
        id: dataSources.id,
        provider: dataSources.provider,
        pollIntervalMs: dataSources.pollIntervalMs,
        lastPolledAt: dataSources.lastPolledAt,
      })
      .from(dataSources)
      .where(eq(dataSources.status, 'active'));
    const ds = computeDataSourceStatus(activeSources);

    // Accounts
    const activeAccounts = await db
      .select({ id: accounts.id, name: accounts.name, platform: accounts.platform })
      .from(accounts)
      .where(eq(accounts.status, 'active'));

    const acctResults = await Promise.all(
      activeAccounts.map(async a => {
        const [lastPost] = await db
          .select({ status: posts.status, createdAt: posts.createdAt })
          .from(posts)
          .where(and(eq(posts.accountId, a.id), inArray(posts.status, ['posted', 'failed'])))
          .orderBy(desc(posts.createdAt))
          .limit(1);
        return {
          id: a.id,
          name: a.name,
          platform: a.platform,
          lastPostStatus: lastPost?.status ?? null,
          lastPostAt: lastPost?.createdAt ?? null,
        };
      }),
    );
    const ac = computeAccountStatus(acctResults);

    return {
      jobQueue: jq,
      failureRate: fr,
      dataSources: ds,
      accounts: ac,
      overall: worstStatus(jq.status, fr.status, ds.status, ac.status),
    };
  });
}
