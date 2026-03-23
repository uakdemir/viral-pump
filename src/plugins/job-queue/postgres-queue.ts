import { eq, sql } from 'drizzle-orm';
import { jobQueue } from '../../shared/schema/job-queue.js';
import type { DB } from '../../shared/db.js';
import type { Job, JobQueue } from './types.js';

export class PostgresJobQueue implements JobQueue {
  constructor(private db: DB) {}

  async enqueue(
    type: string,
    payload: Record<string, unknown>,
    options?: {
      scheduledAt?: Date;
      maxAttempts?: number;
    },
  ): Promise<string> {
    const [row] = await this.db
      .insert(jobQueue)
      .values({
        type,
        payload,
        scheduledAt: options?.scheduledAt ?? new Date(),
        maxAttempts: options?.maxAttempts ?? 3,
      })
      .returning({ id: jobQueue.id });
    return row.id;
  }

  async dequeue(workerId: string, leaseDurationMs: number): Promise<Job | null> {
    const now = new Date().toISOString();
    const leaseExpires = new Date(Date.now() + leaseDurationMs).toISOString();

    const rows = await this.db.execute(sql`
      UPDATE job_queue
      SET status = 'processing',
          locked_by = ${workerId},
          locked_at = ${now}::timestamptz,
          started_at = ${now}::timestamptz,
          lease_expires_at = ${leaseExpires}::timestamptz
      WHERE id = (
        SELECT id FROM job_queue
        WHERE status = 'pending' AND scheduled_at <= ${now}::timestamptz
        ORDER BY scheduled_at
        FOR UPDATE SKIP LOCKED
        LIMIT 1
      )
      RETURNING id, type, payload, attempts, max_attempts
    `);

    if (!rows.length) return null;

    const row = rows[0] as any;
    return {
      id: row.id,
      type: row.type,
      payload: typeof row.payload === 'string' ? JSON.parse(row.payload) : row.payload,
      attempts: row.attempts,
      maxAttempts: row.max_attempts,
    };
  }

  async complete(jobId: string): Promise<void> {
    await this.db
      .update(jobQueue)
      .set({ status: 'completed', completedAt: new Date() })
      .where(eq(jobQueue.id, jobId));
  }

  async fail(jobId: string, error: unknown): Promise<void> {
    const errorJson =
      error instanceof Error
        ? { message: error.message, stack: error.stack }
        : { message: String(error) };

    await this.db.execute(sql`
      UPDATE job_queue
      SET attempts = attempts + 1,
          status = CASE WHEN (attempts + 1) >= max_attempts THEN 'failed' ELSE 'pending' END,
          scheduled_at = CASE WHEN (attempts + 1) >= max_attempts THEN scheduled_at
            ELSE now() + ((attempts + 1) * interval '30 seconds') END,
          locked_by = NULL,
          locked_at = NULL,
          lease_expires_at = NULL,
          error = ${JSON.stringify(errorJson)}::jsonb,
          updated_at = now()
      WHERE id = ${jobId}
    `);
  }

  async extendLease(jobId: string, leaseDurationMs: number): Promise<void> {
    const leaseExpires = new Date(Date.now() + leaseDurationMs);
    await this.db
      .update(jobQueue)
      .set({ leaseExpiresAt: leaseExpires })
      .where(eq(jobQueue.id, jobId));
  }
}
